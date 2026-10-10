export interface LeadContext {
  id: string;
  businessName: string;
  category?: string;
  primaryContactName?: string;
  city?: string;
  country?: string;
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
   * Signature block. Optional env vars: SENDER_NAME, SENDER_PHONE, SENDER_WEBSITE
   */
  private buildSignoff(): string {
    const name = process.env.SENDER_NAME?.trim();
    const contact = [process.env.SENDER_PHONE?.trim(), process.env.SENDER_WEBSITE?.trim()]
      .filter(Boolean)
      .join(' | ');
    return ['Kind regards,', name, this.agencyName, contact].filter(Boolean).join('\n');
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

    // 1. Initial outreach (Day 0)
    if (stage === 'initial') {
      const subject = this.pick([
        `Improving ${business}'s visibility on Google`,
        `Local search visibility for ${business}`,
        `A short audit for ${business}`,
      ]);

      const bodies = [
        this.compose([
          `Hello ${salutation},`,
          ``,
          `I'm reaching out from ${this.agencyName}. We help ${categoryPhrase} attract more local customers through:`,
          ``,
          `• Google Business Profile optimization, to improve visibility on Google Maps`,
          `• Website development and SEO, focused on turning visitors into enquiries`,
          `• Automated enquiry follow-up, so new leads receive a prompt response`,
          ``,
          `I reviewed ${business}'s online presence and noticed a few opportunities worth discussing. I'd be glad to share a short audit, free of charge and with no obligation.`,
          ``,
          `Would you be open to a brief 10-minute call this week, or would you prefer I send the audit by email?`,
        ]),
        this.compose([
          `Hello ${salutation},`,
          ``,
          `I'm with ${this.agencyName}, where we work with ${categoryPhrase} on local search visibility, website performance, and enquiry handling.`,
          ``,
          `After looking at ${business}'s online presence, I identified a few practical improvements that could help bring in more enquiries from Google. I've put them into a brief audit that I would be happy to share with you at no cost.`,
          ``,
          `Would a short call this week suit you, or shall I simply email it across?`,
        ]),
      ];

      return {
        subject,
        body: this.pick(bodies),
        stage: 'initial',
        stageLabel: '1st Email (Introduction)',
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