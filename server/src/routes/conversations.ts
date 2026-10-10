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
       LEFT JOIN leads l ON l.id = $1
       LEFT JOIN clients cl ON cl.original_lead_id = $1
       WHERE (l.id IS NULL OR l.deleted_at IS NULL)
         AND ((c.entity_type = 'lead' AND c.lead_id = $1)
           OR (cl.id IS NOT NULL AND cl.deleted_at IS NULL AND c.entity_type = 'client' AND c.client_id = cl.id))`,
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

      if (sendResult.allowed) {
        // For draft queue channels (Instagram, Facebook, LinkedIn), record outbound message in thread
        if (channel === 'instagram' || channel === 'facebook' || channel === 'linkedin') {
          const convRes = await query<{ id: string }>(
            `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = $2 LIMIT 1`,
            [leadId, channel]
          );
          let convId: string;
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
            await query(`UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, [convId]);
          }

          await query(
            `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, is_read)
             VALUES ($1, $2, 'outbound', $3, 'sent', NOW(), true)`,
            [convId, channel, text]
          );
        }

        // Mark all preceding inbound messages for this lead as replied, seen, and read
        await query(
          `UPDATE messages m
           SET is_replied = true, replied_at = NOW(),
               is_seen = true, seen_at = COALESCE(seen_at, NOW()),
               is_read = true, read_at = COALESCE(read_at, NOW())
           FROM conversations c
           WHERE m.conversation_id = c.id
             AND c.entity_type = 'lead' AND c.lead_id = $1
             AND m.direction = 'inbound'
             AND (m.is_replied IS NOT TRUE OR m.is_seen IS NOT TRUE OR m.is_read IS NOT TRUE)`,
          [leadId]
        );
      }

      // If requested, also simultaneously submit outreach text via the lead's website contact form
      if (req.body.alsoSubmitWebsiteForm && leadId) {
        import('../services/websiteFormService').then(({ websiteFormService }) => {
          websiteFormService
            .submitContactForm(leadId, {
              subject: `Inquiry via ${channel.toUpperCase()}`,
              message: text,
            })
            .catch((err) => console.warn('[sendReply alsoSubmitWebsiteForm warning]:', err));
        });
      }

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

      // Mark all preceding inbound messages in this client conversation as replied, seen, and read
      await query(
        `UPDATE messages
         SET is_replied = true, replied_at = NOW(),
             is_seen = true, seen_at = COALESCE(seen_at, NOW()),
             is_read = true, read_at = COALESCE(read_at, NOW())
         WHERE conversation_id = $1 AND direction = 'inbound' AND (is_replied IS NOT TRUE OR is_seen IS NOT TRUE OR is_read IS NOT TRUE)`,
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
    const inboxEmail = channel === 'email' ? 'team.onlinedigitalsolution@gmail.com' : '';
    const msgRes = await query<{ id: string }>(
      `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, inbox_email, is_read)
       VALUES ($1, $2, 'inbound', $3, 'delivered', NOW(), $4, false)
       RETURNING *`,
      [convId, channel, text, inboxEmail]
    );

    // Extreme Automation: Autonomous Inbound Agent (Sentiment, Auto-Draft & Hot Lead Auto-Conversion)
    let agentResult: any = null;
    try {
      const { autonomousInboundAgent } = await import('../services/autonomousInboundAgent');
      agentResult = await autonomousInboundAgent.processInboundMessage({
        messageId: msgRes.rows[0].id,
        conversationId: convId,
        entityType: clientId ? 'client' : 'lead',
        entityId: clientId || leadId,
        subject: 'Inbound Message',
        replyText: text,
      });
    } catch (agentErr) {
      console.error('[conversationsRouter] Inbound agent warning:', agentErr);
    }

    // 4. Return result with client conversion details (Phase 5)
    res.json({
      success: true,
      inboundMessage: msgRes.rows[0],
      isOptOut: evalResult.isOptOut,
      leadConsentStatus: evalResult.newStatus,
      clientConversion: evalResult.clientConversion || null,
      autonomousAgent: agentResult,
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

// GET /api/conversations/recent-messages - Fetch all recent messages across all channels (WA, Email, FB, IG)
conversationsRouter.get('/recent-messages', async (req: Request, res: Response) => {
  try {
    const channel = req.query.channel as string;
    const direction = req.query.direction as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 150;

    let sql = `
      SELECT 
        m.id,
        m.conversation_id,
        m.channel,
        m.direction,
        m.text,
        m.sent_at,
        m.status,
        COALESCE(m.is_seen, false) AS is_seen,
        m.seen_at,
        COALESCE(m.is_read, false) AS is_read,
        m.read_at,
        COALESCE(m.is_replied, false) AS is_replied,
        m.replied_at,
        m.inbox_email,
        m.metadata,
        m.inbound_intent,
        m.inbound_intent_confidence,
        m.ai_suggested_reply,
        c.entity_type,
        c.lead_id,
        c.client_id,
        COALESCE(l.business_name, cl.business_name, 'Unknown') AS business_name,
        COALESCE(l.email, cl.email, '') AS email,
        COALESCE(l.phone, cl.phone, '') AS phone,
        COALESCE(l.whatsapp, cl.whatsapp, '') AS whatsapp,
        COALESCE(l.facebook, cl.facebook, '') AS facebook,
        COALESCE(l.instagram, cl.instagram, '') AS instagram,
        COALESCE(l.category, cl.category, '') AS category,
        COALESCE(l.status, cl.status, 'active') AS entity_status,
        COALESCE(l.consent_status, 'none') AS consent_status
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN leads l ON l.id = c.lead_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE 1=1
        AND (
          (c.entity_type = 'lead' AND l.id IS NOT NULL AND l.deleted_at IS NULL)
          OR
          (c.entity_type = 'client' AND cl.id IS NOT NULL AND cl.deleted_at IS NULL)
        )
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (channel && channel !== 'all') {
      params.push(channel);
      sql += ` AND m.channel = $${paramIdx++}`;
    }

    if (direction && direction !== 'all') {
      params.push(direction);
      sql += ` AND m.direction = $${paramIdx++}`;
    }

    sql += ` ORDER BY m.sent_at DESC LIMIT $${paramIdx++}`;
    params.push(limit);

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, messages: result.rows });
  } catch (error) {
    console.error('[conversationsRouter.recent-messages]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent messages' });
  }
});

// GET /api/conversations/inbound-replies - Fetch inbound replies (defaults to pending/unhandled)
conversationsRouter.get('/inbound-replies', async (req: Request, res: Response) => {
  try {
    const channel = req.query.channel as string;
    const direction = req.query.direction as string;
    const status = (req.query.status as string) || 'pending'; // 'pending' | 'handled' | 'all'
    const includeHandled = req.query.includeHandled === 'true' || status === 'all';

    let sql = `
      SELECT 
        m.id,
        m.conversation_id,
        m.channel,
        m.direction,
        m.text,
        m.sent_at,
        m.status,
        COALESCE(m.is_seen, false) AS is_seen,
        m.seen_at,
        COALESCE(m.is_read, false) AS is_read,
        m.read_at,
        COALESCE(m.is_replied, false) AS is_replied,
        m.replied_at,
        m.inbox_email,
        m.metadata,
        m.inbound_intent,
        m.inbound_intent_confidence,
        m.ai_suggested_reply,
        c.entity_type,
        c.lead_id,
        c.client_id,
        COALESCE(l.business_name, cl.business_name, 'Unknown') AS business_name,
        COALESCE(l.email, cl.email, '') AS email,
        COALESCE(l.phone, cl.phone, '') AS phone,
        COALESCE(l.whatsapp, cl.whatsapp, '') AS whatsapp,
        COALESCE(l.facebook, cl.facebook, '') AS facebook,
        COALESCE(l.instagram, cl.instagram, '') AS instagram,
        COALESCE(l.category, cl.category, '') AS category,
        COALESCE(l.status, cl.status, 'active') AS entity_status,
        COALESCE(l.consent_status, 'replied') AS consent_status
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN leads l ON l.id = c.lead_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE 1=1
        AND (
          (c.entity_type = 'lead' AND l.id IS NOT NULL AND l.deleted_at IS NULL)
          OR
          (c.entity_type = 'client' AND cl.id IS NOT NULL AND cl.deleted_at IS NULL)
        )
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (direction && direction !== 'all') {
      params.push(direction);
      sql += ` AND m.direction = $${paramIdx++}`;
    } else if (!direction) {
      sql += ` AND m.direction = 'inbound'`;
    }

    if (channel && channel !== 'all') {
      params.push(channel);
      sql += ` AND m.channel = $${paramIdx++}`;
    }

    if (!includeHandled) {
      if (status === 'handled') {
        sql += ` AND (m.is_replied IS TRUE OR m.is_read IS TRUE OR m.is_seen IS TRUE OR EXISTS (
          SELECT 1 FROM messages out_m 
          WHERE out_m.conversation_id = m.conversation_id 
            AND out_m.direction = 'outbound' 
            AND out_m.sent_at >= m.sent_at
        ))`;
      } else {
        // Pending queue: Not replied, not read, and no outbound reply sent after this inbound message
        sql += ` AND COALESCE(m.is_replied, false) = false 
                 AND COALESCE(m.is_read, false) = false
                 AND NOT EXISTS (
                   SELECT 1 FROM messages out_m 
                   WHERE out_m.conversation_id = m.conversation_id 
                     AND out_m.direction = 'outbound' 
                     AND out_m.sent_at >= m.sent_at
                 )`;
      }
    }

    sql += ` ORDER BY m.sent_at DESC LIMIT 100`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, replies: result.rows });
  } catch (error) {
    console.error('[conversationsRouter.inbound-replies]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inbound replies' });
  }
});

// POST /api/conversations/messages/:id/read - Mark individual message as read or unread
conversationsRouter.post('/messages/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isRead = req.body.isRead !== false;

    const result = await query(
      `UPDATE messages
       SET is_read = $1, read_at = CASE WHEN $1 THEN COALESCE(read_at, NOW()) ELSE NULL END,
           is_seen = CASE WHEN $1 THEN true ELSE is_seen END,
           seen_at = CASE WHEN $1 THEN COALESCE(seen_at, NOW()) ELSE seen_at END
       WHERE id = $2
       RETURNING *`,
      [isRead, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, message: result.rows[0], isRead });
  } catch (error) {
    console.error('[conversationsRouter.messages.read]', error);
    res.status(500).json({ success: false, error: 'Failed to update message read status' });
  }
});

// POST /api/conversations/messages/:id/unread - Mark individual message as unread
conversationsRouter.post('/messages/:id/unread', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE messages
       SET is_read = false, read_at = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, message: result.rows[0], isRead: false });
  } catch (error) {
    console.error('[conversationsRouter.messages.unread]', error);
    res.status(500).json({ success: false, error: 'Failed to mark message as unread' });
  }
});

// POST /api/conversations/entity/:entityType/:id/read - Mark all inbound messages for a lead or client as read
conversationsRouter.post('/entity/:entityType/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isRead = req.body.isRead !== false;

    await query(
      `UPDATE messages m
       SET is_read = $1, read_at = CASE WHEN $1 THEN COALESCE(read_at, NOW()) ELSE NULL END,
           is_seen = CASE WHEN $1 THEN true ELSE is_seen END,
           seen_at = CASE WHEN $1 THEN COALESCE(seen_at, NOW()) ELSE seen_at END
       FROM conversations c
       WHERE m.conversation_id = c.id
         AND (
           (c.entity_type = 'lead' AND c.lead_id = $2)
           OR (c.entity_type = 'client' AND c.client_id = $2)
         )
         AND m.direction = 'inbound'`,
      [isRead, id]
    );

    res.json({ success: true, message: `Inbound messages marked as ${isRead ? 'read' : 'unread'}` });
  } catch (error) {
    console.error('[conversationsRouter.entity.read]', error);
    res.status(500).json({ success: false, error: 'Failed to mark entity messages as read' });
  }
});

// POST /api/conversations/inbound-replies/:id/seen - Mark an inbound message as seen
conversationsRouter.post('/inbound-replies/:id/seen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE messages
       SET is_seen = true, seen_at = COALESCE(seen_at, NOW())
       WHERE id = $1 AND direction = 'inbound'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inbound message not found' });
    }

    res.json({ success: true, message: result.rows[0] });
  } catch (error) {
    console.error('[conversationsRouter.inbound-replies.seen]', error);
    res.status(500).json({ success: false, error: 'Failed to mark message as seen' });
  }
});

// POST /api/conversations/inbound-replies/:id/handled - Mark an inbound message as seen, read & resolved
conversationsRouter.post('/inbound-replies/:id/handled', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE messages
       SET is_seen = true, seen_at = COALESCE(seen_at, NOW()),
           is_read = true, read_at = COALESCE(read_at, NOW()),
           is_replied = true, replied_at = COALESCE(replied_at, NOW())
       WHERE id = $1 AND direction = 'inbound'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inbound message not found' });
    }

    res.json({ success: true, message: result.rows[0] });
  } catch (error) {
    console.error('[conversationsRouter.inbound-replies.handled]', error);
    res.status(500).json({ success: false, error: 'Failed to mark message as handled' });
  }
});

// POST /api/conversations/entity/:entityType/:id/seen - Mark all inbound messages for a lead/client as seen
conversationsRouter.post('/entity/:entityType/:id/seen', async (req: Request, res: Response) => {
  try {
    const { entityType, id } = req.params;
    if (entityType !== 'lead' && entityType !== 'client') {
      return res.status(400).json({ success: false, error: 'entityType must be lead or client' });
    }

    await query(
      `UPDATE messages m
       SET is_seen = true, seen_at = COALESCE(seen_at, NOW())
       FROM conversations c
       WHERE m.conversation_id = c.id
         AND (
           (c.entity_type = 'lead' AND c.lead_id = $1)
           OR (c.entity_type = 'client' AND c.client_id = $1)
         )
         AND m.direction = 'inbound'
         AND (m.is_seen IS NOT TRUE)`,
      [id]
    );

    res.json({ success: true, message: 'All inbound messages marked as seen' });
  } catch (error) {
    console.error('[conversationsRouter.entity.seen]', error);
    res.status(500).json({ success: false, error: 'Failed to mark entity messages as seen' });
  }
});

// POST /api/conversations/batch-shoot - High-speed multi-channel shooter (up to 100 leads/batch)
conversationsRouter.post('/batch-shoot', async (req: Request, res: Response) => {
  try {
    const {
      channel,
      leadIds,
      messages = {},
      intervalSeconds = 0,
    } = req.body;

    if (!channel || !['email', 'whatsapp', 'facebook', 'instagram', 'website_form'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'Valid channel is required (email, whatsapp, facebook, instagram, website_form)' });
    }

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds array is required' });
    }

    const targetIds = leadIds.slice(0, 100);

    const leadsRes = await query<{
      id: string;
      business_name: string;
      category: string;
      phone: string;
      email: string;
      instagram: string;
      facebook: string;
      whatsapp: string;
      consent_status: string;
      notes: string;
      whatsapp_eligible: boolean | null;
      whatsapp_decision_reason: string;
    }>(`SELECT * FROM leads WHERE id = ANY($1) AND deleted_at IS NULL`, [targetIds]);

    const { whatsappValidator } = await import('../services/whatsappValidator');
    const { facebookAdapter } = await import('../adapters/facebookAdapter');
    const { instagramAdapter } = await import('../adapters/instagramAdapter');
    const { emailAdapter } = await import('../adapters/emailAdapter');
    const { aiResearchWriterService } = await import('../services/aiResearchWriterService');

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const results: Array<{
      leadId: string;
      businessName: string;
      channel: string;
      success: boolean;
      status: 'sent' | 'queued' | 'skipped' | 'failed';
      reason?: string;
      deepLink?: string;
      messagePreview?: string;
    }> = [];

    for (const lead of leadsRes.rows) {
      // 1. Consent check
      if (lead.consent_status === 'opted_out') {
        skippedCount++;
        results.push({
          leadId: lead.id,
          businessName: lead.business_name,
          channel,
          success: false,
          status: 'skipped',
          reason: 'Lead has explicitly opted out',
        });
        continue;
      }

      // 2. Determine or generate copy
      let msgObj = messages[lead.id];
      if (!msgObj || !msgObj.body) {
        const generated = await aiResearchWriterService.researchAndWrite(
          {
            businessName: lead.business_name,
            category: lead.category,
            phone: lead.phone,
            email: lead.email,
            instagram: lead.instagram,
            facebook: lead.facebook,
            notes: lead.notes,
          },
          channel as 'email' | 'whatsapp' | 'facebook' | 'instagram'
        );
        msgObj = { subject: generated.subject, body: generated.body };
      }

      const bodyText = msgObj.body;
      const subjectText = msgObj.subject || `Quick question regarding ${lead.business_name}`;

      // 3. Channel dispatch logic
      if (channel === 'email') {
        if (!lead.email || !lead.email.includes('@')) {
          skippedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'email',
            success: false,
            status: 'skipped',
            reason: 'No valid email address available',
          });
          continue;
        }

        const emailSend = await emailAdapter.sendEmail({
          to: lead.email,
          subject: subjectText,
          body: bodyText,
          leadId: lead.id,
        });

        if (emailSend.success) {
          sentCount++;
          await query(
            `UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [lead.id]
          );

          // Dual-Trigger: submit to website form if available
          try {
            const { websiteFormService } = await import('../services/websiteFormService');
            await websiteFormService.submitContactForm(lead.id, {
              senderName: 'Online Digital Solution',
              senderEmail: 'team.onlinedigitalsolution@gmail.com',
              subject: subjectText,
              message: bodyText,
            });
          } catch (fErr: any) {
            console.warn(`[conversationsRouter.sendMessage] Website form skipped for ${lead.id}:`, fErr?.message);
          }

          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'email',
            success: true,
            status: 'sent',
            messagePreview: bodyText,
          });
        } else {
          failedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'email',
            success: false,
            status: 'failed',
            reason: emailSend.reason || 'SMTP delivery failed',
          });
        }
      } else if (channel === 'whatsapp') {
        // Evaluate eligibility with WhatsApp Decision Engine
        const waEval = whatsappValidator.evaluate({ phone: lead.phone, whatsapp: lead.whatsapp });
        if (!waEval.isEligible) {
          skippedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'whatsapp',
            success: false,
            status: 'skipped',
            reason: waEval.reason,
          });
          continue;
        }

        const waDeepLink = whatsappValidator.buildWhatsAppUrl(waEval.cleanNumber, bodyText);

        // Check if live WhatsApp session is linked and connected
        const { whatsappSessionService } = await import('../services/whatsappSessionService');
        const sessionState = whatsappSessionService.getState();
        const isSessionConnected = sessionState.status === 'connected';

        if (!isSessionConnected) {
          failedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'whatsapp',
            success: false,
            status: 'failed',
            reason: 'WhatsApp phone is not linked or disconnected. Link your phone first.',
            deepLink: waDeepLink,
            messagePreview: bodyText,
          });
          continue;
        }

        const sendResult = await whatsappSessionService.sendMessage(waEval.cleanNumber, bodyText);
        if (!sendResult.success) {
          const isNotRegistered = sendResult.error?.includes('not registered on WhatsApp');
          if (isNotRegistered) {
            skippedCount++;
            results.push({
              leadId: lead.id,
              businessName: lead.business_name,
              channel: 'whatsapp',
              success: false,
              status: 'skipped',
              reason: sendResult.error,
              deepLink: waDeepLink,
              messagePreview: bodyText,
            });
          } else {
            failedCount++;
            results.push({
              leadId: lead.id,
              businessName: lead.business_name,
              channel: 'whatsapp',
              success: false,
              status: 'failed',
              reason: sendResult.error || 'Direct WhatsApp dispatch failed',
              deepLink: waDeepLink,
              messagePreview: bodyText,
            });
          }
          continue;
        }

        sentCount++;
        const directMessageId = sendResult.messageId;

        // Record message draft & conversation thread
        const convRes = await query<{ id: string }>(
          `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp' LIMIT 1`,
          [lead.id]
        );
        let convId: string;
        if (convRes.rows.length === 0) {
          const newConv = await query<{ id: string }>(
            `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
             VALUES ('lead', $1, 'whatsapp', 'open', NOW()) RETURNING id`,
            [lead.id]
          );
          convId = newConv.rows[0].id;
        } else {
          convId = convRes.rows[0].id;
        }

        await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
           VALUES ($1, 'whatsapp', 'outbound', $2, 'delivered', $3, NOW())`,
          [convId, bodyText, directMessageId || '']
        );

        await query(
          `UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`,
          [convId]
        );

        await query(
          `UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [lead.id]
        );

        // Record daily metric
        await query(
          `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
           VALUES (CURRENT_DATE, 'whatsapp', 1, NOW())
           ON CONFLICT (metric_date, channel)
           DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`,
          []
        );

        results.push({
          leadId: lead.id,
          businessName: lead.business_name,
          channel: 'whatsapp',
          success: true,
          status: 'sent',
          reason: `Directly sent via linked WhatsApp (${sessionState.phoneNumber || 'device'})`,
          deepLink: waDeepLink,
          messagePreview: bodyText,
        });
      } else if (channel === 'facebook') {
        const profile = (lead.facebook || '').trim();
        if (!profile) {
          skippedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'facebook',
            success: false,
            status: 'skipped',
            reason: 'No Facebook profile or page configured',
          });
          continue;
        }

        const fbDraft = await facebookAdapter.enqueueDraft({
          leadId: lead.id,
          profileOrPage: profile,
          text: bodyText,
        });

        // Record message in conversation thread
        const convRes = await query<{ id: string }>(
          `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'facebook' LIMIT 1`,
          [lead.id]
        );
        let convId: string;
        if (convRes.rows.length === 0) {
          const newConv = await query<{ id: string }>(
            `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
             VALUES ('lead', $1, 'facebook', 'open', NOW()) RETURNING id`,
            [lead.id]
          );
          convId = newConv.rows[0].id;
        } else {
          convId = convRes.rows[0].id;
        }

        await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
           VALUES ($1, 'facebook', 'outbound', $2, 'queued', $3, NOW())`,
          [convId, bodyText, fbDraft.queueId]
        );

        await query(
          `UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`,
          [convId]
        );

        await query(
          `UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [lead.id]
        );

        sentCount++;
        results.push({
          leadId: lead.id,
          businessName: lead.business_name,
          channel: 'facebook',
          success: true,
          status: 'queued',
          deepLink: fbDraft.deepLink,
          messagePreview: bodyText,
        });
      } else if (channel === 'instagram') {
        const handle = (lead.instagram || '').trim();
        if (!handle) {
          skippedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'instagram',
            success: false,
            status: 'skipped',
            reason: 'No Instagram handle configured',
          });
          continue;
        }

        const igDraft = await instagramAdapter.enqueueDraft({
          leadId: lead.id,
          handle,
          text: bodyText,
        });

        // Record message in conversation thread
        const convRes = await query<{ id: string }>(
          `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'instagram' LIMIT 1`,
          [lead.id]
        );
        let convId: string;
        if (convRes.rows.length === 0) {
          const newConv = await query<{ id: string }>(
            `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
             VALUES ('lead', $1, 'instagram', 'open', NOW()) RETURNING id`,
            [lead.id]
          );
          convId = newConv.rows[0].id;
        } else {
          convId = convRes.rows[0].id;
        }

        await query(
          `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
           VALUES ($1, 'instagram', 'outbound', $2, 'queued', $3, NOW())`,
          [convId, bodyText, igDraft.queueId]
        );

        await query(
          `UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`,
          [convId]
        );

        await query(
          `UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [lead.id]
        );

        sentCount++;
        results.push({
          leadId: lead.id,
          businessName: lead.business_name,
          channel: 'instagram',
          success: true,
          status: 'queued',
          deepLink: igDraft.deepLink,
          messagePreview: bodyText,
        });
      } else if (channel === 'website_form') {
        const { websiteFormService } = await import('../services/websiteFormService');
        const formResult = await websiteFormService.submitContactForm(lead.id, {
          subject: subjectText || `Inquiry for ${lead.business_name}`,
          message: bodyText,
        });

        if (formResult.skipped) {
          skippedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'website_form',
            success: false,
            status: 'skipped',
            reason: formResult.reason || 'No contact form on website (skipped)',
          });
          continue;
        } else if (!formResult.success) {
          failedCount++;
          results.push({
            leadId: lead.id,
            businessName: lead.business_name,
            channel: 'website_form',
            success: false,
            status: 'failed',
            reason: formResult.reason || 'Website contact form submission failed',
            deepLink: formResult.directLauncherUrl,
            messagePreview: bodyText,
          });
          continue;
        }

        sentCount++;
        results.push({
          leadId: lead.id,
          businessName: lead.business_name,
          channel: 'website_form',
          success: true,
          status: 'sent',
          reason: formResult.reason,
          deepLink: formResult.directLauncherUrl,
          messagePreview: bodyText,
        });
      }

      // If requested, also simultaneously submit outreach text via the lead's website contact form
      if (req.body.alsoSubmitWebsiteForm && channel !== 'website_form') {
        const { websiteFormService } = await import('../services/websiteFormService');
        websiteFormService
          .submitContactForm(lead.id, {
            subject: subjectText || `Inquiry for ${lead.business_name}`,
            message: bodyText,
          })
          .catch((err) => console.warn(`[Batch alsoSubmitWebsiteForm warning for ${lead.id}]:`, err));
      }

      // Anti-ban delay interval if specified
      if (intervalSeconds > 0 && intervalSeconds <= 15) {
        await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
      }
    }

    res.json({
      success: true,
      channel,
      totalProcessed: leadsRes.rows.length,
      sentCount,
      skippedCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error('[conversationsRouter.batchShoot]', error);
    res.status(500).json({ success: false, error: 'Batch shoot failed' });
  }
});

// POST /api/conversations/submit-website-form - Directly submit outreach message to a lead's website contact form
conversationsRouter.post('/submit-website-form', async (req: Request, res: Response) => {
  try {
    const { leadId, senderName, senderEmail, senderPhone, subject, message } = req.body;
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message content is required' });
    }

    const { websiteFormService } = await import('../services/websiteFormService');
    const result = await websiteFormService.submitContactForm(leadId, {
      senderName,
      senderEmail,
      senderPhone,
      subject,
      message: message.trim(),
    });

    res.json({
      success: result.success,
      result,
      message: result.reason || (result.skipped ? 'Skipped (no contact form on site)' : 'Website contact form processed'),
    });
  } catch (error: any) {
    console.error('[conversationsRouter.submitWebsiteForm]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to submit website contact form' });
  }
});

// POST /api/conversations/detect-website-form - Detect if a lead's website has an active contact form and persist
conversationsRouter.post('/detect-website-form', async (req: Request, res: Response) => {
  try {
    const { leadId, websiteUrl } = req.body;
    const { websiteFormService } = await import('../services/websiteFormService');

    if (leadId) {
      const result = await websiteFormService.detectAndSaveFormForLead(leadId, websiteUrl);
      return res.json({ success: true, detection: result.detection, lead: result.lead });
    }

    const detection = await websiteFormService.detectContactForm(websiteUrl || '');
    res.json({ success: true, detection });
  } catch (error: any) {
    console.error('[conversationsRouter.detectWebsiteForm]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to detect website contact form' });
  }
});

// GET /api/conversations/unmatched-inbox - Get all unmatched or bounced emails for manual checking
conversationsRouter.get('/unmatched-inbox', async (_req: Request, res: Response) => {
  try {
    const { emailInboundService } = await import('../services/emailInboundService');
    const items = await emailInboundService.getUnmatchedInboundEmails();
    res.json({ success: true, count: items.length, items });
  } catch (error: any) {
    console.error('[conversationsRouter.unmatchedInbox]', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch unmatched inbox items' });
  }
});

// DELETE /api/conversations/messages/failed - Bulk delete failed emails & messages
conversationsRouter.delete('/messages/failed', async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
    let deletedCount = 0;
    if (ids && ids.length > 0) {
      const result = await query(
        `DELETE FROM messages WHERE id = ANY($1) AND (status = 'failed' OR status = 'smtp_failed') RETURNING id`,
        [ids]
      );
      deletedCount = result.rowCount || result.rows.length;
    } else {
      const result = await query(
        `DELETE FROM messages WHERE status = 'failed' OR status = 'smtp_failed' RETURNING id`
      );
      deletedCount = result.rowCount || result.rows.length;
    }
    res.json({ success: true, count: deletedCount, message: `Deleted ${deletedCount} failed messages` });
  } catch (error: any) {
    console.error('[conversationsRouter.deleteFailedMessages]', error);
    res.status(500).json({ success: false, error: 'Failed to delete failed messages' });
  }
});
