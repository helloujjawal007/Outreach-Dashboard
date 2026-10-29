export interface LeadContext {
  id: string;
  businessName: string;
  category?: string;
  primaryContactName?: string;
  city?: string;
  country?: string;
  website?: string | null;
  auditScore?: number;
  auditIssues?: string[];
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
  public readonly senderEmail = 'sales@cloudconsultancy.in';
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
   * Builds a natural salutation (never robotic like "Hello The Fitness World team")
   */
  public buildSalutation(businessName: string, contactName?: string): string {
    const rawContact = (contactName || '').trim();
    const cleanBiz = this.cleanBusinessName(businessName);
    const bizWithoutThe = cleanBiz.replace(/^the\s+/i, '').trim();

    if (
      rawContact &&
      rawContact.toLowerCase() !== businessName.toLowerCase() &&
      !rawContact.toLowerCase().includes('http') &&
      !rawContact.toLowerCase().includes('@')
    ) {
      return rawContact.split(' ')[0];
    }

    if (bizWithoutThe && bizWithoutThe.toLowerCase() !== 'your team') {
      return `${bizWithoutThe} team`;
    }

    return 'there';
  }

  /**
   * Anti-fingerprint random picker
   */
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Signature block strictly using Cloud Consultancy & sales@cloudconsultancy.in
   */
  private buildSignoff(): string {
    return `Best regards,\n${this.agencyName}\n${this.senderEmail}`;
  }

  private compose(bodyLines: string[]): string {
    return `${bodyLines.join('\n')}\n\n${this.buildSignoff()}`;
  }

  /**
   * Generates genuine, human-written copy free of hype, AI clichés, and automated disclaimers
   */
  public getEmailCopy(lead: LeadContext, stage: Stage): HumanCopyResult {
    const business = this.cleanBusinessName(lead.businessName || 'your business');
    const salutation = this.buildSalutation(lead.businessName, lead.primaryContactName);
    const categoryPhrase = lead.category ? `${lead.category.toLowerCase()} businesses` : 'local businesses';
    const cityPhrase = lead.city ? ` in ${lead.city}` : '';

    const rawWeb = (lead.website || '').trim();
    const isMapsUrl = /google\.com\/maps|maps\.google\.com/i.test(rawWeb);
    const hasWebsite = Boolean(rawWeb && !isMapsUrl && rawWeb.toLowerCase() !== 'n/a' && rawWeb.toLowerCase() !== 'none');

    // CASE A: NO PDF / NO ACTIVE WEBSITE -> HUMAN BUSINESS SUMMARY + PITCH SEO & WEBSITE DEVELOPMENT
    if (!hasWebsite || !lead.auditPdfPath && !lead.auditPdfName) {
      const cleanCategory = lead.category || 'local services';
      const cityText = lead.city ? ` in ${lead.city}` : '';

      if (stage === 'initial') {
        return {
          subject: this.pick([
            `Quick note regarding ${business}`,
            `${business} – Google search & website inquiry`,
            `Question about ${business}${cityText}`,
          ]),
          body: this.compose([
            `Hi ${salutation},`,
            ``,
            `I was researching ${categoryPhrase}${cityPhrase} on Google earlier today and came across ${business}.`,
            ``,
            `You have built a solid local reputation serving customers${cityText}, but I noticed that ${business} currently doesn't have an active, modern website or dedicated landing page linked to your Google Business Profile.`,
            ``,
            `When people search for ${cleanCategory} on their phones, over 70% look for immediate service details, pricing, and a direct inquiry form. Without a dedicated website, many of those potential customers end up calling nearby competitors who do.`,
            ``,
            `At Cloud Consultancy, we specialize in helping businesses like yours establish a strong digital presence:`,
            `• Custom Website Development: Fast-loading, mobile-first design tailored for ${cleanCategory} with direct call and WhatsApp inquiry buttons.`,
            `• Search Engine Optimization (SEO): Local Google search and Maps ranking to ensure ${business} appears at the top when local clients search for your services.`,
            `• Lead Conversion Automations: Streamlined inquiry forms so new leads reach you instantly.`,
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
            `Did you have a chance to see my note about setting up a high-converting website and local Google SEO campaign for your business?`,
            ``,
            `We have seen businesses in ${cleanCategory} increase their inbound inquiries substantially just by having a fast mobile site and high Google Maps ranking.`,
            ``,
            `Happy to share a couple of initial layout ideas if you'd find that helpful.`,
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

    // CASE B: LEAD HAS ATTACHED PDF -> HUMAN-WRITTEN SUMMARY OF AUDIT REPORT
    const domain = rawWeb.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    const pdfName = lead.auditPdfName || `${domain.replace(/[^a-z0-9]/gi, '_')}_Technical_Audit.pdf`;
    const scoreVal = lead.auditScore ? Number(lead.auditScore) : undefined;
    const scoreSummary = scoreVal ? `Score: ${scoreVal}/100` : 'below Google Core Web Vitals benchmark';
    const keyTakeaways =
      lead.auditKeyTakeaways ||
      (lead.auditIssues && lead.auditIssues.length > 0
        ? lead.auditIssues.slice(0, 2).join(' and ')
        : 'mobile load performance bottlenecks, render-blocking scripts, and missing structured schema');

    if (stage === 'initial') {
      const subjects = [
        `Quick technical diagnostic on ${domain} (notes attached)`,
        `Reviewing ${domain} – brief technical audit summary`,
        `Diagnostic observations regarding ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `I was reviewing ${domain} earlier today and ran a diagnostic on your mobile speed and Google search positioning. I put together a 1-page Technical Audit Report and attached it here (${pdfName}) for your web team.`,
          ``,
          `Here is a quick human summary of what came up in the attached PDF:`,
          `• Overall Performance: ${scoreSummary}`,
          `• Primary Bottlenecks: ${keyTakeaways}`,
          `• Search & Conversion Impact: When mobile visitors experience loading delays, bounce rates spike significantly, and Google actively prioritizes faster-loading competitors in local search results.`,
          ``,
          `The attached document outlines the exact line-item findings and the step-by-step recommendations we usually implement to resolve them.`,
          ``,
          `Happy to answer any questions or share how we usually resolve these if useful for your team.`,
        ]),
        stage: 'initial',
        stageLabel: '1st Email (PDF Summary & Report Enclosed)',
        delayFromStartDays: 0,
      };
    }

    // 2. Follow-up 1 (Day 3)
    if (stage === 'followup_1') {
      const subjects = [
        `Following up: ${domain} technical audit summary`,
        `Following up regarding ${business} (${domain})`,
        `Quick check-in: ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `Following up briefly on the technical audit notes I sent over regarding ${domain}.`,
          ``,
          `Did your web team have a chance to look over the summary in the attached PDF (${pdfName})? Happy to answer any questions or walk through the specific fixes if useful.`,
        ]),
        stage: 'followup_1',
        stageLabel: '2nd Email (Day 3 Follow-up)',
        delayFromStartDays: 3,
      };
    }

    // 3. Follow-up 2 (Day 6)
    if (stage === 'followup_2') {
      const subjects = [
        `Observation regarding ${business} web speed`,
        `Quick note: ${domain} SEO & speed fixes`,
        `${business} website performance`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `Checking in once more regarding ${business}'s website performance and Google ranking.`,
          ``,
          `If resolving the mobile speed issues and technical SEO items highlighted in the audit PDF is on your radar this month, let me know and I can share a straightforward implementation plan. If the timing isn't right, no worries at all.`,
        ]),
        stage: 'followup_2',
        stageLabel: '3rd Email (Day 6 Follow-up)',
        delayFromStartDays: 6,
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
        `Hi ${salutation},`,
        ``,
        `I assume you're busy at the moment, so I won't follow up further. If you ever need a hand with ${business}'s web performance, Google ranking, or technical fixes down the road, feel free to reach out anytime.`,
        ``,
        `Wishing you and the ${business} team continued success.`,
      ]),
      stage: 'followup_3',
      stageLabel: '4th Email (Day 10 Final Message)',
      delayFromStartDays: 10,
    };
  }
}

export const humanCopywriterService = new HumanCopywriterService();