import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const leadsRouter = Router();

// GET /api/leads - Fetch active (non-deleted) leads
leadsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { consent, category, search, listId, batchId } = req.query;
    let sql = `SELECT l.* FROM leads l`;
    const params: unknown[] = [];

    if (listId && typeof listId === 'string' && listId !== 'all') {
      params.push(listId);
      sql += ` INNER JOIN lead_list_memberships m ON m.lead_id = l.id AND m.list_id = $${params.length}`;
    }

    sql += ` WHERE l.deleted_at IS NULL`;

    if (batchId && typeof batchId === 'string' && batchId !== 'all') {
      params.push(batchId);
      sql += ` AND l.batch_id = $${params.length}`;
    }

    if (consent && consent !== 'all') {
      params.push(consent);
      sql += ` AND l.consent_status = $${params.length}`;
    }

    if (category && category !== 'all') {
      params.push(category);
      sql += ` AND l.category = $${params.length}`;
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(l.business_name) LIKE $${params.length} OR LOWER(l.email) LIKE $${params.length} OR l.phone LIKE $${params.length})`;
    }

    sql += ` ORDER BY l.created_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, leads: result.rows });
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
        id,
        business_name,
        category,
        phone,
        email,
        instagram,
        facebook,
        whatsapp,
        notes,
        consent_status,
        batch_id,
        outreach_stage,
        created_at,
        last_contacted_at,
        deleted_at,
        deleted_expires_at,
        status,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (deleted_expires_at - NOW())) / 86400))::int AS days_remaining,
        'lead' AS entity_type
      FROM leads
      WHERE deleted_at IS NOT NULL 
        AND deleted_at >= NOW() - INTERVAL '28 days'
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
        c.notes,
        'replied' AS consent_status,
        NULL AS batch_id,
        'completed' AS outreach_stage,
        c.created_at,
        c.updated_at AS last_contacted_at,
        c.deleted_at,
        c.deleted_expires_at,
        c.status,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.deleted_expires_at - NOW())) / 86400))::int AS days_remaining,
        'client' AS entity_type
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
    await query(`DELETE FROM send_queue WHERE lead_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [allIds]);
    await query(`DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = ANY($1)) OR (entity_type = 'client' AND client_id = ANY($1))`, [allIds]);

    // Permanently remove from both clients and leads tables
    await query(`DELETE FROM clients WHERE id = ANY($1) OR original_lead_id = ANY($1)`, [allIds]);
    const result = await query(`DELETE FROM leads WHERE id = ANY($1) RETURNING id`, [allIds]);

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
    await query(`DELETE FROM send_queue WHERE lead_id = ANY($1)`, [ids]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = ANY($1)`, [ids]);
    await query(`DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = ANY($1)) OR (entity_type = 'client' AND client_id = ANY($1))`, [ids]);

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

// POST /api/leads/bulk-delete - Soft-delete multiple leads (preserved for 28 days, removes from leads & clients)
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

    const toDeleteClients = await query(`SELECT * FROM clients WHERE id = ANY($1)`, [ids]);
    for (const client of toDeleteClients.rows) {
      await query(
        `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
         VALUES ('client', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
        [client.id, client.business_name, client.email, client.phone, JSON.stringify(client)]
      );
    }

    // 2. Mark soft-deleted in leads table
    const result = await query(
      `UPDATE leads 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = ANY($1)
          OR id IN (SELECT original_lead_id FROM clients WHERE id = ANY($1) AND original_lead_id IS NOT NULL)
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM clients WHERE id = ANY($1) AND email <> ''))
       RETURNING id`,
      [ids]
    );

    // 3. Also soft-delete any matching clients from active client list
    await query(
      `UPDATE clients 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = ANY($1) 
          OR original_lead_id = ANY($1) 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = ANY($1) AND email <> ''))`,
      [ids]
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

// POST /api/leads/bulk-status - Bulk mark leads as active/inactive
leadsRouter.post('/bulk-status', async (req: Request, res: Response) => {
  try {
    const ids = req.body.ids || req.body.leadIds;
    const { status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0 || !['active', 'inactive', 'paused'].includes(status)) {
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

// DELETE /api/leads/:id - Soft-delete single lead (preserved for 28 days, removes from leads & clients)
leadsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const leadRes = await query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (leadRes.rows.length === 0) {
      // Check if it's a client ID directly
      const clientRes = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
      if (clientRes.rows.length > 0) {
        const client = clientRes.rows[0];
        await query(
          `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
           VALUES ('client', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
          [client.id, client.business_name, client.email, client.phone, JSON.stringify(client)]
        );
        await query(
          `UPDATE clients SET deleted_at = NOW(), deleted_expires_at = NOW() + INTERVAL '28 days' WHERE id = $1`,
          [id]
        );
        if (client.original_lead_id) {
          await query(
            `UPDATE leads SET deleted_at = NOW(), deleted_expires_at = NOW() + INTERVAL '28 days' WHERE id = $1`,
            [client.original_lead_id]
          );
        }
        return res.json({ success: true, message: 'Client soft-deleted (moved to Trash)' });
      }
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const lead = leadRes.rows[0];

    // Record in deletion_history
    await query(
      `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
       VALUES ('lead', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
      [lead.id, lead.business_name, lead.email, lead.phone, JSON.stringify(lead)]
    );

    // Mark soft-deleted in leads
    const updateRes = await query(
      `UPDATE leads 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Also soft-delete any matching client from active client list
    await query(
      `UPDATE clients 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE original_lead_id = $1 OR (email <> '' AND LOWER(email) = LOWER($2))`,
      [lead.id, lead.email || '']
    );

    res.json({ success: true, lead: updateRes.rows[0], message: 'Lead soft-deleted (preserved in history for 28 days)' });
  } catch (error) {
    console.error('[leadsRouter.delete]', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
});

// DELETE /api/leads/:id/permanent - Permanent purge (removes from leads & clients)
leadsRouter.delete('/:id/permanent', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    await query(`DELETE FROM send_queue WHERE lead_id = $1`, [id]);
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = $1`, [id]);
    await query(`DELETE FROM conversations WHERE (entity_type = 'lead' AND lead_id = $1) OR (entity_type = 'client' AND client_id = $1)`, [id]);
    
    // Purge from clients by id, original_lead_id, or matching email
    await query(
      `DELETE FROM clients 
       WHERE id = $1 
          OR original_lead_id = $1 
          OR (email <> '' AND LOWER(email) IN (SELECT LOWER(email) FROM leads WHERE id = $1 AND email <> ''))`,
      [id]
    );

    // Also delete from leads by id or original_lead_id
    const result = await query(
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

// GET /api/leads/:id
leadsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    res.json({ success: true, lead: result.rows[0] });
  } catch (error) {
    console.error('[leadsRouter.getById]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
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

    const result = await query(
      `INSERT INTO leads (business_name, category, phone, email, instagram, facebook, whatsapp, notes, consent_status, status, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'none', $9, $10)
       RETURNING *`,
      [
        businessName.trim(),
        category || 'Uncategorized',
        trimmedPhone,
        trimmedEmail,
        instagram ? instagram.trim() : '',
        facebook ? facebook.trim() : '',
        whatsapp ? whatsapp.trim() : '',
        notes ? notes.trim() : '',
        leadStatus,
        batchId || null,
      ]
    );

    const newLead = result.rows[0];

    // If listId provided, add membership
    if (listId && typeof listId === 'string' && listId !== 'all' && listId !== 'none') {
      await query(
        `INSERT INTO lead_list_memberships (lead_id, list_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newLead.id, listId]
      );
    }

    res.status(201).json({ success: true, lead: newLead, message: 'Lead added successfully' });
  } catch (error) {
    console.error('[leadsRouter.post]', error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

// POST /api/leads/import - Bulk import with deduplication, validation, and batch tracking (28 days)
leadsRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const { leads: rawLeads, batchName } = req.body;

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

    // 2. Fetch existing emails and phones across BOTH leads and clients
    const existingLeadRes = await query<{ email: string; phone: string }>(
      `SELECT email, phone FROM leads WHERE deleted_at IS NULL UNION SELECT email, phone FROM clients`
    );

    const existingEmails = new Set(
      existingLeadRes.rows.map((r) => r.email?.toLowerCase().trim()).filter(Boolean)
    );
    const existingPhones = new Set(
      existingLeadRes.rows.map((r) => r.phone?.replace(/\D/g, '')).filter(Boolean)
    );

    let insertedCount = 0;
    let duplicateCount = 0;
    let incompleteCount = 0;
    const insertedLeads: unknown[] = [];

    for (const item of rawLeads) {
      const email = (item.email || '').trim();
      const phone = (item.phone || '').trim();
      const normalizedPhone = phone.replace(/\D/g, '');
      const businessName = (item.businessName || item.business_name || '').trim();
      const category = (item.category || 'Uncategorized').trim();
      const instagram = (item.instagram || '').trim();
      const facebook = (item.facebook || '').trim();
      const whatsapp = (item.whatsapp || '').trim();

      const hasContact = !!email || !!phone || !!instagram || !!facebook || !!whatsapp;
      if (!hasContact) {
        incompleteCount++;
        continue;
      }

      const isDupe =
        (email && existingEmails.has(email.toLowerCase())) ||
        (normalizedPhone && existingPhones.has(normalizedPhone));

      if (isDupe) {
        duplicateCount++;
        continue;
      }

      // Insert valid lead with batch_id
      const insertRes = await query(
        `INSERT INTO leads (business_name, category, phone, email, instagram, facebook, whatsapp, consent_status, batch_id, outreach_stage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'none', $8, 'initial')
         RETURNING *`,
        [businessName || 'Unnamed Business', category, phone, email, instagram, facebook, whatsapp, batchId]
      );

      insertedCount++;
      insertedLeads.push(insertRes.rows[0]);

      if (email) existingEmails.add(email.toLowerCase());
      if (normalizedPhone) existingPhones.add(normalizedPhone);
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

    res.json({
      success: true,
      batchId,
      batch: { ...createdBatch, imported_count: insertedCount, duplicate_count: duplicateCount, incomplete_count: incompleteCount },
      importedCount: insertedCount,
      duplicateCount,
      incompleteCount,
      leads: insertedLeads,
    });
  } catch (error) {
    console.error('[leadsRouter.import]', error);
    res.status(500).json({ success: false, error: 'Failed to import leads' });
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
