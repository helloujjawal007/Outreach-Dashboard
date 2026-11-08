import { signUnsubscribeToken } from '../utils/tokenSigner';

export interface LeadContext {
  id: string;
  businessName: string;
  category?: string;
  primaryContactName?: string;
  email?: string | null;
  city?: string;
  country?: string;
  website?: string | null;
  auditScore?: number;
  psiPerformanceScore?: number | null;
  auditIssues?: string[];
  auditFindings?: string[];
  auditKeyTakeaways?: string;
  auditPdfName?: string;
  auditPdfPath?: string;
  auditDate?: string;
  gmbNotes?: string;
  industryLocation?: string;
}

export interface HumanCopyResult {
  subject: string;
  body: string;
  stage: 'initial' | 'followup_1' | 'followup_2' | 'followup_3';
  stageLabel: string;
  delayFromStartDays: number;
}

type Stage = HumanCopyResult['stage'];

export class HumanCopywriterService {
  public readonly agencyName = 'Cloud Consultancy';
  public readonly senderEmail = 'cloudconsultancy.ad@gmail.com';
  public readonly auditToolUrl = 'https://technical-audit-dashboard.vercel.app/';

  /**
   * Cleans corporate identifiers for natural conversational reading
   */
  public cleanBusinessName(name: string): string {
    if (!name) return 'your team';
    return (
      name
        .replace(/\b(llc|inc|corp|ltd|pvt|co|company|services|solutions|group|holdings)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[,.-]+$/, '')
        .trim() || name.trim()
    );
  }

  /**
   * Cleans city / location strings to avoid robotic placeholders like "(Not identified)", "n/a", etc.
   */
  public cleanLocation(loc?: string): string {
    if (!loc) return '';
    const l = loc.trim();
    if (
      /^\(?not identified\)?$/i.test(l) ||
      /^n\/?a$/i.test(l) ||
      /^none$/i.test(l) ||
      /^unknown$/i.test(l) ||
      /^null$/i.test(l)
    ) {
      return '';
    }
    return l;
  }

  /**
   * Cleans category strings to avoid "Uncategorized", "General Business", etc.
   */
  public cleanCategory(cat?: string): string {
    if (!cat) return 'local services';
    const c = cat.trim();
    if (
      /^uncategorized$/i.test(c) ||
      /^\(?not identified\)?$/i.test(c) ||
      /^general business$/i.test(c) ||
      /^n\/?a$/i.test(c) ||
      /^none$/i.test(c) ||
      /^null$/i.test(c)
    ) {
      return 'local services';
    }
    return c;
  }

  /**
   * Builds an approved, natural greeting strictly adhering to the allowed pattern:
   * /^(Hi [A-Z][a-z]+|Hi there|Hello .+ team),$/
   */
  public buildGreeting(businessName: string, contactName?: string): string {
    const rawContact = (contactName || '').trim();
    const cleanBiz = this.cleanBusinessName(businessName);

    // Validate if contactName begins with a genuine single-word human first name
    const candidateFirst = rawContact ? rawContact.split(' ')[0] : '';
    const isHumanFirstName = Boolean(
      candidateFirst &&
      /^[A-Z][a-z]{1,20}$/.test(candidateFirst) &&
      rawContact.toLowerCase() !== businessName.toLowerCase() &&
      !rawContact.toLowerCase().includes('http') &&
      !rawContact.toLowerCase().includes('@') &&
      !rawContact.toLowerCase().includes('dr.') &&
      !rawContact.toLowerCase().includes('mr.') &&
      !rawContact.toLowerCase().includes('mrs.')
    );

    if (isHumanFirstName) {
      return `Hi ${candidateFirst},`;
    }

    if (cleanBiz && cleanBiz.toLowerCase() !== 'your team') {
      const bizWithoutThe = cleanBiz.replace(/^the\s+/i, '').trim();
      return `Hello ${bizWithoutThe} team,`;
    }

    return 'Hi there,';
  }

  /**
   * Backwards-compatible salutation helper
   */
  public buildSalutation(businessName: string, contactName?: string): string {
    const greeting = this.buildGreeting(businessName, contactName);
    return greeting.replace(/^Hi\s+|^Hello\s+|,$/g, '').trim();
  }

  /**
   * Anti-fingerprint random picker
   */
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Physical postal address (configurable via environment variable)
   * Refuses send if unset or matching known generic placeholders.
   */
  public getPostalAddress(): string {
    const address = (
      process.env.COMPANY_POSTAL_ADDRESS ||
      process.env.OUTREACH_POSTAL_ADDRESS ||
      ''
    ).trim();

    if (
      !address ||
      /100 pine street|suite 1250|123 main st|your address|placeholder|city, state/i.test(address)
    ) {
      throw new Error(
        `Refusing to send email: COMPANY_POSTAL_ADDRESS is unset or a known placeholder ("${address}"). A valid physical postal address is required for anti-spam compliance.`
      );
    }
    return address;
  }

  /**
   * Builds honest, professional humanoid signature with valid postal address and cryptographically signed unsubscribe token.
   */
  public buildFooter(leadId?: string, leadEmail?: string): string {
    const address = this.getPostalAddress();
    let unsubText = '';
    if (leadId && leadEmail) {
      const publicBaseUrl = (
        process.env.PUBLIC_APP_URL ||
        process.env.APP_URL ||
        'https://outreach.cloudconsultancy.in'
      ).replace(/\/$/, '');
      const token = signUnsubscribeToken(leadId, leadEmail);
      const unsubUrl = `${publicBaseUrl}/api/unsubscribe?token=${token}`;
      unsubText = `\n\nIf you prefer not to receive future updates, you can unsubscribe here: ${unsubUrl}`;
    }
    return `Best regards,\n${this.agencyName} Team\n${this.senderEmail}\n\n${address}${unsubText}`;
  }

  private compose(bodyLines: string[], leadId?: string, leadEmail?: string): string {
    return `${bodyLines.join('\n')}\n\n${this.buildFooter(leadId, leadEmail)}`;
  }

  /**
   * Generates genuine, human-written copy in pure, natural English free of hype, robotic tokens, and AI clichés
   */
  public getEmailCopy(lead: LeadContext, stage: Stage): HumanCopyResult {
    const business = this.cleanBusinessName(lead.businessName || 'your business');
    const salutation = this.buildSalutation(lead.businessName, lead.primaryContactName);

    const cleanCity = this.cleanLocation(lead.city);
    const cleanCat = this.cleanCategory(lead.category);
    const categoryPhrase = cleanCat !== 'local services' ? `${cleanCat.toLowerCase()} companies` : 'local businesses';
    const cityPhrase = cleanCity ? ` in ${cleanCity}` : '';
    const cityText = cleanCity ? ` in ${cleanCity}` : ' in your local market';

    const rawWeb = (lead.website || '').trim();
    const isMapsUrl = /google\.com\/maps|maps\.google\.com/i.test(rawWeb);
    const hasWebsite = Boolean(
      rawWeb && !isMapsUrl && rawWeb.toLowerCase() !== 'n/a' && rawWeb.toLowerCase() !== 'none'
    );

    // CASE A: NO PDF / NO ACTIVE WEBSITE -> NATURAL BUSINESS NOTE + PITCH HIGH-CONVERTING WEBSITE & SEO
    if (!hasWebsite || (!lead.auditPdfPath && !lead.auditPdfName)) {
      if (stage === 'initial') {
        return {
          subject: this.pick([
            `Quick note regarding ${business}`,
            `${business} – Google search & website inquiry`,
            `Question regarding ${business}${cityPhrase}`,
          ]),
          body: this.compose([
            this.buildGreeting(lead.businessName, lead.primaryContactName),
            ``,
            `I noticed that ${business} currently doesn't have an active, modern website or dedicated landing page linked to your local Google Business profile.`,
            ``,
            `When customers search for ${categoryPhrase}${cityPhrase} on their phones, most look for quick service details, pricing, and a simple way to get in touch. Without a mobile-friendly site, many end up contacting nearby competitors instead.`,
            ``,
            `At Cloud Consultancy, we help local businesses set up clean, fast-loading mobile websites and optimize their Google search presence to consistently generate more direct inquiries.`,
            ``,
            `I put together a quick mockup concept for ${business} showing what this would look like. Would you be open to taking a quick look?`,
          ]),
          stage: 'initial',
          stageLabel: '1st Email (Business Summary & Services Pitch)',
          delayFromStartDays: 0,
        };
      }

      if (stage === 'followup_1') {
        return {
          subject: `Following up: ${business}`,
          body: this.compose([
            `Hi ${salutation},`,
            ``,
            `Following up briefly on my earlier note regarding ${business}.`,
            ``,
            `Did you have a chance to see my note about setting up a high-converting website and local Google search presence for your business?`,
            ``,
            `We have seen local businesses increase their inbound inquiries substantially just by having a fast mobile site and high Google Maps ranking.`,
            ``,
            `I would be happy to share a couple of initial layout ideas if you find that helpful.`,
          ]),
          stage: 'followup_1',
          stageLabel: '2nd Email (Day 3 Follow-up)',
          delayFromStartDays: 3,
        };
      }

      if (stage === 'followup_2') {
        return {
          subject: `Inquiries for ${business}`,
          body: this.compose([
            `Hi ${salutation},`,
            ``,
            `Checking in once more regarding ${business}.`,
            ``,
            `If launching a modern website or improving your local Google ranking is on your roadmap this quarter, I'd be glad to share a straightforward approach and pricing options.`,
            ``,
            `Let me know if you'd like to take a look, or feel free to let me know if the timing isn't right.`,
          ]),
          stage: 'followup_2',
          stageLabel: '3rd Email (Day 6 Follow-up)',
          delayFromStartDays: 6,
        };
      }

      return {
        subject: `Closing the loop: ${business}`,
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `I assume you're busy at the moment, so I won't follow up further. If you ever want to launch a modern website or improve your Google search presence for ${business} down the road, feel free to reach out anytime.`,
          ``,
          `Wishing you and the ${business} team continued success.`,
        ]),
        stage: 'followup_3',
        stageLabel: '4th Email (Day 10 Final Note)',
        delayFromStartDays: 10,
      };
    }

    // CASE B: LEAD HAS ATTACHED PDF -> HUMAN-WRITTEN TECHNICAL OBSERVATIONS & AUDIT REPORT
    const domain = rawWeb.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    const pdfName = lead.auditPdfName || `${domain.replace(/[^a-z0-9]/gi, '_')}_Technical_Audit.pdf`;
    const scoreVal = lead.auditScore ? Number(lead.auditScore) : undefined;
    const scoreSummary = scoreVal ? `scoring ${scoreVal}/100 on Core Web Vitals` : 'below Google mobile speed benchmarks';

    // Extract 3-5 real concrete audit findings from TD
    let rawFindings: string[] = [];
    if (lead.auditFindings && Array.isArray(lead.auditFindings) && lead.auditFindings.length > 0) {
      rawFindings = lead.auditFindings.map((s) => String(s).trim()).filter(Boolean);
    } else if (lead.auditIssues && Array.isArray(lead.auditIssues) && lead.auditIssues.length > 0) {
      rawFindings = lead.auditIssues.map((s) => String(s).trim()).filter(Boolean);
    } else if (lead.auditKeyTakeaways && lead.auditKeyTakeaways.trim()) {
      rawFindings = lead.auditKeyTakeaways.split(';').map((s) => s.trim()).filter(Boolean);
    }

    // Never send empty audit template
    if (rawFindings.length === 0) {
      throw new Error(`Audit findings missing for lead ${lead.id} (${lead.businessName}). Never send empty audit templates.`);
    }

    const auditDateFormatted = lead.auditDate
      ? new Date(lead.auditDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    const bulletList = rawFindings.slice(0, 5).map((f) => (f.startsWith('•') ? f : `• ${f}`));
    const findingsBullets = bulletList.join('\n');

    const findingsIntro = rawFindings.length === 1
      ? 'Here is the key diagnostic observation identified on the site:'
      : 'Here are the top diagnostic findings identified on the site:';

    const fu1FindingsIntro = rawFindings.length === 1
      ? 'As a quick reminder, here was the primary technical observation noted on the site:'
      : 'As a quick reminder, here were the primary items noted on the site:';

    const greeting = this.buildGreeting(lead.businessName, lead.primaryContactName);
    const hasCwv = rawFindings.some((f) =>
      /LCP|CLS|FID|INP|Largest Contentful Paint|Cumulative Layout Shift|First Input Delay|Interaction to Next Paint/i.test(f)
    );

    const cwvSpeedContext = hasCwv
      ? 'When mobile visitors experience loading delays or Core Web Vitals benchmark gaps, bounce rates climb quickly.'
      : 'When mobile visitors experience loading delays or missing metadata, bounce rates climb quickly.';

    let scoreClause = '';
    if (lead.psiPerformanceScore !== undefined && lead.psiPerformanceScore !== null) {
      scoreClause = ` (PageSpeed mobile performance score: ${lead.psiPerformanceScore}/100)`;
    } else if (scoreVal) {
      scoreClause = ` (Diagnostic performance score: ${scoreVal}/100)`;
    }

    if (stage === 'initial') {
      const subjects = [
        `Technical audit notes for ${domain} (report attached)`,
        `Website performance summary: ${domain}`,
        `Quick diagnostic breakdown regarding ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          greeting,
          ``,
          `I put together a quick technical and performance summary for ${domain} (attached: ${pdfName})${scoreClause}.`,
          ``,
          findingsIntro,
          findingsBullets,
          ``,
          cwvSpeedContext,
          ``,
          `I included the specific page assets, metric breakdown, and practical fixes in the 1-page attached report so your team can look through them directly.`,
          ``,
          `Happy to share how we usually resolve these or answer any questions if helpful.`,
        ], lead.id, lead.email || undefined),
        stage: 'initial',
        stageLabel: '1st Email (Audit Findings & PDF Enclosed)',
        delayFromStartDays: 0,
      };
    }

    // 2. Follow-up 1 (Day 2.5)
    if (stage === 'followup_1') {
      const subjects = [
        `Following up: ${domain} technical summary`,
        `Quick check-in regarding ${business} (${domain})`,
        `Technical notes for ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          greeting,
          ``,
          `Following up briefly on the technical breakdown I sent over for ${domain} (audited on ${auditDateFormatted}).`,
          ``,
          fu1FindingsIntro,
          rawFindings.slice(0, 3).map((f) => (f.startsWith('•') ? f : `• ${f}`)).join('\n'),
          ``,
          `Did your team have a chance to take a look at the attached report (${pdfName})? Happy to walk through the fixes if that would be useful.`,
        ], lead.id, lead.email || undefined),
        stage: 'followup_1',
        stageLabel: '2nd Email (Day 2.5 Follow-up with Findings & PDF)',
        delayFromStartDays: 2.5,
      };
    }

    // 3. Follow-up 2 (Day 5.5)
    if (stage === 'followup_2') {
      const subjects = [
        `Final check-in: ${business} (${domain})`,
        `Closing the loop on ${domain} technical notes`,
        `${business} website performance`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          greeting,
          ``,
          `Following up one last time regarding the technical audit for ${domain} (${auditDateFormatted}).`,
          ``,
          `If resolving these technical items or improving mobile load speed is on your radar this quarter, let me know and I'd be glad to share a straightforward walkthrough of our approach.`,
          ``,
          `If you've got this handled or the timing isn't right, no problem at all. Wishing you and the ${business} team continued success.`,
        ], lead.id, lead.email || undefined),
        stage: 'followup_2',
        stageLabel: '3rd Email (Day 5.5 Follow-up)',
        delayFromStartDays: 5.5,
      };
    }

    // 4. Follow-up 3 (Day 10, final message)
    const subjects = [
      `Closing the loop: ${business}`,
      `Last note regarding ${domain}`,
      `Final check-in: ${business}`,
    ];

    return {
      subject: this.pick(subjects),
      body: this.compose([
        greeting,
        ``,
        `I assume you're busy at the moment, so I won't follow up further. If you ever need a hand with ${business}'s web performance, Lighthouse metrics, or technical fixes down the road, feel free to reach out anytime.`,
        ``,
        `Wishing you and the ${business} team continued success.`,
      ], lead.id, lead.email || undefined),
      stage: 'followup_3',
      stageLabel: '4th Email (Day 10 Final Message)',
      delayFromStartDays: 10,
    };
  }
}

export const humanCopywriterService = new HumanCopywriterService();
