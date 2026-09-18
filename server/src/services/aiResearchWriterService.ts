import { ollamaService } from './ollamaService';
import { humanizerService } from './humanizerService';

export type OutreachChannel = 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'linkedin';

export interface ResearchBrief {
  cleanBusinessName: string;
  salutation: string;
  industry: string;
  detectedPainPoints: string[];
  personalizedHook: string;
  recommendedValueProp: string;
}

export interface GeneratedOutreachMessage {
  channel: OutreachChannel;
  subject?: string;
  body: string;
  researchBrief: ResearchBrief;
  isAiGenerated: boolean;
  modelUsed: string;
  wordCount: number;
}

export interface ImproviseOptions {
  text: string;
  channel: OutreachChannel;
  businessName?: string;
  category?: string;
  recipientName?: string;
  tone?: string;
}

export interface ImprovisedMessageResult {
  improvedText: string;
  subject?: string;
  channel: OutreachChannel;
  modelUsed: string;
  isAiGenerated: boolean;
  wordCount: number;
}

export class AiResearchWriterService {
  /**
   * Conducts deep business profiling and synthesizes realistic, consultative pain points and value props
   */
  public conductResearch(contact: {
    businessName: string;
    category?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    facebook?: string;
    notes?: string;
  }): ResearchBrief {
    const cleanBusinessName = humanizerService.cleanBusinessName(contact.businessName || 'Business');
    const salutation = humanizerService.buildSalutation(contact.businessName);
    const category = (contact.category || 'General Business').trim();
    const lowerCat = category.toLowerCase();
    const lowerName = cleanBusinessName.toLowerCase();

    let industry = 'Local Business & Professional Services';
    let detectedPainPoints = [
      'Gaps in Google Maps 3-Pack rankings and outdated mobile website experience',
      'Manual inquiry handling causing prospective clients to contact competing providers',
    ];
    let personalizedHook = `Saw ${cleanBusinessName} and noticed your strong local presence in the community.`;
    let recommendedValueProp =
      'Conducting a complimentary Google Business Profile (GMB) and website audit to help you rank in the top 3 on Google Maps, modernize your web experience, and automate client inquiry follow-ups.';

    if (
      lowerCat.includes('health') ||
      lowerCat.includes('clinic') ||
      lowerCat.includes('medical') ||
      lowerCat.includes('dental') ||
      lowerCat.includes('doctor') ||
      lowerName.includes('clinic') ||
      lowerName.includes('dental') ||
      lowerName.includes('medical')
    ) {
      industry = 'Healthcare & Medical Practice';
      detectedPainPoints = [
        'Prospective patients struggling to find clinic hours or booking links on local mobile searches',
        'Unoptimized Google Business Profile missing top-3 Maps placement for neighborhood patient searches',
      ];
      personalizedHook = `I came across ${cleanBusinessName} and was impressed by your patient reputation in the community.`;
      recommendedValueProp =
        'Providing a complimentary GMB ranking check and modern website review to ensure your clinic ranks top 3 on Google Maps, captures mobile searchers, and automates patient booking follow-ups.';
    } else if (
      lowerCat.includes('fitness') ||
      lowerCat.includes('gym') ||
      lowerCat.includes('yoga') ||
      lowerCat.includes('wellness')
    ) {
      industry = 'Fitness & Wellness';
      detectedPainPoints = [
        'High local fitness competition and unoptimized Google Maps rankings for neighborhood workouts',
        'Interested class seekers dropping off when inquiry replies take more than a few minutes',
      ];
      personalizedHook = `Loved what the team is doing at ${cleanBusinessName} for member fitness and training.`;
      recommendedValueProp =
        'Sharing a complimentary local search audit, modern website booking review, and inquiry follow-up automation setup to help local fitness seekers choose your facility.';
    } else if (
      lowerCat.includes('agency') ||
      lowerCat.includes('marketing') ||
      lowerCat.includes('software') ||
      lowerCat.includes('saas') ||
      lowerCat.includes('consulting') ||
      lowerCat.includes('b2b')
    ) {
      industry = 'B2B, Tech & Professional Services';
      detectedPainPoints = [
        'Organic search presence lagging behind competitors for high-intent core service keywords on Google and AI search engines',
        'Manual repetitive lead follow-ups and unoptimized cold outbound systems limiting sales call volume',
      ];
      personalizedHook = `Noticed ${cleanBusinessName}’s focus on growth and client delivery in ${category}.`;
      recommendedValueProp =
        'Providing a focused review covering modern framework website development, custom workflow automations (CRM/lead routing), and done-for-you outbound lead systems to book qualified discovery calls.';
    } else if (
      lowerCat.includes('retail') ||
      lowerCat.includes('shop') ||
      lowerCat.includes('ecommerce') ||
      lowerCat.includes('store') ||
      lowerCat.includes('apparel') ||
      lowerName.includes('store') ||
      lowerName.includes('shop')
    ) {
      industry = 'E-Commerce & Retail Brands';
      detectedPainPoints = [
        'Mobile page load speed friction on Shopify / BigCommerce costing conversions and organic rankings',
        'Products not appearing in Google AI Overviews or AI search recommendations (GEO / AEO)',
      ];
      personalizedHook = `Checked out ${cleanBusinessName} and love your product curation.`;
      recommendedValueProp =
        'Conducting a complimentary store speed & E-commerce SEO/GEO audit for Shopify/BigCommerce to boost conversion rates and automate customer cart follow-ups.';
    }

    return {
      cleanBusinessName,
      salutation,
      industry,
      detectedPainPoints,
      personalizedHook,
      recommendedValueProp,
    };
  }

  /**
   * Researches a business and writes tailored, channel-specific outreach copy
   */
  async researchAndWrite(
    contact: {
      businessName: string;
      category?: string;
      phone?: string;
      email?: string;
      instagram?: string;
      facebook?: string;
      notes?: string;
    },
    channel: OutreachChannel,
    customPrompt?: string
  ): Promise<GeneratedOutreachMessage> {
    // If the user provided custom thoughts / bullet points, prioritize improvisation
    if (customPrompt && customPrompt.trim().length > 5) {
      const improviseRes = await this.improviseText({
        text: customPrompt.trim(),
        channel,
        businessName: contact.businessName,
        category: contact.category,
      });

      const research = this.conductResearch(contact);
      return {
        channel,
        subject: improviseRes.subject || (channel === 'email' ? `Quick question regarding ${contact.businessName}` : undefined),
        body: improviseRes.improvedText,
        researchBrief: research,
        isAiGenerated: improviseRes.isAiGenerated,
        modelUsed: improviseRes.modelUsed,
        wordCount: improviseRes.wordCount,
      };
    }

    const research = this.conductResearch(contact);
    const { cleanBusinessName, salutation, industry, detectedPainPoints, personalizedHook, recommendedValueProp } = research;

    // Check Ollama health
    const ollamaHealth = await ollamaService.checkHealth();

    if (ollamaHealth.online) {
      try {
        const channelRules: Record<OutreachChannel, string> = {
          email: 'Write a subject line on the first line (Subject: ...) and a 2-paragraph email pitch under 90 words. Professional and direct with a low-friction CTA question.',
          whatsapp: 'Write a punchy, warm, conversational WhatsApp message under 45 words (2-3 sentences max). Sound human, not like automated spam. Mention their business naturally and ask a quick, low-friction question.',
          facebook: 'Write a direct message for Facebook Messenger under 60 words. Friendly and focused on page and local discovery.',
          instagram: 'Write an engaging Instagram DM under 50 words. Casual, complimentary of their profile, and straight to the point.',
          linkedin: 'Write a concise LinkedIn outreach message under 75 words. Thoughtful, professional, peer-level, and conversational with a low-friction invite.',
        };

        const prompt = `You are a professional outreach consultant for Online Digital Solution.
We specialize in:
• Google Business Profile (GMB) Optimization & Top 3 Google Maps Ranking
• Modern Website Development & Redesign (built with ultra-fast modern frameworks)
• SEO, GEO (Generative Engine Optimization) & AEO (ranking on Google, ChatGPT & Perplexity)
• E-Commerce Store Development & Optimization (Shopify & BigCommerce)
• Business Workflow Automations & Done-For-You Outbound Lead Systems

CRITICAL RULES:
- Ground the pitch in the recipient's specific industry and the research brief below.
- Keep the outreach consultative, modern, realistic, and authentic with a low-friction question at the end.
- Mention our relevant capabilities (GMB/SEO/GEO, modern website development, Shopify/BigCommerce, or workflow automations).

Research brief:
- Target Business: ${cleanBusinessName}
- Industry: ${industry}
- Key Area of Review: ${detectedPainPoints[0]}
- Recommended Value Prop: ${recommendedValueProp}
- Hook: ${personalizedHook}
${customPrompt ? `User's Rough Notes / Thoughts to Weave: ${customPrompt}` : ''}

Task: ${channelRules[channel]}
Return only the final message text.`;

        const result = await ollamaService.generateCompletion({
          prompt,
          system: 'You write human, punchy, hyper-personalized outreach without buzzwords, robotic introductions, or unrealistic false promises.',
        });

        if (!result.fallback && result.response) {
          let subject = '';
          let body = result.response;

          if (channel === 'email' && body.includes('Subject:')) {
            const parts = body.split(/Subject:\s*/i);
            const afterSubject = parts[1] || '';
            const lineEnd = afterSubject.indexOf('\n');
            if (lineEnd !== -1) {
              subject = afterSubject.substring(0, lineEnd).trim();
              body = afterSubject.substring(lineEnd).trim();
            } else {
              subject = afterSubject.trim();
              body = '';
            }
          }

          return {
            channel,
            subject: subject || `Quick question regarding ${cleanBusinessName}`,
            body,
            researchBrief: research,
            isAiGenerated: true,
            modelUsed: result.modelUsed,
            wordCount: body.split(/\s+/).filter(Boolean).length,
          };
        }
      } catch (err) {
        console.warn('[AiResearchWriterService] Ollama generation error, using smart fallback template:', err);
      }
    }

    // Realistic, consultative deterministic templates grounded in synthesized research
    let subject = '';
    let body = '';

    if (channel === 'email') {
      subject = `Quick question regarding ${cleanBusinessName}`;
      body = `Hi ${salutation},\n\n${personalizedHook} We work with teams across ${industry} to address ${detectedPainPoints[0].toLowerCase()}.\n\nSpecifically, ${recommendedValueProp.toLowerCase()}\n\nWould you be open to a quick 3-minute walkthrough this Thursday to see if this could be relevant for ${cleanBusinessName}?\n\nBest regards,\nOnline Digital Solution`;
    } else if (channel === 'whatsapp') {
      body = `Hi ${salutation}! ${personalizedHook} We've been helping similar ${industry.toLowerCase()} teams solve ${detectedPainPoints[0].toLowerCase()} by ${recommendedValueProp.toLowerCase()} Open to a quick 60-second summary on how it works for ${cleanBusinessName}?`;
    } else if (channel === 'facebook') {
      body = `Hi ${salutation}, came across your page for ${cleanBusinessName}. We specialize in helping ${industry.toLowerCase()} businesses optimize their local search presence, modern websites, and client inquiries. Open to a quick chat on how this could help your team this month?`;
    } else if (channel === 'instagram') {
      body = `Hey ${salutation}! Love the presence you've built with ${cleanBusinessName}. We help similar brands turn search and social visitors into booked clients with zero friction. Would you be open to taking a quick look at a brief review?`;
    } else if (channel === 'linkedin') {
      body = `Hi ${salutation}, noticed ${cleanBusinessName}’s work in ${category}. We specialize in helping businesses optimize their Google Maps ranking, build ultra-fast modern websites, and set up client inquiry automations. Open to connecting and sharing a brief note?`;
    }

    return {
      channel,
      subject: subject || undefined,
      body,
      researchBrief: research,
      isAiGenerated: false,
      modelUsed: 'Grounded Outreach Engine (Deterministic Fallback)',
      wordCount: body.split(/\s+/).filter(Boolean).length,
    };
  }

  /**
   * Human-in-the-Loop Improvisation Engine:
   * Takes rough thoughts, bullet points, or notes from the user and elevates them into
   * a realistic, consultative, channel-formatted outreach message.
   */
  async improviseText(options: ImproviseOptions): Promise<ImprovisedMessageResult> {
    const rawText = (options.text || '').trim();
    const channel = options.channel || 'email';
    const cleanBusinessName = options.businessName ? humanizerService.cleanBusinessName(options.businessName) : 'your team';
    const salutation = options.recipientName || (options.businessName ? humanizerService.buildSalutation(options.businessName) : 'there');
    const category = (options.category || 'Local Business').trim();

    // Check Ollama health
    const ollamaHealth = await ollamaService.checkHealth();

    const channelRules: Record<OutreachChannel, string> = {
      email: 'Format as an email with a Subject line on the very first line (Subject: ...). Keep the body under 85 words, polite, professional, and conclude with a low-friction question.',
      whatsapp: 'Format as a warm, conversational WhatsApp message under 45 words (2-3 sentences max). Clear, friendly, zero marketing hype.',
      facebook: 'Format as a Facebook Messenger message under 55 words. Engaging, friendly, and focused on local visibility.',
      instagram: 'Format as an Instagram DM under 45 words. Casual, complimentary, and direct.',
      linkedin: 'Format as a professional LinkedIn outreach note under 70 words. Thoughtful, peer-level, and conversational.',
    };

    if (ollamaHealth.online) {
      try {
        const prompt = `You are an expert sales communication and outreach specialist for Online Digital Solution (led by Anupam Kumar, SEO Specialist).

CRITICAL GROUNDING RULES:
1. NEVER use unrealistic claims, exaggerated promises, or fake metric guarantees (DO NOT say 'double your revenue', '10x bookings', 'top 3 guaranteed rankings', 'automated leads on autopilot', or 'cut no-shows by 40%').
2. Keep the outreach grounded, realistic, transparent, and consultative (e.g. complimentary SEO/audit review, identifying missed search opportunities, checking site speed, or discussing client inquiry response).
3. The user wrote these rough thoughts / bullet points:
"""
${rawText}
"""

Target Business: ${cleanBusinessName}
Category: ${category}
Channel: ${channel}
Channel Constraints: ${channelRules[channel]}

Task:
Elevate, polish, and improvise the user's rough thoughts into a persuasive, human, realistic outreach message for ${channel}.
Preserve their core meaning and intentions. Do NOT invent crazy guarantees.
Return ONLY the message text.`;

        const result = await ollamaService.generateCompletion({
          prompt,
          system: 'You elevate rough user notes into polished, realistic, channel-tailored outreach copy without buzzwords or robotic introductions.',
        });

        if (!result.fallback && result.response) {
          let subject = '';
          let body = result.response;

          if (channel === 'email' && body.includes('Subject:')) {
            const parts = body.split(/Subject:\s*/i);
            const afterSubject = parts[1] || '';
            const lineEnd = afterSubject.indexOf('\n');
            if (lineEnd !== -1) {
              subject = afterSubject.substring(0, lineEnd).trim();
              body = afterSubject.substring(lineEnd).trim();
            } else {
              subject = afterSubject.trim();
              body = '';
            }
          }

          return {
            improvedText: body,
            subject: subject || (channel === 'email' ? `Quick idea for ${cleanBusinessName}` : undefined),
            channel,
            modelUsed: result.modelUsed,
            isAiGenerated: true,
            wordCount: body.split(/\s+/).filter(Boolean).length,
          };
        }
      } catch (err) {
        console.warn('[AiResearchWriterService.improviseText] Ollama error, falling back to smart deterministic improvise:', err);
      }
    }

    // Smart Deterministic Improvisation Fallback:
    // Takes the user's rough bullet points/words and weaves them into clean, realistic copy
    const bulletLines = rawText
      .split(/\r?\n|;/)
      .map((line) => line.replace(/^[\s•\-\*\d\.\)]+/, '').trim())
      .filter((s) => s.length > 2);

    let bulletItems = bulletLines;
    if (bulletItems.length <= 1 && rawText.includes(',')) {
      bulletItems = rawText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 2);
    }

    let keyTopics = bulletItems.length > 0 ? bulletItems.join(', ') : rawText;
    // Format clean snippet for smooth grammatical sentence flow
    const cleanSnippet = keyTopics.replace(/\b(i|we|want|to|and|the)\b/gi, (m) => m.toLowerCase());

    let subject = '';
    let improvedText = '';

    if (channel === 'email') {
      subject = `Quick idea for ${cleanBusinessName}`;
      if (bulletItems.length >= 2) {
        const pointsList = bulletItems.map((item) => `• ${item}`).join('\n');
        improvedText = `Hi ${salutation},\n\nI was looking into ${cleanBusinessName}’s online presence and wanted to reach out regarding a few practical observations:\n\n${pointsList}\n\nWe put together a complimentary review to check these areas with zero obligations. Would you be open to a brief 3-minute chat or walkthrough later this week?\n\nBest regards,\nOnline Digital Solution`;
      } else {
        improvedText = `Hi ${salutation},\n\nI was reviewing local presence for ${cleanBusinessName} in ${category}. Regarding ${cleanSnippet}, I wanted to see if sharing a quick complimentary review would be helpful for your team.\n\nWould you be open to a brief 3-minute chat this Thursday to see what we found?\n\nBest regards,\nOnline Digital Solution`;
      }
    } else if (channel === 'whatsapp') {
      improvedText = `Hi ${salutation}! Saw ${cleanBusinessName} and had a quick thought regarding ${cleanSnippet}. We put together a complimentary 2-minute overview with no strings attached. Open to taking a quick look?`;
    } else if (channel === 'linkedin') {
      improvedText = `Hi ${salutation}, saw what you're building with ${cleanBusinessName}. Regarding ${cleanSnippet}, we recently noticed some low-hanging local visibility opportunities. Open to connecting and sharing a brief note?`;
    } else if (channel === 'instagram') {
      improvedText = `Hey ${salutation}! Love what you're doing with ${cleanBusinessName}. Quick note regarding ${cleanSnippet}—we put together a quick review of your local presence. Mind if we share a brief summary with you?`;
    } else if (channel === 'facebook') {
      improvedText = `Hi ${salutation}, came across your page for ${cleanBusinessName}. On the note of ${cleanSnippet}, we put together a brief review to help local clients find you faster. Open to a quick chat?`;
    }

    return {
      improvedText,
      subject: subject || undefined,
      channel,
      modelUsed: 'Deterministic Improvisation Engine (Human-in-the-Loop)',
      isAiGenerated: false,
      wordCount: improvedText.split(/\s+/).filter(Boolean).length,
    };
  }

  /**
   * Generates research briefs and messages for up to 100 leads in batch
   */
  async batchResearchAndWrite(
    contacts: Array<{
      id: string;
      businessName: string;
      category?: string;
      phone?: string;
      email?: string;
      instagram?: string;
      facebook?: string;
      notes?: string;
    }>,
    channel: OutreachChannel
  ): Promise<Array<GeneratedOutreachMessage & { contactId: string }>> {
    const limited = contacts.slice(0, 100);
    const results: Array<GeneratedOutreachMessage & { contactId: string }> = [];

    for (const contact of limited) {
      const msg = await this.researchAndWrite(contact, channel);
      results.push({
        ...msg,
        contactId: contact.id,
      });
    }

    return results;
  }
}

export const aiResearchWriterService = new AiResearchWriterService();

export async function generateTailoredOutreachCopy(options: {
  businessName: string;
  category?: string;
  channel: OutreachChannel;
  primaryContactName?: string;
  notes?: string;
}) {
  return aiResearchWriterService.researchAndWrite(
    {
      businessName: options.businessName,
      category: options.category,
      notes: options.notes,
    },
    options.channel
  );
}
