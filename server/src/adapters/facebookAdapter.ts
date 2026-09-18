import { query } from '../config/db';

export interface FacebookDraftPayload {
  leadId?: string;
  clientId?: string;
  campaignId?: string;
  stepId?: string;
  profileOrPage: string;
  text: string;
}

export interface FacebookDraftResult {
  queued: boolean;
  queueId: string;
  profileOrPage: string;
  deepLink: string;
  preview: string;
  explanation: string;
}

export class FacebookAdapter {
  /**
   * Generates direct Facebook Messenger / Page deep link
   */
  public buildMessengerDeepLink(profileOrPage: string): string {
    if (!profileOrPage) return 'https://facebook.com';
    const clean = profileOrPage.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    const cleanHandle = clean.replace(/^[/@]/, '').trim();
    return `https://m.me/${cleanHandle}`;
  }

  /**
   * Enqueues a Facebook Messenger outreach message into the human send approval queue.
   */
  async enqueueDraft(payload: FacebookDraftPayload): Promise<FacebookDraftResult> {
    const { leadId, clientId, campaignId, stepId, profileOrPage, text } = payload;
    const deepLink = this.buildMessengerDeepLink(profileOrPage);

    const insertRes = await query<{ id: string }>(
      `INSERT INTO send_queue (lead_id, client_id, campaign_id, step_id, channel, message_preview, status, scheduled_for)
       VALUES ($1, $2, $3, $4, 'facebook', $5, 'draft', NOW())
       RETURNING id`,
      [leadId || null, clientId || null, campaignId || null, stepId || null, text]
    );

    const queueId = insertRes.rows[0].id;

    // Increment drafted count in daily metrics
    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, drafted_count, updated_at)
       VALUES (CURRENT_DATE, 'facebook', 1, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET drafted_count = daily_send_metrics.drafted_count + 1, updated_at = NOW()`,
      []
    );

    return {
      queued: true,
      queueId,
      profileOrPage,
      deepLink,
      preview: text,
      explanation: 'Facebook message drafted and added to dispatch queue with direct Messenger link.',
    };
  }

  /**
   * Confirms a message was dispatched and records it into conversation history
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
        `SELECT id FROM conversations WHERE entity_type = $1 AND (lead_id = $2 OR client_id = $2) AND channel = 'facebook' LIMIT 1`,
        [entityType, entityId]
      );

      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, ${entityType === 'lead' ? 'lead_id' : 'client_id'}, channel, status, last_message_at)
           VALUES ($1, $2, 'facebook', 'open', NOW())
           RETURNING id`,
          [entityType, entityId]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      const msgRes = await query<{ id: string }>(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
         VALUES ($1, 'facebook', 'outbound', $2, 'sent', NOW())
         RETURNING id`,
        [convId, item.message_preview]
      );

      await query(
        `UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`,
        [convId]
      );

      return { success: true, messageId: msgRes.rows[0]?.id };
    }

    return { success: true };
  }
}

export const facebookAdapter = new FacebookAdapter();
