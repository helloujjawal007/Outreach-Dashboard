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
    let convertedToClient = false;
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

      // 5. Extreme Automation: Autonomous Lead-to-Client Conversion on positive intent
      const isHighIntent =
        (classification.intent === 'meeting_request' || classification.intent === 'interested') &&
        classification.confidence >= (settings.confidence_threshold || 0.85);

      if (settings.auto_convert_hot_leads && isHighIntent) {
        console.log(`[AutonomousInboundAgent] 🚀 High-intent reply detected! Autonomously converting Lead "${businessName}" to Client.`);
        try {
          const conversion = await conversationOrchestrator.convertLeadToClient(
            params.entityId,
            `Autonomously converted via Inbound AI: Positive interest detected ("${classification.summary}")`
          );
          if (conversion.success) {
            convertedToClient = true;
            console.log(`[AutonomousInboundAgent] ✅ Successfully converted Lead ${params.entityId} -> Client ${conversion.clientId}`);
          }
        } catch (convErr) {
          console.error('[AutonomousInboundAgent] Lead conversion error:', convErr);
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
