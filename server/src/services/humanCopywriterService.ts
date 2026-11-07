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
   * Signature block strictly using Cloud Consultancy & cloudconsultancy.ad@gmail.com
   */
  private buildSignoff(): string {
    return `Best regards,\n${this.agencyName}\n${this.senderEmail}`;
  }

  private compose(bodyLines: string[]): string {
    return `${bodyLines.join('\n')}\n\n${this.buildSignoff()}`;
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
          `I was reviewing ${domain} earlier today and ran a technical diagnostic on your mobile speed, Core Web Vitals, and local Google search positioning. I put together a 1-page Technical Audit Report and attached it here (${pdfName}) for your web team.`,
          ``,
          findingsIntro,
          findingsBullets,
          ``,
          `When mobile visitors experience loading delays or missing metadata, bounce rates climb quickly and Google actively prioritizes faster nearby competitors in search rankings.`,
          ``,
          `The attached document outlines the exact line-item findings and the step-by-step recommendations we usually implement to resolve them.`,
          ``,
          `Happy to answer any questions or share how we usually resolve these if useful for your team.`,
        ]),
        stage: 'initial',
        stageLabel: '1st Email (Audit Findings & PDF Enclosed)',
        delayFromStartDays: 0,
      };
    }

    // 2. Follow-up 1 (Day 2.5)
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
          fu1FindingsIntro,
          rawFindings.slice(0, 3).map((f) => (f.startsWith('•') ? f : `• ${f}`)).join('\n'),
          ``,
          `I've re-attached the audit summary (${pdfName}) for quick reference. Did your web team have a chance to look over these points?`,
          ``,
          `Happy to answer any questions or walk through the specific fixes if useful.`,
        ]),
        stage: 'followup_1',
        stageLabel: '2nd Email (Day 2.5 Follow-up with Findings & PDF)',
        delayFromStartDays: 2.5,
      };
    }

    // 3. Follow-up 2 (Day 5.5)
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
          `If resolving the technical items highlighted in the audit (mobile speed, meta descriptions, and core vitals) is on your radar this quarter, let me know and I can share a straightforward implementation plan. If the timing isn't right, no worries at all.`,
        ]),
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
