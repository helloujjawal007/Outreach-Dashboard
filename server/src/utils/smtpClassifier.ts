export type SmtpErrorType =
  | 'hard_bounce'
  | 'soft_bounce'
  | 'daily_limit_pause'
  | 'mailbox_auth'
  | 'transient'
  | 'unknown';

export interface SmtpClassificationResult {
  type: SmtpErrorType;
  message: string;
  isFatalForLead: boolean;
  shouldTripCircuitBreaker: boolean;
  shouldRetryLead: boolean;
  isDailyLimit?: boolean;
}

/**
 * Classifies SMTP and dispatch errors by Enhanced Status Codes and patterns:
 * 1. 5.4.5 Mailbox Daily Sending Quota (timed pause until next send day with auto-resume)
 * 2. 535 / 5.7.x / 554 Mailbox Authentication / Policy (circuit breaker pause, requires credential check / manual resume)
 * 3. 5.1.1 / 5.1.0 / 5.1.2 / 5.2.1 Hard Bounce (bad recipient / account disabled -> permanent isolation & suppression)
 * 4. 5.2.2 Soft Bounce (mailbox full -> non-fatal, soft retry with cap)
 * 5. 421 / 4xx / 4.x Greylisting & Network Timeouts (transient retry with cap of 3)
 */
export function classifySmtpError(rawError: string | Error | unknown): SmtpClassificationResult {
  const message = rawError instanceof Error ? rawError.message : String(rawError || '');
  const lower = message.toLowerCase();

  // 1. Mailbox Daily Sending Limit Exceeded:
  // 5.4.5 ("Daily user sending quota exceeded", "Daily send limit reached", "Rate limit exceeded")
  // Action: Timed pause until the start of next send day (auto-resumes automatically without manual intervention).
  if (
    /5\.4\.5|daily send limit|daily sending quota|user sending limit|daily quota exceeded|sending quota/i.test(lower)
  ) {
    return {
      type: 'daily_limit_pause',
      message,
      isFatalForLead: false,
      shouldTripCircuitBreaker: true,
      shouldRetryLead: true,
      isDailyLimit: true,
    };
  }

  // 2. Mailbox Authentication / Credential / Security Failures:
  // 535, 5.7.8 (Bad credentials), 5.7.x (Auth security), 554 (relay denied / policy)
  // Action: Mailbox credential issue. Leave leads untouched. Trip circuit breaker after 3 failures (manual resume).
  if (
    /535|5\.7\.8|eauth|authentication failed|invalid credentials|invalid login|wrong password|username and password not accepted|badauth|auth error/i.test(lower) ||
    /5\.7\.\d|5\.7\.[a-z0-9]+/i.test(lower) ||
    /554/i.test(lower)
  ) {
    return {
      type: 'mailbox_auth',
      message,
      isFatalForLead: false,
      shouldTripCircuitBreaker: true,
      shouldRetryLead: true,
    };
  }

  // 3. Permanent Recipient Failure / Hard Bounce:
  // 5.1.1 (bad recipient), 5.1.0, 5.1.2 (bad domain), 5.1.3 (bad syntax), 5.2.1 (account disabled / not accepting mail), 550 User Unknown
  // Action: Fatal for prospect. Permanently isolate lead in manual_review + add to global suppression.
  if (
    /5\.1\.[0-3]|5\.2\.1|account disabled|account is disabled|550|user unknown|no such user|mailbox unavailable|recipient address rejected|address rejected|recipient rejected|does not exist|invalid recipient|mailbox not found/i.test(
      lower
    )
  ) {
    return {
      type: 'hard_bounce',
      message,
      isFatalForLead: true,
      shouldTripCircuitBreaker: false,
      shouldRetryLead: false,
    };
  }

  // 4. Soft Bounce (Mailbox Full):
  // 5.2.2 (Mailbox full / over quota)
  // Action: Non-fatal for lead. Soft retry up to 3 times before quarantine.
  if (/5\.2\.2|mailbox full|quota exceeded for recipient|over storage quota/i.test(lower)) {
    return {
      type: 'soft_bounce',
      message,
      isFatalForLead: false,
      shouldTripCircuitBreaker: false,
      shouldRetryLead: true,
    };
  }

  // 5. Transient / Temporary Faults & Greylisting:
  // 421, 450, 451, 452, 4.x.x, greylisted, greylisting, timeouts, connection resets
  // Action: Temporary delay. Retry up to 3 times before quarantine.
  if (
    /421|45[0-9]|4\.\d\.\d|greylist|greylisting|etimedout|econnreset|econnrefused|timeout|timed out|socket hang up|temporary failure|connection reset|try again later|too many connections/i.test(
      lower
    )
  ) {
    return {
      type: 'transient',
      message,
      isFatalForLead: false,
      shouldTripCircuitBreaker: false,
      shouldRetryLead: true,
    };
  }

  return {
    type: 'unknown',
    message,
    isFatalForLead: false,
    shouldTripCircuitBreaker: false,
    shouldRetryLead: true,
  };
}

