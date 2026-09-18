import { Router, type Request, type Response } from 'express';
import { ollamaService } from '../services/ollamaService';
import { aiResearchWriterService, type OutreachChannel } from '../services/aiResearchWriterService';

export const aiRouter = Router();

// GET /api/ai/status
aiRouter.get('/status', async (_req: Request, res: Response) => {
  const health = await ollamaService.checkHealth();
  res.json({ success: true, ...health });
});

// POST /api/ai/improvise - Human-in-the-Loop Improvisation Engine
// User provides rough notes / bullet points -> AI improvises realistic, channel-tailored copy
aiRouter.post('/improvise', async (req: Request, res: Response) => {
  try {
    const { text, channel = 'email', businessName, category, recipientName, tone } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'text is required to improvise' });
    }

    const result = await aiResearchWriterService.improviseText({
      text: text.trim(),
      channel: channel as OutreachChannel,
      businessName,
      category,
      recipientName,
      tone,
    });

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[aiRouter.improvise]', error);
    res.status(500).json({ success: false, error: 'Failed to improvise outreach text' });
  }
});

// POST /api/ai/draft - Generate realistic AI outreach draft
aiRouter.post('/draft', async (req: Request, res: Response) => {
  try {
    const { businessName, category, channel = 'email', intent } = req.body;

    const prompt = `Write a professional, realistic, and consultative cold outreach message for:
Business Name: ${businessName || 'Local Business'}
Industry / Category: ${category || 'Local Business'}
Channel: ${channel}
Offer / Topic: ${intent || 'Complimentary local SEO & visibility audit'}

CRITICAL RULES:
- Never make unrealistic promises, exaggerated claims, or fake guarantees (no 'double bookings', no '10x revenue', no 'guaranteed top rankings', no 'calls on autopilot').
- Keep tone consultative, polite, respectful, and transparent.
- Word count limits: WhatsApp under 45 words, Email under 85 words, LinkedIn under 70 words, Instagram under 45 words, Facebook under 55 words.
- End with a low-friction question (e.g. asking if they'd be open to seeing a quick 3-minute review).`;

    const result = await ollamaService.generateCompletion({
      prompt,
      system: 'You are an outreach specialist for Online Digital Solution writing realistic, grounded, and high-converting messages without marketing buzzwords.',
    });

    res.json({
      success: true,
      draft: result.response,
      modelUsed: result.modelUsed,
      fallback: result.fallback,
    });
  } catch (error) {
    console.error('[aiRouter.draft]', error);
    res.status(500).json({ success: false, error: 'Failed to generate AI draft' });
  }
});

// POST /api/ai/research-and-write - Deep research + channel-specific copywriter
aiRouter.post('/research-and-write', async (req: Request, res: Response) => {
  try {
    const { leadId, channel = 'email', customPrompt } = req.body;
    let contact = req.body.contact;

    if (leadId) {
      const { query } = await import('../config/db');
      const leadRes = await query<{
        id: string;
        business_name: string;
        category: string;
        phone: string;
        email: string;
        instagram: string;
        facebook: string;
        whatsapp: string;
        linkedin?: string;
        notes: string;
      }>(`SELECT id, business_name, category, phone, email, instagram, facebook, whatsapp, linkedin, notes FROM leads WHERE id = $1`, [leadId]);

      if (leadRes.rows.length > 0) {
        const row = leadRes.rows[0];
        contact = {
          id: row.id,
          businessName: row.business_name,
          category: row.category,
          phone: row.phone,
          email: row.email,
          instagram: row.instagram,
          facebook: row.facebook,
          whatsapp: row.whatsapp,
          linkedin: row.linkedin,
          notes: row.notes,
        };
      }
    }

    if (!contact || !contact.businessName) {
      return res.status(400).json({ success: false, error: 'contact with businessName or valid leadId is required' });
    }

    const result = await aiResearchWriterService.researchAndWrite(
      contact,
      channel as OutreachChannel,
      customPrompt
    );

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[aiRouter.researchAndWrite]', error);
    res.status(500).json({ success: false, error: 'Failed to generate research and copy' });
  }
});

// POST /api/ai/batch-research-and-write - Bulk research + copywriter for up to 100 leads
aiRouter.post('/batch-research-and-write', async (req: Request, res: Response) => {
  try {
    const { leadIds, channel = 'email' } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds array is required' });
    }

    const { query } = await import('../config/db');
    const leadsRes = await query<{
      id: string;
      business_name: string;
      category: string;
      phone: string;
      email: string;
      instagram: string;
      facebook: string;
      whatsapp: string;
      linkedin?: string;
      notes: string;
    }>(`SELECT id, business_name, category, phone, email, instagram, facebook, whatsapp, linkedin, notes FROM leads WHERE id = ANY($1) LIMIT 100`, [leadIds.slice(0, 100)]);

    const contacts = leadsRes.rows.map((row) => ({
      id: row.id,
      businessName: row.business_name,
      category: row.category,
      phone: row.phone,
      email: row.email,
      instagram: row.instagram,
      facebook: row.facebook,
      whatsapp: row.whatsapp,
      linkedin: row.linkedin,
      notes: row.notes,
    }));

    const results = await aiResearchWriterService.batchResearchAndWrite(
      contacts,
      channel as OutreachChannel
    );

    res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('[aiRouter.batchResearchAndWrite]', error);
    res.status(500).json({ success: false, error: 'Failed to batch generate research and copy' });
  }
});

// GET /api/ai/suggestions - Live business growth recommendations & diagnostic scanner
aiRouter.get('/suggestions', async (_req: Request, res: Response) => {
  try {
    const { aiCommandService } = await import('../services/aiCommandService');
    const suggestions = await aiCommandService.getBusinessSuggestions();
    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('[aiRouter.suggestions]', error);
    res.status(500).json({ success: false, error: 'Failed to generate business suggestions' });
  }
});

// POST /api/ai/command - Natural language & 1-click action execution engine
aiRouter.post('/command', async (req: Request, res: Response) => {
  try {
    const { commandText, actionType, payload } = req.body;
    const { aiCommandService } = await import('../services/aiCommandService');
    const result = await aiCommandService.executeCommand({
      commandText: commandText || '',
      actionType,
      payload,
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('[aiRouter.command]', error);
    res.status(500).json({ success: false, error: 'Failed to execute AI command' });
  }
});

// GET /api/ai/history - Fetch past command execution history (last and older commands)
aiRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const { aiCommandService } = await import('../services/aiCommandService');
    const data = await aiCommandService.getCommandHistory(limit);
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('[aiRouter.history]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch command history' });
  }
});

// DELETE /api/ai/history - Clear command execution history
aiRouter.delete('/history', async (_req: Request, res: Response) => {
  try {
    const { aiCommandService } = await import('../services/aiCommandService');
    await aiCommandService.clearCommandHistory();
    res.json({ success: true, message: 'Command history cleared' });
  } catch (error) {
    console.error('[aiRouter.deleteHistory]', error);
    res.status(500).json({ success: false, error: 'Failed to clear command history' });
  }
});
