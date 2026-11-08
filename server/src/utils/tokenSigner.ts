import crypto from 'crypto';

export function getUnsubscribeSecret(): string {
  return process.env.SESSION_SECRET || 'ods-outreach-dashboard-secret-key-2026';
}

/**
 * Creates a cryptographically signed URL-safe token for one-click and web-based unsubscribe
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
 * Verifies the cryptographically signed unsubscribe token
 */
export function verifyUnsubscribeToken(token: string): { valid: boolean; leadId?: string; email?: string } {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false };
  }

  try {
    const parts = token.trim().split('.');
    if (parts.length !== 2) return { valid: false };

    const [payloadB64, signature] = parts;
    const secret = getUnsubscribeSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false };
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const data = JSON.parse(payloadJson);

    if (!data.email) return { valid: false };

    return {
      valid: true,
      leadId: data.leadId,
      email: data.email,
    };
  } catch {
    return { valid: false };
  }
}

