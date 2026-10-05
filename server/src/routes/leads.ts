import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';
import { whatsappValidator } from '../services/whatsappValidator';
import { googleEnrichmentService } from '../services/googleEnrichmentService';
import { leadScraperService, cleanSiteUrl } from '../services/leadScraperService';
import { autonomousLeadEnricher } from '../services/autonomousLeadEnricher';
import { automatedIntakeEngine } from '../services/automatedIntakeEngine';

export const leadsRouter = Router();

// GET /api/leads/by-channel - Automatically segregate leads into email, whatsapp, facebook, and instagram sections
leadsRouter.get('/by-channel', async (req: Request, res: Response) => {
  try {
    const { summaryOnly } = req.query;

    if (summaryOnly === 'true') {
      const summaryRes = await query(`
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND email IS NOT NULL AND email LIKE '%@%') AS email_count,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND ((whatsapp IS NOT NULL AND TRIM(whatsapp) != '') OR (phone IS NOT NULL AND TRIM(phone) != ''))) AS whatsapp_count,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND whatsapp_eligible = true AND ((whatsapp IS NOT NULL AND TRIM(whatsapp) != '') OR (phone IS NOT NULL AND TRIM(phone) != ''))) AS whatsapp_eligible_count,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND whatsapp_eligible IS NOT TRUE AND ((whatsapp IS NOT NULL AND TRIM(whatsapp) != '') OR (phone IS NOT NULL AND TRIM(phone) != ''))) AS whatsapp_ineligible_count,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND facebook IS NOT NULL AND TRIM(facebook) != '') AS facebook_count,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND instagram IS NOT NULL AND TRIM(instagram) != '') AS instagram_count
        FROM leads
      `);

      const s = summaryRes.rows[0];
      return res.json({
        success: true,
        summary: {
          email: parseInt(s.email_count || '0', 10),
          whatsapp: parseInt(s.whatsapp_count || '0', 10),
          whatsappEligible: parseInt(s.whatsapp_eligible_count || '0', 10),
          whatsappIneligible: parseInt(s.whatsapp_ineligible_count || '0', 10),
          facebook: parseInt(s.facebook_count || '0', 10),
          instagram: parseInt(s.instagram_count || '0', 10),
        },
      });
    }

    const allLeadsRes = await query(`
      SELECT l.*,
             COALESCE(
               (SELECT json_agg(json_build_object('id', lst.id, 'name', lst.name))
                FROM lead_list_memberships m
                JOIN lists lst ON lst.id = m.list_id
                WHERE m.lead_id = l.id),
               '[]'::json
             ) AS lists
      FROM leads l
      WHERE l.deleted_at IS NULL
      ORDER BY l.created_at DESC
    `);

    const leads = allLeadsRes.rows;

    const emailLeads = leads.filter((l) => l.email && l.email.includes('@'));
    const whatsappLeads = leads.filter((l) => (l.whatsapp && l.whatsapp.trim()) || (l.phone && l.phone.trim()));
    const whatsappEligible = whatsappLeads.filter((l) => l.whatsapp_eligible === true);
    const whatsappIneligible = whatsappLeads.filter((l) => l.whatsapp_eligible !== true);
    const facebookLeads = leads.filter((l) => (l.facebook || '').trim().length > 0);
    const instagramLeads = leads.filter((l) => (l.instagram || '').trim().length > 0);

    res.json({
      success: true,
      channels: {
        email: {
          total: emailLeads.length,
          leads: emailLeads,
        },
        whatsapp: {
          total: whatsappLeads.length,
          eligibleCount: whatsappEligible.length,
          ineligibleCount: whatsappIneligible.length,
          leads: whatsappLeads,
          eligibleLeads: whatsappEligible,
          ineligibleLeads: whatsappIneligible,
        },
        facebook: {
          total: facebookLeads.length,
          leads: facebookLeads,
        },
        instagram: {
          total: instagramLeads.length,
          leads: instagramLeads,
        },
      },
    });
  } catch (error) {
    console.error('[leadsRouter.byChannel]', error);
    res.status(500).json({ success: false, error: 'Failed to segregate leads by channel' });
  }
});

// GET /api/leads - Fetch active (non-deleted) leads with optional pagination and trigram-accelerated search
leadsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { consent, category, search, listId, batchId, status, page, limit } = req.query;

    const pageNum = page ? Math.max(1, parseInt(String(page), 10)) : undefined;
    const limitNum = limit ? Math.max(1, parseInt(String(limit), 10)) : undefined;

    let baseFilter = `WHERE 1=1 AND l.deleted_at IS NULL`;
    const filterParams: unknown[] = [];
    let joinClause = ``;

    if (listId && typeof listId === 'string' && listId !== 'all') {
      if (listId === 'unassigned' || listId === 'none') {
        baseFilter += ` AND NOT EXISTS (SELECT 1 FROM lead_list_memberships m WHERE m.lead_id = l.id)`;
      } else {
        filterParams.push(listId);
        joinClause += ` INNER JOIN lead_list_memberships m ON m.lead_id = l.id AND m.list_id = $${filterParams.length}`;
      }
    }

    if (batchId && typeof batchId === 'string' && batchId !== 'all') {
      filterParams.push(batchId);
      baseFilter += ` AND l.batch_id = $${filterParams.length}`;
    }

    if (status && status !== 'all') {
      filterParams.push(status);
      baseFilter += ` AND l.status = $${filterParams.length}`;
    }

    if (consent && consent !== 'all') {
      filterParams.push(consent);
      baseFilter += ` AND l.consent_status = $${filterParams.length}`;
    }

    if (category && category !== 'all') {
      filterParams.push(category);
      baseFilter += ` AND l.category = $${filterParams.length}`;
    }

    if (search && typeof search === 'string' && search.trim()) {
      filterParams.push(`%${search.trim()}%`);
      // Utilizes PostgreSQL GIN trigram indexes on business_name, email, and category
      baseFilter += ` AND (l.business_name ILIKE $${filterParams.length} OR l.email ILIKE $${filterParams.length} OR l.category ILIKE $${filterParams.length} OR l.phone LIKE $${filterParams.length})`;
    }

    let totalCount = 0;
    if (pageNum && limitNum) {
      const countSql = `SELECT COUNT(*) FROM leads l ${joinClause} ${baseFilter}`;
      const countRes = await query(countSql, filterParams);
      totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
    }

    let sql = `
      SELECT l.*,
             COALESCE(
               (SELECT json_agg(json_build_object('id', lst.id, 'name', lst.name))
                FROM lead_list_memberships m
                JOIN lists lst ON lst.id = m.list_id
                WHERE m.lead_id = l.id),
               '[]'::json
             ) AS lists
      FROM leads l
      ${joinClause}
      ${baseFilter}
      ORDER BY l.created_at DESC
    `;

    if (pageNum && limitNum) {
      const offset = (pageNum - 1) * limitNum;
      filterParams.push(limitNum);
      const limitParamIdx = filterParams.length;
      filterParams.push(offset);
      const offsetParamIdx = filterParams.length;
      sql += ` LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`;
    }

    const result = await query(sql, filterParams);

    if (pageNum && limitNum) {
      res.json({
        success: true,
        count: result.rows.length,
        totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        leads: result.rows,
      });
    } else {
      res.json({
        success: true,
        count: result.rows.length,
        totalCount: result.rows.length,
        leads: result.rows,
      });
    }
  } catch (error) {
    console.error('[leadsRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/trash - Fetch soft-deleted leads and clients preserved within 28-day window
leadsRouter.get('/trash', async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        l.id,
        l.business_name,
        l.category,
        l.phone,
        l.email,
        l.instagram,
        l.facebook,
        l.whatsapp,
        l.linkedin,
        l.website,
        l.location,
        l.country,
        l.metadata,
        l.notes,
        l.consent_status,
        l.batch_id,
        l.outreach_stage,
        l.created_at,
        l.last_contacted_at,
        l.deleted_at,
        l.deleted_expires_at,
        l.status,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (l.deleted_expires_at - NOW())) / 86400))::int AS days_remaining,
        'lead' AS entity_type,
        COALESCE(
          (
            SELECT json_agg(json_build_object('id', cl.id, 'name', cl.name))
            FROM lead_list_memberships llm
            JOIN lists cl ON cl.id = llm.list_id
            WHERE llm.lead_id = l.id
          ),
          '[]'::json
        ) AS lists
      FROM leads l
      WHERE l.deleted_at IS NOT NULL 
        AND l.deleted_at >= NOW() - INTERVAL '28 days'
      UNION ALL
      SELECT
        c.id,
        c.business_name,
        c.category,
        c.phone,
        c.email,
        c.instagram,
        c.facebook,
        c.whatsapp,
        c.linkedin,
        c.website,
        c.location,
        c.country,
        c.metadata,
        c.notes,
        'replied' AS consent_status,
        NULL::uuid AS batch_id,
        'completed' AS outreach_stage,
        c.created_at,
        c.updated_at AS last_contacted_at,
        c.deleted_at,
        c.deleted_expires_at,
        c.status,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.deleted_expires_at - NOW())) / 86400))::int AS days_remaining,
        'client' AS entity_type,
        '[]'::json AS lists
      FROM clients c
      WHERE c.deleted_at IS NOT NULL
        AND c.deleted_at >= NOW() - INTERVAL '28 days'
        AND NOT EXISTS (
          SELECT 1 FROM leads l 
          WHERE l.deleted_at IS NOT NULL 
            AND (l.id = c.original_lead_id OR (c.email <> '' AND LOWER(l.email) = LOWER(c.email)))
        )
      ORDER BY deleted_at DESC
    `);

    res.json({ success: true, count: result.rows.length, leads: result.rows, trash: result.rows, trashLeads: result.rows });
  } catch (error) {
    console.error('[leadsRouter.trash]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trash' });
  }
});

// POST /api/leads/trash/clear - Empty / Clear all trash at once (Permanent purge of all soft-deleted records)
leadsRouter.post('/trash/clear', async (_req: Request, res: Response) => {
  try {
    const softDeletedLeads = await query(`SELECT id FROM leads WHERE deleted_at IS NOT NULL`);
    const softDeletedClients = await query(`SELECT id FROM clients WHERE deleted_at IS NOT NULL`);
    const leadIds = softDeletedLeads.rows.map((r: any) => r.id);
    const clientIds = softDeletedClients.rows.map((r: any) => r.id);
    const allIds = [...new Set([...leadIds, ...clientIds])];

    if (allIds.length === 0) {
      return res.json({ success: true, clearedCount: 0, message: 'Trash is already empty' });
    }

    // Clean up dependent child records
    await query(`DELETE FROM scheduled_dispatches WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM send_queue WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM follow_up_logs WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ANY($1) OR client_id = ANY($1))`, [allIds]);
    await query(`DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = ANY($1)) OR (entity_type = 'client' AND client_id = ANY($1)) OR lead_id = ANY($1) OR client_id = ANY($1)`, [allIds]);

    // Permanently remove from both clients and leads tables
    await query(`DELETE FROM clients WHERE id = ANY($1) OR original_lead_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM leads WHERE id = ANY($1) RETURNING id`, [allIds]);

    res.json({
      success: true,
      clearedCount: allIds.length,
      message: `Permanently cleared ${allIds.length} records from Trash`,
    });
  } catch (error) {
    console.error('[leadsRouter.trash.clear]', error);
    res.status(500).json({ success: false, error: 'Failed to clear trash' });
  }
});

// POST /api/leads/trash/bulk-permanent-delete - Permanently purge multiple selected trash leads
leadsRouter.post('/trash/bulk-permanent-delete', async (req: Request, res: Response) => {
  try {
    const ids = req.body.ids || req.body.leadIds;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids or leadIds array is required' });
    }

    // Clean up dependent child records
    await query(`DELETE FROM scheduled_dispatches WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [ids]);
    await query(`DELETE FROM send_queue WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [ids]);
    await query(`DELETE FROM follow_up_logs WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [ids]);
    await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = ANY($1)`, [ids]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [ids]);
    await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ANY($1) OR client_id = ANY($1))`, [ids]);
    await query(`DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = ANY($1)) OR (entity_type = 'client' AND client_id = ANY($1)) OR lead_id = ANY($1) OR client_id = ANY($1)`, [ids]);

    // Permanently remove from clients and leads table
    await query(
      `DELETE FROM clients 
       WHERE id = ANY($1) 
          OR original_lead_id = ANY($1) 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = ANY($1) AND email <> ''))`,
      [ids]
    );
    const result = await query(
      `DELETE FROM leads 
       WHERE id = ANY($1) 
          OR id IN (SELECT original_lead_id FROM clients WHERE id = ANY($1) AND original_lead_id IS NOT NULL)
       RETURNING id`,
      [ids]
    );

    res.json({
      success: true,
      purgedCount: result.rows.length,
      message: `Permanently purged ${result.rows.length} records`,
    });
  } catch (error) {
    console.error('[leadsRouter.trash.bulkPermanentDelete]', error);
    res.status(500).json({ success: false, error: 'Failed to permanently purge selected leads' });
  }
});

// POST /api/leads/bulk-delete - Soft-delete multiple leads (preserved for 28 days, removes from everywhere)
leadsRouter.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const ids = req.body.ids || req.body.leadIds;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids or leadIds array is required' });
    }

    // 1. Fetch lead & client details for audit history
    const toDeleteLeads = await query(`SELECT * FROM leads WHERE id = ANY($1)`, [ids]);
    for (const lead of toDeleteLeads.rows) {
      await query(
        `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
         VALUES ('lead', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
        [lead.id, lead.business_name, lead.email, lead.phone, JSON.stringify(lead)]
      );
    }

    const toDeleteClients = await query(
      `SELECT * FROM clients 
       WHERE id = ANY($1) 
          OR original_lead_id = ANY($1) 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = ANY($1) AND email <> ''))`,
      [ids]
    );
    for (const client of toDeleteClients.rows) {
      await query(
        `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
         VALUES ('client', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
        [client.id, client.business_name, client.email, client.phone, JSON.stringify(client)]
      );
    }

    const allTargetIds = [...new Set([...ids, ...toDeleteClients.rows.map((c: any) => c.id), ...toDeleteLeads.rows.map((l: any) => l.id)])];

    // Cascading deletion: remove all messages, conversations, scheduled_dispatches, send_queue, follow_up_logs, linkedin_comments, and list memberships
    await query(
      `DELETE FROM messages WHERE conversation_id IN (
         SELECT id FROM conversations WHERE lead_id = ANY($1) OR client_id = ANY($1)
       )`,
      [allTargetIds]
    );
    await query(
      `DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = ANY($1))
         OR (entity_type = 'client' AND client_id = ANY($1))
         OR lead_id = ANY($1) OR client_id = ANY($1)`,
      [allTargetIds]
    );
    await query(`DELETE FROM scheduled_dispatches WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM send_queue WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM follow_up_logs WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [allTargetIds]);

    // 2. Mark soft-deleted in leads table
    const result = await query(
      `UPDATE leads 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = ANY($1)
          OR id IN (SELECT original_lead_id FROM clients WHERE id = ANY($1) AND original_lead_id IS NOT NULL)
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM clients WHERE id = ANY($1) AND email <> ''))
       RETURNING id`,
      [allTargetIds]
    );

    // 3. Also soft-delete any matching clients from active client list
    await query(
      `UPDATE clients 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = ANY($1) 
          OR original_lead_id = ANY($1) 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = ANY($1) AND email <> ''))`,
      [allTargetIds]
    );

    res.json({ success: true, deletedCount: result.rows.length, affectedCount: result.rows.length });
  } catch (error) {
    console.error('[leadsRouter.bulkDelete]', error);
    res.status(500).json({ success: false, error: 'Failed to bulk delete leads' });
  }
});

// POST /api/leads/bulk-restore - Restore soft-deleted leads and matching clients
leadsRouter.post('/bulk-restore', async (req: Request, res: Response) => {
  try {
    const ids = req.body.ids || req.body.leadIds;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids or leadIds array is required' });
    }

    const result = await query(
      `UPDATE leads 
       SET deleted_at = NULL, 
           deleted_expires_at = NULL
       WHERE id = ANY($1)
       RETURNING id`,
      [ids]
    );

    // Also restore matching clients
    await query(
      `UPDATE clients 
       SET deleted_at = NULL, 
           deleted_expires_at = NULL
       WHERE id = ANY($1) 
          OR original_lead_id = ANY($1) 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = ANY($1) AND email <> ''))`,
      [ids]
    );

    res.json({ success: true, restoredCount: result.rows.length });
  } catch (error) {
    console.error('[leadsRouter.bulkRestore]', error);
    res.status(500).json({ success: false, error: 'Failed to bulk restore leads' });
  }
});

// POST /api/leads/bulk-status - Bulk mark leads as active/inactive/manual_review
leadsRouter.post('/bulk-status', async (req: Request, res: Response) => {
  try {
    const ids = req.body.ids || req.body.leadIds;
    const { status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0 || !['active', 'inactive', 'paused', 'manual_review'].includes(status)) {
      return res.status(400).json({ success: false, error: 'ids array and valid status are required' });
    }

    const result = await query(
      `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING id`,
      [status, ids]
    );

    res.json({ success: true, updatedCount: result.rows.length });
  } catch (error) {
    console.error('[leadsRouter.bulkStatus]', error);
    res.status(500).json({ success: false, error: 'Failed to bulk update status' });
  }
});

// POST /api/leads/:id/approve-review - Clear manual review and return lead to active
leadsRouter.post('/:id/approve-review', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await query(
      `UPDATE leads 
       SET status = 'active', 
           manual_review_reason = NULL, 
           manual_review_at = NULL, 
           updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error('[leadsRouter.approveReview]', error);
    res.status(500).json({ success: false, error: 'Failed to approve lead review' });
  }
});

// POST /api/leads/bulk-approve-review - Bulk approve leads in manual review
leadsRouter.post('/bulk-approve-review', async (req: Request, res: Response) => {
  try {
    const ids = req.body.ids || req.body.leadIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    const result = await query(
      `UPDATE leads 
       SET status = 'active', 
           manual_review_reason = NULL, 
           manual_review_at = NULL, 
           updated_at = NOW() 
       WHERE id = ANY($1) 
       RETURNING id`,
      [ids]
    );

    res.json({ success: true, approvedCount: result.rows.length });
  } catch (error) {
    console.error('[leadsRouter.bulkApproveReview]', error);
    res.status(500).json({ success: false, error: 'Failed to bulk approve lead reviews' });
  }
});

// POST /api/leads/:id/restore - Restore single soft-deleted lead and matching client
leadsRouter.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const result = await query(
      `UPDATE leads 
       SET deleted_at = NULL, 
           deleted_expires_at = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Also restore matching client if any
    await query(
      `UPDATE clients 
       SET deleted_at = NULL, 
           deleted_expires_at = NULL
       WHERE id = $1
          OR original_lead_id = $1 
          OR (email <> '' AND LOWER(email) = (SELECT LOWER(email) FROM leads WHERE id = $1 AND email <> ''))`,
      [id]
    );

    if (result.rows.length === 0) {
      // Check if it was a client that was restored
      const clientRestore = await query(
        `UPDATE clients SET deleted_at = NULL, deleted_expires_at = NULL WHERE id = $1 RETURNING *`,
        [id]
      );
      if (clientRestore.rows.length > 0) {
        return res.json({ success: true, client: clientRestore.rows[0], message: 'Client restored successfully' });
      }
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.json({ success: true, lead: result.rows[0], message: 'Lead restored successfully' });
  } catch (error) {
    console.error('[leadsRouter.restore]', error);
    res.status(500).json({ success: false, error: 'Failed to restore lead' });
  }
});

// PATCH /api/leads/:id/status - Mark lead as active, inactive, or paused
leadsRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'paused'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status is required (active, inactive, paused)' });
    }

    const result = await query(
      `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error('[leadsRouter.patchStatus]', error);
    res.status(500).json({ success: false, error: 'Failed to update lead status' });
  }
});

// PUT /api/leads/:id - Comprehensive lead update (name, phone, whatsapp, email, fb, ig, category, status, consent, notes)
leadsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await query<any>(`SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const current = existing.rows[0];
    const businessName =
      req.body.businessName !== undefined
        ? req.body.businessName
        : req.body.business_name !== undefined
        ? req.body.business_name
        : current.business_name;
    const category = req.body.category !== undefined ? req.body.category : current.category;
    const phone = (req.body.phone !== undefined ? req.body.phone : current.phone) || '';
    const email = (req.body.email !== undefined ? req.body.email : current.email) || '';
    const whatsapp = (req.body.whatsapp !== undefined ? req.body.whatsapp : current.whatsapp) || '';
    const facebook = (req.body.facebook !== undefined ? req.body.facebook : current.facebook) || '';
    const instagram = (req.body.instagram !== undefined ? req.body.instagram : current.instagram) || '';
    const notes = req.body.notes !== undefined ? req.body.notes : current.notes;
    const status = req.body.status !== undefined ? req.body.status : current.status;
    const consentStatus =
      req.body.consentStatus !== undefined
        ? req.body.consentStatus
        : req.body.consent_status !== undefined
        ? req.body.consent_status
        : current.consent_status || 'none';

    const trimmedBusinessName = String(businessName || '').trim();
    if (!trimmedBusinessName) {
      return res.status(400).json({ success: false, error: 'Business name cannot be empty' });
    }

    const trimmedPhone = String(phone || '').trim();
    const trimmedEmail = String(email || '').trim();
    const trimmedWhatsapp = String(whatsapp || '').trim();
    const trimmedFacebook = String(facebook || '').trim();
    const trimmedInstagram = String(instagram || '').trim();

    // Re-evaluate WhatsApp eligibility and standardize international country code
    const waEval = whatsappValidator.evaluate({ phone: trimmedPhone, whatsapp: trimmedWhatsapp });
    const standardizedPhone = waEval.formattedInternational || trimmedPhone;
    const standardizedWhatsapp = waEval.formattedInternational || trimmedWhatsapp;

    // Recompute detected channels
    const detectedChannels: string[] = [];
    if (trimmedEmail && trimmedEmail.includes('@')) detectedChannels.push('email');
    if (waEval.isEligible) detectedChannels.push('whatsapp');
    if (trimmedFacebook) detectedChannels.push('facebook');
    if (trimmedInstagram) detectedChannels.push('instagram');

    // Merge updated metadata (including manual or verified google_profile changes)
    let updatedMetadata = typeof current.metadata === 'object' && current.metadata !== null ? { ...current.metadata } : {};
    if (req.body.metadata && typeof req.body.metadata === 'object') {
      updatedMetadata = { ...updatedMetadata, ...req.body.metadata };
    }
    if (req.body.googleProfile && typeof req.body.googleProfile === 'object') {
      updatedMetadata.google_profile = {
        ...(updatedMetadata.google_profile || {}),
        ...req.body.googleProfile,
        userVerified: true,
        lastEnrichedAt: new Date().toISOString(),
      };
    }
    if (req.body.google_profile && typeof req.body.google_profile === 'object') {
      updatedMetadata.google_profile = {
        ...(updatedMetadata.google_profile || {}),
        ...req.body.google_profile,
        userVerified: true,
        lastEnrichedAt: new Date().toISOString(),
      };
    }

    const website = cleanSiteUrl(req.body.website !== undefined ? String(req.body.website).trim() : current.website || '');
    const country = req.body.country !== undefined ? String(req.body.country).trim() : current.country || '';
    const location = req.body.location !== undefined ? String(req.body.location).trim() : current.location || '';

    const updateRes = await query(
      `UPDATE leads
       SET business_name = $1,
           category = $2,
           phone = $3,
           email = $4,
           instagram = $5,
           facebook = $6,
           whatsapp = $7,
           notes = $8,
           status = $9,
           consent_status = $10,
           whatsapp_eligible = $11,
           whatsapp_decision_reason = $12,
           detected_channels = $13,
           metadata = $14,
           website = $15,
           country = $16,
           location = $17,
           updated_at = NOW()
       WHERE id = $18
       RETURNING *`,
      [
        trimmedBusinessName,
        category || 'Uncategorized',
        standardizedPhone,
        trimmedEmail,
        trimmedInstagram,
        trimmedFacebook,
        standardizedWhatsapp,
        notes || '',
        status || 'active',
        consentStatus,
        waEval.isEligible,
        waEval.reason,
        JSON.stringify(detectedChannels),
        JSON.stringify(updatedMetadata),
        website,
        country,
        location,
        id,
      ]
    );

    // Sync to matching client if one exists
    await query(
      `UPDATE clients
       SET business_name = $1,
           category = $2,
           phone = $3,
           email = $4,
           instagram = $5,
           facebook = $6,
           whatsapp = $7,
           notes = $8,
           status = $9,
           whatsapp_eligible = $10,
           whatsapp_decision_reason = $11,
           detected_channels = $12,
           website = $13,
           country = $14,
           location = $15,
           updated_at = NOW()
       WHERE id = $16 OR original_lead_id = $16`,
      [
        trimmedBusinessName,
        category || 'Uncategorized',
        standardizedPhone,
        trimmedEmail,
        trimmedInstagram,
        trimmedFacebook,
        standardizedWhatsapp,
        notes || '',
        status || 'active',
        waEval.isEligible,
        waEval.reason,
        JSON.stringify(detectedChannels),
        website,
        country,
        location,
        id,
      ]
    );

    res.json({ success: true, lead: updateRes.rows[0], message: 'Lead updated successfully' });
  } catch (error) {
    console.error('[leadsRouter.updateLead]', error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - Soft-delete single lead (preserved for 28 days, removes from everywhere)
leadsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const leadRes = await query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (leadRes.rows.length === 0) {
      // Check if it's a client ID directly
      const clientRes = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
      if (clientRes.rows.length > 0) {
        const client = clientRes.rows[0];
        const allTargetIds = [client.id];
        if (client.original_lead_id) allTargetIds.push(client.original_lead_id);

        await query(
          `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
           VALUES ('client', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
          [client.id, client.business_name, client.email, client.phone, JSON.stringify(client)]
        );

        // Cascading deletion: remove all messages, conversations, dispatches, queues, follow-ups, and memberships
        await query(
          `DELETE FROM messages WHERE conversation_id IN (
             SELECT id FROM conversations WHERE client_id = ANY($1) OR lead_id = ANY($1)
           )`,
          [allTargetIds]
        );
        await query(
          `DELETE FROM conversations WHERE client_id = ANY($1) OR lead_id = ANY($1)
             OR (entity_type = 'client' AND client_id = ANY($1))
             OR (entity_type = 'lead' AND lead_id = ANY($1))`,
          [allTargetIds]
        );
        await query(`DELETE FROM scheduled_dispatches WHERE client_id = ANY($1) OR lead_id = ANY($1)`, [allTargetIds]);
        await query(`DELETE FROM send_queue WHERE client_id = ANY($1) OR lead_id = ANY($1)`, [allTargetIds]);
        await query(`DELETE FROM follow_up_logs WHERE client_id = ANY($1) OR lead_id = ANY($1)`, [allTargetIds]);
        await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = ANY($1)`, [allTargetIds]);
        await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [allTargetIds]);

        await query(
          `UPDATE clients SET deleted_at = NOW(), deleted_expires_at = NOW() + INTERVAL '28 days' WHERE id = ANY($1)`,
          [allTargetIds]
        );
        await query(
          `UPDATE leads SET deleted_at = NOW(), deleted_expires_at = NOW() + INTERVAL '28 days' WHERE id = ANY($1)`,
          [allTargetIds]
        );
        return res.json({ success: true, message: 'Client soft-deleted (moved to Trash Bin for 28 days)' });
      }
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const lead = leadRes.rows[0];

    // Identify linked clients by original_lead_id or matching email
    const clientMatches = await query(
      `SELECT id FROM clients WHERE original_lead_id = $1 OR (email <> '' AND LOWER(email) = LOWER($2))`,
      [lead.id, lead.email || '']
    );
    const allTargetIds = [...new Set([lead.id, ...clientMatches.rows.map((c: any) => c.id)])];

    // Record in deletion_history
    await query(
      `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
       VALUES ('lead', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
      [lead.id, lead.business_name, lead.email, lead.phone, JSON.stringify(lead)]
    );

    // Cascading deletion: remove all messages, conversations, dispatches, queues, follow-ups, and memberships
    await query(
      `DELETE FROM messages WHERE conversation_id IN (
         SELECT id FROM conversations WHERE lead_id = ANY($1) OR client_id = ANY($1)
       )`,
      [allTargetIds]
    );
    await query(
      `DELETE FROM conversations WHERE lead_id = ANY($1) OR client_id = ANY($1)
         OR (entity_type = 'lead' AND lead_id = ANY($1))
         OR (entity_type = 'client' AND client_id = ANY($1))`,
      [allTargetIds]
    );
    await query(`DELETE FROM scheduled_dispatches WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM send_queue WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM follow_up_logs WHERE lead_id = ANY($1) OR client_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = ANY($1)`, [allTargetIds]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [allTargetIds]);

    // Mark soft-deleted in leads
    const updateRes = await query(
      `UPDATE leads 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = ANY($1)
       RETURNING *`,
      [allTargetIds]
    );

    // Also soft-delete any matching client from active client list
    await query(
      `UPDATE clients 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = ANY($1) OR original_lead_id = $2 OR (email <> '' AND LOWER(email) = LOWER($3))`,
      [allTargetIds, lead.id, lead.email || '']
    );

    res.json({ success: true, lead: updateRes.rows[0], message: 'Lead soft-deleted (moved to Trash Bin for 28 days)' });
  } catch (error) {
    console.error('[leadsRouter.delete]', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
});

// DELETE /api/leads/:id/permanent - Permanent purge (removes from leads & clients)
leadsRouter.delete('/:id/permanent', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Clean up dependent child records
    await query(`DELETE FROM scheduled_dispatches WHERE lead_id = $1 OR client_id = $1`, [id]);
    await query(`DELETE FROM send_queue WHERE lead_id = $1 OR client_id = $1`, [id]);
    await query(`DELETE FROM follow_up_logs WHERE lead_id = $1 OR client_id = $1`, [id]);
    await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = $1`, [id]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = $1`, [id]);
    await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = $1 OR client_id = $1)`, [id]);
    await query(`DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = $1) OR (entity_type = 'client' AND client_id = $1) OR lead_id = $1 OR client_id = $1`, [id]);
    
    // Purge from clients by id, original_lead_id, or matching email
    await query(
      `DELETE FROM clients 
       WHERE id = $1 
          OR original_lead_id = $1 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = $1 AND email <> ''))`,
      [id]
    );

    // Also delete from leads by id or original_lead_id
    await query(
      `DELETE FROM leads 
       WHERE id = $1 
          OR id IN (SELECT original_lead_id FROM clients WHERE id = $1 AND original_lead_id IS NOT NULL)
       RETURNING id`,
      [id]
    );

    res.json({ success: true, message: 'Record permanently purged' });
  } catch (error) {
    console.error('[leadsRouter.permanentDelete]', error);
    res.status(500).json({ success: false, error: 'Failed to permanently delete record' });
  }
});

// GET /api/leads/sync-gmb-status - Check status of 12-hour automated GMB sync engine
leadsRouter.get('/sync-gmb-status', async (_req: Request, res: Response) => {
  try {
    const status = googleEnrichmentService.getGmbSyncStatus();
    res.json({ success: true, ...status });
  } catch (error: any) {
    console.error('[leadsRouter.syncGmbStatus]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch GMB sync status' });
  }
});

// POST /api/leads/sync-gmb - Trigger immediate GMB sync across all leads
leadsRouter.post('/sync-gmb', async (_req: Request, res: Response) => {
  try {
    const result = await googleEnrichmentService.syncAllLeadsWithGmb();
    res.json(result);
  } catch (error: any) {
    console.error('[leadsRouter.syncGmb]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to sync with Google My Business' });
  }
});

// GET /api/leads/:id
leadsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await query(
      `SELECT l.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', lst.id, 'name', lst.name))
                 FROM lead_list_memberships m
                 JOIN lists lst ON lst.id = m.list_id
                 WHERE m.lead_id = l.id),
                '[]'::json
              ) AS lists
       FROM leads l WHERE l.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error('[leadsRouter.getById]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

// GET /api/leads/scrape-locations/status - Check progress of background location scraper
leadsRouter.get('/scrape-locations/status', (_req: Request, res: Response) => {
  res.json({ success: true, status: leadScraperService.getStatus() });
});

// POST /api/leads/scrape-locations - Start gradual background location scrape
leadsRouter.post('/scrape-locations', async (req: Request, res: Response) => {
  try {
    const delayMs = req.body.delayMs !== undefined ? Number(req.body.delayMs) : 1200;
    const recheckUnidentified = req.body.recheckUnidentified !== undefined ? Boolean(req.body.recheckUnidentified) : true;
    const result = await leadScraperService.startGradualLocationScrape({ delayMs, recheckUnidentified });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to start location scrape' });
  }
});

// POST /api/leads/scrape-locations/stop - Stop running background scrape
leadsRouter.post('/scrape-locations/stop', (_req: Request, res: Response) => {
  leadScraperService.stopGradualScrape();
  res.json({ success: true, message: 'Scrape stopped' });
});

// POST /api/leads/:id/scrape-location - Scrape location for a single lead
leadsRouter.post('/:id/scrape-location', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await leadScraperService.scrapeSingleLead(id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to scrape location' });
  }
});

// POST /api/leads - Create single lead
leadsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { category, phone, email, instagram, facebook, whatsapp, notes, batchId, status, listId } = req.body;
    const businessName = req.body.businessName || req.body.business_name;

    if (!businessName || !businessName.trim()) {
      return res.status(400).json({ success: false, error: 'Business name is required' });
    }

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const leadStatus = status && ['active', 'inactive', 'paused'].includes(status) ? status : 'active';

    // Check for duplicates in active leads and active clients
    if (trimmedEmail) {
      const existingLead = await query(
        `SELECT id, business_name FROM leads WHERE deleted_at IS NULL AND LOWER(email) = LOWER($1)`,
        [trimmedEmail]
      );
      if (existingLead.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: `A lead with email "${trimmedEmail}" already exists ("${existingLead.rows[0].business_name}").`,
        });
      }
      const existingClient = await query(
        `SELECT id, business_name FROM clients WHERE deleted_at IS NULL AND LOWER(email) = LOWER($1)`,
        [trimmedEmail]
      );
      if (existingClient.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: `An active client with email "${trimmedEmail}" already exists ("${existingClient.rows[0].business_name}").`,
        });
      }
    }

    const waEval = whatsappValidator.evaluate({ phone: trimmedPhone, whatsapp });
    const standardizedPhone = waEval.formattedInternational || trimmedPhone;
    const standardizedWhatsapp = waEval.formattedInternational || (whatsapp ? whatsapp.trim() : '');

    const detectedChannels: string[] = [];
    if (trimmedEmail) detectedChannels.push('email');
    if (waEval.isEligible) detectedChannels.push('whatsapp');
    if (facebook) detectedChannels.push('facebook');
    if (instagram) detectedChannels.push('instagram');
    if (req.body.linkedin) detectedChannels.push('linkedin');

    const initialMetadata: Record<string, any> =
      req.body.metadata && typeof req.body.metadata === 'object' ? { ...req.body.metadata } : {};
    let finalCategory = category || 'Uncategorized';

    // Auto-enrich Google Business Profile if enabled (default true)
    if (req.body.enrichGoogle !== false) {
      try {
        const googleProfile = await googleEnrichmentService.fetchGoogleProfile({
          businessName: businessName.trim(),
          category: category || 'Uncategorized',
          phone: standardizedPhone,
          address: req.body.address || '',
        });
        initialMetadata.google_profile = googleProfile;
        if ((!category || category === 'Uncategorized') && googleProfile.category) {
          finalCategory = googleProfile.category;
        }
      } catch (enrichErr) {
        console.warn('[leadsRouter.post] Google enrichment warning:', enrichErr);
      }
    }

    // Site URL must always be a clean website, never a Google Maps URL
    let website = cleanSiteUrl(req.body.website) || cleanSiteUrl(initialMetadata.google_profile?.website) || '';
    let country = req.body.country ? String(req.body.country).trim() : '';

    // Identify location based on name, email, phone, notes
    let location = req.body.location ? String(req.body.location).trim() : '';
    if (!location) {
      const scraped = await leadScraperService.scrapeLeadDetails({
        businessName: businessName.trim(),
        email: trimmedEmail,
        phone: standardizedPhone,
        existingWebsite: website,
        existingNotes: notes ? String(notes).trim() : '',
        existingMetadata: initialMetadata,
      });
      location = scraped.location;
      if (!website && scraped.siteUrl) {
        website = scraped.siteUrl;
      }
      if (!country && scraped.country) {
        country = scraped.country;
      }
    }

    if (!country) {
      if (standardizedPhone.startsWith('+91')) country = 'India';
      else if (standardizedPhone.startsWith('+61')) country = 'Australia';
      else if (standardizedPhone.startsWith('+44')) country = 'United Kingdom';
      else country = 'Canada';
    }

    const result = await query(
      `INSERT INTO leads (business_name, category, phone, email, instagram, facebook, whatsapp, linkedin, notes, consent_status, status, batch_id, whatsapp_eligible, whatsapp_decision_reason, detected_channels, metadata, website, country, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'none', $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        businessName.trim(),
        finalCategory,
        standardizedPhone,
        trimmedEmail,
        instagram ? instagram.trim() : '',
        facebook ? facebook.trim() : '',
        standardizedWhatsapp,
        req.body.linkedin ? req.body.linkedin.trim() : '',
        notes ? notes.trim() : '',
        leadStatus,
        batchId || null,
        waEval.isEligible,
        waEval.reason,
        JSON.stringify(detectedChannels),
        JSON.stringify(initialMetadata),
        website,
        country,
        location,
      ]
    );

    const newLead = result.rows[0];

    // Auto-assign to platform channel lists (Email, WhatsApp, LinkedIn, IG, FB) and execute automated outreach intake
    let intakeResult = null;
    try {
      intakeResult = await automatedIntakeEngine.processImportedLeads([newLead as any], {
        customListId: listId,
        autoSend: leadStatus === 'active',
      });
    } catch (intakeErr) {
      console.error('[leadsRouter.post] Automated intake error:', intakeErr);
    }

    // Extreme Automation: background auto-enrich contact info if missing email
    if (!trimmedEmail && website) {
      autonomousLeadEnricher.runEnrichmentCycle(1).catch((err: any) => console.error('[AutonomousEnricher] Error:', err));
    }

    res.status(201).json({
      success: true,
      lead: newLead,
      message: 'Lead added successfully',
      automatedIntake: intakeResult,
    });
  } catch (error) {
    console.error('[leadsRouter.post]', error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

// POST /api/leads/:id/enrich-google - Fetch & update Google Business Profile data for a specific lead
leadsRouter.post('/:id/enrich-google', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updatedLead = await googleEnrichmentService.enrichLead(id);
    res.json({
      success: true,
      lead: updatedLead,
      googleProfile: updatedLead.metadata?.google_profile,
      message: 'Google Business Profile information updated successfully',
    });
  } catch (error: any) {
    console.error('[leadsRouter.enrichGoogle]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to enrich lead with Google data' });
  }
});

// POST /api/leads/:id/sync-google-maps - Live sync from Google Maps URL or search query to guarantee 100% match
leadsRouter.post('/:id/sync-google-maps', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { googleMapsUrl } = req.body || {};
    const updatedLead = await googleEnrichmentService.syncFromGoogleMaps(id, googleMapsUrl);
    res.json({
      success: true,
      lead: updatedLead,
      googleProfile: updatedLead.metadata?.google_profile,
      message: 'Lead synchronized with Google Maps data successfully',
    });
  } catch (error: any) {
    console.error('[leadsRouter.syncGoogleMaps]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to sync lead with Google Maps' });
  }
});

// POST /api/leads/batch-enrich-google - Batch update Google data for multiple leads
leadsRouter.post('/batch-enrich-google', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }
    const results = await googleEnrichmentService.batchEnrichLeads(ids);
    res.json({ success: true, count: results.length, leads: results });
  } catch (error: any) {
    console.error('[leadsRouter.batchEnrichGoogle]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to batch enrich leads' });
  }
});

// POST /api/leads/import - Bulk import with deduplication, validation, and batch tracking (28 days)
leadsRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const { leads: rawLeads, batchName, listId } = req.body;

    if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of leads required' });
    }

    // 1. Create upload_batch record (expires in 28 days)
    const formattedBatchName =
      (batchName && typeof batchName === 'string' && batchName.trim()) ||
      `Upload Batch — ${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;

    const batchRes = await query<{ id: string }>(
      `INSERT INTO upload_batches (batch_name, source, total_rows, imported_count, duplicate_count, incomplete_count, expires_at)
       VALUES ($1, 'csv', $2, 0, 0, 0, NOW() + INTERVAL '28 days')
       RETURNING *`,
      [formattedBatchName, rawLeads.length]
    );
    const createdBatch = batchRes.rows[0];
    const batchId = createdBatch.id;

    // 2. Fetch existing emails, phones, and business names across BOTH leads and clients (excluding soft-deleted)
    const existingLeadRes = await query<{ business_name: string; email: string; phone: string; whatsapp: string }>(
      `SELECT business_name, email, phone, whatsapp FROM leads WHERE deleted_at IS NULL 
       UNION 
       SELECT business_name, email, phone, whatsapp FROM clients WHERE deleted_at IS NULL`
    );

    const cleanBizName = (name: string): string =>
      (name || '')
        .toLowerCase()
        .replace(/\b(llc|inc|corp|corporation|ltd|limited|co|company)\b/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();

    const existingEmails = new Set<string>();
    const existingPhonesFull = new Set<string>();
    const existingPhonesLast10 = new Set<string>();
    const existingBusinessNames = new Set<string>();

    for (const r of existingLeadRes.rows) {
      const email = (r.email || '').trim().toLowerCase();
      if (email) existingEmails.add(email);

      const pDigits = (r.phone || '').replace(/\D/g, '');
      if (pDigits.length >= 7) {
        existingPhonesFull.add(pDigits);
        if (pDigits.length >= 10) existingPhonesLast10.add(pDigits.slice(-10));
      }

      const waDigits = (r.whatsapp || '').replace(/\D/g, '');
      if (waDigits.length >= 7) {
        existingPhonesFull.add(waDigits);
        if (waDigits.length >= 10) existingPhonesLast10.add(waDigits.slice(-10));
      }

      const cName = cleanBizName(r.business_name || '');
      if (cName.length >= 3) {
        existingBusinessNames.add(cName);
      }
    }

    let insertedCount = 0;
    let duplicateCount = 0;
    let incompleteCount = 0;
    const insertedLeads: unknown[] = [];

    for (const item of rawLeads) {
      const email = (item.email || '').trim().toLowerCase();
      const phone = (item.phone || '').trim();
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneLast10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';

      const whatsapp = (item.whatsapp || '').trim();
      const waDigits = whatsapp.replace(/\D/g, '');
      const waLast10 = waDigits.length >= 10 ? waDigits.slice(-10) : '';

      const businessName = (item.businessName || item.business_name || '').trim();
      const cBusinessName = cleanBizName(businessName);

      const category = (item.category || 'Uncategorized').trim();
      const instagram = (item.instagram || '').trim();
      const facebook = (item.facebook || '').trim();
      const notes = (item.notes || '').trim();

      const hasContact = !!email || !!phone || !!instagram || !!facebook || !!whatsapp;
      if (!hasContact) {
        incompleteCount++;
        continue;
      }

      // Check if lead already exists by email, phone (with country code tolerance), or business name
      let isDupe = false;
      if (email && existingEmails.has(email)) {
        isDupe = true;
      } else if (phoneDigits.length >= 7 && existingPhonesFull.has(phoneDigits)) {
        isDupe = true;
      } else if (phoneLast10 && existingPhonesLast10.has(phoneLast10)) {
        isDupe = true;
      } else if (waDigits.length >= 7 && existingPhonesFull.has(waDigits)) {
        isDupe = true;
      } else if (waLast10 && existingPhonesLast10.has(waLast10)) {
        isDupe = true;
      } else if (cBusinessName.length >= 3 && existingBusinessNames.has(cBusinessName)) {
        isDupe = true;
      }

      // If existing lead or duplicate within batch, ignore it (do not add again)
      if (isDupe) {
        duplicateCount++;
        continue;
      }

      // Evaluate WhatsApp eligibility and channels with international country code
      const waEval = whatsappValidator.evaluate({ phone, whatsapp });
      const standardizedPhone = waEval.formattedInternational || phone;
      const standardizedWhatsapp = waEval.formattedInternational || whatsapp;

      const linkedin = (item.linkedin || item.linkedin_url || '').trim();
      const detectedChannels: string[] = [];
      if (email) detectedChannels.push('email');
      if (waEval.isEligible) detectedChannels.push('whatsapp');
      if (facebook) detectedChannels.push('facebook');
      if (instagram) detectedChannels.push('instagram');
      if (linkedin) detectedChannels.push('linkedin');

      let website = cleanSiteUrl(item.website || item.website_url || item.url || '');
      if (!website) {
        const m = notes.match(/Website:\s*([^|\s]+)/i);
        if (m) website = cleanSiteUrl(m[1]);
      }

      let country = (item.country || '').trim();
      let location = (item.location || item.cityRegion || item.city || '').trim();
      if (!location) {
        const m = notes.match(/Location:\s*([^|\r\n]+)/i);
        if (m && !m[1].toLowerCase().includes('not identified')) location = m[1].trim();
      }

      if (!location) {
        const scraped = await leadScraperService.scrapeLeadDetails({
          businessName,
          email,
          phone: standardizedPhone,
          existingWebsite: website,
          existingNotes: notes,
        });
        location = scraped.location;
        if (!website && scraped.siteUrl) website = scraped.siteUrl;
        if (!country && scraped.country) country = scraped.country;
      }

      if (!country) {
        if (standardizedPhone.startsWith('+91')) country = 'India';
        else if (standardizedPhone.startsWith('+61')) country = 'Australia';
        else if (standardizedPhone.startsWith('+44')) country = 'United Kingdom';
        else country = 'Canada';
      }

      // Insert valid new lead with batch_id, channel flags, and location
      const insertRes = await query(
        `INSERT INTO leads (business_name, category, phone, email, instagram, facebook, whatsapp, linkedin, consent_status, batch_id, outreach_stage, whatsapp_eligible, whatsapp_decision_reason, detected_channels, notes, website, country, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'none', $9, 'initial', $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          businessName || 'Unnamed Business',
          category,
          standardizedPhone,
          email,
          instagram,
          facebook,
          standardizedWhatsapp,
          linkedin,
          batchId,
          waEval.isEligible,
          waEval.reason,
          JSON.stringify(detectedChannels),
          notes,
          website,
          country,
          location,
        ]
      );

      insertedCount++;
      insertedLeads.push(insertRes.rows[0]);

      // Register newly inserted lead so intra-batch duplicates are also caught and ignored
      if (email) existingEmails.add(email);
      if (phoneDigits.length >= 7) {
        existingPhonesFull.add(phoneDigits);
        if (phoneLast10) existingPhonesLast10.add(phoneLast10);
      }
      if (waDigits.length >= 7) {
        existingPhonesFull.add(waDigits);
        if (waLast10) existingPhonesLast10.add(waLast10);
      }
      if (cBusinessName.length >= 3) {
        existingBusinessNames.add(cBusinessName);
      }
    }

    // 3. Update upload_batches counts
    await query(
      `UPDATE upload_batches 
       SET imported_count = $1, 
           duplicate_count = $2, 
           incomplete_count = $3
       WHERE id = $4`,
      [insertedCount, duplicateCount, incompleteCount, batchId]
    );

    // 4. Auto-assign to platform channel lists (Email, WhatsApp, LinkedIn, IG, FB) and execute automated intake & outreach
    let intakeResult = null;
    if (insertedLeads.length > 0) {
      try {
        intakeResult = await automatedIntakeEngine.processImportedLeads(insertedLeads as any[], {
          customListId: listId,
          autoSend: true,
        });
      } catch (intakeErr) {
        console.error('[leadsRouter.import] Automated intake error:', intakeErr);
      }
    }

    res.json({
      success: true,
      batchId,
      batch: { ...createdBatch, imported_count: insertedCount, duplicate_count: duplicateCount, incomplete_count: incompleteCount },
      importedCount: insertedCount,
      duplicateCount,
      incompleteCount,
      leads: insertedLeads,
      automatedIntake: intakeResult,
    });

    // Extreme Automation: background auto-enrich all newly imported leads missing email
    const leadsNeedingEmail = insertedLeads.filter((l: any) => !l.email && l.website).map((l: any) => l.id);
    if (leadsNeedingEmail.length > 0) {
      autonomousLeadEnricher
        .runEnrichmentCycle(leadsNeedingEmail.length)
        .catch((err: any) => console.error('[AutonomousEnricher:Batch] Error:', err));
    }
  } catch (error) {
    console.error('[leadsRouter.import]', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? `Import failed: ${error.message}` : 'Failed to import leads',
    });
  }
});

// PATCH /api/leads/:id/consent - Update consent status
leadsRouter.patch('/:id/consent', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const status = req.body.status || req.body.consentStatus || req.body.consent_status;

    if (!['none', 'replied', 'opted_out'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid consent status' });
    }

    const result = await query(
      `UPDATE leads SET consent_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (status === 'opted_out') {
      await query(
        `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
        [id]
      );
    }

    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error('[leadsRouter.consent]', error);
    res.status(500).json({ success: false, error: 'Failed to update consent status' });
  }
});
