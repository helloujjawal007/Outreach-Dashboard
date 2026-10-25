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
  public readonly senderEmail = 'info@cloudconsultancy.in';
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
   * Signature block strictly using Cloud Consultancy & info@cloudconsultancy.in
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

    // CASE A: LEAD HAS NO ACTIVE WEBSITE -> PITCH WEBSITE DEVELOPMENT & LOCAL GOOGLE SEARCH
    if (!hasWebsite) {
      if (stage === 'initial') {
        return {
          subject: this.pick([
            `Quick note regarding ${business}`,
            `${business} – Google Business listing`,
            `Question about ${business}`,
          ]),
          body: this.compose([
            `Hi ${salutation},`,
            ``,
            `I was looking up ${categoryPhrase}${cityPhrase} on Google earlier today and noticed that ${business} doesn't have an active website linked to your listing.`,
            ``,
            `Most people searching on their phones want to see services, reviews, or request an inquiry directly. When there's no website, many end up calling competitors who do.`,
            ``,
            `We help businesses build clean, fast-loading mobile sites and handle Google search optimization so you don't have to deal with anything technical.`,
            ``,
            `I put together a quick mockup concept for ${business} showing what this would look like. Would you like me to send it over?`,
          ]),
          stage: 'initial',
          stageLabel: '1st Email (Website & Search Intro)',
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
            `Did you have a chance to see my note about getting a clean, dedicated mobile website in place for your Google listing?`,
            ``,
            `Happy to share a couple of layout ideas if you'd find that helpful.`,
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
            `If setting up a modern website or improving your local Google ranking is on your roadmap this quarter, I'd be glad to share a straightforward approach.`,
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
          `I assume you're busy at the moment, so I won't follow up further. If you ever want to launch a modern site or improve your Google search presence for ${business} in the future, feel free to reach out anytime.`,
          ``,
          `Wishing you and your team all the best.`,
        ]),
        stage: 'followup_3',
        stageLabel: '4th Email (Day 10 Final Note)',
        delayFromStartDays: 10,
      };
    }

    // CASE B: LEAD HAS A WEBSITE -> HUMAN-WRITTEN TECHNICAL AUDIT NOTES
    const domain = rawWeb.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    const pdfName = lead.auditPdfName || `${domain.replace(/[^a-z0-9]/gi, '_')}_Technical_Audit.pdf`;
    const keyTakeaways =
      lead.auditKeyTakeaways ||
      (lead.auditIssues && lead.auditIssues.length > 0
        ? lead.auditIssues.slice(0, 2).join(' and ')
        : 'mobile load performance bottlenecks and missing structured data');

    if (stage === 'initial') {
      const subjects = [
        `Quick technical diagnostic on ${domain} (notes attached)`,
        `Reviewing ${domain} – brief technical notes`,
        `Quick observation regarding ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `I was reviewing ${domain} earlier today and noticed a couple of technical items affecting your mobile speed and Google search positioning:`,
          ``,
          `• ${keyTakeaways}`,
          ``,
          `I put together a quick 1-page notes sheet with the exact findings and attached it here (${pdfName}) in case it's helpful for your web team.`,
          ``,
          `Happy to answer any questions or share how we usually resolve these if useful.`,
        ]),
        stage: 'initial',
        stageLabel: '1st Email (Diagnostic Notes & PDF Enclosed)',
        delayFromStartDays: 0,
      };
    }

    // 2. Follow-up 1 (Day 3)
    if (stage === 'followup_1') {
      const subjects = [
        `Following up: ${domain} technical notes`,
        `Following up regarding ${business}`,
        `Quick check-in: ${domain}`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `Following up briefly on my note regarding ${domain}.`,
          ``,
          `Did your team have a chance to look over the technical audit notes I attached? Happy to answer any questions if you'd like to run through them.`,
        ]),
        stage: 'followup_1',
        stageLabel: '2nd Email (Day 3 Follow-up)',
        delayFromStartDays: 3,
      };
    }

    // 3. Follow-up 2 (Day 6)
    if (stage === 'followup_2') {
      const subjects = [
        `Observation regarding ${business}`,
        `Quick note: ${domain}`,
        `${business} website performance`,
      ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `Checking in once more regarding ${business}'s website and Google search visibility.`,
          ``,
          `If resolving these technical fixes is on your radar this month, let me know and I can share a straightforward fix plan. If the timing isn't right, no worries at all.`,
        ]),
        stage: 'followup_2',
        stageLabel: '3rd Email (Day 6 Follow-up)',
        delayFromStartDays: 6,
      };
    }

    // 4. Follow-up 3 (Day 10, final message)
    const subjects = [
      `Closing the loop: ${business}`,
      `Last note regarding ${business}`,
      `Final check-in: ${domain}`,
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