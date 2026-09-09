import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';

export interface StageDispatchResult {
  leadId: string;
  businessName: string;
  email: string;
  stage: 'initial' | 'followup_1' | 'followup_2' | 'completed';
  stageLabel: string;
  subject: string;
  success: boolean;
  liveDelivery?: string;
  skipped?: boolean;
  reason?: string;
}

export class StageOutreachService {
  /**
   * Determine a lead's current outreach stage based on prior outbound emails
   */
  async getLeadStage(leadId: string): Promise<{
    stage: 'initial' | 'followup_1' | 'followup_2' | 'completed';
    stageLabel: string;
    nextStepLabel: string;
    sentCount: number;
    subject: string;
    body: string;
  }> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      category: string;
      email: string;
      consent_status: string;
    }>(`SELECT * FROM leads WHERE id = $1`, [leadId]);

    if (leadRes.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadRes.rows[0];

    const msgCountRes = await query<{ count: string }>(
      `SELECT COUNT(m.id)::int as count
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.entity_type = 'lead' AND c.lead_id = $1 AND m.direction = 'outbound' AND m.channel = 'email'`,
      [leadId]
    );

    const sentCount = Number(msgCountRes.rows[0]?.count || 0);

    const business = lead.business_name || 'your team';
    const category = lead.category || 'your industry';

    if (sentCount === 0) {
      return {
        stage: 'initial',
        stageLabel: 'First Message Needed',
        nextStepLabel: 'Shoot First Message (Intro)',
        sentCount,
        outboundCount: sentCount,
        subject: `Quick question regarding ${business}`,
        body: `Hi ${business} Team,\n\nI came across your business in ${category} and wanted to reach out.\n\nWe specialize in helping companies scale client acquisition and automate lead follow-ups.\n\nWould you be open to a brief 5-minute conversation this week?\n\nBest regards,\nGrowth & Partnerships Team`,
      };
    } else if (sentCount === 1) {
      return {
        stage: 'followup_1',
        stageLabel: 'Follow-up 1 Due',
        nextStepLabel: 'Shoot Follow-up 1 (Check-in)',
        sentCount,
        outboundCount: sentCount,
        subject: `Re: Quick question regarding ${business}`,
        body: `Hi ${business} Team,\n\nJust following up on my previous note. I know you're busy running operations at ${business}!\n\nDid you get a chance to review my previous message regarding client outreach?\n\nHappy to share a quick 2-minute overview whenever suits you.\n\nBest regards,\nGrowth & Partnerships Team`,
      };
    } else if (sentCount === 2) {
      return {
        stage: 'followup_2',
        stageLabel: 'Follow-up 2 Due',
        nextStepLabel: 'Shoot Follow-up 2 (Final Nudge)',
        sentCount,
        outboundCount: sentCount,
        subject: `Final check-in: ${business}`,
        body: `Hi ${business} Team,\n\nI don't want to clutter your inbox, so this will be my final follow-up.\n\nIf you ever need assistance optimizing your outreach or customer retention in ${category}, please feel free to reach out anytime.\n\nWishing you and the team at ${business} continued success!\n\nBest regards,\nGrowth & Partnerships Team`,
      };
    } else {
      return {
        stage: 'completed',
        stageLabel: 'Sequence Completed',
        nextStepLabel: 'Sequence Completed (3 touches sent)',
        sentCount,
        outboundCount: sentCount,
        subject: `Sequence Completed`,
        body: ``,
      };
    }
  }

  /**
   * Automatically dispatch the next appropriate stage email to a single lead
   */
  async sendNextStageToLead(leadId: string): Promise<StageDispatchResult> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      category: string;
      email: string;
      consent_status: string;
      deleted_at: string | null;
    }>(`SELECT * FROM leads WHERE id = $1`, [leadId]);

    if (leadRes.rows.length === 0) {
      return {
        leadId,
        businessName: 'Unknown',
        email: '',
        stage: 'completed',
        stageLabel: 'Not Found',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead does not exist',
      };
    }

    const lead = leadRes.rows[0];

    // Safeguards
    if (lead.deleted_at) {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        stage: 'completed',
        stageLabel: 'Deleted',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead is in deletion trash',
      };
    }

    if (lead.consent_status === 'opted_out') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        stage: 'completed',
        stageLabel: 'Opted Out',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead has opted out (suppressed)',
      };
    }

    if (lead.consent_status === 'replied') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        stage: 'completed',
        stageLabel: 'Replied',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead has already replied / converted',
      };
    }

    if (!lead.email || !lead.email.includes('@')) {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email || '',
        stage: 'completed',
        stageLabel: 'No Email',
        subject: '',
        success: false,
        skipped: true,
        reason: 'No valid email address configured for lead',
      };
    }

    const stageInfo = await this.getLeadStage(leadId);

    if (stageInfo.stage === 'completed') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        stage: 'completed',
        stageLabel: 'Sequence Completed',
        subject: '',
        success: false,
        skipped: true,
        reason: `Maximum outreach touches (3 touches) already reached for this lead`,
      };
    }

    // 1. Dispatch email via live Gmail SMTP / adapter
    const sendRes = await emailAdapter.sendEmail({
      to: lead.email,
      subject: stageInfo.subject,
      body: stageInfo.body,
      leadId: lead.id,
    });

    if (!sendRes.success) {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        stage: stageInfo.stage,
        stageLabel: stageInfo.stageLabel,
        subject: stageInfo.subject,
        success: false,
        liveDelivery: sendRes.liveDelivery,
        reason: sendRes.reason || 'Send failed in email adapter',
      };
    }

    // 2. Update lead last_contacted_at and outreach_stage
    const nextStageName =
      stageInfo.stage === 'initial'
        ? 'followup_1'
        : stageInfo.stage === 'followup_1'
        ? 'followup_2'
        : 'completed';

    await query(
      `UPDATE leads 
       SET last_contacted_at = NOW(), 
           outreach_stage = $1, 
           updated_at = NOW() 
       WHERE id = $2`,
      [nextStageName, leadId]
    );

    return {
      leadId,
      businessName: lead.business_name,
      email: lead.email,
      stage: stageInfo.stage,
      stageLabel: stageInfo.stageLabel,
      subject: stageInfo.subject,
      success: true,
      liveDelivery: sendRes.liveDelivery,
    };
  }

  /**
   * Bulk dispatch to an array of leads
   */
  async sendBulkNextStage(leadIds: string[]): Promise<{
    totalProcessed: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    breakdown: {
      initial: number;
      followup_1: number;
      followup_2: number;
    };
    results: StageDispatchResult[];
  }> {
    const results: StageDispatchResult[] = [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const breakdown = { initial: 0, followup_1: 0, followup_2: 0 };

    for (const id of leadIds) {
      const res = await this.sendNextStageToLead(id);
      results.push(res);

      if (res.success) {
        sentCount++;
        if (res.stage === 'initial') breakdown.initial++;
        else if (res.stage === 'followup_1') breakdown.followup_1++;
        else if (res.stage === 'followup_2') breakdown.followup_2++;
      } else if (res.skipped) {
        skippedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      totalProcessed: leadIds.length,
      sentCount,
      skippedCount,
      failedCount,
      breakdown,
      results,
    };
  }
}

export const stageOutreachService = new StageOutreachService();
