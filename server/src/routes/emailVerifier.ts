import { Router, type Request, type Response } from 'express';
import { millionVerifierService } from '../services/millionVerifierService';
import { emailValidatorService } from '../services/emailValidatorService';

export const emailVerifierRouter = Router();

// GET /api/email-verifier/credits - Check live MillionVerifier account balance and plan
emailVerifierRouter.get('/credits', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const creditsData = await millionVerifierService.getCredits(forceRefresh);
    res.json({
      success: true,
      apiKeyConfigured: Boolean(millionVerifierService.getApiKey()),
      maskedKey: millionVerifierService.getApiKey().slice(0, 4) + '...' + millionVerifierService.getApiKey().slice(-4),
      ...creditsData,
    });
  } catch (error: any) {
    console.error('[emailVerifierRouter.credits]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch credits' });
  }
});

// POST /api/email-verifier/verify - Test single email verification
emailVerifierRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email string is required' });
    }

    // Run verification through unified validator (MillionVerifier with DNS fallback)
    const unifiedResult = await emailValidatorService.verifyEmail(email.trim());
    const millionRaw = await millionVerifierService.verifySingleEmail(email.trim());

    res.json({
      success: true,
      email: email.trim(),
      unified: unifiedResult,
      millionVerifier: millionRaw,
    });
  } catch (error: any) {
    console.error('[emailVerifierRouter.verify]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to verify email' });
  }
});

// POST /api/email-verifier/batch - Batch verification for array of emails
emailVerifierRouter.post('/batch', async (req: Request, res: Response) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of emails is required' });
    }

    const cleanEmails = emails.slice(0, 50).map((e) => String(e).trim()).filter(Boolean);
    const results = await Promise.all(
      cleanEmails.map(async (email) => {
        const unified = await emailValidatorService.verifyEmail(email);
        return unified;
      })
    );

    res.json({
      success: true,
      total: results.length,
      results,
    });
  } catch (error: any) {
    console.error('[emailVerifierRouter.batch]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to batch verify emails' });
  }
});
