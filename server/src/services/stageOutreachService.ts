import fs from 'fs';
import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { humanCopywriterService } from './humanCopywriterService';
import { whatsappValidator } from './whatsappValidator';
import { whatsappSessionService } from './whatsappSessionService';
import { workflowRoutingService } from './workflowRoutingService';
import { clientAuditService } from './clientAuditIntelligenceService';
import { technicalAuditPdfService } from './technicalAuditPdfService';
import { leadIsolationService } from './leadIsolationService';

export interface StageDispatchResult {
  leadId: string;
  businessName: string;
  email?: string;
  phone?: string;
  stage: 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'completed';
  stageLabel: string;
  subject: string;
  success: boolean;
  liveDelivery?: string;
  skipped?: boolean;
  reason?: string;
  channelsDispatched?: ('email' | 'website_form' | 'whatsapp')[];
  emailResult?: {
    success: boolean;
    skipped?: boolean;
    reason?: string;
    liveDelivery?: string;
  };
  websiteFormSubmission?: {
    success: boolean;
    skipped: boolean;
    status?: string;
    formUrl?: string;
    reason?: string;
    directLauncherUrl?: string;
  };
  whatsappResult?: {
    success: boolean;
    skipped?: boolean;
    status?: 'sent' | 'queued' | 'click_to_chat';
    reason?: string;
    url?: string;
  };
}

export class StageOutreachService {
  /**
   * Determine a lead's current outreach stage based on prior outbound touches and stored stage.
   * Requirement: Pre-send check if a message has already been sent to this lead.
   * If an older message is there, automatically select follow-up stage copy.
   */
  async getLeadStage(leadId: string): Promise<{
    stage: 'initial' | 'followup_1' | 'followup_2' | 'followup_3' | 'completed';
    stageLabel: string;
    nextStepLabel: string;
    sentCount: number;
    outboundCount?: number;
    subject: string;
    body: string;
    isBlocked?: boolean;
    blockReason?: string;
  }> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      category: string;
      email: string;
      outreach_stage: string | null;
      consent_status: string;
      status: string;
      manual_review_reason?: string;
      website?: string;
      location?: string;
      primary_contact_name?: string;
      audit_key_takeaways?: string;
      audit_pdf_name?: string;
      audit_pdf_path?: string;
      gmb_notes?: string;
    }>(
      `SELECT id, business_name, category, email, outreach_stage, consent_status, status, manual_review_reason, website, location, primary_contact_name, audit_key_takeaways, audit_pdf_name, audit_pdf_path, gmb_notes FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadRes.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadRes.rows[0];

    // Check message history across outbound messages, sent scheduled dispatches, and contact timestamps
    const history = await leadIsolationService.getLeadMessageHistory(leadId);
    const effectiveTouchCount = history.effectiveTouchCount;

    // If lead is currently quarantined in 'Need to Check' (manual_review), block outreach
    if (lead.status === 'manual_review') {
      return {
        stage: history.resolvedStage,
        stageLabel: 'Need to Check (Manual Review)',
        nextStepLabel: 'Blocked (In Need to Check - Retrieve Lead to Resume)',
        sentCount: effectiveTouchCount,
        outboundCount: effectiveTouchCount,
        subject: `[Blocked in Need to Check]`,
        body: ``,
        isBlocked: true,
        blockReason: `Lead is in 'Need to Check' (Manual Review: ${lead.manual_review_reason || 'Previous message failed'}). No messages can be sent unless retrieved back.`,
      };
    }

    if (effectiveTouchCount >= 4 || lead.outreach_stage === 'completed') {
      return {
        stage: 'completed',
        stageLabel: 'Sequence Completed',
        nextStepLabel: 'Sequence Completed (4 touches sent)',
        sentCount: effectiveTouchCount,
        outboundCount: effectiveTouchCount,
        subject: `Sequence Completed`,
        body: ``,
      };
    }

    // Resolved stage is strictly based on whether older messages exist
    const resolvedStage = history.resolvedStage;

    const stageLabel =
      resolvedStage === 'initial'
        ? 'First Message Needed'
        : resolvedStage === 'followup_1'
        ? 'Follow-up 1 Due (Day 2.5)'
        : resolvedStage === 'followup_2'
        ? 'Follow-up 2 Due (Day 5.5)'
        : 'Final Message Due (Day 10)';

    const nextStepLabel =
      resolvedStage === 'initial'
        ? 'Shoot First Message (Intro)'
        : resolvedStage === 'followup_1'
        ? 'Shoot Follow-up 1 (Day 2.5 Check-in)'
        : resolvedStage === 'followup_2'
        ? 'Shoot Follow-up 2 (Day 5.5 Value Nudge)'
        : 'Shoot Follow-up 3 (Day 10 Permission Close)';

    const generated = humanCopywriterService.getEmailCopy(
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
      resolvedStage === 'completed' ? 'followup_3' : resolvedStage
    );

    return {
      stage: resolvedStage,
      stageLabel,
      nextStepLabel,
      sentCount: effectiveTouchCount,
      outboundCount: effectiveTouchCount,
      subject: generated.subject,
      body: generated.body,
    };
  }

  /**
   * Automatically dispatch the next appropriate stage touch to a single lead
   * Supports omni-channel execution: Email + Website Form + WhatsApp
   */
  async sendNextStageToLead(leadId: string): Promise<StageDispatchResult> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      category: string;
      email: string;
      phone: string;
      whatsapp: string;
      website: string;
      notes: string;
      metadata: any;
      status: string;
      consent_status: string;
      outreach_stage: string | null;
      outreach_workflow: string | null;
      audit_status: string | null;
      deleted_at?: string | null;
      audit_pdf_path?: string;
      audit_pdf_name?: string;
      audit_key_takeaways?: string;
      manual_review_reason?: string;
    }>(`SELECT id, business_name, category, email, phone, whatsapp, website, notes, metadata, status, manual_review_reason, consent_status, outreach_stage, outreach_workflow, audit_status, deleted_at, audit_pdf_path, audit_pdf_name, audit_key_takeaways FROM leads WHERE id = $1`, [leadId]);

    if (leadRes.rows.length === 0) {
      return {
        leadId,
        businessName: 'Unknown',
        email: '',
        stage: 'completed',
        stageLabel: 'Not Found',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead does not exist',
      };
    }

    const lead = leadRes.rows[0];

    // Safeguards
    if (lead.deleted_at) {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: 'completed',
        stageLabel: 'Deleted',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead is in deletion trash',
      };
    }

    // Safeguard: Check if lead is in 'Need to Check' (manual_review)
    // Requirement: "after that unless retrieved back no msg needs to sent to them."
    if (lead.status === 'manual_review') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: (lead.outreach_stage as any) || 'initial',
        stageLabel: 'Need to Check',
        subject: '',
        success: false,
        skipped: true,
        reason: `Outreach blocked: Lead is in 'Need to Check' (Manual Review: ${lead.manual_review_reason || 'Previous message failed'}). No messages can be sent unless retrieved back/approved.`,
      };
    }

    // State Locking & Auto-Resolution: Workflow A leads require a verified audit & PDF before cold email dispatch.
    // If pending, dynamically run audit and compile PDF on-the-fly to unlock active dispatch safely.
    if (lead.status === 'pending_audit' || lead.audit_status === 'pending_audit') {
      if (lead.website && workflowRoutingService.hasValidWebsite(lead.website)) {
        try {
          console.log(`[StageOutreachService] ⚡ Auto-resolving pending audit on-the-fly for ${lead.business_name} (${lead.website})...`);
          const auditReport = await clientAuditService.auditWebsite(lead.website);
          const pdfResult = await technicalAuditPdfService.generateAuditPdf(auditReport, lead.business_name);
          const takeaways = auditReport.auditKeyTakeaways || auditReport.criticalIssues.slice(0, 2).join(' and ');

          await query(
            `UPDATE leads SET
              status = 'active',
              audit_status = 'audit_completed',
              audit_key_takeaways = $1,
              audit_pdf_name = $2,
              audit_pdf_path = $3,
              updated_at = NOW()
             WHERE id = $4`,
            [takeaways, pdfResult.pdfName, pdfResult.pdfPath, leadId]
          );

          lead.status = 'active';
          lead.audit_status = 'audit_completed';
          lead.audit_key_takeaways = takeaways;
          lead.audit_pdf_name = pdfResult.pdfName;
          lead.audit_pdf_path = pdfResult.pdfPath;
        } catch (autoErr: any) {
          console.warn(`[StageOutreachService] Auto-audit failed for lead ${lead.id}: ${autoErr?.message}`);
          return {
            leadId,
            businessName: lead.business_name,
            email: lead.email,
            phone: lead.phone,
            stage: 'initial',
            stageLabel: 'Pending Audit',
            subject: '',
            success: false,
            skipped: true,
            reason: `State Locked: Workflow A lead is in PENDING_AUDIT state. Auto-audit attempt failed: ${autoErr?.message}`,
          };
        }
      } else {
        return {
          leadId,
          businessName: lead.business_name,
          email: lead.email,
          phone: lead.phone,
          stage: 'initial',
          stageLabel: 'Pending Audit',
          subject: '',
          success: false,
          skipped: true,
          reason: 'State Locked: Workflow A lead is in PENDING_AUDIT state awaiting technical audit callback.',
        };
      }
    }

    if (lead.consent_status === 'opted_out' || lead.consent_status === 'unsubscribed') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: 'completed',
        stageLabel: 'Suppressed',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead has opted out or unsubscribed',
      };
    }

    if (lead.consent_status === 'replied') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: 'completed',
        stageLabel: 'Replied',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Lead has already replied / converted',
      };
    }

    // Verify channel availability
    const hasEmail = Boolean(lead.email && lead.email.includes('@'));
    const isMapsUrl = (u?: string) => /google\.com\/maps|maps\.google\.com/i.test(u || '');
    const hasWebsite = Boolean(
      (lead.website && !isMapsUrl(lead.website)) ||
      (lead.metadata?.website_form?.hasForm === true)
    );
    const rawPhone = (lead.whatsapp || lead.phone || '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 8;

    if (!hasEmail && !hasWebsite && !hasPhone) {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email || '',
        phone: lead.phone || '',
        stage: 'completed',
        stageLabel: 'No Channels',
        subject: '',
        success: false,
        skipped: true,
        reason: 'No contact channels (email, phone, or website) available for lead',
      };
    }

    const stageInfo = await this.getLeadStage(leadId);

    if (stageInfo.stage === 'completed') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: 'completed',
        stageLabel: 'Sequence Completed',
        subject: '',
        success: false,
        skipped: true,
        reason: `Maximum outreach touches (3 touches) already reached for this lead`,
      };
    }

    const channelsDispatched: ('email' | 'website_form' | 'whatsapp')[] = [];
    let emailResult: StageDispatchResult['emailResult'] = undefined;
    let websiteFormResult: StageDispatchResult['websiteFormSubmission'] = undefined;
    let whatsappResult: StageDispatchResult['whatsappResult'] = undefined;
    let anySuccess = false;

    // 1. Channel: EMAIL DISPATCH
    if (hasEmail) {
      try {
        let attachments: Array<{ filename: string; path?: string }> | undefined = undefined;
        if (lead.audit_pdf_path) {
          const pdfCheck = workflowRoutingService.validateAuditPdf(lead.audit_pdf_path, lead.website);
          if (pdfCheck.isValid) {
            attachments = [{
              filename: lead.audit_pdf_name || pdfCheck.filename || 'Technical_Audit_Report.pdf',
              path: lead.audit_pdf_path,
            }];
          } else {
            console.warn(`[StageOutreachService] Attachment check failed for lead ${lead.id}: ${pdfCheck.reason}`);
          }
        }

        // Auto-compile missing audit PDF on-the-fly for Workflow A leads so cold email is never sent without attachment
        if (!attachments && lead.website && workflowRoutingService.hasValidWebsite(lead.website)) {
          try {
            console.log(`[StageOutreachService] Auto-compiling missing audit PDF for Workflow A lead ${lead.business_name}...`);
            const auditReport = await clientAuditService.auditWebsite(lead.website);
            const pdfGen = await technicalAuditPdfService.generateAuditPdf(auditReport, lead.business_name);
            attachments = [{
              filename: pdfGen.pdfName,
              path: pdfGen.pdfPath,
            }];
            await query(`UPDATE leads SET audit_pdf_name = $1, audit_pdf_path = $2 WHERE id = $3`, [pdfGen.pdfName, pdfGen.pdfPath, lead.id]);
          } catch (pdfErr: any) {
            console.warn(`[StageOutreachService] Could not auto-compile PDF for lead ${lead.id}:`, pdfErr?.message);
          }
        }

        const sendRes = await emailAdapter.sendEmail({
          to: lead.email,
          subject: stageInfo.subject,
          body: stageInfo.body,
          leadId: lead.id,
          attachments,
        });

        if (sendRes.success) {
          anySuccess = true;
          channelsDispatched.push('email');
          emailResult = {
            success: true,
            liveDelivery: sendRes.liveDelivery,
          };
        } else {
          emailResult = {
            success: false,
            reason: sendRes.reason || 'Send failed in email adapter',
            liveDelivery: sendRes.liveDelivery,
          };
        }
      } catch (eErr: any) {
        emailResult = {
          success: false,
          reason: eErr?.message || 'Email dispatch exception',
        };
      }
    } else {
      emailResult = {
        success: false,
        skipped: true,
        reason: 'No email address on file',
      };
    }

    // 2. Channel: WEBSITE CONTACT FORM DUAL-TRIGGER
    if (hasWebsite) {
      try {
        const { websiteFormService } = await import('./websiteFormService');
        const formSubmission = await websiteFormService.submitContactForm(leadId, {
          senderName: 'Online Digital Solution',
          senderEmail: lead.email || 'team.onlinedigitalsolution@gmail.com',
          senderPhone: '+1 306-205-1817',
          subject: stageInfo.subject,
          message: stageInfo.body,
        });

        websiteFormResult = formSubmission;
        if (formSubmission.success || formSubmission.status === 'sent') {
          anySuccess = true;
          channelsDispatched.push('website_form');
        }
      } catch (formErr: any) {
        websiteFormResult = {
          success: false,
          skipped: true,
          reason: formErr?.message || 'Form submission skipped',
        };
      }
    } else {
      websiteFormResult = {
        success: false,
        skipped: true,
        reason: 'No corporate website or form on file',
      };
    }

    // 3. Channel: WHATSAPP DISPATCH & QUEUE
    if (hasPhone) {
      try {
        const waState = whatsappSessionService.getState();
        if (waState.status === 'connected') {
          // Live Baileys socket is connected: dispatch directly!
          const waSend = await whatsappSessionService.sendMessage(rawPhone, stageInfo.body);
          if (waSend.success) {
            anySuccess = true;
            channelsDispatched.push('whatsapp');
            whatsappResult = {
              success: true,
              status: 'sent',
              reason: 'Direct WhatsApp message delivered',
            };

            // Record into database conversation & message
            const convRes = await query<{ id: string }>(
              `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp' LIMIT 1`,
              [leadId]
            );
            const convId = convRes.rows.length > 0
              ? convRes.rows[0].id
              : (await query<{ id: string }>(
                  `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
                   VALUES ('lead', $1, 'whatsapp', 'open', NOW()) RETURNING id`,
                  [leadId]
                )).rows[0].id;

            await query(
              `INSERT INTO messages (conversation_id, channel, direction, text, status, external_id, sent_at)
               VALUES ($1, 'whatsapp', 'outbound', $2, 'delivered', $3, NOW())`,
              [convId, stageInfo.body, waSend.messageId || '']
            );
          } else {
            // Socket send failed; prepare click-to-chat launcher URL
            const clickUrl = whatsappValidator.buildWhatsAppUrl(phoneDigits, stageInfo.body);
            whatsappResult = {
              success: false,
              status: 'click_to_chat',
              url: clickUrl,
              reason: waSend.error || 'Direct socket dispatch failed, click launcher ready',
            };
          }
        } else {
          // Socket not currently connected: record queued outbound touch with direct launcher URL
          const clickUrl = whatsappValidator.buildWhatsAppUrl(phoneDigits, stageInfo.body);
          anySuccess = true;
          channelsDispatched.push('whatsapp');
          whatsappResult = {
            success: true,
            status: 'queued',
            url: clickUrl,
            reason: 'Queued with 1-Click WhatsApp launcher (Mobile Ready)',
          };

          // Record queued conversation & message
          const convRes = await query<{ id: string }>(
            `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'whatsapp' LIMIT 1`,
            [leadId]
          );
          const convId = convRes.rows.length > 0
            ? convRes.rows[0].id
            : (await query<{ id: string }>(
                `INSERT INTO conversations (entity_type, lead_id, channel, status, last_message_at)
                 VALUES ('lead', $1, 'whatsapp', 'open', NOW()) RETURNING id`,
                [leadId]
              )).rows[0].id;

          await query(
            `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
             VALUES ($1, 'whatsapp', 'outbound', $2, 'queued', NOW())`,
            [convId, stageInfo.body]
          );
        }
      } catch (waErr: any) {
        whatsappResult = {
          success: false,
          skipped: true,
          reason: waErr?.message || 'WhatsApp dispatch exception',
        };
      }
    } else {
      whatsappResult = {
        success: false,
        skipped: true,
        reason: 'No phone number on file',
      };
    }

    // 4. Update lead outreach_stage if ANY channel succeeded
    if (anySuccess) {
      const nextStageName =
        stageInfo.stage === 'initial'
          ? 'followup_1'
          : stageInfo.stage === 'followup_1'
          ? 'followup_2'
          : stageInfo.stage === 'followup_2'
          ? 'followup_3'
          : 'completed';

      await query(
        `UPDATE leads 
         SET first_contacted_at = COALESCE(first_contacted_at, NOW()),
             last_contacted_at = NOW(), 
             outreach_stage = $1, 
             updated_at = NOW() 
         WHERE id = $2`,
        [nextStageName, leadId]
      );

      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: stageInfo.stage,
        stageLabel: stageInfo.stageLabel,
        subject: stageInfo.subject,
        success: true,
        channelsDispatched,
        liveDelivery: emailResult?.liveDelivery,
        emailResult,
        websiteFormSubmission: websiteFormResult,
        whatsappResult,
      };
    }

    // If none of the channels succeeded
    // Requirement: "if msg is failed lead should directly removed from list and move to need to check after that unless retrieved back no msg needs to sent to them."
    const failureReason = emailResult?.reason || websiteFormResult?.reason || whatsappResult?.reason || 'All channel dispatches failed';
    await leadIsolationService.isolateFailedLead(leadId, failureReason);

    return {
      leadId,
      businessName: lead.business_name,
      email: lead.email,
      phone: lead.phone,
      stage: stageInfo.stage,
      stageLabel: 'Need to Check',
      subject: stageInfo.subject,
      success: false,
      reason: `Delivery failed: ${failureReason}. Lead has been removed from all lists and moved to 'Need to Check'.`,
      emailResult,
      websiteFormSubmission: websiteFormResult,
      whatsappResult,
    };
  }

  /**
   * Bulk dispatch to an array of leads using bounded concurrency (5 parallel workers)
   * Completes 50+ leads in ~5 seconds reliably without timeouts.
   */
  async sendBulkNextStage(leadIds: string[]): Promise<{
    totalProcessed: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    channelsSummary: {
      emailsSent: number;
      formsSubmitted: number;
      whatsappDispatched: number;
    };
    breakdown: {
      initial: number;
      followup_1: number;
      followup_2: number;
    };
    results: StageDispatchResult[];
  }> {
    const results: StageDispatchResult[] = [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const channelsSummary = { emailsSent: 0, formsSubmitted: 0, whatsappDispatched: 0 };
    const breakdown = { initial: 0, followup_1: 0, followup_2: 0 };

    const CONCURRENCY_CHUNK = 5;
    for (let i = 0; i < leadIds.length; i += CONCURRENCY_CHUNK) {
      const chunk = leadIds.slice(i, i + CONCURRENCY_CHUNK);
      const chunkPromises = chunk.map(async (id) => {
        // Enforce 6-second timeout per lead to guarantee deterministic runtime
        return Promise.race([
          this.sendNextStageToLead(id),
          new Promise<StageDispatchResult>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  leadId: id,
                  businessName: 'Lead',
                  stage: 'completed',
                  stageLabel: 'Timeout',
                  subject: '',
                  success: false,
                  skipped: false,
                  reason: 'Outreach dispatch timed out after 6 seconds',
                }),
              6000
            )
          ),
        ]);
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const settled of chunkResults) {
        if (settled.status === 'fulfilled') {
          const res = settled.value;
          results.push(res);

          if (res.success) {
            sentCount++;
            if (res.stage === 'initial') breakdown.initial++;
            else if (res.stage === 'followup_1') breakdown.followup_1++;
            else if (res.stage === 'followup_2') breakdown.followup_2++;

            if (res.channelsDispatched?.includes('email')) channelsSummary.emailsSent++;
            if (res.channelsDispatched?.includes('website_form')) channelsSummary.formsSubmitted++;
            if (res.channelsDispatched?.includes('whatsapp')) channelsSummary.whatsappDispatched++;
          } else if (res.skipped) {
            skippedCount++;
          } else {
            failedCount++;
          }
        }
      }
    }

    return {
      totalProcessed: leadIds.length,
      sentCount,
      skippedCount,
      failedCount,
      channelsSummary,
      breakdown,
      results,
    };
  }
}

export const stageOutreachService = new StageOutreachService();
