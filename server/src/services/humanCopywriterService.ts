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

export class HumanCopywriterService {
  /**
   * Cleans corporate identifiers for natural conversational reading
   */
  public cleanBusinessName(name: string): string {
    if (!name) return 'your team';
    return (
      name
        .replace(/\b(llc|inc|corp|ltd|pvt|co|company|services|solutions|group|holdings)\b/gi, '')
        .replace(/[,.-]+$/, '')
        .trim() || name.trim()
    );
  }

  /**
   * Builds an authentic, natural human salutation (never "Hi The Fitness World team")
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
   * Generates genuine, human-written copy strictly devoid of AI cliches
   */
  public getEmailCopy(
    lead: LeadContext,
    stage: 'initial' | 'followup_1' | 'followup_2' | 'followup_3'
  ): HumanCopyResult {
    const business = this.cleanBusinessName(lead.businessName || 'your business');
    const salutation = this.buildSalutation(lead.businessName, lead.primaryContactName);
    const category = lead.category || 'local businesses';
    const signoff = 'Best regards,\nOnline Digital Solution';

    // 1. First Shoot / Initial Outreach (Day 0)
    if (stage === 'initial') {
      const subject = this.pick([
        `Quick question re: ${business}`,
        `Question regarding ${business}`,
        `Google Maps & web inquiries for ${business}`,
        `Idea for ${business}`,
      ]);

      const bodies = [
        `Hey ${salutation},\n\nCame across ${business} online and wanted to reach out directly.\n\nWe run Online Digital Solution. We specialize in helping businesses in ${category} grow their local customer base through:\n\n• Google My Business (GMB) optimization to get ${business} into the top 3 on Google Maps where 70% of calls happen\n• Ultra-fast, modern website redesigns built to convert visitors into direct bookings\n• Automated customer follow-up systems so new inquiries get answered in seconds instead of hours\n\nAre you guys currently looking to bring in more clients this month, or is your schedule completely full?\n\nHappy to send over a quick 2-minute video breakdown of how you compare to local competitors on Google. Mind if I share that over?\n\n${signoff}`,
        `Hi ${salutation},\n\nChecked out what you guys are doing at ${business}—great work in ${category}.\n\nAt Online Digital Solution, we help companies scale their inbound inquiries with:\n\n• Top-3 Google Maps ranking & local review acceleration\n• High-performance modern website development and SEO\n• Business workflow automations to instantly handle new leads and book calls on autopilot\n\nWould you be open to a quick 5-minute chat this week to see how this could work for ${business}?\n\n${signoff}`,
      ];

      return {
        subject,
        body: this.pick(bodies),
        stage: 'initial',
        stageLabel: '1st Shoot (Intro)',
        delayFromStartDays: 0,
      };
    }

    // 2. Second Shoot / Follow-up 1 (Day 2.5 — Strictly >= 2 days delay)
    if (stage === 'followup_1') {
      const subject = this.pick([
        `Re: Quick question re: ${business}`,
        `Following up re: ${business}`,
        `Checking in: ${business}`,
      ]);

      const bodies = [
        `Hey ${salutation},\n\nQuick follow-up on my note from earlier this week. I know you're busy running day-to-day operations at ${business}!\n\nJust wanted to see if scaling your client flow with Google Maps top 3 ranking, a modern website revamp, or inquiry automations is on your radar this month?\n\nWe recently helped another team in ${category} jump to the top of Google Maps and automate their inquiry replies so no leads slip through.\n\nLet me know if you'd be open to a quick 5-minute chat this week—no pressure either way.\n\n${signoff}`,
        `Hi ${salutation},\n\nFollowing up quickly in case my last email got buried. Did you get a chance to see my note about getting ${business} into the top 3 on Google Maps and modernizing your web presence?\n\nHappy to share a quick 60-second example whenever suits your schedule.\n\n${signoff}`,
      ];

      return {
        subject,
        body: this.pick(bodies),
        stage: 'followup_1',
        stageLabel: '2nd Shoot (Day 2.5 Follow-up)',
        delayFromStartDays: 2.5,
      };
    }

    // 3. Third Shoot / Follow-up 2 (Day 5.5)
    if (stage === 'followup_2') {
      const subject = this.pick([
        `${business} - quick check-in`,
        `Quick check-in re: ${business}`,
        `Customer inquiries at ${business}`,
      ]);

      const bodies = [
        `Hi ${salutation},\n\nTouching base briefly regarding ${business}.\n\nA lot of the businesses we speak with were losing ready-to-buy customers simply because their Google listing wasn't visible in the top 3 Maps results, or because website leads took hours to get a response. We put that entire system on autopilot.\n\nDo you have 5 minutes later this week to see if we can do the same for ${business}, or should I circle back next month?\n\n${signoff}`,
        `Hey ${salutation},\n\nChecking back in to see if optimizing your local Google ranking and modern website conversions for ${business} is something you're focusing on right now.\n\nIf you'd like to see the quick 2-minute competitive breakdown I mentioned earlier, just let me know and I'll send the link right over.\n\n${signoff}`,
      ];

      return {
        subject,
        body: this.pick(bodies),
        stage: 'followup_2',
        stageLabel: '3rd Shoot (Day 5.5 Follow-up)',
        delayFromStartDays: 5.5,
      };
    }

    // 4. Fourth Shoot / Follow-up 3 (Day 10 — Last Message / Polite Permission Close)
    const subject = this.pick([
      `Permission to close file re: ${business}?`,
      `Last follow-up re: ${business}`,
      `Closing out: ${business}`,
    ]);

    const bodies = [
      `Hi ${salutation},\n\nI haven't heard back, so I'll make this my last message—I definitely don't want to clutter your inbox.\n\nI'll assume the timing isn't right for ${business} right now. If optimizing your local Google ranking, launching a modern website, or automating your lead follow-ups ever becomes a priority down the road, feel free to reach back out anytime.\n\nWishing you and the entire ${business} team continued success!\n\n${signoff}`,
      `Hey ${salutation},\n\nSince I haven't heard back, I'll pause outreach here so I don't crowd your inbox. If you ever want to get ${business} ranked #1 on Google Maps or automate your inquiry workflows in the future, you know where to find us.\n\nAll the best with ${business}!\n\n${signoff}`,
    ];

    return {
      subject,
      body: this.pick(bodies),
      stage: 'followup_3',
      stageLabel: '4th Shoot (Day 10 Final Message)',
      delayFromStartDays: 10.0,
    };
  }
}

export const humanCopywriterService = new HumanCopywriterService();
