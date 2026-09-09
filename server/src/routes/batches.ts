import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';
import { stageOutreachService } from '../services/stageOutreachService';

export const batchesRouter = Router();

// GET /api/batches - List all upload batches within 28 days
batchesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        b.id,
        b.batch_name,
        b.source,
        b.total_rows,
        b.imported_count,
        b.duplicate_count,
        b.incomplete_count,
        b.created_at,
        b.expires_at,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (b.expires_at - NOW())) / 86400))::int AS days_remaining,
        COUNT(l.id) FILTER (WHERE l.deleted_at IS NULL)::int as lead_count
      FROM upload_batches b
      LEFT JOIN leads l ON l.batch_id = b.id
      WHERE b.expires_at >= NOW()
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);

    res.json({ success: true, batches: result.rows });
  } catch (error) {
    console.error('[batchesRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch upload batches' });
  }
});

// GET /api/batches/:id - Get batch details and associated active leads
batchesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const batchRes = await query(`SELECT * FROM upload_batches WHERE id = $1`, [id]);
    if (batchRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    const leadsRes = await query(`SELECT * FROM leads WHERE batch_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [id]);

    res.json({
      success: true,
      batch: batchRes.rows[0],
      leads: leadsRes.rows,
    });
  } catch (error) {
    console.error('[batchesRouter.getById]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch batch' });
  }
});

// POST /api/batches/:id/shoot-emails - Shoot emails to batch based on individual contact stages
batchesRouter.post('/:id/shoot-emails', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const batchRes = await query(`SELECT * FROM upload_batches WHERE id = $1`, [id]);
    if (batchRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    // Fetch active leads in this batch with an email address
    const leadsRes = await query<{ id: string }>(
      `SELECT id FROM leads 
       WHERE batch_id = $1 
         AND deleted_at IS NULL 
         AND email <> '' 
         AND consent_status <> 'opted_out' 
         AND consent_status <> 'replied'
       ORDER BY created_at ASC`,
      [id]
    );

    if (leadsRes.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No eligible leads to email in this batch',
        totalProcessed: 0,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 0,
        breakdown: { initial: 0, followup_1: 0, followup_2: 0 },
        results: [],
      });
    }

    const leadIds = leadsRes.rows.map((r) => r.id);
    const result = await stageOutreachService.sendBulkNextStage(leadIds);

    res.json({
      success: true,
      batchName: batchRes.rows[0].batch_name,
      ...result,
    });
  } catch (error) {
    console.error('[batchesRouter.shootEmails]', error);
    res.status(500).json({ success: false, error: 'Failed to shoot batch emails' });
  }
});

// DELETE /api/batches/:id - Delete batch
batchesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const result = await query(`DELETE FROM upload_batches WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    res.json({ success: true, message: 'Batch removed successfully' });
  } catch (error) {
    console.error('[batchesRouter.delete]', error);
    res.status(500).json({ success: false, error: 'Failed to delete batch' });
  }
});
