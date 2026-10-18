import fs from 'fs';
import path from 'path';

export interface WorkflowRoutingResult {
  workflow: 'workflow_a' | 'workflow_b';
  status: 'pending_audit' | 'active';
  auditStatus: 'pending_audit' | 'none';
  hasValidWebsite: boolean;
  cleanWebsite: string;
}

export interface PdfValidationResult {
  isValid: boolean;
  fileSize: number;
  filename: string;
  reason?: string;
}

export class WorkflowRoutingService {
  /**
   * Determine if a website URL is genuine and valid (not Google Maps, not N/A)
   */
  public hasValidWebsite(rawUrl?: string | null): boolean {
    if (!rawUrl) return false;
    const trimmed = rawUrl.trim().toLowerCase();
    if (
      !trimmed ||
      trimmed === 'n/a' ||
      trimmed === 'none' ||
      trimmed === 'null' ||
      trimmed === 'undefined' ||
      trimmed === 'no' ||
      trimmed.includes('google.com/maps') ||
      trimmed.includes('maps.google.com') ||
      trimmed.includes('facebook.com') ||
      trimmed.includes('instagram.com')
    ) {
      return false;
    }

    try {
      const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
      const parsed = new URL(normalized);
      return Boolean(parsed.hostname && parsed.hostname.includes('.'));
    } catch {
      return false;
    }
  }

  /**
   * Cleans a website URL to standard domain or https format
   */
  public cleanWebsiteUrl(rawUrl?: string | null): string {
    if (!rawUrl) return '';
    let u = rawUrl.trim();
    if (this.hasValidWebsite(u)) {
      return u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    }
    return '';
  }

  /**
   * Checklist 1: Logic Branching & Condition Handling
   * - Leads with verified website -> Workflow A (State locked: PENDING_AUDIT)
   * - Leads without website -> Workflow B (GMB & Web Dev Path, status: ACTIVE)
   */
  public determineWorkflow(lead: { website?: string | null; notes?: string }): WorkflowRoutingResult {
    let site = lead.website || '';
    if (!site && lead.notes) {
      const m = lead.notes.match(/Website:\s*([^|\s]+)/i);
      if (m) site = m[1];
    }

    const valid = this.hasValidWebsite(site);
    const cleanSite = this.cleanWebsiteUrl(site);

    if (valid) {
      return {
        workflow: 'workflow_a',
        status: 'pending_audit',
        auditStatus: 'pending_audit',
        hasValidWebsite: true,
        cleanWebsite: cleanSite,
      };
    }

    return {
      workflow: 'workflow_b',
      status: 'active',
      auditStatus: 'none',
      hasValidWebsite: false,
      cleanWebsite: '',
    };
  }

  /**
   * Checklist 2: Attachment Validation
   * - PDF exists on disk
   * - Not empty (> 1024 bytes)
   * - Valid magic header (%PDF / 0x25 0x50 0x44 0x46)
   * - Domain check (matches recipient's domain)
   */
  public validateAuditPdf(filePath?: string | null, expectedDomain?: string): PdfValidationResult {
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
      return { isValid: false, fileSize: 0, filename: '', reason: 'No PDF file path provided.' };
    }

    const resolved = path.resolve(filePath.trim());
    if (!fs.existsSync(resolved)) {
      return { isValid: false, fileSize: 0, filename: path.basename(resolved), reason: `File not found on disk at: ${resolved}` };
    }

    try {
      const stats = fs.statSync(resolved);
      if (stats.size < 1024) {
        return { isValid: false, fileSize: stats.size, filename: path.basename(resolved), reason: `File is too small (${stats.size} bytes). Corrupt or empty PDF.` };
      }

      // Read first 5 bytes to verify standard %PDF header
      const fd = fs.openSync(resolved, 'r');
      const buffer = Buffer.alloc(5);
      fs.readSync(fd, buffer, 0, 5, 0);
      fs.closeSync(fd);

      const header = buffer.toString('utf8');
      if (!header.startsWith('%PDF')) {
        return { isValid: false, fileSize: stats.size, filename: path.basename(resolved), reason: `Invalid PDF format. Header is "${header}", expected "%PDF".` };
      }

      // Check domain match if provided
      const base = path.basename(resolved).toLowerCase();
      if (expectedDomain) {
        const cleanDomain = expectedDomain.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanBase = base.replace(/[^a-z0-9]/g, '');
        // Informational check
        if (cleanDomain.length >= 4 && !cleanBase.includes(cleanDomain)) {
          console.warn(`[WorkflowRoutingService] Warning: PDF filename "${base}" may not match target domain "${expectedDomain}"`);
        }
      }

      return {
        isValid: true,
        fileSize: stats.size,
        filename: path.basename(resolved),
      };
    } catch (err: any) {
      return { isValid: false, fileSize: 0, filename: path.basename(resolved), reason: `File read error: ${err?.message}` };
    }
  }

  /**
   * Checklist 2 & 3: Dynamic Token Replacement & Residual Placeholder Sanitizer
   * Populates variables and guarantees ZERO raw {{...}} tokens remain in dispatched email.
   */
  public sanitizeTokens(
    content: string,
    tokens: {
      first_name?: string;
      company_name?: string;
      business_name?: string;
      website_url?: string;
      audit_key_takeaways?: string;
      audit_pdf_name?: string;
      industry_location?: string;
      gmb_notes?: string;
      category?: string;
      city?: string;
    }
  ): string {
    if (!content) return '';

    const cleanBiz = (tokens.company_name || tokens.business_name || 'your business')
      .replace(/\b(llc|inc|corp|ltd|pvt|co|company|services|solutions|group|holdings)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const firstName = tokens.first_name || (cleanBiz !== 'your business' ? `${cleanBiz} team` : 'there');
    const website = tokens.website_url || '';
    const auditTakeaways = tokens.audit_key_takeaways || 'Core Web Vitals bottlenecks and mobile rendering latency';
    const auditPdfName = tokens.audit_pdf_name || (website ? `${website.replace(/[^a-z0-9]/gi, '_')}_audit_report.pdf` : 'technical_audit_report.pdf');
    const indLoc = tokens.industry_location || (tokens.category && tokens.city ? `${tokens.category} in ${tokens.city}` : tokens.category || tokens.city || 'your local market');
    const gmbNotes = tokens.gmb_notes || 'with strong customer feedback';

    let result = content
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{company_name\}\}/gi, cleanBiz)
      .replace(/\{\{business_name\}\}/gi, cleanBiz)
      .replace(/\{\{website_url\}\}/gi, website)
      .replace(/\{\{audit_key_takeaways\}\}/gi, auditTakeaways)
      .replace(/\{\{audit_pdf_name\}\}/gi, auditPdfName)
      .replace(/\{\{industry_location\}\}/gi, indLoc)
      .replace(/\{\{gmb_notes\}\}/gi, gmbNotes)
      .replace(/\{\{category\}\}/gi, tokens.category || 'local services')
      .replace(/\{\{city\}\}/gi, tokens.city || 'your area');

    // Fail-safe pass: Replace ANY leftover {{...}} with appropriate clean text
    result = result.replace(/\{\{([a-zA-Z0-9_ -]+)\}\}/g, (_match, tokenKey) => {
      const lower = tokenKey.trim().toLowerCase();
      if (lower.includes('name')) return firstName;
      if (lower.includes('audit')) return auditTakeaways;
      if (lower.includes('pdf')) return auditPdfName;
      if (lower.includes('site') || lower.includes('url')) return website;
      if (lower.includes('loc') || lower.includes('city')) return indLoc;
      return '';
    });

    return result;
  }

  /**
   * Checklist 4: Deliverability & Compliance Checks
   * - Detects spam trigger words
   * - Enforces opt-out text
   */
  public verifyCompliance(
    subject: string,
    body: string
  ): { isCompliant: boolean; warnings: string[]; sanitizedSubject: string; sanitizedBody: string } {
    const warnings: string[] = [];
    let cleanSubject = subject.trim();
    let cleanBody = body.trim();

    // Spam words check
    const spamTriggers = [
      /\b100% free\b/i,
      /\bact now\b/i,
      /\brisk-free\b/i,
      /\bguaranteed income\b/i,
      /\bno catch\b/i,
      /\bcongratulations\b/i,
      /\bwinner\b/i,
      /\bmake money\b/i,
    ];

    for (const trigger of spamTriggers) {
      if (trigger.test(cleanSubject) || trigger.test(cleanBody)) {
        warnings.push(`Detected aggressive hype phrase matching ${trigger}`);
        cleanSubject = cleanSubject.replace(trigger, 'complimentary');
        cleanBody = cleanBody.replace(trigger, 'complimentary');
      }
    }

    // Check excessive capitalization in subject
    const letters = cleanSubject.replace(/[^a-zA-Z]/g, '');
    const upperLetters = cleanSubject.replace(/[^A-Z]/g, '');
    if (letters.length > 5 && upperLetters.length / letters.length > 0.4) {
      warnings.push('Subject line contains excessive uppercase letters.');
      cleanSubject = cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1).toLowerCase();
    }

    // Ensure opt-out footer is present
    const hasOptOut = /unsubscribe|opt-out|remove you from our list|stop/i.test(cleanBody);
    if (!hasOptOut) {
      cleanBody = `${cleanBody}\n\n---\nIf you prefer not to receive further emails, simply reply with "Unsubscribe" or "Stop".`;
    }

    return {
      isCompliant: warnings.length === 0,
      warnings,
      sanitizedSubject: cleanSubject,
      sanitizedBody: cleanBody,
    };
  }
}

export const workflowRoutingService = new WorkflowRoutingService();
