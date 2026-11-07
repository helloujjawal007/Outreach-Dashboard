export type SmtpErrorType = 'hard_bounce' | 'transient' | 'mailbox_auth' | 'unknown';

export interface SmtpClassificationResult {
  type: SmtpErrorType;
  message: string;
  isFatalForLead: boolean;
  shouldTripCircuitBreaker: boolean;
  shouldRetryLead: boolean;
}

/**
 * Classifies SMTP and dispatch errors by Enhanced Status Codes and patterns:
 * 1. Mailbox-Level / Policy / Limits (535, 5.7.x, 5.4.5, 554 policy/limit)
 *    -> Mailbox issue. Do NOT isolate lead! Trip circuit breaker after 3 failures and pause slots.
 * 2. Permanent Recipient Failure / Hard Bounce (5.1.1, 5.1.0, 5.1.2, 5.1.3, 550 User Unknown)
 *    -> Bad recipient address. Permanently isolate lead in manual_review + add to global suppression.
 * 3. Transient Faults (421, 4xx, 4.x.x, ETIMEDOUT, ECONNRESET, connection reset)
 *    -> Temporary network/server fault. Retry later with a cap (3), NO quarantine until cap reached.
 */
export function classifySmtpError(rawError: string | Error | unknown): SmtpClassificationResult {
  const message = rawError instanceof Error ? rawError.message : String(rawError || '');
  const lower = message.toLowerCase();

  // 1. Mailbox-level / Authentication / Quota / Policy limits:
  // 535, 5.7.x (auth/policy/security), 5.4.5 (quota/limit exceeded), 554 (policy/limit/relay)
  if (
    /535|eauth|authentication failed|invalid credentials|invalid login|wrong password|username and password not accepted|badauth|auth error/i.test(lower) ||
    /5\.4\.5|daily send limit|user sending limit|daily quota|rate limit/i.test(lower) ||
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

  // 2. Permanent Recipient Failure / Hard Bounce:
  // 5.1.1 (bad recipient), 5.1.0, 5.1.2 (bad domain), 5.1.3 (bad syntax), 550 (User Unknown / mailbox unavailable)
  if (
    /5\.1\.[0-3]|550|user unknown|no such user|mailbox unavailable|recipient address rejected|address rejected|recipient rejected|does not exist|invalid recipient|mailbox not found/i.test(
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

  // 3. Transient / Temporary faults (421, 4xx, timeouts, connection resets)
  if (
    /421|45\d|4\.\d\.\d|etimedout|econnreset|econnrefused|timeout|timed out|socket hang up|temporary failure|connection reset|try again later|too many connections/i.test(
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

