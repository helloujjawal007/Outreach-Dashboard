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
    const category = contact.category || 'General Business';
    const ollamaHealth = await ollamaService.checkHealth();
    if (ollamaHealth.online) {
      try {
        const prompt = `
Write a super modern, high-converting agency cold email for:
- Recipient: ${salutation} at ${business}
- Agency Name: Online Digital Solution
- Core Capabilities:
  • Google My Business (GMB) Optimization & Top 3 Google Maps Ranking
  • Modern Website Development & Redesign (built with ultra-fast modern frameworks)
  • SEO, GEO (Generative Engine Optimization) & AEO (ranking on Google, ChatGPT, Perplexity & AI search)
  • E-Commerce Development (Shopify & BigCommerce store builds, speed optimization & e-commerce SEO)
  • Business Workflow Automations & Done-For-You Outbound Lead Systems
- Business Category / Niche: ${category}
- Context/Stage: ${
          resolvedStage === 'initial'
            ? 'First outreach offering tailored digital growth, modern web dev, SEO/GEO or automations'
            : resolvedStage === 'followup_1'
            ? 'First gentle follow-up checking in'
            : resolvedStage === 'followup_2'
            ? 'Polite final check-in'
            : 'Check-in with existing paying client regarding their marketing and automations'
        }
- Style: ${style}
${lastMsgSnippet ? `- Previous message reference: "${lastMsgSnippet}"` : ''}

Strict Rules:
1. NEVER start with "I hope this email finds you well" or "I came across your business in [url]".
2. Highlight our actual capabilities relevant to their niche (GMB/SEO/GEO, modern website development, Shopify/BigCommerce, or workflow automations).
3. Sound super modern, clean, crisp, and authentic.
4. Sign-off MUST strictly be:
Best regards,
Online Digital Solution
5. Provide Subject: on first line, followed by empty line, then Body:.
`.trim();

        const aiRes = await ollamaService.generateCompletion({
          prompt,
          system:
            'You are an expert digital growth & web development consultant for Online Digital Solution. You write modern, highly converting emails that highlight GMB optimization, modern website development, SEO/GEO/AEO, Shopify/BigCommerce, and business automations.',
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
      category,
      stage: resolvedStage,
      style,
      lastMsgSnippet,
    });
  }

  /**
   * Super modern copy engine featuring GMB Optimization, Modern Web Dev, SEO/GEO/AEO, Shopify/BigCommerce, and Automations
   * Strict sign-off: "Online Digital Solution"
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

    // Determine business archetype for laser-focused personalization
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

    // Strict sign-off as requested by user
    const signoff = 'Best regards,\nOnline Digital Solution';

    // 1. Initial Outreach (First Message)
    if (stage === 'initial') {
      if (isEcom) {
        // E-Commerce (Shopify / BigCommerce focus)
        const subjects = [
          `Store speed & SEO ranking for ${business}`,
          `Quick question regarding ${business}`,
          `Shopify / BigCommerce growth for ${business}`,
        ];
        const bodies = [
          `Hey ${salutation},\n\nChecked out ${business} online—love your product curation.\n\nWe run Online Digital Solution. We specialize in helping e-commerce brands scale revenue through:\n\n• High-performance Shopify & BigCommerce website development and mobile speed optimization\n• E-Commerce SEO, GEO & AEO to get your products ranked on Google, ChatGPT & Perplexity AI search\n• Automated customer retention, cart recovery & marketing workflow automations\n\nAre you looking to increase your store conversion rate and organic sales this month?\n\nHappy to share a quick 2-minute video audit of your store's speed and search visibility. Open to taking a look?\n\n${signoff}`,
          `Hi ${salutation},\n\nCame across ${business} and wanted to reach out directly.\n\nAt Online Digital Solution, we build ultra-fast modern e-commerce storefronts (Shopify & BigCommerce) and run advanced SEO/GEO to drive high-intent buyers directly to your collections.\n\nWe also help brands automate their customer follow-ups and abandoned cart workflows so no potential buyers slip through the cracks.\n\nWould you be open to a quick 5-minute chat this week to see how this could work for ${business}?\n\n${signoff}`,
        ];
        return {
          subject: this.pick(subjects),
          body: this.pick(bodies),
          stage,
          isAiGenerated: false,
          modelUsed: 'Humanizer Engine (E-Commerce & Shopify/BigCommerce)',
        };
      }

      if (isB2B) {
        // B2B, Software, Tech, Consulting & Agency
        const subjects = [
          `Workflow automations & outbound for ${business}`,
          `Quick question re: ${business}`,
          `Modern web development & pipeline for ${business}`,
        ];
        const bodies = [
          `Hey ${salutation},\n\nChecked out what you guys are building at ${business}—impressive work in ${category || 'your space'}.\n\nWe run Online Digital Solution. We specialize in helping B2B teams scale operations and client acquisition through:\n\n• Modern framework website development (Next.js/React) for ultra-fast, high-converting web presence\n• Custom business workflow automations & CRM integrations to eliminate manual repetitive work\n• Done-for-you outbound lead systems to book qualified discovery calls directly on your calendar\n\nAre you looking to streamline operations or add qualified sales calls this quarter?\n\nOpen to a brief 5-minute conversation to see how we could support ${business}?\n\n${signoff}`,
          `Hi ${salutation},\n\nReaching out because we help B2B and service companies like ${business} scale their customer acquisition and backend efficiency.\n\nWe build custom workflow automations, modern high-speed websites, and multi-channel cold outbound engines that deliver consistent sales opportunities.\n\nWould you be open to a quick chat this week to see if this could be a fit for ${business}?\n\n${signoff}`,
        ];
        return {
          subject: this.pick(subjects),
          body: this.pick(bodies),
          stage,
          isAiGenerated: false,
          modelUsed: 'Humanizer Engine (B2B Web Dev & Automations)',
        };
      }

      // Local Businesses, Clinics, Healthcare & General Services
      if (style === 'direct') {
        const subjects = [
          `Google ranking & automations for ${business}`,
          `Quick question re: ${business}`,
          `Scaling patient/client inquiries for ${business}`,
        ];
        const bodies = [
          `Hi ${salutation},\n\nQuick question for you guys at ${business}: are you currently taking on new clients or looking to scale your monthly bookings?\n\nAt Online Digital Solution, we help businesses dominate their local market:\n\n• GMB Optimization — getting ${business} ranked in the top 3 on Google Maps so local customers call you first\n• Modern Website Development & Redesign — ultra-fast, mobile-friendly sites built for instant bookings\n• SEO, GEO & AEO — making sure you're ranked and recommended on Google, ChatGPT & AI search\n• Business Workflow Automations — automating inquiry follow-ups so you never miss a prospective client\n\nWould you be open to a brief 5-minute chat this week to see if we can do the same for ${business}?\n\n${signoff}`,
          `Hey ${salutation},\n\nChecked out ${business} online and wanted to reach out directly.\n\nWe run Online Digital Solution. We specialize in:\n\n• Google My Business (GMB) weekly posting & review acceleration to rank #1 locally\n• Modern web development & redesigns that turn visitors into phone calls\n• High-ROI SEO, GEO & client inquiry automations to outpace competitors\n\nAre you looking to scale your appointments and inbound calls this month?\n\nOpen to seeing a quick 60-second video breakdown of how we'd get ${business} to the top of Google?\n\n${signoff}`,
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
          `Local Google ranking & web presence for ${business}`,
          `Customer acquisition at ${business}`,
        ];
        const bodies = [
          `Hey ${salutation},\n\nWas looking into businesses in your area and came across ${business}.\n\nQuick question: how is your team currently handling local Google ranking, website conversions, and client follow-ups?\n\nWe run Online Digital Solution, helping businesses dominate their market with:\n\n• GMB (Google My Business) optimization, review acceleration & top-3 Maps ranking\n• Modern website redesigns built on ultra-fast frameworks\n• SEO, GEO (AI search optimization) & automated inquiry handling\n\nIf increasing qualified customer inquiries is on your radar this quarter, I'd love to share a quick 2-minute overview for ${business}.\n\nMind if I send that over?\n\n${signoff}`,
          `Hi ${salutation},\n\nSaw what you guys are doing at ${business}—great reputation in the community!\n\nAt Online Digital Solution, we provide end-to-end digital growth: GMB top 3 ranking, modern website development, SEO/GEO, and business workflow automations.\n\nAre you currently exploring ways to get more client bookings and automate your follow-ups?\n\nWould you be open to a quick 5-minute conversation this week?\n\n${signoff}`,
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
          `Digital presence & automations for ${business}`,
        ];
        const bodies = [
          `Hey ${salutation},\n\nChecked out ${business} online—love what you guys are doing.\n\nWe run Online Digital Solution. We specialize in helping businesses like yours bring in a consistent flow of ready-to-buy customers through:\n\n• Google My Business (GMB) optimization & ranking you in the top 3 on Google Maps\n• Modern Website Development & high-performance redesigns for higher conversion\n• SEO, GEO & AEO (getting you recommended on Google and AI search like ChatGPT)\n• Workflow Automations to instantly follow up with new leads and book appointments\n\nAre you currently looking to add more clients and streamline your operations this month?\n\nHappy to share a quick 2-minute video breakdown of how we'd get ${business} ranking #1 in your area. Open to taking a look?\n\n${signoff}`,
          `Hi ${salutation},\n\nI came across ${business} and wanted to see how you're currently handling your online presence, website conversions, and lead follow-up.\n\nAt Online Digital Solution, we help businesses with:\n\n• Local SEO & GMB Posting (putting you top of Google Maps where 70% of clicks go)\n• Ultra-fast, modern website development and redesigns\n• Advanced SEO, GEO & AEO to ensure you rank on Google and AI answer engines\n• Automations that handle customer inquiries and book appointments on autopilot\n\nWorth a quick 5-minute chat this week to see how this could work for ${business}?\n\n${signoff}`,
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
        `Following up re: Google ranking & website for ${business}`,
        `Checking in: ${business}`,
      ];
      const bodies = [
        `Hey ${salutation},\n\nQuick follow-up on my note from last week! I know you're busy running operations at ${business}.\n\nJust wanted to see if scaling your customer flow with GMB ranking, a modern website revamp, SEO/GEO, or workflow automations is on your radar this month?\n\nWe've been getting great results putting businesses in the top 3 on Google Maps and automating their inquiry responses.\n\nLet me know if you'd be open to a quick 5-minute chat this week—no pressure at all.\n\n${signoff}`,
        `Hi ${salutation},\n\nFollowing up quickly in case my last email got buried. Did you get a chance to review my note about driving more calls to ${business} through Google SEO, GMB optimization, or modern web redesigns?\n\nHappy to share a quick 60-second example whenever suits your schedule.\n\n${signoff}`,
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
        `Hi ${salutation},\n\nI know you have a lot on your plate, so I'll keep this short and make it my final check-in.\n\nIf you ever want to scale ${business} with GMB ranking (top 3 on Google Maps), modern website development, SEO/GEO, or business workflow automations, feel free to reach out anytime.\n\nWishing you and the entire ${business.replace(/^the\s+/i, '')} team continued success!\n\n${signoff}`,
        `Hey ${salutation},\n\nI don't want to clutter your inbox, so I'll pause outreach here. If optimizing your website, local Google Maps ranking, or client inquiry automations for ${business} ever becomes a priority down the road, you know where to find us.\n\nAll the best with ${business}!\n\n${signoff}`,
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
      `Campaign & automation update for ${business}`,
      `Performance review: ${business}`,
    ];
    const bodies = [
      `Hey ${salutation},\n\nChecking in to see how your campaigns, website traffic, and client inquiries are performing this week with ${business}!\n\nWe're actively monitoring your SEO rankings, GMB posting consistency, and automation workflows to ensure you're getting the best possible lead volume and ROI.\n\nLet us know if you have any questions or if there are any specific automations or offers you'd like us to feature this month.\n\n${signoff}`,
      `Hi ${salutation},\n\nHope everything is running smoothly at ${business}! Just touching base to ensure your website, GMB ranking, and inquiry automations are delivering strong results for you.\n\nFeel free to reply if you'd like to adjust any targeting or optimize workflows this week.\n\n${signoff}`,
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
