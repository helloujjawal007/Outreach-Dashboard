import { ollamaService } from './ollamaService';

export interface InboundClassification {
  intent: 'meeting_request' | 'interested' | 'question' | 'not_now' | 'not_interested' | 'opt_out';
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  recommendedAction: 'convert_to_client' | 'send_calendar_link' | 'answer_question' | 'followup_later' | 'suppress';
  suggestedReplySubject: string;
  suggestedReplyBody: string;
}

export interface CopyGenerationRequest {
  businessName: string;
  category?: string;
  contactName?: string;
  channel: 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'website_form';
  stage: 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
  style?: 'conversational' | 'direct' | 'curious';
  notes?: string;
  location?: string;
  rating?: number;
  reviewsCount?: number;
  customInstructions?: string;
}

export class UnifiedAiService {
  private geminiApiKey: string;

  constructor() {
    this.geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
  }

  /**
   * Cleans business name of corporate legal suffixes
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
   * Formats friendly first name or team salutation
   */
  public buildSalutation(businessName: string, contactName?: string): string {
    const contact = (contactName || '').trim();
    const cleanBiz = this.cleanBusinessName(businessName).replace(/^the\s+/i, '').trim();

    if (contact && contact.toLowerCase() !== businessName.toLowerCase() && !contact.includes('@') && !contact.includes('http')) {
      return contact.split(' ')[0];
    }
    if (cleanBiz && cleanBiz.toLowerCase() !== 'your team') {
      return `${cleanBiz} team`;
    }
    return 'team';
  }

  /**
   * Autonomous Inbound Reply Classifier & Response Generator
   * Evaluates external replies (Gmail IMAP, WhatsApp, etc.) to determine lead intent and generate an instant contextual draft.
   */
  public async classifyInboundReply(params: {
    senderEmail?: string;
    senderName?: string;
    businessName: string;
    subject: string;
    replyText: string;
  }): Promise<InboundClassification> {
    const text = (params.replyText || '').toLowerCase().trim();
    const cleanBiz = this.cleanBusinessName(params.businessName);
    const salutation = this.buildSalutation(params.businessName, params.senderName);

    // 1. Opt-out / Suppression detection
    const optOutKeywords = ['unsubscribe', 'stop', 'remove', 'opt out', 'opt-out', 'cancel', 'quit', 'dont message', "don't message", 'do not contact', 'leave me alone', 'take me off'];
    if (optOutKeywords.some((kw) => text.includes(kw))) {
      return {
        intent: 'opt_out',
        confidence: 0.99,
        sentiment: 'negative',
        summary: 'Lead requested to be removed / unsubscribed.',
        recommendedAction: 'suppress',
        suggestedReplySubject: `Unsubscribe confirmation: ${params.subject || 'Outreach'}`,
        suggestedReplyBody: `Understood completely. You have been removed from our contact list and won't receive any further messages from us.\n\nBest regards,\nOnline Digital Solution`,
      };
    }

    // 2. Meeting / Call Request detection
    const meetingKeywords = [
      'calendar', 'schedule', 'book a call', 'book a time', 'set up a call', 'set up a meeting',
      'available tomorrow', 'available this week', 'available monday', 'available tuesday', 'available wednesday',
      'available thursday', 'available friday', 'call me at', 'reach me at', 'send calendar', 'zoom link',
      'google meet', 'talk soon', 'give me a call', 'chat tomorrow', 'time works'
    ];
    if (meetingKeywords.some((kw) => text.includes(kw)) || /\b(call|meet|zoom|chat)\b.*\b(tomorrow|thursday|friday|monday|tuesday|wednesday|week|morning|afternoon)\b/i.test(text)) {
      return {
        intent: 'meeting_request',
        confidence: 0.96,
        sentiment: 'positive',
        summary: 'Lead requested a phone call or meeting to discuss options.',
        recommendedAction: 'convert_to_client',
        suggestedReplySubject: `Re: ${params.subject || `Call scheduling regarding ${cleanBiz}`}`,
        suggestedReplyBody: `Hi ${salutation},\n\nFantastic, thank you for getting back to me! I'd love to jump on a quick 10-minute walkthrough to show you the local search review and inquiry workflow we prepared for ${cleanBiz}.\n\nDoes tomorrow afternoon or Thursday morning work best on your end? Alternatively, feel free to reply with a direct number or your preferred time and I will confirm right away.\n\nBest regards,\nOnline Digital Solution`,
      };
    }

    // 3. Interested / Pricing / Quote inquiry detection
    const interestKeywords = [
      'interested', 'sounds good', 'tell me more', 'how much', 'cost', 'pricing', 'quote',
      'portfolio', 'case studies', 'examples', 'send details', 'send more info', 'more information',
      'what do you charge', 'rates', 'what is the price', 'sure', 'yes', 'definitely', 'would like to see'
    ];
    if (interestKeywords.some((kw) => text.includes(kw))) {
      return {
        intent: 'interested',
        confidence: 0.92,
        sentiment: 'positive',
        summary: 'Lead is interested and inquired about pricing, details, or examples.',
        recommendedAction: 'convert_to_client',
        suggestedReplySubject: `Re: ${params.subject || `Overview & details for ${cleanBiz}`}`,
        suggestedReplyBody: `Hi ${salutation},\n\nGlad to connect! For businesses like ${cleanBiz}, our core focus is delivering measurable results—whether that's locking in top-3 Google Maps visibility, modernizing your web presence for lightning-fast mobile loading, or automating client inquiry follow-ups so zero leads slip away.\n\nOur solutions are customized based on current visibility gaps, typically starting with a complimentary digital audit and clear month-over-month growth steps.\n\nWould you be open to a 5-minute screen share or quick phone chat later this week so I can share what we found?\n\nBest regards,\nOnline Digital Solution`,
      };
    }

    // 4. Specific Question detection
    if (text.includes('?') || text.startsWith('how') || text.startsWith('what') || text.startsWith('where') || text.startsWith('who')) {
      return {
        intent: 'question',
        confidence: 0.85,
        sentiment: 'neutral',
        summary: 'Lead asked a question regarding the outreach.',
        recommendedAction: 'answer_question',
        suggestedReplySubject: `Re: ${params.subject || `Quick question regarding ${cleanBiz}`}`,
        suggestedReplyBody: `Hi ${salutation},\n\nThanks for reaching out! In short, Online Digital Solution is a specialized digital growth agency. We help established local businesses and brands optimize their Google My Business ranking, modernize their web platforms, and set up automated customer outreach systems.\n\nI'd be glad to address any specific questions you have or send over a quick 2-minute video breakdown tailored specifically for ${cleanBiz}.\n\nBest regards,\nOnline Digital Solution`,
      };
    }

    // 5. Not right now / Busy detection
    const notNowKeywords = ['busy right now', 'check back', 'in a few months', 'next quarter', 'not right now', 'maybe later', 'reconnect later'];
    if (notNowKeywords.some((kw) => text.includes(kw))) {
      return {
        intent: 'not_now',
        confidence: 0.88,
        sentiment: 'neutral',
        summary: 'Lead requested a future follow-up when their schedule clears.',
        recommendedAction: 'followup_later',
        suggestedReplySubject: `Re: ${params.subject || `Touching base later for ${cleanBiz}`}`,
        suggestedReplyBody: `Hi ${salutation},\n\nCompletely understand! Timing is everything. I will make a note on our side to circle back in a few weeks when things have settled down for ${cleanBiz}.\n\nWishing you a productive week ahead.\n\nBest regards,\nOnline Digital Solution`,
      };
    }

    // 6. Polite Decline detection
    const declineKeywords = ['not interested', 'we already have', 'we have someone', 'no thanks', 'not at this time', 'pass', 'all set'];
    if (declineKeywords.some((kw) => text.includes(kw))) {
      return {
        intent: 'not_interested',
        confidence: 0.90,
        sentiment: 'negative',
        summary: 'Lead politely declined outreach services.',
        recommendedAction: 'suppress',
        suggestedReplySubject: `Re: ${params.subject || `Thank you from Online Digital Solution`}`,
        suggestedReplyBody: `Hi ${salutation},\n\nThanks for the quick reply and letting me know! If anything changes down the road or you ever need a second pair of eyes on your search presence or automations, please feel free to reach out anytime.\n\nBest regards,\nOnline Digital Solution`,
      };
    }

    // Fallback classification
    return {
      intent: 'interested',
      confidence: 0.70,
      sentiment: 'neutral',
      summary: 'Inbound response received from lead.',
      recommendedAction: 'answer_question',
      suggestedReplySubject: `Re: ${params.subject || `Following up with ${cleanBiz}`}`,
      suggestedReplyBody: `Hi ${salutation},\n\nThank you for getting back to me! What would be the most convenient way for us to connect briefly—a quick phone call, or would you prefer I email over a couple of specific recommendations for ${cleanBiz}?\n\nBest regards,\nOnline Digital Solution`,
    };
  }

  /**
   * Generates dynamic, hyper-personalized cold or follow-up outreach copy
   */
  public async generateOutreachCopy(req: CopyGenerationRequest): Promise<{
    subject: string;
    body: string;
    modelUsed: string;
  }> {
    const { businessName, category = '', contactName, channel, stage, style = 'conversational', notes = '', location = '' } = req;
    const cleanBiz = this.cleanBusinessName(businessName);
    const salutation = this.buildSalutation(businessName, contactName);
    const cat = category.toLowerCase();

    // Try Gemini if API key configured
    if (this.geminiApiKey) {
      try {
        const geminiRes = await this.callGeminiApi(req, cleanBiz, salutation);
        if (geminiRes) return geminiRes;
      } catch (err) {
        console.warn('[UnifiedAiService] Gemini API call skipped:', err);
      }
    }

    // Try Ollama if online
    const ollamaHealth = await ollamaService.checkHealth().catch(() => ({ online: false }));
    if (ollamaHealth.online) {
      try {
        const ollamaRes = await this.callOllama(req, cleanBiz, salutation);
        if (ollamaRes) return ollamaRes;
      } catch (err) {
        console.warn('[UnifiedAiService] Ollama call skipped:', err);
      }
    }

    // Fallback to High-Conversion Dynamic Algorithmic Engine (Ultra-reliable, zero latency)
    return this.generateDynamicAlgorithmicCopy(req, cleanBiz, salutation);
  }

  /**
   * Calls Google Gemini API via REST
   */
  private async callGeminiApi(req: CopyGenerationRequest, cleanBiz: string, salutation: string) {
    const prompt = `
You are an expert sales consultant for "Online Digital Solution", a premier digital growth agency specializing in:
- Google My Business (GMB) Top 3 Map Pack Optimization
- Lightning-fast modern web dev (Next.js/React/Tailwind)
- SEO, GEO (Generative AI search ranking), and AEO
- Business Workflow Automations & Done-For-You Inbound booking systems

Write a short, highly persuasive ${req.channel.toUpperCase()} message for:
- Prospect: ${salutation} at ${cleanBiz}
- Industry: ${req.category || 'Local Business'}
- Stage: ${req.stage} (${req.stage === 'initial' ? 'First outreach' : req.stage === 'followup_1' ? 'First gentle follow-up' : 'Polite final check-in'})
- Location: ${req.location || 'Local market'}
- Strict Constraints:
  1. Under 80 words for email, under 45 words for WhatsApp/Social.
  2. Authentic, conversational tone. No hype or buzzwords.
  3. Sign-off must be:
     Best regards,
     Online Digital Solution
  4. Provide "Subject: ..." on line 1 if email, followed by the body.
    `.trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return this.parseSubjectAndBody(text, cleanBiz, 'Gemini 1.5 Flash');
  }

  /**
   * Calls local Ollama model
   */
  private async callOllama(req: CopyGenerationRequest, cleanBiz: string, salutation: string) {
    const prompt = `Write a short, high-converting ${req.channel} outreach message for ${salutation} at ${cleanBiz} (${req.category || 'business'}). Stage: ${req.stage}. Agency: Online Digital Solution. Sign off with: Best regards,\nOnline Digital Solution. Output format: Subject: ... then body.`;
    const res = await ollamaService.generateCompletion({ prompt });
    if (!res.fallback && res.response) {
      return this.parseSubjectAndBody(res.response, cleanBiz, res.modelUsed);
    }
    return null;
  }

  private parseSubjectAndBody(raw: string, cleanBiz: string, modelUsed: string) {
    const lines = raw.split('\n');
    let subject = `Quick question regarding ${cleanBiz}`;
    let body = raw;

    const subjectLine = lines.find((l) => l.toLowerCase().startsWith('subject:'));
    if (subjectLine) {
      subject = subjectLine.replace(/^subject:\s*/i, '').trim();
      body = lines.filter((l) => !l.toLowerCase().startsWith('subject:')).join('\n').trim();
    }

    if (!body.includes('Online Digital Solution')) {
      body += '\n\nBest regards,\nOnline Digital Solution';
    }

    return { subject, body, modelUsed };
  }

  /**
   * Built-in Dynamic Algorithmic Copy Engine
   */
  private generateDynamicAlgorithmicCopy(req: CopyGenerationRequest, cleanBiz: string, salutation: string) {
    const { category = '', stage, channel, location } = req;
    const cat = category.toLowerCase();
    const locSnippet = location ? ` in ${location}` : '';

    // Specialized niche angles
    let nicheHook = `reviewing your local digital presence and search visibility${locSnippet}`;
    let valuePitch = `helping similar businesses rank in the top 3 Google Maps pack and convert more online visitors into direct calls`;

    if (cat.includes('dental') || cat.includes('health') || cat.includes('clinic') || cat.includes('med')) {
      nicheHook = `how local patients find and book appointments with ${cleanBiz}${locSnippet}`;
      valuePitch = `streamlining patient inquiry response times and improving your local Google Maps patient visibility`;
    } else if (cat.includes('fitness') || cat.includes('gym') || cat.includes('crossfit') || cat.includes('yoga')) {
      nicheHook = `member acquisition and trial sign-ups for ${cleanBiz}${locSnippet}`;
      valuePitch = `optimizing local Google ranking and automating instant follow-ups on new trial inquiries`;
    } else if (cat.includes('plumb') || cat.includes('hvac') || cat.includes('roof') || cat.includes('contract') || cat.includes('electric')) {
      nicheHook = `emergency dispatch and local service call inquiries for ${cleanBiz}${locSnippet}`;
      valuePitch = `securing prime placement in Google local search and ensuring no emergency service quote requests go unanswered`;
    } else if (cat.includes('ecom') || cat.includes('retail') || cat.includes('shop') || cat.includes('store')) {
      nicheHook = `mobile store performance and product search ranking for ${cleanBiz}`;
      valuePitch = `accelerating Shopify/e-commerce load speeds and optimizing product visibility on AI-powered search engines`;
    } else if (cat.includes('law') || cat.includes('legal') || cat.includes('attorney')) {
      nicheHook = `client intake workflows and local practice visibility for ${cleanBiz}${locSnippet}`;
      valuePitch = `enhancing local Google Map pack prominence and automating after-hours client inquiry responses`;
    }

    let subject = `Quick question regarding ${cleanBiz}`;
    let body = '';

    if (stage === 'initial') {
      subject = `Quick question regarding ${cleanBiz}`;
      body = `Hi ${salutation},\n\nI was recently ${nicheHook}.\n\nAt Online Digital Solution, we specialize in ${valuePitch}.\n\nWould you be open to a quick 3-minute walkthrough this week to see a couple of specific opportunities we uncovered for ${cleanBiz}?\n\nBest regards,\nOnline Digital Solution`;
    } else if (stage === 'followup_1') {
      subject = `Following up regarding ${cleanBiz}`;
      body = `Hi ${salutation},\n\nCircling back briefly on my earlier note regarding ${nicheHook}.\n\nWe put together a short checklist of quick wins that could help ${cleanBiz} capture additional high-intent local inquiries without altering your current team operations.\n\nDo you have 5 minutes this Thursday or Friday for a brief call?\n\nBest regards,\nOnline Digital Solution`;
    } else if (stage === 'followup_2') {
      subject = `Final check-in for ${cleanBiz}`;
      body = `Hi ${salutation},\n\nI know schedules get hectic, so I promise not to clutter your inbox further.\n\nIf improving your Google search visibility or streamlining customer inquiry responses becomes a priority for ${cleanBiz} down the line, we're always here to assist.\n\nWishing you continued success!\n\nBest regards,\nOnline Digital Solution`;
    } else {
      subject = `Account check-in regarding ${cleanBiz}`;
      body = `Hi ${salutation},\n\nChecking in to see how your campaigns and client inquiries are performing this week. Let us know if you need any adjustments or new growth points implemented.\n\nBest regards,\nOnline Digital Solution`;
    }

    // Adapt for WhatsApp / Short channels
    if (channel === 'whatsapp' || channel === 'instagram' || channel === 'facebook') {
      if (stage === 'initial') {
        body = `Hi ${salutation}! Following up regarding ${cleanBiz}${locSnippet}. We help similar teams boost local Google search rankings & automate customer inquiries. Open to a quick 2-min chat this week? - Online Digital Solution`;
      } else {
        body = `Hi ${salutation}! Just wanted to gently follow up on my previous note for ${cleanBiz}. Let me know if you'd like a quick breakdown of top search opportunities we spotted. Best, Online Digital Solution`;
      }
    }

    return {
      subject,
      body,
      modelUsed: 'Unified Dynamic Algorithmic Engine',
    };
  }
}

export const unifiedAiService = new UnifiedAiService();
