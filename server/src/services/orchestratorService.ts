import { query } from '../config/db';

export interface ClientConversionResult {
  success: boolean;
  clientId?: string;
  leadId: string;
  alreadyClient?: boolean;
  message?: string;
}

/**
 * CONVERSATION ORCHESTRATOR
 * Dedicated service for Paying Clients (Onboarding, Follow-ups, Health Check-ins, and Multi-turn dialogue).
 * MANDATE: Completely decoupled from cold lead outreach logic.
 */
export class ConversationOrchestratorService {
  /**
   * Converts a Lead into a Paying Client upon reply or manual conversion.
   * Hands off entity from Outreach Engine to Conversation Orchestrator.
   */
  async convertLeadToClient(leadId: string, notes?: string): Promise<ClientConversionResult> {
    // 1. Check if lead exists
    const leadRes = await query<{
      id: string;
      business_name: string;
      category: string;
      phone: string;
      email: string;
      instagram: string;
      facebook: string;
      whatsapp: string;
    }>(`SELECT * FROM leads WHERE id = $1`, [leadId]);

    if (leadRes.rows.length === 0) {
      return { success: false, leadId, message: 'Lead not found' };
    }

    const lead = leadRes.rows[0];

    // 2. Check if client already exists for this lead
    const existingClient = await query<{ id: string }>(
      `SELECT id FROM clients WHERE original_lead_id = $1 OR (email <> '' AND LOWER(email) = LOWER($2))`,
      [leadId, lead.email]
    );

    if (existingClient.rows.length > 0) {
      return {
        success: true,
        clientId: existingClient.rows[0].id,
        leadId,
        alreadyClient: true,
        message: 'Lead already converted to Client',
      };
    }

    // 3. Mark lead consent as 'replied'
    await query(
      `UPDATE leads SET consent_status = 'replied', updated_at = NOW() WHERE id = $1`,
      [leadId]
    );

    // 4. Immediately cancel any pending cold outreach queue items for this lead
    await query(
      `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
      [leadId]
    );

    // 5. Create new row in dedicated `clients` table
    const clientRes = await query<{ id: string }>(
      `INSERT INTO clients (
        original_lead_id, business_name, primary_contact_name, category,
        phone, email, instagram, facebook, whatsapp, status, contract_value, onboarded_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 1500.00, NOW(), $10)
      RETURNING id`,
      [
        leadId,
        lead.business_name,
        lead.business_name,
        lead.category,
        lead.phone,
        lead.email,
        lead.instagram,
        lead.facebook,
        lead.whatsapp,
        notes || 'Converted from Cold Outreach reply',
      ]
    );

    const clientId = clientRes.rows[0].id;

    // 6. Migrate existing conversations and messages from lead to client
    const existingLeadConvs = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1`,
      [leadId]
    );

    if (existingLeadConvs.rows.length > 0) {
      await query(
        `UPDATE conversations SET entity_type = 'client', client_id = $1, lead_id = NULL WHERE entity_type = 'lead' AND lead_id = $2`,
        [clientId, leadId]
      );
    } else {
      // Initialize client conversation thread
      await query(
        `INSERT INTO conversations (entity_type, client_id, channel, status, subject, last_message_at)
         VALUES ('client', $1, 'email', 'open', 'Welcome & Onboarding', NOW())`,
        [clientId]
      );
    }

    // 7. Enforce "One info can only be in leads or client": clean up from leads table
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = $1`, [leadId]);
    await query(`DELETE FROM leads WHERE id = $1`, [leadId]);


    // 7. Hand off to Follow-up Scheduler: enroll client in active client retention rules
    const activeRules = await query<{
      id: string;
      name: string;
      channel: string;
      delay_days: number;
    }>(
      `SELECT id, name, channel, delay_days FROM follow_up_rules 
       WHERE target_entity_type = 'client' AND is_active = true 
       ORDER BY delay_days ASC LIMIT 1`
    );

    let enrolledRule: string | undefined;
    if (activeRules.rows.length > 0) {
      const rule = activeRules.rows[0];
      enrolledRule = rule.name;
      await query(
        `INSERT INTO follow_up_logs (rule_id, entity_type, client_id, channel, scheduled_at, status, reason)
         VALUES ($1, 'client', $2, $3, NOW() + ($4 || ' days')::INTERVAL, 'pending', 'Enrolled upon conversion from lead')`,
        [rule.id, clientId, rule.channel, rule.delay_days]
      );
      console.log(`[ConversationOrchestrator] Enrolled Client ${clientId} in rule: "${rule.name}" (scheduled in ${rule.delay_days} days)`);
    }

    console.log(`[ConversationOrchestrator] Successfully converted Lead ${leadId} -> Client ${clientId}`);

    return {
      success: true,
      clientId,
      leadId,
      message: enrolledRule
        ? `Lead converted to Client and enrolled in "${enrolledRule}" scheduler.`
        : 'Lead converted to Client and enrolled in Conversation Orchestrator.',
    };
  }

  /**
   * Executes scheduled client follow-up checks
   */
  async processClientFollowUps(): Promise<number> {
    const rulesRes = await query<{
      id: string;
      name: string;
      delay_days: number;
      channel: string;
      template_body: string;
    }>(`SELECT * FROM follow_up_rules WHERE target_entity_type = 'client' AND is_active = true`);

    let processedCount = 0;
    for (const rule of rulesRes.rows) {
      // Find active clients with no recent message within delay window
      const eligibleClients = await query<{ id: string; business_name: string; email: string }>(
        `SELECT c.id, c.business_name, c.email
         FROM clients c
         LEFT JOIN conversations conv ON conv.client_id = c.id
         WHERE c.status = 'active'
           AND (conv.last_message_at IS NULL OR conv.last_message_at < NOW() - ($1 || ' days')::INTERVAL)
         LIMIT 10`,
        [rule.delay_days]
      );

      for (const client of eligibleClients.rows) {
        await query(
          `INSERT INTO follow_up_logs (rule_id, entity_type, client_id, channel, scheduled_at, status)
           VALUES ($1, 'client', $2, $3, NOW(), 'pending')`,
          [rule.id, client.id, rule.channel]
        );
        processedCount++;
      }
    }

    return processedCount;
  }
}

export const conversationOrchestrator = new ConversationOrchestratorService();
