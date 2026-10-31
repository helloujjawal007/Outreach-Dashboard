import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';

const TOKEN_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically signed session token for admin access
 */
export function generateSessionToken(): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
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
 * Verifies if the provided session token is valid and not expired
 */
export function verifySessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encodedPayload, signature] = parts;
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
 * Extracts session token from headers (Authorization Bearer, x-admin-token) or Cookie
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

  // 4. Query param token: ?token=<token>
  if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }

  return null;
}

/**
 * Express middleware to protect all /api routes except public endpoints
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  // Whitelisted public endpoints
  const isPublic =
    path === '/api/health' ||
    path.startsWith('/api/auth/') ||
    path === '/health';

  if (isPublic) {
    next();
    return;
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

  next();
}
