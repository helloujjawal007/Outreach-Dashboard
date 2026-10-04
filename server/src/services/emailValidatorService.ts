import dns from 'node:dns';
import { query } from '../config/db';

export interface EmailValidationResult {
  isValid: boolean;
  email: string;
  normalizedEmail: string;
  reason?: string;
  status: 'verified' | 'invalid_syntax' | 'disposable_domain' | 'previously_bounced' | 'no_mx_records' | 'domain_not_found' | 'unverified';
}

const RFC_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const KNOWN_PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'sample.com',
  'test.com',
  'domain.com',
  'yourdomain.com',
  'company.com',
  'none.com',
  'invalid.com',
  'fake.com',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'throwawaymail.com',
  'sentry.io',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'sharklasers.com',
  'dispostable.com',
  'mailnesia.com',
  'maildrop.cc',
  'inboxkitten.com',
  'fakemailgenerator.com',
  'generator.email',
  'crazymailing.com',
  'mohmal.com',
]);

const KNOWN_INVALID_USERNAMES = new Set([
  'test',
  'fake',
  'none',
  'noemail',
  'null',
  'undefined',
  'placeholder',
  'sample',
  'user',
  'username',
  'noreply',
  'no-reply',
  'donotreply',
  'anonymous',
]);

export class EmailValidatorService {
  private mxCache: Map<string, { hasMx: boolean; reason?: string; timestamp: number }> = new Map();
  private invalidListIdCache: string | null = null;
  private invalidListCacheTime = 0;

  /**
   * Fast synchronous syntax and placeholder check
   */
  public validateSyntax(rawEmail: string): { isValid: boolean; normalized: string; reason?: string } {
    if (!rawEmail || typeof rawEmail !== 'string') {
      return { isValid: false, normalized: '', reason: 'Email is empty or not a string' };
    }

    const trimmed = rawEmail.trim().toLowerCase();
    if (!trimmed) {
      return { isValid: false, normalized: '', reason: 'Email is empty after trimming' };
    }

    if (trimmed.length > 254) {
      return { isValid: false, normalized: trimmed, reason: 'Email exceeds maximum 254 characters' };
    }

    if (!trimmed.includes('@')) {
      return { isValid: false, normalized: trimmed, reason: 'Missing @ symbol' };
    }

    const parts = trimmed.split('@');
    if (parts.length !== 2) {
      return { isValid: false, normalized: trimmed, reason: 'Contains multiple @ symbols' };
    }

    const [user, domain] = parts;

    if (!user || user.length > 64) {
      return { isValid: false, normalized: trimmed, reason: 'Invalid local part length' };
    }

    if (KNOWN_INVALID_USERNAMES.has(user) || user.startsWith('noreply') || user.startsWith('no-reply') || user.startsWith('anonymous')) {
      return { isValid: false, normalized: trimmed, reason: `Generic or non-deliverable mailbox username (${user})` };
    }

    if (!domain || !domain.includes('.')) {
      return { isValid: false, normalized: trimmed, reason: 'Domain lacks a top-level extension (e.g. .com)' };
    }

    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    if (!tld || tld.length < 2 || !/^[a-z]+$/i.test(tld)) {
      return { isValid: false, normalized: trimmed, reason: 'Invalid top-level domain' };
    }

    if (KNOWN_PLACEHOLDER_DOMAINS.has(domain)) {
      return { isValid: false, normalized: trimmed, reason: `Known disposable or placeholder domain: ${domain}` };
    }

    if (!RFC_EMAIL_REGEX.test(trimmed)) {
      return { isValid: false, normalized: trimmed, reason: 'Failed RFC 5322 email syntax validation' };
    }

    return { isValid: true, normalized: trimmed };
  }

  /**
   * Asynchronous DNS MX record lookup with 3s timeout and 1-hour in-memory cache
   */
  public async checkDomainMx(domain: string): Promise<{ hasMx: boolean; reason?: string }> {
    const normalizedDomain = domain.trim().toLowerCase();

    // Cache hit
    const cached = this.mxCache.get(normalizedDomain);
    if (cached && Date.now() - cached.timestamp < 3600000) {
      return { hasMx: cached.hasMx, reason: cached.reason };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // DNS timeout - fallback to true so temporary DNS timeouts don't block legitimate delivery
        resolve({ hasMx: true });
      }, 3000);

      dns.resolveMx(normalizedDomain, (err, addresses) => {
        clearTimeout(timer);

        if (err) {
          if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'EREFUSED') {
            const result = {
              hasMx: false,
              reason: `Mail server domain "${normalizedDomain}" does not exist or has no active MX records (${err.code})`,
            };
            this.mxCache.set(normalizedDomain, { ...result, timestamp: Date.now() });
            return resolve(result);
          }
          // Other transient errors: fallback to true
          return resolve({ hasMx: true });
        }

        if (!addresses || addresses.length === 0) {
          const result = {
            hasMx: false,
            reason: `Domain "${normalizedDomain}" has no active Mail Exchange (MX) records configured`,
          };
          this.mxCache.set(normalizedDomain, { ...result, timestamp: Date.now() });
          return resolve(result);
        }

        const result = { hasMx: true };
        this.mxCache.set(normalizedDomain, { ...result, timestamp: Date.now() });
        resolve(result);
      });
    });
  }

  /**
   * Alias for verifyEmail
   */
  public async validateEmail(rawEmail: string): Promise<EmailValidationResult> {
    return this.verifyEmail(rawEmail);
  }

  /**
   * Full asynchronous verification checking syntax, disposable domains, prior bounces, and MX records
   */
  public async verifyEmail(rawEmail: string): Promise<EmailValidationResult> {
    const syntax = this.validateSyntax(rawEmail);
    if (!syntax.isValid) {
      const isDisposable = syntax.reason?.includes('disposable') || syntax.reason?.includes('placeholder');
      return {
        isValid: false,
        email: rawEmail,
        normalizedEmail: syntax.normalized,
        reason: syntax.reason,
        status: isDisposable ? 'disposable_domain' : 'invalid_syntax',
      };
    }

    const email = syntax.normalized;
    const domain = email.split('@')[1];

    // Check if email has previously bounced in message delivery history
    try {
      const bounceCheck = await query<{ count: string }>(
        `SELECT COUNT(*)::int as count 
         FROM messages 
         WHERE channel = 'email' 
           AND status = 'bounced' 
           AND (metadata->>'to' = $1 OR metadata->>'recipient_email' = $1)`,
        [email]
      );

      const bouncedCount = Number(bounceCheck.rows[0]?.count || 0);
      if (bouncedCount > 0) {
        return {
          isValid: false,
          email: rawEmail,
          normalizedEmail: email,
          reason: 'Previously recorded hard bounce in outreach log',
          status: 'previously_bounced',
        };
      }
    } catch {
      // Non-blocking query failure fallback
    }

    // Check MX records for the domain
    if (domain) {
      const mxCheck = await this.checkDomainMx(domain);
      if (!mxCheck.hasMx) {
        return {
          isValid: false,
          email: rawEmail,
          normalizedEmail: email,
          reason: mxCheck.reason || `Domain "${domain}" has no active MX records`,
          status: 'no_mx_records',
        };
      }
    }

    return {
      isValid: true,
      email: rawEmail,
      normalizedEmail: email,
      status: 'verified',
    };
  }

  /**
   * Ensures the 'Invalid List' exists in PostgreSQL lists table and returns its UUID
   */
  public async ensureInvalidList(): Promise<string> {
    const now = Date.now();
    if (this.invalidListIdCache && now - this.invalidListCacheTime < 120000) {
      return this.invalidListIdCache;
    }

    try {
      const existing = await query<{ id: string }>(
        `SELECT id FROM lists WHERE name = 'Invalid List' OR name = 'Invalid Leads' ORDER BY created_at ASC LIMIT 1`
      );

      if (existing.rows.length > 0) {
        this.invalidListIdCache = existing.rows[0].id;
        this.invalidListCacheTime = now;
        return this.invalidListIdCache;
      }

      const created = await query<{ id: string }>(
        `INSERT INTO lists (name, description, created_at, updated_at)
         VALUES ('Invalid List', 'Auto-populated list of leads with invalid, disposable, non-existent, or bounced email addresses flagged before outreach.', NOW(), NOW())
         RETURNING id`
      );

      this.invalidListIdCache = created.rows[0].id;
      this.invalidListCacheTime = now;
      console.log(`[EmailValidatorService] Created default system list: "Invalid List" (${this.invalidListIdCache})`);
      return this.invalidListIdCache;
    } catch (err) {
      console.error('[EmailValidatorService] Failed to ensure Invalid List:', err);
      return '';
    }
  }

  /**
   * Flags a lead as invalid and immediately moves them to the 'Invalid List', removes from 'Email Leads',
   * cancels any pending drafts or scheduled dispatches, and updates lead verification status.
   */
  public async flagAndMoveLeadToInvalidList(
    leadId: string,
    email: string,
    reason: string,
    status: string = 'invalid_syntax'
  ): Promise<{ success: boolean; listId: string }> {
    try {
      const invalidListId = await this.ensureInvalidList();

      // 1. Update lead verification and quarantine status
      await query(
        `UPDATE leads 
         SET email_verified = false, 
             email_verification_status = $1, 
             status = 'manual_review', 
             manual_review_reason = $2, 
             manual_review_at = NOW(),
             updated_at = NOW() 
         WHERE id = $3`,
        [status, `[Invalid Email] ${reason}`, leadId]
      );

      // 2. Add to Invalid List in lead_list_memberships
      if (invalidListId) {
        await query(
          `INSERT INTO lead_list_memberships (list_id, lead_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (list_id, lead_id) DO NOTHING`,
          [invalidListId, leadId]
        );
      }

      // 3. Remove from 'Email Leads' list if previously assigned
      const emailListRes = await query<{ id: string }>(
        `SELECT id FROM lists WHERE name = 'Email Leads' LIMIT 1`
      );
      if (emailListRes.rows.length > 0) {
        await query(
          `DELETE FROM lead_list_memberships WHERE list_id = $1 AND lead_id = $2`,
          [emailListRes.rows[0].id, leadId]
        );
      }

      // 4. Cancel any draft queue items for this lead
      await query(
        `UPDATE send_queue 
         SET status = 'discarded', 
             error_details = $1, 
             updated_at = NOW() 
         WHERE lead_id = $2 AND status = 'draft'`,
        [`[Invalid Email] ${reason}`, leadId]
      );

      // 5. Cancel any pending scheduled dispatches for this lead
      await query(
        `UPDATE scheduled_dispatches 
         SET status = 'cancelled', 
             error_message = $1, 
             updated_at = NOW() 
         WHERE lead_id = $2 AND status = 'scheduled'`,
        [`[Invalid Email] ${reason}`, leadId]
      );

      console.warn(`[EmailValidatorService] ⚠️ Moved lead "${leadId}" to Invalid List. Email: "${email}", Reason: ${reason}`);
      return { success: true, listId: invalidListId };
    } catch (err) {
      console.error(`[EmailValidatorService] Error moving lead "${leadId}" to Invalid List:`, err);
      return { success: false, listId: '' };
    }
  }

  /**
   * Batch verify an array of leads and update their verification status in PostgreSQL
   */
  public async batchVerifyAndUpdateLeads(
    leads: Array<{ id: string; email?: string }>
  ): Promise<{
    verifiedCount: number;
    invalidCount: number;
    results: Map<string, EmailValidationResult>;
  }> {
    const results = new Map<string, EmailValidationResult>();
    let verifiedCount = 0;
    let invalidCount = 0;

    for (const lead of leads) {
      if (!lead.email) {
        invalidCount++;
        await this.flagAndMoveLeadToInvalidList(lead.id, '', 'Missing email address', 'invalid_syntax');
        continue;
      }

      const res = await this.verifyEmail(lead.email);
      results.set(lead.id, res);

      if (res.isValid) {
        verifiedCount++;
        await query(
          `UPDATE leads 
           SET email_verified = true, 
               email_verification_status = 'verified', 
               updated_at = NOW() 
           WHERE id = $1`,
          [lead.id]
        );
      } else {
        invalidCount++;
        await this.flagAndMoveLeadToInvalidList(
          lead.id,
          lead.email,
          res.reason || 'Invalid email',
          res.status
        );
      }
    }

    return { verifiedCount, invalidCount, results };
  }
}

export const emailValidatorService = new EmailValidatorService();
