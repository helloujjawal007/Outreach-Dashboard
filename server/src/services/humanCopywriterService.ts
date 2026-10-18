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
  private readonly agencyName = 'Online Digital Solution';
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
   * Builds a natural salutation (never "Hello The Fitness World team")
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
   * Signature block. Always strictly "Online Digital Solution"
   */
  private buildSignoff(): string {
    return `Best regards,\n${this.agencyName}`;
  }

  private compose(bodyLines: string[]): string {
    return `${bodyLines.join('\n')}\n\n${this.buildSignoff()}`;
  }

  /**
   * Generates professional, plain-spoken copy free of hype, AI clichés, and automated disclaimers
   */
  public getEmailCopy(lead: LeadContext, stage: Stage): HumanCopyResult {
    const business = this.cleanBusinessName(lead.businessName || 'your business');
    const salutation = this.buildSalutation(lead.businessName, lead.primaryContactName);
    const categoryPhrase = lead.category ? `${lead.category.toLowerCase()} businesses` : 'local businesses';
    const cityPhrase = lead.city ? ` in ${lead.city}` : '';

    const rawWeb = (lead.website || '').trim();
    const isMapsUrl = /google\.com\/maps|maps\.google\.com/i.test(rawWeb);
    const hasWebsite = Boolean(rawWeb && !isMapsUrl && rawWeb.toLowerCase() !== 'n/a' && rawWeb.toLowerCase() !== 'none');

    // CASE A: LEAD HAS NO ACTIVE WEBSITE -> PITCH WEBSITE DEVELOPMENT + GMB + MAINTENANCE
    if (!hasWebsite) {
      if (stage === 'initial') {
        const indLoc = lead.industryLocation || (lead.category && lead.city ? `${lead.category} in ${lead.city}` : lead.category || lead.city || 'your area');
        const gmbStatus = lead.gmbNotes || 'with strong customer feedback';

        return {
          subject: this.pick([
            `Quick note regarding ${business}`,
            `${business} – Google Business visibility & inquiries`,
            `Question regarding ${business}`,
          ]),
          body: this.compose([
            `Hi ${salutation},`,
            ``,
            `I came across ${business} while looking up top-rated service providers in ${indLoc}. You have built a strong local reputation on Google (${gmbStatus}).`,
            ``,
            `I noticed that when potential customers search for your services on mobile, there is no direct website linked to your listing where they can view your services, credentials, or submit an inquiry. Many local customers browsing on their phones end up contacting competitors who have an active mobile site in place.`,
            ``,
            `We build clean, fast-loading mobile websites and handle ongoing Google Maps optimization so you stay in the local top results without technical headaches.`,
            ``,
            `I put together a preliminary layout concept specifically for ${business} showing how this would look and work.`,
            ``,
            `Would you like me to send over a quick 2-minute preview?`,
          ]),
          stage: 'initial',
          stageLabel: '1st Email (Turnkey Web & GMB Pitch)',
          delayFromStartDays: 0,
        };
      }

      if (stage === 'followup_1') {
        return {
          subject: `Following up: ${business}`,
          body: this.compose([
            `Hello ${salutation},`,
            ``,
            `I'm following up on my previous note in case it was missed. As mentioned, ${business} could capture more direct customer calls with an active, fast mobile website.`,
            ``,
            `We take care of the entire setup including local Google SEO and maintenance so you don't have to manage anything technical.`,
            ``,
            `Would you like me to send over a couple of sample layout ideas to review?`,
          ]),
          stage: 'followup_1',
          stageLabel: '2nd Email (Day 3 Follow-up)',
          delayFromStartDays: 3,
        };
      }

      if (stage === 'followup_2') {
        return {
          subject: `Customer inquiries for ${business}`,
          body: this.compose([
            `Hello ${salutation},`,
            ``,
            `Many local ${categoryPhrase} miss out on high-intent clients simply because they don't have an easy mobile page where clients can view services and reach out after hours.`,
            ``,
            `If modernizing ${business}'s online presence is something you're considering this quarter, I'd be glad to share a straightforward approach.`,
            ``,
            `Would later this week suit you for a brief chat, or should I check back next month?`,
          ]),
          stage: 'followup_2',
          stageLabel: '3rd Email (Day 6 Follow-up)',
          delayFromStartDays: 6,
        };
      }

      return {
        subject: `Closing the loop: ${business}`,
        body: this.compose([
          `Hello ${salutation},`,
          ``,
          `I haven't heard back, so I will pause my outreach here so as not to crowd your inbox. If you ever decide to launch a modern website, rank higher on Google Maps, or automate inquiry handling for ${business}, feel free to reach out anytime.`,
          ``,
          `Wishing you and your team continued success.`,
        ]),
        stage: 'followup_3',
        stageLabel: '4th Email (Day 10 Final Note)',
        delayFromStartDays: 10,
      };
    }

    // CASE B: LEAD HAS A WEBSITE -> PITCH AUDIT & TECHNICAL FIXES
    if (stage === 'initial') {
      const websiteUrl = rawWeb;
      const domain = rawWeb.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
      const pdfName = lead.auditPdfName || 'Technical_Audit_Report.pdf';
      const keyTakeaways =
        lead.auditKeyTakeaways ||
        (lead.auditIssues && lead.auditIssues.length > 0
          ? lead.auditIssues.slice(0, 2).join('; ')
          : 'Core Web Vitals bottlenecks and missing structured schema');
      const scoreNote =
        typeof lead.auditScore === 'number' && lead.auditScore > 0
          ? ` (Site Health: ${lead.auditScore}%)`
          : '';

      const subjects =
        typeof lead.auditScore === 'number' && lead.auditScore > 0
          ? [
              `Quick technical diagnostic on ${domain} (Score: ${lead.auditScore}/100, PDF attached)`,
              `${business} speed & Google ranking audit (Health: ${lead.auditScore}%, PDF enclosed)`,
              `Quick technical diagnostic on ${domain} (1-2 findings attached)`,
            ]
          : [
              `Quick technical diagnostic on ${domain} (1-2 findings attached)`,
              `${business} speed & Google ranking audit (PDF enclosed)`,
            ];

      return {
        subject: this.pick(subjects),
        body: this.compose([
          `Hi ${salutation},`,
          ``,
          `I took a quick look at ${websiteUrl} earlier today while reviewing ${categoryPhrase} in your area.`,
          ``,
          `A couple of technical points stood out that may be holding back your organic Google ranking and mobile page speed:`,
          ``,
          `• ${keyTakeaways}`,
          ``,
          `We put together a concise 1-page diagnostic summary and attached it here (${pdfName}) in case it's helpful for your team to review.`,
          ``,
          `Would you be open to a quick 5-minute chat sometime this week? Happy to share how to resolve these without any sales pitch.`,
        ]),
        stage: 'initial',
        stageLabel: '1st Email (Technical Audit & Next.js Pitch)',
        delayFromStartDays: 0,
      };
    }

    // 2. Follow-up 1 (Day 3)
    if (stage === 'followup_1') {
      const subject = this.pick([
        `Following up: ${business} local visibility audit`,
        `Following up regarding ${business}`,
        `Checking in: ${business}`,
      ]);

      const bodies = [
        this.compose([
          `Hello ${salutation},`,
          ``,
          `I'm following up on my previous email in case it was missed. I have a short audit prepared for ${business} covering your Google Maps presence, website performance, and how quickly enquiries are being handled.`,
          ``,
          `If it would be useful, I can send it across or walk you through it in 5 minutes at a time that suits you.`,
        ]),
        this.compose([
          `Hello ${salutation},`,
          ``,
          `I wanted to check whether you had a chance to see my earlier note about improving ${business}'s visibility on Google.`,
          ``,
          `The audit is ready whenever you are. Just let me know whether you'd prefer to receive it by email or discuss it briefly over a quick call.`,
        ]),
      ];

      return {
        subject,
        body: this.pick(bodies),
        stage: 'followup_1',
        stageLabel: '2nd Email (Day 3 Follow-up)',
        delayFromStartDays: 3,
      };
    }

    // 3. Follow-up 2 (Day 6)
    if (stage === 'followup_2') {
      const subject = this.pick([
        `A quick observation about ${business}`,
        `${business}: a brief note`,
        `Customer enquiries at ${business}`,
      ]);

      const bodies = [
        this.compose([
          `Hello ${salutation},`,
          ``,
          `Many ${categoryPhrase} lose potential customers for two common reasons: their Google listing does not appear among the top local results, or website enquiries wait several hours for a reply. Both are fixable with a straightforward setup.`,
          ``,
          `I'd be happy to show you where ${business} currently stands on these points. Would a short call later this week work, or should I check back next month?`,
        ]),
        this.compose([
          `Hello ${salutation},`,
          ``,
          `I'm writing once more to see whether strengthening ${business}'s local search presence and enquiry response time is something you are considering at the moment.`,
          ``,
          `If so, I can send over the short audit I mentioned. If the timing is not right, just let me know and I will follow up at a later date.`,
        ]),
      ];

      return {
        subject,
        body: this.pick(bodies),
        stage: 'followup_2',
        stageLabel: '3rd Email (Day 6 Follow-up)',
        delayFromStartDays: 6,
      };
    }

    // 4. Follow-up 3 (Day 10, final message)
    const subject = this.pick([
      `Closing the loop: ${business}`,
      `Final follow-up regarding ${business}`,
      `Last note: ${business}`,
    ]);

    const bodies = [
      this.compose([
        `Hello ${salutation},`,
        ``,
        `I haven't heard back, so I'll assume the timing isn't right and will not send further emails. If improving your local search visibility, website, or enquiry handling becomes a priority, you are welcome to reach out at any time.`,
        ``,
        `Wishing you and the ${business} team continued success.`,
      ]),
      this.compose([
        `Hello ${salutation},`,
        ``,
        `As I have not received a response, I will pause my outreach here so as not to crowd your inbox. Should you wish to revisit this in the future, I'd be glad to help ${business} with Google visibility, website performance, or enquiry handling.`,
        ``,
        `All the best to you and your team.`,
      ]),
    ];

    return {
      subject,
      body: this.pick(bodies),
      stage: 'followup_3',
      stageLabel: '4th Email (Day 10 Final Message)',
      delayFromStartDays: 10,
    };
  }
}

export const humanCopywriterService = new HumanCopywriterService();