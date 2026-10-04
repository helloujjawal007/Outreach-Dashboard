import { query } from '../config/db';
import { stageOutreachService } from './stageOutreachService';
import { inboxRotationService } from './inboxRotationService';

export interface DripEngineSettings {
  enabled: boolean;
  daily_limit: number;
  batch_size: number;
  cycle_interval_seconds: number;
  followup_1_delay_days: number;
  followup_2_delay_days: number;
  followup_3_delay_days?: number;
  pacing_delay_min_seconds: number;
  pacing_delay_max_seconds: number;
  preferred_channel: 'email' | 'all';
  working_hours_only: boolean;
}

export interface AutopilotStatus {
  dripEngine: {
    enabled: boolean;
    isRunning: boolean;
    sentToday: number;
    dailyLimit: number;
    remainingCapacityToday: number;
    activeInboxesCount: number;
    leadsDueTotal: number;
    initialDueCount: number;
    followup1DueCount: number;
    followup2DueCount: number;
    followup3DueCount: number;
    lastCycleRunAt: string | null;
    nextCycleScheduledAt: string | null;
  };
  inboundAgent: {
    enabled: boolean;
    autoConvertHotLeads: boolean;
    autoDraftReplies: boolean;
    autoSendReplies: boolean;
  };
  enrichmentEngine: {
    autoDiscoverEmails: boolean;
    autoResolveLocations: boolean;
  };
}

export class AutonomousDripEngine {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private lastRunAt: Date | null = null;

  /**
   * Helper sleep for anti-spam pacing jitter
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retrieves active drip engine configuration
   */
  async getSettings(): Promise<DripEngineSettings> {
    try {
      const res = await query<{ value: DripEngineSettings }>(
        `SELECT value FROM autopilot_settings WHERE key = 'drip_engine'`
      );
      if (res.rows.length > 0) {
        return {
          ...res.rows[0].value,
          daily_limit: res.rows[0].value.daily_limit || 200,
          followup_1_delay_days: res.rows[0].value.followup_1_delay_days || 2.5,
          followup_2_delay_days: res.rows[0].value.followup_2_delay_days || 5.5,
          followup_3_delay_days: res.rows[0].value.followup_3_delay_days || 10.0,
        };
      }
    } catch (err) {
      console.error('[AutonomousDripEngine] Failed to load settings:', err);
    }

    return {
      enabled: true,
      daily_limit: 200,
      batch_size: 5,
      cycle_interval_seconds: 30,
      followup_1_delay_days: 2.5,
      followup_2_delay_days: 5.5,
      followup_3_delay_days: 10.0,
      pacing_delay_min_seconds: 3,
      pacing_delay_max_seconds: 7,
      preferred_channel: 'email',
      working_hours_only: false,
    };
  }

  /**
   * Updates autopilot settings
   */
  async updateSettings(partial: Partial<DripEngineSettings>): Promise<DripEngineSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await query(
      `UPDATE autopilot_settings SET value = $1, updated_at = NOW() WHERE key = 'drip_engine'`,
      [JSON.stringify(updated)]
    );
    return updated;
  }

  /**
   * Counts leads currently due across all 4 drip stages (Day 0, Day 2.5, Day 5.5, Day 10)
   */
  async getLeadsDueCounts(settings: DripEngineSettings): Promise<{
    initialDue: number;
    followup1Due: number;
    followup2Due: number;
    followup3Due: number;
    totalDue: number;
  }> {
    const res = await query<{
      initial_due: string;
      followup1_due: string;
      followup2_due: string;
      followup3_due: string;
    }>(
      `SELECT
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL
            AND status = 'active'
            AND consent_status = 'none'
            AND last_contacted_at IS NULL
            AND (outreach_stage IS NULL OR outreach_stage = 'initial')
            AND ((email IS NOT NULL AND email LIKE '%@%') OR (phone IS NOT NULL AND TRIM(phone) != '') OR (website IS NOT NULL AND TRIM(website) != ''))
        ) AS initial_due,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL
            AND status = 'active'
            AND consent_status = 'none'
            AND outreach_stage = 'followup_1'
            AND (
              (first_contacted_at IS NOT NULL AND first_contacted_at <= NOW() - INTERVAL '60 hours')
              OR last_contacted_at <= NOW() - INTERVAL '60 hours'
            )
            AND last_contacted_at <= NOW() - INTERVAL '48 hours'
            AND ((email IS NOT NULL AND email LIKE '%@%') OR (phone IS NOT NULL AND TRIM(phone) != '') OR (website IS NOT NULL AND TRIM(website) != ''))
        ) AS followup1_due,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL
            AND status = 'active'
            AND consent_status = 'none'
            AND outreach_stage = 'followup_2'
            AND (
              (first_contacted_at IS NOT NULL AND first_contacted_at <= NOW() - INTERVAL '132 hours')
              OR last_contacted_at <= NOW() - INTERVAL '72 hours'
            )
            AND ((email IS NOT NULL AND email LIKE '%@%') OR (phone IS NOT NULL AND TRIM(phone) != '') OR (website IS NOT NULL AND TRIM(website) != ''))
        ) AS followup2_due,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL
            AND status = 'active'
            AND consent_status = 'none'
            AND outreach_stage = 'followup_3'
            AND (
              (first_contacted_at IS NOT NULL AND first_contacted_at <= NOW() - INTERVAL '240 hours')
              OR last_contacted_at <= NOW() - INTERVAL '108 hours'
            )
            AND ((email IS NOT NULL AND email LIKE '%@%') OR (phone IS NOT NULL AND TRIM(phone) != '') OR (website IS NOT NULL AND TRIM(website) != ''))
        ) AS followup3_due
       FROM leads`
    );

    const row = res.rows[0];
    const initialDue = parseInt(row?.initial_due || '0', 10);
    const followup1Due = parseInt(row?.followup1_due || '0', 10);
    const followup2Due = parseInt(row?.followup2_due || '0', 10);
    const followup3Due = parseInt(row?.followup3_due || '0', 10);

    return {
      initialDue,
      followup1Due,
      followup2Due,
      followup3Due,
      totalDue: initialDue + followup1Due + followup2Due + followup3Due,
    };
  }

  /**
   * Retrieves full real-time Autopilot status summary for UI dashboards
   */
  async getFullStatus(): Promise<AutopilotStatus> {
    const settings = await this.getSettings();
    const poolSummary = await inboxRotationService.getPoolSummary().catch(() => null);
    const dueCounts = await this.getLeadsDueCounts(settings);

    // Today's total dispatches sent across email
    const metricRes = await query<{ sent_count: number }>(
      `SELECT sent_count FROM daily_send_metrics WHERE metric_date = CURRENT_DATE AND channel = 'email'`
    );
    const sentToday = metricRes.rows.length > 0 ? Number(metricRes.rows[0].sent_count) : 0;
    const dailyLimit = poolSummary && poolSummary.totalDailyCapacity > 0 ? poolSummary.totalDailyCapacity : settings.daily_limit;
    const remainingCapacity = Math.max(0, dailyLimit - sentToday);

    // Inbound agent settings
    const inboundRes = await query<{ value: any }>(
      `SELECT value FROM autopilot_settings WHERE key = 'inbound_agent'`
    );
    const inboundVal = inboundRes.rows[0]?.value || {
      enabled: true,
      auto_convert_hot_leads: true,
      auto_draft_replies: true,
      auto_send_replies: false,
    };

    // Enrichment settings
    const enrichRes = await query<{ value: any }>(
      `SELECT value FROM autopilot_settings WHERE key = 'enrichment_engine'`
    );
    const enrichVal = enrichRes.rows[0]?.value || {
      auto_discover_emails: true,
      auto_resolve_locations: true,
    };

    const nextCycleAt = new Date(Date.now() + (settings.cycle_interval_seconds || 30) * 1000);

    return {
      dripEngine: {
        enabled: settings.enabled,
        isRunning: this.isProcessing,
        sentToday,
        dailyLimit,
        remainingCapacityToday: remainingCapacity,
        activeInboxesCount: poolSummary?.activeInboxes || 1,
        leadsDueTotal: dueCounts.totalDue,
        initialDueCount: dueCounts.initialDue,
        followup1DueCount: dueCounts.followup1Due,
        followup2DueCount: dueCounts.followup2Due,
        followup3DueCount: dueCounts.followup3Due,
        lastCycleRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
        nextCycleScheduledAt: settings.enabled ? nextCycleAt.toISOString() : null,
      },
      inboundAgent: {
        enabled: inboundVal.enabled,
        autoConvertHotLeads: inboundVal.auto_convert_hot_leads,
        autoDraftReplies: inboundVal.auto_draft_replies,
        autoSendReplies: inboundVal.auto_send_replies,
      },
      enrichmentEngine: {
        autoDiscoverEmails: enrichVal.auto_discover_emails,
        autoResolveLocations: enrichVal.auto_resolve_locations,
      },
    };
  }

  /**
   * Executes a single autonomous drip cycle
   */
  async runDripCycle(): Promise<{
    dispatchedCount: number;
    skippedCount: number;
    results: any[];
  }> {
    if (this.isProcessing) {
      console.log('[AutonomousDripEngine] Drip cycle already in progress, skipping tick.');
      return { dispatchedCount: 0, skippedCount: 0, results: [] };
    }

    const settings = await this.getSettings();
    if (!settings.enabled) {
      return { dispatchedCount: 0, skippedCount: 0, results: [] };
    }

    this.isProcessing = true;
    this.lastRunAt = new Date();

    const cycleResults: any[] = [];
    let dispatchedCount = 0;
    let skippedCount = 0;

    try {
      // 1. Check capacity & throttling (Strict 200/day default limit)
      const poolSummary = await inboxRotationService.getPoolSummary().catch(() => null);
      const metricRes = await query<{ sent_count: number }>(
        `SELECT sent_count FROM daily_send_metrics WHERE metric_date = CURRENT_DATE AND channel = 'email'`
      );
      const sentToday = metricRes.rows.length > 0 ? Number(metricRes.rows[0].sent_count) : 0;
      const dailyCap = poolSummary && poolSummary.totalDailyCapacity > 0 ? poolSummary.totalDailyCapacity : (settings.daily_limit || 200);

      if (sentToday >= dailyCap) {
        console.log(`[AutonomousDripEngine] Daily sending capacity reached (${sentToday}/${dailyCap}). Resting until tomorrow.`);
        return { dispatchedCount: 0, skippedCount: 0, results: [] };
      }

      const batchLimit = Math.min(settings.batch_size || 5, dailyCap - sentToday);
      if (batchLimit <= 0) {
        return { dispatchedCount: 0, skippedCount: 0, results: [] };
      }

      // 2. Select prioritized leads:
      // Priority 1: Followup 3 (Day 10 final message)
      // Priority 2: Followup 2 (Day 5.5 check-in)
      // Priority 3: Followup 1 (Day 2.5 check-in, strictly >= 48 hours delay)
      // Priority 4: Initial touches (Day 0)
      const candidateLeads = await query<{ id: string; business_name: string; outreach_stage: string }>(
        `SELECT id, business_name, outreach_stage
         FROM leads
         WHERE deleted_at IS NULL
           AND status = 'active'
           AND consent_status = 'none'
           AND (
             -- Followup 3 Due (10 days from first shoot or 108 hours after followup 2)
             (outreach_stage = 'followup_3' AND (
               (first_contacted_at IS NOT NULL AND first_contacted_at <= NOW() - INTERVAL '240 hours')
               OR last_contacted_at <= NOW() - INTERVAL '108 hours'
             ))
             OR
             -- Followup 2 Due (5.5 days from first shoot or 72 hours after followup 1)
             (outreach_stage = 'followup_2' AND (
               (first_contacted_at IS NOT NULL AND first_contacted_at <= NOW() - INTERVAL '132 hours')
               OR last_contacted_at <= NOW() - INTERVAL '72 hours'
             ))
             OR
             -- Followup 1 Due (2.5 days from first shoot, strictly >= 48 hours delay)
             (outreach_stage = 'followup_1' AND (
               (first_contacted_at IS NOT NULL AND first_contacted_at <= NOW() - INTERVAL '60 hours')
               OR last_contacted_at <= NOW() - INTERVAL '60 hours'
             ) AND last_contacted_at <= NOW() - INTERVAL '48 hours')
             OR
             -- Initial Touch Due
             (last_contacted_at IS NULL AND (outreach_stage IS NULL OR outreach_stage = 'initial'))
           )
           AND (
             (email IS NOT NULL AND email LIKE '%@%')
             OR (phone IS NOT NULL AND TRIM(phone) != '')
             OR (website IS NOT NULL AND TRIM(website) != '')
           )
         ORDER BY 
           CASE 
             WHEN outreach_stage = 'followup_3' THEN 1
             WHEN outreach_stage = 'followup_2' THEN 2
             WHEN outreach_stage = 'followup_1' THEN 3
             ELSE 4
           END ASC,
           created_at ASC
         LIMIT $1`,
        [batchLimit]
      );

      if (candidateLeads.rows.length === 0) {
        return { dispatchedCount: 0, skippedCount: 0, results: [] };
      }

      console.log(`[AutonomousDripEngine] ⚡ Executing autonomous drip cycle for ${candidateLeads.rows.length} due leads...`);

      for (const candidate of candidateLeads.rows) {
        try {
          const dispatchRes = await stageOutreachService.sendNextStageToLead(candidate.id);
          cycleResults.push(dispatchRes);

          if (dispatchRes.success && !dispatchRes.skipped) {
            dispatchedCount++;
            console.log(
              `[AutonomousDripEngine] ✅ Auto-dispatched [${dispatchRes.stage}] to "${candidate.business_name}" via [${dispatchRes.channelsDispatched?.join(', ')}]`
            );

            // Natural anti-ban pacing jitter
            const minSec = settings.pacing_delay_min_seconds || 3;
            const maxSec = settings.pacing_delay_max_seconds || 7;
            const jitterMs = (minSec + Math.random() * (maxSec - minSec)) * 1000;
            await this.sleep(jitterMs);
          } else {
            skippedCount++;
          }
        } catch (leadErr) {
          console.error(`[AutonomousDripEngine] Error dispatching to lead ${candidate.id}:`, leadErr);
          skippedCount++;
        }
      }
    } catch (cycleErr) {
      console.error('[AutonomousDripEngine] Drip cycle exception:', cycleErr);
    } finally {
      this.isProcessing = false;
    }

    return { dispatchedCount, skippedCount, results: cycleResults };
  }

  /**
   * Starts recurring 24/7 background scheduler loop
   */
  startScheduler(intervalMs: number = 30000): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log(`[AutonomousDripEngine] 🚀 24/7 Continuous Drip Outreach Engine active (interval: ${intervalMs / 1000}s).`);

    // Initial check after 5 seconds to let server finish booting
    setTimeout(() => {
      this.runDripCycle().catch(console.error);
    }, 5000);

    this.timer = setInterval(() => {
      this.runDripCycle().catch(console.error);
    }, intervalMs);
  }

  /**
   * Stops scheduler loop
   */
  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const autonomousDripEngine = new AutonomousDripEngine();
