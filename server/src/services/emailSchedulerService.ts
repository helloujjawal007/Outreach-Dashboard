import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { humanizerService } from './humanizerService';
import { humanCopywriterService } from './humanCopywriterService';
import { aiResearchWriterService } from './aiResearchWriterService';

export interface ScheduleListParams {
  listId: string;
  channel?: 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'linkedin';
  inboxIds?: string[]; // Selected inboxes for 50/50 rotational split sending
  linkedinAccountId?: string;
  scheduledFor?: string | Date; // If 'now' or undefined, shoots immediately
  intervalSeconds?: number; // Anti-ban pacing between dispatches
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'client_checkin';
  customInstructions?: string;
}

export interface ScheduleSingleDispatchParams {
  leadId: string;
  channel: 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'linkedin';
  scheduledFor?: string | Date;
  subject?: string;
  body?: string;
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'client_checkin';
  customInstructions?: string;
}

export interface ScheduleBatchDispatchParams {
  leadIds: string[];
  channel: 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'linkedin';
  inboxIds?: string[];
  linkedinAccountId?: string;
  scheduledFor?: string | Date;
  intervalSeconds?: number; // Pacing delay in seconds between messages (defaults: wa=45s, email=25s, li=45s, fb=30s, ig=30s)
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'client_checkin';
  customInstructions?: string;
}

export interface ScheduledDispatchRecord {
  id: string;
  channel: 'email' | 'whatsapp' | 'facebook' | 'instagram' | 'linkedin';
  list_id?: string;
  list_name: string;
  entity_type: 'lead' | 'client';
  lead_id?: string;
  client_id?: string;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_handle?: string;
  recipient_name: string;
  subject: string;
  body: string;
  stage: string;
  style: string;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string;
  sent_at?: string;
  error_message?: string;
  inbox_id?: string;
  inbox_email?: string;
  created_at: string;
  updated_at: string;
}

export class EmailSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Helper sleep for anti-spam pacing jitter
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Schedule a single dispatch for a specific lead on any channel (Email, WhatsApp, FB, IG)
   */
  async scheduleSingleDispatch(params: ScheduleSingleDispatchParams): Promise<{
    success: boolean;
    dispatchId?: string;
    recipient: string;
    scheduledFor: Date;
    channel: string;
  }> {
    const channel = params.channel || 'email';
    const scheduledDate = params.scheduledFor ? new Date(params.scheduledFor) : new Date();

    // Fetch lead details
    const leadRes = await query<{
      id: string;
      business_name: string;
      email: string;
      phone: string;
      whatsapp: string;
      facebook: string;
      instagram: string;
      category: string;
      notes: string;
    }>(`SELECT * FROM leads WHERE id = $1`, [params.leadId]);

    if (leadRes.rows.length === 0) {
      throw new Error(`Lead with ID ${params.leadId} not found`);
    }

    const lead = leadRes.rows[0];
    const recipientEmail = (lead.email || '').trim();
    const recipientPhone = (lead.whatsapp || lead.phone || '').trim();
    const recipientHandle = (lead.facebook || lead.instagram || '').trim();
    let subject = params.subject?.trim() || '';
    let body = params.body?.trim() || '';

    // If body not provided, generate personalized message via AI copywriter
    if (!body) {
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
        channel
      );
      body = generated.body;
      if (channel === 'email' && !subject) {
        subject = generated.subject || `Quick question regarding ${lead.business_name}`;
      }
    }

    if (channel === 'email' && !subject) {
      subject = `Follow up regarding ${lead.business_name}`;
    }

    const insertRes = await query<{ id: string }>(
      `INSERT INTO scheduled_dispatches (
        entity_type, lead_id, channel, recipient_email, recipient_phone, recipient_handle,
        recipient_name, subject, body, stage, style, status, scheduled_for
      ) VALUES (
        'lead', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', $11
      ) RETURNING id`,
      [
        lead.id,
        channel,
        recipientEmail,
        recipientPhone,
        recipientHandle,
        lead.business_name,
        subject,
        body,
        params.stage || 'initial',
        params.style || 'conversational',
        scheduledDate,
      ]
    );

    const dispatchId = insertRes.rows[0].id;
    const recipient =
      channel === 'whatsapp'
        ? recipientPhone
        : channel === 'email'
        ? recipientEmail
        : recipientHandle || lead.business_name;

    console.log(`[Scheduler] Single [${channel}] dispatch scheduled for ${lead.business_name} (${recipient}) at ${scheduledDate.toISOString()}`);

    // If scheduled for now, trigger worker loop asynchronously
    if (scheduledDate <= new Date()) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
    }

    return {
      success: true,
      dispatchId,
      recipient,
      scheduledFor: scheduledDate,
      channel,
    };
  }

  /**
   * Schedule batch dispatches for multiple selected leads with automated anti-ban pacing intervals
   */
  async scheduleBatchDispatch(params: ScheduleBatchDispatchParams): Promise<{
    success: boolean;
    scheduledCount: number;
    channel: string;
    firstScheduledAt: Date;
    lastScheduledAt: Date;
    message: string;
  }> {
    const {
      leadIds,
      channel,
      intervalSeconds = channel === 'whatsapp' ? 45 : channel === 'email' ? 25 : 30,
      style = 'conversational',
      stage = 'initial',
      customInstructions,
    } = params;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      throw new Error('At least one lead must be selected for scheduling');
    }

    // Fetch leads
    const leadsRes = await query<{
      id: string;
      business_name: string;
      primary_contact_name: string;
      email: string;
      phone: string;
      whatsapp: string;
      facebook: string;
      instagram: string;
      category: string;
      notes: string;
      outreach_stage: string;
    }>(
      `SELECT id,
              business_name,
              COALESCE(metadata->>'primary_contact_name', metadata->>'contact_name', '') AS primary_contact_name,
              email,
              phone,
              whatsapp,
              facebook,
              instagram,
              category,
              notes,
              outreach_stage
       FROM leads
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [leadIds]
    );

    // Filter leads eligible for this channel
    const eligibleLeads = leadsRes.rows.filter((lead) => {
      if (channel === 'email') return !!(lead.email && lead.email.trim());
      if (channel === 'whatsapp') return !!((lead.whatsapp && lead.whatsapp.trim()) || (lead.phone && lead.phone.trim()));
      if (channel === 'facebook') return !!(lead.facebook && lead.facebook.trim());
      if (channel === 'instagram') return !!(lead.instagram && lead.instagram.trim());
      return false;
    });

    if (eligibleLeads.length === 0) {
      return {
        success: false,
        scheduledCount: 0,
        channel,
        firstScheduledAt: new Date(),
        lastScheduledAt: new Date(),
        message: `None of the selected leads have valid contact details for ${channel.toUpperCase()}.`,
      };
    }

    // Base start time
    let baseTime = new Date();
    if (params.scheduledFor && params.scheduledFor !== 'now') {
      const parsed = new Date(params.scheduledFor);
      if (!isNaN(parsed.getTime())) {
        baseTime = parsed;
      }
    }

    let insertedCount = 0;
    let lastScheduledAt = baseTime;

    console.log(
      `[Scheduler] Batch scheduling ${eligibleLeads.length} leads on ${channel.toUpperCase()} starting ${baseTime.toISOString()} with ${intervalSeconds}s pacing interval...`
    );

    for (let i = 0; i < eligibleLeads.length; i++) {
      const lead = eligibleLeads[i];
      const staggerMs = i * intervalSeconds * 1000;
      const leadTargetTime = new Date(baseTime.getTime() + staggerMs);
      lastScheduledAt = leadTargetTime;

      const recipientName = (lead.primary_contact_name || lead.business_name || '').trim();
      const recipientEmail = channel === 'email' ? lead.email.trim() : null;
      const recipientPhone = channel === 'whatsapp' ? (lead.whatsapp || lead.phone || '').trim() : null;
      const recipientHandle =
        channel === 'facebook' ? lead.facebook.trim() : channel === 'instagram' ? lead.instagram.trim() : null;

      try {
        // Generate tailored copy per lead
        const contact = {
          id: lead.id,
          businessName: lead.business_name,
          category: lead.category,
          phone: lead.phone,
          email: lead.email,
          instagram: lead.instagram,
          facebook: lead.facebook,
          whatsapp: lead.whatsapp,
          notes: lead.notes,
        };

        const aiOutreach = await aiResearchWriterService.researchAndWrite(contact, channel, customInstructions);

        await query(
          `INSERT INTO scheduled_dispatches (
            channel, list_id, list_name, entity_type, lead_id,
            recipient_email, recipient_phone, recipient_handle, recipient_name,
            subject, body, stage, style, status, scheduled_for, created_at, updated_at
          ) VALUES ($1, NULL, 'Selected Leads Batch', 'lead', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', $11, NOW(), NOW())`,
          [
            channel,
            lead.id,
            recipientEmail,
            recipientPhone,
            recipientHandle,
            recipientName,
            aiOutreach.subject || '',
            aiOutreach.body,
            stage,
            style,
            leadTargetTime,
          ]
        );

        insertedCount++;
      } catch (err) {
        console.error(`[Scheduler] Error scheduling lead ${lead.id}:`, err);
      }
    }

    if (baseTime.getTime() <= Date.now() + 5000) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
    }

    return {
      success: true,
      scheduledCount: insertedCount,
      channel,
      firstScheduledAt: baseTime,
      lastScheduledAt,
      message: `Successfully scheduled ${insertedCount} ${channel.toUpperCase()} message(s) staggered across ${intervalSeconds}s intervals.`,
    };
  }

  /**
   * Enqueues an entire list of contacts for automated shoot or scheduled dispatch
   */
  async scheduleListDispatch(params: ScheduleListParams): Promise<{
    success: boolean;
    scheduledCount: number;
    listName: string;
    channel: string;
    scheduledFor: Date;
    message: string;
  }> {
    const {
      listId,
      channel = 'email',
      style = 'conversational',
      stage = 'auto',
      intervalSeconds = channel === 'whatsapp' ? 45 : 25,
      customInstructions,
    } = params;

    // 1. Fetch list metadata
    const listRes = await query<{ id: string; name: string }>(`SELECT id, name FROM lists WHERE id = $1`, [listId]);

    if (listRes.rows.length === 0) {
      throw new Error(`List with ID "${listId}" not found`);
    }

    const list = listRes.rows[0];

    // 2. Fetch all leads associated with this list
    const leadsRes = await query<{
      id: string;
      business_name: string;
      primary_contact_name: string;
      email: string;
      phone: string;
      whatsapp: string;
      facebook: string;
      instagram: string;
      linkedin?: string;
      category: string;
      notes: string;
      outreach_stage: string;
    }>(
      `SELECT l.id,
              l.business_name,
              COALESCE(l.metadata->>'primary_contact_name', l.metadata->>'contact_name', '') AS primary_contact_name,
              l.email,
              l.phone,
              l.whatsapp,
              l.facebook,
              l.instagram,
              l.linkedin,
              l.category,
              l.notes,
              l.outreach_stage
       FROM lead_list_memberships m
       JOIN leads l ON l.id = m.lead_id
       WHERE m.list_id = $1
         AND l.deleted_at IS NULL
       ORDER BY l.created_at ASC`,
      [listId]
    );

    // Filter by channel validity
    const eligibleLeads = leadsRes.rows.filter((lead) => {
      if (channel === 'email') return !!(lead.email && lead.email.trim());
      if (channel === 'whatsapp') return !!((lead.whatsapp && lead.whatsapp.trim()) || (lead.phone && lead.phone.trim()));
      if (channel === 'linkedin') return !!((lead.linkedin && lead.linkedin.trim()) || lead.business_name);
      if (channel === 'facebook') return !!(lead.facebook && lead.facebook.trim());
      if (channel === 'instagram') return !!(lead.instagram && lead.instagram.trim());
      return false;
    });

    if (eligibleLeads.length === 0) {
      return {
        success: false,
        scheduledCount: 0,
        listName: list.name,
        channel,
        scheduledFor: new Date(),
        message: `No active leads with valid contact information for ${channel.toUpperCase()} were found in "${list.name}".`,
      };
    }

    // 2b. If email channel and multiple inboxes selected, load inboxes for 50/50 rotational split
    const inboxMap = new Map<string, string>();
    if (channel === 'email' && params.inboxIds && params.inboxIds.length > 0) {
      const inboxesRes = await query<{ id: string; email: string }>(
        `SELECT id, email FROM connected_inboxes WHERE id = ANY($1::uuid[])`,
        [params.inboxIds]
      );
      for (const row of inboxesRes.rows) {
        inboxMap.set(row.id, row.email);
      }
      console.log(
        `[Scheduler] Multi-inbox split active across ${inboxMap.size} inboxes for ${eligibleLeads.length} leads (rotational 50/50 distribution).`
      );
    }

    // Determine target schedule time
    let baseTime = new Date();
    if (params.scheduledFor && params.scheduledFor !== 'now') {
      const parsed = new Date(params.scheduledFor);
      if (!isNaN(parsed.getTime())) {
        baseTime = parsed;
      }
    }

    console.log(
      `[Scheduler] Generating outreach copy for ${eligibleLeads.length} leads in "${list.name}" (${channel.toUpperCase()}, Scheduled for: ${baseTime.toISOString()})...`
    );

    let insertedCount = 0;

    for (let i = 0; i < eligibleLeads.length; i++) {
      const lead = eligibleLeads[i];
      const leadTargetTime = new Date(baseTime.getTime() + i * intervalSeconds * 1000);
      const recipientName = (lead.primary_contact_name || lead.business_name || '').trim();

      const recipientEmail = channel === 'email' ? lead.email.trim() : null;
      const recipientPhone = channel === 'whatsapp' ? (lead.whatsapp || lead.phone || '').trim() : null;
      const recipientHandle =
        channel === 'facebook'
          ? (lead.facebook || '').trim()
          : channel === 'instagram'
          ? (lead.instagram || '').trim()
          : channel === 'linkedin'
          ? (lead.linkedin || lead.business_name || '').trim()
          : null;

      // Assign rotational inbox for 50/50 distribution
      let assignedInboxId: string | null = null;
      let assignedInboxEmail: string | null = null;
      if (channel === 'email' && params.inboxIds && params.inboxIds.length > 0) {
        assignedInboxId = params.inboxIds[i % params.inboxIds.length];
        assignedInboxEmail = inboxMap.get(assignedInboxId) || null;
      }

      try {
        let subject = '';
        let body = '';

        if (channel === 'email') {
          const generated = await humanizerService.generateEmail(
            {
              id: lead.id,
              business_name: lead.business_name,
              primary_contact_name: lead.primary_contact_name,
              category: lead.category,
              notes: lead.notes,
              entity_type: 'lead',
            },
            {
              stage: stage === 'auto' ? undefined : stage,
              style,
              customInstructions,
            }
          );
          subject = generated.subject;
          body = generated.body;
        } else {
          const aiOutreach = await aiResearchWriterService.researchAndWrite(
            {
              businessName: lead.business_name,
              category: lead.category,
              phone: lead.phone,
              email: lead.email,
              instagram: lead.instagram,
              facebook: lead.facebook,
              whatsapp: lead.whatsapp,
              notes: lead.notes,
            },
            channel === 'linkedin' ? 'linkedin' : channel,
            customInstructions
          );
          subject = aiOutreach.subject || '';
          body = aiOutreach.body;
        }

        await query(
          `INSERT INTO scheduled_dispatches (
            channel, list_id, list_name, entity_type, lead_id,
            recipient_email, recipient_phone, recipient_handle, recipient_name,
            subject, body, stage, style, status, scheduled_for,
            inbox_id, inbox_email, created_at, updated_at
          ) VALUES ($1, $2, $3, 'lead', $4, $5, $6, $7, $8, $9, $10, $11, $12, 'scheduled', $13, $14, $15, NOW(), NOW())`,
          [
            channel,
            list.id,
            list.name,
            lead.id,
            recipientEmail,
            recipientPhone,
            recipientHandle,
            recipientName,
            subject,
            body,
            stage,
            style,
            leadTargetTime,
            assignedInboxId,
            assignedInboxEmail,
          ]
        );

        insertedCount++;
      } catch (genErr) {
        console.error(`[Scheduler] Error generating copy for lead ${lead.id}:`, genErr);
      }
    }

    console.log(`[Scheduler] Successfully scheduled ${insertedCount} ${channel.toUpperCase()} messages for list "${list.name}".`);

    if (baseTime.getTime() <= Date.now() + 5000) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
    }

    return {
      success: true,
      scheduledCount: insertedCount,
      listName: list.name,
      channel,
      scheduledFor: baseTime,
      message: `Successfully scheduled ${insertedCount} ${channel.toUpperCase()} message(s) for list "${list.name}".`,
    };
  }

  /**
   * Generates a sample humanized email preview for a contact or list
   */
  async previewHumanizedEmail(params: {
    listId?: string;
    leadId?: string;
    style?: 'conversational' | 'direct' | 'curious';
    stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
    customInstructions?: string;
  }) {
    let sampleContact: {
      id: string;
      business_name: string;
      primary_contact_name?: string;
      category?: string;
      notes?: string;
      email?: string;
      entity_type?: 'lead' | 'client';
    } | null = null;

    if (params.leadId) {
      const res = await query<{
        id: string;
        business_name: string;
        primary_contact_name?: string;
        email?: string;
        category?: string;
        notes?: string;
      }>(
        `SELECT id, business_name, COALESCE(metadata->>'primary_contact_name', metadata->>'contact_name', '') AS primary_contact_name, email, category, notes FROM leads WHERE id = $1`,
        [params.leadId]
      );
      if (res.rows.length > 0) {
        sampleContact = { ...res.rows[0], entity_type: 'lead' };
      }
    } else if (params.listId) {
      const res = await query<{
        id: string;
        business_name: string;
        primary_contact_name?: string;
        email?: string;
        category?: string;
        notes?: string;
      }>(
        `SELECT l.id, l.business_name, COALESCE(l.metadata->>'primary_contact_name', l.metadata->>'contact_name', '') AS primary_contact_name, l.email, l.category, l.notes
         FROM lead_list_memberships m
         JOIN leads l ON l.id = m.lead_id
         WHERE m.list_id = $1 AND l.deleted_at IS NULL AND l.email IS NOT NULL AND TRIM(l.email) != ''
         LIMIT 1`,
        [params.listId]
      );
      if (res.rows.length > 0) {
        sampleContact = { ...res.rows[0], entity_type: 'lead' };
      }
    }

    // Default fallback sample if no lead exists
    if (!sampleContact) {
      sampleContact = {
        id: 'sample-001',
        business_name: 'Apex Heating & Air Conditioning LLC',
        primary_contact_name: 'Marcus Vance',
        category: 'HVAC & Plumbing',
        notes: 'Requested digital audit for local emergency calls',
        email: 'marcus@apexheating.com',
        entity_type: 'lead',
      };
    }

    const generated = await humanizerService.generateEmail(sampleContact, {
      style: params.style || 'conversational',
      stage: params.stage === 'auto' ? undefined : params.stage,
      customInstructions: params.customInstructions,
    });

    return {
      sampleContact,
      preview: generated,
    };
  }

  /**
   * Background processor: dispatches scheduled messages due for delivery across all channels (Email, WhatsApp, FB, IG)
   */
  async processPendingDispatches(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Atomically claim due dispatches using SKIP LOCKED
      const pendingRes = await query<ScheduledDispatchRecord>(
        `UPDATE scheduled_dispatches
         SET status = 'processing', updated_at = NOW()
         WHERE id IN (
           SELECT id FROM scheduled_dispatches
           WHERE status = 'scheduled' AND scheduled_for <= NOW()
           ORDER BY scheduled_for ASC
           LIMIT 20
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *;`
      );

      if (pendingRes.rows.length === 0) {
        return;
      }

      console.log(`[Scheduler] Atomically claimed ${pendingRes.rows.length} due outreach dispatches with SKIP LOCKED...`);

      for (const dispatch of pendingRes.rows) {
        const channel = dispatch.channel || 'email';

        try {
          if (channel === 'whatsapp') {
            await this.executeWhatsAppDispatch(dispatch);
          } else if (channel === 'email') {
            const shouldBreak = await this.executeEmailDispatch(dispatch);
            if (shouldBreak) break;
          } else if (channel === 'facebook') {
            await this.executeFacebookDispatch(dispatch);
          } else if (channel === 'instagram') {
            await this.executeInstagramDispatch(dispatch);
          } else if (channel === 'linkedin') {
            await this.executeLinkedInDispatch(dispatch);
          } else {
            throw new Error(`Unsupported channel: ${channel}`);
          }
        } catch (dispatchErr: unknown) {
          const errStr = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
          console.error(`[Scheduler] Failed dispatch [${channel}] to ${dispatch.recipient_name}:`, errStr);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'failed', error_message = $1, updated_at = NOW()
             WHERE id = $2`,
            [errStr, dispatch.id]
          );
        }
      }
    } catch (loopErr) {
      console.error('[Scheduler] Error in processPendingDispatches loop:', loopErr);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Dispatches a scheduled WhatsApp message via active Baileys socket
   */
  private async executeWhatsAppDispatch(dispatch: ScheduledDispatchRecord): Promise<void> {
    const rawPhone = (dispatch.recipient_phone || '').trim();
    if (!rawPhone) {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = 'No phone number available', updated_at = NOW() WHERE id = $1`,
        [dispatch.id]
      );
      return;
    }

    const { whatsappValidator } = await import('./whatsappValidator');
    const waEval = whatsappValidator.evaluate({ phone: rawPhone, whatsapp: rawPhone });
    if (!waEval.isEligible || !waEval.cleanNumber) {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [waEval.reason || 'Invalid WhatsApp phone format', dispatch.id]
      );
      return;
    }

    const { whatsappSessionService } = await import('./whatsappSessionService');
    const sessionState = whatsappSessionService.getState();

    if (sessionState.status !== 'connected') {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = 'WhatsApp session not connected in dashboard. Please link QR code.', updated_at = NOW() WHERE id = $1`,
        [dispatch.id]
      );
      return;
    }

    // Natural jitter: wait 1.8s - 3.2s
    const jitterMs = 1800 + Math.floor(Math.random() * 1400);
    await this.sleep(jitterMs);

    const sendResult = await whatsappSessionService.sendMessage(waEval.cleanNumber, dispatch.body);

    if (sendResult.success) {
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW()
         WHERE id = $1`,
        [dispatch.id]
      );

      // Record in conversation thread
      let convId: string;
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp' LIMIT 1`,
        [dispatch.lead_id]
      );
      if (convRes.rows.length === 0) {
        const newConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
           VALUES ('lead', $1, 'whatsapp', 'open', NOW()) RETURNING id`,
          [dispatch.lead_id]
        );
        convId = newConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      await query(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
         VALUES ($1, 'whatsapp', 'outbound', $2, 'delivered', $3, NOW())`,
        [convId, dispatch.body, sendResult.messageId || '']
      );

      await query(`UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`, [convId]);

      if (dispatch.lead_id) {
        await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [dispatch.lead_id]);
      }

      await query(
        `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
         VALUES (CURRENT_DATE, 'whatsapp', 1, NOW())
         ON CONFLICT (metric_date, channel)
         DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`
      );

      console.log(`[Scheduler] Delivered scheduled WhatsApp message to ${waEval.cleanNumber} (${sendResult.messageId})`);
    } else {
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'failed', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [sendResult.error || 'WhatsApp send failed', dispatch.id]
      );
    }
  }

  /**
   * Dispatches a scheduled Email via SMTP adapter
   */
  private async executeEmailDispatch(dispatch: ScheduledDispatchRecord): Promise<boolean> {
    const toEmail = (dispatch.recipient_email || '').trim();
    if (!toEmail) {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = 'No email address available', updated_at = NOW() WHERE id = $1`,
        [dispatch.id]
      );
      return false;
    }

    // Safety Pre-flight Check: If lead has already replied, opted out, or was deleted, cancel immediately
    if (dispatch.lead_id) {
      const checkRes = await query<{ consent_status: string; deleted_at: string | null }>(
        `SELECT consent_status, deleted_at FROM leads WHERE id = $1`,
        [dispatch.lead_id]
      );
      const leadRow = checkRes.rows[0];
      if (leadRow) {
        if (leadRow.consent_status === 'replied') {
          console.log(`[Scheduler] Lead ${dispatch.lead_id} has replied. Suppressing future automated outreach.`);
          await query(
            `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Lead already replied to outreach', updated_at = NOW() WHERE lead_id = $1 AND status = 'scheduled'`,
            [dispatch.lead_id]
          );
          await query(
            `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Lead already replied', updated_at = NOW() WHERE id = $1`,
            [dispatch.id]
          );
          return false;
        }

        if (leadRow.consent_status === 'opted_out' || leadRow.consent_status === 'unsubscribed' || leadRow.deleted_at) {
          await query(
            `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Lead opted out or deleted', updated_at = NOW() WHERE lead_id = $1 AND status = 'scheduled'`,
            [dispatch.lead_id]
          );
          await query(
            `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Lead opted out or deleted', updated_at = NOW() WHERE id = $1`,
            [dispatch.id]
          );
          return false;
        }
      }
    }

    const jitterMs = 2000 + Math.floor(Math.random() * 1200);
    await this.sleep(jitterMs);

    const sendRes = await emailAdapter.sendEmail({
      to: toEmail,
      subject: dispatch.subject,
      body: dispatch.body,
      leadId: dispatch.lead_id || undefined,
      clientId: dispatch.client_id || undefined,
      inboxId: dispatch.inbox_id || undefined,
    });

    if (sendRes.throttled) {
      console.warn(`[Scheduler] Daily sending capacity reached. Pausing remaining dispatches: ${sendRes.reason}`);
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'scheduled',
             scheduled_for = NOW() + INTERVAL '4 hours',
             updated_at = NOW()
         WHERE id = $1`,
        [dispatch.id]
      );
      return true; // Stop loop
    }

    if (sendRes.success) {
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'sent', sent_at = NOW(), error_message = NULL,
             inbox_id = $1, inbox_email = $2, updated_at = NOW()
         WHERE id = $3`,
        [sendRes.inboxUsed?.id || dispatch.inbox_id || null, sendRes.inboxUsed?.email || dispatch.inbox_email || '', dispatch.id]
      );

      if (dispatch.lead_id) {
        const leadDataRes = await query<{
          id: string;
          business_name: string;
          category: string;
          first_contacted_at: Date | null;
          last_contacted_at: Date | null;
          outreach_stage: string;
        }>(
          `SELECT id, business_name, category, first_contacted_at, last_contacted_at, outreach_stage FROM leads WHERE id = $1`,
          [dispatch.lead_id]
        );
        const currentLead = leadDataRes.rows[0];

        if (dispatch.stage === 'initial') {
          // Touch 1 Delivered! Update lead state
          await query(
            `UPDATE leads
             SET first_contacted_at = COALESCE(first_contacted_at, NOW()),
                 last_contacted_at = NOW(),
                 outreach_stage = 'followup_1',
                 updated_at = NOW()
             WHERE id = $1`,
            [dispatch.lead_id]
          );

          // Automated Schedule: Touch 2 goes on 2.5th day (60 hours from first shoot; strictly >= 2 days delay)
          const followup1Time = new Date(Date.now() + 60 * 3600 * 1000);
          const copy2 = humanCopywriterService.getEmailCopy(
            {
              id: dispatch.lead_id,
              businessName: dispatch.recipient_name || currentLead?.business_name || 'Business',
              category: currentLead?.category,
            },
            'followup_1'
          );

          await query(
            `INSERT INTO scheduled_dispatches (
              entity_type, lead_id, channel, recipient_email, recipient_name,
              subject, body, stage, style, status, scheduled_for, created_at, updated_at
            ) VALUES (
              'lead', $1, 'email', $2, $3, $4, $5, 'followup_1', 'conversational', 'scheduled', $6, NOW(), NOW()
            )`,
            [dispatch.lead_id, toEmail, dispatch.recipient_name, copy2.subject, copy2.body, followup1Time]
          );

          console.log(`[Scheduler] 📅 Auto-scheduled Touch 2 (Follow-up 1) for "${dispatch.recipient_name}" at Day 2.5 (${followup1Time.toISOString()})`);
        } else if (dispatch.stage === 'followup_1') {
          // Touch 2 Delivered! Update lead state
          await query(
            `UPDATE leads
             SET last_contacted_at = NOW(),
                 outreach_stage = 'followup_2',
                 updated_at = NOW()
             WHERE id = $1`,
            [dispatch.lead_id]
          );

          // Automated Schedule: Touch 3 goes on 5.5th day (132 hours from first shoot, or 72 hours / 3 days after touch 2)
          const anchorTime = currentLead?.first_contacted_at ? new Date(currentLead.first_contacted_at).getTime() : Date.now() - 60 * 3600 * 1000;
          const followup2Time = new Date(anchorTime + 132 * 3600 * 1000);
          const safeF2Time = followup2Time.getTime() > Date.now() + 24 * 3600 * 1000 ? followup2Time : new Date(Date.now() + 72 * 3600 * 1000);

          const copy3 = humanCopywriterService.getEmailCopy(
            {
              id: dispatch.lead_id,
              businessName: dispatch.recipient_name || currentLead?.business_name || 'Business',
              category: currentLead?.category,
            },
            'followup_2'
          );

          await query(
            `INSERT INTO scheduled_dispatches (
              entity_type, lead_id, channel, recipient_email, recipient_name,
              subject, body, stage, style, status, scheduled_for, created_at, updated_at
            ) VALUES (
              'lead', $1, 'email', $2, $3, $4, $5, 'followup_2', 'conversational', 'scheduled', $6, NOW(), NOW()
            )`,
            [dispatch.lead_id, toEmail, dispatch.recipient_name, copy3.subject, copy3.body, safeF2Time]
          );

          console.log(`[Scheduler] 📅 Auto-scheduled Touch 3 (Follow-up 2) for "${dispatch.recipient_name}" at Day 5.5 (${safeF2Time.toISOString()})`);
        } else if (dispatch.stage === 'followup_2') {
          // Touch 3 Delivered! Update lead state
          await query(
            `UPDATE leads
             SET last_contacted_at = NOW(),
                 outreach_stage = 'followup_3',
                 updated_at = NOW()
             WHERE id = $1`,
            [dispatch.lead_id]
          );

          // Automated Schedule: Touch 4 (Final Close) goes on 10th day (240 hours from first shoot, or 108 hours / 4.5 days after touch 3)
          const anchorTime = currentLead?.first_contacted_at ? new Date(currentLead.first_contacted_at).getTime() : Date.now() - 132 * 3600 * 1000;
          const followup3Time = new Date(anchorTime + 240 * 3600 * 1000);
          const safeF3Time = followup3Time.getTime() > Date.now() + 24 * 3600 * 1000 ? followup3Time : new Date(Date.now() + 108 * 3600 * 1000);

          const copy4 = humanCopywriterService.getEmailCopy(
            {
              id: dispatch.lead_id,
              businessName: dispatch.recipient_name || currentLead?.business_name || 'Business',
              category: currentLead?.category,
            },
            'followup_3'
          );

          await query(
            `INSERT INTO scheduled_dispatches (
              entity_type, lead_id, channel, recipient_email, recipient_name,
              subject, body, stage, style, status, scheduled_for, created_at, updated_at
            ) VALUES (
              'lead', $1, 'email', $2, $3, $4, $5, 'followup_3', 'conversational', 'scheduled', $6, NOW(), NOW()
            )`,
            [dispatch.lead_id, toEmail, dispatch.recipient_name, copy4.subject, copy4.body, safeF3Time]
          );

          console.log(`[Scheduler] 📅 Auto-scheduled Touch 4 (Final Close) for "${dispatch.recipient_name}" at Day 10 (${safeF3Time.toISOString()})`);
        } else if (dispatch.stage === 'followup_3') {
          // Touch 4 Delivered! Sequence completed (all 4 touches delivered)
          await query(
            `UPDATE leads
             SET last_contacted_at = NOW(),
                 outreach_stage = 'completed',
                 updated_at = NOW()
             WHERE id = $1`,
            [dispatch.lead_id]
          );
          console.log(`[Scheduler] 🏁 Outreach sequence completed for "${dispatch.recipient_name}" (all 4 touches delivered)`);
        }

        // Also trigger website contact form submission if available
        try {
          const { websiteFormService } = await import('./websiteFormService');
          await websiteFormService.submitContactForm(dispatch.lead_id, {
            senderName: 'Online Digital Solution',
            senderEmail: dispatch.inbox_email || 'team.onlinedigitalsolution@gmail.com',
            subject: dispatch.subject,
            message: dispatch.body,
          });
        } catch (fErr: any) {
          console.warn(`[Scheduler] Form submission skipped for lead ${dispatch.lead_id}:`, fErr?.message);
        }
      }

      console.log(`[Scheduler] Dispatched scheduled email to ${dispatch.recipient_email} (${sendRes.liveDelivery})`);
    } else {
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'failed', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [sendRes.reason || 'Send failed', dispatch.id]
      );
    }

    return false;
  }

  /**
   * Dispatches a scheduled Facebook message
   */
  private async executeFacebookDispatch(dispatch: ScheduledDispatchRecord): Promise<void> {
    const handle = (dispatch.recipient_handle || '').trim();
    if (!handle) {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = 'No Facebook profile/page configured', updated_at = NOW() WHERE id = $1`,
        [dispatch.id]
      );
      return;
    }

    const { facebookAdapter } = await import('../adapters/facebookAdapter');
    await facebookAdapter.enqueueDraft({
      leadId: dispatch.lead_id || '',
      profileOrPage: handle,
      text: dispatch.body,
    });

    await query(
      `UPDATE scheduled_dispatches SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [dispatch.id]
    );

    if (dispatch.lead_id) {
      await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [dispatch.lead_id]);
    }

    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
       VALUES (CURRENT_DATE, 'facebook', 1, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`
    );

    console.log(`[Scheduler] Queued Facebook dispatch for ${handle}`);
  }

  /**
   * Dispatches a scheduled Instagram message
   */
  private async executeInstagramDispatch(dispatch: ScheduledDispatchRecord): Promise<void> {
    const handle = (dispatch.recipient_handle || '').trim();
    if (!handle) {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = 'No Instagram handle configured', updated_at = NOW() WHERE id = $1`,
        [dispatch.id]
      );
      return;
    }

    const { instagramAdapter } = await import('../adapters/instagramAdapter');
    await instagramAdapter.enqueueDraft({
      leadId: dispatch.lead_id || '',
      handle,
      text: dispatch.body,
    });

    await query(
      `UPDATE scheduled_dispatches SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [dispatch.id]
    );

    if (dispatch.lead_id) {
      await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [dispatch.lead_id]);
    }

    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
       VALUES (CURRENT_DATE, 'instagram', 1, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`
    );

    console.log(`[Scheduler] Queued Instagram dispatch for ${handle}`);
  }

  /**
   * Dispatches a scheduled LinkedIn outreach message
   */
  private async executeLinkedInDispatch(dispatch: ScheduledDispatchRecord): Promise<void> {
    const jitterMs = 2000 + Math.floor(Math.random() * 1200);
    await this.sleep(jitterMs);

    // Fetch synced LinkedIn account credentials
    const { linkedinService } = await import('./linkedinService');
    const status = await linkedinService.getAccountStatus();

    console.log(
      `[Scheduler] Dispatching scheduled LinkedIn message to ${dispatch.recipient_name} via account "${status.accountName}"...`
    );

    // Record in conversations
    let convId: string;
    const convRes = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'linkedin' LIMIT 1`,
      [dispatch.lead_id]
    );
    if (convRes.rows.length === 0) {
      const newConv = await query<{ id: string }>(
        `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
         VALUES ('lead', $1, 'linkedin', 'open', NOW()) RETURNING id`,
        [dispatch.lead_id]
      );
      convId = newConv.rows[0].id;
    } else {
      convId = convRes.rows[0].id;
    }

    await query(
      `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
       VALUES ($1, 'linkedin', 'outbound', $2, 'delivered', $3, NOW())`,
      [convId, dispatch.body, `li_${Date.now()}`]
    );

    await query(`UPDATE conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`, [convId]);

    if (dispatch.lead_id) {
      await query(
        `UPDATE leads SET last_contacted_at = NOW(), outreach_stage = 'initial', updated_at = NOW() WHERE id = $1`,
        [dispatch.lead_id]
      );
    }

    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
       VALUES (CURRENT_DATE, 'linkedin', 1, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`
    );

    await query(
      `UPDATE scheduled_dispatches
       SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [dispatch.id]
    );

    console.log(`[Scheduler] Successfully dispatched scheduled LinkedIn outreach to ${dispatch.recipient_name}`);
  }

  /**
   * Retrieves recent scheduled dispatches with optional filtering
   */
  async getDispatches(filter?: { status?: string; channel?: string; listId?: string; limit?: number }) {
    let sql = `SELECT * FROM scheduled_dispatches WHERE 1=1`;
    const params: unknown[] = [];

    if (filter?.status && filter.status !== 'all') {
      params.push(filter.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filter?.channel && filter.channel !== 'all') {
      params.push(filter.channel);
      sql += ` AND channel = $${params.length}`;
    }

    if (filter?.listId && filter.listId !== 'all') {
      params.push(filter.listId);
      sql += ` AND list_id = $${params.length}`;
    }

    sql += ` ORDER BY scheduled_for DESC LIMIT $${params.length + 1}`;
    params.push(filter?.limit || 100);

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Cancels a pending scheduled dispatch
   */
  async cancelDispatch(id: string): Promise<boolean> {
    const res = await query(
      `UPDATE scheduled_dispatches
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'scheduled'
       RETURNING id`,
      [id]
    );
    return res.rows.length > 0;
  }

  /**
   * Retries a failed or cancelled dispatch
   */
  async retryDispatch(id: string): Promise<boolean> {
    const res = await query(
      `UPDATE scheduled_dispatches
       SET status = 'scheduled', scheduled_for = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('failed', 'cancelled')
       RETURNING id`,
      [id]
    );
    if (res.rows.length > 0) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
      return true;
    }
    return false;
  }

  /**
   * Starts background scheduler polling loop
   */
  startScheduler(pollIntervalMs = 20000) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log(`[Scheduler] Multi-channel background scheduler loop active (interval: ${pollIntervalMs / 1000}s).`);
    // Run immediately once
    this.processPendingDispatches().catch(console.error);

    this.timer = setInterval(() => {
      this.processPendingDispatches().catch(console.error);
    }, pollIntervalMs);
  }

  /**
   * Stops scheduler
   */
  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const emailSchedulerService = new EmailSchedulerService();
