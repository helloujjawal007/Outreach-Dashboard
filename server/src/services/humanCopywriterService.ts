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
  auditIssues?: string[];
  auditFindings?: string[];
  auditKeyTakeaways?: string;
  auditPdfName?: string;
  auditPdfPath?: string;
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
   */
  public getPostalAddress(): string {
    return process.env.OUTREACH_POSTAL_ADDRESS || 'Cloud Consultancy Outbound, 100 Pine Street, Suite 1250, San Francisco, CA 94111';
  }

  /**
   * Builds the honest sender signature & compliance footer (physical address + one-click unsubscribe link)
   */
  public buildFooter(leadId?: string, leadEmail?: string): string {
    const appUrl = process.env.APP_URL || 'http://localhost:5001';
    const unsubUrl = leadId
      ? `${appUrl}/api/unsubscribe?leadId=${encodeURIComponent(leadId)}&email=${encodeURIComponent(leadEmail || '')}`
      : `${appUrl}/api/unsubscribe`;

    return `Best regards,\n${this.agencyName} Outbound Team\n${this.senderEmail}\n\n--\n${this.getPostalAddress()}\nTo unsubscribe or opt out of future technical checks: ${unsubUrl}`;
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
            `Hi ${salutation},`,
            ``,
            `I was researching ${categoryPhrase}${cityPhrase} on Google earlier today and came across ${business}.`,
            ``,
            `You have built a solid local reputation serving customers${cityText}, but I noticed that ${business} currently doesn't have an active, modern website or dedicated landing page linked to your Google Business Profile.`,
            ``,
            `When people search on their phones, over 70% look for immediate service details, pricing, and a simple way to get in touch. Without a dedicated website, many of those potential customers end up calling nearby competitors instead.`,
            ``,
            `At Cloud Consultancy, we help local businesses set up clean, fast-loading mobile websites and optimize their Google search ranking so they consistently generate more direct inquiries.`,
            ``,
            `I put together a quick mockup concept and local search roadmap for ${business} showing what this would look like. Would you be open to taking a quick look?`,
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

    const scoreClause = scoreVal ? ` (Lighthouse mobile test score: ${scoreVal}/100)` : '';

    if (stage === 'initial') {
      const subjects = [
        `Automated technical check summary: ${domain} (report attached)`,
        `Technical diagnostic notes for ${domain}`,
        `Routine technical check regarding ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          greeting,
          ``,
          `Our automated diagnostic system recently performed a routine technical check on ${domain}${scoreClause}. We compiled the diagnostic observations into a 1-page summary report and attached it here (${pdfName}) for your web team.`,
          ``,
          findingsIntro,
          findingsBullets,
          ``,
          cwvSpeedContext,
          ``,
          `The attached document outlines the exact line-item findings and the recommended fixes we typically implement.`,
          ``,
          `Happy to answer any questions or share how we usually resolve these if useful for your team.`,
        ], lead.id, lead.email || undefined),
        stage: 'initial',
        stageLabel: '1st Email (Audit Findings & PDF Enclosed)',
        delayFromStartDays: 0,
      };
    }

    // 2. Follow-up 1 (Day 2.5)
    if (stage === 'followup_1') {
      const subjects = [
        `Following up: ${domain} technical diagnostic summary`,
        `Following up regarding ${business} (${domain})`,
        `Quick check-in: ${domain} technical notes`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          greeting,
          ``,
          `Following up briefly on the automated technical check we sent over regarding ${domain}.`,
          ``,
          fu1FindingsIntro,
          rawFindings.slice(0, 3).map((f) => (f.startsWith('•') ? f : `• ${f}`)).join('\n'),
          ``,
          `I have re-attached the diagnostic summary (${pdfName}) for quick reference. Did your web team have a chance to review these points?`,
          ``,
          `Happy to answer any questions or walk through the specific fixes if useful.`,
        ], lead.id, lead.email || undefined),
        stage: 'followup_1',
        stageLabel: '2nd Email (Day 2.5 Follow-up with Findings & PDF)',
        delayFromStartDays: 2.5,
      };
    }

    // 3. Follow-up 2 (Day 5.5)
    if (stage === 'followup_2') {
      const subjects = [
        `Final check-in: ${business} (${domain}) technical report`,
        `Quick note: ${domain} technical observations`,
        `${business} website technical notes`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          greeting,
          ``,
          `Following up one final time regarding the automated technical check for ${domain} (${pdfName}).`,
          ``,
          `If resolving the technical items highlighted in the diagnostic report is on your roadmap this quarter, feel free to reply and I'll share our recommended implementation approach.`,
          ``,
          `If the timing isn't right or you already have this handled, no worries at all. Wishing you and the team continued success.`,
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
