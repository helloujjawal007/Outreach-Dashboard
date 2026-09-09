import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';
import { outreachEngine } from '../services/outreachService';

export const conversationsRouter = Router();

// GET /api/conversations/by-lead/:leadId
conversationsRouter.get('/by-lead/:leadId', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const convRes = await query<{ id: string; channel: string }>(
      `SELECT c.id, c.channel FROM conversations c
       LEFT JOIN clients cl ON cl.original_lead_id = $1
       WHERE (c.entity_type = 'lead' AND c.lead_id = $1)
          OR (cl.id IS NOT NULL AND c.entity_type = 'client' AND c.client_id = cl.id)`,
      [leadId]
    );

    if (convRes.rows.length === 0) {
      return res.json({ success: true, messages: [] });
    }

    const convIds = convRes.rows.map((c) => c.id);
    const msgRes = await query(
      `SELECT m.*, c.entity_type, c.lead_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ANY($1)
       ORDER BY m.created_at ASC`,
      [convIds]
    );

    res.json({ success: true, messages: msgRes.rows });
  } catch (error) {
    console.error('[conversationsRouter.by-lead]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead messages' });
  }
});

// GET /api/conversations/by-client/:clientId
conversationsRouter.get('/by-client/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const convRes = await query<{ id: string; channel: string }>(
      `SELECT c.id, c.channel FROM conversations c
       LEFT JOIN clients cl ON cl.id = $1
       WHERE (c.entity_type = 'client' AND c.client_id = $1)
          OR (cl.original_lead_id IS NOT NULL AND c.entity_type = 'lead' AND c.lead_id = cl.original_lead_id)`,
      [clientId]
    );

    if (convRes.rows.length === 0) {
      return res.json({ success: true, messages: [] });
    }

    const convIds = convRes.rows.map((c) => c.id);
    const msgRes = await query(
      `SELECT m.*, c.entity_type, c.client_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ANY($1)
       ORDER BY m.created_at ASC`,
      [convIds]
    );

    res.json({ success: true, messages: msgRes.rows });
  } catch (error) {
    console.error('[conversationsRouter.by-client]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch client messages' });
  }
});

// POST /api/conversations/reply - Outbound message sender
conversationsRouter.post('/reply', async (req: Request, res: Response) => {
  try {
    const { leadId, clientId, channel, text } = req.body;

    if (!text || !channel) {
      return res.status(400).json({ success: false, error: 'text and channel are required' });
    }

    // A) If recipient is a COLD LEAD: Must pass through Outreach Engine rules
    if (leadId) {
      const sendResult = await outreachEngine.routeOutreachMessage({
        leadId,
        channel,
        text,
      });

      return res.json({
        success: sendResult.allowed,
        result: sendResult,
      });
    }

    // B) If recipient is a PAYING CLIENT: Direct conversation orchestrator message
    if (clientId) {
      const clientRes = await query<{ id: string; email: string; business_name: string }>(
        `SELECT id, email, business_name FROM clients WHERE id = $1`,
        [clientId]
      );

      if (clientRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      const client = clientRes.rows[0];

      // If channel is email and live SMTP is configured, dispatch the live email
      let liveDeliveryStatus = 'sent_live';
      if (channel === 'email' && client.email) {
        try {
          const { emailAdapter } = await import('../adapters/emailAdapter');
          const sendResult = await emailAdapter.sendEmail({
            clientId: client.id,
            to: client.email,
            subject: `Follow-up regarding ${client.business_name}`,
            body: text,
          });
          liveDeliveryStatus = sendResult.liveDelivery || 'sent_live';
        } catch (mailErr) {
          console.error('[conversationsRouter.reply] Error sending live email to client:', mailErr);
          liveDeliveryStatus = 'smtp_failed';
        }
      }

      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'client' AND client_id = $1 AND channel = $2 LIMIT 1`,
        [clientId, channel]
      );

      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, client_id, channel, status, last_message_at)
           VALUES ('client', $1, $2, 'open', NOW())
           RETURNING id`,
          [clientId, channel]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      // Check if message was already created by emailAdapter
      const existingMsg = await query(
        `SELECT * FROM messages WHERE conversation_id = $1 AND text = $2 AND direction = 'outbound' AND sent_at >= NOW() - INTERVAL '10 seconds'`,
        [convId, text]
      );

      let savedMsg = existingMsg.rows[0];
      if (!savedMsg) {
        const msgRes = await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
           VALUES ($1, $2, 'outbound', $3, 'sent', NOW())
           RETURNING *`,
          [convId, channel, text]
        );
        savedMsg = msgRes.rows[0];
      }

      await query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [convId]
      );

      return res.json({
        success: true,
        message: savedMsg,
        actionTaken: 'client_reply_sent',
        liveDelivery: liveDeliveryStatus,
      });
    }

    res.status(400).json({ success: false, error: 'Either leadId or clientId must be provided' });
  } catch (error) {
    console.error('[conversationsRouter.reply]', error);
    res.status(500).json({ success: false, error: 'Failed to dispatch reply' });
  }
});

// POST /api/conversations/inbound - Simulate inbound message (Webhook or tester)
conversationsRouter.post('/inbound', async (req: Request, res: Response) => {
  try {
    const { leadId, channel, text } = req.body;

    if (!leadId || !channel || !text) {
      return res.status(400).json({ success: false, error: 'leadId, channel, and text are required' });
    }

    // 1. Process suppression / consent evaluation in Outreach Engine
    const evalResult = await outreachEngine.handleInboundLeadMessage(leadId, text);

    // 2. Locate or create conversation thread (aware of client conversion)
    let convId: string;
    const clientId = evalResult.clientConversion?.clientId;

    if (clientId) {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'client' AND client_id = $1 AND channel = $2 LIMIT 1`,
        [clientId, channel]
      );
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, client_id, channel, status, last_message_at)
           VALUES ('client', $1, $2, 'open', NOW())
           RETURNING id`,
          [clientId, channel]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }
    } else {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = $2 LIMIT 1`,
        [leadId, channel]
      );
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
           VALUES ('lead', $1, $2, 'open', NOW())
           RETURNING id`,
          [leadId, channel]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }
    }

    // 3. Record incoming message
    const msgRes = await query(
      `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
       VALUES ($1, $2, 'inbound', $3, 'delivered', NOW())
       RETURNING *`,
      [convId, channel, text]
    );

    // 4. Return result with client conversion details (Phase 5)
    res.json({
      success: true,
      inboundMessage: msgRes.rows[0],
      isOptOut: evalResult.isOptOut,
      leadConsentStatus: evalResult.newStatus,
      clientConversion: evalResult.clientConversion || null,
    });
  } catch (error) {
    console.error('[conversationsRouter.inbound]', error);
    res.status(500).json({ success: false, error: 'Failed to process inbound message' });
  }
});

// GET /api/conversations/stage/:leadId - Inspect current stage condition and preview next message
conversationsRouter.get('/stage/:leadId', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.leadId) ? req.params.leadId[0] : req.params.leadId;
    const { stageOutreachService } = await import('../services/stageOutreachService');
    const stageInfo = await stageOutreachService.getLeadStage(id);
    res.json({ success: true, stageInfo, ...stageInfo });
  } catch (error) {
    console.error('[conversationsRouter.stage]', error);
    res.status(500).json({ success: false, error: 'Failed to inspect lead stage' });
  }
});

// POST /api/conversations/auto-send-next - Automatically send appropriate stage email (Single or Bulk)
conversationsRouter.post('/auto-send-next', async (req: Request, res: Response) => {
  try {
    const { leadId, leadIds } = req.body;
    const { stageOutreachService } = await import('../services/stageOutreachService');

    if (leadId && typeof leadId === 'string') {
      const result = await stageOutreachService.sendNextStageToLead(leadId);
      return res.json({ success: true, result });
    }

    if (Array.isArray(leadIds) && leadIds.length > 0) {
      const result = await stageOutreachService.sendBulkNextStage(leadIds);
      return res.json({ success: true, ...result });
    }

    res.status(400).json({ success: false, error: 'Either leadId or leadIds array must be provided' });
  } catch (error) {
    console.error('[conversationsRouter.autoSendNext]', error);
    res.status(500).json({ success: false, error: 'Failed to auto-send next stage email' });
  }
});

// POST /api/conversations/sync-inbox - Manually synchronize Gmail IMAP inbox replies
conversationsRouter.post('/sync-inbox', async (_req: Request, res: Response) => {
  try {
    const { emailInboundService } = await import('../services/emailInboundService');
    const result = await emailInboundService.syncInboundEmails();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[conversationsRouter.sync-inbox]', error);
    res.status(500).json({ success: false, error: 'Failed to sync inbound emails' });
  }
});

// GET /api/conversations/sync-inbox
conversationsRouter.get('/sync-inbox', async (_req: Request, res: Response) => {
  try {
    const { emailInboundService } = await import('../services/emailInboundService');
    const result = await emailInboundService.syncInboundEmails();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[conversationsRouter.sync-inbox]', error);
    res.status(500).json({ success: false, error: 'Failed to sync inbound emails' });
  }
});

// GET /api/conversations/inbound-replies - Fetch all inbound replies across leads & clients
conversationsRouter.get('/inbound-replies', async (req: Request, res: Response) => {
  try {
    const channel = req.query.channel as string;
    let sql = `
      SELECT 
        m.id,
        m.conversation_id,
        m.channel,
        m.direction,
        m.text,
        m.sent_at,
        m.status,
        c.entity_type,
        c.lead_id,
        c.client_id,
        COALESCE(l.business_name, cl.business_name, 'Unknown') AS business_name,
        COALESCE(l.email, cl.email, '') AS email,
        COALESCE(l.phone, cl.phone, '') AS phone,
        COALESCE(l.category, cl.category, '') AS category,
        COALESCE(l.status, cl.status, 'active') AS entity_status,
        COALESCE(l.consent_status, 'replied') AS consent_status
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN leads l ON l.id = c.lead_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE m.direction = 'inbound'
    `;
    const params: any[] = [];
    if (channel && channel !== 'all') {
      params.push(channel);
      sql += ` AND m.channel = $1`;
    }
    sql += ` ORDER BY m.sent_at DESC LIMIT 100`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, replies: result.rows });
  } catch (error) {
    console.error('[conversationsRouter.inbound-replies]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inbound replies' });
  }
});


