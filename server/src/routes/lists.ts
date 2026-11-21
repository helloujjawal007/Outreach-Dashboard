import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';
import { channelListAutoAssignmentService } from '../services/channelListAutoAssignmentService';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { logPipeline, logPipelineError } from '../utils/pipelineLogger';

export const listsRouter = Router();

// POST /api/lists/sync-channels - Auto-organize and sync all leads into their corresponding channel lists
listsRouter.post('/sync-channels', async (_req: Request, res: Response) => {
  try {
    const summary = await channelListAutoAssignmentService.syncAllExistingLeads();
    res.json({ success: true, summary, message: 'All channel lists synchronized successfully' });
  } catch (error) {
    console.error('[listsRouter.syncChannels]', error);
    res.status(500).json({ success: false, error: 'Failed to sync channel lists' });
  }
});

// GET /api/lists - List all custom lists with active (non-deleted) member count
listsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         l.id,
         l.name,
         l.description,
         l.created_at,
         l.updated_at,
         COUNT(ld.id)::int as lead_count
       FROM lists l
       LEFT JOIN lead_list_memberships m ON m.list_id = l.id
       LEFT JOIN leads ld ON ld.id = m.lead_id AND ld.deleted_at IS NULL
       GROUP BY l.id
       ORDER BY l.created_at ASC`
    );

    res.json({ success: true, lists: result.rows });
  } catch (error) {
    console.error('[listsRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lists' });
  }
});

// POST /api/lists - Create a new list or retrieve existing matching list
listsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'List name is required' });
    }

    const cleanName = name.trim();

    // Check if list already exists with same name (case-insensitive deduplication)
    const existing = await query<{
      id: string;
      name: string;
      description: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, name, description, created_at, updated_at FROM lists
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
       ORDER BY created_at ASC LIMIT 1`,
      [cleanName]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const countRes = await query<{ count: string }>(
        `SELECT COUNT(ld.id)::int as count FROM lead_list_memberships m
         JOIN leads ld ON ld.id = m.lead_id AND ld.deleted_at IS NULL
         WHERE m.list_id = $1`,
        [row.id]
      );
      return res.status(200).json({
        success: true,
        list: { ...row, lead_count: parseInt(countRes.rows[0]?.count || '0', 10) },
        message: 'Existing list retrieved',
      });
    }

    const result = await query(
      `INSERT INTO lists (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at, updated_at`,
      [cleanName, description || '']
    );

    res.status(201).json({ success: true, list: { ...result.rows[0], lead_count: 0 } });
  } catch (error) {
    console.error('[listsRouter.post]', error);
    res.status(500).json({ success: false, error: 'Failed to create list' });
  }
});

// DELETE /api/lists/:id - Delete a list and purge from each place (slot queues, memberships, dispatches, settings)
listsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Get list details to also clean up any duplicate-named copies
    const targetList = await query<{ id: string; name: string }>(
      `SELECT id, name FROM lists WHERE id = $1`,
      [id]
    );

    if (targetList.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'List not found' });
    }

    const listName = targetList.rows[0].name;

    // Find all matching lists (target id + duplicate names)
    const matchingLists = await query<{ id: string }>(
      `SELECT id FROM lists WHERE id = $1 OR TRIM(LOWER(name)) = TRIM(LOWER($2))`,
      [id, listName]
    );
    const allIds = matchingLists.rows.map((r) => r.id);

    // 1. Clean up slot sender queues & reset active scoped list for all matching IDs
    for (const matchId of allIds) {
      await fiveSlotSenderService.handleListDeleted(matchId).catch((err) => {
        console.warn('[listsRouter.delete] Slot cleanup warning:', err?.message);
      });
    }

    // 2. Remove all references in slot_sender_settings
    await query(`UPDATE slot_sender_settings SET active_list_id = NULL WHERE active_list_id = ANY($1::uuid[])`, [allIds]).catch(() => {});

    // 3. Delete from lead_list_memberships for all matching lists
    await query(`DELETE FROM lead_list_memberships WHERE list_id = ANY($1::uuid[])`, [allIds]).catch(() => {});

    // 4. Clear list_id from scheduled_dispatches
    await query(`UPDATE scheduled_dispatches SET list_id = NULL WHERE list_id = ANY($1::uuid[])`, [allIds]).catch(() => {});

    // 5. Delete lists themselves
    const result = await query(
      `DELETE FROM lists WHERE id = ANY($1::uuid[]) RETURNING id`,
      [allIds]
    );

    res.json({
      success: true,
      message: 'List and all associated references deleted from each place successfully',
      deletedCount: result.rowCount,
    });
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

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const cleanLeadIds = [...new Set(
      leadIds.filter((id): id is string => typeof id === 'string' && uuidRegex.test(id.trim())).map((id) => id.trim())
    )];

    if (cleanLeadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one valid lead UUID is required' });
    }

    const resInsert = await query(
      `INSERT INTO lead_list_memberships (list_id, lead_id)
       SELECT $1, id
       FROM leads
       WHERE id = ANY($2::uuid[]) AND deleted_at IS NULL
       ON CONFLICT (list_id, lead_id) DO NOTHING
       RETURNING lead_id`,
      [listId, cleanLeadIds]
    );
    const addedCount = resInsert.rows.length;

    if (addedCount > 0) {
      const listInfo = await query<{ name: string }>(`SELECT name FROM lists WHERE id = $1`, [listId]).catch(() => ({ rows: [] as any[] }));
      const listName = listInfo.rows[0]?.name || listId;
      logPipeline('ADDED_TO_LIST', `Added ${addedCount} lead(s) to list "${listName}"`);
    }

    res.json({ success: true, addedCount });
  } catch (error) {
    console.error('[listsRouter.addMembers]', error);
    logPipelineError('Add to List', 'Failed to add leads to list', error);
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

    await fiveSlotSenderService.handleMembersRemovedFromList(listId, leadIds).catch(() => {});

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

    await fiveSlotSenderService.handleMembersRemovedFromList(listId, [leadId]).catch(() => {});

    res.json({ success: true, removedCount: resDelete.rows.length });
  } catch (error) {
    console.error('[listsRouter.removeSingleMember]', error);
    res.status(500).json({ success: false, error: 'Failed to remove lead from list' });
  }
});
