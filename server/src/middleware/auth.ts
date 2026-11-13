import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env';

// Cut token lifetime from 30 days to 12 hours
const TOKEN_EXPIRY_HOURS = 12;
const MAX_REVOKED_ENTRIES = 10000;

// Bounded server-side revocation denylist mapping signature -> expiration epoch ms
const revokedSignatures = new Map<string, number>();

function pruneRevokedSignatures(now = Date.now()): void {
  for (const [sig, exp] of revokedSignatures.entries()) {
    if (exp <= now) {
      revokedSignatures.delete(sig);
    }
  }
  while (revokedSignatures.size > MAX_REVOKED_ENTRIES) {
    const oldestKey = revokedSignatures.keys().next().value;
    if (!oldestKey) break;
    revokedSignatures.delete(oldestKey);
  }
}

/**
 * Revokes a session token so it cannot be used again
 */
export function revokeToken(token: string): void {
  if (!token || typeof token !== 'string') return;
  const parts = token.split('.');
  if (parts.length !== 2) return;
  pruneRevokedSignatures();
  let exp = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') {
      exp = payload.exp;
    }
  } catch {
    // Keep default expiration window
  }
  revokedSignatures.set(parts[1], exp);
}

/**
 * Checks if a token has been explicitly revoked
 */
export function isTokenRevoked(token: string): boolean {
  if (!token || typeof token !== 'string') return true;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const exp = revokedSignatures.get(parts[1]);
  if (exp === undefined) return false;
  if (exp <= Date.now()) {
    revokedSignatures.delete(parts[1]);
    return false;
  }
  return true;
}

/**
 * Generate a cryptographically signed session token for admin access (12h lifetime)
 */
export function generateSessionToken(): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const payload = JSON.stringify({
    role: 'admin',
    exp: expiresAt.getTime(),
    nonce: crypto.randomBytes(8).toString('hex'),
  });

  const encodedPayload = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

/**
 * Verifies if the provided session token is valid, not expired, and not revoked
 */
export function verifySessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encodedPayload, signature] = parts;

  // Check revocation denylist
  if (revokedSignatures.has(signature)) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return false;
    }
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Generates a short-lived (60s) HMAC token scoped strictly to a single PDF filename
 */
export function generateScopedPdfToken(filename: string): { token: string; expiresAt: number } {
  const cleanFile = path.basename(filename);
  const exp = Date.now() + 60 * 1000; // 60 seconds
  const payload = Buffer.from(JSON.stringify({ file: cleanFile, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: exp };
}

/**
 * Verifies a 60-second file-scoped PDF token
 */
export function verifyScopedPdfToken(filename: string, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadStr, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', env.SESSION_SECRET).update(payloadStr).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const data = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return false;
    return data.file === path.basename(filename);
  } catch {
    return false;
  }
}

/**
 * Extracts session token strictly from Authorization header, x-admin-token, or Cookie.
 * Query parameter ?token= is deliberately NOT accepted on general routes.
 */
export function extractToken(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Custom header x-admin-token
  const customHeader = req.headers['x-admin-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  // 3. Cookie parser: ods_session=<token>
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)ods_session=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }

  return null;
}

/**
 * Shared flag reflecting whether local development auth bypass is active.
 * Strictly disabled in production regardless of env flags.
 */
export function isAuthBypassed(): boolean {
  if (env.NODE_ENV === 'production') {
    return false;
  }
  return process.env.AUTH_BYPASS !== 'false';
}

/**
 * Express middleware to protect all /api routes except public endpoints
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthBypassed()) {
    next();
    return;
  }

  const fullPath = (req.originalUrl ? req.originalUrl.split('?')[0] : req.path) || req.path;
  const reqPath = req.path;

  // Whitelisted public endpoints (callback routes verify their own shared secret/HMAC)
  const isPublic =
    fullPath === '/api/health' ||
    fullPath === '/health' ||
    reqPath === '/health' ||
    fullPath.startsWith('/api/auth/') ||
    reqPath.startsWith('/auth/') ||
    fullPath.startsWith('/api/unsubscribe') ||
    reqPath.startsWith('/unsubscribe') ||
    fullPath.startsWith('/api/audit/callback') ||
    reqPath.startsWith('/audit/callback');

  if (isPublic) {
    next();
    return;
  }

  // Allow PDF download endpoint if it has a valid 60s file-scoped token OR valid session token
  if (fullPath.startsWith('/api/audit/download/') || reqPath.startsWith('/audit/download/')) {
    const rawParam = fullPath.startsWith('/api/audit/download/')
      ? fullPath.substring('/api/audit/download/'.length)
      : reqPath.substring('/audit/download/'.length);
    try {
      const filename = path.basename(decodeURIComponent(rawParam));
      const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
      if (
        queryToken &&
        (verifySessionToken(queryToken) || (filename && verifyScopedPdfToken(filename, queryToken)))
      ) {
        next();
        return;
      }
    } catch {
      // Fall through to standard session auth
    }
  }

  const token = extractToken(req);
  if (!token || !verifySessionToken(token)) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in to access this resource.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  // CSRF Protection for ambient cookie sessions on state-changing requests
  const isCookieAuth = !req.headers.authorization && !req.headers['x-admin-token'] && !!req.headers.cookie;
  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase());
  if (isCookieAuth && isStateChanging) {
    const origin = (req.headers.origin || '').trim();
    if (origin) {
      const allowedOrigins = new Set<string>([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5001',
        'http://127.0.0.1:5001',
      ]);
      if (process.env.APP_URL) {
        try { allowedOrigins.add(new URL(process.env.APP_URL).origin); } catch {}
      }
      if (process.env.RENDER_EXTERNAL_URL) {
        try { allowedOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin); } catch {}
      }
      if (process.env.ALLOWED_ORIGINS) {
        process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
          const t = o.trim();
          if (t) allowedOrigins.add(t);
        });
      }
      let isAllowed = allowedOrigins.has(origin);
      if (!isAllowed) {
        try {
          const url = new URL(origin);
          if (url.hostname.endsWith('.onrender.com')) isAllowed = true;
        } catch {}
      }
      if (!isAllowed) {
        res.status(403).json({
          success: false,
          error: 'Cross-origin state-changing request blocked by CSRF protection policy.',
          code: 'FORBIDDEN_ORIGIN',
        });
        return;
      }
    }
  }

  next();
}
