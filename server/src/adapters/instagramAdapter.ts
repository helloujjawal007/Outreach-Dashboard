import { query } from '../config/db';

export interface InstagramDraftPayload {
  leadId?: string;
  clientId?: string;
  campaignId?: string;
  stepId?: string;
  handle: string;
  text: string;
}

export interface InstagramDraftResult {
  queued: boolean;
  queueId: string;
  handle: string;
  deepLink: string;
  preview: string;
  explanation: string;
}

export class InstagramAdapter {
  /**
   * Enqueues an Instagram / Facebook message into the human send approval queue.
   * Direct automated DMing is restricted to protect social accounts from anti-bot flags.
   */
  async enqueueDraft(payload: InstagramDraftPayload): Promise<InstagramDraftResult> {
    const { leadId, clientId, campaignId, stepId, handle, text } = payload;
    const cleanHandle = (handle || '').replace(/^@/, '').trim();
    const deepLink = cleanHandle ? `https://instagram.com/${cleanHandle}` : 'https://instagram.com';

    const insertRes = await query<{ id: string }>(
      `INSERT INTO send_queue (lead_id, client_id, campaign_id, step_id, channel, message_preview, status, scheduled_for)
       VALUES ($1, $2, $3, $4, 'instagram', $5, 'draft', NOW())
       RETURNING id`,
      [leadId || null, clientId || null, campaignId || null, stepId || null, text]
    );

    const queueId = insertRes.rows[0].id;

    // Increment drafted count in daily metrics
    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, drafted_count, updated_at)
       VALUES (CURRENT_DATE, 'instagram', 1, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET drafted_count = daily_send_metrics.drafted_count + 1, updated_at = NOW()`,
      []
    );

    return {
      queued: true,
      queueId,
      handle: cleanHandle,
      deepLink,
      preview: text,
      explanation: 'Instagram DM drafted and added to human approval queue (direct automation blocked to prevent Meta shadowbans).',
    };
  }

  /**
   * Confirms a human operator sent the message and records it into conversation history
   */
  async markDraftSent(queueId: string): Promise<{ success: boolean; messageId?: string }> {
    const qRes = await query<{
      lead_id: string | null;
      client_id: string | null;
      channel: string;
      message_preview: string;
    }>(
      `UPDATE send_queue SET status = 'sent', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [queueId]
    );

    if (qRes.rows.length === 0) {
      throw new Error('Queue item not found');
    }

    const item = qRes.rows[0];
    const entityId = item.lead_id || item.client_id;
    const entityType = item.client_id ? 'client' : 'lead';

    if (entityId) {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = $1 AND (lead_id = $2 OR client_id = $2) AND channel = 'instagram' LIMIT 1`,
        [entityType, entityId]
      );

      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, ${entityType === 'lead' ? 'lead_id' : 'client_id'}, channel, status, last_message_at)
           VALUES ($1, $2, 'instagram', 'open', NOW())
           RETURNING id`,
          [entityType, entityId]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      const msgRes = await query<{ id: string }>(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
         VALUES ($1, 'instagram', 'outbound', $2, 'sent', NOW())
         RETURNING id`,
        [convId, item.message_preview]
      );

      await query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [convId]
      );

      if (item.lead_id) {
        await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [item.lead_id]);
      }

      return {
        success: true,
        messageId: msgRes.rows[0].id,
      };
    }

    return { success: true };
  }
}

export const instagramAdapter = new InstagramAdapter();
