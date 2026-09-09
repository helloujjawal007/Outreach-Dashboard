import { Router, type Request, type Response } from 'express';
import { ollamaService } from '../services/ollamaService';

export const aiRouter = Router();

// GET /api/ai/status
aiRouter.get('/status', async (_req: Request, res: Response) => {
  const health = await ollamaService.checkHealth();
  res.json({ success: true, ...health });
});

// POST /api/ai/draft - Generate AI outreach draft
aiRouter.post('/draft', async (req: Request, res: Response) => {
  try {
    const { businessName, category, channel, intent } = req.body;

    const prompt = `Write a high-converting, personalized cold outreach message for:
Business Name: ${businessName || 'Business'}
Industry / Category: ${category || 'General'}
Channel: ${channel || 'Email'}
Goal / Offer: ${intent || 'Automated customer booking and communication solution'}

Guidelines:
- Keep it under 75 words.
- Tone should be professional, polite, and direct without pushy sales hype.
- End with an easy, low-friction call-to-action question.`;

    const result = await ollamaService.generateCompletion({ prompt });

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
