import { query } from '../config/db';
import { ollamaService } from './ollamaService';

export interface HumanizerOptions {
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'client_checkin';
  style?: 'conversational' | 'direct' | 'curious';
  customInstructions?: string;
}

export interface GeneratedHumanEmail {
  subject: string;
  body: string;
  stage: string;
  isAiGenerated: boolean;
  modelUsed: string;
}

export class HumanizerService {
  private readonly agencyName = 'Online Digital Solution';

  /**
   * Cleans corporate suffixes so the email reads naturally
   */
  public cleanBusinessName(name: string): string {
    if (!name) return 'your team';
    return (
      name
        .replace(/\b(llc|inc|corp|ltd|pvt|co|company|services|solutions|group)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[,.-]+$/, '')
        .trim() || name.trim()
    );
  }

  /**
   * Derives a natural salutation without awkward strings like "Hello The Fitness World team"
   */
  public buildSalutation(businessName: string, primaryContactName?: string): string {
    const contactName = (primaryContactName || '').trim();
    const cleanBiz = this.cleanBusinessName(businessName);
    const bizWithoutThe = cleanBiz.replace(/^the\s+/i, '').trim();

    if (
      contactName &&
      contactName.toLowerCase() !== businessName.toLowerCase() &&
      !contactName.toLowerCase().includes('http') &&
      !contactName.toLowerCase().includes('@')
    ) {
      return contactName.split(' ')[0];
    }

    if (bizWithoutThe && bizWithoutThe.toLowerCase() !== 'your team') {
      return `${bizWithoutThe} team`;
    }

    return 'there';
  }

  /**
   * Random item picker for anti-fingerprinting variation
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
   * Opt-out line (+ optional postal address via BUSINESS_ADDRESS), needed for CAN-SPAM
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
   * Generates a context-aware, professional email for a lead or client
   */
  async generateEmail(
    contact: {
      id: string;
      business_name: string;
      primary_contact_name?: string;
      category?: string;
      notes?: string;
      entity_type?: 'lead' | 'client';
    },
    options: HumanizerOptions = {}
  ): Promise<GeneratedHumanEmail> {
    const isClient = contact.entity_type === 'client';
    const business = this.cleanBusinessName(contact.business_name || 'your business');
    const salutation = this.buildSalutation(contact.business_name, contact.primary_contact_name);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      contact.id
    );

    // 1. Determine stage
    let resolvedStage = options.stage || 'auto';
    if (resolvedStage === 'auto') {
      if (isClient) {
        resolvedStage = 'client_checkin';
      } else if (isUuid) {
        try {
          const msgRes = await query<{ count: string }>(
            `SELECT COUNT(m.id)::int as count 
             FROM messages m 
             JOIN conversations c ON m.conversation_id = c.id 
             WHERE c.entity_type = 'lead' AND c.lead_id = $1 AND m.direction = 'outbound' AND m.channel = 'email'`,
            [contact.id]
          );
          const count = Number(msgRes.rows[0]?.count || 0);
          if (count === 0) resolvedStage = 'initial';
          else if (count === 1) resolvedStage = 'followup_1';
          else if (count === 2) resolvedStage = 'followup_2';
          else resolvedStage = 'followup_3';
        } catch {
          resolvedStage = 'initial';
        }
      } else {
        resolvedStage = 'initial';
      }
    }

    const style = options.style || 'conversational';

    // 2. Last message snippet for contextual callbacks
    let lastMsgSnippet = '';
    if (isUuid) {
      try {
        const lastMsgRes = await query<{ text: string; direction: string }>(
          `SELECT m.text, m.direction 
           FROM messages m 
           JOIN conversations c ON m.conversation_id = c.id 
           WHERE (c.lead_id = $1 OR c.client_id = $1) AND m.channel = 'email' 
           ORDER BY m.sent_at DESC LIMIT 1`,
          [contact.id]
        );
        if (lastMsgRes.rows.length > 0) {
          lastMsgSnippet = lastMsgRes.rows[0].text.slice(0, 140).replace(/\n+/g, ' ');
        }
      } catch {
        // ignore
      }
    }

    // 3. Try local Ollama if available
    const category = contact.category || 'General Business';
    const ollamaHealth = await ollamaService.checkHealth();
    if (ollamaHealth.online) {
      try {
        const stageContext =
          resolvedStage === 'initial'
            ? 'First outreach introducing the agency and offering a free, no-obligation audit'
            : resolvedStage === 'followup_1'
              ? 'First polite follow-up (about 3 days after the first email); remind them the audit is ready'
              : resolvedStage === 'followup_2'
                ? 'Second follow-up (about 6 days in); share one useful observation and offer a short call'
                : resolvedStage === 'followup_3'
                  ? 'Final follow-up (about 10 days in); courteously close the loop and say no more emails will follow'
                  : 'Check-in with an existing paying client about their marketing, website and automations';

        const prompt = `
Write a professional, concise outreach email for:
- Recipient: ${salutation} at ${business}
- Agency Name: ${this.agencyName}
- Services (mention only those relevant to the niche):
  • Google Business Profile optimization and local search visibility
  • Website development and redesign
  • SEO, including optimization for AI search tools
  • E-commerce development (Shopify, BigCommerce)
  • Business workflow automation and outbound lead systems
- Business Category / Niche: ${category}
- Context/Stage: ${stageContext}
- Style: ${style}
${lastMsgSnippet ? `- Previous message reference: "${lastMsgSnippet}"` : ''}
${options.customInstructions ? `- Extra instructions: ${options.customInstructions}` : ''}

Strict Rules:
1. Formal-friendly tone. Start with "Hello ${salutation},". Do NOT use "Hey", "guys", slang, exclamation marks, or emojis.
2. NEVER start with "I hope this email finds you well".
3. Do NOT invent statistics, percentages, rankings, client results or case studies.
4. Do NOT use "Re:" or "Fwd:" in the subject line.
5. Keep it under 130 words, with one clear call to action.
6. Sign-off MUST be exactly:
Kind regards,
${this.agencyName}
7. Output "Subject: ..." on the first line, then an empty line, then the body.
`.trim();

        const aiRes = await ollamaService.generateCompletion({
          prompt,
          system:
            'You are a senior business development writer for Online Digital Solution. You write clear, courteous, professional emails with a single call to action. You never invent facts, statistics or client results.',
          temperature: 0.6,
        });

        if (!aiRes.fallback && aiRes.response) {
          const lines = aiRes.response.split('\n');
          let subject = `Quick question regarding ${business}`;
          let body = aiRes.response;

          const subjectLine = lines.find((l) => /^\**\s*subject:/i.test(l.trim()));
          if (subjectLine) {
            subject = subjectLine
              .replace(/^\**\s*subject:\s*\**\s*/i, '')
              .replace(/^(re|fwd?):\s*/i, '')
              .trim();
            body = lines.filter((l) => l !== subjectLine).join('\n').trim();
          }

          if (!body.includes(this.agencyName)) {
            body += `\n\n${this.buildSignoff()}`;
          }
          if (!/unsubscribe/i.test(body)) {
            body += `\n\n${this.buildFooter()}`;
          }

          return {
            subject,
            body,
            stage: resolvedStage,
            isAiGenerated: true,
            modelUsed: aiRes.modelUsed,
          };
        }
      } catch (err) {
        console.warn('[HumanizerService] Ollama call failed, falling back to algorithmic humanizer:', err);
      }
    }

    // 4. Deterministic fallback
    return this.generateAlgorithmicHumanEmail({
      business,
      salutation,
      category,
      stage: resolvedStage,
      style,
      lastMsgSnippet,
    });
  }

  /**
   * Template engine used when Ollama is offline or fails
   */
  private generateAlgorithmicHumanEmail(params: {
    business: string;
    salutation: string;
    category?: string;
    stage: string;
    style: string;
    lastMsgSnippet?: string;
  }): GeneratedHumanEmail {
    const { business, salutation, category = '', stage, style } = params;
    const lowerCat = category.toLowerCase();
    const lowerBiz = business.toLowerCase();
    const categoryPhrase =
      category && category !== 'General Business' ? `${lowerCat} businesses` : 'local businesses';

    const isEcom =
      lowerCat.includes('ecommerce') ||
      lowerCat.includes('retail') ||
      lowerCat.includes('shop') ||
      lowerCat.includes('store') ||
      lowerCat.includes('apparel') ||
      lowerBiz.includes('store') ||
      lowerBiz.includes('shop');

    const isB2B =
      lowerCat.includes('software') ||
      lowerCat.includes('saas') ||
      lowerCat.includes('agency') ||
      lowerCat.includes('consult') ||
      lowerCat.includes('tech') ||
      lowerCat.includes('b2b') ||
      lowerCat.includes('finance') ||
      lowerCat.includes('logistics');

    const result = (subjects: string[], bodies: string[], label: string): GeneratedHumanEmail => ({
      subject: this.pick(subjects),
      body: this.pick(bodies),
      stage,
      isAiGenerated: false,
      modelUsed: `Humanizer Engine (${label})`,
    });

    // 1. Initial outreach
    if (stage === 'initial') {
      if (isEcom) {
        return result(
          [
            `Store performance and search visibility for ${business}`,
            `A short store audit for ${business}`,
            `Shopify / BigCommerce growth for ${business}`,
          ],
          [
            this.compose([
              `Hello ${salutation},`,
              ``,
              `I'm reaching out from ${this.agencyName}. We help e-commerce brands improve revenue through:`,
              ``,
              `• Shopify and BigCommerce development, including mobile speed optimization`,
              `• E-commerce SEO, including visibility in AI search tools such as ChatGPT and Perplexity`,
              `• Automated cart recovery and customer retention workflows`,
              ``,
              `I reviewed ${business} and noted a few opportunities around site speed and search visibility. I'd be glad to share a short audit, free of charge and with no obligation.`,
              ``,
              `Would you be open to a brief 10-minute call this week, or would you prefer I send it by email?`,
            ]),
            this.compose([
              `Hello ${salutation},`,
              ``,
              `I'm with ${this.agencyName}, where we build fast, conversion-focused Shopify and BigCommerce storefronts and support them with SEO and automated follow-up.`,
              ``,
              `Having looked at ${business}, I believe there are practical improvements that could lift your organic traffic and conversion rate. I have summarized them in a brief audit and would be happy to send it across.`,
              ``,
              `Would a short call this week suit you?`,
            ]),
          ],
          'E-Commerce'
        );
      }

      if (isB2B) {
        return result(
          [
            `Workflow automation and lead generation for ${business}`,
            `A brief note for ${business}`,
            `Website and pipeline support for ${business}`,
          ],
          [
            this.compose([
              `Hello ${salutation},`,
              ``,
              `I'm reaching out from ${this.agencyName}. We help B2B teams improve operations and client acquisition through:`,
              ``,
              `• Modern website development (Next.js / React) built for speed and conversion`,
              `• Custom workflow automation and CRM integrations that remove repetitive manual work`,
              `• Outbound lead systems designed to book qualified discovery calls`,
              ``,
              `If streamlining operations or adding qualified sales conversations is a priority at ${business} this quarter, I would welcome a brief 10-minute conversation.`,
              ``,
              `Would sometime this week suit you?`,
            ]),
            this.compose([
              `Hello ${salutation},`,
              ``,
              `${this.agencyName} works with B2B and service companies on web presence, process automation, and outbound lead generation.`,
              ``,
              `I'd like to understand how ${business} currently handles client acquisition and where we might be able to help. Would you be open to a short call this week?`,
            ]),
          ],
          'B2B'
        );
      }

      // Local businesses, clinics, healthcare and general services
      if (style === 'direct') {
        return result(
          [
            `Improving ${business}'s visibility on Google`,
            `Local search and enquiries for ${business}`,
            `Scaling client enquiries for ${business}`,
          ],
          [
            this.compose([
              `Hello ${salutation},`,
              ``,
              `Are you currently looking to grow bookings at ${business}? ${this.agencyName} helps ${categoryPhrase} with:`,
              ``,
              `• Google Business Profile optimization, to improve Google Maps visibility`,
              `• Website development and redesign, built for mobile and enquiries`,
              `• SEO, including optimization for AI search tools such as ChatGPT`,
              `• Automated enquiry follow-up, so no prospective client goes unanswered`,
              ``,
              `I'd be glad to share a short audit for ${business}, free of charge. Would a brief 10-minute call this week work?`,
            ]),
          ],
          'Direct'
        );
      }

      if (style === 'curious') {
        return result(
          [
            `A question about ${business}`,
            `Local Google presence for ${business}`,
            `Customer enquiries at ${business}`,
          ],
          [
            this.compose([
              `Hello ${salutation},`,
              ``,
              `I'm curious how ${business} currently handles local Google visibility, website enquiries, and client follow-up.`,
              ``,
              `I ask because ${this.agencyName} helps ${categoryPhrase} with Google Business Profile optimization, website development, SEO, and automated enquiry handling. I reviewed ${business} and would be happy to share a short audit of what I found.`,
              ``,
              `Would you be open to me sending it over?`,
            ]),
          ],
          'Consultative'
        );
      }

      // Conversational (default)
      return result(
        [
          `Improving ${business}'s visibility on Google`,
          `Local search visibility for ${business}`,
          `A short audit for ${business}`,
        ],
        [
          this.compose([
            `Hello ${salutation},`,
            ``,
            `I'm reaching out from ${this.agencyName}. We help ${categoryPhrase} attract more local customers through:`,
            ``,
            `• Google Business Profile optimization, to improve visibility on Google Maps`,
            `• Website development and SEO, including optimization for AI search tools`,
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
            `After looking at ${business}'s online presence, I identified a few practical improvements that could help bring in more enquiries. I've put them into a brief audit that I would be happy to share at no cost.`,
            ``,
            `Would a short call this week suit you, or shall I email it across?`,
          ]),
        ],
        'Conversational'
      );
    }

    // 2. Follow-up 1
    if (stage === 'followup_1') {
      return result(
        [
          `Following up: ${business} local visibility audit`,
          `Following up regarding ${business}`,
          `Checking in: ${business}`,
        ],
        [
          this.compose([
            `Hello ${salutation},`,
            ``,
            `I'm following up on my previous email in case it was missed. I have a short audit prepared for ${business} covering your Google presence, website performance, and how quickly enquiries are being handled.`,
            ``,
            `If it would be useful, I can send it across or walk you through it in 10 minutes at a time that suits you.`,
          ]),
          this.compose([
            `Hello ${salutation},`,
            ``,
            `I wanted to check whether you had a chance to see my earlier note about ${business}.`,
            ``,
            `The audit is ready whenever you are. Just let me know whether you'd prefer to receive it by email or discuss it briefly over a call.`,
          ]),
        ],
        'Follow-up 1'
      );
    }

    // 3. Follow-up 2
    if (stage === 'followup_2') {
      return result(
        [
          `A quick observation about ${business}`,
          `${business}: a brief note`,
          `Customer enquiries at ${business}`,
        ],
        [
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
            `I'm writing once more to see whether strengthening ${business}'s online presence and enquiry response time is something you are considering at the moment.`,
            ``,
            `If so, I can send over the short audit I mentioned. If the timing is not right, just let me know and I will follow up at a later date.`,
          ]),
        ],
        'Follow-up 2'
      );
    }

    // 4. Follow-up 3 (final)
    if (stage === 'followup_3') {
      return result(
        [
          `Closing the loop: ${business}`,
          `Final follow-up regarding ${business}`,
          `Last note: ${business}`,
        ],
        [
          this.compose([
            `Hello ${salutation},`,
            ``,
            `I haven't heard back, so I'll assume the timing isn't right and will not send further emails. If improving your local search visibility, website, or enquiry handling becomes a priority, you are welcome to reach out at any time.`,
            ``,
            `Wishing you and the ${business.replace(/^the\s+/i, '')} team continued success.`,
          ]),
          this.compose([
            `Hello ${salutation},`,
            ``,
            `As I have not received a response, I will pause my outreach here so as not to crowd your inbox. Should you wish to revisit this in the future, I'd be glad to help ${business} with Google visibility, website performance, or enquiry automation.`,
            ``,
            `All the best to you and your team.`,
          ]),
        ],
        'Follow-up 3'
      );
    }

    // 5. Client check-in / retention (no opt-out footer needed for existing clients)
    const clientSignoff = this.buildSignoff();
    return {
      subject: this.pick([
        `Checking in: ${business}`,
        `Progress update for ${business}`,
        `Quick review of ${business}'s results`,
      ]),
      body: this.pick([
        [
          `Hello ${salutation},`,
          ``,
          `I'm checking in to see how things are going with your website, search visibility, and enquiries at ${business}.`,
          ``,
          `We continue to monitor your rankings, Google Business Profile activity, and automation workflows. If there are any offers, changes, or priorities you'd like us to focus on this month, please let us know.`,
          ``,
          clientSignoff,
        ].join('\n'),
        [
          `Hello ${salutation},`,
          ``,
          `I hope things are going well at ${business}. I'd like to confirm that your website, Google listing, and enquiry automations are delivering the results you expect.`,
          ``,
          `If you'd like to adjust any targeting or workflows, simply reply to this email and we will take care of it.`,
          ``,
          clientSignoff,
        ].join('\n'),
      ]),
      stage: 'client_checkin',
      isAiGenerated: false,
      modelUsed: 'Humanizer Engine (Client Check-in)',
    };
  }
}

export const humanizerService = new HumanizerService();