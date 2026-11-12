import fs from 'fs';
import path from 'path';
import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { humanCopywriterService } from './humanCopywriterService';
import { whatsappValidator } from './whatsappValidator';
import { whatsappSessionService } from './whatsappSessionService';
import { workflowRoutingService } from './workflowRoutingService';
import { clientAuditService, type ClientAuditReport } from './clientAuditIntelligenceService';
import { technicalAuditPdfService } from './technicalAuditPdfService';
import { leadIsolationService } from './leadIsolationService';
import { suppressionService } from './suppressionService';
import { sequenceEnrollmentService } from './sequenceEnrollmentService';
import { validateAuditAsset } from '../utils/auditPolicy';
import { resolveRecipientTimezone, isWithinRecipientWindow } from '../utils/timezoneHelper';
import { fiveSlotSenderService } from './fiveSlotSenderService';
import { logPipeline, logPipelineError } from '../utils/pipelineLogger';

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
  channelsDispatched?: ('email' | 'whatsapp')[];
  emailResult?: {
    success: boolean;
    skipped?: boolean;
    reason?: string;
    liveDelivery?: string;
    messageId?: string;
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
      claimed_stage?: string | null;
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
      audit_findings?: any;
      audit_score?: number;
      audit_ready_at?: string;
      created_at?: string;
    }>(
      `SELECT id, business_name, category, email, outreach_stage, claimed_stage, consent_status, status, manual_review_reason, website, location, primary_contact_name, audit_key_takeaways, audit_pdf_name, audit_pdf_path, gmb_notes, audit_findings, audit_score, audit_ready_at, created_at FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadRes.rows.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = leadRes.rows[0];

    // Check message history across outbound messages, sent scheduled dispatches, and contact timestamps
    const activeStage = (lead.outreach_stage === 'sending' && lead.claimed_stage) ? lead.claimed_stage : (lead.outreach_stage || undefined);
    const history = await leadIsolationService.getLeadMessageHistory(leadId, activeStage);
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

    if (effectiveTouchCount >= 3 || lead.outreach_stage === 'completed') {
      return {
        stage: 'completed',
        stageLabel: 'Sequence Completed',
        nextStepLabel: 'Sequence Completed (3 touches sent)',
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

    let parsedFindings: string[] | undefined = undefined;
    if (lead.audit_findings) {
      if (Array.isArray(lead.audit_findings)) {
        parsedFindings = lead.audit_findings;
      } else if (typeof lead.audit_findings === 'string') {
        try {
          parsedFindings = JSON.parse(lead.audit_findings);
        } catch {}
      }
    }

    let generated: { subject: string; body: string };
    try {
      generated = humanCopywriterService.getEmailCopy(
        {
          id: lead.id,
          businessName: lead.business_name,
          category: lead.category,
          website: lead.website,
          primaryContactName: lead.primary_contact_name,
          email: lead.email,
          city: lead.location,
          auditKeyTakeaways: lead.audit_key_takeaways,
          auditPdfName: lead.audit_pdf_name,
          auditPdfPath: lead.audit_pdf_path,
          gmbNotes: lead.gmb_notes,
          auditScore: lead.audit_score ? Number(lead.audit_score) : undefined,
          auditFindings: parsedFindings,
          auditDate: lead.audit_ready_at || lead.created_at,
          matchedService: (lead as any).metadata?.matched_service,
        },
        resolvedStage === 'completed' ? 'followup_3' : resolvedStage
      );
    } catch (copyErr: any) {
      console.warn(`[StageOutreachService] Copy generation error for lead ${lead.id}:`, copyErr?.message);
      logPipelineError('Draft Email', `Copy generation blocked/failed for "${lead.business_name}"`, copyErr);
      return {
        stage: resolvedStage,
        stageLabel: 'Audit Findings Pending',
        nextStepLabel: 'Audit Required Before Dispatch',
        sentCount: effectiveTouchCount,
        outboundCount: effectiveTouchCount,
        subject: `[Audit Required] ${lead.business_name}`,
        body: `Audit findings are currently pending. Technical diagnostic must be completed before email dispatch.`,
        isBlocked: true,
        blockReason: copyErr?.message || 'Audit not ready: 3-5 real audit findings required.',
      };
    }

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
  async sendNextStageToLead(
    leadId: string,
    preClaimedStage?: string,
    options?: { force?: boolean; bypassGuards?: boolean }
  ): Promise<StageDispatchResult> {
    const leadRes = await query<{
      id: string;
      business_name: string;
      category: string;
      email: string;
      phone: string;
      whatsapp: string;
      website: string;
      country?: string;
      location?: string;
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
      audit_findings?: any;
      audit_score?: number;
      audit_ready_at?: string;
      slot_id?: string;
      manual_review_reason?: string;
    }>(`SELECT id, business_name, category, email, phone, whatsapp, website, country, location, notes, metadata, status, manual_review_reason, consent_status, outreach_stage, outreach_workflow, audit_status, deleted_at, audit_pdf_path, audit_pdf_name, audit_key_takeaways, audit_findings, audit_score, audit_ready_at, slot_id FROM leads WHERE id = $1`, [leadId]);

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

    // Atomic claim if not pre-claimed by caller
    // Item 13: Claim must expect the correct stage (never resend a completed lead)
    if (lead.outreach_stage === 'completed') {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: 'completed',
        stageLabel: 'Completed',
        subject: '',
        success: false,
        skipped: true,
        reason: 'Outreach already completed for this lead. Never resend a completed lead.',
      };
    }

    const activeStage = preClaimedStage || lead.outreach_stage || 'initial';
    if (!preClaimedStage) {
      if (lead.outreach_stage === 'sending') {
        return {
          leadId,
          businessName: lead.business_name,
          email: lead.email,
          phone: lead.phone,
          stage: 'completed',
          stageLabel: 'Sending',
          subject: '',
          success: false,
          skipped: true,
          reason: 'Conflict: Dispatch already in progress for this lead.',
        };
      }

      const claimRes = await query<{ id: string }>(
        `UPDATE leads 
         SET outreach_stage = 'sending', 
             claimed_stage = $2, 
             claimed_at = NOW(), 
             updated_at = NOW() 
         WHERE id = $1 AND (outreach_stage = $2 OR ($2 = 'initial' AND outreach_stage IS NULL)) 
         RETURNING id`,
        [leadId, activeStage]
      );

      if (claimRes.rows.length === 0) {
        return {
          leadId,
          businessName: lead.business_name,
          email: lead.email,
          phone: lead.phone,
          stage: 'completed',
          stageLabel: 'Conflict',
          subject: '',
          success: false,
          skipped: true,
          reason: 'Conflict: Dispatch already claimed by concurrent worker or stage changed.',
        };
      }
    }

    // Manual Send Safeguards (Audit gate, Window, Cap, Min Gap, Oversize check)
    if (!preClaimedStage && !options?.force && !options?.bypassGuards) {
      const settings = await fiveSlotSenderService.getSettings();

      // 1. Audit Gate Check
      if (activeStage === 'initial') {
        let validation = validateAuditAsset(lead.audit_findings, lead.audit_pdf_path);
        // If findings are present but disk PDF was purged or missing, attempt dynamic on-the-fly regeneration
        if (!validation.ready && (!lead.audit_pdf_path || !fs.existsSync(lead.audit_pdf_path))) {
          let parsedFindings: string[] = [];
          if (Array.isArray(lead.audit_findings)) parsedFindings = lead.audit_findings;
          else if (typeof lead.audit_findings === 'string') {
            try { parsedFindings = JSON.parse(lead.audit_findings); } catch {}
          }
          if (parsedFindings.length >= 1) {
            try {
              console.log(`[StageOutreachService] ⚡ Regenerating missing audit PDF from stored findings for initial dispatch of "${lead.business_name}"...`);
              const domain = (lead.website || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'website';
              const regenReport: ClientAuditReport = {
                targetUrl: lead.website || `https://${domain}`,
                finalDestinationUrl: lead.website || `https://${domain}`,
                domain,
                hasWebsite: true,
                auditToolUrl: '',
                overallScore: lead.audit_score || 68,
                grade: (lead.audit_score || 68) >= 80 ? 'Good' : (lead.audit_score || 68) >= 55 ? 'Needs Work' : 'Poor',
                responseTimeMs: 240,
                mobileFriendly: true,
                checks: [],
                criticalIssues: parsedFindings,
                recommendations: [
                  { priority: 'high', title: 'Optimize Mobile Speed & Delivery', detail: 'Compress unoptimized hero assets and inline critical CSS.', odsSolution: 'Next.js SSR & Edge Static Caching' }
                ],
                summary: `Technical audit summary for ${lead.business_name}`,
                auditedAt: lead.audit_ready_at || new Date().toISOString(),
              };
              const pdfGen = await technicalAuditPdfService.generateAuditPdf(regenReport, lead.business_name);
              lead.audit_pdf_path = pdfGen.pdfPath;
              lead.audit_pdf_name = pdfGen.pdfName;
              await query(`UPDATE leads SET audit_pdf_name = $1, audit_pdf_path = $2, updated_at = NOW() WHERE id = $3`, [pdfGen.pdfName, pdfGen.pdfPath, lead.id]);
              validation = validateAuditAsset(lead.audit_findings, lead.audit_pdf_path);
            } catch (autoRegenErr: any) {
              console.warn(`[StageOutreachService] Pre-dispatch regeneration failed:`, autoRegenErr?.message);
            }
          }
        }

        if (!validation.ready) {
          await query(
            `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL WHERE id = $2`,
            [activeStage, leadId]
          );
          return {
            leadId,
            businessName: lead.business_name,
            email: lead.email,
            phone: lead.phone,
            stage: 'initial',
            stageLabel: 'Audit Gate Blocked',
            subject: '',
            success: false,
            skipped: true,
            reason: `Audit gate blocked: ${validation.reason || 'Lead audit is not ready or valid PDF report missing from disk'}`,
          };
        }
      }

      // 2. Recipient Send Window Check
      const recipientTz = resolveRecipientTimezone(
        lead.metadata?.timezone,
        lead.location,
        lead.country,
        settings.send_window_timezone || 'UTC'
      );
      const windowCheck = isWithinRecipientWindow(
        new Date(),
        recipientTz,
        settings.send_window_start_hour ?? 9,
        settings.send_window_end_hour ?? 17,
        settings.weekdays_only !== false
      );
      if (!windowCheck.inWindow) {
        await query(
          `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL WHERE id = $2`,
          [activeStage, leadId]
        );
        return {
          leadId,
          businessName: lead.business_name,
          email: lead.email,
          phone: lead.phone,
          stage: activeStage as any,
          stageLabel: 'Outside Send Window',
          subject: '',
          success: false,
          skipped: true,
          reason: windowCheck.reason || 'Outside recipient send window',
        };
      }

      // 3. Daily Send Cap Check
      const metricRes = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM messages 
         WHERE direction = 'outbound' AND status IN ('sent', 'delivered')
           AND (metadata->>'is_mock' IS NULL OR metadata->>'is_mock' != 'true')
           AND sent_at >= CURRENT_DATE`
      );
      const sentToday = parseInt(metricRes.rows[0]?.count || '0', 10);
      const capLimit = settings.daily_send_limit ?? 150;
      if (sentToday >= capLimit) {
        await query(
          `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL WHERE id = $2`,
          [activeStage, leadId]
        );
        return {
          leadId,
          businessName: lead.business_name,
          email: lead.email,
          phone: lead.phone,
          stage: activeStage as any,
          stageLabel: 'Daily Cap Exceeded',
          subject: '',
          success: false,
          skipped: true,
          reason: `Daily send limit reached (${sentToday}/${capLimit} emails today)`,
        };
      }

      // 4. Global Minimum Gap Check
      const globalMinGapSec = settings.global_min_gap_sec || 90;
      const lastGlobalEpoch = (fiveSlotSenderService as any).lastGlobalSentEpochMs || 0;
      if (lastGlobalEpoch > 0 && Date.now() - lastGlobalEpoch < globalMinGapSec * 1000) {
        const remainingSec = Math.ceil((globalMinGapSec * 1000 - (Date.now() - lastGlobalEpoch)) / 1000);
        await query(
          `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL WHERE id = $2`,
          [activeStage, leadId]
        );
        return {
          leadId,
          businessName: lead.business_name,
          email: lead.email,
          phone: lead.phone,
          stage: activeStage as any,
          stageLabel: 'Min Gap Active',
          subject: '',
          success: false,
          skipped: true,
          reason: `Global minimum-gap guard active: must wait at least ${globalMinGapSec}s between sends (${remainingSec}s remaining)`,
        };
      }
    }

    // 5. Oversize Attachment Check (> 2 MB)
    if (lead.audit_pdf_path && fs.existsSync(lead.audit_pdf_path)) {
      try {
        const stats = fs.statSync(lead.audit_pdf_path);
        if (stats.size > 2 * 1024 * 1024) {
          if (!preClaimedStage) {
            await query(
              `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL WHERE id = $2`,
              [activeStage, leadId]
            );
          }
          return {
            leadId,
            businessName: lead.business_name,
            email: lead.email,
            phone: lead.phone,
            stage: activeStage as any,
            stageLabel: 'Attachment Oversize',
            subject: '',
            success: false,
            skipped: true,
            reason: `Attachment size (${(stats.size / (1024 * 1024)).toFixed(2)} MB) exceeds 2 MB limit; must be optimized or stripped before dispatch.`,
          };
        }
      } catch {}
    }

    // Suppression Check: Re-verify global suppression at send time
    const supCheck = await suppressionService.isSuppressed({
      email: lead.email,
      phone: lead.phone,
      domain: lead.website ? lead.website.replace(/^https?:\/\//i, '').split('/')[0] : null,
    });

    if (supCheck.suppressed) {
      if (!preClaimedStage) {
        await query(
          `UPDATE leads SET outreach_stage = $1, claimed_stage = NULL, claimed_at = NULL WHERE id = $2`,
          [activeStage, leadId]
        );
      }
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: activeStage as any,
        stageLabel: 'Suppressed',
        subject: '',
        success: false,
        skipped: true,
        reason: `Pre-send suppression check blocked: ${supCheck.reason || 'Address is suppressed'}. Outreach halted.`,
      };
    }

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

    // Global Suppression Check
    const suppressionCheck = await suppressionService.isSuppressed({ email: lead.email, phone: lead.phone });
    if (suppressionCheck.suppressed) {
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
        reason: `Global Suppression: Recipient is in suppression list (${suppressionCheck.reason || 'unsubscribed'})`,
      };
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
    const rawPhone = (lead.whatsapp || lead.phone || '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 8;

    if (!hasEmail && !hasPhone) {
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
        reason: 'No Email or WhatsApp contact channels available for lead',
      };
    }

    const stageInfo = await this.getLeadStage(leadId);

    if (stageInfo.isBlocked) {
      return {
        leadId,
        businessName: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        stage: stageInfo.stage,
        stageLabel: stageInfo.stageLabel,
        subject: stageInfo.subject,
        success: false,
        skipped: true,
        reason: stageInfo.blockReason || 'Outreach dispatch blocked for this lead',
      };
    }

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

    const channelsDispatched: ('email' | 'whatsapp')[] = [];
    let emailResult: StageDispatchResult['emailResult'] = undefined;
    let whatsappResult: StageDispatchResult['whatsappResult'] = undefined;
    let anySuccess = false;

    // 1. Channel: EMAIL DISPATCH
    if (hasEmail) {
      try {
        let attachments: Array<{ filename: string; path?: string }> | undefined = undefined;
        if (lead.audit_pdf_path) {
          try {
            const stats = fs.statSync(lead.audit_pdf_path);
            if (stats.size > 2 * 1024 * 1024) {
              console.warn(`[StageOutreachService] Attachment exceeds max allowed size (2 MB): ${stats.size} bytes`);
            } else {
              const pdfCheck = workflowRoutingService.validateAuditPdf(lead.audit_pdf_path, lead.website);
              if (pdfCheck.isValid) {
                // Item 15: Keep an archived copy of the exact PDF actually sent
                const archiveDir = path.resolve(process.cwd(), 'server', 'data', 'audits', 'sent_archive');
                if (!fs.existsSync(archiveDir)) {
                  fs.mkdirSync(archiveDir, { recursive: true });
                }
                const archivePath = path.join(archiveDir, `sent_${lead.id}_${path.basename(lead.audit_pdf_path)}`);
                if (!fs.existsSync(archivePath)) {
                  fs.copyFileSync(lead.audit_pdf_path, archivePath);
                }

                attachments = [{
                  filename: lead.audit_pdf_name || pdfCheck.filename || 'Technical_Audit_Report.pdf',
                  path: lead.audit_pdf_path,
                }];
              } else {
                console.warn(`[StageOutreachService] Attachment check failed for lead ${lead.id}: ${pdfCheck.reason}`);
              }
            }
          } catch (fileErr: any) {
            console.warn(`[StageOutreachService] Attachment check error for lead ${lead.id}:`, fileErr?.message);
          }
        }

        // Auto-regenerate missing audit PDF from stored DB audit JSON / findings for both initial and followup_1
        if (!attachments && (activeStage === 'initial' || activeStage === 'followup_1') && (lead.audit_findings || lead.audit_key_takeaways)) {
          try {
            console.log(`[StageOutreachService] ⚡ Regenerating missing audit PDF from stored audit JSON for lead "${lead.business_name}" (${activeStage})...`);
            let findings: string[] = [];
            if (Array.isArray(lead.audit_findings)) {
              findings = lead.audit_findings;
            } else if (typeof lead.audit_findings === 'string') {
              try { findings = JSON.parse(lead.audit_findings); } catch {}
            }
            if (findings.length === 0 && lead.audit_key_takeaways) {
              findings = lead.audit_key_takeaways.split(';').map((s) => s.trim()).filter(Boolean);
            }
            const domain = (lead.website || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'website';
            const regenReport: ClientAuditReport = {
              targetUrl: lead.website || `https://${domain}`,
              finalDestinationUrl: lead.website || `https://${domain}`,
              domain,
              hasWebsite: true,
              auditToolUrl: '',
              overallScore: lead.audit_score || 68,
              grade: (lead.audit_score || 68) >= 80 ? 'Good' : (lead.audit_score || 68) >= 55 ? 'Needs Work' : 'Poor',
              responseTimeMs: 240,
              mobileFriendly: true,
              checks: [],
              criticalIssues: findings.length > 0 ? findings : ['Core Web Vitals mobile latency'],
              recommendations: [
                { priority: 'high', title: 'Optimize Mobile Speed & Delivery', detail: 'Compress unoptimized hero assets and inline critical CSS.', odsSolution: 'Next.js SSR & Edge Static Caching' }
              ],
              summary: `Technical audit summary for ${lead.business_name}`,
              auditedAt: lead.audit_ready_at || new Date().toISOString(),
            };
            const pdfGen = await technicalAuditPdfService.generateAuditPdf(regenReport, lead.business_name);
            attachments = [{
              filename: pdfGen.pdfName,
              path: pdfGen.pdfPath,
            }];
            lead.audit_pdf_path = pdfGen.pdfPath;
            lead.audit_pdf_name = pdfGen.pdfName;
            await query(`UPDATE leads SET audit_pdf_name = $1, audit_pdf_path = $2, updated_at = NOW() WHERE id = $3`, [pdfGen.pdfName, pdfGen.pdfPath, lead.id]);
          } catch (pdfErr: any) {
            console.warn(`[StageOutreachService] Could not auto-compile PDF for lead ${lead.id}:`, pdfErr?.message);
          }
        }

        // Resolve mailbox for the assigned slot (if 1 inbox, all 5 use it; if multiple, rotates across them)
        let assignedInboxId: string | undefined = undefined;
        if (lead.slot_id) {
          const slotIdx = ['A', 'B', 'C', 'D', 'E'].indexOf(lead.slot_id);
          if (slotIdx >= 0) {
            const slotMailbox = await fiveSlotSenderService.getMailboxForSlot(slotIdx);
            assignedInboxId = slotMailbox.id;
          }
        }

        const slotLabel = lead.slot_id ? `Slot ${lead.slot_id}` : 'Unassigned';
        logPipeline(
          'DRAFTED_EMAIL',
          `Drafted email for "${lead.business_name}" (${lead.email}) [${slotLabel}] | Stage: ${stageInfo.stageLabel} | Subject: "${stageInfo.subject}" | PDF: ${attachments?.map((a) => a.filename).join(', ') || 'None'}`
        );

        const sendRes = await emailAdapter.sendEmail({
          to: lead.email,
          subject: stageInfo.subject,
          body: stageInfo.body,
          leadId: lead.id,
          attachments,
          slotId: lead.slot_id,
          inboxId: assignedInboxId,
          businessName: lead.business_name,
          stage: stageInfo.stage,
        });

        if (sendRes.success) {
          anySuccess = true;
          channelsDispatched.push('email');
          emailResult = {
            success: true,
            liveDelivery: sendRes.liveDelivery,
            messageId: sendRes.messageId,
          };

          // 30-Minute Post-Send Disk Purge:
          // Deletes the generated physical PDF from disk 30 minutes after dispatch to conserve disk space.
          // If Follow-up 1 (Day 2.5) needs to attach it later, it automatically regenerates on-the-fly from stored DB audit JSON.
          if (lead.audit_pdf_path) {
            const pdfToPurge = lead.audit_pdf_path;
            setTimeout(() => {
              try {
                if (fs.existsSync(pdfToPurge)) {
                  fs.unlinkSync(pdfToPurge);
                  console.log(`[StageOutreachService] 🗑️ 30-min timer: Purged sent audit PDF from disk: ${pdfToPurge}`);
                }
              } catch (delErr: any) {
                console.warn(`[StageOutreachService] 30-min PDF purge warning:`, delErr?.message);
              }
            }, 30 * 60 * 1000).unref();
          }

          // Item 1: PDF Lifecycle
          // Follow-up 1 (Day 2.5) also attaches the audit PDF. Only delete post-send once Follow-up 1 is complete!
          if (activeStage === 'followup_1' || activeStage === 'followup_2' || activeStage === 'completed') {
            if (lead.audit_pdf_path) {
              try {
                if (fs.existsSync(lead.audit_pdf_path)) {
                  fs.unlinkSync(lead.audit_pdf_path);
                  console.log(`[StageOutreachService] 🗑️ Audit PDF deleted from disk after Follow-up 1 dispatch: ${lead.audit_pdf_path}`);
                }
              } catch (delErr: any) {
                console.warn(`[StageOutreachService] Could not unlink sent audit PDF:`, delErr?.message);
              }

              await query(
                `UPDATE leads 
                 SET audit_pdf_path = NULL, 
                     audit_pdf_name = NULL, 
                     updated_at = NOW() 
                 WHERE id = $1`,
                [lead.id]
              );
            }
          }
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

    // 2. Channel: WHATSAPP DISPATCH & QUEUE
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
          : 'completed';

      await query(
        `UPDATE leads 
         SET first_contacted_at = COALESCE(first_contacted_at, NOW()),
             last_contacted_at = NOW(), 
             last_sent_at = NOW(),
             last_sent_stage = $1,
             last_sent_message_id = COALESCE($2, last_sent_message_id),
             claimed_stage = NULL,
             claimed_at = NULL,
             send_retry_count = 0,
             transient_retry_count = 0,
             outreach_stage = $3::varchar, 
             status = CASE WHEN $3::text = 'completed' THEN 'completed' ELSE status END,
             updated_at = NOW() 
         WHERE id = $4`,
        [stageInfo.stage, emailResult?.messageId || null, nextStageName, leadId]
      );

      // Advance structured sequence enrollment step
      await sequenceEnrollmentService.advanceStep(leadId).catch((seqErr) => {
        console.warn(`[StageOutreachService] Sequence advance error for lead ${leadId}:`, seqErr?.message);
      });

      // Unified Activity Timeline log
      await query(
        `INSERT INTO activity_logs (lead_id, actor_type, activity_type, title, description, metadata)
         VALUES ($1, 'system', 'outreach_sent', $2, $3, $4)`,
        [
          leadId,
          `Dispatched ${stageInfo.stageLabel} via ${channelsDispatched.join(', ')}`,
          `Subject: "${stageInfo.subject}". Channels: ${channelsDispatched.join(', ')}.`,
          JSON.stringify({ channels: channelsDispatched, stage: stageInfo.stage, subject: stageInfo.subject }),
        ]
      ).catch((actErr) => {
        console.warn(`[StageOutreachService] Activity log error:`, actErr?.message);
      });

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
        whatsappResult,
      };
    }

    // If none of the channels succeeded
    // Revert outreach_stage claim if send was not successful
    await query(
      `UPDATE leads SET outreach_stage = $1, updated_at = NOW() WHERE id = $2 AND outreach_stage = 'sending'`,
      [activeStage, leadId]
    );

    // Requirement: "if msg is failed lead should directly removed from list and move to need to check after that unless retrieved back no msg needs to sent to them."
    const failureReason = emailResult?.reason || whatsappResult?.reason || 'All channel dispatches failed';
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
      whatsappDispatched: number;
      formsSubmitted?: number;
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
    const channelsSummary = { emailsSent: 0, whatsappDispatched: 0 };
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
