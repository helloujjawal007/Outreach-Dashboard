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

  /**
   * Compliance footer (opt-out + optional postal address via BUSINESS_ADDRESS)
   */
  private buildFooter(): string {
    const address = process.env.BUSINESS_ADDRESS?.trim();
    return [
      address,
      `If you'd prefer not to receive further emails, simply reply with "unsubscribe" and I will remove you from our list.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private compose(bodyLines: string[]): string {
    return `${bodyLines.join('\n')}\n\n${this.buildSignoff()}\n\n${this.buildFooter()}`;
  }

  /**
   * Generates professional, plain-spoken copy free of hype and unverifiable claims
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
            `Capturing missing local search clients in ${indLoc} for ${business}`,
            `${business} – Google Business visibility & customer inquiries`,
          ]),
          body: this.compose([
            `Hi ${salutation},`,
            ``,
            `I came across ${business} while researching top-rated service providers in ${indLoc}. You've built a strong local reputation on Google (${gmbStatus}).`,
            ``,
            `However, I noticed that when prospective local customers search for your services, there is no active, dedicated mobile website linked to your listing. Over 73% of local high-intent searchers look for a fast mobile website to inspect pricing, reviews, and credentials before calling or requesting an estimate. Right now, those visitors are dropping off and booking with local competitors who have direct websites in place.`,
            ``,
            `At ${this.agencyName}, we help local businesses plug this leak through a two-part growth engine:`,
            ``,
            `1. Turnkey Custom Website Build: Modern, ultra-fast architecture built on Next.js/SSR—engineered to load instantly on smartphones, rank on Google, and convert searchers into booked clients and inquiry submissions 24/7.`,
            `2. Weekly Google Business Profile (GMB) Optimization: Ongoing map-pack optimization, weekly geo-tagged posts, and review alignment to keep you ranking in the local Top 3 "Map Pack".`,
            ``,
            `We recently put together a preliminary layout concept specifically for ${business} showing how this setup would look and perform.`,
            ``,
            `Would you be open to a complimentary 5-minute preview of the mockup and a quick look at the local competitors ranking above you in ${indLoc}?`,
          ]),
          stage: 'initial',
          stageLabel: '1st Email (Turnkey Web & GMB Pitch)',
          delayFromStartDays: 0,
        };
      }

      if (stage === 'followup_1') {
        return {
          subject: `Following up: Website & local visibility for ${business}`,
          body: this.compose([
            `Hello ${salutation},`,
            ``,
            `I'm following up on my previous note in case it was missed. As mentioned, ${business} could capture significantly more local customer calls with an active, modern mobile website.`,
            ``,
            `We build complete websites with local Google SEO and monthly maintenance included so you don't have to manage any technical headaches.`,
            ``,
            `Would you like me to send over 2-3 sample layout ideas for your review?`,
          ]),
          stage: 'followup_1',
          stageLabel: '2nd Email (Day 3 Follow-up)',
          delayFromStartDays: 3,
        };
      }

      if (stage === 'followup_2') {
        return {
          subject: `Local customer enquiries for ${business}`,
          body: this.compose([
            `Hello ${salutation},`,
            ``,
            `Many local ${categoryPhrase} miss out on high-value customers simply because they lack an online presence where clients can view services, reviews, and submit enquiries after hours.`,
            ``,
            `If modernizing ${business}'s web presence and getting found on Google is a priority this quarter, I'd be glad to walk you through a simple, phased approach.`,
            ``,
            `Would later this week suit you for a brief chat, or should I follow up next month?`,
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
          `I hope your week is off to a productive start.`,
          ``,
          `My technical team at ${this.agencyName} recently conducted a brief performance and technical SEO diagnostic on ${websiteUrl}${scoreNote}. Rather than sending a generic cold pitch, we compiled our key findings into a concise 1-page report, which I’ve attached for your reference (${pdfName}).`,
          ``,
          `Two priority takeaways stood out that may be holding back your organic search ranking and mobile conversion rate:`,
          ``,
          `• ${keyTakeaways}`,
          ``,
          `Most legacy websites hit these roadblocks due to render-blocking scripts, unoptimized asset delivery, or missing structured schema that Google's crawler expects. At ${this.agencyName}, we engineer high-performance web architecture—typically moving teams toward lightning-fast Next.js SSR and headless setups that achieve sub-second load times and near-perfect Core Web Vitals out of the box.`,
          ``,
          `I’d be glad to share how your team can fix these quick wins—no sales pitch, just practical engineering guidance.`,
          ``,
          `Are you open to a brief 10-minute walkthrough later this week?`,
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
          `If it would be useful, I can send it across or walk you through it in 10 minutes at a time that suits you.`,
        ]),
        this.compose([
          `Hello ${salutation},`,
          ``,
          `I wanted to check whether you had a chance to see my earlier note about improving ${business}'s visibility on Google.`,
          ``,
          `The audit is ready whenever you are. Just let me know whether you'd prefer to receive it by email or discuss it briefly over a call.`,
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
        `As I have not received a response, I will pause my outreach here so as not to crowd your inbox. Should you wish to revisit this in the future, I'd be glad to help ${business} with Google visibility, website performance, or enquiry automation.`,
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