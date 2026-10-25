import fs from 'fs';
import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { humanizerService } from './humanizerService';
import { humanCopywriterService } from './humanCopywriterService';
import { aiResearchWriterService } from './aiResearchWriterService';
import { workflowRoutingService } from './workflowRoutingService';
import { clientAuditService } from './clientAuditIntelligenceService';
import { technicalAuditPdfService } from './technicalAuditPdfService';
import { leadIsolationService } from './leadIsolationService';

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
   * Adjusts a target timestamp to respect standard business hours (Mon-Fri, 9:30 AM - 4:30 PM)
   */
  private calculateBusinessHoursDispatch(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 6) {
      d.setDate(d.getDate() + 2); // Saturday -> Monday
    } else if (day === 0) {
      d.setDate(d.getDate() + 1); // Sunday -> Monday
    }

    const hour = d.getHours();
    if (hour < 9) {
      d.setHours(9, 30 + Math.floor(Math.random() * 20), 0, 0);
    } else if (hour >= 17) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      d.setHours(9, 30 + Math.floor(Math.random() * 20), 0, 0);
    }
    return d;
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
      status: string;
      manual_review_reason?: string;
      website?: string;
      location?: string;
      primary_contact_name?: string;
      audit_key_takeaways?: string;
      audit_pdf_name?: string;
      audit_pdf_path?: string;
      gmb_notes?: string;
    }>(`SELECT * FROM leads WHERE id = $1`, [params.leadId]);

    if (leadRes.rows.length === 0) {
      throw new Error(`Lead with ID ${params.leadId} not found`);
    }

    const lead = leadRes.rows[0];

    // Safeguard: Check if lead is in 'Need to Check' (manual_review)
    // Requirement: "after that unless retrieved back no msg needs to sent to them."
    if (lead.status === 'manual_review') {
      throw new Error(
        `Outreach blocked: Lead is in 'Need to Check' (Manual Review: ${lead.manual_review_reason || 'Previous message failed'}). Must be retrieved/approved before sending.`
      );
    }

    // Pre-send check if older message was already sent to this lead
    // Requirement: "it should check before sending it. if older msg is there it should send follow up email."
    const history = await leadIsolationService.getLeadMessageHistory(lead.id);

    let resolvedStage: string = params.stage || 'auto';
    if (resolvedStage === 'auto' || resolvedStage === 'initial') {
      resolvedStage = history.hasPriorContact ? history.resolvedStage : 'initial';
    }

    if (resolvedStage === 'completed') {
      throw new Error(`Outreach sequence already completed (maximum touches reached) for ${lead.business_name}`);
    }

    const recipientEmail = (lead.email || '').trim();
    const recipientPhone = (lead.whatsapp || lead.phone || '').trim();
    const recipientHandle = (lead.facebook || lead.instagram || '').trim();
    let subject = params.subject?.trim() || '';
    let body = params.body?.trim() || '';

    // If body not provided, generate personalized message (follow-up if older msg exists)
    if (!body) {
      if (channel === 'email') {
        const copy = humanCopywriterService.getEmailCopy(
          {
            id: lead.id,
            businessName: lead.business_name,
            category: lead.category,
            website: lead.website,
            primaryContactName: lead.primary_contact_name,
            city: lead.location,
            auditKeyTakeaways: lead.audit_key_takeaways,
            auditPdfName: lead.audit_pdf_name,
            auditPdfPath: lead.audit_pdf_path,
            gmbNotes: lead.gmb_notes,
          },
          resolvedStage as any
        );
        subject = copy.subject;
        body = copy.body;
      } else {
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
        if (!subject) {
          subject = history.hasPriorContact
            ? `Following up: regarding ${lead.business_name}`
            : generated.subject || `Quick question regarding ${lead.business_name}`;
        }
      }
    }

    if (channel === 'email' && !subject) {
      subject = history.hasPriorContact
        ? `Following up: regarding ${lead.business_name}`
        : `Quick question regarding ${lead.business_name}`;
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
        resolvedStage,
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
      intervalSeconds = channel === 'whatsapp' ? 45 : channel === 'email' ? 180 : 30,
      style = 'conversational',
      stage = 'initial',
      customInstructions,
    } = params;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      throw new Error('At least one lead must be selected for scheduling');
    }

    // Fetch leads (filtering out deleted leads and manual_review 'Need to Check' leads)
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
      website?: string;
      location?: string;
      audit_key_takeaways?: string;
      audit_pdf_name?: string;
      audit_pdf_path?: string;
      gmb_notes?: string;
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
              outreach_stage,
              website,
              location,
              audit_key_takeaways,
              audit_pdf_name,
              audit_pdf_path,
              gmb_notes
       FROM leads
       WHERE id = ANY($1::uuid[])
         AND deleted_at IS NULL
         AND status != 'manual_review'
         AND (consent_status IS NULL OR consent_status NOT IN ('opted_out', 'unsubscribed'))
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
        message: `None of the selected leads have valid contact details for ${channel.toUpperCase()} (or all selected are in Need to Check).`,
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

    const seenLeadIds = new Set<string>();
    const seenDestinations = new Set<string>();
    const deduplicatedLeads = eligibleLeads.filter((lead) => {
      if (seenLeadIds.has(lead.id)) return false;
      seenLeadIds.add(lead.id);

      const dest =
        channel === 'email'
          ? (lead.email || '').toLowerCase().trim()
          : (lead.whatsapp || lead.phone || '').replace(/\D/g, '');
      if (dest && seenDestinations.has(dest)) return false;
      if (dest) seenDestinations.add(dest);

      return true;
    });

    for (let i = 0; i < deduplicatedLeads.length; i++) {
      const lead = deduplicatedLeads[i];
      const recipientName = (lead.primary_contact_name || lead.business_name || '').trim();
      const recipientEmail = channel === 'email' ? lead.email.trim() : null;
      const recipientPhone = channel === 'whatsapp' ? (lead.whatsapp || lead.phone || '').trim() : null;
      const recipientHandle =
        channel === 'facebook' ? lead.facebook.trim() : channel === 'instagram' ? lead.instagram.trim() : null;

      try {
        // Pre-send check if older message exists for this lead
        // Requirement: "it should check before sending it. if older msg is there it should send follow up email."
        const history = await leadIsolationService.getLeadMessageHistory(lead.id);

        if (history.resolvedStage === 'completed') {
          console.log(`[Scheduler] Lead ${lead.id} (${lead.business_name}) has completed sequence. Skipping.`);
          continue;
        }

        // Avoid duplicate active scheduled dispatches for the same lead/recipient
        const existingScheduled = await query<{ id: string }>(
          `SELECT id FROM scheduled_dispatches 
           WHERE (lead_id = $1 OR ($2 != '' AND LOWER(recipient_email) = LOWER($2)))
             AND channel = $3 
             AND status = 'scheduled'
           LIMIT 1`,
          [lead.id, recipientEmail || '', channel]
        );
        if (existingScheduled.rows.length > 0) {
          console.log(`[Scheduler] Lead ${lead.id} (${recipientEmail}) already has a pending scheduled dispatch. Skipping duplicate.`);
          continue;
        }

        const staggerMs = insertedCount * intervalSeconds * 1000;
        const leadTargetTime = new Date(baseTime.getTime() + staggerMs);
        lastScheduledAt = leadTargetTime;

        let targetStage = stage;
        if (targetStage === 'auto' || targetStage === 'initial') {
          targetStage = history.hasPriorContact ? history.resolvedStage : 'initial';
        }

        let subject = '';
        let body = '';

        if (channel === 'email') {
          const copy = humanCopywriterService.getEmailCopy(
            {
              id: lead.id,
              businessName: lead.business_name,
              category: lead.category,
              website: lead.website,
              primaryContactName: lead.primary_contact_name,
              city: lead.location,
              auditKeyTakeaways: lead.audit_key_takeaways,
              auditPdfName: lead.audit_pdf_name,
              auditPdfPath: lead.audit_pdf_path,
              gmbNotes: lead.gmb_notes,
            },
            targetStage as any
          );
          subject = copy.subject;
          body = copy.body;
        } else {
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
          body = aiOutreach.body;
          subject = history.hasPriorContact
            ? `Following up: regarding ${lead.business_name}`
            : aiOutreach.subject || `Quick question regarding ${lead.business_name}`;
        }

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
            subject,
            body,
            targetStage,
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
      intervalSeconds = params.intervalSeconds ?? (channel === 'email' ? 180 : (channel === 'whatsapp' ? 45 : 25)),
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
      website?: string;
      location?: string;
      category: string;
      notes: string;
      outreach_stage: string;
      status: string;
      audit_status?: string;
      audit_score?: number;
      audit_key_takeaways?: string;
      audit_pdf_name?: string;
      audit_pdf_path?: string;
      gmb_notes?: string;
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
              l.website,
              l.location,
              l.category,
              l.notes,
              l.outreach_stage,
              l.status,
              l.audit_status,
              l.audit_score,
              l.audit_key_takeaways,
              l.audit_pdf_name,
              l.audit_pdf_path,
              l.gmb_notes
       FROM lead_list_memberships m
       JOIN leads l ON l.id = m.lead_id
       WHERE m.list_id = $1
         AND l.deleted_at IS NULL
         AND l.status != 'manual_review'
         AND (l.consent_status IS NULL OR l.consent_status NOT IN ('opted_out', 'unsubscribed'))
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

    const seenLeadIds = new Set<string>();
    const seenDestinations = new Set<string>();
    const deduplicatedLeads = eligibleLeads.filter((lead) => {
      if (seenLeadIds.has(lead.id)) return false;
      seenLeadIds.add(lead.id);

      const dest =
        channel === 'email'
          ? (lead.email || '').toLowerCase().trim()
          : (lead.whatsapp || lead.phone || '').replace(/\D/g, '');
      if (dest && seenDestinations.has(dest)) return false;
      if (dest) seenDestinations.add(dest);

      return true;
    });

    let insertedCount = 0;

    for (let i = 0; i < deduplicatedLeads.length; i++) {
      const lead = deduplicatedLeads[i];
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

      try {
        // Pre-send check if older message exists for this lead
        // Requirement: "it should check before sending it. if older msg is there it should send follow up email."
        const history = await leadIsolationService.getLeadMessageHistory(lead.id);

        if (history.resolvedStage === 'completed') {
          console.log(`[Scheduler] Lead ${lead.id} (${lead.business_name}) has completed sequence. Skipping.`);
          continue;
        }

        // Avoid duplicate active scheduled dispatches for the same lead/recipient
        const existingScheduled = await query<{ id: string }>(
          `SELECT id FROM scheduled_dispatches 
           WHERE (lead_id = $1 OR ($2 != '' AND LOWER(recipient_email) = LOWER($2)))
             AND channel = $3 
             AND status = 'scheduled'
           LIMIT 1`,
          [lead.id, recipientEmail || '', channel]
        );
        if (existingScheduled.rows.length > 0) {
          console.log(`[Scheduler] Lead ${lead.id} (${recipientEmail}) already has a pending scheduled dispatch. Skipping duplicate.`);
          continue;
        }

        // Assign rotational inbox for 50/50 distribution based on actually inserted dispatches
        let assignedInboxId: string | null = null;
        let assignedInboxEmail: string | null = null;
        if (channel === 'email' && params.inboxIds && params.inboxIds.length > 0) {
          assignedInboxId = params.inboxIds[insertedCount % params.inboxIds.length];
          assignedInboxEmail = inboxMap.get(assignedInboxId) || null;
        }

        const staggerMs = insertedCount * intervalSeconds * 1000;
        const leadTargetTime = new Date(baseTime.getTime() + staggerMs);

        let targetStage: string = stage === 'auto' ? history.resolvedStage : stage;
        if (targetStage === 'initial' && history.hasPriorContact) {
          targetStage = history.resolvedStage;
        }

        let subject = '';
        let body = '';

        if (channel === 'email') {
          const copy = humanCopywriterService.getEmailCopy(
            {
              id: lead.id,
              businessName: lead.business_name,
              category: lead.category,
              website: lead.website,
              primaryContactName: lead.primary_contact_name,
              city: lead.location,
              auditScore: lead.audit_score ? Number(lead.audit_score) : undefined,
              auditKeyTakeaways: lead.audit_key_takeaways,
              auditPdfName: lead.audit_pdf_name,
              auditPdfPath: lead.audit_pdf_path,
              gmbNotes: lead.gmb_notes,
            },
            targetStage as any
          );
          subject = copy.subject;
          body = copy.body;
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
          subject = history.hasPriorContact
            ? `Following up: regarding ${lead.business_name}`
            : aiOutreach.subject || '';
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

    // Requirement: "if a list is selected and scheduled it show automatically run the audit for each site. Time for sending eaach email is 2 mins. in the meantime TA will do audit give you data you will append with email based on the satatus and send to propsects."
    if (channel === 'email') {
      this.runBackgroundAuditsForList(deduplicatedLeads, list.id).catch((err) =>
        console.error('[Scheduler] runBackgroundAuditsForList error:', err)
      );
    }

    if (baseTime.getTime() <= Date.now() + 5000) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
    }

    const intervalMinutes = Math.round(intervalSeconds / 60);
    const intervalDesc = intervalSeconds >= 60 ? `${intervalMinutes}-minute` : `${intervalSeconds}-second`;

    return {
      success: true,
      scheduledCount: insertedCount,
      listName: list.name,
      channel,
      scheduledFor: baseTime,
      message: `Successfully scheduled ${insertedCount} ${channel.toUpperCase()} message(s) staggered across ${intervalDesc} intervals. TA audits will automatically run for each site and append to outreach.`,
    };
  }

  /**
   * Automatically executes TA website audits for leads in a scheduled list in the background.
   * Compiles the audit findings, generates the branded audit PDF, updates the lead record,
   * and dynamically appends the fresh audit findings to the scheduled dispatch before its 2-minute send timer fires.
   */
  public async runBackgroundAuditsForList(
    leads: Array<{
      id: string;
      business_name: string;
      website?: string;
      category?: string;
      location?: string;
      primary_contact_name?: string;
      audit_status?: string;
      audit_pdf_path?: string;
    }>,
    listId: string
  ): Promise<void> {
    const leadsNeedingAudit = leads.filter(
      (l) =>
        l.website &&
        workflowRoutingService.hasValidWebsite(l.website) &&
        (l.audit_status !== 'audit_completed' || !l.audit_pdf_path)
    );

    if (leadsNeedingAudit.length === 0) {
      console.log(`[Scheduler TA Engine] All sites in list ${listId} already possess completed audit reports.`);
      return;
    }

    console.log(
      `[Scheduler TA Engine] 🚀 Automatically kicking off background audits for ${leadsNeedingAudit.length} site(s) in list "${listId}"...`
    );

    // Process with bounded concurrency pool of 2 workers
    const concurrency = 2;
    let cursor = 0;

    const worker = async (workerId: number) => {
      while (cursor < leadsNeedingAudit.length) {
        const lead = leadsNeedingAudit[cursor++];
        if (!lead || !lead.website) continue;

        try {
          console.log(
            `[Scheduler TA Worker ${workerId}] 🔍 Auditing ${lead.business_name} (${lead.website})...`
          );
          const auditReport = await clientAuditService.auditWebsite(lead.website);
          const pdfGen = await technicalAuditPdfService.generateAuditPdf(auditReport, lead.business_name);
          const takeaways =
            auditReport.auditKeyTakeaways ||
            auditReport.criticalIssues.slice(0, 2).join(' and ') ||
            'Core Web Vitals bottlenecks and missing structured schema';

          await query(
            `UPDATE leads
             SET status = 'active',
                 audit_status = 'audit_completed',
                 audit_score = $1,
                 audit_key_takeaways = $2,
                 audit_pdf_name = $3,
                 audit_pdf_path = $4,
                 audit_payload = $5,
                 updated_at = NOW()
             WHERE id = $6`,
            [
              auditReport.overallScore,
              takeaways,
              pdfGen.pdfName,
              pdfGen.pdfPath,
              JSON.stringify(auditReport),
              lead.id,
            ]
          );

          // Dynamically append fresh TA audit findings & PDF name to any pending scheduled dispatches for this lead
          const pendingDispatches = await query<{ id: string; stage: string }>(
            `SELECT id, stage FROM scheduled_dispatches
             WHERE lead_id = $1 AND channel = 'email' AND status = 'scheduled'`,
            [lead.id]
          );

          for (const d of pendingDispatches.rows) {
            const updatedCopy = humanCopywriterService.getEmailCopy(
              {
                id: lead.id,
                businessName: lead.business_name,
                category: lead.category,
                website: lead.website,
                primaryContactName: lead.primary_contact_name,
                city: lead.location,
                auditScore: auditReport.overallScore,
                auditKeyTakeaways: takeaways,
                auditPdfName: pdfGen.pdfName,
                auditPdfPath: pdfGen.pdfPath,
              },
              d.stage as any
            );

            await query(
              `UPDATE scheduled_dispatches
               SET subject = $1,
                   body = $2,
                   updated_at = NOW()
               WHERE id = $3`,
              [updatedCopy.subject, updatedCopy.body, d.id]
            );
          }

          console.log(
            `[Scheduler TA Worker ${workerId}] ✅ TA audit completed for ${lead.business_name} (${lead.website}): Score ${auditReport.overallScore}/100, PDF: ${pdfGen.pdfName}. Appended to scheduled email!`
          );
        } catch (auditErr: any) {
          console.warn(
            `[Scheduler TA Worker ${workerId}] ⚠️ Auto-audit skipped for ${lead.business_name} (${lead.website}):`,
            auditErr?.message
          );
        }
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, leadsNeedingAudit.length) }, (_, i) => worker(i + 1));
    await Promise.all(pool);
    console.log(`[Scheduler TA Engine] 🏁 Completed background audits for list "${listId}".`);
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

    // Safety Pre-flight Check: If lead has already replied, opted out, in manual review, or was deleted, cancel immediately
    if (dispatch.lead_id) {
      const checkRes = await query<{
        status: string;
        manual_review_reason?: string;
        consent_status: string;
        deleted_at: string | null;
        has_replied: boolean;
      }>(
        `SELECT l.status, l.manual_review_reason, l.consent_status, l.deleted_at,
           (
             l.consent_status = 'replied' OR
             EXISTS (
               SELECT 1 FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               WHERE c.lead_id = l.id AND m.direction = 'inbound'
             )
           ) as has_replied
         FROM leads l WHERE l.id = $1`,
        [dispatch.lead_id]
      );
      const leadRow = checkRes.rows[0];
      if (leadRow) {
        if (leadRow.status === 'manual_review') {
          console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} is quarantined in 'Need to Check'. Cancelling scheduled WhatsApp dispatch.`);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'cancelled',
                 error_message = 'Cancelled: Lead is in Need to Check (manual_review)',
                 updated_at = NOW()
             WHERE (lead_id = $1 OR recipient_phone = $2)
               AND status IN ('scheduled', 'processing')`,
            [dispatch.lead_id, rawPhone]
          );
          return;
        }

        if (leadRow.has_replied || leadRow.consent_status === 'replied') {
          console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} (${rawPhone}) has replied. Suppressing WhatsApp outreach.`);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'cancelled',
                 error_message = 'Cancelled: Prospect replied to outreach',
                 updated_at = NOW()
             WHERE (lead_id = $1 OR recipient_phone = $2)
               AND status IN ('scheduled', 'processing')`,
            [dispatch.lead_id, rawPhone]
          );
          return;
        }

        if (leadRow.consent_status === 'opted_out' || leadRow.consent_status === 'unsubscribed' || leadRow.deleted_at) {
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'cancelled',
                 error_message = 'Cancelled: Lead opted out or deleted',
                 updated_at = NOW()
             WHERE (lead_id = $1 OR recipient_phone = $2)
               AND status IN ('scheduled', 'processing')`,
            [dispatch.lead_id, rawPhone]
          );
          return;
        }
      }
    }

    const { whatsappValidator } = await import('./whatsappValidator');
    const waEval = whatsappValidator.evaluate({ phone: rawPhone, whatsapp: rawPhone });
    if (!waEval.isEligible || !waEval.cleanNumber) {
      await query(
        `UPDATE scheduled_dispatches SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [waEval.reason || 'Invalid WhatsApp phone format', dispatch.id]
      );
      if (dispatch.lead_id) {
        await leadIsolationService.isolateFailedLead(
          dispatch.lead_id,
          waEval.reason || 'Invalid WhatsApp phone format'
        );
      }
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

      if (dispatch.lead_id) {
        await leadIsolationService.isolateFailedLead(
          dispatch.lead_id,
          sendResult.error || 'Scheduled WhatsApp message send failed'
        );
      }
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

    // Enforce 20 emails per hour rate limit across all scheduled campaigns
    const hourlyCheck = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM scheduled_dispatches 
       WHERE channel = 'email' AND status = 'sent' AND sent_at >= NOW() - INTERVAL '1 hour'`
    );
    const sentInLastHour = parseInt(hourlyCheck.rows[0]?.count || '0', 10);
    if (sentInLastHour >= 20) {
      console.log(
        `[Scheduler] ⏳ Hourly rate cap reached (20 emails/hour max, currently ${sentInLastHour} sent in last hour). Deferring dispatch for ${toEmail}.`
      );
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'scheduled',
             scheduled_for = NOW() + INTERVAL '3 minutes',
             updated_at = NOW()
         WHERE id = $1`,
        [dispatch.id]
      );
      return true; // Stop email loop for this tick
    }

    // Enforce "one by one" sequential sending: ensure at least 170 seconds have elapsed since previous sent email
    const lastSentRes = await query<{ sent_at: Date }>(
      `SELECT sent_at FROM scheduled_dispatches 
       WHERE channel = 'email' AND status = 'sent' 
       ORDER BY sent_at DESC LIMIT 1`
    );
    if (lastSentRes.rows.length > 0 && lastSentRes.rows[0].sent_at) {
      const elapsedMs = Date.now() - new Date(lastSentRes.rows[0].sent_at).getTime();
      const minIntervalMs = 170 * 1000; // ~3 minutes (180s)
      if (elapsedMs < minIntervalMs) {
        const remainingSec = Math.ceil((180 * 1000 - elapsedMs) / 1000);
        console.log(
          `[Scheduler] ⏱️ Pacing: Previous email sent ${Math.round(elapsedMs / 1000)}s ago. Sending one by one; waiting ${remainingSec}s.`
        );
        await query(
          `UPDATE scheduled_dispatches
           SET status = 'scheduled',
               scheduled_for = NOW() + ($1 || ' seconds')::interval,
               updated_at = NOW()
           WHERE id = $2`,
          [Math.max(10, remainingSec), dispatch.id]
        );
        return true; // Stop email processing for this tick; next runner loop will dispatch it
      }
    }

    // Safety Pre-flight Check: If lead has already replied, opted out, or was deleted, cancel immediately
    let leadAttachments: Array<{ filename: string; path?: string }> | undefined = undefined;
    if (dispatch.lead_id) {
      const checkRes = await query<{
        business_name: string;
        consent_status: string;
        status: string;
        audit_status: string;
        website?: string;
        category?: string;
        location?: string;
        audit_score?: number;
        deleted_at: string | null;
        has_replied: boolean;
        audit_pdf_path?: string;
        audit_pdf_name?: string;
        audit_key_takeaways?: string;
      }>(
        `SELECT l.business_name, l.consent_status, l.status, l.audit_status, l.website, l.category, l.location, l.audit_score, l.deleted_at, l.audit_pdf_path, l.audit_pdf_name, l.audit_key_takeaways,
           (
             l.consent_status = 'replied' OR
             EXISTS (
               SELECT 1 FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               WHERE c.lead_id = l.id AND m.direction = 'inbound'
             ) OR
             EXISTS (
               SELECT 1 FROM processed_inbound_emails pie
               WHERE (pie.matched_entity_id = l.id OR LOWER(pie.sender_email) = LOWER(l.email) OR LOWER(pie.sender_email) = LOWER($2))
                 AND pie.matched_entity_type = 'lead'
             )
           ) as has_replied
         FROM leads l WHERE l.id = $1`,
        [dispatch.lead_id, toEmail]
      );
      const leadRow = checkRes.rows[0];
      if (leadRow) {
        // State Locking & Auto-Resolution: Workflow A leads require a verified audit & PDF before cold email dispatch.
        if (leadRow.status === 'pending_audit' || leadRow.audit_status === 'pending_audit') {
          if (leadRow.website && workflowRoutingService.hasValidWebsite(leadRow.website)) {
            try {
              console.log(`[Scheduler] ⚡ Auto-resolving pending audit on-the-fly for ${leadRow.business_name} (${leadRow.website})...`);
              const auditReport = await clientAuditService.auditWebsite(leadRow.website);
              const pdfResult = await technicalAuditPdfService.generateAuditPdf(auditReport, leadRow.business_name);
              const takeaways = auditReport.auditKeyTakeaways || auditReport.criticalIssues.slice(0, 2).join(' and ');

              await query(
                `UPDATE leads SET
                  status = 'active',
                  audit_status = 'audit_completed',
                  audit_score = $1,
                  audit_key_takeaways = $2,
                  audit_pdf_name = $3,
                  audit_pdf_path = $4,
                  updated_at = NOW()
                 WHERE id = $5`,
                [auditReport.overallScore, takeaways, pdfResult.pdfName, pdfResult.pdfPath, dispatch.lead_id]
              );

              leadRow.status = 'active';
              leadRow.audit_status = 'audit_completed';
              leadRow.audit_score = auditReport.overallScore;
              leadRow.audit_key_takeaways = takeaways;
              leadRow.audit_pdf_name = pdfResult.pdfName;
              leadRow.audit_pdf_path = pdfResult.pdfPath;
            } catch (autoErr: any) {
              console.log(`[Scheduler] State Locking: Lead ${dispatch.lead_id} is in PENDING_AUDIT state and auto-audit failed: ${autoErr?.message}`);
              return false;
            }
          } else {
            console.log(`[Scheduler] State Locking: Lead ${dispatch.lead_id} is in PENDING_AUDIT state without valid website. Suppressing dispatch.`);
            return false;
          }
        }

        if (leadRow.audit_pdf_path) {
          const pdfVal = workflowRoutingService.validateAuditPdf(leadRow.audit_pdf_path, leadRow.website);
          if (pdfVal.isValid) {
            leadAttachments = [{
              filename: leadRow.audit_pdf_name || pdfVal.filename || 'Technical_Audit_Report.pdf',
              path: leadRow.audit_pdf_path,
            }];
          }
        }

        // Auto-compile missing audit PDF on-the-fly if needed for Workflow A leads
        if (!leadAttachments && leadRow.website && workflowRoutingService.hasValidWebsite(leadRow.website)) {
          try {
            console.log(`[Scheduler] Auto-compiling missing audit PDF for lead ${leadRow.business_name}...`);
            const auditReport = await clientAuditService.auditWebsite(leadRow.website);
            const pdfGen = await technicalAuditPdfService.generateAuditPdf(auditReport, leadRow.business_name);
            leadAttachments = [{
              filename: pdfGen.pdfName,
              path: pdfGen.pdfPath,
            }];
            await query(
              `UPDATE leads SET audit_score = $1, audit_key_takeaways = $2, audit_pdf_name = $3, audit_pdf_path = $4 WHERE id = $5`,
              [auditReport.overallScore, auditReport.auditKeyTakeaways, pdfGen.pdfName, pdfGen.pdfPath, dispatch.lead_id]
            );
            leadRow.audit_score = auditReport.overallScore;
            leadRow.audit_key_takeaways = auditReport.auditKeyTakeaways;
            leadRow.audit_pdf_name = pdfGen.pdfName;
            leadRow.audit_pdf_path = pdfGen.pdfPath;
          } catch (_) {}
        }

        if (leadRow.has_replied || leadRow.consent_status === 'replied') {
          console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} (${toEmail}) has replied to outreach. Suppressing Shoot stage "${dispatch.stage}".`);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'cancelled',
                 error_message = 'Cancelled: Prospect replied to outreach',
                 updated_at = NOW()
             WHERE (lead_id = $1 OR LOWER(recipient_email) = LOWER($2))
               AND status IN ('scheduled', 'processing')`,
            [dispatch.lead_id, toEmail]
          );
          await query(
            `UPDATE leads
             SET consent_status = 'replied', updated_at = NOW()
             WHERE id = $1 AND consent_status != 'replied'`,
            [dispatch.lead_id]
          );
          return false;
        }

        // Safeguard: Check if lead is in 'Need to Check' (manual_review)
        // Requirement: "after that unless retrieved back no msg needs to sent to them."
        if (leadRow.status === 'manual_review') {
          console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} is quarantined in 'Need to Check' (manual_review). Cancelling scheduled dispatch.`);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'cancelled',
                 error_message = 'Cancelled: Lead is in Need to Check (manual_review)',
                 updated_at = NOW()
             WHERE (lead_id = $1 OR LOWER(recipient_email) = LOWER($2))
               AND status IN ('scheduled', 'processing')`,
            [dispatch.lead_id, toEmail]
          );
          return false;
        }

        if (leadRow.consent_status === 'opted_out' || leadRow.consent_status === 'unsubscribed' || leadRow.deleted_at) {
          console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} (${toEmail}) is opted out or deleted. Suppressing Shoot stage "${dispatch.stage}".`);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'cancelled',
                 error_message = 'Cancelled: Lead opted out or deleted',
                 updated_at = NOW()
             WHERE (lead_id = $1 OR LOWER(recipient_email) = LOWER($2))
               AND status IN ('scheduled', 'processing')`,
            [dispatch.lead_id, toEmail]
          );
          return false;
        }

        // Pre-send check: If this was scheduled as 'initial' but an older message has been sent, automatically switch to follow-up!
        // Requirement: "it should check before sending it. if older msg is there it should send follow up email."
        if (dispatch.stage === 'initial') {
          const history = await leadIsolationService.getLeadMessageHistory(dispatch.lead_id);
          if (history.hasPriorContact) {
            console.log(
              `[Scheduler] ⚡ Older message detected for lead ${dispatch.lead_id} before dispatch. Automatically switching from initial to follow-up stage (${history.resolvedStage}).`
            );
            dispatch.stage = history.resolvedStage;
            const followCopy = humanCopywriterService.getEmailCopy(
              {
                id: dispatch.lead_id,
                businessName: dispatch.recipient_name || leadRow.business_name || 'Business',
                category: leadRow.category,
                website: leadRow.website,
                city: leadRow.location,
                auditScore: leadRow.audit_score ? Number(leadRow.audit_score) : undefined,
                auditKeyTakeaways: leadRow.audit_key_takeaways,
                auditPdfName: leadRow.audit_pdf_name,
                auditPdfPath: leadRow.audit_pdf_path,
              },
              history.resolvedStage as any
            );
            dispatch.subject = followCopy.subject;
            dispatch.body = followCopy.body;
          } else if (leadRow.website && workflowRoutingService.hasValidWebsite(leadRow.website)) {
            // Requirement: "TA will do audit give you data you will append with email based on the status and send to prospects"
            // Ensure email body contains the latest TA findings & audit score before sending
            const freshCopy = humanCopywriterService.getEmailCopy(
              {
                id: dispatch.lead_id,
                businessName: dispatch.recipient_name || leadRow.business_name || 'Business',
                category: leadRow.category,
                website: leadRow.website,
                city: leadRow.location,
                auditScore: leadRow.audit_score ? Number(leadRow.audit_score) : undefined,
                auditKeyTakeaways: leadRow.audit_key_takeaways,
                auditPdfName: leadRow.audit_pdf_name,
                auditPdfPath: leadRow.audit_pdf_path,
              },
              'initial'
            );
            dispatch.subject = freshCopy.subject;
            dispatch.body = freshCopy.body;
          }
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
      attachments: leadAttachments,
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

          // Automated Schedule: Touch 2 goes on Day 3 (72 hours from first shoot) during business hours
          const followup1Time = this.calculateBusinessHoursDispatch(new Date(Date.now() + 72 * 3600 * 1000));
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

          console.log(`[Scheduler] 📅 Auto-scheduled Touch 2 (Follow-up 1) for "${dispatch.recipient_name}" at Day 3 (${followup1Time.toISOString()})`);
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

          // Automated Schedule: Touch 3 goes on Day 6 (72 hours after Touch 2) during business hours
          const followup2Time = this.calculateBusinessHoursDispatch(new Date(Date.now() + 72 * 3600 * 1000));

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
            [dispatch.lead_id, toEmail, dispatch.recipient_name, copy3.subject, copy3.body, followup2Time]
          );

          console.log(`[Scheduler] 📅 Auto-scheduled Touch 3 (Follow-up 2) for "${dispatch.recipient_name}" at Day 6 (${followup2Time.toISOString()})`);
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

          // Automated Schedule: Touch 4 (Final Close) goes on Day 10 (96 hours after Touch 3) during business hours
          const followup3Time = this.calculateBusinessHoursDispatch(new Date(Date.now() + 96 * 3600 * 1000));

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
            [dispatch.lead_id, toEmail, dispatch.recipient_name, copy4.subject, copy4.body, followup3Time]
          );

          console.log(`[Scheduler] 📅 Auto-scheduled Touch 4 (Final Close) for "${dispatch.recipient_name}" at Day 10 (${followup3Time.toISOString()})`);
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
            senderName: 'Cloud Consultancy',
            senderEmail: dispatch.inbox_email || 'info@cloudconsultancy.in',
            subject: dispatch.subject,
            message: dispatch.body,
          });
        } catch (fErr: any) {
          console.warn(`[Scheduler] Form submission skipped for lead ${dispatch.lead_id}:`, fErr?.message);
        }
      }

      console.log(`[Scheduler] Dispatched scheduled email to ${dispatch.recipient_email} (${sendRes.liveDelivery})`);
      return true; // Enforce one-by-one sequential sending (next email waits for 180s interval)
    } else {
      await query(
        `UPDATE scheduled_dispatches
         SET status = 'failed', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [sendRes.reason || 'Send failed', dispatch.id]
      );

      // Requirement: "if msg is failed lead should directly removed from list and move to need to check after that unless retrieved back no msg needs to sent to them."
      if (dispatch.lead_id) {
        await leadIsolationService.isolateFailedLead(
          dispatch.lead_id,
          sendRes.reason || 'Scheduled email dispatch failed'
        );
      }
    }

    return false;
  }

  /**
   * Dispatches a scheduled Facebook message
   */
  private async executeFacebookDispatch(dispatch: ScheduledDispatchRecord): Promise<void> {
    if (dispatch.lead_id) {
      const reviewCheck = await leadIsolationService.isLeadInManualReview(dispatch.lead_id);
      if (reviewCheck.inReview) {
        console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} is in Need to Check. Cancelling Facebook dispatch.`);
        await query(
          `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Cancelled: Lead in Need to Check', updated_at = NOW() WHERE id = $1`,
          [dispatch.id]
        );
        return;
      }
    }

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
    if (dispatch.lead_id) {
      const reviewCheck = await leadIsolationService.isLeadInManualReview(dispatch.lead_id);
      if (reviewCheck.inReview) {
        console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} is in Need to Check. Cancelling Instagram dispatch.`);
        await query(
          `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Cancelled: Lead in Need to Check', updated_at = NOW() WHERE id = $1`,
          [dispatch.id]
        );
        return;
      }
    }

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
    if (dispatch.lead_id) {
      const reviewCheck = await leadIsolationService.isLeadInManualReview(dispatch.lead_id);
      if (reviewCheck.inReview) {
        console.log(`[Scheduler] Safety: Lead ${dispatch.lead_id} is in Need to Check. Cancelling LinkedIn dispatch.`);
        await query(
          `UPDATE scheduled_dispatches SET status = 'cancelled', error_message = 'Cancelled: Lead in Need to Check', updated_at = NOW() WHERE id = $1`,
          [dispatch.id]
        );
        return;
      }
    }

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
   * Deletes all failed dispatches in bulk, or specific failed dispatches by ID
   */
  async deleteFailedDispatches(ids?: string[]): Promise<number> {
    if (ids && ids.length > 0) {
      const res = await query(
        `DELETE FROM scheduled_dispatches WHERE id = ANY($1) AND status = 'failed' RETURNING id`,
        [ids]
      );
      return res.rowCount || res.rows.length;
    }
    const res = await query(
      `DELETE FROM scheduled_dispatches WHERE status = 'failed' RETURNING id`
    );
    return res.rowCount || res.rows.length;
  }

  /**
   * Deletes dispatches by list of IDs
   */
  async deleteDispatches(ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    const res = await query(
      `DELETE FROM scheduled_dispatches WHERE id = ANY($1) RETURNING id`,
      [ids]
    );
    return res.rowCount || res.rows.length;
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
