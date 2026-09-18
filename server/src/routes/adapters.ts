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

// GET /api/adapters/whatsapp/session-status - Get live WhatsApp Web / Baileys socket state & QR/pairing code
adaptersRouter.get('/whatsapp/session-status', async (_req: Request, res: Response) => {
  try {
    const { whatsappSessionService } = await import('../services/whatsappSessionService');
    const state = whatsappSessionService.getState();
    res.json({
      success: true,
      ...state,
      isConnected: state.status === 'connected',
      hasSavedSession: whatsappSessionService.hasSavedSession(),
    });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.session-status]', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve WhatsApp session status' });
  }
});

// POST /api/adapters/whatsapp/start-session - Start or wake WhatsApp socket to generate QR
adaptersRouter.post('/whatsapp/start-session', async (_req: Request, res: Response) => {
  try {
    const { whatsappSessionService } = await import('../services/whatsappSessionService');
    const state = await whatsappSessionService.startSession();
    
    // If not immediately qr_ready, wait up to 2 seconds to capture initial QR code
    if (state.status === 'connecting' && !state.qrCodeDataUrl) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const updatedState = whatsappSessionService.getState();
    res.json({
      success: true,
      ...updatedState,
      isConnected: updatedState.status === 'connected',
      hasSavedSession: whatsappSessionService.hasSavedSession(),
    });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.start-session]', error);
    res.status(500).json({ success: false, error: 'Failed to initialize WhatsApp session' });
  }
});

// POST /api/adapters/whatsapp/request-pairing - Request an 8-character pairing code by phone number
adaptersRouter.post('/whatsapp/request-pairing', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'phoneNumber is required' });
    }

    const { whatsappSessionService } = await import('../services/whatsappSessionService');
    const result = await whatsappSessionService.requestPairingCode(phoneNumber);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      pairingCode: result.code,
      message: `Pairing code generated. On your WhatsApp mobile app, tap Linked Devices > Link with phone number instead, and enter this code.`,
    });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.request-pairing]', error);
    res.status(500).json({ success: false, error: 'Failed to generate WhatsApp pairing code' });
  }
});

// POST /api/adapters/whatsapp/disconnect - Disconnect & remove WhatsApp credentials
adaptersRouter.post('/whatsapp/disconnect', async (_req: Request, res: Response) => {
  try {
    const { whatsappSessionService } = await import('../services/whatsappSessionService');
    await whatsappSessionService.disconnect();
    res.json({ success: true, message: 'WhatsApp session disconnected and removed' });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.disconnect]', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect WhatsApp session' });
  }
});

// POST /api/adapters/whatsapp/send-direct - Send a single direct message via active WhatsApp session
adaptersRouter.post('/whatsapp/send-direct', async (req: Request, res: Response) => {
  try {
    const { recipientPhone, text, leadId } = req.body;
    if (!recipientPhone || !text) {
      return res.status(400).json({ success: false, error: 'recipientPhone and text are required' });
    }

    const { whatsappSessionService } = await import('../services/whatsappSessionService');
    const result = await whatsappSessionService.sendMessage(recipientPhone, text);

    if (!result.success) {
      if (leadId) {
        const { query } = await import('../config/db');
        await query(
          `UPDATE leads 
           SET status = 'manual_review', 
               manual_review_reason = $1, 
               manual_review_at = NOW(), 
               updated_at = NOW() 
           WHERE id = $2`,
          [`WhatsApp Delivery Failed: ${result.error}`, leadId]
        );
      }
      return res.status(400).json({ success: false, error: result.error });
    }

    // If leadId is provided, record into database conversation & message
    if (leadId) {
      const { query } = await import('../config/db');
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp' LIMIT 1`,
        [leadId]
      );
      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
           VALUES ('lead', $1, 'whatsapp', 'open', NOW()) RETURNING id`,
          [leadId]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      await query(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
         VALUES ($1, 'whatsapp', 'outbound', $2, 'delivered', $3, NOW())`,
        [convId, text, result.messageId || '']
      );

      await query(
        `UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`,
        [convId]
      );

      await query(
        `UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [leadId]
      );

      await query(
        `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
         VALUES (CURRENT_DATE, 'whatsapp', 1, NOW())
         ON CONFLICT (metric_date, channel)
         DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`,
        []
      );
    }

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error('[adaptersRouter.whatsapp.send-direct]', error);
    res.status(500).json({ success: false, error: 'Failed to send direct WhatsApp message' });
  }
});
