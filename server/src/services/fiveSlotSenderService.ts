import { query, pool } from '../config/db';
import { stageOutreachService } from './stageOutreachService';
import { failureLogService } from './failureLogService';
import { clientAuditService } from './clientAuditIntelligenceService';
import { technicalAuditPdfService } from './technicalAuditPdfService';
import { suppressionService } from './suppressionService';
import { classifySmtpError } from '../utils/smtpClassifier';
import { validateAuditAsset, isValidPdfFile } from '../utils/auditPolicy';
import { resolveRecipientTimezone, isWithinRecipientWindow } from '../utils/timezoneHelper';
import { workflowRoutingService } from './workflowRoutingService';
import { env } from '../config/env';
import {
  clearPipelineThrottle,
  formatDuration,
  logPipeline,
  logPipelineError,
  logPipelineThrottled,
} from '../utils/pipelineLogger';

export const SLOTS = ['A', 'B', 'C', 'D', 'E'] as const;
export type SlotId = typeof SLOTS[number];

/**
 * Masks a secret key for safe API/UI display, preserving only the last 4 characters.
 */
export function maskSecret(secret?: string | null): string {
  const trimmed = (secret || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••••••';
  return `••••••••${trimmed.slice(-4)}`;
}

export interface SlotSenderSettings {
  slot_cycle_min: number;
  slot_cycle_minutes?: number;
  slot_offset_min: number;
  slot_offsets_min?: number[];
  slot_batch_size?: number;
  anchor_timestamp: string;
  td_endpoint_url: string;
  td_shared_secret: string;
  td_callback_secret?: string;
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
  whatsapp_cold_outreach_enabled?: boolean;
  whatsapp_daily_limit?: number;
  active_list_id?: string | null;
}

export interface SlotLeadMilestone {
  leadId: string;
  businessName: string;
  website: string;
  stage: string;
  websiteSentToTd: boolean;
  receivedJson: boolean;
  createdPdf: boolean;
  emailDraftedAndSent: boolean;
  matchedService?: string;
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
  sentCount: number;
  receivedJsonCount: number;
  waitingCount: number;
  dueFollowupCount?: number;
  nextSendTime: string;
  lastSendTime: string | null;
  last_turn_at: string | null;
  next_turn_at: string;
  in_flight: boolean;
  leads_assigned: number;
  leads_done: number;
  status: 'active' | 'waiting' | 'completed' | 'idle';
  leads?: SlotLeadMilestone[];
}

export interface SlotSendHistoryEntry {
  id: string;
  slotId: SlotId;
  leadId: string | null;
  listId: string | null;
  listName: string;
  listTotalLeads: number;
  businessName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  mailboxEmail: string | null;
  channel: string;
  stage: string;
  subject: string;
  messageBody: string;
  pdfFilename: string | null;
  status: 'sent' | 'failed';
  errorMessage: string | null;
  externalMessageId: string | null;
  sentAt: string;
}

export interface SlotListSlotBreakdown {
  slotId: SlotId;
  assigned: number;
  sent: number;
  failed: number;
  remaining: number;
  completed: boolean;
}

export interface SlotListSummary {
  listId: string | null;
  listName: string;
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  lastSentAt: string | null;
  slots: Record<SlotId, SlotListSlotBreakdown>;
}

export interface SlotHistorySummaryItem {
  slotId: SlotId;
  assignedMailboxEmail: string;
  totalSent: number;
  totalFailed: number;
  lastSentAt: string | null;
  status: 'active' | 'waiting' | 'completed' | 'idle';
}

export interface SlotHistoryResponse {
  listsSummary: SlotListSummary[];
  slotSummaries: SlotHistorySummaryItem[];
  entries: SlotSendHistoryEntry[];
  totalEntries: number;
}

export class FiveSlotSenderService {
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;
  // Leader election state via PostgreSQL advisory lock
  private leaderClient: any = null;
  public isLeader = false;
  public readonly ADVISORY_LOCK_ID = 749202601;

  async acquireLeaderLock(): Promise<boolean> {
    if (this.isLeader && this.leaderClient) return true;
    try {
      const client = await pool.connect();
      const res = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [this.ADVISORY_LOCK_ID]);
      if (res.rows[0]?.acquired === true) {
        this.leaderClient = client;
        this.isLeader = true;
        this.leaderClient.on('error', () => {
          this.isLeader = false;
          this.leaderClient = null;
        });
        console.log(`[FiveSlotSenderService] 👑 Leader lock acquired (pg_advisory_lock ${this.ADVISORY_LOCK_ID}). Active leader scheduler instance.`);
        return true;
      } else {
        client.release();
        this.isLeader = false;
        return false;
      }
    } catch (err: any) {
      console.warn(`[FiveSlotSenderService] Leader lock acquisition warning:`, err?.message);
      this.isLeader = false;
      return false;
    }
  }

  async releaseLeaderLock(): Promise<void> {
    if (this.leaderClient) {
      try {
        await this.leaderClient.query('SELECT pg_advisory_unlock($1)', [this.ADVISORY_LOCK_ID]);
      } catch (_) {}
      try {
        this.leaderClient.release();
      } catch (_) {}
      this.leaderClient = null;
      this.isLeader = false;
      console.log(`[FiveSlotSenderService] 🛡️ Leader lock released (pg_advisory_unlock ${this.ADVISORY_LOCK_ID}).`);
    }
  }

  // Per-slot in-flight guard (memory + PostgreSQL slot_turn_state)
  private inFlightSlots = new Set<SlotId>();
  private pendingTurnResetPromise: Promise<void> | null = null;
  // Circuit breaker state for mailbox / SMTP authentication errors
  private consecutiveAuthFailures = 0;
  public isCircuitBreakerTripped = false;
  private circuitBreakerAlert: string | null = null;
  // Tracks last cycle index dispatched per slot to guarantee 1 turn per slot per cycle
  private lastSlotCycleDispatched = new Map<SlotId, number>();
  // Tracks last absolute sent epoch timestamp per slot (B3: per-slot last-sent guard)
  private lastSlotSentEpochMs = new Map<SlotId, number>();
  // Tracks last absolute sent epoch timestamp globally across all slots (Item 10: global min-gap guard)
  private lastGlobalSentEpochMs = 0;
  // Timed pause for 5.4.5 daily quota limits (auto-resumes at start of next send window)
  public quotaPauseUntil: Date | null = null;
  // Sliding 1-hour window for tracking distinct 5.7.1 recipient policy blocks
  private recentPolicyBlocks: Array<{ domain: string; epochMs: number }> = [];

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
    this.recentPolicyBlocks = [];
    this.inFlightSlots.clear();
    this.pendingTurnResetPromise = query(
      `UPDATE slot_turn_state SET last_turn_at = NULL, in_flight = false, in_flight_since = NULL, updated_at = NOW()`
    )
      .then(() => undefined)
      .catch(() => undefined);
  }

  resolveSlotOffsetsMin(settings: Pick<SlotSenderSettings, 'slot_offset_min' | 'slot_offsets_min'>): number[] {
    if (
      Array.isArray(settings.slot_offsets_min) &&
      settings.slot_offsets_min.length === SLOTS.length &&
      settings.slot_offsets_min.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    ) {
      return settings.slot_offsets_min.map((n) => Number(n.toFixed(4)));
    }
    const step = Number.isFinite(Number(settings.slot_offset_min)) ? Number(settings.slot_offset_min) : 2;
    return SLOTS.map((_, idx) => Number((idx * step).toFixed(4)));
  }

  private async getTurnStatesMap(): Promise<Map<SlotId, { lastTurnAt: string | null; inFlight: boolean }>> {
    const map = new Map<SlotId, { lastTurnAt: string | null; inFlight: boolean }>();
    SLOTS.forEach((slot) => map.set(slot, { lastTurnAt: null, inFlight: this.inFlightSlots.has(slot) }));
    try {
      const res = await query<{
        slot_id: SlotId;
        last_turn_at: string | null;
        in_flight: boolean;
        in_flight_since: string | null;
      }>(`SELECT slot_id, last_turn_at, in_flight, in_flight_since FROM slot_turn_state`);
      const nowMs = Date.now();
      for (const row of res.rows) {
        const dbLockActive =
          Boolean(row.in_flight) &&
          (!row.in_flight_since || nowMs - new Date(row.in_flight_since).getTime() < 5 * 60 * 1000);
        map.set(row.slot_id, {
          lastTurnAt: row.last_turn_at ? new Date(row.last_turn_at).toISOString() : null,
          inFlight: this.inFlightSlots.has(row.slot_id) || dbLockActive,
        });
      }
    } catch (err: any) {
      console.warn('[FiveSlotSenderService] Failed to query slot_turn_state:', err?.message);
    }
    return map;
  }

  async clearStaleInFlightLocks(): Promise<void> {
    try {
      await query(
        `UPDATE slot_turn_state
         SET in_flight = false, in_flight_since = NULL, updated_at = NOW()
         WHERE in_flight = true`
      );
      this.inFlightSlots.clear();
    } catch (err: any) {
      console.warn('[FiveSlotSenderService] Clear stale in-flight locks warning:', err?.message);
    }
  }

  async claimSlotInFlight(slotId: SlotId): Promise<{ claimed: boolean; lastTurnAt: string | null }> {
    if (this.inFlightSlots.has(slotId)) {
      return { claimed: false, lastTurnAt: null };
    }
    this.inFlightSlots.add(slotId);
    try {
      await query(
        `INSERT INTO slot_turn_state (slot_id) VALUES ($1) ON CONFLICT (slot_id) DO NOTHING`,
        [slotId]
      );
      const res = await query<{ slot_id: SlotId; last_turn_at: string | null }>(
        `UPDATE slot_turn_state
         SET in_flight = true, in_flight_since = NOW(), updated_at = NOW()
         WHERE slot_id = $1
           AND (in_flight = false OR in_flight_since IS NULL OR in_flight_since < NOW() - INTERVAL '5 minutes')
         RETURNING slot_id, last_turn_at`,
        [slotId]
      );
      if (res.rows.length === 0) {
        this.inFlightSlots.delete(slotId);
        return { claimed: false, lastTurnAt: null };
      }
      return {
        claimed: true,
        lastTurnAt: res.rows[0].last_turn_at ? new Date(res.rows[0].last_turn_at).toISOString() : null,
      };
    } catch (err: any) {
      this.inFlightSlots.delete(slotId);
      console.warn(`[FiveSlotSenderService] Failed to claim slot ${slotId} lock:`, err?.message);
      return { claimed: false, lastTurnAt: null };
    }
  }

  async releaseSlotInFlight(slotId: SlotId, turnRecordedAt: Date | null): Promise<void> {
    try {
      if (turnRecordedAt) {
        await query(
          `UPDATE slot_turn_state
           SET in_flight = false,
               in_flight_since = NULL,
               last_turn_at = GREATEST(COALESCE(last_turn_at, $2::timestamptz), $2::timestamptz),
               updated_at = NOW()
           WHERE slot_id = $1`,
          [slotId, turnRecordedAt.toISOString()]
        );
      } else {
        await query(
          `UPDATE slot_turn_state
           SET in_flight = false, in_flight_since = NULL, updated_at = NOW()
           WHERE slot_id = $1`,
          [slotId]
        );
      }
    } catch (err: any) {
      console.warn(`[FiveSlotSenderService] Failed to release slot ${slotId} lock:`, err?.message);
    } finally {
      this.inFlightSlots.delete(slotId);
    }
  }

  /**
   * Syncs per-slot last sent / turn timestamps from the DB on reboot
   * Guarantees persistence of the per-slot cooldown across process restarts
   * When batchTag is supplied, strictly scopes to leads with that test tag to prevent test cross-contamination.
   */
  async syncLastSentFromDb(batchTag?: string): Promise<void> {
    try {
      const sql = batchTag
        ? `SELECT slot_id, MAX(last_sent_at) as last_sent 
           FROM leads 
           WHERE notes = $1 AND slot_id IS NOT NULL AND last_sent_at IS NOT NULL 
           GROUP BY slot_id`
        : `SELECT slot_id, MAX(last_sent_at) as last_sent 
           FROM leads 
           WHERE slot_id IS NOT NULL AND last_sent_at IS NOT NULL 
           GROUP BY slot_id`;
      const params = batchTag ? [batchTag] : [];
      const res = await query<{ slot_id: SlotId; last_sent: string }>(sql, params);
      for (const row of res.rows) {
        if (row.slot_id && row.last_sent) {
          const epoch = new Date(row.last_sent).getTime();
          this.lastSlotSentEpochMs.set(row.slot_id, epoch);
          if (epoch > this.lastGlobalSentEpochMs) {
            this.lastGlobalSentEpochMs = epoch;
          }
        }
      }

      if (!batchTag) {
        const turnRes = await query<{ slot_id: SlotId; last_turn_at: string | null }>(
          `SELECT slot_id, last_turn_at FROM slot_turn_state WHERE last_turn_at IS NOT NULL`
        );
        for (const row of turnRes.rows) {
          if (row.slot_id && row.last_turn_at) {
            const epoch = new Date(row.last_turn_at).getTime();
            const existing = this.lastSlotSentEpochMs.get(row.slot_id) || 0;
            if (epoch > existing) {
              this.lastSlotSentEpochMs.set(row.slot_id, epoch);
            }
            if (epoch > this.lastGlobalSentEpochMs) {
              this.lastGlobalSentEpochMs = epoch;
            }
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

  /**
   * Toggles pause / resume state for 5-slot sending
   */
  async togglePause(pause?: boolean): Promise<{ is_active: boolean; message: string }> {
    const current = await this.getSettings();
    const targetActiveState = pause !== undefined ? !pause : !current.is_active;

    if (targetActiveState) {
      this.resetCircuitBreaker();
      await query(
        `UPDATE slot_sender_settings 
         SET is_active = true, circuit_breaker_tripped = false, consecutive_auth_failures = 0, updated_at = NOW() 
         WHERE id = 'default'`
      );
      console.log('[FiveSlotSenderService] 🟢 5-Slot sender resumed (24/7 sending enabled)');
      clearPipelineThrottle('tick-status');
      logPipeline('SCHEDULED_EMAIL', '5-Slot scheduler activated (ready to dispatch queued leads)');
      return { is_active: true, message: '5-Slot sender resumed. Automated 24/7 sending active.' };
    } else {
      await query(
        `UPDATE slot_sender_settings 
         SET is_active = false, updated_at = NOW() 
         WHERE id = 'default'`
      );
      console.log('[FiveSlotSenderService] ⏸️ 5-Slot sender paused');
      logPipeline('EMAIL_COUNTDOWN', '5-Slot scheduler paused by operator');
      return { is_active: false, message: '5-Slot sender paused. Sending halted across all slots.' };
    }
  }

  /**
   * Terminates active email sending schedule:
   * - Unassigns leads from the selected slot (or all slots)
   * - Resets outreach_stage back to NULL
   * - Cancels any pending scheduled dispatches
   * - Optionally pauses sender
   * Crucially: Preserves all lead data and contacts in CRM!
   */
  async terminateSlotSchedule(options?: {
    slotId?: SlotId | 'all';
    pauseSender?: boolean;
  }): Promise<{
    success: boolean;
    slotId: SlotId | 'all';
    terminatedLeadsCount: number;
    cancelledDispatchesCount: number;
    message: string;
  }> {
    const targetSlot = options?.slotId || 'all';
    const pauseSender = options?.pauseSender ?? (targetSlot === 'all');

    let terminatedLeadsCount = 0;
    let cancelledDispatchesCount = 0;

    if (targetSlot === 'all') {
      await query(
        `UPDATE slot_sender_settings
         SET is_active = CASE WHEN $1 THEN false ELSE is_active END,
             active_list_id = NULL,
             updated_at = NOW()
         WHERE id = 'default'`,
        [pauseSender]
      );

      const leadRes = await query<{ id: string }>(
        `UPDATE leads 
         SET slot_id = NULL, 
             slot_assigned_at = NULL, 
             outreach_stage = CASE WHEN outreach_stage IN ('initial', 'sending') THEN NULL ELSE outreach_stage END,
             claimed_stage = NULL, 
             claimed_at = NULL,
             updated_at = NOW()
         WHERE slot_id IS NOT NULL
         RETURNING id`
      );
      terminatedLeadsCount = leadRes.rowCount || 0;

      const dispRes = await query<{ id: string }>(
        `UPDATE scheduled_dispatches 
         SET status = 'cancelled', 
             error_message = 'Schedule terminated by user', 
             updated_at = NOW()
         WHERE status = 'pending'
         RETURNING id`
      );
      cancelledDispatchesCount = dispRes.rowCount || 0;

      console.log(`[FiveSlotSenderService] 🛑 Terminated entire 5-slot sending schedule (${terminatedLeadsCount} leads unassigned, ${cancelledDispatchesCount} dispatches cancelled). Leads preserved in CRM.`);

      return {
        success: true,
        slotId: 'all',
        terminatedLeadsCount,
        cancelledDispatchesCount,
        message: `Successfully terminated sending schedule across all slots (${terminatedLeadsCount} leads unassigned, ${cancelledDispatchesCount} pending dispatches cancelled). Leads remain safely in CRM.`,
      };
    } else {
      const leadRes = await query<{ id: string }>(
        `UPDATE leads 
         SET slot_id = NULL, 
             slot_assigned_at = NULL, 
             outreach_stage = CASE WHEN outreach_stage IN ('initial', 'sending') THEN NULL ELSE outreach_stage END,
             status = CASE WHEN status = 'active' THEN 'inactive' ELSE status END,
             claimed_stage = NULL, 
             claimed_at = NULL,
             updated_at = NOW()
         WHERE slot_id = $1 
           AND (outreach_stage IS NULL OR outreach_stage IN ('initial', 'sending'))
         RETURNING id`,
        [targetSlot]
      );
      terminatedLeadsCount = leadRes.rowCount || 0;

      if (options?.pauseSender === true) {
        await query(
          `UPDATE slot_sender_settings SET is_active = false, updated_at = NOW() WHERE id = 'default'`
        );
      }

      const dispRes = await query<{ id: string }>(
        `UPDATE scheduled_dispatches 
         SET status = 'cancelled', 
             error_message = 'Slot ' || $1 || ' schedule terminated by user', 
             updated_at = NOW()
         WHERE status = 'pending' AND metadata->>'slot_id' = $1
         RETURNING id`,
        [targetSlot]
      );
      cancelledDispatchesCount = dispRes.rowCount || 0;

      console.log(`[FiveSlotSenderService] 🛑 Terminated Slot ${targetSlot} schedule (${terminatedLeadsCount} leads unassigned, ${cancelledDispatchesCount} dispatches cancelled). Leads preserved in CRM.`);

      return {
        success: true,
        slotId: targetSlot,
        terminatedLeadsCount,
        cancelledDispatchesCount,
        message: `Successfully terminated Slot ${targetSlot} schedule (${terminatedLeadsCount} leads unassigned, ${cancelledDispatchesCount} pending dispatches cancelled). Leads remain safely in CRM.`,
      };
    }
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
      const res = await query<any>(
        `SELECT * FROM slot_sender_settings WHERE id = 'default'`
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        const legacyEndpoints = new Set([
          'http://127.0.0.1:5055/api/od/audit-request',
          'http://127.0.0.1:5055/api/audit/request',
        ]);
        const dbUrl = (row.td_endpoint_url || '').trim();
        const resolvedTdUrl =
          env.TD_ENDPOINT_URL && (!dbUrl || legacyEndpoints.has(dbUrl))
            ? env.TD_ENDPOINT_URL
            : dbUrl || env.TD_ENDPOINT_URL || 'http://127.0.0.1:5055/api/od/audit-request';

        const dbInboundSecret = (row.td_shared_secret || '').trim();
        const envInboundSecret = env.TD_INBOUND_SECRET || env.TD_SHARED_SECRET;
        const resolvedInboundSecret =
          envInboundSecret && (!dbInboundSecret || dbInboundSecret === 'td-secret-key-2026')
            ? envInboundSecret
            : dbInboundSecret || envInboundSecret || 'td-secret-key-2026';

        const resolvedCallbackSecret = (row.td_callback_secret || '').trim() || env.TD_CALLBACK_SECRET || '';

        const resolvedCycleMin = parseFloat(row.slot_cycle_min as any) || 10;
        const resolvedOffsetMin = parseFloat(row.slot_offset_min as any) || 2;
        const rawOffsets = Array.isArray(row.slot_offsets_min)
          ? row.slot_offsets_min.map((n: any) => Number(n))
          : null;
        const resolvedOffsetsMin =
          rawOffsets && rawOffsets.length === SLOTS.length && rawOffsets.every((n: number) => Number.isFinite(n) && n >= 0)
            ? rawOffsets
            : SLOTS.map((_, idx) => Number((idx * resolvedOffsetMin).toFixed(4)));
        const resolvedBatchSize = Math.max(1, parseInt(row.slot_batch_size as any, 10) || 1);

        return {
          ...row,
          slot_cycle_min: resolvedCycleMin,
          slot_cycle_minutes: resolvedCycleMin,
          slot_offset_min: resolvedOffsetMin,
          slot_offsets_min: resolvedOffsetsMin,
          slot_batch_size: resolvedBatchSize,
          daily_send_limit: row.daily_send_limit !== null && row.daily_send_limit !== undefined ? parseInt(row.daily_send_limit as any, 10) : 150,
          send_window_start_hour: row.send_window_start_hour !== null && row.send_window_start_hour !== undefined ? parseInt(row.send_window_start_hour as any, 10) : 0,
          send_window_end_hour: row.send_window_end_hour !== null && row.send_window_end_hour !== undefined ? parseInt(row.send_window_end_hour as any, 10) : 24,
          weekdays_only: row.weekdays_only ?? false,
          global_min_gap_sec: Number.isFinite(Number(row.global_min_gap_sec))
            ? Math.max(1, parseInt(row.global_min_gap_sec as any, 10))
            : 90,
          td_endpoint_url: resolvedTdUrl,
          td_shared_secret: resolvedInboundSecret,
          td_callback_secret: resolvedCallbackSecret,
          whatsapp_cold_outreach_enabled: row.whatsapp_cold_outreach_enabled ?? false,
          whatsapp_daily_limit: row.whatsapp_daily_limit ?? 20,
          active_list_id: row.active_list_id || null,
        };
      }
    } catch (err) {
      console.warn('[FiveSlotSenderService] Using fallback settings:', err);
    }

    return {
      slot_cycle_min: 10,
      slot_cycle_minutes: 10,
      slot_offset_min: 2,
      slot_offsets_min: [0, 2, 4, 6, 8],
      slot_batch_size: 1,
      anchor_timestamp: '2026-01-01 00:00:00+00',
      td_endpoint_url: env.TD_ENDPOINT_URL || 'http://127.0.0.1:5055/api/od/audit-request',
      td_shared_secret: env.TD_INBOUND_SECRET || env.TD_SHARED_SECRET || 'td-secret-key-2026',
      td_callback_secret: env.TD_CALLBACK_SECRET || '',
      max_audit_retries: 3,
      daily_send_limit: 150,
      send_window_start_hour: 0,
      send_window_end_hour: 24,
      weekdays_only: false,
      is_active: true,
      send_window_timezone: 'UTC',
      global_min_gap_sec: 90,
      whatsapp_cold_outreach_enabled: false,
      whatsapp_daily_limit: 20,
      active_list_id: null,
    };
  }

  /**
   * Probes TD connection endpoint with header and secret
   */
  async testTdConnection(targetUrl?: string, targetSecret?: string): Promise<{
    ok: boolean;
    status?: number;
    latencyMs: number;
    url: string;
    message: string;
    details?: any;
  }> {
    const settings = await this.getSettings();
    const url = (targetUrl || settings.td_endpoint_url || 'http://127.0.0.1:5055/api/od/audit-request').trim();
    const secret = (targetSecret || settings.td_shared_secret || 'td-secret-key-2026').trim();

    if (!url) {
      return {
        ok: false,
        latencyMs: 0,
        url,
        message: 'TD endpoint URL is empty or unconfigured',
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      // Send lightweight ping probe without job fields so TD authenticates without queuing a real audit
      const probePayload = {
        ping: true,
        testProbe: true,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-audit-secret': secret,
          'x-td-secret': secret,
          'x-od-secret': secret,
        },
        body: JSON.stringify(probePayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;
      const bodyText = await res.text();

      if (res.ok || res.status === 200 || res.status === 202) {
        return {
          ok: true,
          status: res.status,
          latencyMs,
          url,
          message: `Connected successfully to TD (${res.status} OK in ${latencyMs}ms)`,
          details: bodyText.slice(0, 300),
        };
      } else if (
        res.status === 400 &&
        /missing required fields|leadid|website|callbackurl/i.test(bodyText)
      ) {
        return {
          ok: true,
          status: res.status,
          latencyMs,
          url,
          message: `Connected & authenticated with TD (schema validation active, ${latencyMs}ms)`,
          details: bodyText.slice(0, 300),
        };
      } else if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          latencyMs,
          url,
          message: `TD secret authentication rejected (HTTP ${res.status}): Header x-audit-secret invalid`,
          details: bodyText.slice(0, 300),
        };
      } else if (res.status === 404) {
        return {
          ok: false,
          status: res.status,
          latencyMs,
          url,
          message: `Route not found (HTTP 404). Expected TD endpoint: /api/od/audit-request`,
          details: bodyText.slice(0, 300),
        };
      } else {
        return {
          ok: false,
          status: res.status,
          latencyMs,
          url,
          message: `TD responded with HTTP ${res.status} in ${latencyMs}ms`,
          details: bodyText.slice(0, 300),
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        ok: false,
        latencyMs,
        url,
        message: `Failed to connect to TD at ${url}: ${err?.name === 'AbortError' ? 'Connection timed out after 6000ms' : (err?.message || 'Connection refused')}`,
      };
    }
  }

  /**
   * Startup verification probe for TD connection
   */
  async checkTdStartupConnection(): Promise<void> {
    const settings = await this.getSettings();
    if (settings.td_endpoint_url && settings.td_endpoint_url.startsWith('http')) {
      console.log(`[FiveSlotSenderService] 🔌 Probing TD connection at startup: ${settings.td_endpoint_url}...`);
      const check = await this.testTdConnection();
      if (check.ok) {
        console.log(`[FiveSlotSenderService] 🔌 TD Connection Check: SUCCESS (${check.status} in ${check.latencyMs}ms)`);
      } else {
        console.warn(`[FiveSlotSenderService] ⚠️ TD Connection Check Notice: ${check.message}`);
      }
    } else {
      console.log('[FiveSlotSenderService] ℹ️ TD endpoint URL not set; local audit engine active.');
    }
  }

  /**
   * Updates slot sender settings in DB
   */
  async updateSettings(partial: Partial<SlotSenderSettings>): Promise<SlotSenderSettings> {
    const current = await this.getSettings();
    const incomingCycle =
      partial.slot_cycle_min !== undefined ? partial.slot_cycle_min : partial.slot_cycle_minutes;
    const nextCycleMin =
      incomingCycle !== undefined
        ? Math.max(0.5, Number(incomingCycle) || 10)
        : current.slot_cycle_min;
    const nextOffsetMin =
      partial.slot_offset_min !== undefined
        ? Math.max(0.1, Number(Number(partial.slot_offset_min).toFixed(2)))
        : incomingCycle !== undefined
        ? Math.max(0.1, Number((nextCycleMin / 5).toFixed(2)))
        : current.slot_offset_min;
    const nextOffsetsMin =
      Array.isArray(partial.slot_offsets_min) &&
      partial.slot_offsets_min.length === SLOTS.length &&
      partial.slot_offsets_min.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
        ? partial.slot_offsets_min.map((n) => Number(n.toFixed(4)))
        : partial.slot_offset_min !== undefined || incomingCycle !== undefined
        ? SLOTS.map((_, idx) => Number((idx * nextOffsetMin).toFixed(4)))
        : this.resolveSlotOffsetsMin(current);
    const nextBatchSize =
      partial.slot_batch_size !== undefined
        ? Math.max(1, Math.min(25, Math.round(Number(partial.slot_batch_size)) || 1))
        : current.slot_batch_size ?? 1;
    const nextGlobalMinGapSec =
      partial.global_min_gap_sec !== undefined
        ? Math.max(1, Math.round(Number(partial.global_min_gap_sec)))
        : incomingCycle !== undefined || partial.slot_offset_min !== undefined
        ? Math.max(5, Math.floor(nextOffsetMin * 60 * 0.75))
        : current.global_min_gap_sec ?? 90;
    const nextActiveListId =
      'active_list_id' in partial ? partial.active_list_id || null : current.active_list_id ?? null;

    const rawInboundInput = partial.td_shared_secret?.trim() || '';
    const nextTdSharedSecret =
      rawInboundInput.length > 0 && !rawInboundInput.startsWith('••••••••')
        ? rawInboundInput
        : current.td_shared_secret;
    const rawCallbackInput = partial.td_callback_secret?.trim() || '';
    const nextTdCallbackSecret =
      rawCallbackInput.length > 0 && !rawCallbackInput.startsWith('••••••••')
        ? rawCallbackInput
        : current.td_callback_secret || '';

    const updated: SlotSenderSettings = {
      ...current,
      ...partial,
      slot_cycle_min: nextCycleMin,
      slot_cycle_minutes: nextCycleMin,
      slot_offset_min: nextOffsetMin,
      slot_offsets_min: nextOffsetsMin,
      slot_batch_size: nextBatchSize,
      global_min_gap_sec: nextGlobalMinGapSec,
      active_list_id: nextActiveListId,
      td_shared_secret: nextTdSharedSecret,
      td_callback_secret: nextTdCallbackSecret,
    };

    await query(
      `UPDATE slot_sender_settings SET
        slot_cycle_min = $1,
        slot_offset_min = $2,
        anchor_timestamp = $3,
        td_endpoint_url = $4,
        td_shared_secret = $5,
        td_callback_secret = $6,
        max_audit_retries = $7,
        daily_send_limit = $8,
        send_window_start_hour = $9,
        send_window_end_hour = $10,
        weekdays_only = $11,
        is_active = $12,
        send_window_timezone = $13,
        global_min_gap_sec = $14,
        active_list_id = $15,
        slot_offsets_min = $16::jsonb,
        slot_batch_size = $17,
        updated_at = NOW()
       WHERE id = 'default'`,
      [
        updated.slot_cycle_min,
        updated.slot_offset_min,
        updated.anchor_timestamp,
        updated.td_endpoint_url,
        updated.td_shared_secret,
        updated.td_callback_secret || '',
        updated.max_audit_retries,
        updated.daily_send_limit,
        updated.send_window_start_hour,
        updated.send_window_end_hour,
        updated.weekdays_only,
        updated.is_active,
        updated.send_window_timezone || 'UTC',
        updated.global_min_gap_sec ?? 90,
        updated.active_list_id ?? null,
        JSON.stringify(nextOffsetsMin),
        nextBatchSize,
      ]
    );

    clearPipelineThrottle('tick-status');
    if (partial.anchor_timestamp || partial.slot_cycle_min !== undefined || partial.slot_offset_min !== undefined) {
      const waitSec = Math.max(0, Math.round((new Date(updated.anchor_timestamp).getTime() - Date.now()) / 1000));
      if (waitSec > 0) {
        logPipeline(
          'EMAIL_COUNTDOWN',
          `Schedule timing updated (cycle: ${updated.slot_cycle_min}m, offset: ${updated.slot_offset_min}m) — Email will start in ${formatDuration(waitSec)}`
        );
      } else {
        logPipeline(
          'SCHEDULED_EMAIL',
          `5-Slot pacing updated (cycle: ${updated.slot_cycle_min}m, offset: ${updated.slot_offset_min}m, min-gap: ${updated.global_min_gap_sec}s)`
        );
      }
    }

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
   * Clears slot assignments from soft-deleted, inactive, manual_review, duplicate, or opted-out leads
   * so deleted/older invalid leads never appear in any slot count or queue.
   */
  async clearDeletedOrInvalidSlotAssignments(): Promise<number> {
    const res = await query<{ id: string }>(
      `UPDATE leads
       SET slot_id = NULL,
           slot_assigned_at = NULL,
           claimed_stage = NULL,
           claimed_at = NULL,
           updated_at = NOW()
       WHERE slot_id IS NOT NULL
         AND (
           deleted_at IS NOT NULL
           OR status IN ('manual_review', 'inactive', 'paused', 'duplicate')
           OR consent_status IN ('opted_out', 'unsubscribed', 'replied')
         )
       RETURNING id`
    );
    return res.rowCount || 0;
  }

  /**
   * Explicitly unassigns specific leads (e.g., deleted or removed from active list) from 5 slots.
   */
  async unassignLeadsFromSlots(leadIds: string[]): Promise<number> {
    if (!Array.isArray(leadIds) || leadIds.length === 0) return 0;
    const res = await query<{ id: string }>(
      `UPDATE leads
       SET slot_id = NULL,
           slot_assigned_at = NULL,
           claimed_stage = NULL,
           claimed_at = NULL,
           updated_at = NOW()
       WHERE id = ANY($1)
         AND slot_id IS NOT NULL
       RETURNING id`,
      [leadIds]
    );
    return res.rowCount || 0;
  }

  /**
   * Called before deleting a custom list so its leads are immediately removed from 5-slot queues
   * and any active_list_id scope pointing to that deleted list is cleared.
   */
  async handleListDeleted(listId: string): Promise<{ clearedLeads: number; resetActiveScope: boolean }> {
    const settings = await this.getSettings();
    const isScopedList = settings.active_list_id === listId;

    const memberRes = await query<{ lead_id: string }>(
      `SELECT lead_id FROM lead_list_memberships WHERE list_id = $1`,
      [listId]
    );
    const memberIds = memberRes.rows.map((r) => r.lead_id);

    let clearedLeads = 0;
    if (isScopedList) {
      await this.updateSettings({ active_list_id: null });
      const clr = await query<{ id: string }>(
        `UPDATE leads
         SET slot_id = NULL, slot_assigned_at = NULL, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW()
         WHERE slot_id IS NOT NULL
         RETURNING id`
      );
      clearedLeads = clr.rowCount || 0;
    } else if (memberIds.length > 0) {
      // Unassign leads whose only list or slot association came from this deleted list
      const clr = await query<{ id: string }>(
        `UPDATE leads
         SET slot_id = NULL, slot_assigned_at = NULL, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW()
         WHERE id = ANY($1)
           AND slot_id IS NOT NULL
         RETURNING id`,
        [memberIds]
      );
      clearedLeads = clr.rowCount || 0;
    }

    return { clearedLeads, resetActiveScope: isScopedList };
  }

  /**
   * Called when members are removed from a list; unassigns removed leads if they belong to the active scoped list.
   */
  async handleMembersRemovedFromList(listId: string, leadIds: string[]): Promise<number> {
    if (!Array.isArray(leadIds) || leadIds.length === 0) return 0;
    const settings = await this.getSettings();
    if (settings.active_list_id === listId || !settings.active_list_id) {
      return this.unassignLeadsFromSlots(leadIds);
    }
    return 0;
  }

  /**
   * Distributes unassigned leads round-robin across the 5 slots (A, B, C, D, E).
   * - If listId is provided with replaceExisting=true, older leads outside listId are cleared from slots
   *   and settings.active_list_id is locked to listId so ONLY the new list runs across Slots A-E.
   * - If rebalanceAll is true, rebalances all eligible leads in scope evenly.
   */
  async autoAssignUnassignedLeads(options?: {
    rebalanceAll?: boolean;
    listId?: string;
    replaceExisting?: boolean;
  }): Promise<{
    assignedCount: number;
    distribution: Record<SlotId, number>;
    activeListId: string | null;
  }> {
    const rebalanceAll = options?.rebalanceAll === true;
    const rawListId = options?.listId;
    const listId =
      rawListId && rawListId !== 'all' && rawListId !== 'all-leads' && rawListId.trim() !== ''
        ? rawListId.trim()
        : undefined;
    const replaceExisting = options?.replaceExisting === true;

    // 0. Always purge slot assignments on deleted/inactive/manual_review/opted-out leads
    await this.clearDeletedOrInvalidSlotAssignments();

    // If a specific listId is requested, verify it exists (not deleted)
    if (listId) {
      const listExists = await query<{ id: string }>(`SELECT id FROM lists WHERE id = $1`, [listId]);
      if (listExists.rows.length === 0) {
        const settings = await this.getSettings();
        if (settings.active_list_id === listId) {
          await this.updateSettings({ active_list_id: null });
          await query(
            `UPDATE leads SET slot_id = NULL, slot_assigned_at = NULL, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW() WHERE slot_id IS NOT NULL`
          );
        }
        return { assignedCount: 0, distribution: { A: 0, B: 0, C: 0, D: 0, E: 0 }, activeListId: null };
      }
    }

    // 1. Replace older list assignments when switching to a specific list (or clearing scope to "all")
    let resolvedActiveListId: string | null = null;
    if (replaceExisting) {
      resolvedActiveListId = listId || null;
      await this.updateSettings({ active_list_id: resolvedActiveListId });
      if (listId) {
        await query(
          `UPDATE leads
           SET slot_id = NULL,
               slot_assigned_at = NULL,
               claimed_stage = NULL,
               claimed_at = NULL,
               updated_at = NOW()
           WHERE slot_id IS NOT NULL
             AND id NOT IN (SELECT lead_id FROM lead_list_memberships WHERE list_id = $1)`,
          [listId]
        );
      }
    } else {
      const currentSettings = await this.getSettings();
      resolvedActiveListId = listId || currentSettings.active_list_id || null;
    }

    // 2. Get current lead counts per slot (scoped cleanly to active_list_id if set)
    const countConditions = [
      `deleted_at IS NULL`,
      `(status = 'active' OR status = 'queued' OR status IS NULL)`,
      `slot_id IS NOT NULL`,
    ];
    const countParams: any[] = [];
    if (listId) {
      countParams.push(listId);
      countConditions.push(`id IN (SELECT lead_id FROM lead_list_memberships WHERE list_id = $${countParams.length})`);
    }

    const slotCountsRes = await query<{ slot_id: SlotId; count: string }>(
      `SELECT slot_id, COUNT(*) as count 
       FROM leads 
       WHERE ${countConditions.join(' AND ')}
       GROUP BY slot_id`,
      countParams
    );

    const countMap = new Map<SlotId, number>();
    SLOTS.forEach((s) => countMap.set(s, 0));
    if (!rebalanceAll) {
      slotCountsRes.rows.forEach((r) => {
        if (countMap.has(r.slot_id)) {
          countMap.set(r.slot_id, parseInt(r.count, 10));
        }
      });
    }

    // 3. Fetch contactable, non-completed active leads to assign
    const whereConditions = [
      `deleted_at IS NULL`,
      `(status = 'active' OR status = 'queued' OR status IS NULL)`,
      `(consent_status = 'none' OR consent_status IS NULL)`,
      `(outreach_stage IS NULL OR outreach_stage NOT IN ('completed', 'followup_3', 'skipped_no_opportunity'))`,
      `((email IS NOT NULL AND TRIM(email) LIKE '%@%.%') OR LENGTH(REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g')) >= 8)`,
    ];

    const params: any[] = [];
    if (!rebalanceAll) {
      whereConditions.push(`(slot_id IS NULL OR slot_id = '')`);
    }
    if (listId) {
      params.push(listId);
      whereConditions.push(`id IN (SELECT lead_id FROM lead_list_memberships WHERE list_id = $${params.length})`);
    }

    const unassignedRes = await query<{ id: string }>(
      `SELECT id FROM leads 
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY created_at ASC`,
      params
    );

    if (unassignedRes.rows.length === 0) {
      const dist: Record<SlotId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      countMap.forEach((v, k) => { dist[k] = v; });
      return { assignedCount: 0, distribution: dist, activeListId: resolvedActiveListId };
    }

    // 4. Assign leads round-robin to slot with fewest leads
    for (const lead of unassignedRes.rows) {
      let minSlot: SlotId = 'A';
      let minCount = Infinity;
      for (const s of SLOTS) {
        const c = countMap.get(s) ?? 0;
        if (c < minCount) {
          minCount = c;
          minSlot = s;
        }
      }
      await query(
        `UPDATE leads SET slot_id = $1, slot_assigned_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [minSlot, lead.id]
      );
      countMap.set(minSlot, minCount + 1);
    }

    console.log(
      `[FiveSlotSenderService] 🎯 Assigned ${unassignedRes.rows.length} leads${listId ? ` (list ${listId})` : ''} across 5 slots: ` +
      SLOTS.map((s) => `Slot ${s}: ${countMap.get(s)}`).join(', ')
    );
    logPipeline(
      'SCHEDULED_EMAIL',
      `Assigned ${unassignedRes.rows.length} lead(s)${listId ? ` from list ${listId}` : ''} across 5 slots (` +
        SLOTS.map((s) => `Slot ${s}:${countMap.get(s)}`).join(', ') +
        `)`
    );

    // 5. Trigger rolling audits for the top leads in each slot
    await this.dispatchRollingAudits();

    const distribution: Record<SlotId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    countMap.forEach((v, k) => { distribution[k] = v; });
    return { assignedCount: unassignedRes.rows.length, distribution, activeListId: resolvedActiveListId };
  }

  /**
   * Just-In-Time (JIT) Rolling Audit Dispatcher
   * Dispatches audits to TD only for the top 2 queued leads per slot (~10 leads in flight max)
   * Prevents TD queue overload and eliminates premature timeout failures.
   */
  async dispatchRollingAudits(filterTestBatch?: string): Promise<void> {
    try {
      const batchFilter = filterTestBatch ? `AND notes = $2` : '';
      for (const slot of SLOTS) {
        const params: any[] = filterTestBatch ? [slot, filterTestBatch] : [slot];
        const dueSoonRes = await query<{ id: string; website: string; business_name: string }>(
          `SELECT id, website, business_name FROM leads
           WHERE deleted_at IS NULL 
             AND status = 'active' 
             AND consent_status = 'none'
             AND slot_id = $1
             ${batchFilter}
             AND (audit_status = 'none' OR audit_status IS NULL OR (audit_status = 'pending' AND audit_requested_at IS NULL))
           ORDER BY created_at ASC
           LIMIT 2`,
          params
        );

        for (const lead of dueSoonRes.rows) {
          if (workflowRoutingService.hasValidWebsite(lead.website)) {
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
   * Atomically isolates a lead whose audit cannot run or permanently failed,
   * preventing repeated scheduler picks or duplicate failure_log entries.
   */
  private async isolateAuditFailure(params: {
    leadId: string;
    company: string;
    website?: string | null;
    email?: string | null;
    slotId?: string | null;
    stage?: string | null;
    manualReason: string;
    errorMessage: string;
    failureType?: 'AUDIT_FAILED' | 'AUDIT_TIMEOUT' | 'PDF_MISSING';
    attempts?: number;
  }): Promise<void> {
    const { leadIsolationService } = await import('./leadIsolationService');
    await leadIsolationService.isolateFailedLead(params.leadId, params.manualReason);
    await query(
      `UPDATE leads
       SET audit_status = 'failed',
           status = 'manual_review',
           manual_review_reason = $1,
           slot_id = NULL,
           claimed_stage = NULL,
           claimed_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [params.manualReason, params.leadId]
    );
    await failureLogService.logFailure({
      leadId: params.leadId,
      company: params.company,
      website: params.website || '',
      email: params.email || '',
      slotId: params.slotId || '',
      stage: params.stage || 'initial',
      type: params.failureType || 'AUDIT_FAILED',
      errorMessage: params.errorMessage,
      attempts: params.attempts || 1,
    });
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
      slot_id: string | null;
      outreach_stage: string | null;
    }>(
      `SELECT id, business_name, website, email, primary_contact_name, slot_id, outreach_stage FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadRes.rows.length === 0) return;
    const lead = leadRes.rows[0];

    if (!lead.website || !lead.website.trim() || !workflowRoutingService.hasValidWebsite(lead.website)) {
      await this.isolateAuditFailure({
        leadId,
        company: lead.business_name,
        website: lead.website,
        email: lead.email,
        slotId: lead.slot_id,
        stage: lead.outreach_stage || 'initial',
        manualReason: 'No valid website to audit',
        errorMessage: 'Cannot audit lead: Website URL is missing or invalid',
      });
      return;
    }

    await query(
      `UPDATE leads SET audit_status = 'pending', audit_requested_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [leadId]
    );

    const settings = await this.getSettings();
    const appBaseUrl = (env.APP_URL || process.env.APP_URL || `http://localhost:${env.PORT || 5001}`).replace(/\/+$/, '');
    // Secret is conveyed strictly via headers; never exposed in the URL query string
    const callbackUrl = `${appBaseUrl}/api/audit-callback`;

    // If external TD endpoint is configured, send HTTP dispatch
    const slotLabel = lead.slot_id ? `Slot ${lead.slot_id}` : 'Unassigned';
    if (settings.td_endpoint_url && settings.td_endpoint_url.startsWith('http')) {
      try {
        console.log(`[FiveSlotSenderService] 📡 Dispatching JIT audit to TD at ${settings.td_endpoint_url} for "${lead.business_name}" (${lead.website})...`);
        logPipeline(
          'SENT_TO_TD',
          `Sent website details to Technical Dashboard for "${lead.business_name}" (${lead.website}) [${slotLabel}] -> ${settings.td_endpoint_url}`
        );
        const payload = {
          leadId: lead.id,
          website: lead.website,
          email: lead.email,
          company: lead.business_name,
          contactName: lead.primary_contact_name,
          slotId: lead.slot_id || undefined,
          callbackUrl,
        };

        const res = await fetch(settings.td_endpoint_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-audit-secret': settings.td_shared_secret,
            'x-td-secret': settings.td_shared_secret,
            'x-od-secret': settings.td_shared_secret,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`TD returned HTTP ${res.status}: ${await res.text()}`);
        }

        console.log(`[FiveSlotSenderService] ✅ Audit request accepted by TD for lead ${lead.id}`);
        logPipeline('SENT_TO_TD', `TD accepted audit request for "${lead.business_name}" [${slotLabel}] (waiting for JSON callback)`);
      } catch (tdErr: any) {
        console.warn(`[FiveSlotSenderService] TD webhook dispatch failed, running local audit diagnostic: ${tdErr.message}`);
        logPipelineError('TD Dispatch', `Failed sending "${lead.business_name}" [${slotLabel}] to TD; falling back to local audit`, tdErr);
        this.runLocalAudit(leadId, lead.website, lead.business_name, lead.slot_id);
      }
    } else {
      // Execute local high-speed audit engine and store results & PDF
      logPipeline('SENT_TO_TD', `TD webhook not configured — running local audit for "${lead.business_name}" (${lead.website}) [${slotLabel}]`);
      this.runLocalAudit(leadId, lead.website, lead.business_name, lead.slot_id);
    }
  }

  /**
   * Executes local website diagnostic & generates PDF report
   */
  private async runLocalAudit(leadId: string, website: string, businessName: string, slotId?: string | null): Promise<void> {
    const slotLabel = slotId ? `Slot ${slotId}` : 'Unassigned';
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
      logPipeline('RECEIVED_JSON', `Local audit JSON ready for ${slotLabel}: "${businessName}" (Score: ${report.overallScore || 50}/100, Findings: ${findings.length})`);
    } catch (err: any) {
      console.error(`[FiveSlotSenderService] Local audit failed for ${leadId}:`, err?.message);
      logPipelineError('Local Audit', `Audit failed for "${businessName}" [${slotLabel}] (${website})`, err);
      await this.isolateAuditFailure({
        leadId,
        company: businessName,
        website,
        slotId,
        manualReason: 'Audit crawl failure',
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
   * Computes the deterministic slot grid for any wall-clock time using configurable
   * slot_cycle_min and per-slot offsets (default 10m cycle, A=0:00, B=2:00, C=4:00, D=6:00, E=8:00).
   */
  computeGridState(now: Date = new Date(), settings: SlotSenderSettings) {
    const nowSec = Math.floor(now.getTime() / 1000);
    const anchorSec = Math.floor(new Date(settings.anchor_timestamp).getTime() / 1000);
    const cycleSec = Math.max(5, Math.round(settings.slot_cycle_min * 60));
    const fallbackStepSec = Math.max(1, Math.round(settings.slot_offset_min * 60));
    const offsetsMin = this.resolveSlotOffsetsMin(settings);
    const offsetsSec = offsetsMin.map((m) => Math.max(0, Math.min(cycleSec - 1, Math.round(m * 60))));
    const windowEndsSec = SLOTS.map((_, idx) => {
      const start = offsetsSec[idx];
      const nextOffset = idx < SLOTS.length - 1 ? offsetsSec[idx + 1] : Math.min(cycleSec, start + fallbackStepSec);
      return Math.min(cycleSec, Math.max(start + 1, nextOffset));
    });

    // If anchor_timestamp is scheduled in the future (initial first-send wait window),
    // no slot is active yet and all 5 slots show their true upcoming start times.
    if (nowSec < anchorSec) {
      const slotTimes: Record<SlotId, { nextSec: number; nextDate: Date; windowEndSec: number; slotCycleIndex: number }> = {} as any;
      SLOTS.forEach((slot, idx) => {
        const targetSec = anchorSec + offsetsSec[idx];
        const endSec = anchorSec + windowEndsSec[idx];
        slotTimes[slot] = {
          nextSec: targetSec,
          nextDate: new Date(targetSec * 1000),
          windowEndSec: endSec,
          slotCycleIndex: 0,
        };
      });
      return {
        nowSec,
        cycleIndex: -1,
        cycleStartSec: anchorSec,
        offsetInCycle: 0,
        currentActiveSlot: null,
        slotTimes,
      };
    }

    const elapsed = Math.max(0, nowSec - anchorSec);
    const cycleIndex = Math.floor(elapsed / cycleSec);
    const cycleStartSec = anchorSec + cycleIndex * cycleSec;
    const offsetInCycle = elapsed % cycleSec;

    // Which slot window [start, end) contains offsetInCycle
    let activeSlotIdx = -1;
    for (let idx = 0; idx < SLOTS.length; idx++) {
      if (offsetInCycle >= offsetsSec[idx] && offsetInCycle < windowEndsSec[idx]) {
        activeSlotIdx = idx;
        break;
      }
    }
    const currentActiveSlot: SlotId | null = activeSlotIdx >= 0 ? SLOTS[activeSlotIdx] : null;

    // Next scheduled send times for each slot A-E
    const slotTimes: Record<SlotId, { nextSec: number; nextDate: Date; windowEndSec: number; slotCycleIndex: number }> = {} as any;

    SLOTS.forEach((slot, idx) => {
      const slotTimeInThisCycle = cycleStartSec + offsetsSec[idx];
      const slotEndInThisCycle = cycleStartSec + windowEndsSec[idx];
      if (nowSec < slotEndInThisCycle) {
        // Upcoming or currently active in this cycle
        slotTimes[slot] = {
          nextSec: slotTimeInThisCycle,
          nextDate: new Date(slotTimeInThisCycle * 1000),
          windowEndSec: slotEndInThisCycle,
          slotCycleIndex: cycleIndex,
        };
      } else {
        // Already passed in current cycle; next turn is in cycleIndex + 1
        const nextCycleSec = cycleStartSec + cycleSec + offsetsSec[idx];
        const nextCycleEndSec = cycleStartSec + cycleSec + windowEndsSec[idx];
        slotTimes[slot] = {
          nextSec: nextCycleSec,
          nextDate: new Date(nextCycleSec * 1000),
          windowEndSec: nextCycleEndSec,
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
   * Computes earliest eligible turn timestamp >= now honoring both the slot window
   * and DB-persisted cooldown (now >= last_turn_at + cycleMs).
   */
  computeNextTurnAt(
    now: Date,
    slotWindow: { nextSec: number; windowEndSec: number },
    lastTurnAtIso: string | null,
    cycleMs: number
  ): string {
    let winStartMs = slotWindow.nextSec * 1000;
    let winEndMs = slotWindow.windowEndSec * 1000;
    const cooldownReadyMs = lastTurnAtIso ? new Date(lastTurnAtIso).getTime() + cycleMs : 0;
    const nowMs = now.getTime();

    for (let i = 0; i < 20; i++) {
      const earliestInWindowMs = Math.max(winStartMs, cooldownReadyMs);
      if (earliestInWindowMs < winEndMs) {
        if (nowMs >= winStartMs && nowMs < winEndMs && nowMs >= cooldownReadyMs) {
          return new Date(nowMs).toISOString();
        }
        return new Date(Math.max(earliestInWindowMs, winStartMs)).toISOString();
      }
      winStartMs += cycleMs;
      winEndMs += cycleMs;
    }

    return new Date(Math.max(winStartMs, cooldownReadyMs)).toISOString();
  }

  /**
   * Global scheduler tick (Single timer, never bursts on restart)
   * Protected with strict re-entrancy + per-slot DB/in-memory in-flight lock + last_turn_at gating
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
      bypassLeaderLock?: boolean;
      bypassTurnGate?: boolean;
      forceSend?: boolean;
    }
  ): Promise<{
    activeSlot: SlotId | null;
    dispatched: boolean;
    dispatchedCount?: number;
    leadId?: string;
    reason?: string;
    circuitBreakerTripped?: boolean;
  }> {
    if (this.isTickRunning) {
      return { activeSlot: null, dispatched: false, reason: 'Tick already in progress (re-entrancy guard)' };
    }

    this.isTickRunning = true;
    try {
      if (this.pendingTurnResetPromise) {
        await this.pendingTurnResetPromise;
        this.pendingTurnResetPromise = null;
      }

      const isForced = testOptions?.forceSend === true;
      const bypassWindow = Boolean(isForced || testOptions?.bypassWindow);
      const bypassMinGap = Boolean(isForced || testOptions?.bypassMinGap);
      const bypassDailyCap = Boolean(isForced || testOptions?.bypassDailyCap);
      const bypassTurnGate = Boolean(isForced || testOptions?.bypassTurnGate);

      const now = overrideDate || new Date();

      // 0. Check settings.is_active & circuit breaker FIRST before mutating/assigning leads!
      const settings = await this.getSettings();
      if (!settings.is_active || this.isCircuitBreakerTripped) {
        return {
          activeSlot: null,
          dispatched: false,
          reason: this.circuitBreakerAlert || 'Scheduler stopped/paused in settings',
          circuitBreakerTripped: this.isCircuitBreakerTripped,
        };
      }

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

      // PostgreSQL Advisory Lock Leader Election: Only ONE scheduler leader may run against this database
      if (!this.isLeader && !testOptions?.bypassLeaderLock) {
        const acquired = await this.acquireLeaderLock();
        if (!acquired) {
          return {
            activeSlot: null,
            dispatched: false,
            reason: `Scheduler standby: PostgreSQL advisory lock (${this.ADVISORY_LOCK_ID}) held by another active leader instance on this database`,
          };
        }
      }

      // Clear deleted/invalid slot assignments first and respect scoped active_list_id (never re-pull older lists)
      await this.clearDeletedOrInvalidSlotAssignments().catch(() => {});

      let scopedListId = settings.active_list_id || undefined;
      if (scopedListId && !filterTestBatch) {
        const listExistsRes = await query<{ id: string }>(`SELECT id FROM lists WHERE id = $1`, [scopedListId]);
        if (listExistsRes.rows.length === 0) {
          await this.updateSettings({ active_list_id: null });
          await query(
            `UPDATE leads SET slot_id = NULL, slot_assigned_at = NULL, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW() WHERE slot_id IS NOT NULL`
          );
          scopedListId = undefined;
        }
      }

      if (!filterTestBatch) {
        await this.autoAssignUnassignedLeads({
          listId: scopedListId,
        }).catch((err) => {
          console.warn('[FiveSlotSenderService] Auto-assign error during tick:', err?.message);
        });
      }

      // Empty-queue Standby Guard (non-forced production ticks): stay idle unless there are leads awaiting outreach
      if (!filterTestBatch && !isForced) {
        const pendingParams: any[] = [];
        let pendingListFilter = '';
        if (scopedListId) {
          pendingParams.push(scopedListId);
          pendingListFilter = `AND (slot_id IS NOT NULL OR id IN (SELECT lead_id FROM lead_list_memberships WHERE list_id = $${pendingParams.length}))`;
        }
        const pendingCheck = await query<{ has_pending: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM leads
             WHERE deleted_at IS NULL
               AND (status = 'active' OR status = 'queued' OR status IS NULL)
               AND (consent_status = 'none' OR consent_status IS NULL)
               ${pendingListFilter}
               AND (
                 outreach_stage IS NULL
                 OR outreach_stage = 'initial'
                 OR outreach_stage = 'sending'
                 OR (outreach_stage = 'followup_1' AND last_contacted_at <= NOW() - INTERVAL '48 hours')
                 OR (outreach_stage = 'followup_2' AND last_contacted_at <= NOW() - INTERVAL '72 hours')
               )
           ) AS has_pending`,
          pendingParams
        );
        if (!pendingCheck.rows[0]?.has_pending) {
          logPipelineThrottled(
            'tick-status',
            Number.MAX_SAFE_INTEGER,
            'EMAIL_COUNTDOWN',
            'Scheduler standby: No leads waiting in queue to send',
            'standby'
          );
          return {
            activeSlot: null,
            dispatched: false,
            reason: 'Standby: No leads waiting in queue to send',
          };
        }
      }

      // 1. Stale-Claim Reaper: Recover any crashed claims with duplicate-send protection
      await this.reapStaleSendingClaims();

      // 2. Rolling Audit JIT Dispatcher: Ensure top queued leads are in flight to TD
      await this.dispatchRollingAudits(filterTestBatch);

      // 3. Compute Deterministic Grid
      const grid = this.computeGridState(now, settings);
      let activeSlot = grid.currentActiveSlot;

      if (!activeSlot) {
        if (grid.cycleIndex < 0 && !isForced) {
          const waitSec = Math.max(1, grid.cycleStartSec - grid.nowSec);
          const startClock = new Date(grid.cycleStartSec * 1000).toTimeString().slice(0, 8);
          logPipelineThrottled(
            'tick-status',
            30000,
            'EMAIL_COUNTDOWN',
            `Email will start in ${formatDuration(waitSec)} (scheduled start at ${startClock})`,
            'first-send-wait'
          );
          return {
            activeSlot: null,
            dispatched: false,
            reason: `Waiting for scheduled first send in ${waitSec}s`,
          };
        }
        if (isForced) {
          activeSlot = 'A';
        } else {
          const upcoming = SLOTS.map((slot) => ({
            slot,
            waitSec: Math.max(1, grid.slotTimes[slot].nextSec - grid.nowSec),
          })).sort((a, b) => a.waitSec - b.waitSec)[0];
          logPipelineThrottled(
            'tick-status',
            30000,
            'EMAIL_COUNTDOWN',
            `Email will start in ${formatDuration(upcoming.waitSec)} (next turn: Slot ${upcoming.slot})`,
            `between-${upcoming.slot}`
          );
          return { activeSlot: null, dispatched: false, reason: 'Between slot offset windows' };
        }
      }

      // Ensure this slot has not already dispatched during this cycle window
      const cycleMs = Math.max(5000, Math.round((settings.slot_cycle_min || 10) * 60 * 1000));
      const lastCycle = this.lastSlotCycleDispatched.get(activeSlot);
      if (!bypassTurnGate && lastCycle === grid.cycleIndex) {
        return { activeSlot, dispatched: false, reason: `Slot ${activeSlot} already dispatched in cycle ${grid.cycleIndex}` };
      }

      // DB-persisted Turn Cooldown Gate: A slot may run only if now >= last_turn_at + cycleMs
      const turnStates = await this.getTurnStatesMap();
      const slotTurn = turnStates.get(activeSlot);
      if (slotTurn?.inFlight) {
        return { activeSlot, dispatched: false, reason: `Slot ${activeSlot} turn already in flight` };
      }
      if (!bypassTurnGate && slotTurn?.lastTurnAt) {
        const lastTurnMs = new Date(slotTurn.lastTurnAt).getTime();
        if (now.getTime() < lastTurnMs + cycleMs) {
          const remainingSec = Math.ceil((lastTurnMs + cycleMs - now.getTime()) / 1000);
          logPipelineThrottled(
            'tick-status',
            30000,
            'EMAIL_COUNTDOWN',
            `Slot ${activeSlot} next turn in ${formatDuration(remainingSec)}`,
            `turn-cooldown-${activeSlot}`
          );
          return {
            activeSlot,
            dispatched: false,
            reason: `Slot ${activeSlot} turn cooldown active (last_turn_at=${slotTurn.lastTurnAt}, ${remainingSec}s remaining)`,
          };
        }
      }

      // Item 3: Global Minimum-Gap Guard across all slots:
      // Guarantees slots never send simultaneously while absorbing real-world tick jitter.
      const defaultGlobalGapSec = Math.max(5, Math.floor(settings.slot_offset_min * 60 * 0.75));
      const globalMinGapSec = settings.global_min_gap_sec !== undefined ? settings.global_min_gap_sec : defaultGlobalGapSec;
      const globalMinGapMs = globalMinGapSec * 1000;

      if (
        !bypassMinGap &&
        this.lastGlobalSentEpochMs > 0 &&
        now.getTime() >= this.lastGlobalSentEpochMs &&
        now.getTime() - this.lastGlobalSentEpochMs < globalMinGapMs
      ) {
        const remainingSec = Math.ceil((globalMinGapMs - (now.getTime() - this.lastGlobalSentEpochMs)) / 1000);
        logPipelineThrottled(
          'tick-status',
          30000,
          'EMAIL_COUNTDOWN',
          `Email will start in ${formatDuration(remainingSec)} (Slot ${activeSlot} waiting for ${globalMinGapSec}s anti-ban gap)`,
          `min-gap-${activeSlot}`
        );
        return {
          activeSlot,
          dispatched: false,
          reason: `Global minimum-gap guard active: must wait at least ${globalMinGapSec}s between sends across all slots (${remainingSec}s remaining). Zero double-sends globally.`,
        };
      }

      // Per-slot memory cooldown guard aligned with strict cycleMs
      const lastSentTime = this.lastSlotSentEpochMs.get(activeSlot);
      if (!bypassTurnGate && lastSentTime && now.getTime() >= lastSentTime && now.getTime() - lastSentTime < cycleMs) {
        const remainingSec = Math.ceil((cycleMs - (now.getTime() - lastSentTime)) / 1000);
        logPipelineThrottled(
          'tick-status',
          30000,
          'EMAIL_COUNTDOWN',
          `Slot ${activeSlot} next email will start in ${formatDuration(remainingSec)}`,
          `slot-gap-${activeSlot}`
        );
        return {
          activeSlot,
          dispatched: false,
          reason: `Slot ${activeSlot} cooldown active: must wait full cycle length between turns (${remainingSec}s remaining).`,
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

      const is24_7 = settings.send_window_start_hour === 0 && settings.send_window_end_hour >= 24 && !settings.weekdays_only;

      if (!bypassWindow && !is24_7) {
        if (settings.weekdays_only && (currentDay === 0 || currentDay === 6)) {
          logPipelineThrottled('tick-status', 60000, 'EMAIL_COUNTDOWN', `Paused outside send window: weekend resting (${marketTz})`, 'weekend');
          return { activeSlot, dispatched: false, reason: `Outside send window: Weekend resting (${marketTz})` };
        }

        if (currentHour < settings.send_window_start_hour || currentHour >= settings.send_window_end_hour) {
          logPipelineThrottled(
            'tick-status',
            60000,
            'EMAIL_COUNTDOWN',
            `Paused outside send window (${settings.send_window_start_hour}:00-${settings.send_window_end_hour}:00 ${marketTz})`,
            'send-window'
          );
          return {
            activeSlot,
            dispatched: false,
            reason: `Outside send window (${settings.send_window_start_hour}:00 - ${settings.send_window_end_hour}:00 ${marketTz})`,
          };
        }
      }

      // Check daily mailbox cap in configured send-window timezone (excluding mock sends)
      if (!bypassDailyCap) {
        const metricRes = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM messages 
           WHERE direction = 'outbound' 
             AND status IN ('sent', 'delivered')
             AND (metadata->>'is_mock' IS NULL OR metadata->>'is_mock' != 'true')
             AND sent_at >= (NOW() AT TIME ZONE $1)::date AT TIME ZONE $1`,
          [marketTz]
        );
        const sentToday = parseInt(metricRes.rows[0]?.count || '0', 10);
        const capLimit = settings.daily_send_limit ?? 150;
        if (sentToday >= capLimit) {
          logPipelineThrottled(
            'tick-status',
            60000,
            'EMAIL_COUNTDOWN',
            `Daily send limit reached (${sentToday}/${capLimit} in ${marketTz}) — waiting for next window`,
            'daily-cap'
          );
          return {
            activeSlot,
            dispatched: false,
            reason: `Daily send limit reached (${sentToday}/${capLimit} emails today in ${marketTz})`,
          };
        }
      }

      // Acquire atomic per-slot in-flight lock (in-memory + DB)
      const slotLock = await this.claimSlotInFlight(activeSlot);
      if (!slotLock.claimed) {
        return { activeSlot, dispatched: false, reason: `Slot ${activeSlot} turn in-flight lock held` };
      }

      let sendAttemptedCount = 0;
      const dispatchedLeadIds: string[] = [];

      try {
        // Re-verify last_turn_at after claiming lock
        if (!bypassTurnGate && slotLock.lastTurnAt) {
          const lockedLastMs = new Date(slotLock.lastTurnAt).getTime();
          if (now.getTime() < lockedLastMs + cycleMs) {
            return {
              activeSlot,
              dispatched: false,
              reason: `Slot ${activeSlot} turn cooldown active (last_turn_at=${slotLock.lastTurnAt})`,
            };
          }
        }

        const batchLimit = Math.max(1, settings.slot_batch_size ?? 1);
        clearPipelineThrottle('tick-status');

        console.log(
          `[FiveSlotSenderService] ⏱️ Slot ${activeSlot} turn started in Cycle ${grid.cycleIndex} (batchLimit=${batchLimit}, window=${now.toISOString()}).`
        );

        const attemptedLeadIds = new Set<string>();
        let lastFailureResult: { activeSlot: SlotId; dispatched: false; leadId: string; reason: string; circuitBreakerTripped?: boolean } | null = null;
        let lastSkipReason: string | undefined;

        for (let batchIdx = 0; batchIdx < batchLimit; batchIdx++) {
          if (this.isCircuitBreakerTripped || this.quotaPauseUntil) break;

          // 5. Query candidate leads for this slot (LIMIT 25 so unready or running leads do not block ready ones)
          const testFilterClause = filterTestBatch ? `AND notes = $3` : '';
          const bypassCooldown = Boolean(bypassWindow || isForced);
          const queryParams: any[] = [activeSlot, bypassCooldown];
          if (filterTestBatch) {
            queryParams.push(filterTestBatch);
          }
          let unassignedScopeClause = '';
          if (scopedListId && !filterTestBatch) {
            queryParams.push(scopedListId);
            unassignedScopeClause = ` AND id IN (SELECT lead_id FROM lead_list_memberships WHERE list_id = $${queryParams.length})`;
          }

          const candidateQuery = await query<{
            id: string;
            business_name: string;
            website: string;
            email: string;
            phone?: string | null;
            whatsapp?: string | null;
            slot_id: SlotId;
            outreach_stage: string;
            audit_status: string;
            audit_findings: any;
            audit_key_takeaways?: string | null;
            audit_pdf_path: string;
            audit_pdf_name?: string | null;
            audit_score?: number | null;
            audit_retry_count: number;
            audit_requested_at: string | null;
            location?: string | null;
            country?: string | null;
            metadata?: any;
          }>(
            `SELECT id, business_name, website, email, phone, whatsapp, slot_id, outreach_stage, audit_status, audit_findings, audit_key_takeaways, audit_pdf_path, audit_pdf_name, audit_score, audit_retry_count, audit_requested_at, location, country, metadata
             FROM leads
             WHERE deleted_at IS NULL
               AND (status = 'active' OR status = 'queued' OR status IS NULL)
               AND (consent_status = 'none' OR consent_status IS NULL)
               AND (slot_id = $1 OR (slot_id IS NULL AND $1 = 'A'${unassignedScopeClause}))
               AND (outreach_stage IS NULL OR outreach_stage NOT IN ('sending', 'completed', 'followup_3', 'skipped_no_opportunity'))
               AND (
                 ((outreach_stage IS NULL OR outreach_stage = 'initial') AND (last_contacted_at IS NULL OR last_contacted_at <= NOW() - INTERVAL '24 hours' OR $2 = true))
                 OR (outreach_stage = 'followup_1' AND (last_contacted_at <= NOW() - INTERVAL '48 hours' OR $2 = true))
                 OR (outreach_stage = 'followup_2' AND (last_contacted_at <= NOW() - INTERVAL '72 hours' OR $2 = true))
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
               -- Prioritize leads whose audit is ready (0); leads awaiting audit go to waiting list and are sent last (1)
               CASE 
                 WHEN (outreach_stage = 'followup_1' OR outreach_stage = 'followup_2') THEN 0
                 WHEN audit_status IN ('ready', 'audit_completed') AND (
                   (audit_pdf_path IS NOT NULL AND audit_pdf_path != '') 
                   OR (audit_findings IS NOT NULL AND audit_findings::text != '[]') 
                   OR (audit_key_takeaways IS NOT NULL AND audit_key_takeaways != '')
                 ) THEN 0
                 ELSE 1
               END ASC,
               created_at ASC
             LIMIT 25`,
            queryParams
          );

          const remainingCandidates = candidateQuery.rows.filter((c) => !attemptedLeadIds.has(c.id));
          if (remainingCandidates.length === 0) {
            if (batchIdx === 0) {
              console.log(`[FiveSlotSenderService] Slot ${activeSlot}: No due leads in queue.`);
              lastSkipReason = lastSkipReason || 'Queue empty for slot';
            }
            break;
          }

          // 6. Iterate through candidate leads with Head-Of-Line non-blocking logic:
          let readyCandidate: typeof remainingCandidates[0] | null = null;

          for (const candidate of remainingCandidates) {
            attemptedLeadIds.add(candidate.id);

            // Channel Guard: isolate uncontactable leads once rather than letting them crash SMTP/send ticks
            const hasEmailChannel = Boolean(candidate.email && candidate.email.includes('@'));
            const candidatePhoneDigits = ((candidate.whatsapp || candidate.phone || '').trim()).replace(/\D/g, '');
            if (!hasEmailChannel && candidatePhoneDigits.length < 8) {
              const { leadIsolationService } = await import('./leadIsolationService');
              await leadIsolationService.isolateFailedLead(
                candidate.id,
                'No Email or WhatsApp contact channels available for lead'
              );
              await query(
                `UPDATE leads SET status = 'manual_review', slot_id = NULL, manual_review_reason = 'No Email or WhatsApp contact channels available for lead', updated_at = NOW() WHERE id = $1`,
                [candidate.id]
              );
              await failureLogService.logFailure({
                leadId: candidate.id,
                company: candidate.business_name,
                website: candidate.website,
                email: candidate.email,
                slotId: activeSlot,
                stage: candidate.outreach_stage || 'initial',
                type: 'SEND_FAILED',
                errorMessage: 'No Email or WhatsApp contact channels available for lead',
              });
              continue;
            }

            // Recipient Timezone Window Check (09:00 - 17:00 recipient local time, Monday-Friday)
            const recipientTz = resolveRecipientTimezone(
              candidate.metadata?.timezone,
              candidate.location,
              candidate.country,
              settings.send_window_timezone || 'UTC'
            );

            if (!bypassWindow) {
              const windowCheck = isWithinRecipientWindow(
                now,
                recipientTz,
                settings.send_window_start_hour ?? 9,
                settings.send_window_end_hour ?? 17,
                settings.weekdays_only !== false
              );
              if (!windowCheck.inWindow) {
                console.log(
                  `[FiveSlotSenderService] ⏸️ Skipping lead "${candidate.business_name}" (${candidate.id}): ${windowCheck.reason}`
                );
                continue; // Evaluate next candidate in slot whose local business hours are open
              }
            }

            // Auto-ensure valid PDF file on disk if lead has completed audit and stored findings/takeaways
            if (!isValidPdfFile(candidate.audit_pdf_path) && (candidate.audit_findings || candidate.audit_key_takeaways)) {
              try {
                const ensured = await technicalAuditPdfService.ensurePdfForLead(candidate);
                if (ensured) {
                  candidate.audit_pdf_path = ensured.pdfPath;
                  candidate.audit_pdf_name = ensured.pdfName;
                }
              } catch (ensureErr: any) {
                console.warn(`[FiveSlotSenderService] PDF ensure error for lead ${candidate.id}:`, ensureErr?.message);
              }
            }

            const validation = validateAuditAsset(
              candidate.audit_findings,
              candidate.audit_pdf_path,
              candidate.audit_score,
              candidate.audit_key_takeaways
            );

            const isAuditComplete = candidate.audit_status === 'ready' || candidate.audit_status === 'audit_completed';

            // Item 12: Clean sites: honor noOpportunity ONLY for complete audits
            // Use separate status 'skipped_no_opportunity' AND outreach_stage 'skipped_no_opportunity'; 0 failure_log rows, 0 emails sent.
            if (isAuditComplete && validation.noOpportunity) {
              console.log(`[FiveSlotSenderService] 🟢 Clean site detected for "${candidate.business_name}": Complete audit found 0 flaws. Marking status = 'skipped_no_opportunity', outreach_stage = 'skipped_no_opportunity'.`);
              await query(
                `UPDATE leads 
                 SET status = 'skipped_no_opportunity', 
                     outreach_stage = 'skipped_no_opportunity', 
                     manual_review_reason = 'Clean site: 0 technical flaws detected in complete audit (skipped_no_opportunity)',
                     updated_at = NOW() 
                 WHERE id = $1`,
                [candidate.id]
              );
              continue;
            }

            const isFollowUp = candidate.outreach_stage === 'followup_1' || candidate.outreach_stage === 'followup_2';
            if (!isFollowUp && (!isAuditComplete || !validation.ready)) {
              // Guard against missing/invalid/CDN asset URLs before attempting or retrying an audit
              if (!workflowRoutingService.hasValidWebsite(candidate.website)) {
                await this.isolateAuditFailure({
                  leadId: candidate.id,
                  company: candidate.business_name,
                  website: candidate.website,
                  email: candidate.email,
                  slotId: activeSlot,
                  stage: candidate.outreach_stage || 'initial',
                  manualReason: 'No valid website to audit',
                  errorMessage: 'Cannot audit lead: Website URL is missing or invalid',
                  failureType: 'AUDIT_FAILED',
                  attempts: 1,
                });
                continue;
              }

              const requestedAtMs = candidate.audit_requested_at ? new Date(candidate.audit_requested_at).getTime() : 0;
              const isTimedOut = !requestedAtMs || Date.now() - requestedAtMs > 15 * 60 * 1000;
              const isAuditRunning = candidate.audit_status === 'pending' && !isTimedOut;

              // Head-of-line: if audit is still actively running, DO NOT count as a retry!
              if (isAuditRunning) {
                console.log(
                  `[FiveSlotSenderService] ⏳ Slot ${activeSlot} lead "${candidate.business_name}" (${candidate.id}) audit is in progress (pending). Added to waiting list (will be sent in last).`
                );
                await query(`UPDATE leads SET created_at = NOW(), updated_at = NOW() WHERE id = $1`, [candidate.id]);
                continue;
              }

              if (candidate.audit_status === 'failed') {
                await this.isolateAuditFailure({
                  leadId: candidate.id,
                  company: candidate.business_name,
                  website: candidate.website,
                  email: candidate.email,
                  slotId: activeSlot,
                  stage: candidate.outreach_stage || 'initial',
                  manualReason: 'Audit failed in TD',
                  errorMessage: 'Technical audit failed for website',
                  failureType: 'AUDIT_FAILED',
                  attempts: 1,
                });
                continue;
              }

              // If timed out or missing PDF on a "ready" status:
              const retries = (candidate.audit_retry_count || 0) + 1;
              console.warn(
                `[FiveSlotSenderService] ⚠️ Slot ${activeSlot} lead "${candidate.business_name}" audit not ready (Status: ${candidate.audit_status}, Ready: ${validation.ready}). Retry count: ${retries}/${settings.max_audit_retries}.`
              );

              if (retries >= settings.max_audit_retries) {
                const failureType: 'AUDIT_FAILED' | 'AUDIT_TIMEOUT' | 'PDF_MISSING' =
                  !isValidPdfFile(candidate.audit_pdf_path) && isAuditComplete
                    ? 'PDF_MISSING'
                    : candidate.audit_status === 'failed'
                    ? 'AUDIT_FAILED'
                    : 'AUDIT_TIMEOUT';

                await this.isolateAuditFailure({
                  leadId: candidate.id,
                  company: candidate.business_name,
                  website: candidate.website,
                  email: candidate.email,
                  slotId: activeSlot,
                  stage: candidate.outreach_stage || 'initial',
                  manualReason: 'Audit not ready after 3 retries (Timeout / PDF Missing)',
                  errorMessage: `Audit incomplete after ${retries} retries: Status is "${candidate.audit_status}", reason: ${validation.reason || 'Timeout'}`,
                  failureType,
                  attempts: retries,
                });
                await query(
                  `UPDATE leads SET audit_retry_count = $1, updated_at = NOW() WHERE id = $2`,
                  [retries, candidate.id]
                );
              } else {
                console.log(
                  `[FiveSlotSenderService] ⏳ Slot ${activeSlot} lead "${candidate.business_name}" (${candidate.id}) audit not ready. Added to waiting list (will be sent in last).`
                );
                await query(
                  `UPDATE leads 
                   SET audit_retry_count = $1, 
                       created_at = NOW(), 
                       updated_at = NOW() 
                   WHERE id = $2`,
                  [retries, candidate.id]
                );
                this.triggerAuditForLead(candidate.id).catch(() => {});
              }

              continue;
            }

            // Re-check suppression at send time!
            const suppCheck = await suppressionService.isSuppressed({ email: candidate.email });
            if (suppCheck.suppressed) {
              console.warn(`[FiveSlotSenderService] 🚫 Lead ${candidate.id} (${candidate.email}) suppressed at send time (${suppCheck.reason}). Skipping.`);
              if (suppCheck.reason === 'hard_bounce') {
                await query(`UPDATE leads SET status = 'manual_review', manual_review_reason = 'Suppressed: hard_bounce', updated_at = NOW() WHERE id = $1`, [candidate.id]);
              } else {
                await query(`UPDATE leads SET consent_status = 'opted_out', status = 'inactive', updated_at = NOW() WHERE id = $1`, [candidate.id]);
              }
              continue;
            }

            // Found a verified ready & unsuppressed candidate!
            readyCandidate = candidate;
            break;
          }

          if (!readyCandidate) {
            if (dispatchedLeadIds.length === 0) {
              lastSkipReason = lastSkipReason || `Slot ${activeSlot} candidates are awaiting audit completion (added to waiting list; will be sent in last).`;
            }
            break;
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
            lastSkipReason = lastSkipReason || 'Atomic claim conflict';
            continue;
          }

          // 8. DISPATCH OUTREACH:
          const mailbox = await this.getMailboxForSlot(SLOTS.indexOf(activeSlot));
          console.log(`[FiveSlotSenderService] 🚀 Dispatching Slot ${activeSlot} lead "${candidate.business_name}" (${batchIdx + 1}/${batchLimit}) via mailbox [${mailbox.email}]...`);
          sendAttemptedCount++;

          try {
            const result = await stageOutreachService.sendNextStageToLead(candidate.id, prevStage);

            if (result.success && !result.skipped) {
              this.consecutiveAuthFailures = 0;
              this.isCircuitBreakerTripped = false;
              this.lastSlotSentEpochMs.set(activeSlot, now.getTime());
              this.lastGlobalSentEpochMs = now.getTime();
              dispatchedLeadIds.push(candidate.id);
              await query(`UPDATE leads SET transient_retry_count = 0, send_retry_count = 0 WHERE id = $1`, [candidate.id]);
              const dispatchedChannels = result.channelsDispatched && result.channelsDispatched.length > 0
                ? result.channelsDispatched
                : ['email'];
              for (const ch of dispatchedChannels) {
                await this.recordSlotSendHistory({
                  slotId: activeSlot,
                  leadId: candidate.id,
                  businessName: candidate.business_name,
                  recipientEmail: candidate.email || null,
                  recipientPhone: candidate.whatsapp || candidate.phone || null,
                  mailboxEmail: result.mailboxEmail || null,
                  channel: ch,
                  stage: result.stage || prevStage || 'initial',
                  subject: ch === 'email' ? (result.subject || '') : '',
                  messageBody: result.body || '',
                  pdfFilename: ch === 'email' ? (result.pdfFilename || candidate.audit_pdf_name || null) : null,
                  status: 'sent',
                  externalMessageId: ch === 'email' ? (result.externalMessageId || null) : null,
                  preferredListId: scopedListId || null,
                });
              }
              console.log(`[FiveSlotSenderService] ✅ Slot ${activeSlot} successfully sent to "${candidate.business_name}" [${result.stageLabel}].`);
              logPipeline(
                'EMAIL_SENT',
                `Slot ${activeSlot} finished outreach to "${candidate.business_name}" (${candidate.email || 'no-email'}) [${result.stageLabel}]`
              );
            } else if (
              result.skipped &&
              (result.stage === 'completed' || /maximum outreach touches|already reached|already replied|opted out/i.test(result.reason || ''))
            ) {
              const isCompleted = result.stage === 'completed' || /maximum outreach touches|already reached/i.test(result.reason || '');
              const nextStage = isCompleted ? 'completed' : prevStage;
              await query(
                `UPDATE leads
                 SET outreach_stage = $1,
                     status = CASE WHEN $2 THEN 'completed' ELSE status END,
                     claimed_stage = NULL,
                     claimed_at = NULL,
                     updated_at = NOW()
                 WHERE id = $3`,
                [nextStage, isCompleted, candidate.id]
              );
              console.log(`[FiveSlotSenderService] ⏭️ Slot ${activeSlot} skipped "${candidate.business_name}": ${result.reason}`);
              lastSkipReason = result.reason || 'Lead skipped (completed/replied/opted out)';
            } else {
              console.warn(`[FiveSlotSenderService] Slot ${activeSlot} send failed for lead ${candidate.id}: ${result.reason}`);
              await this.recordSlotSendHistory({
                slotId: activeSlot,
                leadId: candidate.id,
                businessName: candidate.business_name,
                recipientEmail: candidate.email || null,
                recipientPhone: candidate.whatsapp || candidate.phone || null,
                mailboxEmail: result.mailboxEmail || null,
                channel: candidate.email ? 'email' : 'whatsapp',
                stage: result.stage || prevStage || 'initial',
                subject: result.subject || '',
                messageBody: result.body || '',
                pdfFilename: result.pdfFilename || candidate.audit_pdf_name || null,
                status: 'failed',
                errorMessage: result.reason || 'Send failed in stage outreach service',
                preferredListId: scopedListId || null,
              });
              lastFailureResult = await this.handleDispatchFailure(candidate, prevStage, activeSlot, result.reason || 'Send failed in stage outreach service');
            }
          } catch (sendErr: any) {
            console.error(`[FiveSlotSenderService] Dispatch exception for lead ${candidate.id}:`, sendErr?.message);
            await this.recordSlotSendHistory({
              slotId: activeSlot,
              leadId: candidate.id,
              businessName: candidate.business_name,
              recipientEmail: candidate.email || null,
              recipientPhone: candidate.whatsapp || candidate.phone || null,
              channel: candidate.email ? 'email' : 'whatsapp',
              stage: prevStage || 'initial',
              subject: '',
              messageBody: '',
              pdfFilename: candidate.audit_pdf_name || null,
              status: 'failed',
              errorMessage: sendErr?.message || 'SMTP or dispatch exception',
              preferredListId: scopedListId || null,
            });
            lastFailureResult = await this.handleDispatchFailure(candidate, prevStage, activeSlot, sendErr?.message || 'SMTP or dispatch exception');
          }
        }

        if (dispatchedLeadIds.length > 0) {
          this.lastSlotCycleDispatched.set(activeSlot, grid.cycleIndex);
          return {
            activeSlot,
            dispatched: true,
            dispatchedCount: dispatchedLeadIds.length,
            leadId: dispatchedLeadIds[0],
          };
        }

        if (lastFailureResult) {
          return lastFailureResult;
        }

        return {
          activeSlot,
          dispatched: false,
          reason: lastSkipReason || `Slot ${activeSlot} turn completed with 0 dispatches.`,
        };
      } finally {
        await this.releaseSlotInFlight(activeSlot, sendAttemptedCount > 0 ? now : null);
      }
    } catch (err: any) {
      console.error('[FiveSlotSenderService] Global tick exception:', err?.message);
      logPipelineError('Scheduler Tick', 'Global tick exception', err);
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
    if (/maximum outreach touches|already reached/i.test(errorMessage)) {
      await query(
        `UPDATE leads
         SET outreach_stage = 'completed',
             status = 'completed',
             claimed_stage = NULL,
             claimed_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [candidate.id]
      );
      return {
        activeSlot,
        dispatched: false,
        leadId: candidate.id,
        reason: errorMessage,
      };
    }

    const classification = classifySmtpError(errorMessage);
    console.warn(`[FiveSlotSenderService] Handling dispatch failure for lead ${candidate.id} [${classification.type}]: ${errorMessage}`);
    logPipelineError(
      `Slot ${activeSlot} | ${classification.type}`,
      `Send failed for "${candidate.business_name}" (${candidate.email || 'no-email'}): ${errorMessage}`
    );

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

    // 2. Mailbox Daily Sending Quota (5.4.5) - Rolling 24-hour timed pause with auto-resume
    if (classification.type === 'daily_limit_pause') {
      let resumeTime: Date;
      try {
        const earliestRes = await query<{ earliest_sent: string }>(
          `SELECT MIN(sent_at) as earliest_sent FROM messages 
           WHERE direction = 'outbound' AND status IN ('sent', 'delivered') AND sent_at >= NOW() - INTERVAL '24 hours'`
        );
        if (earliestRes.rows[0]?.earliest_sent) {
          resumeTime = new Date(new Date(earliestRes.rows[0].earliest_sent).getTime() + 24 * 3600 * 1000);
        } else {
          resumeTime = new Date(Date.now() + 24 * 3600 * 1000);
        }
      } catch {
        resumeTime = new Date(Date.now() + 24 * 3600 * 1000);
      }

      if (resumeTime.getTime() <= Date.now()) {
        resumeTime = new Date(Date.now() + 60 * 60 * 1000);
      }
      this.quotaPauseUntil = resumeTime;
      console.warn(`[FiveSlotSenderService] ⏸️ 5.4.5 Mailbox Daily Quota reached: Rolling 24-hour pause active until ${resumeTime.toISOString()} (resumes 24h after first send in window).`);
      
      // Leave lead untouched in queue for next turn
      await query(
        `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW() WHERE id = $2 AND outreach_stage = 'sending'`,
        [prevStage, candidate.id]
      );
      return {
        activeSlot,
        dispatched: false,
        leadId: candidate.id,
        reason: `5.4.5 Daily Sending Quota exceeded. Rolling 24h pause until ${resumeTime.toISOString()} (auto-resume).`,
      };
    }

    // 3. Recipient Server Policy / Spam Filter Block (550 5.7.1)
    // Recipient-specific block. Only trips breaker if >= 5 distinct domains reject in a short time.
    if (classification.type === 'recipient_policy_block') {
      this.consecutiveAuthFailures = 0;
      const recipientDomain = (candidate.email || '').split('@')[1]?.toLowerCase() || 'unknown.domain';
      const nowMs = Date.now();

      // Prune blocks older than 1 hour (sliding 1-hour window)
      this.recentPolicyBlocks = this.recentPolicyBlocks.filter((b) => nowMs - b.epochMs < 3600 * 1000);
      this.recentPolicyBlocks.push({ domain: recipientDomain, epochMs: nowMs });

      const distinctDomains = new Set(this.recentPolicyBlocks.map((b) => b.domain));
      console.warn(
        `[FiveSlotSenderService] ⚠️ 5.7.1 Recipient Policy Block from "${recipientDomain}". Distinct rejecting domains in last hour: ${distinctDomains.size}/5`
      );

      // Only trip circuit breaker if >= 5 distinct recipient domains reject in a short time
      if (distinctDomains.size >= 5) {
        this.isCircuitBreakerTripped = true;
        this.circuitBreakerAlert = `Circuit breaker tripped: 5 distinct recipient domains rejected messages with 5.7.1 policy blocks in the last hour. Outbound sender paused to protect reputation.`;
        await query(
          `UPDATE slot_sender_settings 
           SET is_active = false, circuit_breaker_tripped = true, updated_at = NOW() 
           WHERE id = 'default'`
        );
        console.error(`[FiveSlotSenderService] 🚨 CIRCUIT BREAKER TRIPPED! 5 distinct recipient domains rejected with 5.7.1.`);
      }

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
          `Recipient policy block cap reached after 3 retries (${classification.message})`
        );
        await failureLogService.logFailure({
          leadId: candidate.id,
          company: candidate.business_name,
          website: candidate.website,
          email: candidate.email,
          slotId: activeSlot,
          stage: prevStage,
          type: 'SEND_FAILED',
          errorMessage: `Recipient policy block cap reached: ${classification.message}`,
          attempts: retries,
        });
        console.warn(`[FiveSlotSenderService] Lead ${candidate.id} quarantined: recipient policy block cap reached.`);
      } else {
        console.warn(`[FiveSlotSenderService] Lead ${candidate.id} recipient policy block (${retries}/3). Left in queue for retry.`);
      }

      return {
        activeSlot,
        dispatched: false,
        leadId: candidate.id,
        reason: `Recipient policy block (5.7.1) from ${recipientDomain}: ${classification.message}`,
        circuitBreakerTripped: this.isCircuitBreakerTripped,
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
    settings: Omit<SlotSenderSettings, 'td_shared_secret' | 'td_callback_secret'> & {
      td_shared_secret_masked: string;
      td_callback_secret_masked?: string;
    };
    activeSlotNow: SlotId | null;
    schedulerState: 'active' | 'standby' | 'stopped' | 'tripped';
    hasPendingLeads: boolean;
    activeList: { id: string; name: string } | null;
    circuitBreaker: {
      tripped: boolean;
      failures: number;
      alert: string | null;
    };
  }> {
    if (this.pendingTurnResetPromise) {
      await this.pendingTurnResetPromise;
      this.pendingTurnResetPromise = null;
    }

    // Self-heal: remove any soft-deleted, inactive, manual_review, or opted-out leads from slot assignments
    await this.clearDeletedOrInvalidSlotAssignments().catch(() => {});

    let rawSettings = await this.getSettings();
    let activeList: { id: string; name: string } | null = null;
    if (rawSettings.active_list_id) {
      const listRes = await query<{ id: string; name: string }>(
        `SELECT id, name FROM lists WHERE id = $1`,
        [rawSettings.active_list_id]
      );
      if (listRes.rows.length > 0) {
        activeList = listRes.rows[0];
      } else {
        // Active scoped list was deleted — clear scope and unassign orphaned leads
        rawSettings = await this.updateSettings({ active_list_id: null });
        await query(
          `UPDATE leads SET slot_id = NULL, slot_assigned_at = NULL, claimed_stage = NULL, claimed_at = NULL, updated_at = NOW() WHERE slot_id IS NOT NULL`
        );
      }
    }

    const now = new Date();
    const grid = this.computeGridState(now, rawSettings);
    const cycleMs = Math.max(5000, Math.round((rawSettings.slot_cycle_min || 10) * 60 * 1000));
    const turnStates = await this.getTurnStatesMap();
    const listScopeClause = activeList
      ? `AND id IN (SELECT lead_id FROM lead_list_memberships WHERE list_id = $1)`
      : '';
    const listScopeParams = activeList ? [activeList.id] : [];

    const countsRes = await query<{
      slot_id: SlotId;
      total_queued: string;
      ready_count: string;
      waiting_audit_count: string;
      sent_count: string;
      received_json_count: string;
      waiting_count: string;
      due_followup_count: string;
      leads_assigned: string;
      leads_done: string;
      last_sent_at: string | null;
    }>(
      `SELECT
         slot_id,
         -- Total active remaining to be sent (decreases as leads reach completed)
         COUNT(*) FILTER (WHERE (status = 'active' OR status = 'queued' OR status IS NULL) AND (consent_status = 'none' OR consent_status IS NULL) AND (outreach_stage IS NULL OR outreach_stage NOT IN ('followup_1', 'followup_2', 'followup_3', 'completed', 'skipped_no_opportunity'))) as total_queued,
         -- Ready to send with audit
         COUNT(*) FILTER (WHERE (status = 'active' OR status = 'queued' OR status IS NULL) AND (consent_status = 'none' OR consent_status IS NULL) AND (outreach_stage IS NULL OR outreach_stage NOT IN ('followup_1', 'followup_2', 'followup_3', 'completed', 'skipped_no_opportunity')) AND audit_status IN ('ready', 'audit_completed') AND audit_pdf_path IS NOT NULL AND audit_pdf_path != '') as ready_count,
         -- Waiting for audit
         COUNT(*) FILTER (WHERE (status = 'active' OR status = 'queued' OR status IS NULL) AND (consent_status = 'none' OR consent_status IS NULL) AND (outreach_stage IS NULL OR outreach_stage NOT IN ('followup_1', 'followup_2', 'followup_3', 'completed', 'skipped_no_opportunity')) AND (audit_status = 'pending' OR audit_status = 'none' OR audit_status IS NULL)) as waiting_audit_count,
         -- Total emails sent successfully by this slot
         COUNT(*) FILTER (WHERE last_sent_at IS NOT NULL OR last_contacted_at IS NOT NULL OR outreach_stage IN ('followup_1', 'followup_2', 'followup_3', 'completed')) as sent_count,
         -- Total received JSON
         COUNT(*) FILTER (WHERE audit_status IN ('ready', 'audit_completed') OR (audit_findings IS NOT NULL AND audit_findings::text != '[]')) as received_json_count,
         -- Waiting count (decreases when sent/completed)
         COUNT(*) FILTER (WHERE (status = 'active' OR status = 'queued' OR status IS NULL) AND (consent_status = 'none' OR consent_status IS NULL) AND (outreach_stage IS NULL OR outreach_stage NOT IN ('followup_1', 'followup_2', 'followup_3', 'completed', 'skipped_no_opportunity'))) as waiting_count,
         -- Due follow-ups (followup_1 >= 48h or followup_2 >= 72h with contactable channel)
         COUNT(*) FILTER (
           WHERE (status = 'active' OR status = 'queued' OR status IS NULL)
             AND (consent_status = 'none' OR consent_status IS NULL)
             AND (
               (email IS NOT NULL AND email LIKE '%@%')
               OR LENGTH(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(whatsapp), ''), NULLIF(TRIM(phone), ''), ''), '[^0-9]', '', 'g')) >= 8
             )
             AND (
               (outreach_stage = 'followup_1' AND last_contacted_at <= NOW() - INTERVAL '48 hours')
               OR (outreach_stage = 'followup_2' AND last_contacted_at <= NOW() - INTERVAL '72 hours')
             )
         ) as due_followup_count,
         COUNT(*) as leads_assigned,
         COUNT(*) FILTER (
           WHERE status IN ('completed', 'skipped_no_opportunity')
             OR outreach_stage IN ('completed', 'skipped_no_opportunity', 'followup_1', 'followup_2', 'followup_3')
             OR last_sent_at IS NOT NULL
         ) as leads_done,
         MAX(last_contacted_at) as last_sent_at
       FROM leads
       WHERE deleted_at IS NULL
         AND slot_id IS NOT NULL
         AND (status IS NULL OR status NOT IN ('inactive', 'duplicate', 'manual_review', 'paused'))
         ${listScopeClause}
       GROUP BY slot_id`,
      listScopeParams
    );

    // Check unassigned contactable active leads too (scoped to activeList if one is active)
    const unassignedPendingRes = await query<{ has_unassigned: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM leads
         WHERE deleted_at IS NULL
           AND slot_id IS NULL
           AND (status = 'active' OR status = 'queued' OR status IS NULL)
           AND (consent_status = 'none' OR consent_status IS NULL)
           AND (outreach_stage IS NULL OR outreach_stage NOT IN ('followup_1', 'followup_2', 'followup_3', 'completed', 'skipped_no_opportunity'))
           ${listScopeClause}
           AND (
             (email IS NOT NULL AND email LIKE '%@%')
             OR LENGTH(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(whatsapp), ''), NULLIF(TRIM(phone), ''), ''), '[^0-9]', '', 'g')) >= 8
           )
       ) AS has_unassigned`,
      listScopeParams
    );
    const hasUnassignedPending = Boolean(unassignedPendingRes.rows[0]?.has_unassigned);

    // Fetch up to 5 active leads per slot with detailed 4-step pipeline status
    const slotLeadsRes = await query<{
      id: string;
      business_name: string;
      website: string;
      slot_id: SlotId;
      status: string;
      outreach_stage: string;
      audit_status: string;
      audit_requested_at: string | null;
      audit_ready_at: string | null;
      audit_findings: any;
      audit_pdf_path: string | null;
      last_sent_at: string | null;
      metadata: any;
    }>(
      `SELECT id, business_name, website, slot_id, status, outreach_stage, audit_status,
              audit_requested_at, audit_ready_at, audit_findings, audit_pdf_path, last_sent_at, metadata
       FROM leads
       WHERE deleted_at IS NULL
         AND slot_id IS NOT NULL
         AND (status = 'active' OR status = 'queued' OR status IS NULL)
         AND (consent_status = 'none' OR consent_status IS NULL)
         ${listScopeClause}
       ORDER BY updated_at DESC`,
      listScopeParams
    );

    const slotLeadsMap = new Map<SlotId, SlotLeadMilestone[]>();
    slotLeadsRes.rows.forEach((row) => {
      const existing = slotLeadsMap.get(row.slot_id) || [];
      if (existing.length < 5) {
        existing.push({
          leadId: row.id,
          businessName: row.business_name,
          website: row.website,
          stage: row.outreach_stage || 'initial',
          websiteSentToTd: Boolean(row.audit_requested_at || (row.audit_status && row.audit_status !== 'none')),
          receivedJson: Boolean(row.audit_status === 'ready' || row.audit_status === 'audit_completed' || (row.audit_findings && JSON.stringify(row.audit_findings) !== '[]')),
          createdPdf: Boolean(row.audit_pdf_path && row.audit_pdf_path.trim().length > 0),
          emailDraftedAndSent: Boolean(row.last_sent_at || ['followup_1', 'followup_2', 'followup_3', 'completed'].includes(row.outreach_stage)),
          matchedService: row.metadata?.matched_service?.serviceName || 'Core Web Vitals & Performance',
        });
        slotLeadsMap.set(row.slot_id, existing);
      }
    });

    const countMap = new Map<SlotId, {
      total: number;
      ready: number;
      waiting: number;
      sent: number;
      receivedJson: number;
      waitingCount: number;
      dueFollowup: number;
      leadsAssigned: number;
      leadsDone: number;
      lastSent: string | null;
    }>();

    countsRes.rows.forEach((r) => {
      countMap.set(r.slot_id, {
        total: parseInt(r.total_queued, 10),
        ready: parseInt(r.ready_count, 10),
        waiting: parseInt(r.waiting_audit_count, 10),
        sent: parseInt(r.sent_count, 10),
        receivedJson: parseInt(r.received_json_count, 10),
        waitingCount: parseInt(r.waiting_count, 10),
        dueFollowup: parseInt(r.due_followup_count || '0', 10),
        leadsAssigned: parseInt(r.leads_assigned || '0', 10),
        leadsDone: parseInt(r.leads_done || '0', 10),
        lastSent: r.last_sent_at,
      });
    });

    let totalAssignedPending = 0;
    countMap.forEach((v) => {
      totalAssignedPending += v.waitingCount + v.dueFollowup;
    });

    const hasPendingLeads = totalAssignedPending > 0 || hasUnassignedPending;
    const isStopped = !rawSettings.is_active;
    const isTripped = Boolean(this.isCircuitBreakerTripped || rawSettings.circuit_breaker_tripped);
    const schedulerState: 'active' | 'standby' | 'stopped' | 'tripped' = isStopped
      ? 'stopped'
      : isTripped
      ? 'tripped'
      : hasPendingLeads
      ? 'active'
      : 'standby';

    const slots: SlotStatus[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      const slotId = SLOTS[i];
      const mailbox = await this.getMailboxForSlot(i);
      const data = countMap.get(slotId) || {
        total: 0,
        ready: 0,
        waiting: 0,
        sent: 0,
        receivedJson: 0,
        waitingCount: 0,
        dueFollowup: 0,
        leadsAssigned: 0,
        leadsDone: 0,
        lastSent: null,
      };
      const turn = turnStates.get(slotId) || { lastTurnAt: null, inFlight: this.inFlightSlots.has(slotId) };
      const lastTurnAt = turn.lastTurnAt;
      const nextTurnAt = this.computeNextTurnAt(now, grid.slotTimes[slotId], lastTurnAt, cycleMs);

      const isSlotCompleted =
        !turn.inFlight &&
        data.leadsAssigned > 0 &&
        data.waitingCount === 0 &&
        data.dueFollowup === 0;

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
        sentCount: data.sent,
        receivedJsonCount: data.receivedJson,
        waitingCount: data.waitingCount,
        dueFollowupCount: data.dueFollowup,
        nextSendTime: nextTurnAt,
        lastSendTime: data.lastSent,
        last_turn_at: lastTurnAt,
        next_turn_at: nextTurnAt,
        in_flight: turn.inFlight,
        leads_assigned: data.leadsAssigned,
        leads_done: data.leadsDone,
        status: turn.inFlight
          ? 'active'
          : isSlotCompleted
          ? 'completed'
          : schedulerState === 'active' && grid.currentActiveSlot === slotId
          ? 'active'
          : schedulerState !== 'active'
          ? 'idle'
          : 'waiting',
        leads: slotLeadsMap.get(slotId) || [],
      });
    }

    // Redact secrets before sending over API
    const safeSettings = {
      ...rawSettings,
      td_shared_secret: undefined as any,
      td_shared_secret_masked: maskSecret(rawSettings.td_shared_secret),
      td_callback_secret: undefined as any,
      td_callback_secret_masked: maskSecret(rawSettings.td_callback_secret),
    };

    return {
      slots,
      settings: safeSettings,
      activeSlotNow: schedulerState === 'active' ? grid.currentActiveSlot : null,
      schedulerState,
      hasPendingLeads,
      activeList,
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
   * Starts the single background timer loop (idempotent: ignores duplicate calls)
   */
  startScheduler(intervalMs: number = 10000): void {
    if (this.timer) {
      console.log('[FiveSlotSenderService] 5-Slot scheduler already active — ignoring duplicate startScheduler() call.');
      return;
    }

    console.log(`[FiveSlotSenderService] 🚀 5-Slot Staggered Sender loop armed (10s tick interval; sends only when active & leads queued).`);

    // Restore DB cooldown timestamps & clear stale crash in-flight locks on boot before ticking
    Promise.all([
      this.syncLastSentFromDb(),
      this.acquireLeaderLock().then((acquired) => {
        if (acquired) {
          return this.clearStaleInFlightLocks();
        }
      }),
    ])
      .then(() => this.getSettings())
      .then((settings) => {
        this.checkTdStartupConnection().catch(() => {});
        if (!settings.is_active || settings.circuit_breaker_tripped || this.isCircuitBreakerTripped) {
          console.log('[FiveSlotSenderService] ⏸️ Scheduler is stopped/paused in settings — skipping startup audit dispatch.');
          return;
        }
        this.reapStaleSendingClaims().catch(() => {});
        this.dispatchRollingAudits().catch(() => {});
      })
      .catch(() => {});

    this.timer = setInterval(() => {
      this.processGlobalTick().catch((err) => {
        console.error('[FiveSlotSenderService] Scheduler tick error:', err?.message);
      });
    }, intervalMs);
  }

  async recordSlotSendHistory(params: {
    slotId: SlotId;
    leadId: string;
    businessName: string;
    recipientEmail?: string | null;
    recipientPhone?: string | null;
    mailboxEmail?: string | null;
    channel?: string;
    stage: string;
    subject?: string | null;
    messageBody?: string | null;
    pdfFilename?: string | null;
    status: 'sent' | 'failed';
    errorMessage?: string | null;
    externalMessageId?: string | null;
    preferredListId?: string | null;
  }): Promise<void> {
    try {
      let resolvedList: { id: string | null; name: string; total_leads: number } | null = null;

      if (params.preferredListId) {
        const prefRes = await query<{ id: string; name: string; total_leads: number }>(
          `SELECT li.id, li.name,
             (
               SELECT COUNT(*)::int
               FROM lead_list_memberships llm2
               JOIN leads l2 ON l2.id = llm2.lead_id
               WHERE llm2.list_id = li.id AND l2.deleted_at IS NULL
             ) AS total_leads
           FROM lists li
           WHERE li.id = $1
             AND EXISTS (
               SELECT 1 FROM lead_list_memberships llm
               WHERE llm.list_id = li.id AND llm.lead_id = $2
             )
           LIMIT 1`,
          [params.preferredListId, params.leadId]
        );
        if (prefRes.rows[0]) {
          resolvedList = prefRes.rows[0];
        }
      }

      if (!resolvedList) {
        const memRes = await query<{ id: string; name: string; total_leads: number }>(
          `SELECT li.id, li.name,
             (
               SELECT COUNT(*)::int
               FROM lead_list_memberships llm2
               JOIN leads l2 ON l2.id = llm2.lead_id
               WHERE llm2.list_id = li.id AND l2.deleted_at IS NULL
             ) AS total_leads
           FROM lead_list_memberships llm
           JOIN lists li ON li.id = llm.list_id
           WHERE llm.lead_id = $1
           ORDER BY
             CASE
               WHEN li.name NOT IN ('Email Leads', 'WhatsApp Leads', 'Website Leads', 'Invalid List') THEN 0
               WHEN li.name = 'Website Leads' THEN 1
               WHEN li.name = 'Email Leads' THEN 2
               WHEN li.name = 'WhatsApp Leads' THEN 3
               ELSE 4
             END ASC,
             llm.added_at DESC
           LIMIT 1`,
          [params.leadId]
        );
        if (memRes.rows[0]) {
          resolvedList = memRes.rows[0];
        }
      }

      const listId = resolvedList?.id || null;
      const listName = resolvedList?.name || 'Direct CRM Leads';
      const listTotalLeads = resolvedList ? Math.max(1, Number(resolvedList.total_leads || 0)) : 1;

      let mailboxEmail = params.mailboxEmail || null;
      if (!mailboxEmail && params.channel !== 'whatsapp') {
        const idx = SLOTS.indexOf(params.slotId);
        if (idx >= 0) {
          const mailbox = await this.getMailboxForSlot(idx).catch(() => null);
          mailboxEmail = mailbox?.email || null;
        }
      }

      await query(
        `INSERT INTO slot_send_history (
           slot_id, lead_id, list_id, list_name, list_total_leads,
           business_name, recipient_email, recipient_phone, mailbox_email,
           channel, stage, subject, message_body, pdf_filename,
           status, error_message, external_message_id, sent_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
        [
          params.slotId,
          params.leadId,
          listId,
          listName,
          listTotalLeads,
          params.businessName || '',
          params.recipientEmail || null,
          params.recipientPhone || null,
          mailboxEmail,
          params.channel || 'email',
          params.stage || 'initial',
          params.subject || '',
          params.messageBody || '',
          params.pdfFilename || null,
          params.status,
          params.errorMessage || null,
          params.externalMessageId || null,
        ]
      );
    } catch (histErr: any) {
      console.warn(`[FiveSlotSenderService] Failed to record slot send history:`, histErr?.message);
    }
  }

  async getSlotSendingHistory(filters?: {
    slotId?: string;
    listId?: string;
    status?: string;
    limit?: number;
  }): Promise<SlotHistoryResponse> {
    const overview = await this.getSlotsStatus();

    const listsRes = await query<{
      id: string;
      name: string;
      total_leads: number;
    }>(
      `SELECT li.id, li.name,
         COUNT(DISTINCT l.id) FILTER (WHERE l.deleted_at IS NULL)::int AS total_leads
       FROM lists li
       LEFT JOIN lead_list_memberships llm ON llm.list_id = li.id
       LEFT JOIN leads l ON l.id = llm.lead_id
       GROUP BY li.id, li.name, li.created_at
       ORDER BY
         CASE WHEN li.name NOT IN ('Email Leads', 'WhatsApp Leads', 'Website Leads', 'Invalid List') THEN 0 ELSE 1 END ASC,
         li.created_at DESC`
    );

    const listSlotLeadRes = await query<{
      list_id: string;
      slot_id: SlotId;
      assigned: number;
      remaining: number;
    }>(
      `SELECT llm.list_id, l.slot_id,
         COUNT(*)::int AS assigned,
         COUNT(*) FILTER (
           WHERE (l.status IN ('active', 'queued') OR l.status IS NULL)
             AND (l.consent_status = 'none' OR l.consent_status IS NULL)
             AND (l.outreach_stage IS NULL OR l.outreach_stage NOT IN ('followup_1', 'followup_2', 'followup_3', 'completed', 'skipped_no_opportunity'))
         )::int AS remaining
       FROM lead_list_memberships llm
       JOIN leads l ON l.id = llm.lead_id
       WHERE l.deleted_at IS NULL AND l.slot_id IS NOT NULL
       GROUP BY llm.list_id, l.slot_id`
    );

    const listSlotHistRes = await query<{
      list_key: string;
      list_id: string | null;
      list_name: string;
      slot_id: SlotId;
      recorded_total_leads: number;
      sent_count: number;
      failed_count: number;
      last_sent_at: string | null;
    }>(
      `SELECT COALESCE(list_id::text, '__direct__') AS list_key,
         list_id,
         MAX(list_name) AS list_name,
         slot_id,
         MAX(list_total_leads)::int AS recorded_total_leads,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         MAX(sent_at) AS last_sent_at
       FROM slot_send_history
       GROUP BY COALESCE(list_id::text, '__direct__'), list_id, slot_id`
    );

    const makeEmptySlotsRecord = (): Record<SlotId, SlotListSlotBreakdown> => {
      const rec = {} as Record<SlotId, SlotListSlotBreakdown>;
      for (const s of SLOTS) {
        rec[s] = { slotId: s, assigned: 0, sent: 0, failed: 0, remaining: 0, completed: false };
      }
      return rec;
    };

    const listMap = new Map<string, SlotListSummary>();
    for (const row of listsRes.rows) {
      listMap.set(row.id, {
        listId: row.id,
        listName: row.name,
        totalLeads: row.total_leads,
        sentCount: 0,
        failedCount: 0,
        pendingCount: 0,
        lastSentAt: null,
        slots: makeEmptySlotsRecord(),
      });
    }

    for (const row of listSlotLeadRes.rows) {
      const entry = listMap.get(row.list_id);
      if (!entry || !SLOTS.includes(row.slot_id)) continue;
      entry.slots[row.slot_id].assigned = row.assigned;
      entry.slots[row.slot_id].remaining = row.remaining;
      entry.pendingCount += row.remaining;
    }

    for (const row of listSlotHistRes.rows) {
      if (!SLOTS.includes(row.slot_id)) continue;
      let entry = row.list_id ? listMap.get(row.list_id) : listMap.get(row.list_key);
      if (!entry) {
        entry = {
          listId: row.list_id,
          listName: row.list_name || 'Direct CRM Leads',
          totalLeads: row.recorded_total_leads || 0,
          sentCount: 0,
          failedCount: 0,
          pendingCount: 0,
          lastSentAt: null,
          slots: makeEmptySlotsRecord(),
        };
        listMap.set(row.list_id || row.list_key, entry);
      } else if (entry.totalLeads === 0 && row.recorded_total_leads > 0) {
        entry.totalLeads = row.recorded_total_leads;
      }

      entry.slots[row.slot_id].sent += row.sent_count;
      entry.slots[row.slot_id].failed += row.failed_count;
      entry.sentCount += row.sent_count;
      entry.failedCount += row.failed_count;
      if (row.last_sent_at && (!entry.lastSentAt || new Date(row.last_sent_at) > new Date(entry.lastSentAt))) {
        entry.lastSentAt = row.last_sent_at;
      }
    }

    const listsSummary: SlotListSummary[] = [];
    for (const summary of listMap.values()) {
      for (const s of SLOTS) {
        const b = summary.slots[s];
        b.completed = (b.assigned > 0 || b.sent > 0) && b.remaining === 0;
      }
      if (summary.listName === 'Invalid List' && summary.totalLeads === 0 && summary.sentCount === 0 && summary.failedCount === 0) {
        continue;
      }
      listsSummary.push(summary);
    }

    const slotAggRes = await query<{
      slot_id: SlotId;
      total_sent: number;
      total_failed: number;
      last_sent_at: string | null;
    }>(
      `SELECT slot_id,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS total_sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS total_failed,
         MAX(sent_at) AS last_sent_at
       FROM slot_send_history
       GROUP BY slot_id`
    );

    const slotAggMap = new Map(slotAggRes.rows.map((r) => [r.slot_id, r]));
    const slotSummaries: SlotHistorySummaryItem[] = overview.slots.map((slot) => {
      const agg = slotAggMap.get(slot.slotId);
      return {
        slotId: slot.slotId,
        assignedMailboxEmail: slot.assignedMailbox.email,
        totalSent: agg?.total_sent ?? 0,
        totalFailed: agg?.total_failed ?? 0,
        lastSentAt: agg?.last_sent_at || slot.lastSendTime || null,
        status: slot.status,
      };
    });

    const whereParts: string[] = [];
    const params: any[] = [];
    if (filters?.slotId && SLOTS.includes(filters.slotId.toUpperCase() as SlotId)) {
      params.push(filters.slotId.toUpperCase());
      whereParts.push(`slot_id = $${params.length}`);
    }
    if (filters?.listId) {
      if (filters.listId === '__direct__') {
        whereParts.push(`list_id IS NULL`);
      } else {
        params.push(filters.listId);
        whereParts.push(`list_id = $${params.length}`);
      }
    }
    if (filters?.status && (filters.status === 'sent' || filters.status === 'failed')) {
      params.push(filters.status);
      whereParts.push(`status = $${params.length}`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const countRes = await query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM slot_send_history ${whereSql}`,
      params
    );
    const totalEntries = countRes.rows[0]?.cnt ?? 0;

    const limit = Math.min(500, Math.max(1, Number(filters?.limit || 150)));
    const entryParams = [...params, limit];
    const entriesRes = await query<{
      id: string;
      slot_id: SlotId;
      lead_id: string | null;
      list_id: string | null;
      list_name: string;
      list_total_leads: number;
      business_name: string;
      recipient_email: string | null;
      recipient_phone: string | null;
      mailbox_email: string | null;
      channel: string;
      stage: string;
      subject: string;
      message_body: string;
      pdf_filename: string | null;
      status: 'sent' | 'failed';
      error_message: string | null;
      external_message_id: string | null;
      sent_at: string;
    }>(
      `SELECT id, slot_id, lead_id, list_id, list_name, list_total_leads,
              business_name, recipient_email, recipient_phone, mailbox_email,
              channel, stage, subject, message_body, pdf_filename,
              status, error_message, external_message_id, sent_at
       FROM slot_send_history
       ${whereSql}
       ORDER BY sent_at DESC
       LIMIT $${entryParams.length}`,
      entryParams
    );

    const entries: SlotSendHistoryEntry[] = entriesRes.rows.map((r) => ({
      id: r.id,
      slotId: r.slot_id,
      leadId: r.lead_id,
      listId: r.list_id,
      listName: r.list_name,
      listTotalLeads: r.list_total_leads,
      businessName: r.business_name,
      recipientEmail: r.recipient_email,
      recipientPhone: r.recipient_phone,
      mailboxEmail: r.mailbox_email,
      channel: r.channel,
      stage: r.stage,
      subject: r.subject || '',
      messageBody: r.message_body || '',
      pdfFilename: r.pdf_filename,
      status: r.status,
      errorMessage: r.error_message,
      externalMessageId: r.external_message_id,
      sentAt: r.sent_at,
    }));

    return {
      listsSummary,
      slotSummaries,
      entries,
      totalEntries,
    };
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.releaseLeaderLock();
  }
}

export const fiveSlotSenderService = new FiveSlotSenderService();
