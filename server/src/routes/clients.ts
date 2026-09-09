import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';
import { conversationOrchestrator } from '../services/orchestratorService';

export const clientsRouter = Router();

// GET /api/clients
clientsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.query;
    let sql = `SELECT * FROM clients WHERE deleted_at IS NULL`;
    const params: unknown[] = [];

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (category && category !== 'all') {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(business_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR phone LIKE $${params.length})`;
    }

    sql += ` ORDER BY onboarded_at DESC`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, clients: result.rows });
  } catch (error) {
    console.error('[clientsRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch clients' });
  }
});

// DELETE /api/clients/:id - Soft-delete a client (moves to trash, also soft-deletes original lead)
clientsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const clientRes = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    const client = clientRes.rows[0];

    // Log in deletion_history
    await query(
      `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
       VALUES ('client', $1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '28 days')`,
      [client.id, client.business_name, client.email, client.phone, JSON.stringify(client)]
    );

    // Soft-delete client
    const updatedClient = await query(
      `UPDATE clients 
       SET deleted_at = NOW(), 
           deleted_expires_at = NOW() + INTERVAL '28 days'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Also soft-delete corresponding lead if exists
    if (client.original_lead_id) {
      await query(
        `UPDATE leads 
         SET deleted_at = NOW(), 
             deleted_expires_at = NOW() + INTERVAL '28 days'
         WHERE id = $1`,
        [client.original_lead_id]
      );
    } else if (client.email) {
      await query(
        `UPDATE leads 
         SET deleted_at = NOW(), 
             deleted_expires_at = NOW() + INTERVAL '28 days'
         WHERE LOWER(email) = LOWER($1)`,
        [client.email]
      );
    }

    res.json({ success: true, client: updatedClient.rows[0], message: 'Client soft-deleted (moved to Trash)' });
  } catch (error) {
    console.error('[clientsRouter.delete]', error);
    res.status(500).json({ success: false, error: 'Failed to delete client' });
  }
});

// PATCH /api/clients/:id/status - Update client status (active, paused, churned)
clientsRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;
    if (!status || !['active', 'paused', 'churned', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status is required' });
    }

    const mappedStatus = status === 'inactive' ? 'paused' : status;
    const result = await query(
      `UPDATE clients SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [mappedStatus, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    console.error('[clientsRouter.patchStatus]', error);
    res.status(500).json({ success: false, error: 'Failed to update client status' });
  }
});

// GET /api/clients/:id
clientsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await query(`SELECT * FROM clients WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    console.error('[clientsRouter.getById]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch client' });
  }
});


// POST /api/clients/convert - Convert lead to client
clientsRouter.post('/convert', async (req: Request, res: Response) => {
  try {
    const { leadId, notes } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required' });
    }

    const conversionResult = await conversationOrchestrator.convertLeadToClient(leadId, notes);

    if (!conversionResult.success) {
      return res.status(400).json({ success: false, error: conversionResult.message });
    }

    const clientRes = await query(`SELECT * FROM clients WHERE id = $1`, [conversionResult.clientId]);

    res.json({
      success: true,
      client: clientRes.rows[0],
      alreadyClient: conversionResult.alreadyClient,
      message: conversionResult.message,
    });
  } catch (error) {
    console.error('[clientsRouter.convert]', error);
    res.status(500).json({ success: false, error: 'Failed to convert lead to client' });
  }
});

// PUT /api/clients/:id - Full client info update
// PATCH /api/clients/:id - Partial client info update
const handleUpdateClient = async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body;

    const businessName = body.businessName ?? body.business_name;
    const primaryContactName = body.primaryContactName ?? body.primary_contact_name;
    const category = body.category;
    const phone = body.phone;
    const email = body.email;
    const instagram = body.instagram;
    const facebook = body.facebook;
    const whatsapp = body.whatsapp;
    const status = body.status;
    const contractValue = body.contractValue ?? body.contract_value;
    const notes = body.notes;

    const result = await query(
      `UPDATE clients
       SET business_name = COALESCE($1, business_name),
           primary_contact_name = COALESCE($2, primary_contact_name),
           category = COALESCE($3, category),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           instagram = COALESCE($6, instagram),
           facebook = COALESCE($7, facebook),
           whatsapp = COALESCE($8, whatsapp),
           status = COALESCE($9, status),
           contract_value = COALESCE($10, contract_value),
           notes = COALESCE($11, notes),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        businessName !== undefined ? businessName : null,
        primaryContactName !== undefined ? primaryContactName : null,
        category !== undefined ? category : null,
        phone !== undefined ? phone : null,
        email !== undefined ? email : null,
        instagram !== undefined ? instagram : null,
        facebook !== undefined ? facebook : null,
        whatsapp !== undefined ? whatsapp : null,
        status !== undefined ? status : null,
        contractValue !== undefined ? contractValue : null,
        notes !== undefined ? notes : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    console.error('[clientsRouter.update]', error);
    res.status(500).json({ success: false, error: 'Failed to update client' });
  }
};

clientsRouter.put('/:id', handleUpdateClient);
clientsRouter.patch('/:id', handleUpdateClient);
