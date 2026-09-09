import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const queueRouter = Router();

// GET /api/queue
queueRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         q.id,
         q.lead_id,
         q.client_id,
         q.campaign_id,
         q.step_id,
         q.channel,
         q.message_preview,
         q.status,
         q.scheduled_for,
         q.created_at,
         COALESCE(l.business_name, c.business_name, 'Unknown') as lead_name,
         COALESCE(camp.name, 'Direct Outbound') as campaign_name,
         COALESCE(s.name, 'Manual Touch') as step_name
       FROM send_queue q
       LEFT JOIN leads l ON l.id = q.lead_id
       LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN campaigns camp ON camp.id = q.campaign_id
       LEFT JOIN campaign_steps s ON s.id = q.step_id
       WHERE q.status = 'draft'
       ORDER BY q.created_at DESC`
    );

    res.json({ success: true, count: result.rows.length, queue: result.rows });
  } catch (error) {
    console.error('[queueRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch queue' });
  }
});

// POST /api/queue/:id/send - Approve and mark as sent
queueRouter.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const qRes = await query<{ lead_id: string; channel: string; message_preview: string }>(
      `UPDATE send_queue SET status = 'sent', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (qRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Queue item not found' });
    }

    const item = qRes.rows[0];

    // If item has a lead_id, create a message record
    if (item.lead_id) {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = $2 LIMIT 1`,
        [item.lead_id, item.channel]
      );

      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
           VALUES ('lead', $1, $2, 'open', NOW())
           RETURNING id`,
          [item.lead_id, item.channel]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      await query(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
         VALUES ($1, $2, 'outbound', $3, 'sent', NOW())`,
        [convId, item.channel, item.message_preview]
      );

      await query(`UPDATE leads SET last_contacted_at = NOW() WHERE id = $1`, [item.lead_id]);
    }

    res.json({ success: true, message: 'Queue item marked as sent and dispatched' });
  } catch (error) {
    console.error('[queueRouter.send]', error);
    res.status(500).json({ success: false, error: 'Failed to process queue item' });
  }
});

// POST /api/queue/:id/discard - Discard item
queueRouter.post('/:id/discard', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Queue item not found' });
    }

    res.json({ success: true, message: 'Queue item discarded' });
  } catch (error) {
    console.error('[queueRouter.discard]', error);
    res.status(500).json({ success: false, error: 'Failed to discard queue item' });
  }
});
