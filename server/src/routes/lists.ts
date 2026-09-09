import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const listsRouter = Router();

// GET /api/lists - List all custom lists with member count
listsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         l.id,
         l.name,
         l.description,
         l.created_at,
         l.updated_at,
         COUNT(m.lead_id)::int as lead_count
       FROM lists l
       LEFT JOIN lead_list_memberships m ON m.list_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at ASC`
    );

    res.json({ success: true, lists: result.rows });
  } catch (error) {
    console.error('[listsRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lists' });
  }
});

// POST /api/lists - Create a new list
listsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'List name is required' });
    }

    const result = await query(
      `INSERT INTO lists (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at, updated_at`,
      [name.trim(), description || '']
    );

    res.status(201).json({ success: true, list: { ...result.rows[0], lead_count: 0 } });
  } catch (error) {
    console.error('[listsRouter.post]', error);
    res.status(500).json({ success: false, error: 'Failed to create list' });
  }
});

// DELETE /api/lists/:id - Delete a list
listsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const result = await query(`DELETE FROM lists WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'List not found' });
    }

    res.json({ success: true, message: 'List deleted successfully' });
  } catch (error) {
    console.error('[listsRouter.delete]', error);
    res.status(500).json({ success: false, error: 'Failed to delete list' });
  }
});

// POST /api/lists/:id/members - Add leads to a list
listsRouter.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const listId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { leadIds } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds array is required' });
    }

    let addedCount = 0;
    for (const leadId of leadIds) {
      const resInsert = await query(
        `INSERT INTO lead_list_memberships (list_id, lead_id)
         VALUES ($1, $2)
         ON CONFLICT (list_id, lead_id) DO NOTHING
         RETURNING lead_id`,
        [listId, leadId]
      );
      if (resInsert.rows.length > 0) addedCount++;
    }

    res.json({ success: true, addedCount });
  } catch (error) {
    console.error('[listsRouter.addMembers]', error);
    res.status(500).json({ success: false, error: 'Failed to add leads to list' });
  }
});

// DELETE /api/lists/:id/members - Remove leads from a list
listsRouter.delete('/:id/members', async (req: Request, res: Response) => {
  try {
    const listId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { leadIds } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds array is required' });
    }

    const resDelete = await query(
      `DELETE FROM lead_list_memberships
       WHERE list_id = $1 AND lead_id = ANY($2)
       RETURNING lead_id`,
      [listId, leadIds]
    );

    res.json({ success: true, removedCount: resDelete.rows.length });
  } catch (error) {
    console.error('[listsRouter.removeMembers]', error);
    res.status(500).json({ success: false, error: 'Failed to remove leads from list' });
  }
});

// DELETE /api/lists/:id/members/:leadId - Remove a single lead from a list
listsRouter.delete('/:id/members/:leadId', async (req: Request, res: Response) => {
  try {
    const listId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const leadId = Array.isArray(req.params.leadId) ? req.params.leadId[0] : req.params.leadId;

    const resDelete = await query(
      `DELETE FROM lead_list_memberships
       WHERE list_id = $1 AND lead_id = $2
       RETURNING lead_id`,
      [listId, leadId]
    );

    res.json({ success: true, removedCount: resDelete.rows.length });
  } catch (error) {
    console.error('[listsRouter.removeSingleMember]', error);
    res.status(500).json({ success: false, error: 'Failed to remove lead from list' });
  }
});
