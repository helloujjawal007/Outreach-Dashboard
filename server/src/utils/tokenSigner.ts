import crypto from 'crypto';
import { env } from '../config/env';

export function getUnsubscribeSecret(): string {
  return env.SESSION_SECRET;
}

function getLegacyUnsubscribeSecret(): string | null {
  return process.env.LEGACY_UNSUBSCRIBE_SECRET || null;
}

/**
 * Creates a cryptographically signed URL-safe token for one-click and web-based unsubscribe.
 * Always signs with the current SESSION_SECRET. Never uses the legacy secret for signing.
 */
export function signUnsubscribeToken(leadId: string, email: string): string {
  const secret = getUnsubscribeSecret();
  const cleanEmail = (email || '').toLowerCase().trim();
  const payloadStr = JSON.stringify({
    leadId: leadId || '',
    email: cleanEmail,
    iat: Date.now(),
  });
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies the cryptographically signed unsubscribe token.
 *
 * Verification order:
 * 1. Current secret (SESSION_SECRET) — used for all newly signed tokens.
 * 2. Legacy secret (LEGACY_UNSUBSCRIBE_SECRET, optional) — used ONLY to verify
 *    tokens signed before the secret was rotated. Never used for signing.
 *
 * Never fails open: an invalid token against both secrets returns { valid: false }.
 */
export function verifyUnsubscribeToken(token: string): { valid: boolean; leadId?: string; email?: string } {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false };
  }

  try {
    const parts = token.trim().split('.');
    if (parts.length !== 2) return { valid: false };

    const [payloadB64, signature] = parts;

    // --- Try current secret ---
    const currentSecret = getUnsubscribeSecret();
    const currentExpectedSig = crypto.createHmac('sha256', currentSecret).update(payloadB64).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const currentExpectedBuf = Buffer.from(currentExpectedSig);

    if (
      sigBuf.length === currentExpectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, currentExpectedBuf)
    ) {
      return decodePayload(payloadB64);
    }

    // --- Try legacy secret (only if configured) ---
    const legacySecret = getLegacyUnsubscribeSecret();
    if (legacySecret) {
      const legacyExpectedSig = crypto.createHmac('sha256', legacySecret).update(payloadB64).digest('base64url');
      const legacyExpectedBuf = Buffer.from(legacyExpectedSig);

      if (
        sigBuf.length === legacyExpectedBuf.length &&
        crypto.timingSafeEqual(sigBuf, legacyExpectedBuf)
      ) {
        console.log(
          '[Unsubscribe] Token verified via LEGACY_UNSUBSCRIBE_SECRET — ' +
            'schedule removal of this env var once all legacy links have expired.'
        );
        return decodePayload(payloadB64);
      }
    }

    // Neither secret matched — token is invalid
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Decodes and validates the JWT-style payload portion of an unsubscribe token.
 */
function decodePayload(payloadB64: string): { valid: boolean; leadId?: string; email?: string } {
  const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const data = JSON.parse(payloadJson);

  if (!data.email) return { valid: false };

  return {
    valid: true,
    leadId: data.leadId,
    email: data.email,
  };
}

