import { query } from '../config/db';
import { conversationOrchestrator, type ClientConversionResult } from '../services/orchestratorService';

export interface WhatsAppWindowStatus {
  hasInbound: boolean;
  isOpen: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingMinutes: number;
  reason: string;
}

export interface WhatsAppSendResult {
  allowed: boolean;
  messageId?: string;
  reason: string;
  code: 'WINDOW_ACTIVE' | 'COLD_OUTBOUND_DISALLOWED' | 'WINDOW_EXPIRED' | 'SEND_FAILED';
}

export class WhatsAppAdapter {
  private readonly WINDOW_DURATION_HOURS = 24;

  /**
   * Checks whether the 24-hour customer service window is active for a given entity
   */
  async check24HourWindow(entityId: string, isClient: boolean = false): Promise<WhatsAppWindowStatus> {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId);
    if (!isUUID) {
      return {
        hasInbound: false,
        isOpen: false,
        lastInboundAt: null,
        expiresAt: null,
        remainingMinutes: 0,
        reason: 'Contact ID is not a valid UUID. Outbound WhatsApp is gated.',
      };
    }

    const convQuery = isClient
      ? `SELECT id FROM conversations WHERE entity_type = 'client' AND client_id = $1 AND channel = 'whatsapp'`
      : `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp'`;

    const convRes = await query<{ id: string }>(convQuery, [entityId]);

    if (convRes.rows.length === 0) {
      return {
        hasInbound: false,
        isOpen: false,
        lastInboundAt: null,
        expiresAt: null,
        remainingMinutes: 0,
        reason: 'No WhatsApp conversation thread exists. Cold outreach via WhatsApp is prohibited by platform policy.',
      };
    }

    const convId = convRes.rows[0].id;
    const msgRes = await query<{ sent_at: string }>(
      `SELECT sent_at FROM messages
       WHERE conversation_id = $1 AND channel = 'whatsapp' AND direction = 'inbound'
       ORDER BY sent_at DESC LIMIT 1`,
      [convId]
    );

    if (msgRes.rows.length === 0) {
      return {
        hasInbound: false,
        isOpen: false,
        lastInboundAt: null,
        expiresAt: null,
        remainingMinutes: 0,
        reason: 'Contact has never initiated an inbound WhatsApp message. Outbound cold-send is strictly gated.',
      };
    }

    const lastInbound = new Date(msgRes.rows[0].sent_at);
    const expiresAt = new Date(lastInbound.getTime() + this.WINDOW_DURATION_HOURS * 60 * 60 * 1000);
    const now = new Date();
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
    const isOpen = remainingMs > 0;

    return {
      hasInbound: true,
      isOpen,
      lastInboundAt: lastInbound.toISOString(),
      expiresAt: expiresAt.toISOString(),
      remainingMinutes,
      reason: isOpen
        ? `24-hour customer window is ACTIVE (${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m remaining). Freeform replies permitted.`
        : `24-hour customer window has EXPIRED (closed on ${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}). Direct replies gated.`,
    };
  }

  /**
   * Attempts to send a WhatsApp message, enforcing the 24-hour free window policy.
   * Cold outbound is strictly disabled.
   */
  async verifyAndSend(params: {
    entityId: string;
    isClient: boolean;
    text: string;
  }): Promise<WhatsAppSendResult> {
    const { entityId, isClient, text } = params;

    // Paying clients with pre-approved agreements or active conversations can be messaged,
    // but cold leads are strictly gated by the 24h inbound window.
    const windowStatus = await this.check24HourWindow(entityId, isClient);

    // Strict Gate: For cold leads, no message can be sent without an active 24h window
    if (!isClient && !windowStatus.isOpen) {
      return {
        allowed: false,
        code: windowStatus.hasInbound ? 'WINDOW_EXPIRED' : 'COLD_OUTBOUND_DISALLOWED',
        reason: windowStatus.hasInbound
          ? 'WhatsApp 24-hour customer care window has expired. A new inbound message from the prospect is required.'
          : 'Cold WhatsApp outbound is disabled by policy. WhatsApp messaging is only allowed within 24 hours of an inbound customer message to protect phone reputation.',
      };
    }

    // If within active window (or active paying client): dispatch reply
    const convQuery = isClient
      ? `SELECT id FROM conversations WHERE entity_type = 'client' AND client_id = $1 AND channel = 'whatsapp'`
      : `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp'`;

    const convRes = await query<{ id: string }>(convQuery, [entityId]);
    let convId: string;

    if (convRes.rows.length === 0) {
      const insertConv = await query<{ id: string }>(
        `INSERT INTO conversations (entity_type, ${isClient ? 'client_id' : 'lead_id'}, channel, status, last_message_at)
         VALUES ($1, $2, 'whatsapp', 'open', NOW())
         RETURNING id`,
        [isClient ? 'client' : 'lead', entityId]
      );
      convId = insertConv.rows[0].id;
    } else {
      convId = convRes.rows[0].id;
    }

    const msgRes = await query<{ id: string }>(
      `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
       VALUES ($1, 'whatsapp', 'outbound', $2, 'delivered', NOW())
       RETURNING id`,
      [convId, text]
    );

    await query(`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [convId]);

    // Record daily metric
    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
       VALUES (CURRENT_DATE, 'whatsapp', 1, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`,
      []
    );

    return {
      allowed: true,
      messageId: msgRes.rows[0].id,
      code: 'WINDOW_ACTIVE',
      reason: 'WhatsApp message dispatched within active customer care window.',
    };
  }

  /**
   * Processes an incoming WhatsApp webhook event (e.g. from WhatsApp Cloud API or simulator)
   */
  async handleInboundWebhook(params: {
    fromPhone: string;
    text: string;
    externalMessageId?: string;
  }): Promise<{
    handled: boolean;
    leadId?: string;
    conversationId: string;
    isOptOut: boolean;
    clientConversion?: ClientConversionResult;
  }> {
    const { fromPhone, text, externalMessageId } = params;
    const cleanDigits = fromPhone.replace(/\D/g, '');

    // 1. Locate lead or client matching phone
    const leadRes = await query<{ id: string; consent_status: string }>(
      `SELECT id, consent_status FROM leads WHERE phone LIKE '%' || $1 || '%' LIMIT 1`,
      [cleanDigits.slice(-10)]
    );

    let leadId: string;
    if (leadRes.rows.length === 0) {
      // Create new inbound lead on the fly
      const newLead = await query<{ id: string }>(
        `INSERT INTO leads (business_name, phone, whatsapp, consent_status)
         VALUES ($1, $2, $2, 'replied')
         RETURNING id`,
        [`Inbound WA Contact (${fromPhone})`, fromPhone]
      );
      leadId = newLead.rows[0].id;
    } else {
      leadId = leadRes.rows[0].id;
    }

    // Check opt-out keywords
    const lowerText = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim();
    const isOptOut = ['stop', 'unsubscribe', 'remove', 'cancel', 'quit', 'opt out', 'opt-out', 'dont message', 'do not contact'].some((kw) =>
      lowerText.includes(kw)
    );

    let clientConversion: ClientConversionResult | undefined;

    if (isOptOut) {
      await query(`UPDATE leads SET consent_status = 'opted_out', updated_at = NOW() WHERE id = $1`, [leadId]);
      await query(
        `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
        [leadId]
      );
      console.log(`[WhatsAppAdapter] Opt-out keyword detected in WhatsApp message from ${fromPhone}. Contact suppressed.`);
    } else {
      await query(`UPDATE leads SET consent_status = 'replied', last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [leadId]);
      // Auto-convert to Client and hand off to Conversation Orchestrator (Phase 5)
      clientConversion = await conversationOrchestrator.convertLeadToClient(
        leadId,
        `Auto-converted via inbound WhatsApp message from ${fromPhone}`
      );
    }

    // 2. Ensure conversation thread exists
    const convRes = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp' LIMIT 1`,
      [leadId]
    );

    let convId: string;
    if (convRes.rows.length === 0) {
      const newConv = await query<{ id: string }>(
        `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
         VALUES ('lead', $1, 'whatsapp', 'open', NOW())
         RETURNING id`,
        [leadId]
      );
      convId = newConv.rows[0].id;
    } else {
      convId = convRes.rows[0].id;
    }

    // 3. Record incoming message (this timestamp opens the 24-hour window!)
    await query(
      `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
       VALUES ($1, 'whatsapp', 'inbound', $2, 'delivered', $3, NOW())`,
      [convId, text, externalMessageId || '']
    );

    await query(`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [convId]);

    return {
      handled: true,
      leadId,
      conversationId: convId,
      isOptOut,
      clientConversion,
    };
  }
}

export const whatsappAdapter = new WhatsAppAdapter();
