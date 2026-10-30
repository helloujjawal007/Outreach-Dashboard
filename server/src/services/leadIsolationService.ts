import { query } from '../config/db';

export interface LeadMessageHistory {
  hasPriorContact: boolean;
  outboundCount: number;
  scheduledSentCount: number;
  lastContactedAt: Date | null;
  firstContactedAt: Date | null;
  currentOutreachStage: string;
  effectiveTouchCount: number;
  resolvedStage: 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'completed';
}

export class LeadIsolationService {
  /**
   * Directly removes a failed lead from all custom lists, moves them to 'Need to Check' (manual_review),
   * cancels any pending drafts or scheduled dispatches, and logs the explicit failure reason.
   *
   * Requirement: "if msg is failed lead should directly removed from list and move to need to check
   * after that unless retrieved back no msg needs to sent to them."
   */
  async isolateFailedLead(leadId: string, failureReason: string): Promise<void> {
    if (!leadId) return;

    const cleanReason = (failureReason || 'Outreach delivery failure').trim().slice(0, 500);

    // Safeguard: Never isolate/quarantine leads for transient network drops, socket timeouts, or server connection glitches!
    // A lead should ONLY be moved to 'Need to Check' if their email address is definitively invalid, bounced, or rejected by recipient server.
    const isNetworkOrTimeout = /timeout|etimedout|econnrefused|econnreset|socket hang up|network error|enotfound|system error|temporarily unavailable/i.test(cleanReason);
    if (isNetworkOrTimeout) {
      console.warn(`[LeadIsolationService] ⚠️ Suppressing lead isolation for ${leadId}. Failure was transient network/timeout ("${cleanReason}"), NOT an invalid contact or permanent bounce.`);
      return;
    }

    try {
      console.warn(`[LeadIsolationService] 🚫 Isolating failed lead ${leadId}. Reason: "${cleanReason}"`);

      // 1. DIRECTLY REMOVE FROM ALL LISTS
      const deletedLists = await query(
        `DELETE FROM lead_list_memberships WHERE lead_id = $1 RETURNING list_id`,
        [leadId]
      );
      if (deletedLists.rows.length > 0) {
        console.log(`[LeadIsolationService] Removed lead ${leadId} from ${deletedLists.rows.length} list(s).`);
      }

      // 2. MOVE TO 'Need to Check' (status = 'manual_review') with explicit reason & timestamp
      await query(
        `UPDATE leads 
         SET status = 'manual_review', 
             manual_review_reason = $1, 
             manual_review_at = NOW(), 
             updated_at = NOW() 
         WHERE id = $2`,
        [cleanReason, leadId]
      );

      // 3. DISCARD ANY DRAFT ITEMS IN SEND QUEUE
      await query(
        `UPDATE send_queue 
         SET status = 'discarded', 
             error_details = $1, 
             updated_at = NOW() 
         WHERE lead_id = $2 AND status = 'draft'`,
        [cleanReason, leadId]
      );

      // 4. CANCEL ANY PENDING SCHEDULED DISPATCHES
      await query(
        `UPDATE scheduled_dispatches 
         SET status = 'cancelled', 
             error_message = $1, 
             updated_at = NOW() 
         WHERE lead_id = $2 AND status IN ('scheduled', 'processing')`,
        [cleanReason, leadId]
      );

      // 5. Record delivery failure into conversation messages so thread history is complete
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 ORDER BY last_message_at DESC LIMIT 1`,
        [leadId]
      );
      if (convRes.rows.length > 0) {
        await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
           VALUES ($1, 'email', 'outbound', $2, 'failed', NOW())`,
          [convRes.rows[0].id, `[DELIVERY FAILED]: ${cleanReason} (Lead moved to Need to Check)`]
        );
      }

      console.log(`[LeadIsolationService] Lead ${leadId} successfully isolated in 'Need to Check'. All lists cleared and outreach halted.`);
    } catch (err: any) {
      console.error(`[LeadIsolationService] Error isolating lead ${leadId}:`, err?.message);
    }
  }

  /**
   * Fast check if a lead is currently in 'Need to Check' (manual_review).
   * While in this state, NO messages should ever be sent to them unless retrieved back.
   */
  async isLeadInManualReview(leadId: string): Promise<{ inReview: boolean; reason?: string }> {
    if (!leadId) return { inReview: false };

    try {
      const res = await query<{ status: string; manual_review_reason?: string }>(
        `SELECT status, manual_review_reason FROM leads WHERE id = $1`,
        [leadId]
      );
      if (res.rows.length > 0 && res.rows[0].status === 'manual_review') {
        return {
          inReview: true,
          reason: res.rows[0].manual_review_reason || 'Previous delivery failure',
        };
      }
    } catch (err) {
      console.error(`[LeadIsolationService] Error checking lead review status for ${leadId}:`, err);
    }

    return { inReview: false };
  }

  /**
   * Checks prior message history across all tables:
   * - messages (outbound touches)
   * - scheduled_dispatches (sent dispatches)
   * - leads (first_contacted_at, last_contacted_at, outreach_stage)
   *
   * Requirement: "it should check before sending it. if older msg is there it should send follow up email."
   */
  async getLeadMessageHistory(leadId: string): Promise<LeadMessageHistory> {
    const leadRes = await query<{
      first_contacted_at: Date | null;
      last_contacted_at: Date | null;
      outreach_stage: string | null;
      status: string;
    }>(
      `SELECT first_contacted_at, last_contacted_at, outreach_stage, status FROM leads WHERE id = $1`,
      [leadId]
    );

    const lead = leadRes.rows[0] || {
      first_contacted_at: null,
      last_contacted_at: null,
      outreach_stage: null,
      status: 'active',
    };

    // 1. Count actual outbound messages
    const msgRes = await query<{ count: string }>(
      `SELECT COUNT(m.id)::int as count
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.entity_type = 'lead' AND c.lead_id = $1 AND m.direction = 'outbound'
         AND m.status IN ('sent', 'delivered', 'queued')`,
      [leadId]
    );
    const outboundCount = Number(msgRes.rows[0]?.count || 0);

    // 2. Count sent scheduled dispatches
    const schedRes = await query<{ count: string }>(
      `SELECT COUNT(*)::int as count
       FROM scheduled_dispatches
       WHERE lead_id = $1 AND status = 'sent'`,
      [leadId]
    );
    const scheduledSentCount = Number(schedRes.rows[0]?.count || 0);

    // 3. Stage mapping
    const stageMap: Record<string, number> = {
      initial: 0,
      followup_1: 1,
      followup_2: 2,
      followup_3: 3,
      completed: 4,
    };
    const leadStageNum = lead.outreach_stage ? (stageMap[lead.outreach_stage] ?? 0) : 0;
    const hasContactTimestamp = Boolean(lead.last_contacted_at || lead.first_contacted_at);

    // If an older message exists via outbound messages, scheduled dispatches, or recorded contact timestamps,
    // effectiveTouchCount is GUARANTEED to be at least 1!
    const priorRecordedTouches = Math.max(outboundCount, scheduledSentCount, leadStageNum);
    const effectiveTouchCount = Math.max(
      priorRecordedTouches,
      hasContactTimestamp ? 1 : 0
    );

    const hasPriorContact = effectiveTouchCount > 0;

    const resolvedStage: 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'completed' =
      effectiveTouchCount === 0
        ? 'initial'
        : effectiveTouchCount === 1
        ? 'followup_1'
        : effectiveTouchCount === 2
        ? 'followup_2'
        : effectiveTouchCount === 3
        ? 'followup_3'
        : 'completed';

    return {
      hasPriorContact,
      outboundCount,
      scheduledSentCount,
      lastContactedAt: lead.last_contacted_at,
      firstContactedAt: lead.first_contacted_at,
      currentOutreachStage: lead.outreach_stage || 'initial',
      effectiveTouchCount,
      resolvedStage,
    };
  }
}

export const leadIsolationService = new LeadIsolationService();
