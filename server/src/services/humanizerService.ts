import { query } from '../config/db';
import { ollamaService } from './ollamaService';

export interface HumanizerOptions {
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
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
  /**
   * Cleans corporate suffixes and "The " prefixes so the email reads naturally
   */
  public cleanBusinessName(name: string): string {
    if (!name) return 'your team';
    return (
      name
        .replace(/\b(llc|inc|corp|ltd|pvt|co|company|services|solutions|group)\b/gi, '')
        .replace(/[,.-]+$/, '')
        .trim() || name.trim()
    );
  }

  /**
   * Derives a natural human salutation without awkward strings like "Hi The Fitness World team"
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
      // Use first name of primary contact if available
      return contactName.split(' ')[0];
    }

    if (bizWithoutThe && bizWithoutThe.toLowerCase() !== 'your team') {
      return `${bizWithoutThe} team`;
    }

    return 'team';
  }

  /**
   * Selects a random item from an array to ensure anti-fingerprinting variation
   */
  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Generates a context-aware, super modern humanized email for a contact
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

    // 1. Determine Stage Context
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
          else resolvedStage = 'followup_2';
        } catch {
          resolvedStage = 'initial';
        }
      } else {
        resolvedStage = 'initial';
      }
    }

    const style = options.style || 'conversational';

    // 2. Fetch last inbound or outbound message for contextual callbacks if available
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

    // 3. Try Local Ollama if available
    const ollamaHealth = await ollamaService.checkHealth();
    if (ollamaHealth.online) {
      try {
        const prompt = `
Write a super modern, high-converting agency cold email for:
- Recipient: ${salutation} at ${business}
- Agency Name: Online Digital Solution
- Core Services to Highlight: Digital Marketing, SEO & Google Search Ranking, targeted Google & Meta/Instagram Ads, Google My Business (GMB) posting & top 3 Google Maps ranking.
- Context/Stage: ${
          resolvedStage === 'initial'
            ? 'First outreach offering digital growth'
            : resolvedStage === 'followup_1'
            ? 'First gentle follow-up checking in'
            : resolvedStage === 'followup_2'
            ? 'Polite final check-in'
            : 'Check-in with existing paying client regarding their marketing campaigns'
        }
- Style: ${style}
${lastMsgSnippet ? `- Previous message reference: "${lastMsgSnippet}"` : ''}

Strict Rules:
1. NEVER start with "I hope this email finds you well" or "I came across your business in [url]".
2. Highlight our exact services: Digital Marketing, SEO, Google/Meta Ads, and GMB Posting.
3. Sound super modern, clean, crisp, and authentic.
4. Sign-off MUST strictly be:
Best regards,
Online Digital Solution
5. Provide Subject: on first line, followed by empty line, then Body:.
`.trim();

        const aiRes = await ollamaService.generateCompletion({
          prompt,
          system:
            'You are an expert digital agency copywriter for Online Digital Solution. You write modern, highly converting emails that highlight SEO, Ads, and GMB posting.',
          temperature: 0.7,
        });

        if (!aiRes.fallback && aiRes.response) {
          const lines = aiRes.response.split('\n');
          let subject = `Quick question regarding ${business}`;
          let body = aiRes.response;

          const subjectLine = lines.find((l) => l.toLowerCase().startsWith('subject:'));
          if (subjectLine) {
            subject = subjectLine.replace(/^subject:\s*/i, '').trim();
            body = lines.filter((l) => !l.toLowerCase().startsWith('subject:')).join('\n').trim();
          }

          // Ensure sign-off is strictly "Online Digital Solution"
          if (!body.includes('Online Digital Solution')) {
            body += '\n\nBest regards,\nOnline Digital Solution';
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

    // 4. Deterministic Algorithmic Humanizer Engine (Super Modern Copy + Agency Offerings)
    return this.generateAlgorithmicHumanEmail({
      business,
      salutation,
      stage: resolvedStage,
      style,
      lastMsgSnippet,
    });
  }

  /**
   * Super modern copy engine featuring Digital Marketing, SEO, Ads, and GMB Posting
   * Strict sign-off: "Online Digital Solution"
   */
  private generateAlgorithmicHumanEmail(params: {
    business: string;
    salutation: string;
    stage: string;
    style: string;
    lastMsgSnippet?: string;
  }): GeneratedHumanEmail {
    const { business, salutation, stage, style } = params;

    // Strict sign-off as requested by user
    const signoff = 'Best regards,\nOnline Digital Solution';

    // 1. Initial Outreach (First Message)
    if (stage === 'initial') {
      if (style === 'direct') {
        const subjects = [
          `Growth & local ranking for ${business}`,
          `Quick question re: ${business}`,
          `Scaling customer inquiries for ${business}`,
        ];
        const bodies = [
          `Hi ${salutation},\n\nQuick question for you guys at ${business}: are you currently taking on new clients right now?\n\nAt Online Digital Solution, we help local businesses dominate their market with high-ROI digital growth:\n\n• SEO & GMB Posting — getting ${business} ranked in the top 3 on Google Maps so local customers call you first\n• Targeted Google & Meta Ads — driving high-intent, ready-to-book inquiries every week\n• Full-Stack Digital Marketing — turning your online presence into a consistent client acquisition engine\n\nWe recently helped a local business generate 30+ qualified inquiries in under 3 weeks through Google ranking and targeted ads.\n\nWould you be open to a brief 5-minute chat this week to see if we can do the same for ${business}?\n\n${signoff}`,
          `Hey ${salutation},\n\nHope your week is going great! Checked out ${business} online and wanted to reach out directly.\n\nWe run Online Digital Solution. We specialize in:\n\n• Google My Business (GMB) weekly posting & review acceleration to rank #1 locally\n• High-converting Google Ads & Meta/Instagram Ads that bring paying customers to your phone\n• Modern SEO & Digital Marketing to outrank local competitors\n\nAre you looking to scale your appointments and inbound calls this month?\n\nOpen to seeing a quick 60-second breakdown of how we'd get ${business} to the top of Google?\n\n${signoff}`,
        ];
        return {
          subject: this.pick(subjects),
          body: this.pick(bodies),
          stage,
          isAiGenerated: false,
          modelUsed: 'Humanizer Engine (Direct Agency Angle)',
        };
      } else if (style === 'curious') {
        const subjects = [
          `Idea for ${business}`,
          `Local Google ranking for ${business}`,
          `Customer acquisition at ${business}`,
        ];
        const bodies = [
          `Hey ${salutation},\n\nWas looking into top businesses in your area and came across ${business}.\n\nQuick question: how is your team currently handling local Google ranking and online customer acquisition?\n\nWe run Online Digital Solution, helping businesses dominate their local market with:\n\n• GMB (Google My Business) optimization, review acceleration & weekly posting\n• Targeted Google & Social Media Ads that drive immediate buyer inquiries\n• High-impact SEO & Digital Marketing to generate steady inbound calls\n\nIf increasing qualified customer inquiries is on your radar this quarter, I'd love to share a quick 2-minute overview for ${business}.\n\nMind if I send that over?\n\n${signoff}`,
          `Hi ${salutation},\n\nSaw what you guys are building at ${business}—love the brand!\n\nAt Online Digital Solution, we provide end-to-end digital growth: SEO, Google & Meta Ads, and GMB posting to consistently place you in front of ready-to-buy customers.\n\nAre you currently exploring ways to get more client bookings without relying solely on word of mouth?\n\nWould you be open to a quick 5-minute conversation this week?\n\n${signoff}`,
        ];
        return {
          subject: this.pick(subjects),
          body: this.pick(bodies),
          stage,
          isAiGenerated: false,
          modelUsed: 'Humanizer Engine (Consultative Agency Angle)',
        };
      } else {
        // Conversational (Default & Recommended)
        const subjects = [
          `Quick question regarding ${business}`,
          `Growth & Google ranking for ${business}`,
          `Partnership with ${business}`,
        ];
        const bodies = [
          `Hey ${salutation},\n\nChecked out ${business} online—love what you guys are doing.\n\nWe run Online Digital Solution. We specialize in helping businesses like yours bring in a consistent flow of ready-to-buy customers through:\n\n• Google My Business (GMB) weekly posting & ranking you in the top 3 on Google Maps\n• Targeted Google Ads & Meta/Instagram Ads to capture active local buyers\n• High-ROI SEO & Digital Marketing to outrank local competitors\n\nAre you currently looking to add more customers and grow your revenue this month?\n\nHappy to share a quick 2-minute video breakdown of how we'd get ${business} ranking #1 in your area. Open to taking a look?\n\n${signoff}`,
          `Hi ${salutation},\n\nI came across ${business} and wanted to see how you're currently handling your online marketing and local Google presence.\n\nAt Online Digital Solution, we provide full digital growth services:\n\n• Local SEO & GMB Posting (putting you top of Google Maps where 70% of clicks go)\n• High-converting Google & Meta Ads driving direct calls\n• Complete Digital Marketing to maximize your monthly client volume\n\nWorth a quick 5-minute chat this week to see how this could work for ${business}?\n\n${signoff}`,
        ];
        return {
          subject: this.pick(subjects),
          body: this.pick(bodies),
          stage,
          isAiGenerated: false,
          modelUsed: 'Humanizer Engine (Conversational Agency)',
        };
      }
    }

    // 2. Follow-up 1 (Gentle loop-back)
    if (stage === 'followup_1') {
      const subjects = [
        `Re: Quick question regarding ${business}`,
        `Following up re: Google ranking for ${business}`,
        `Checking in: ${business}`,
      ];
      const bodies = [
        `Hey ${salutation},\n\nQuick follow-up on my note from last week! I know you're busy running operations at ${business}.\n\nJust wanted to see if scaling your customer flow with targeted SEO, Google My Business (GMB) posting, and Google/Meta Ads is on your radar this month?\n\nWe've been getting great results putting local businesses in the top 3 on Google Maps and generating steady inquiries.\n\nLet me know if you'd be open to a quick 5-minute chat this week—no pressure at all.\n\n${signoff}`,
        `Hi ${salutation},\n\nFollowing up quickly in case my last email got buried. Did you get a chance to review my note about driving more calls to ${business} through Google SEO and GMB posting?\n\nHappy to share a quick 60-second example whenever suits your schedule.\n\n${signoff}`,
      ];
      return {
        subject: this.pick(subjects),
        body: this.pick(bodies),
        stage,
        isAiGenerated: false,
        modelUsed: 'Humanizer Engine (Follow-up 1)',
      };
    }

    // 3. Follow-up 2 (Polite permission close)
    if (stage === 'followup_2') {
      const subjects = [
        `Final check-in: ${business}`,
        `Permission to close file re: ${business}?`,
        `Last follow-up re: ${business}`,
      ];
      const bodies = [
        `Hi ${salutation},\n\nI know you have a lot on your plate, so I'll keep this short and make it my final check-in.\n\nIf you ever want to scale ${business} with high-ROI Digital Marketing, SEO, Google & Meta Ads, or GMB ranking to get to the top of Google Maps, feel free to reach out anytime.\n\nWishing you and the entire ${business.replace(/^the\s+/i, '')} team continued success!\n\n${signoff}`,
        `Hey ${salutation},\n\nI don't want to clutter your inbox, so I'll pause outreach here. If optimizing local SEO, Google Ads, or GMB posting for ${business} ever becomes a priority down the road, you know where to find us.\n\nAll the best with ${business}!\n\n${signoff}`,
      ];
      return {
        subject: this.pick(subjects),
        body: this.pick(bodies),
        stage,
        isAiGenerated: false,
        modelUsed: 'Humanizer Engine (Follow-up 2)',
      };
    }

    // 4. Client Check-in / Retention
    const subjects = [
      `Quick check-in with ${business}`,
      `Campaign update for ${business}`,
      `Performance review: ${business}`,
    ];
    const bodies = [
      `Hey ${salutation},\n\nChecking in to see how your campaigns and client inquiries are performing this week with ${business}!\n\nWe're actively monitoring your SEO rankings, GMB posting consistency, and ad performance to ensure you're getting the best possible lead volume and ROI.\n\nLet us know if you have any questions or if there are any specific offers you'd like us to feature this month.\n\n${signoff}`,
      `Hi ${salutation},\n\nHope everything is running smoothly at ${business}! Just touching base to ensure your Digital Marketing, SEO, and Google Ads are delivering strong results for you.\n\nFeel free to reply if you'd like to adjust any targeting or launch fresh creatives this week.\n\n${signoff}`,
    ];
    return {
      subject: this.pick(subjects),
      body: this.pick(bodies),
      stage: 'client_checkin',
      isAiGenerated: false,
      modelUsed: 'Humanizer Engine (Client Check-in)',
    };
  }
}

export const humanizerService = new HumanizerService();
