/**
 * MillionVerifier Service
 * Real-time Single & Batch Email Deliverability Verification via MillionVerifier API v3
 * Docs: https://app.millionverifier.com/api/
 */

export interface MillionVerifierCredits {
  credits: number;
  bulk_credits: number;
  renewing_credits: number;
  plan: number;
  error?: string;
  isWorking: boolean;
}

export interface MillionVerifierResult {
  email: string;
  result: 'ok' | 'invalid' | 'catch_all' | 'unknown' | 'error' | 'disposable';
  resultcode: number; // 1: ok, 2: catch_all, 3: unknown, 4: error, 5: disposable, 6: invalid
  subresult?: string;
  free?: boolean;
  role?: boolean;
  didyoumean?: string;
  credits?: number;
  error?: string;
  livemode?: boolean;
  executiontime?: number;
}

export class MillionVerifierService {
  private apiKey: string;
  private cache: Map<string, { result: MillionVerifierResult; timestamp: number }> = new Map();
  private lastCreditsCheck: { credits: MillionVerifierCredits; timestamp: number } | null = null;

  constructor() {
    this.apiKey = process.env.MILLIONVERIFIER_API_KEY || 'xFJ7dBfVbNz0aNcLdvWIIAGFj';
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public setApiKey(key: string): void {
    if (key && key.trim()) {
      this.apiKey = key.trim();
      this.cache.clear();
      this.lastCreditsCheck = null;
    }
  }

  /**
   * Fetches account balance and subscription plan from MillionVerifier
   */
  public async getCredits(forceRefresh = false): Promise<MillionVerifierCredits> {
    const now = Date.now();
    if (!forceRefresh && this.lastCreditsCheck && now - this.lastCreditsCheck.timestamp < 30000) {
      return this.lastCreditsCheck.credits;
    }

    try {
      const response = await fetch(
        `https://api.millionverifier.com/api/v3/credits?api=${encodeURIComponent(this.apiKey)}`,
        { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      );

      if (!response.ok) {
        throw new Error(`MillionVerifier HTTP error ${response.status}`);
      }

      const data = (await response.json()) as any;
      if (data.error) {
        const result: MillionVerifierCredits = {
          credits: 0,
          bulk_credits: 0,
          renewing_credits: 0,
          plan: data.plan ?? 0,
          error: data.error,
          isWorking: false,
        };
        this.lastCreditsCheck = { credits: result, timestamp: now };
        return result;
      }

      const creditsResult: MillionVerifierCredits = {
        credits: typeof data.credits === 'number' ? data.credits : 0,
        bulk_credits: typeof data.bulk_credits === 'number' ? data.bulk_credits : 0,
        renewing_credits: typeof data.renewing_credits === 'number' ? data.renewing_credits : 0,
        plan: typeof data.plan === 'number' ? data.plan : 4,
        isWorking: true,
      };

      this.lastCreditsCheck = { credits: creditsResult, timestamp: now };
      return creditsResult;
    } catch (err: any) {
      console.warn('[MillionVerifierService.getCredits] Network warning:', err.message);
      return {
        credits: 0,
        bulk_credits: 0,
        renewing_credits: 0,
        plan: 4,
        error: err.message,
        isWorking: false,
      };
    }
  }

  /**
   * Verifies a single email address via MillionVerifier API v3
   */
  public async verifySingleEmail(rawEmail: string): Promise<MillionVerifierResult> {
    const email = (rawEmail || '').trim().toLowerCase();
    if (!email) {
      return {
        email: rawEmail,
        result: 'error',
        resultcode: 4,
        error: 'Email is empty',
      };
    }

    // Check memory cache (valid for 15 minutes)
    const cached = this.cache.get(email);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached.result;
    }

    try {
      const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(this.apiKey)}&email=${encodeURIComponent(email)}&timeout=10`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`MillionVerifier HTTP ${response.status}`);
      }

      const data = (await response.json()) as MillionVerifierResult;
      this.cache.set(email, { result: data, timestamp: Date.now() });
      return data;
    } catch (err: any) {
      console.warn(`[MillionVerifierService.verifySingleEmail] Error for "${email}":`, err.message);
      return {
        email,
        result: 'error',
        resultcode: 4,
        error: err.message || 'Verification request timed out',
      };
    }
  }
}

export const millionVerifierService = new MillionVerifierService();
