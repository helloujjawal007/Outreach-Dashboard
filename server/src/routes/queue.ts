import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';
import { emailValidatorService } from '../services/emailValidatorService';
import { emailAdapter } from '../adapters/emailAdapter';
import { whatsappSessionService } from '../services/whatsappSessionService';
import { suppressionService } from '../services/suppressionService';

export const queueRouter = Router();

// GET /api/queue
queueRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         q.id,
         q.lead_id,
         q.client_id,
         q.campaign_id,
         q.step_id,
         q.channel,
         q.message_preview,
         q.status,
         q.scheduled_for,
         q.created_at,
         COALESCE(l.business_name, c.business_name, 'Unknown') as lead_name,
         COALESCE(camp.name, 'Direct Outbound') as campaign_name,
         COALESCE(s.name, 'Manual Touch') as step_name
       FROM send_queue q
       LEFT JOIN leads l ON l.id = q.lead_id
       LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN campaigns camp ON camp.id = q.campaign_id
       LEFT JOIN campaign_steps s ON s.id = q.step_id
       WHERE q.status = 'draft'
       ORDER BY q.created_at DESC`
    );

    res.json({ success: true, count: result.rows.length, queue: result.rows });
  } catch (error) {
    console.error('[queueRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch queue' });
  }
});

// POST /api/queue - Enqueue a draft message for approval
queueRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { leadId, clientId, campaignId, channel, messagePreview } = req.body;
    const result = await query(
      `INSERT INTO send_queue (lead_id, client_id, campaign_id, channel, message_preview, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', NOW(), NOW())
       RETURNING *`,
      [leadId || null, clientId || null, campaignId || null, channel || 'email', messagePreview || '']
    );

    if (leadId) {
      try {
        const { fiveSlotSenderService } = await import('../services/fiveSlotSenderService');
        await fiveSlotSenderService.assignLeadToSlot(leadId);
      } catch (slotErr: any) {
        console.warn(`[queueRouter.post] Slot assignment note for lead ${leadId}:`, slotErr?.message);
      }
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error('[queueRouter.post]', error);
    res.status(500).json({ success: false, error: 'Failed to enqueue item' });
  }
});

// POST /api/queue/:id/send - Atomically claim draft, dispatch via channel adapter, and mark as sent
queueRouter.post('/:id/send', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Atomically claim draft/approved item so double-clicks cannot double-send
    const claimRes = await query<{
      id: string;
      lead_id: string | null;
      client_id: string | null;
      channel: string;
      message_preview: string;
    }>(
      `UPDATE send_queue
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1 AND status IN ('draft', 'approved')
       RETURNING id, lead_id, client_id, channel, message_preview`,
      [id]
    );

    if (claimRes.rows.length === 0) {
      const exists = await query<{ status: string }>(`SELECT status FROM send_queue WHERE id = $1`, [id]);
      if (exists.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Queue item not found' });
      }
      return res.status(409).json({
        success: false,
        error: `Queue item cannot be sent (current status: ${exists.rows[0].status})`,
      });
    }

    const item = claimRes.rows[0];
    const entityId = item.lead_id || item.client_id;
    const isClient = !item.lead_id && Boolean(item.client_id);

    let recipientEmail = '';
    let recipientPhone = '';
    let businessName = 'Contact';
    if (item.lead_id) {
      const leadRes = await query<{ id: string; business_name: string; email: string; whatsapp: string; phone: string }>(
        `SELECT id, business_name, email, whatsapp, phone FROM leads WHERE id = $1`,
        [item.lead_id]
      );
      if (leadRes.rows[0]) {
        recipientEmail = (leadRes.rows[0].email || '').trim();
        recipientPhone = (leadRes.rows[0].whatsapp || leadRes.rows[0].phone || '').trim();
        businessName = leadRes.rows[0].business_name || businessName;
      }
    } else if (item.client_id) {
      const clientRes = await query<{ id: string; business_name: string; email: string; whatsapp: string; phone: string }>(
        `SELECT id, business_name, email, whatsapp, phone FROM clients WHERE id = $1`,
        [item.client_id]
      );
      if (clientRes.rows[0]) {
        recipientEmail = (clientRes.rows[0].email || '').trim();
        recipientPhone = (clientRes.rows[0].whatsapp || clientRes.rows[0].phone || '').trim();
        businessName = clientRes.rows[0].business_name || businessName;
      }
    }

    let externalMessageId = '';

    if (item.channel === 'email') {
      if (!recipientEmail) {
        await query(`UPDATE send_queue SET status = 'draft', error_details = 'Missing recipient email', updated_at = NOW() WHERE id = $1`, [id]);
        return res.status(400).json({ success: false, error: 'Cannot send: no email address found for recipient.' });
      }

      const suppCheck = await suppressionService.isSuppressed({ email: recipientEmail });
      if (suppCheck.suppressed) {
        await query(
          `UPDATE send_queue SET status = 'discarded', error_details = $1, updated_at = NOW() WHERE id = $2`,
          [suppCheck.reason || 'Recipient suppressed/opted out', id]
        );
        return res.status(400).json({ success: false, error: `Cannot send: ${recipientEmail} is suppressed.` });
      }

      const validation = await emailValidatorService.verifyEmail(recipientEmail);
      if (!validation.isValid) {
        if (item.lead_id) {
          await emailValidatorService.flagAndMoveLeadToInvalidList(
            item.lead_id,
            recipientEmail,
            validation.reason || 'Invalid email',
            validation.status
          );
        }
        await query(
          `UPDATE send_queue SET status = 'discarded', error_details = $1, updated_at = NOW() WHERE id = $2`,
          [`Invalid email (${validation.reason}).`, id]
        );
        return res.status(400).json({
          success: false,
          error: `Cannot send: recipient email "${recipientEmail}" is invalid (${validation.reason}).`,
        });
      }

      const sendResult = await emailAdapter.sendEmail({
        to: recipientEmail,
        subject: `Following up — ${businessName}`,
        body: item.message_preview,
        leadId: item.lead_id || undefined,
      });

      if (!sendResult.success) {
        await query(
          `UPDATE send_queue SET status = 'draft', error_details = $1, updated_at = NOW() WHERE id = $2`,
          [sendResult.reason || 'SMTP dispatch failed', id]
        );
        return res.status(502).json({ success: false, error: sendResult.reason || 'Failed to send email' });
      }
      externalMessageId = sendResult.messageId || '';
    } else if (item.channel === 'whatsapp') {
      if (!recipientPhone) {
        await query(`UPDATE send_queue SET status = 'draft', error_details = 'Missing recipient phone/WhatsApp', updated_at = NOW() WHERE id = $1`, [id]);
        return res.status(400).json({ success: false, error: 'Cannot send: no WhatsApp phone number found for recipient.' });
      }
      const waResult = await whatsappSessionService.sendMessage(recipientPhone, item.message_preview);
      if (!waResult.success) {
        await query(
          `UPDATE send_queue SET status = 'draft', error_details = $1, updated_at = NOW() WHERE id = $2`,
          [waResult.error || 'WhatsApp dispatch failed', id]
        );
        return res.status(502).json({ success: false, error: waResult.error || 'Failed to send WhatsApp message' });
      }
      externalMessageId = waResult.messageId || '';
    } else {
      await query(`UPDATE send_queue SET status = 'draft', error_details = $1, updated_at = NOW() WHERE id = $2`, [`Unsupported auto-send channel: ${item.channel}`, id]);
      return res.status(400).json({ success: false, error: `Channel "${item.channel}" does not support automated dispatch.` });
    }

    await query(
      `UPDATE send_queue SET status = 'sent', error_details = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    if (entityId) {
      const entityType = isClient ? 'client' : 'lead';
      const entityCol = isClient ? 'client_id' : 'lead_id';
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = $1 AND ${entityCol} = $2 AND channel = $3 LIMIT 1`,
        [entityType, entityId, item.channel]
      );

      let convId: string;
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, ${entityCol}, channel, status, last_message_at)
           VALUES ($1, $2, $3, 'open', NOW())
           RETURNING id`,
          [entityType, entityId, item.channel]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      await query(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
         VALUES ($1, $2, 'outbound', $3, 'sent', $4, NOW())`,
        [convId, item.channel, item.message_preview, externalMessageId]
      );

      await query(
        `UPDATE messages
         SET is_replied = true, replied_at = NOW(), is_seen = true, seen_at = COALESCE(seen_at, NOW())
         WHERE conversation_id = $1 AND direction = 'inbound' AND (is_replied IS NOT TRUE OR is_seen IS NOT TRUE)`,
        [convId]
      );

      if (item.lead_id) {
        await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [item.lead_id]);
      }
    }

    res.json({ success: true, message: 'Queue item sent via adapter and recorded' });
  } catch (error) {
    console.error('[queueRouter.send]', error);
    res.status(500).json({ success: false, error: 'Failed to process queue item' });
  }
});

// POST /api/queue/:id/discard - Discard item
queueRouter.post('/:id/discard', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Queue item not found' });
    }

    res.json({ success: true, message: 'Queue item discarded' });
  } catch (error) {
    console.error('[queueRouter.discard]', error);
    res.status(500).json({ success: false, error: 'Failed to discard queue item' });
  }
});
