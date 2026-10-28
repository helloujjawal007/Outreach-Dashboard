import { query } from '../config/db';
import { unifiedAiService, type InboundClassification } from './unifiedAiService';
import { conversationOrchestrator } from './orchestratorService';
import { emailAdapter } from '../adapters/emailAdapter';

export interface AutonomousInboundSettings {
  enabled: boolean;
  auto_classify_intent: boolean;
  auto_convert_hot_leads: boolean;
  auto_draft_replies: boolean;
  auto_send_replies: boolean;
  confidence_threshold: number;
}

export class AutonomousInboundAgent {
  /**
   * Retrieves active inbound agent settings from PostgreSQL
   */
  async getSettings(): Promise<AutonomousInboundSettings> {
    try {
      const res = await query<{ value: AutonomousInboundSettings }>(
        `SELECT value FROM autopilot_settings WHERE key = 'inbound_agent'`
      );
      if (res.rows.length > 0) {
        return res.rows[0].value;
      }
    } catch (err) {
      console.error('[AutonomousInboundAgent] Failed to load settings:', err);
    }

    return {
      enabled: true,
      auto_classify_intent: true,
      auto_convert_hot_leads: true,
      auto_draft_replies: true,
      auto_send_replies: false,
      confidence_threshold: 0.85,
    };
  }

  /**
   * Evaluates an incoming reply and autonomously classifies intent, creates draft, and auto-converts hot leads.
   */
  async processInboundMessage(params: {
    messageId?: string;
    conversationId?: string;
    entityType: 'lead' | 'client';
    entityId: string;
    senderEmail?: string;
    senderPhone?: string;
    senderName?: string;
    subject: string;
    replyText: string;
  }): Promise<{
    classification: InboundClassification;
    convertedToClient: boolean;
    autoReplySent: boolean;
  }> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      console.log('[AutonomousInboundAgent] Agent is currently disabled in settings.');
      return {
        classification: {} as any,
        convertedToClient: false,
        autoReplySent: false,
      };
    }

    // Guard against processing delivery bounce notifications
    if (
      params.replyText.startsWith('[DELIVERY FAILURE') ||
      /delivery status notification|undeliverable|returned mail|mailer-daemon/i.test(params.subject || '') ||
      /address could not be found|mailbox unavailable|550 5\./i.test(params.replyText)
    ) {
      console.log('[AutonomousInboundAgent] Skipping delivery bounce message (not a customer reply).');
      return {
        classification: {} as any,
        convertedToClient: false,
        autoReplySent: false,
      };
    }

    // 1. Fetch entity business name and contact info
    let businessName = params.senderName || 'Valued Business';
    let leadNotes = '';
    if (params.entityType === 'lead') {
      const leadRes = await query<{ business_name: string; notes: string; metadata: any }>(
        `SELECT business_name, notes, metadata FROM leads WHERE id = $1`,
        [params.entityId]
      );
      if (leadRes.rows.length > 0) {
        businessName = leadRes.rows[0].business_name;
        leadNotes = leadRes.rows[0].notes || '';
      }
    } else {
      const clientRes = await query<{ business_name: string }>(
        `SELECT business_name FROM clients WHERE id = $1`,
        [params.entityId]
      );
      if (clientRes.rows.length > 0) {
        businessName = clientRes.rows[0].business_name;
      }
    }

    // 2. Classify intent via Unified AI
    const classification = await unifiedAiService.classifyInboundReply({
      senderEmail: params.senderEmail,
      senderName: params.senderName,
      businessName,
      subject: params.subject,
      replyText: params.replyText,
    });

    console.log(
      `[AutonomousInboundAgent] Classified reply from "${businessName}": intent=${classification.intent} (${Math.round(classification.confidence * 100)}%), action=${classification.recommendedAction}`
    );

    // 3. Store AI analysis on the message record if messageId provided
    if (params.messageId) {
      await query(
        `UPDATE messages
         SET intent = $1, sentiment = $2, ai_draft_reply = $3, ai_draft_generated_at = NOW(),
             inbound_intent = $1, inbound_intent_confidence = $4, ai_suggested_reply = $3
         WHERE id = $5`,
        [classification.intent, classification.sentiment, classification.suggestedReplyBody, classification.confidence, params.messageId]
      );
    }

    // 4. Update lead metadata and suggestions
    const convertedToClient = false;
    let autoReplySent = false;

    if (params.entityType === 'lead') {
      await query(
        `UPDATE leads
         SET inbound_intent = $1,
             inbound_intent_confidence = $2,
             ai_suggested_reply = $3,
             ai_reply_status = 'pending_approval',
             updated_at = NOW()
         WHERE id = $4`,
        [classification.intent, classification.confidence, classification.suggestedReplyBody, params.entityId]
      );

      // 5. Extreme Automation: Autonomous Deal Creation in 'Interested' stage on positive intent
      const isHighIntent =
        (classification.intent === 'meeting_request' || classification.intent === 'interested') &&
        classification.confidence >= (settings.confidence_threshold || 0.85);

      if (settings.auto_convert_hot_leads && isHighIntent) {
        console.log(`[AutonomousInboundAgent] 🚀 High-intent reply detected! Creating Deal in 'Interested' stage for "${businessName}".`);
        try {
          // Check if active deal already exists for this lead
          const existingDeal = await query<{ id: string }>(
            `SELECT id FROM deals WHERE lead_id = $1 AND stage NOT IN ('won', 'lost') LIMIT 1`,
            [params.entityId]
          );

          if (existingDeal.rows.length === 0) {
            const dealTitle = `${businessName} - High Intent Lead`;
            const dealRes = await query<{ id: string }>(
              `INSERT INTO deals (
                lead_id, title, value, stage, probability, contact_name, contact_email, notes, updated_at
              ) VALUES ($1, $2, $3, 'interested', 35, $4, $5, $6, NOW())
              RETURNING id;`,
              [
                params.entityId,
                dealTitle,
                1500, // estimated project value default
                businessName,
                params.senderEmail || null,
                `Autonomously created via Inbound AI: Positive interest detected ("${classification.summary}")`,
              ]
            );

            // Log activity in unified timeline
            await query(
              `INSERT INTO activity_logs (lead_id, deal_id, actor_type, activity_type, title, description, metadata)
               VALUES ($1, $2, 'ai', 'deal_created', $3, $4, $5);`,
              [
                params.entityId,
                dealRes.rows[0]?.id || null,
                `Deal created in Interested stage: ${dealTitle}`,
                `AI Intent: ${classification.intent} (${Math.round(classification.confidence * 100)}% confidence). Inbound reply summary: "${classification.summary}"`,
                JSON.stringify({ intent: classification.intent, confidence: classification.confidence }),
              ]
            );

            console.log(`[AutonomousInboundAgent] 🎯 Successfully created Deal ${dealRes.rows[0]?.id} in 'Interested' stage!`);
          }
        } catch (dealErr) {
          console.error('[AutonomousInboundAgent] Deal creation error:', dealErr);
        }
      }

      // 6. Optional Autonomous Response Dispatch (if auto_send_replies enabled)
      if (settings.auto_send_replies && classification.confidence >= (settings.confidence_threshold || 0.85) && params.senderEmail) {
        if (classification.intent !== 'opt_out') {
          console.log(`[AutonomousInboundAgent] Auto-sending generated response to ${params.senderEmail}...`);
          try {
            const sendRes = await emailAdapter.sendEmail({
              to: params.senderEmail,
              subject: classification.suggestedReplySubject,
              body: classification.suggestedReplyBody,
              leadId: convertedToClient ? undefined : params.entityId,
            });

            if (sendRes.success) {
              autoReplySent = true;
              await query(
                `UPDATE leads SET ai_reply_status = 'sent', updated_at = NOW() WHERE id = $1`,
                [params.entityId]
              );
            }
          } catch (sendErr) {
            console.error('[AutonomousInboundAgent] Auto-reply send failed:', sendErr);
          }
        }
      }
    }

    return {
      classification,
      convertedToClient,
      autoReplySent,
    };
  }
}

export const autonomousInboundAgent = new AutonomousInboundAgent();
