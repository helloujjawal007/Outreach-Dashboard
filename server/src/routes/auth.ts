import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { generateSessionToken, extractToken, verifySessionToken } from '../middleware/auth';

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Authenticates master admin password
 */
authRouter.post('/login', (req: Request, res: Response) => {
  try {
    const { password } = req.body || {};

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    const providedBuf = Buffer.from(password.trim());
    const expectedBuf = Buffer.from(env.ADMIN_PASSWORD.trim());

    // Constant-time comparison
    const isMatch =
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid master passphrase' });
    }

    const { token, expiresAt } = generateSessionToken();

    // Set HTTP-only secure cookie
    res.cookie('ods_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    res.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      message: 'Authentication successful',
    });
  } catch (err: any) {
    console.error('[Auth API] Login error:', err);
    res.status(500).json({ success: false, error: 'Login processing failed' });
  }
});

/**
 * GET /api/auth/me
 * Checks if current request has a valid session
 */
authRouter.get('/me', (req: Request, res: Response) => {
  const token = extractToken(req);
  const isValid = token ? verifySessionToken(token) : false;

  res.json({
    success: true,
    authenticated: isValid,
    role: isValid ? 'admin' : null,
  });
});

/**
 * POST /api/auth/logout
 * Clears session cookie
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('ods_session', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
});
