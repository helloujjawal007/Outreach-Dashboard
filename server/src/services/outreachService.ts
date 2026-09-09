import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { whatsappAdapter } from '../adapters/whatsappAdapter';
import { instagramAdapter } from '../adapters/instagramAdapter';
import { conversationOrchestrator, type ClientConversionResult } from './orchestratorService';

export interface SendResult {
  allowed: boolean;
  channel: 'email' | 'whatsapp' | 'instagram';
  actionTaken: 'sent_direct' | 'queued_draft' | 'blocked_consent' | 'blocked_channel_rule' | 'throttled_warmup';
  reason?: string;
  messageId?: string;
  queueId?: string;
  deepLink?: string;
}

/**
 * OUTREACH ENGINE & CHANNEL-AWARE SEND ROUTER
 * Dedicated service for Cold Prospect Sequence Drips, Consent Gates, and Hard Suppression.
 * MANDATE: Only operates on LEADS. Never uses automatic, unlimited-reply client logic.
 */
export class OutreachEngineService {
  private readonly STOP_KEYWORDS = [
    'stop',
    'unsubscribe',
    'remove',
    'cancel',
    'quit',
    'opt out',
    'opt-out',
    'dont message',
    'do not contact',
    'stop messaging',
    'leave me alone',
    'take me off',
  ];

  /**
   * Evaluates inbound message text from a lead:
   * - If opt-out keyword: sets consent_status = 'opted_out', cancels drafts, suppresses messaging.
   * - If positive/general reply: sets consent_status = 'replied', auto-converts to Client,
   *   and hands off to Conversation Orchestrator / Follow-up Scheduler.
   */
  async handleInboundLeadMessage(
    leadId: string,
    text: string
  ): Promise<{
    isOptOut: boolean;
    newStatus: string;
    clientConversion?: ClientConversionResult;
  }> {
    const cleanText = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim();
    const isOptOut = this.STOP_KEYWORDS.some((kw) => {
      const cleanKw = kw.replace(/[^a-z0-9\s-]/g, ' ');
      return cleanText.includes(cleanKw);
    });

    if (isOptOut) {
      await query(
        `UPDATE leads SET consent_status = 'opted_out', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      // Discard any pending queue items for this lead
      await query(
        `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
        [leadId]
      );
      console.log(`[OutreachEngine] Opt-out keyword detected in inbound message. Lead ${leadId} marked 'opted_out'.`);
      return { isOptOut: true, newStatus: 'opted_out' };
    }

    // Otherwise, mark as replied
    await query(
      `UPDATE leads SET consent_status = 'replied', last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [leadId]
    );

    // Hand off to Conversation Orchestrator: Auto-convert to full Client & enroll in retention follow-up rules
    const conversion = await conversationOrchestrator.convertLeadToClient(
      leadId,
      `Auto-converted on inbound reply: "${text.substring(0, 60)}..."`
    );

    console.log(`[OutreachEngine] Inbound reply received. Lead ${leadId} converted to Client ${conversion.clientId}`);

    return {
      isOptOut: false,
      newStatus: 'replied',
      clientConversion: conversion,
    };
  }

  /**
   * Checks whether global deliverability thresholds are breached, requiring auto-throttling
   */
  async checkDeliverabilityThrottled(): Promise<{ throttled: boolean; reason?: string }> {
    const res = await query<{
      total_sent: string;
      total_bounced: string;
      total_complaints: string;
    }>(
      `SELECT
         COALESCE(SUM(sent_count), 0) as total_sent,
         COALESCE(SUM(bounced_count), 0) as total_bounced,
         COALESCE(SUM(complaints_count), 0) as total_complaints
       FROM daily_send_metrics
       WHERE metric_date >= CURRENT_DATE - INTERVAL '6 days'`
    );

    const sent = parseInt(res.rows[0]?.total_sent || '0', 10);
    const bounced = parseInt(res.rows[0]?.total_bounced || '0', 10);
    const complaints = parseInt(res.rows[0]?.total_complaints || '0', 10);

    if (sent >= 10) {
      const bounceRate = (bounced / sent) * 100;
      if (bounceRate > 5) {
        return {
          throttled: true,
          reason: `High bounce rate (${bounceRate.toFixed(1)}% > 5% threshold). Automated outreach is paused to protect domain reputation.`,
        };
      }

      const complaintRate = (complaints / sent) * 100;
      if (complaintRate > 0.3) {
        return {
          throttled: true,
          reason: `High spam complaint rate (${complaintRate.toFixed(2)}% > 0.30% Google/Yahoo threshold). Outreach is paused.`,
        };
      }
    }

    return { throttled: false };
  }

  /**
   * Channel-Aware Send Router:
   * 1. Consent Gate: Hard block if lead opted out.
   * 2. Email Adapter: Dispatches through dedicated subdomain with progressive warm-up throttling.
   * 3. WhatsApp Adapter: Cold sends strictly disabled; replies permitted ONLY within active 24h inbound window.
   * 4. Instagram/FB Adapter: Enqueues draft in human approval queue to prevent platform automation bans.
   */
  async routeOutreachMessage(params: {
    leadId: string;
    channel: 'email' | 'whatsapp' | 'instagram';
    text: string;
    campaignId?: string;
    stepId?: string;
  }): Promise<SendResult> {
    const { leadId, channel, text, campaignId, stepId } = params;

    // 1. Consent Gate & Hard Suppression Check
    const leadRes = await query<{
      id: string;
      business_name: string;
      consent_status: string;
      email: string;
      phone: string;
      instagram: string;
      whatsapp: string;
    }>(
      `SELECT id, business_name, consent_status, email, phone, instagram, whatsapp FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadRes.rows.length === 0) {
      return {
        allowed: false,
        channel,
        actionTaken: 'blocked_consent',
        reason: 'Lead does not exist in database',
      };
    }

    const lead = leadRes.rows[0];

    if (lead.consent_status === 'opted_out') {
      return {
        allowed: false,
        channel,
        actionTaken: 'blocked_consent',
        reason: 'Lead has explicitly opted out. Automated and manual messaging is hard-blocked.',
      };
    }

    // 1b. Global Address & Phone Suppression Register Check
    if (lead.email || lead.phone) {
      const globalCheck = await query<{ count: string }>(
        `SELECT COUNT(*) FROM leads
         WHERE consent_status = 'opted_out'
           AND (
             (email <> '' AND LOWER(email) = LOWER($1)) OR
             (phone <> '' AND phone = $2)
           )`,
        [lead.email || '', lead.phone || '']
      );
      if (parseInt(globalCheck.rows[0]?.count || '0', 10) > 0) {
        return {
          allowed: false,
          channel,
          actionTaken: 'blocked_consent',
          reason: 'Recipient email or phone is recorded on the global opt-out suppression register.',
        };
      }
    }

    // 1c. Deliverability Auto-Throttle Guard Check
    const throttleCheck = await this.checkDeliverabilityThrottled();
    if (throttleCheck.throttled) {
      return {
        allowed: false,
        channel,
        actionTaken: 'throttled_warmup',
        reason: throttleCheck.reason,
      };
    }

    // 2. Channel-Aware Policy Routing

    // A) WHATSAPP: Inbound reply handling only (24h free customer service window). Cold outbound disabled.
    if (channel === 'whatsapp') {
      const waResult = await whatsappAdapter.verifyAndSend({
        entityId: leadId,
        isClient: false,
        text,
      });

      if (!waResult.allowed) {
        return {
          allowed: false,
          channel: 'whatsapp',
          actionTaken: 'blocked_channel_rule',
          reason: waResult.reason,
        };
      }

      return {
        allowed: true,
        channel: 'whatsapp',
        actionTaken: 'sent_direct',
        messageId: waResult.messageId,
        reason: waResult.reason,
      };
    }

    // B) INSTAGRAM / FACEBOOK: Draft queue workflow (requires human send)
    if (channel === 'instagram') {
      const igResult = await instagramAdapter.enqueueDraft({
        leadId,
        campaignId,
        stepId,
        handle: lead.instagram || lead.business_name,
        text,
      });

      return {
        allowed: true,
        channel: 'instagram',
        actionTaken: 'queued_draft',
        queueId: igResult.queueId,
        deepLink: igResult.deepLink,
        reason: igResult.explanation,
      };
    }

    // C) EMAIL: Dedicated subdomain with progressive warm-up tracking & auto-throttling
    const emailResult = await emailAdapter.sendEmail({
      to: lead.email,
      subject: `Introduction for ${lead.business_name}`,
      body: text,
      leadId,
    });

    if (emailResult.throttled) {
      return {
        allowed: false,
        channel: 'email',
        actionTaken: 'throttled_warmup',
        reason: emailResult.reason,
      };
    }

    return {
      allowed: true,
      channel: 'email',
      actionTaken: 'sent_direct',
      messageId: emailResult.messageId,
      reason: emailResult.reason || 'Email dispatched through warm-up sender subdomain.',
    };
  }
}


export const outreachEngine = new OutreachEngineService();
