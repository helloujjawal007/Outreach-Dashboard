import { query } from '../config/db';
import { emailValidatorService } from './emailValidatorService';
import { humanCopywriterService } from './humanCopywriterService';
import { channelListAutoAssignmentService, type ChannelAssignmentSummary } from './channelListAutoAssignmentService';
import { emailSchedulerService } from './emailSchedulerService';

export interface AutomatedIntakeResult {
  totalImported: number;
  hasEmailCount: number;
  verifiedEmailCount: number;
  invalidEmailCount: number;
  scheduledTodayCount: number;
  rolledOverCount: number;
  rolloverScheduleByDate: Record<string, number>;
  channelAssignments: ChannelAssignmentSummary;
}

export class AutomatedIntakeEngine {
  private readonly DAILY_EMAIL_LIMIT = 200;

  /**
   * Helper sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Processes all imported leads:
   * 1. Auto-assigns leads to standard channel lists (Email, WhatsApp, LinkedIn, IG, FB)
   * 2. Validates emails against syntax & prior bounces
   * 3. Schedules initial outreach respecting the 200/day limit, rolling over excess to next day(s)
   */
  public async processImportedLeads(
    leads: Array<{
      id: string;
      businessName?: string;
      business_name?: string;
      category?: string;
      email?: string;
      phone?: string;
      whatsapp?: string;
      linkedin?: string;
      instagram?: string;
      facebook?: string;
      status?: string;
      consent_status?: string;
      outreach_stage?: string;
      [key: string]: any;
    }>,
    options: {
      customListId?: string;
      autoSend?: boolean;
      scheduledStartTime?: Date | string;
    } = {}
  ): Promise<AutomatedIntakeResult> {
    if (!Array.isArray(leads) || leads.length === 0) {
      return {
        totalImported: 0,
        hasEmailCount: 0,
        verifiedEmailCount: 0,
        invalidEmailCount: 0,
        scheduledTodayCount: 0,
        rolledOverCount: 0,
        rolloverScheduleByDate: {},
        channelAssignments: {
          addedToEmailList: 0,
          addedToWhatsAppList: 0,
          addedToLinkedInList: 0,
          addedToInstagramList: 0,
          addedToCustomList: 0,
        },
      };
    }

    const { customListId, autoSend = true, scheduledStartTime } = options;

    // 1. Channel List Auto-Assignment
    const channelAssignments = await channelListAutoAssignmentService.autoAssignLeads(
      leads.map((l) => ({
        id: l.id,
        email: l.email,
        phone: l.phone,
        whatsapp: l.whatsapp,
        linkedin: l.linkedin,
        instagram: l.instagram,
        facebook: l.facebook,
      })),
      customListId
    );

    // 2. Email Verification & Lead Filtering
    const emailLeads = leads.filter((l) => (l.email || '').trim().includes('@'));
    let verifiedEmailCount = 0;
    let invalidEmailCount = 0;
    const verifiedLeads: Array<{
      id: string;
      businessName: string;
      category: string;
      email: string;
    }> = [];

    for (const lead of emailLeads) {
      const rawEmail = (lead.email || '').trim();
      const valResult = await emailValidatorService.verifyEmail(rawEmail);

      if (valResult.isValid) {
        verifiedEmailCount++;
        verifiedLeads.push({
          id: lead.id,
          businessName: (lead.businessName || lead.business_name || 'Business').trim(),
          category: (lead.category || 'General Business').trim(),
          email: valResult.normalizedEmail,
        });

        await query(
          `UPDATE leads 
           SET email_verified = true, 
               email_verification_status = 'verified', 
               updated_at = NOW() 
           WHERE id = $1`,
          [lead.id]
        );
      } else {
        invalidEmailCount++;
        await emailValidatorService.flagAndMoveLeadToInvalidList(
          lead.id,
          rawEmail,
          valResult.reason || 'Invalid email',
          valResult.status
        );
      }
    }

    if (!autoSend || verifiedLeads.length === 0) {
      return {
        totalImported: leads.length,
        hasEmailCount: emailLeads.length,
        verifiedEmailCount,
        invalidEmailCount,
        scheduledTodayCount: 0,
        rolledOverCount: 0,
        rolloverScheduleByDate: {},
        channelAssignments,
      };
    }

    // 3. Daily Capacity & Schedule Calculation (Strict 200/day limit with next-day rollover)
    // Query emails already sent today
    const sentRes = await query<{ sent_count: number }>(
      `SELECT COALESCE(sent_count, 0) as sent_count 
       FROM daily_send_metrics 
       WHERE metric_date = CURRENT_DATE AND channel = 'email'`
    );
    const sentToday = sentRes.rows.length > 0 ? Number(sentRes.rows[0].sent_count) : 0;

    // Query emails already scheduled for today
    const schedTodayRes = await query<{ count: string }>(
      `SELECT COUNT(*)::int as count 
       FROM scheduled_dispatches 
       WHERE channel = 'email' 
         AND status IN ('scheduled', 'processing') 
         AND scheduled_for >= CURRENT_DATE 
         AND scheduled_for < CURRENT_DATE + INTERVAL '1 day'`
    );
    const scheduledAlreadyToday = Number(schedTodayRes.rows[0]?.count || 0);

    const totalUsedToday = sentToday + scheduledAlreadyToday;
    let remainingCapacityToday = Math.max(0, this.DAILY_EMAIL_LIMIT - totalUsedToday);

    // Latest scheduled time today (to sequence nicely after existing queue)
    const latestSchedRes = await query<{ max_time: string }>(
      `SELECT MAX(scheduled_for) as max_time 
       FROM scheduled_dispatches 
       WHERE channel = 'email' 
         AND status = 'scheduled' 
         AND scheduled_for >= CURRENT_DATE 
         AND scheduled_for < CURRENT_DATE + INTERVAL '1 day'`
    );

    // Calculate intelligent scheduling starting pointer:
    // Dispatches are properly SCHEDULED (not blasted instantly).
    // During business hours (9:00 AM - 5:00 PM), schedule with a minimum 20-min forward buffer.
    // Outside business hours, schedule for 9:15 AM next business morning (or today if early morning before 9 AM).
    const initialPointer = this.getInitialScheduledPointer(scheduledStartTime);
    let currentTodayPointer = new Date(initialPointer);

    // If existing scheduled dispatches run past our initial pointer, sequence after them
    if (latestSchedRes.rows[0]?.max_time) {
      const maxExisting = new Date(latestSchedRes.rows[0].max_time);
      if (maxExisting.getTime() > currentTodayPointer.getTime()) {
        currentTodayPointer = maxExisting;
      }
    }

    let scheduledTodayCount = 0;
    let rolledOverCount = 0;
    const rolloverScheduleByDate: Record<string, number> = {};

    // Track rollover day pointers (Day 1 = tomorrow, Day 2 = day after tomorrow, etc.)
    let currentRolloverDayOffset = 1;
    let rolloverCapacityThisDay = this.DAILY_EMAIL_LIMIT;
    let rolloverPointer = this.getStartOfRolloverDay(currentRolloverDayOffset);

    // 4. Sequence each verified lead
    for (const vLead of verifiedLeads) {
      let sendTime: Date;

      if (remainingCapacityToday > 0) {
        // Schedule for TODAY with 25-35s natural anti-ban pacing jitter
        const pacingMs = (25 + Math.floor(Math.random() * 10)) * 1000;
        currentTodayPointer = new Date(currentTodayPointer.getTime() + pacingMs);
        sendTime = new Date(currentTodayPointer);

        remainingCapacityToday--;
        scheduledTodayCount++;
      } else {
        // Daily limit reached! Roll over to Next Day (or subsequent days)
        if (rolloverCapacityThisDay <= 0) {
          currentRolloverDayOffset++;
          rolloverCapacityThisDay = this.DAILY_EMAIL_LIMIT;
          rolloverPointer = this.getStartOfRolloverDay(currentRolloverDayOffset);
        }

        const pacingMs = (25 + Math.floor(Math.random() * 10)) * 1000;
        rolloverPointer = new Date(rolloverPointer.getTime() + pacingMs);
        sendTime = new Date(rolloverPointer);

        rolloverCapacityThisDay--;
        rolledOverCount++;

        const dateKey = sendTime.toISOString().split('T')[0];
        rolloverScheduleByDate[dateKey] = (rolloverScheduleByDate[dateKey] || 0) + 1;
      }

      // Generate authentic, human-written copy (Message 1 / Initial shoot)
      const copy = humanCopywriterService.getEmailCopy(
        {
          id: vLead.id,
          businessName: vLead.businessName,
          category: vLead.category,
        },
        'initial'
      );

      // Insert scheduled dispatch into database
      await query(
        `INSERT INTO scheduled_dispatches (
          entity_type, lead_id, channel, recipient_email, recipient_name,
          subject, body, stage, style, status, scheduled_for, created_at, updated_at
        ) VALUES (
          'lead', $1, 'email', $2, $3, $4, $5, 'initial', 'conversational', 'scheduled', $6, NOW(), NOW()
        )`,
        [vLead.id, vLead.email, vLead.businessName, copy.subject, copy.body, sendTime]
      );
    }

    console.log(
      `[AutomatedIntakeEngine] Intake processed: ${verifiedLeads.length} verified leads -> ${scheduledTodayCount} scheduled starting at ${currentTodayPointer.toISOString()}, ${rolledOverCount} rolled over adhering to ${this.DAILY_EMAIL_LIMIT}/day limit.`
    );

    return {
      totalImported: leads.length,
      hasEmailCount: emailLeads.length,
      verifiedEmailCount,
      invalidEmailCount,
      scheduledTodayCount,
      rolledOverCount,
      rolloverScheduleByDate,
      channelAssignments,
    };
  }

  /**
   * Calculates a sensible starting schedule time for new dispatches.
   * If a custom scheduledStartTime is provided, use that.
   * Otherwise:
   * - If between 9:00 AM and 5:00 PM local business hours: schedule starting 20 minutes from now (with pacing)
   * - If before 9:00 AM: schedule starting today at 9:15 AM
   * - If after 5:00 PM: schedule starting tomorrow at 9:15 AM
   */
  private getInitialScheduledPointer(scheduledStartTime?: Date | string): Date {
    if (scheduledStartTime) {
      const parsed = new Date(scheduledStartTime);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        return parsed;
      }
    }

    const now = new Date();
    const currentHour = now.getHours();

    // If before 9:00 AM, start at 9:15 AM today
    if (currentHour < 9) {
      const start = new Date(now);
      start.setHours(9, 15, 0, 0);
      return start;
    }

    // If after 5:00 PM (17:00), start at 9:15 AM next business morning
    if (currentHour >= 17) {
      return this.getStartOfRolloverDay(1);
    }

    // During active business hours (9 AM - 5 PM):
    // Schedule with a minimum 20-minute forward buffer so the user can review, edit or cancel
    return new Date(now.getTime() + 20 * 60 * 1000);
  }

  /**
   * Calculates the starting timestamp for a rollover day (9:15 AM local time)
   */
  private getStartOfRolloverDay(dayOffset: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    // If rollover lands on Saturday (6), advance to Monday (+2 days)
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    // If rollover lands on Sunday (0), advance to Monday (+1 day)
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    d.setHours(9, 15, 0, 0); // 9:15 AM
    return d;
  }
}

export const automatedIntakeEngine = new AutomatedIntakeEngine();
