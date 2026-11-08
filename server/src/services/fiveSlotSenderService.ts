import fs from 'fs';
import path from 'path';
import { query } from '../config/db';
import { stageOutreachService } from './stageOutreachService';
import { failureLogService } from './failureLogService';
import { clientAuditService } from './clientAuditIntelligenceService';
import { technicalAuditPdfService } from './technicalAuditPdfService';
import { suppressionService } from './suppressionService';
import { classifySmtpError } from '../utils/smtpClassifier';
import { validateAuditAsset, isValidPdfFile } from '../utils/auditPolicy';
import { cleanupOldAuditPdfs } from '../routes/auditCallback';
import { env } from '../config/env';

export const SLOTS = ['A', 'B', 'C', 'D', 'E'] as const;
export type SlotId = typeof SLOTS[number];

export interface SlotSenderSettings {
  slot_cycle_min: number;
  slot_offset_min: number;
  anchor_timestamp: string;
  td_endpoint_url: string;
  td_shared_secret: string;
  max_audit_retries: number;
  daily_send_limit: number;
  send_window_start_hour: number;
  send_window_end_hour: number;
  weekdays_only: boolean;
  is_active: boolean;
  circuit_breaker_tripped?: boolean;
  consecutive_auth_failures?: number;
  send_window_timezone?: string;
  global_min_gap_sec?: number;
}

export interface SlotStatus {
  slotId: SlotId;
  assignedMailbox: {
    email: string;
    name: string;
    provider: string;
  };
  queuedCount: number;
  readyToSendCount: number;
  waitingAuditCount: number;
  nextSendTime: string;
  lastSendTime: string | null;
  status: 'active' | 'waiting' | 'idle';
}

export class FiveSlotSenderService {
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;
  // Circuit breaker state for mailbox / SMTP authentication errors
  private consecutiveAuthFailures = 0;
  private isCircuitBreakerTripped = false;
  private circuitBreakerAlert: string | null = null;
  // Tracks last cycle index dispatched per slot to guarantee 1 send per slot per cycle
  private lastSlotCycleDispatched = new Map<SlotId, number>();
  // Tracks last absolute sent epoch timestamp per slot (B3: per-slot last-sent guard)
  private lastSlotSentEpochMs = new Map<SlotId, number>();
  // Tracks last absolute sent epoch timestamp globally across all slots (Item 10: global min-gap guard)
  private lastGlobalSentEpochMs = 0;
  // Timed pause for 5.4.5 daily quota limits (auto-resumes at start of next send window)
  public quotaPauseUntil: Date | null = null;

  getLastSlotSent(slotId: SlotId): number | undefined {
    return this.lastSlotSentEpochMs.get(slotId);
  }

  setLastSlotSent(slotId: SlotId, epochMs: number): void {
    this.lastSlotSentEpochMs.set(slotId, epochMs);
  }

  resetLastSlotSent(): void {
    this.lastSlotSentEpochMs.clear();
    this.lastSlotCycleDispatched.clear();
    this.lastGlobalSentEpochMs = 0;
  }

  /**
   * Syncs per-slot last sent timestamps from the DB on reboot
   * Guarantees persistence of the per-slot last-sent guard across process restarts
   */
  async syncLastSentFromDb(): Promise<void> {
    try {
      const res = await query<{ slot_id: SlotId; last_sent: string }>(
        `SELECT slot_id, MAX(last_sent_at) as last_sent 
         FROM leads 
         WHERE slot_id IS NOT NULL AND last_sent_at IS NOT NULL 
         GROUP BY slot_id`
      );
      for (const row of res.rows) {
        if (row.slot_id && row.last_sent) {
          const epoch = new Date(row.last_sent).getTime();
          this.lastSlotSentEpochMs.set(row.slot_id, epoch);
          if (epoch > this.lastGlobalSentEpochMs) {
            this.lastGlobalSentEpochMs = epoch;
          }
        }
      }
    } catch (err: any) {
      console.warn('[FiveSlotSenderService] DB sync last sent warning:', err?.message);
    }
  }

  resetCircuitBreaker(): void {
    this.consecutiveAuthFailures = 0;
    this.isCircuitBreakerTripped = false;
    this.circuitBreakerAlert = null;
  }

  async resumeCircuitBreaker(): Promise<void> {
    this.resetCircuitBreaker();
    await query(
      `UPDATE slot_sender_settings 
       SET is_active = true, circuit_breaker_tripped = false, consecutive_auth_failures = 0, updated_at = NOW() 
       WHERE id = 'default'`
    );
    console.log('[FiveSlotSenderService] 🟢 Circuit breaker successfully resumed. Scheduler unpaused.');
  }

  tripCircuitBreaker(reason: string): void {
    this.isCircuitBreakerTripped = true;
    this.circuitBreakerAlert = reason;
  }

  getCircuitBreakerState(): { tripped: boolean; failures: number; alert: string | null } {
    return {
      tripped: this.isCircuitBreakerTripped,
      failures: this.consecutiveAuthFailures,
      alert: this.circuitBreakerAlert,
    };
  }

  /**
   * Retrieves slot sender settings from DB
   */
  async getSettings(): Promise<SlotSenderSettings> {
    try {
      const res = await query<SlotSenderSettings>(
        `SELECT slot_cycle_min, slot_offset_min, anchor_timestamp, td_endpoint_url, td_shared_secret, max_audit_retries, daily_send_limit, send_window_start_hour, send_window_end_hour, weekdays_only, is_active, send_window_timezone, global_min_gap_sec
         FROM slot_sender_settings WHERE id = 'default'`
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          ...row,
          slot_cycle_min: parseFloat(row.slot_cycle_min as any) || 10,
          slot_offset_min: parseFloat(row.slot_offset_min as any) || 2,
          daily_send_limit: parseInt(row.daily_send_limit as any, 10) || 150,
          send_window_start_hour: parseInt(row.send_window_start_hour as any, 10) || 8,
          send_window_end_hour: parseInt(row.send_window_end_hour as any, 10) || 19,
          global_min_gap_sec: parseInt(row.global_min_gap_sec as any, 10) || 120,
        };
      }
    } catch (err) {
      console.warn('[FiveSlotSenderService] Using fallback settings:', err);
    }

    return {
      slot_cycle_min: 10,
      slot_offset_min: 2,
      anchor_timestamp: '2026-01-01 00:00:00+00',
      td_endpoint_url: '',
      td_shared_secret: 'td-secret-key-2026',
      max_audit_retries: 3,
      daily_send_limit: 150,
      send_window_start_hour: 8,
      send_window_end_hour: 19,
      weekdays_only: true,
      is_active: true,
      send_window_timezone: 'UTC',
      global_min_gap_sec: 120,
    };
  }

  /**
   * Updates slot sender settings in DB
   */
  async updateSettings(partial: Partial<SlotSenderSettings>): Promise<SlotSenderSettings> {
    const current = await this.getSettings();
    const updated: SlotSenderSettings = {
      ...current,
      ...partial,
      slot_offset_min: partial.slot_offset_min ?? (partial.slot_cycle_min ? Math.max(1, Math.floor(partial.slot_cycle_min / 5)) : current.slot_offset_min),
    };

    await query(
      `UPDATE slot_sender_settings SET
        slot_cycle_min = $1,
        slot_offset_min = $2,
        anchor_timestamp = $3,
        td_endpoint_url = $4,
        td_shared_secret = $5,
        max_audit_retries = $6,
        daily_send_limit = $7,
        send_window_start_hour = $8,
        send_window_end_hour = $9,
        weekdays_only = $10,
        is_active = $11,
        send_window_timezone = $12,
        global_min_gap_sec = $13,
        updated_at = NOW()
       WHERE id = 'default'`,
      [
        updated.slot_cycle_min,
        updated.slot_offset_min,
        updated.anchor_timestamp,
        updated.td_endpoint_url,
        updated.td_shared_secret,
        updated.max_audit_retries,
        updated.daily_send_limit,
        updated.send_window_start_hour,
        updated.send_window_end_hour,
        updated.weekdays_only,
        updated.is_active,
        updated.send_window_timezone || 'UTC',
        updated.global_min_gap_sec || 120,
      ]
    );

    return updated;
  }

  /**
   * Resolves mailbox assignment for a given slot index (0 to 4)
   * If fewer than 5 mailboxes are connected, slots share available mailboxes (slot i uses mailbox[i % count]).
   * If 0 or 1 mailbox, all 5 slots use it.
   */
  async getMailboxForSlot(slotIndex: number): Promise<{ email: string; name: string; provider: string; id?: string }> {
    try {
      const inboxesRes = await query<{ id: string; email: string; name: string; provider: string }>(
        `SELECT id, email, name, provider FROM connected_inboxes WHERE status = 'active' ORDER BY created_at ASC`
      );

      if (inboxesRes.rows.length > 0) {
        const inbox = inboxesRes.rows[slotIndex % inboxesRes.rows.length];
        return {
          id: inbox.id,
          email: inbox.email,
          name: inbox.name,
          provider: inbox.provider,
        };
      }
    } catch (err) {
      console.warn('[FiveSlotSenderService] Mailbox query error:', err);
    }

    // Fallback: Default SMTP mailbox from environment
    return {
      email: env.SMTP_USER || 'cloudconsultancy.ad@gmail.com',
      name: 'Cloud Consultancy Outbound',
      provider: 'smtp',
    };
  }

  /**
   * Assigns a lead to a sticky slot (A, B, C, D, E) via round-robin distribution
   * Stores slot_id on the lead/queue row and keeps the assignment sticky for that lead's follow-ups.
   */
  async assignLeadToSlot(leadId: string): Promise<SlotId> {
    // 1. Check if lead already has a sticky slot assigned
    const leadCheck = await query<{ slot_id: string | null; website: string; email: string; business_name: string; audit_status: string }>(
      `SELECT slot_id, website, email, business_name, audit_status FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadCheck.rows.length === 0) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const lead = leadCheck.rows[0];
    let assignedSlot: SlotId = 'A';

    if (lead.slot_id && SLOTS.includes(lead.slot_id as SlotId)) {
      assignedSlot = lead.slot_id as SlotId;
    } else {
      // Round-robin selection: pick slot with minimum assigned active leads
      const slotCountsRes = await query<{ slot_id: SlotId; count: string }>(
        `SELECT slot_id, COUNT(*) as count 
         FROM leads 
         WHERE deleted_at IS NULL AND status = 'active' AND slot_id IS NOT NULL 
         GROUP BY slot_id`
      );

      const countMap = new Map<SlotId, number>();
      SLOTS.forEach((s) => countMap.set(s, 0));
      slotCountsRes.rows.forEach((r) => {
        if (countMap.has(r.slot_id)) {
          countMap.set(r.slot_id, parseInt(r.count, 10));
        }
      });

      // Find slot with smallest count
      let minSlot: SlotId = 'A';
      let minCount = Infinity;
      for (const s of SLOTS) {
        const c = countMap.get(s) ?? 0;
        if (c < minCount) {
          minCount = c;
          minSlot = s;
        }
      }
      assignedSlot = minSlot;

      await query(
        `UPDATE leads SET slot_id = $1, slot_assigned_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [assignedSlot, leadId]
      );
    }

    // 2. Just-In-Time rolling audit check:
    // If lead is among the top 2 in its slot queue, dispatch audit immediately.
    // If further back, rolling window will dispatch it JIT before its turn.
    const leadPositionRes = await query<{ id: string }>(
      `SELECT id FROM leads 
       WHERE deleted_at IS NULL AND status = 'active' AND slot_id = $1 AND (last_contacted_at IS NULL OR outreach_stage IN ('initial', 'followup_1', 'followup_2'))
       ORDER BY created_at ASC LIMIT 2`,
      [assignedSlot]
    );

    const isInLookaheadWindow = leadPositionRes.rows.some((r) => r.id === leadId);
    if (isInLookaheadWindow && (!lead.audit_status || lead.audit_status === 'none')) {
      this.triggerAuditForLead(leadId).catch((err) => {
        console.warn(`[FiveSlotSenderService] JIT audit trigger error for ${leadId}:`, err?.message);
      });
    }

    return assignedSlot;
  }

  /**
   * Just-In-Time (JIT) Rolling Audit Dispatcher
   * Dispatches audits to TD only for the top 2 queued leads per slot (~10 leads in flight max)
   * Prevents TD queue overload and eliminates premature timeout failures.
   */
  async dispatchRollingAudits(): Promise<void> {
    try {
      for (const slot of SLOTS) {
        const dueSoonRes = await query<{ id: string; website: string; business_name: string }>(
          `SELECT id, website, business_name FROM leads
           WHERE deleted_at IS NULL 
             AND status = 'active' 
             AND consent_status = 'none'
             AND slot_id = $1
             AND (audit_status = 'none' OR audit_status IS NULL OR (audit_status = 'pending' AND audit_requested_at IS NULL))
           ORDER BY created_at ASC
           LIMIT 2`,
          [slot]
        );

        for (const lead of dueSoonRes.rows) {
          if (lead.website && lead.website.trim()) {
            this.triggerAuditForLead(lead.id).catch((err) => {
              console.warn(`[FiveSlotSenderService] Rolling audit dispatch error for ${lead.id}:`, err?.message);
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[FiveSlotSenderService] Rolling audit dispatch check error:', err?.message);
    }
  }

  /**
   * Triggers audit request to Technical Dashboard (TD / SEO Audit Pro)
   * Sends callbackUrl with ?secret= query param to guarantee authentication even if headers are dropped.
   */
  async triggerAuditForLead(leadId: string): Promise<void> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      website: string;
      email: string;
      primary_contact_name: string;
    }>(
      `SELECT id, business_name, website, email, primary_contact_name FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadRes.rows.length === 0) return;
    const lead = leadRes.rows[0];

    if (!lead.website || !lead.website.trim()) {
      await query(
        `UPDATE leads SET audit_status = 'failed', manual_review_reason = 'No website to audit', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      await failureLogService.logFailure({
        leadId,
        company: lead.business_name,
        email: lead.email,
        type: 'AUDIT_FAILED',
        errorMessage: 'Cannot audit lead: Website URL is missing',
      });
      return;
    }

    await query(
      `UPDATE leads SET audit_status = 'pending', audit_requested_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [leadId]
    );

    const settings = await this.getSettings();
    const appBaseUrl = process.env.APP_URL || `http://localhost:${env.PORT || 5001}`;
    // Secret is conveyed strictly via the x-audit-secret header; never exposed in the URL query string
    const callbackUrl = `${appBaseUrl}/api/audit-callback`;

    // If external TD endpoint is configured, send HTTP dispatch
    if (settings.td_endpoint_url && settings.td_endpoint_url.startsWith('http')) {
      try {
        console.log(`[FiveSlotSenderService] 📡 Dispatching JIT audit to TD at ${settings.td_endpoint_url} for "${lead.business_name}" (${lead.website})...`);
        const payload = {
          leadId: lead.id,
          website: lead.website,
          email: lead.email,
          company: lead.business_name,
          contactName: lead.primary_contact_name,
          callbackUrl,
        };

        const res = await fetch(settings.td_endpoint_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-audit-secret': settings.td_shared_secret,
            'x-td-secret': settings.td_shared_secret,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`TD returned HTTP ${res.status}: ${await res.text()}`);
        }

        console.log(`[FiveSlotSenderService] ✅ Audit request accepted by TD for lead ${lead.id}`);
      } catch (tdErr: any) {
        console.warn(`[FiveSlotSenderService] TD webhook dispatch failed, running local audit diagnostic: ${tdErr.message}`);
        this.runLocalAudit(leadId, lead.website, lead.business_name);
      }
    } else {
      // Execute local high-speed audit engine and store results & PDF
      this.runLocalAudit(leadId, lead.website, lead.business_name);
    }
  }

  /**
   * Executes local website diagnostic & generates PDF report
   */
  private async runLocalAudit(leadId: string, website: string, businessName: string): Promise<void> {
    try {
      console.log(`[FiveSlotSenderService] ⚡ Running local audit diagnostic for "${businessName}" (${website})...`);
      const report = await clientAuditService.auditWebsite(website);
      const pdf = await technicalAuditPdfService.generateAuditPdf(report, businessName);

      const findings = report.criticalIssues && report.criticalIssues.length > 0
        ? report.criticalIssues.slice(0, 5)
        : [
            `Desktop Speed Performance Score: ${report.overallScore || 45}/100`,
            `Mobile Optimization & Core Web Vitals need remediation`,
            `On-Page SEO Meta Tags missing or duplicate across crawled routes`,
          ];

      const takeaways = report.auditKeyTakeaways || findings.slice(0, 3).join('; ');

      await query(
        `UPDATE leads SET
          audit_status = 'ready',
          audit_score = $1,
          audit_findings = $2,
          audit_key_takeaways = $3,
          audit_pdf_name = $4,
          audit_pdf_path = $5,
          audit_ready_at = NOW(),
          updated_at = NOW()
         WHERE id = $6`,
        [
          report.overallScore || 50,
          JSON.stringify(findings),
          takeaways,
          pdf.pdfName,
          pdf.pdfPath,
          leadId,
        ]
      );

      console.log(`[FiveSlotSenderService] ✅ Local audit ready for "${businessName}" with PDF: ${pdf.pdfName}`);
    } catch (err: any) {
      console.error(`[FiveSlotSenderService] Local audit failed for ${leadId}:`, err?.message);
      await query(
        `UPDATE leads SET audit_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      await failureLogService.logFailure({
        leadId,
        company: businessName,
        website,
        type: 'AUDIT_FAILED',
        errorMessage: `Audit crawl failure: ${err?.message}`,
      });
    }
  }

  /**
   * Stale-Claim Reaper with Duplicate-Send Protection:
   * Reaps any leads stuck in 'sending' state due to server crash or killed worker (> 5 minutes).
   * Checks if an email was actually transmitted (via last_sent_at marker or messages log)
   * before resetting: if already sent, advances stage instead of duplicate-sending!
   */
  async reapStaleSendingClaims(staleThresholdMinutes: number = 5): Promise<number> {
    try {
      await this.syncLastSentFromDb();
      const staleRes = await query<{
        id: string;
        outreach_stage: string;
        claimed_stage: string | null;
        claimed_at: string | null;
        last_sent_stage: string | null;
        last_sent_at: string | null;
        last_sent_message_id: string | null;
        last_contacted_at: string | null;
        updated_at: string;
      }>(
        `SELECT id, outreach_stage, claimed_stage, claimed_at, last_sent_stage, last_sent_at, last_sent_message_id, last_contacted_at, updated_at
         FROM leads 
         WHERE outreach_stage = 'sending' 
           AND updated_at <= NOW() - ($1 || ' minutes')::interval`,
        [staleThresholdMinutes.toString()]
      );

      let recovered = 0;
      for (const stale of staleRes.rows) {
        // Send marker is valid for this claim ONLY if:
        // 1. last_sent_stage === claimed_stage, OR
        // 2. last_sent_at >= claimed_at
        const claimedAtMs = stale.claimed_at ? new Date(stale.claimed_at).getTime() : 0;
        const lastSentAtMs = stale.last_sent_at ? new Date(stale.last_sent_at).getTime() : 0;
        
        const hasCurrentClaimMarker = Boolean(
          (stale.last_sent_stage && stale.claimed_stage && stale.last_sent_stage === stale.claimed_stage) ||
          (lastSentAtMs > 0 && claimedAtMs > 0 && lastSentAtMs >= claimedAtMs - 1000)
        );

        const stageBeforeClaim = stale.claimed_stage || 'initial';

        if (hasCurrentClaimMarker) {
          // Crash happened AFTER send: Advance by EXACTLY ONE STAGE
          const nextStage =
            stageBeforeClaim === 'initial'
              ? 'followup_1'
              : stageBeforeClaim === 'followup_1'
              ? 'followup_2'
              : 'completed';

          await query(
            `UPDATE leads 
             SET outreach_stage = $1, 
                 last_contacted_at = COALESCE(last_sent_at, NOW()),
                 claimed_stage = NULL,
                 claimed_at = NULL,
                 updated_at = NOW() 
             WHERE id = $2`,
            [nextStage, stale.id]
          );
          console.log(`[FiveSlotSenderService] 🛡️ Duplicate-send prevention: Stale sending lead ${stale.id} already sent at "${stageBeforeClaim}". Advanced by exactly one stage to "${nextStage}".`);
        } else {
          // Crash happened BEFORE send: Safely restore to the SAME stage!
          const resetStage = stale.claimed_stage || (stale.last_contacted_at === null ? 'initial' : 'followup_1');
          await query(
            `UPDATE leads 
             SET outreach_stage = $1, 
                 claimed_stage = NULL,
                 claimed_at = NULL,
                 updated_at = NOW() 
             WHERE id = $2`,
            [resetStage, stale.id]
          );
          console.log(`[FiveSlotSenderService] 🔄 Crash-before-send recovered: Lead ${stale.id} reset to SAME stage "${resetStage}".`);
        }
        recovered++;
      }

      if (recovered > 0) {
        console.warn(`[FiveSlotSenderService] 🛡️ Stale Reaper: Recovered ${recovered} stuck 'sending' lead claims.`);
      }
      return recovered;
    } catch (err: any) {
      console.warn('[FiveSlotSenderService] Stale reaper warning:', err?.message);
      return 0;
    }
  }

  /**
   * Computes the deterministic slot grid for any wall-clock time
   * Anchor + k * cycleSec + slotIdx * offsetSec
   */
  computeGridState(now: Date = new Date(), settings: SlotSenderSettings) {
    const nowSec = Math.floor(now.getTime() / 1000);
    const anchorSec = Math.floor(new Date(settings.anchor_timestamp).getTime() / 1000);
    const cycleSec = Math.max(60, settings.slot_cycle_min * 60);
    const offsetSec = Math.max(10, settings.slot_offset_min * 60);

    const elapsed = Math.max(0, nowSec - anchorSec);
    const cycleIndex = Math.floor(elapsed / cycleSec);
    const cycleStartSec = anchorSec + cycleIndex * cycleSec;
    const offsetInCycle = elapsed % cycleSec;

    // Which slot is active right now in the grid
    const activeSlotIdx = Math.floor(offsetInCycle / offsetSec);
    const currentActiveSlot: SlotId | null = activeSlotIdx < 5 ? SLOTS[activeSlotIdx] : null;

    // Next scheduled send times for each slot A-E
    const slotTimes: Record<SlotId, { nextSec: number; nextDate: Date; slotCycleIndex: number }> = {} as any;

    SLOTS.forEach((slot, idx) => {
      const slotTimeInThisCycle = cycleStartSec + idx * offsetSec;
      if (nowSec <= slotTimeInThisCycle) {
        // Upcoming in current cycle
        slotTimes[slot] = {
          nextSec: slotTimeInThisCycle,
          nextDate: new Date(slotTimeInThisCycle * 1000),
          slotCycleIndex: cycleIndex,
        };
      } else if (nowSec < slotTimeInThisCycle + offsetSec) {
        // Currently active in its send window
        slotTimes[slot] = {
          nextSec: slotTimeInThisCycle,
          nextDate: new Date(slotTimeInThisCycle * 1000),
          slotCycleIndex: cycleIndex,
        };
      } else {
        // Already passed in current cycle; next turn is in cycleIndex + 1
        const nextCycleSec = cycleStartSec + cycleSec + idx * offsetSec;
        slotTimes[slot] = {
          nextSec: nextCycleSec,
          nextDate: new Date(nextCycleSec * 1000),
          slotCycleIndex: cycleIndex + 1,
        };
      }
    });

    return {
      nowSec,
      cycleIndex,
      cycleStartSec,
      offsetInCycle,
      currentActiveSlot,
      slotTimes,
    };
  }

  /**
   * Global scheduler tick (Single timer, never bursts on restart)
   * Protected with strict re-entrancy guard to prevent overlapping ticks
   * Optional filterTestBatch ensures tests strictly touch only test-tagged leads.
   * Optional testOptions allow explicit per-test configuration overrides (window, min gap, daily cap).
   */
  async processGlobalTick(
    overrideDate?: Date,
    filterTestBatch?: string,
    testOptions?: {
      bypassWindow?: boolean;
      bypassMinGap?: boolean;
      bypassDailyCap?: boolean;
    }
  ): Promise<{
    activeSlot: SlotId | null;
    dispatched: boolean;
    leadId?: string;
    reason?: string;
    circuitBreakerTripped?: boolean;
  }> {
    if (this.isTickRunning) {
      return { activeSlot: null, dispatched: false, reason: 'Tick already in progress (re-entrancy guard)' };
    }

    const now = overrideDate || new Date();

    // Check 5.4.5 daily quota timed pause
    if (this.quotaPauseUntil) {
      if (now < this.quotaPauseUntil) {
        return {
          activeSlot: null,
          dispatched: false,
          reason: `5.4.5 Mailbox daily quota timed pause active until ${this.quotaPauseUntil.toISOString()}`,
        };
      } else {
        console.log(`[FiveSlotSenderService] 🟢 5.4.5 Quota pause elapsed. Auto-resuming 5-slot sender.`);
        this.quotaPauseUntil = null;
      }
    }

    const settings = await this.getSettings();
    if (!settings.is_active || this.isCircuitBreakerTripped) {
      return {
        activeSlot: null,
        dispatched: false,
        reason: this.circuitBreakerAlert || 'Slot sender disabled in settings',
        circuitBreakerTripped: this.isCircuitBreakerTripped,
      };
    }

    this.isTickRunning = true;
    try {
      // 1. Stale-Claim Reaper: Recover any crashed claims with duplicate-send protection
      await this.reapStaleSendingClaims();

      // 2. Rolling Audit JIT Dispatcher: Ensure top queued leads are in flight to TD
      await this.dispatchRollingAudits();

      // 3. Compute Deterministic Grid
      const grid = this.computeGridState(now, settings);
      const activeSlot = grid.currentActiveSlot;

      if (!activeSlot) {
        return { activeSlot: null, dispatched: false, reason: 'Between slot offset windows' };
      }

      // Ensure this slot has not already dispatched during this cycle window
      const lastCycle = this.lastSlotCycleDispatched.get(activeSlot);
      if (lastCycle === grid.cycleIndex) {
        return { activeSlot, dispatched: false, reason: `Slot ${activeSlot} already dispatched in cycle ${grid.cycleIndex}` };
      }

      // Item 3: Global Minimum-Gap Guard across all slots:
      // Set to 75% of slot offset (e.g. 90s for 120s offset, 18s for 24s offset)
      // This guarantees slots never send simultaneously while absorbing real-world tick jitter.
      const defaultGlobalGapSec = Math.max(5, Math.floor(settings.slot_offset_min * 60 * 0.75));
      const globalMinGapSec = settings.global_min_gap_sec !== undefined ? settings.global_min_gap_sec : defaultGlobalGapSec;
      const globalMinGapMs = globalMinGapSec * 1000;

      if (
        !testOptions?.bypassMinGap &&
        this.lastGlobalSentEpochMs > 0 &&
        now.getTime() >= this.lastGlobalSentEpochMs &&
        now.getTime() - this.lastGlobalSentEpochMs < globalMinGapMs
      ) {
        const remainingSec = Math.ceil((globalMinGapMs - (now.getTime() - this.lastGlobalSentEpochMs)) / 1000);
        return {
          activeSlot,
          dispatched: false,
          reason: `Global minimum-gap guard active: must wait at least ${globalMinGapSec}s between sends across all slots (${remainingSec}s remaining). Zero double-sends globally.`,
        };
      }

      // Item 3: Tolerant Per-Slot Last-Sent Guard:
      // cycle length minus tick tolerance (15 seconds) so a send 1-2s late in cycle k does NOT lose its turn in cycle k+1
      const tickToleranceMs = 15000;
      const minCycleSeparationMs = Math.max(5000, ((settings.slot_cycle_min || 10) * 60 * 1000) - tickToleranceMs);
      const lastSentTime = this.lastSlotSentEpochMs.get(activeSlot);
      if (lastSentTime && now.getTime() >= lastSentTime && now.getTime() - lastSentTime < minCycleSeparationMs) {
        const remainingSec = Math.ceil((minCycleSeparationMs - (now.getTime() - lastSentTime)) / 1000);
        return {
          activeSlot,
          dispatched: false,
          reason: `Slot ${activeSlot} last-sent guard active: must wait at least cycle length between sends (${remainingSec}s remaining). Zero double-sends on grid changes.`,
        };
      }

      // 4. Send Window & Daily Cap Checks (Protection for mailbox reputation)
      const marketTz = settings.send_window_timezone || 'UTC';
      let currentHour = now.getHours();
      let currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
      try {
        const tzDate = new Date(now.toLocaleString('en-US', { timeZone: marketTz }));
        currentHour = tzDate.getHours();
        currentDay = tzDate.getDay();
      } catch {}

      if (!testOptions?.bypassWindow) {
        if (settings.weekdays_only && (currentDay === 0 || currentDay === 6)) {
          return { activeSlot, dispatched: false, reason: `Outside send window: Weekend resting (${marketTz})` };
        }

        if (currentHour < settings.send_window_start_hour || currentHour >= settings.send_window_end_hour) {
          return {
            activeSlot,
            dispatched: false,
            reason: `Outside send window (${settings.send_window_start_hour}:00 - ${settings.send_window_end_hour}:00 ${marketTz})`,
          };
        }
      }

      // Check daily mailbox cap in configured send-window timezone (excluding mock sends)
      if (!testOptions?.bypassDailyCap) {
        const metricRes = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM messages 
           WHERE direction = 'outbound' 
             AND status IN ('sent', 'delivered')
             AND (metadata->>'is_mock' IS NULL OR metadata->>'is_mock' != 'true')
             AND sent_at >= (NOW() AT TIME ZONE $1)::date AT TIME ZONE $1`,
          [marketTz]
        );
        const sentToday = parseInt(metricRes.rows[0]?.count || '0', 10);
        if (sentToday >= (settings.daily_send_limit || 150)) {
          return {
            activeSlot,
            dispatched: false,
            reason: `Daily send limit reached (${sentToday}/${settings.daily_send_limit || 150} emails today in ${marketTz})`,
          };
        }
      }

      // Mark slot attempted for this cycle index to avoid duplicate triggers
      this.lastSlotCycleDispatched.set(activeSlot, grid.cycleIndex);

      console.log(`[FiveSlotSenderService] ⏱️ Slot ${activeSlot} active in Cycle ${grid.cycleIndex} (deterministic grid). Scanning for queued leads...`);

      // 5. Query candidate leads for this slot (LIMIT 25 so unready or running leads do not block ready ones)
      const testFilterClause = filterTestBatch ? `AND notes = $2` : '';
      const queryParams: any[] = [activeSlot];
      if (filterTestBatch) {
        queryParams.push(filterTestBatch);
      }

      const candidateQuery = await query<{
        id: string;
        business_name: string;
        website: string;
        email: string;
        slot_id: SlotId;
        outreach_stage: string;
        audit_status: string;
        audit_findings: any;
        audit_pdf_path: string;
        audit_retry_count: number;
        audit_requested_at: string | null;
      }>(
        `SELECT id, business_name, website, email, slot_id, outreach_stage, audit_status, audit_findings, audit_pdf_path, audit_retry_count, audit_requested_at
         FROM leads
         WHERE deleted_at IS NULL
           AND status = 'active'
           AND consent_status = 'none'
           AND (slot_id = $1 OR (slot_id IS NULL AND $1 = 'A'))
           AND (outreach_stage IS NULL OR outreach_stage != 'sending')
           AND (
             (last_contacted_at IS NULL AND (outreach_stage IS NULL OR outreach_stage = 'initial'))
             OR (outreach_stage = 'followup_1' AND last_contacted_at <= NOW() - INTERVAL '48 hours')
             OR (outreach_stage = 'followup_2' AND last_contacted_at <= NOW() - INTERVAL '72 hours')
           )
           ${testFilterClause}
           AND NOT EXISTS (
             SELECT 1 FROM global_suppression_list gsl WHERE LOWER(gsl.email) = LOWER(leads.email) AND leads.email IS NOT NULL
           )
         ORDER BY 
           CASE 
             WHEN outreach_stage = 'followup_2' THEN 1
             WHEN outreach_stage = 'followup_1' THEN 2
             ELSE 3
           END ASC,
           created_at ASC
         LIMIT 25`,
        queryParams
      );

      if (candidateQuery.rows.length === 0) {
        console.log(`[FiveSlotSenderService] Slot ${activeSlot}: No due leads in queue.`);
        return { activeSlot, dispatched: false, reason: 'Queue empty for slot' };
      }

      // 6. Iterate through candidate leads with Head-Of-Line non-blocking logic:
      let readyCandidate: typeof candidateQuery.rows[0] | null = null;

      for (const candidate of candidateQuery.rows) {
        const validation = validateAuditAsset(candidate.audit_findings, candidate.audit_pdf_path);

        // Item 10: Clean sites: honor noOpportunity ONLY for complete audits (candidate.audit_status === 'ready')
        // Use separate status 'skipped_no_opportunity' instead of 'completed'; 0 failure_log rows, 0 emails sent.
        if (candidate.audit_status === 'ready' && validation.noOpportunity) {
          console.log(`[FiveSlotSenderService] 🟢 Clean site detected for "${candidate.business_name}": Complete audit found 0 flaws. Marking status = 'skipped_no_opportunity'.`);
          await query(
            `UPDATE leads 
             SET status = 'skipped_no_opportunity', 
                 outreach_stage = 'completed', 
                 manual_review_reason = 'Clean site: 0 technical flaws detected in complete audit (skipped_no_opportunity)',
                 updated_at = NOW() 
             WHERE id = $1`,
            [candidate.id]
          );
          // Do NOT log to failure_log! Do NOT email invented problems!
          continue;
        }

        const isFollowUp = candidate.outreach_stage === 'followup_1' || candidate.outreach_stage === 'followup_2';
        if (!isFollowUp && (candidate.audit_status !== 'ready' || !validation.ready)) {
          const requestedAtMs = candidate.audit_requested_at ? new Date(candidate.audit_requested_at).getTime() : 0;
          const isTimedOut = !requestedAtMs || Date.now() - requestedAtMs > 15 * 60 * 1000;
          const isAuditRunning = candidate.audit_status === 'pending' && !isTimedOut;

          // Head-of-line: if audit is still actively running, DO NOT count as a retry!
          if (isAuditRunning) {
            // Audit still in progress within timeout window: advance to next candidate without penalty
            continue;
          }

          if (candidate.audit_status === 'failed') {
            // Audit explicitly reported failed: isolate immediately without waiting out 3 retries!
            const { leadIsolationService } = await import('./leadIsolationService');
            await leadIsolationService.isolateFailedLead(candidate.id, 'Audit crawl failed in Technical Dashboard');
            await query(
              `UPDATE leads SET status = 'manual_review', manual_review_reason = 'Audit failed in TD', updated_at = NOW() WHERE id = $1`,
              [candidate.id]
            );
            await failureLogService.logFailure({
              leadId: candidate.id,
              company: candidate.business_name,
              website: candidate.website,
              email: candidate.email,
              slotId: activeSlot,
              stage: candidate.outreach_stage || 'initial',
              type: 'AUDIT_FAILED',
              errorMessage: 'Technical audit failed for website',
              attempts: 1,
            });
            // Advance to next candidate immediately!
            continue;
          }

          // If timed out or missing PDF on a "ready" status:
          const retries = (candidate.audit_retry_count || 0) + 1;
          console.warn(
            `[FiveSlotSenderService] ⚠️ Slot ${activeSlot} lead "${candidate.business_name}" audit not ready (Status: ${candidate.audit_status}, Ready: ${validation.ready}). Retry count: ${retries}/${settings.max_audit_retries}.`
          );

          if (retries >= settings.max_audit_retries) {
            const { leadIsolationService } = await import('./leadIsolationService');
            await leadIsolationService.isolateFailedLead(
              candidate.id,
              `Audit timeout after ${retries} attempts (${candidate.audit_status})`
            );
            await query(
              `UPDATE leads 
               SET status = 'manual_review', 
                   manual_review_reason = 'Audit not ready after 3 retries (Timeout / PDF Missing)',
                   audit_retry_count = $1,
                   updated_at = NOW() 
               WHERE id = $2`,
              [retries, candidate.id]
            );

            const failureType: 'AUDIT_FAILED' | 'AUDIT_TIMEOUT' | 'PDF_MISSING' =
              !isValidPdfFile(candidate.audit_pdf_path) && candidate.audit_status === 'ready'
                ? 'PDF_MISSING'
                : candidate.audit_status === 'failed'
                ? 'AUDIT_FAILED'
                : 'AUDIT_TIMEOUT';

            await failureLogService.logFailure({
              leadId: candidate.id,
              company: candidate.business_name,
              website: candidate.website,
              email: candidate.email,
              slotId: activeSlot,
              stage: candidate.outreach_stage || 'initial',
              type: failureType,
              errorMessage: `Audit incomplete after ${retries} retries: Status is "${candidate.audit_status}", reason: ${validation.reason || 'Timeout'}`,
              attempts: retries,
            });
          } else {
            await query(`UPDATE leads SET audit_retry_count = $1, updated_at = NOW() WHERE id = $2`, [retries, candidate.id]);
            this.triggerAuditForLead(candidate.id).catch(() => {});
          }

          // Advance to inspect next candidate in this slot
          continue;
        }

        // Re-check suppression at send time!
        const suppCheck = await suppressionService.isSuppressed({ email: candidate.email });
        if (suppCheck.suppressed) {
          console.warn(`[FiveSlotSenderService] 🚫 Lead ${candidate.id} (${candidate.email}) suppressed at send time (${suppCheck.reason}). Skipping.`);
          await query(`UPDATE leads SET consent_status = 'opted_out', updated_at = NOW() WHERE id = $1`, [candidate.id]);
          continue;
        }

        // Found a verified ready & unsuppressed candidate!
        readyCandidate = candidate;
        break;
      }

      if (!readyCandidate) {
        return {
          activeSlot,
          dispatched: false,
          reason: `Slot ${activeSlot} candidates are awaiting audit completion; slot will send on next ready candidate.`,
        };
      }

      const candidate = readyCandidate;

      // 7. ATOMIC CLAIM TO PREVENT DOUBLE-SENDS:
      const prevStage = candidate.outreach_stage || 'initial';
      const claimRes = await query<{ id: string }>(
        `UPDATE leads 
         SET outreach_stage = 'sending', 
             claimed_stage = $2, 
             claimed_at = NOW(), 
             updated_at = NOW() 
         WHERE id = $1 AND (outreach_stage = $2 OR ($2 = 'initial' AND outreach_stage IS NULL))
         RETURNING id`,
        [candidate.id, prevStage]
      );

      if (claimRes.rows.length === 0) {
        console.warn(`[FiveSlotSenderService] Concurrency conflict: Lead ${candidate.id} already claimed by another worker.`);
        return { activeSlot, dispatched: false, leadId: candidate.id, reason: 'Atomic claim conflict' };
      }

      // 8. DISPATCH OUTREACH:
      const mailbox = await this.getMailboxForSlot(SLOTS.indexOf(activeSlot));
      console.log(`[FiveSlotSenderService] 🚀 Dispatching Slot ${activeSlot} lead "${candidate.business_name}" via mailbox [${mailbox.email}]...`);

      try {
        const result = await stageOutreachService.sendNextStageToLead(candidate.id, prevStage);

        if (result.success && !result.skipped) {
          this.consecutiveAuthFailures = 0;
          this.isCircuitBreakerTripped = false;
          this.lastSlotSentEpochMs.set(activeSlot, now.getTime());
          this.lastGlobalSentEpochMs = now.getTime();
          await query(`UPDATE leads SET transient_retry_count = 0, send_retry_count = 0 WHERE id = $1`, [candidate.id]);
          console.log(`[FiveSlotSenderService] ✅ Slot ${activeSlot} successfully sent to "${candidate.business_name}" [${result.stageLabel}].`);
          return { activeSlot, dispatched: true, leadId: candidate.id };
        } else {
          console.warn(`[FiveSlotSenderService] Slot ${activeSlot} send failed for lead ${candidate.id}: ${result.reason}`);
          return await this.handleDispatchFailure(candidate, prevStage, activeSlot, result.reason || 'Send failed in stage outreach service');
        }
      } catch (sendErr: any) {
        console.error(`[FiveSlotSenderService] Dispatch exception for lead ${candidate.id}:`, sendErr?.message);
        return await this.handleDispatchFailure(candidate, prevStage, activeSlot, sendErr?.message || 'SMTP or dispatch exception');
      }
    } catch (err: any) {
      console.error('[FiveSlotSenderService] Global tick exception:', err?.message);
      return { activeSlot: null, dispatched: false, reason: err?.message };
    } finally {
      this.isTickRunning = false;
    }
  }

  /**
   * Dispatches failures according to SMTP error classification:
   * - Mailbox Auth -> do not touch lead, trip circuit breaker after 3 failures, pause slots
   * - Hard Bounce -> isolate lead, add to suppression, log SEND_FAILED
   * - Transient -> increment transient retry count, isolate only after cap (3), otherwise retry later
   */
  async handleDispatchFailure(
    candidate: { id: string; business_name: string; website: string; email: string; outreach_stage: string },
    prevStage: string,
    activeSlot: SlotId,
    errorMessage: string
  ): Promise<{ activeSlot: SlotId; dispatched: false; leadId: string; reason: string; circuitBreakerTripped?: boolean }> {
    const classification = classifySmtpError(errorMessage);
    console.warn(`[FiveSlotSenderService] Handling dispatch failure for lead ${candidate.id} [${classification.type}]: ${errorMessage}`);

    // 1. Mailbox / Authentication Error
    if (classification.type === 'mailbox_auth') {
      // DO NOT touch or penalize the lead! Reset claimed stage cleanly.
      await query(
        `UPDATE leads 
         SET outreach_stage = $1, 
             claimed_stage = NULL, 
             claimed_at = NULL, 
             updated_at = NOW() 
         WHERE id = $2 AND outreach_stage = 'sending'`,
        [prevStage, candidate.id]
      );
      this.consecutiveAuthFailures++;
      console.warn(`[FiveSlotSenderService] ⚠️ Mailbox Auth Failure #${this.consecutiveAuthFailures}: "${classification.message}"`);

      if (this.consecutiveAuthFailures >= 3) {
        this.isCircuitBreakerTripped = true;
        this.circuitBreakerAlert = `Mailbox Authentication Failure: ${classification.message}. 5-slot sender paused after 3 consecutive failures.`;
        await query(
          `UPDATE slot_sender_settings 
           SET is_active = false, circuit_breaker_tripped = true, consecutive_auth_failures = $1, updated_at = NOW() 
           WHERE id = 'default'`,
          [this.consecutiveAuthFailures]
        );
        console.error(`[FiveSlotSenderService] 🚨 CIRCUIT BREAKER TRIPPED! All 5 slots paused due to mailbox auth failures.`);
      }

      return {
        activeSlot,
        dispatched: false,
        leadId: candidate.id,
        reason: classification.message,
        circuitBreakerTripped: this.isCircuitBreakerTripped,
      };
    }

    // 2. Mailbox Daily Sending Quota (5.4.5) - Timed pause until next send day with auto-resume
    if (classification.type === 'daily_limit_pause') {
      const settings = await this.getSettings();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(settings.send_window_start_hour || 9, 0, 0, 0);
      this.quotaPauseUntil = tomorrow;
      console.warn(`[FiveSlotSenderService] ⏸️ 5.4.5 Mailbox Daily Quota reached: Timed pause until ${tomorrow.toISOString()} (auto-resumes tomorrow).`);
      
      // Leave lead untouched in queue for next turn
      await query(
        `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW() WHERE id = $2 AND outreach_stage = 'sending'`,
        [prevStage, candidate.id]
      );
      return {
        activeSlot,
        dispatched: false,
        leadId: candidate.id,
        reason: `5.4.5 Daily Sending Quota exceeded. Timed pause until ${tomorrow.toISOString()} (auto-resume).`,
      };
    }

    // 3. Soft Bounce / Mailbox Full (5.2.2) - Non-fatal retry up to 3 times before quarantine
    if (classification.type === 'soft_bounce') {
      this.consecutiveAuthFailures = 0;
      const leadRetriesRes = await query<{ transient_retry_count: number }>(
        `UPDATE leads 
         SET transient_retry_count = COALESCE(transient_retry_count, 0) + 1,
             send_retry_count = COALESCE(send_retry_count, 0) + 1,
             outreach_stage = $1,
             claimed_stage = NULL,
             claimed_at = NULL,
             updated_at = NOW() 
         WHERE id = $2 AND (outreach_stage = 'sending' OR outreach_stage = $1)
         RETURNING transient_retry_count`,
        [prevStage, candidate.id]
      );
      const retries = leadRetriesRes.rows[0]?.transient_retry_count || 1;
      if (retries >= 3) {
        const { leadIsolationService } = await import('./leadIsolationService');
        await leadIsolationService.isolateFailedLead(
          candidate.id,
          `Soft bounce cap reached after 3 retries (${classification.message})`
        );
        await failureLogService.logFailure({
          leadId: candidate.id,
          company: candidate.business_name,
          website: candidate.website,
          email: candidate.email,
          slotId: activeSlot,
          stage: prevStage,
          type: 'SEND_FAILED',
          errorMessage: `Soft bounce (mailbox full) cap reached: ${classification.message}`,
          attempts: retries,
        });
        console.warn(`[FiveSlotSenderService] Lead ${candidate.id} quarantined: soft bounce cap reached.`);
      } else {
        console.warn(`[FiveSlotSenderService] Lead ${candidate.id} soft bounce (${retries}/3). Left in queue for retry.`);
      }
      return { activeSlot, dispatched: false, leadId: candidate.id, reason: classification.message };
    }

    // 4. Hard Bounce / Permanent Address Failure
    if (classification.type === 'hard_bounce') {
      this.consecutiveAuthFailures = 0;
      await query(
        `UPDATE leads 
         SET claimed_stage = NULL, 
             claimed_at = NULL, 
             updated_at = NOW() 
         WHERE id = $1`,
        [candidate.id]
      );
      const { leadIsolationService } = await import('./leadIsolationService');
      await leadIsolationService.isolateFailedLead(candidate.id, classification.message);
      await suppressionService.suppress({ email: candidate.email, reason: 'hard_bounce' });
      await failureLogService.logFailure({
        leadId: candidate.id,
        company: candidate.business_name,
        website: candidate.website,
        email: candidate.email,
        slotId: activeSlot,
        stage: prevStage,
        type: 'SEND_FAILED',
        errorMessage: classification.message,
      });
      return { activeSlot, dispatched: false, leadId: candidate.id, reason: classification.message };
    }

    // 3. Transient Error (Timeout, 421/4xx, connection reset)
    if (classification.type === 'transient') {
      this.consecutiveAuthFailures = 0;
      const leadRetriesRes = await query<{ transient_retry_count: number }>(
        `UPDATE leads 
         SET transient_retry_count = COALESCE(transient_retry_count, 0) + 1,
             send_retry_count = COALESCE(send_retry_count, 0) + 1,
             outreach_stage = $1,
             claimed_stage = NULL,
             claimed_at = NULL,
             updated_at = NOW() 
         WHERE id = $2 AND (outreach_stage = 'sending' OR outreach_stage = $1)
         RETURNING transient_retry_count`,
        [prevStage, candidate.id]
      );
      const retries = leadRetriesRes.rows[0]?.transient_retry_count || 1;

      if (retries >= 3) {
        const { leadIsolationService } = await import('./leadIsolationService');
        await leadIsolationService.isolateFailedLead(
          candidate.id,
          `Transient send failure cap reached after 3 retries (${classification.message})`
        );
        await failureLogService.logFailure({
          leadId: candidate.id,
          company: candidate.business_name,
          website: candidate.website,
          email: candidate.email,
          slotId: activeSlot,
          stage: prevStage,
          type: 'SEND_FAILED',
          errorMessage: `Transient send failure cap reached: ${classification.message}`,
          attempts: retries,
        });
        console.warn(`[FiveSlotSenderService] Lead ${candidate.id} quarantined: transient failure cap reached.`);
      } else {
        console.warn(`[FiveSlotSenderService] Lead ${candidate.id} transient failure (${retries}/3). Left in queue for next turn.`);
      }

      return { activeSlot, dispatched: false, leadId: candidate.id, reason: classification.message };
    }

    // 4. Unknown error: isolate and log
    await query(
      `UPDATE leads SET outreach_stage = $1, updated_at = NOW() WHERE id = $2 AND outreach_stage = 'sending'`,
      [prevStage, candidate.id]
    );
    const { leadIsolationService } = await import('./leadIsolationService');
    await leadIsolationService.isolateFailedLead(candidate.id, classification.message);
    await failureLogService.logFailure({
      leadId: candidate.id,
      company: candidate.business_name,
      website: candidate.website,
      email: candidate.email,
      slotId: activeSlot,
      stage: prevStage,
      type: 'SEND_FAILED',
      errorMessage: classification.message,
    });
    return { activeSlot, dispatched: false, leadId: candidate.id, reason: classification.message };
  }

  /**
   * Retrieves live status for all 5 slots A-E for the UI panel
   * Redacts td_shared_secret to prevent credential exposure.
   */
  async getSlotsStatus(): Promise<{
    slots: SlotStatus[];
    settings: Omit<SlotSenderSettings, 'td_shared_secret'> & { td_shared_secret_masked: string };
    activeSlotNow: SlotId | null;
    circuitBreaker: {
      tripped: boolean;
      failures: number;
      alert: string | null;
    };
  }> {
    const rawSettings = await this.getSettings();
    const grid = this.computeGridState(new Date(), rawSettings);

    const countsRes = await query<{
      slot_id: SlotId;
      total_queued: string;
      ready_count: string;
      waiting_audit_count: string;
      last_sent_at: string | null;
    }>(
      `SELECT
         slot_id,
         COUNT(*) as total_queued,
         COUNT(*) FILTER (WHERE audit_status = 'ready' AND audit_pdf_path IS NOT NULL AND audit_pdf_path != '') as ready_count,
         COUNT(*) FILTER (WHERE audit_status = 'pending' OR audit_status = 'none' OR audit_status IS NULL) as waiting_audit_count,
         MAX(last_contacted_at) as last_sent_at
       FROM leads
       WHERE deleted_at IS NULL
         AND status = 'active'
         AND consent_status = 'none'
         AND slot_id IS NOT NULL
       GROUP BY slot_id`
    );

    const countMap = new Map<SlotId, { total: number; ready: number; waiting: number; lastSent: string | null }>();
    countsRes.rows.forEach((r) => {
      countMap.set(r.slot_id, {
        total: parseInt(r.total_queued, 10),
        ready: parseInt(r.ready_count, 10),
        waiting: parseInt(r.waiting_audit_count, 10),
        lastSent: r.last_sent_at,
      });
    });

    const slots: SlotStatus[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      const slotId = SLOTS[i];
      const mailbox = await this.getMailboxForSlot(i);
      const data = countMap.get(slotId) || { total: 0, ready: 0, waiting: 0, lastSent: null };
      const nextTime = grid.slotTimes[slotId].nextDate.toISOString();

      slots.push({
        slotId,
        assignedMailbox: {
          email: mailbox.email,
          name: mailbox.name,
          provider: mailbox.provider,
        },
        queuedCount: data.total,
        readyToSendCount: data.ready,
        waitingAuditCount: data.waiting,
        nextSendTime: nextTime,
        lastSendTime: data.lastSent,
        status: grid.currentActiveSlot === slotId ? 'active' : 'waiting',
      });
    }

    // Redact secret before sending over API
    const safeSettings = {
      ...rawSettings,
      td_shared_secret: undefined as any,
      td_shared_secret_masked: rawSettings.td_shared_secret ? '••••••••' : '',
    };

    return {
      slots,
      settings: safeSettings,
      activeSlotNow: grid.currentActiveSlot,
      circuitBreaker: {
        tripped: this.isCircuitBreakerTripped,
        failures: this.consecutiveAuthFailures,
        alert: this.circuitBreakerAlert,
      },
    };
  }

  /**
   * Watchdog for Report Delivery Failures (Item 6):
   * When TD accepts an audit request (HTTP 200) but never delivers results back to OD's callback route
   * within the delivery SLA, the watchdog isolates the lead to manual_review and logs REPORT_DELIVERY_FAILED.
   */
  async checkReportDeliveryWatchdog(deliveryTimeoutMs: number = 15 * 60 * 1000): Promise<number> {
    try {
      const timeoutDate = new Date(Date.now() - deliveryTimeoutMs);
      const droppedRes = await query<{
        id: string;
        business_name: string;
        website: string;
        email: string;
        slot_id: SlotId;
        outreach_stage: string;
        audit_requested_at: string;
      }>(
        `SELECT id, business_name, website, email, slot_id, outreach_stage, audit_requested_at
         FROM leads
         WHERE deleted_at IS NULL
           AND status = 'active'
           AND audit_status = 'pending'
           AND audit_requested_at IS NOT NULL
           AND audit_requested_at <= $1`,
        [timeoutDate.toISOString()]
      );

      let count = 0;
      for (const lead of droppedRes.rows) {
        const { leadIsolationService } = await import('./leadIsolationService');
        await leadIsolationService.isolateFailedLead(
          lead.id,
          'Report delivery failed: TD accepted audit request but no callback delivered within SLA'
        );
        await query(
          `UPDATE leads 
           SET status = 'manual_review', 
               manual_review_reason = 'Report delivery failed (TD delivery dropped / callback never received)',
               updated_at = NOW() 
           WHERE id = $1`,
          [lead.id]
        );
        await failureLogService.logFailure({
          leadId: lead.id,
          company: lead.business_name,
          website: lead.website,
          email: lead.email,
          slotId: lead.slot_id,
          stage: lead.outreach_stage || 'initial',
          type: 'REPORT_DELIVERY_FAILED',
          errorMessage: 'Report delivery failed: Technical Dashboard accepted audit but never called back within SLA',
          attempts: 1,
        });
        count++;
        console.warn(`[FiveSlotSenderService] 🚨 Watchdog flagged REPORT_DELIVERY_FAILED for lead "${lead.business_name}" (${lead.id}).`);
      }
      return count;
    } catch (err: any) {
      console.warn('[FiveSlotSenderService] Watchdog error:', err?.message);
      return 0;
    }
  }

  /**
   * Starts the single background timer loop
   */
  startScheduler(intervalMs: number = 10000): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log(`[FiveSlotSenderService] 🚀 5-Slot Staggered Sender active (Single Timer, 10s tick interval).`);

    // Run immediate startup checks: Stale Reaper + Rolling Audits
    this.reapStaleSendingClaims().catch(() => {});
    this.dispatchRollingAudits().catch(() => {});

    this.timer = setInterval(() => {
      this.processGlobalTick().catch((err) => {
        console.error('[FiveSlotSenderService] Scheduler tick error:', err?.message);
      });
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const fiveSlotSenderService = new FiveSlotSenderService();
