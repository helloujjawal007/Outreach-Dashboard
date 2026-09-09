import { Router, type Request, type Response } from 'express';
import { emailAdapter } from '../adapters/emailAdapter';
import { whatsappAdapter } from '../adapters/whatsappAdapter';

export const adaptersRouter = Router();

// GET /api/adapters/email/warmup - Get warm-up status, daily limits & DNS records
adaptersRouter.get('/email/warmup', async (_req: Request, res: Response) => {
  try {
    const status = await emailAdapter.getWarmupStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error('[adaptersRouter.email.warmup]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email warm-up status' });
  }
});

// POST /api/adapters/email/subdomain - Configure sending subdomain
adaptersRouter.post('/email/subdomain', (req: Request, res: Response) => {
  const { subdomain } = req.body;
  if (!subdomain) {
    return res.status(400).json({ success: false, error: 'subdomain is required' });
  }
  emailAdapter.setSubdomain(subdomain);
  res.json({ success: true, message: `Sending subdomain set to ${subdomain}` });
});

// POST /api/adapters/email/stage - Set warm-up stage (1-5)
adaptersRouter.post('/email/stage', async (req: Request, res: Response) => {
  const { stage } = req.body;
  if (typeof stage !== 'number' || stage < 1 || stage > 5) {
    return res.status(400).json({ success: false, error: 'stage must be a number between 1 and 5' });
  }
  emailAdapter.setWarmupStage(stage);
  const status = await emailAdapter.getWarmupStatus();
  res.json({ success: true, status });
});

// GET /api/adapters/whatsapp/window/:id - Check 24-hour window status for a contact
adaptersRouter.get('/whatsapp/window/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { isClient } = req.query;
    const status = await whatsappAdapter.check24HourWindow(id, isClient === 'true');
    res.json({ success: true, status });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.window]', error);
    res.status(500).json({ success: false, error: 'Failed to inspect WhatsApp window' });
  }
});

// POST /api/adapters/whatsapp/webhook - Simulate or receive WhatsApp Cloud API webhook
adaptersRouter.post('/whatsapp/webhook', async (req: Request, res: Response) => {
  try {
    const { fromPhone, text, messageId } = req.body;
    if (!fromPhone || !text) {
      return res.status(400).json({ success: false, error: 'fromPhone and text are required' });
    }

    const result = await whatsappAdapter.handleInboundWebhook({
      fromPhone,
      text,
      externalMessageId: messageId,
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.webhook]', error);
    res.status(500).json({ success: false, error: 'Failed to process WhatsApp webhook' });
  }
});
