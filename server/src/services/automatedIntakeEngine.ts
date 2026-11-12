import { query } from '../config/db';
import { emailValidatorService } from './emailValidatorService';
import { humanCopywriterService } from './humanCopywriterService';
import { channelListAutoAssignmentService, type ChannelAssignmentSummary } from './channelListAutoAssignmentService';
import { workflowRoutingService } from './workflowRoutingService';
import { formatDuration, logPipeline } from '../utils/pipelineLogger';

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
   * 1. Auto-assigns leads to standard channel lists (Email, WhatsApp, Website)
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
      website?: string;
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
          addedToWebsiteList: 0,
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
        website: l.website,
      })),
      customListId
    );

    // 2. Email Verification & Lead Filtering (bounded concurrency of 5)
    const emailLeads = leads.filter((l) => (l.email || '').trim().includes('@'));
    let verifiedEmailCount = 0;
    let invalidEmailCount = 0;
    const verifiedLeads: Array<{
      id: string;
      businessName: string;
      category: string;
      email: string;
    }> = [];

    for (let idx = 0; idx < emailLeads.length; idx += 5) {
      const chunk = emailLeads.slice(idx, idx + 5);
      await Promise.all(
        chunk.map(async (lead) => {
          const rawEmail = (lead.email || '').trim();
          const valResult = await emailValidatorService.verifyEmail(rawEmail);

          if (valResult.isValid) {
            verifiedEmailCount++;

            await query(
              `UPDATE leads 
               SET email_verified = true, 
                   email_verification_status = 'verified', 
                   updated_at = NOW() 
               WHERE id = $1`,
              [lead.id]
            );

            // State Locking & Trigger Gate (Checklist Items 1 & 2):
            // Workflow A leads (with website) must wait for TA audit callback and PDF report before scheduling!
            const hasWebsite = workflowRoutingService.hasValidWebsite(lead.website);
            const isWorkflowA = lead.outreach_workflow === 'workflow_a' || lead.status === 'pending_audit' || hasWebsite;

            if (isWorkflowA && lead.audit_status !== 'audit_completed') {
              console.log(
                `[AutomatedIntakeEngine] Lead "${lead.businessName || lead.business_name || lead.id}" routed to Workflow A (State locked: PENDING_AUDIT). Email dispatch will trigger upon TA audit callback.`
              );
              return;
            }

            verifiedLeads.push({
              id: lead.id,
              businessName: (lead.businessName || lead.business_name || 'Business').trim(),
              category: (lead.category || 'General Business').trim(),
              email: valResult.normalizedEmail,
            });
          } else {
            invalidEmailCount++;
            await emailValidatorService.flagAndMoveLeadToInvalidList(
              lead.id,
              rawEmail,
              valResult.reason || 'Invalid email',
              valResult.status
            );
          }
        })
      );
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

    // Query future already-scheduled dispatches per local date to avoid double-booking rollover days
    const futureSchedRes = await query<{ sched_date: string; cnt: number }>(
      `SELECT TO_CHAR(scheduled_for, 'YYYY-MM-DD') as sched_date, COUNT(*)::int as cnt
       FROM scheduled_dispatches
       WHERE channel = 'email'
         AND status IN ('scheduled', 'processing')
         AND scheduled_for >= CURRENT_DATE + INTERVAL '1 day'
       GROUP BY 1`
    );
    const futureDayBooked = new Map<string, number>();
    for (const row of futureSchedRes.rows) {
      futureDayBooked.set(row.sched_date, row.cnt);
    }

    const toLocalDateKey = (dt: Date): string => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // Track rollover day pointers starting from the next business morning
    let rolloverPointer = this.getStartOfRolloverDay(1);
    const getRolloverRemaining = (dt: Date): number => {
      const key = toLocalDateKey(dt);
      const alreadyBooked = futureDayBooked.get(key) || 0;
      return Math.max(0, this.DAILY_EMAIL_LIMIT - alreadyBooked);
    };
    while (getRolloverRemaining(rolloverPointer) <= 0) {
      rolloverPointer = this.getNextBusinessMorning(rolloverPointer);
    }
    let rolloverCapacityThisDay = getRolloverRemaining(rolloverPointer);

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
        // Daily limit reached! Roll over to Next Business Day with remaining capacity
        while (rolloverCapacityThisDay <= 0) {
          rolloverPointer = this.getNextBusinessMorning(rolloverPointer);
          rolloverCapacityThisDay = getRolloverRemaining(rolloverPointer);
        }

        const pacingMs = (25 + Math.floor(Math.random() * 10)) * 1000;
        rolloverPointer = new Date(rolloverPointer.getTime() + pacingMs);
        sendTime = new Date(rolloverPointer);

        rolloverCapacityThisDay--;
        rolledOverCount++;

        const dateKey = toLocalDateKey(sendTime);
        futureDayBooked.set(dateKey, (futureDayBooked.get(dateKey) || 0) + 1);
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

      const waitSecs = Math.max(0, Math.round((sendTime.getTime() - Date.now()) / 1000));
      logPipeline(
        'DRAFTED_EMAIL',
        `Drafted & scheduled initial email for "${vLead.businessName}" (${vLead.email}) | Subject: "${copy.subject}" | Starts in ${formatDuration(waitSecs)}`
      );
    }

    const batchWaitSecs = Math.max(0, Math.round((initialPointer.getTime() - Date.now()) / 1000));
    logPipeline(
      'SCHEDULED_EMAIL',
      `Scheduled ${scheduledTodayCount} email(s) for today (${rolledOverCount} rolled over) — Email will start in ${formatDuration(batchWaitSecs)}`
    );

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
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(9, 15, 0, 0); // 9:15 AM
    return d;
  }

  private getNextBusinessMorning(fromDate: Date): Date {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(9, 15, 0, 0);
    return d;
  }
}

export const automatedIntakeEngine = new AutomatedIntakeEngine();
