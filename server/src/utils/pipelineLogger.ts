/**
 * Standardized chronological console logger for all outreach lifecycle milestones and errors.
 */

export type PipelineStage =
  | 'LEAD_SCRAPED'
  | 'ADDED_TO_LIST'
  | 'SCHEDULED_EMAIL'
  | 'EMAIL_COUNTDOWN'
  | 'SENT_TO_TD'
  | 'RECEIVED_JSON'
  | 'GENERATED_PDF'
  | 'DRAFTED_EMAIL'
  | 'EMAIL_SENT'
  | 'EMAIL_RECEIVED'
  | 'ERROR';

const STAGE_LABELS: Record<Exclude<PipelineStage, 'ERROR'>, string> = {
  LEAD_SCRAPED: '🕷️ Lead Scraped',
  ADDED_TO_LIST: '📋 Added to List',
  SCHEDULED_EMAIL: '🗓️ Scheduled Email',
  EMAIL_COUNTDOWN: '⏳ Email Countdown',
  SENT_TO_TD: '📤 Sent to Technical Dashboard',
  RECEIVED_JSON: '📥 Received JSON',
  GENERATED_PDF: '📄 Generated PDF',
  DRAFTED_EMAIL: '✍️ Drafted & Scheduled Email',
  EMAIL_SENT: '✉️ Email Sent',
  EMAIL_RECEIVED: '📬 Email Received',
};

interface ThrottleEntry {
  loggedAt: number;
  stateTag?: string;
}

const throttleState = new Map<string, ThrottleEntry>();
const MAX_THROTTLE_KEYS = 200;

function formatClockTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Formats seconds into a compact human-readable duration (e.g. "2m 5s" or "45s").
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0s';
  }
  const secs = Math.ceil(totalSeconds);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remSecs = secs % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remSecs}s`;
  }
  if (minutes > 0) {
    return remSecs > 0 ? `${minutes}m ${remSecs}s` : `${minutes}m`;
  }
  return `${remSecs}s`;
}

/**
 * Emits a standardized console log line for an outreach pipeline milestone.
 */
export function logPipeline(stage: Exclude<PipelineStage, 'ERROR'>, message: string): void {
  console.log(`[Pipeline ${formatClockTime()}] ${STAGE_LABELS[stage]} | ${message}`);
}

/**
 * Emits a throttled pipeline log for polling loops so identical waiting states do not spam stdout.
 * Logs immediately whenever `stateTag` changes or after `intervalMs` has elapsed.
 */
export function logPipelineThrottled(
  key: string,
  intervalMs: number,
  stage: Exclude<PipelineStage, 'ERROR'>,
  message: string,
  stateTag?: string
): boolean {
  const now = Date.now();
  const prev = throttleState.get(key);
  const stateChanged = stateTag !== undefined && prev?.stateTag !== stateTag;

  if (!prev || stateChanged || now - prev.loggedAt >= intervalMs) {
    if (throttleState.size >= MAX_THROTTLE_KEYS && !throttleState.has(key)) {
      const oldestKey = throttleState.keys().next().value;
      if (oldestKey !== undefined) throttleState.delete(oldestKey);
    }
    throttleState.set(key, { loggedAt: now, stateTag });
    logPipeline(stage, message);
    return true;
  }
  return false;
}

/**
 * Clears a throttle key (e.g. when a queue becomes active again).
 */
export function clearPipelineThrottle(key: string): void {
  throttleState.delete(key);
}

export interface SlotStepMeta {
  httpStatus?: number;
  auditId?: string;
  cached?: boolean;
  score?: number;
  source?: 'technical-audit-dashboard' | 'local-fallback';
}

/**
 * Emits a standardized 7-step pipeline console log for each of the 5 slots:
 * Step 1: Scraped Site URL
 * Step 2: Sent Site URL to Technical Audit dashboard
 * Step 3: Received JSON from Technical Dashboard
 * Step 4: Transformed in PDF
 * Step 5: Email Drafted
 * Step 6: PDF Attached
 * Step 7: Email Sent
 */
export function logSlotStep(
  slotLabel: string, // e.g. "Slot 1 (A)"
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  details: string,
  meta?: SlotStepMeta
): void {
  const stepTitles: Record<number, string> = {
    1: 'Scraped Site URL',
    2: 'Sent Site URL to Technical Audit dashboard',
    3: 'Received JSON from Technical Dashboard',
    4: 'Transformed in PDF',
    5: 'Email Drafted',
    6: 'PDF Attached',
    7: 'Email Sent',
  };
  const stepIcons: Record<number, string> = {
    1: '🌐',
    2: '📡',
    3: '📥',
    4: '📄',
    5: '✍️',
    6: '📎',
    7: '🚀',
  };
  const title = stepTitles[step] || `Step ${step}`;
  const icon = stepIcons[step] || '🔹';

  let metaString = '';
  if (meta) {
    const parts: string[] = [];
    if (meta.httpStatus !== undefined) parts.push(`HTTP: ${meta.httpStatus}`);
    if (meta.source) parts.push(`Source: [${meta.source}]`);
    if (meta.auditId) parts.push(`Audit ID: ${meta.auditId}`);
    if (meta.score !== undefined) parts.push(`Score: ${meta.score}/100`);
    if (meta.cached !== undefined) parts.push(`Cached: ${meta.cached ? 'true' : 'false'}`);
    if (parts.length > 0) {
      metaString = ` | ${parts.join(' | ')}`;
    }
  }

  console.log(`[${slotLabel}] [Step ${step}/7 - ${title}] ${icon} ${details}${metaString}`);
}

/**
 * Emits a standardized console error line for any pipeline failure or exception encountered.
 */
export function logPipelineError(context: string, message: string, err?: unknown): void {
  const errDetail =
    err instanceof Error
      ? err.message
      : typeof err === 'string' && err.trim()
      ? err.trim()
      : err && typeof err === 'object' && 'message' in err
      ? String((err as any).message)
      : '';

  const suffix = errDetail && !message.includes(errDetail) ? ` (${errDetail})` : '';
  console.error(`[Pipeline ${formatClockTime()}] ❌ Error [${context}] | ${message}${suffix}`);
}

