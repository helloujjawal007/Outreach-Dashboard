import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '../config/db';
import { env } from '../config/env';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { suppressionService } from '../services/suppressionService';
import { isValidPdfBuffer, normalizeAuditFinding, validateAuditAsset } from '../utils/auditPolicy';
import { serviceRecommendationEngine } from '../services/serviceRecommendationEngine';
import { technicalAuditPdfService } from '../services/technicalAuditPdfService';
import type { ClientAuditReport } from '../services/clientAuditIntelligenceService';
import { logPipeline, logPipelineError } from '../utils/pipelineLogger';

export const auditCallbackRouter = Router();

// In-memory sliding window rate limiter: max 120 callbacks per 60s per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 120) {
    return false;
  }
  entry.count++;
  return true;
}

/**
 * Timing-safe string equality comparison to prevent side-channel timing attacks
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufA.length, 0);
    crypto.timingSafeEqual(bufA, padded);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Cleanup routine for audit PDFs keyed to the lead's last touch or completion (>28 days)
 * Leads still active in drip retain their PDFs regardless of creation age.
 */
export async function cleanupOldAuditPdfs(auditsDir: string, maxAgeDays = 28) {
  try {
    if (!fs.existsSync(auditsDir)) return;

    const eligibleLeads = await query<{ audit_pdf_path: string }>(
      `SELECT audit_pdf_path FROM leads 
       WHERE audit_pdf_path IS NOT NULL 
         AND (status IN ('completed', 'manual_review', 'duplicate', 'skipped_no_opportunity') OR outreach_stage = 'completed')
         AND COALESCE(last_contacted_at, updated_at) <= NOW() - ($1 || ' days')::interval`,
      [maxAgeDays.toString()]
    );

    for (const row of eligibleLeads.rows) {
      if (row.audit_pdf_path && fs.existsSync(row.audit_pdf_path)) {
        fs.unlinkSync(row.audit_pdf_path);
        console.log(`[AuditCallback] Cleaned up audit PDF for completed lead (>28 days): ${row.audit_pdf_path}`);
      }
    }
  } catch (err: any) {
    console.warn('[AuditCallback] PDF retention cleanup warning:', err?.message);
  }
}

/**
 * Header-Only Authentication Middleware
 * Checks x-audit-secret header BEFORE any body parsing happens.
 * Rejects query parameter (?secret=) and body parameter secrets.
 */
export async function auditCallbackAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Too many callback requests. Rate limit exceeded (120 req/min).',
    });
  }

  const settings = await fiveSlotSenderService.getSettings();
  const expectedSecret =
    settings.td_callback_secret ||
    env.TD_CALLBACK_SECRET ||
    settings.td_shared_secret ||
    env.TD_SHARED_SECRET ||
    'td-secret-key-2026';

  // Strict header-only authentication (supports x-audit-secret and TD header aliases)
  const rawHeader =
    req.headers['x-audit-secret'] ||
    req.headers['x-od-secret'] ||
    req.headers['x-td-secret'];
  const providedSecret = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!providedSecret || !expectedSecret || !timingSafeEqualStr(providedSecret.trim(), expectedSecret.trim())) {
    console.warn(`[AuditCallback] ❌ Unauthorized callback attempt from ${clientIp}. Missing or invalid x-audit-secret header.`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid x-audit-secret header. Secret must be provided exclusively in the x-audit-secret header.',
      code: 'UNAUTHORIZED_CALLBACK',
    });
  }

  next();
}

/**
 * POST /api/audit-callback
 * Body payload limit strictly capped at 10 MB.
 */
auditCallbackRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      leadId: rawLeadId,
      status: incomingStatus,
      noOpportunity: incomingNoOpportunity,
      reason: incomingReason,
      takeaways: rawTakeaways,
      findings: rawFindings,
      score: rawScore,
      pdf: rawPdf,
      pdfBase64: rawPdfBase64,
      pdfPath: incomingPdfPath,
      pdfName: incomingPdfName,
      error: auditError,
      auditReport: rawAuditReport,
      report: rawReport,
    } = req.body;

    const leadId = typeof rawLeadId === 'string' ? rawLeadId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Valid leadId is required' });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
      return res.status(404).json({ success: false, error: `Lead ${leadId} not found` });
    }

    const leadCheck = await query<{
      id: string;
      business_name: string;
      website: string;
      status: string;
      consent_status: string;
      email: string;
      phone: string;
      manual_review_reason: string | null;
      slot_id: string | null;
      outreach_stage: string | null;
      audit_status: string | null;
      audit_ready_at: string | null;
      audit_requested_at: string | null;
    }>(
      `SELECT id, business_name, website, status, consent_status, email, phone, manual_review_reason, slot_id, outreach_stage, audit_status, audit_ready_at, audit_requested_at FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: `Lead ${leadId} not found` });
    }

    const lead = leadCheck.rows[0];
    const slotLabel = lead.slot_id ? `Slot ${lead.slot_id}` : 'Unassigned';

    // Item 9 & 10: Out-of-order & duplicate callback protection
    // Duplicate or out-of-order callbacks: Return HTTP 200 { ignored: true } so TD does not retry!
    const incomingTimestamp = req.body.completedAt || req.body.timestamp || req.body.createdAt;
    if (lead.audit_status === 'ready') {
      const existingReadyMs = lead.audit_ready_at ? new Date(lead.audit_ready_at).getTime() : 0;
      const incomingMs = incomingTimestamp ? new Date(incomingTimestamp).getTime() : 0;
      if (!incomingTimestamp || incomingMs <= existingReadyMs) {
        console.warn(`[AuditCallback] ⚠️ Duplicate callback ignored for lead ${leadId}: lead already has a ready audit.`);
        return res.status(200).json({
          success: true,
          ignored: true,
          reason: 'Duplicate callback ignored: lead audit is already ready',
          leadId,
          audit_ready_at: lead.audit_ready_at,
        });
      }
    }

    // Attachment size limit: 2 MB maximum
    if (rawPdfBase64) {
      const estimatedBytes = (rawPdfBase64.length * 3) / 4;
      if (estimatedBytes > 2 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'PDF payload exceeds maximum attachment size limit of 2 MB',
          leadId,
        });
      }
    }

    // If TD reports an explicit audit failure (crawl error, 404, DNS error)
    const hasAuditError = typeof auditError === 'string' && auditError.trim().length > 0;
    if (incomingStatus === 'failed' || hasAuditError) {
      console.warn(`[AuditCallback] TD reported audit failure for "${lead.business_name}" (${leadId}): ${auditError}`);
      logPipelineError(`TD Callback | ${slotLabel}`, `Audit failed for "${lead.business_name}": ${auditError || 'Unknown error'}`);
      await query(
        `UPDATE leads SET audit_status = 'failed', status = 'manual_review', manual_review_reason = $1, updated_at = NOW() WHERE id = $2`,
        [`Technical Audit Pro error: ${auditError || 'Unknown audit failure'}`, leadId]
      );
      const { failureLogService } = await import('../services/failureLogService');
      await failureLogService.logFailure({
        leadId,
        company: lead.business_name,
        website: lead.website,
        email: lead.email,
        slotId: (lead.slot_id as any) || 'A',
        stage: lead.outreach_stage || 'initial',
        type: 'AUDIT_FAILED',
        errorMessage: auditError || 'Technical Audit execution failed in TD',
      });
      return res.json({ success: true, message: 'Audit marked as failed for lead', leadId, auditStatus: 'failed' });
    }

    const reportObj = rawAuditReport || rawReport;

    // 1. Score & takeaways extraction
    let finalScore = 75;
    const numericRawScore = typeof rawScore === 'string' && rawScore.trim() !== '' ? Number(rawScore) : rawScore;
    if (typeof numericRawScore === 'number' && Number.isFinite(numericRawScore)) {
      finalScore = numericRawScore;
    } else if (reportObj && typeof reportObj.score === 'number') {
      finalScore = reportObj.score;
    } else if (reportObj && typeof reportObj.overallScore === 'number') {
      finalScore = reportObj.overallScore;
    } else if (reportObj && typeof reportObj.performanceScore === 'number') {
      finalScore = reportObj.performanceScore;
    } else if (rawTakeaways && typeof rawTakeaways === 'object') {
      const nestedScore = (rawTakeaways as any).score ?? (rawTakeaways as any).performanceScore ?? (rawTakeaways as any).performance_score;
      if (typeof nestedScore === 'number') {
        finalScore = nestedScore;
      }
    }

    let finalTakeaways = '';
    if (typeof rawTakeaways === 'string') {
      finalTakeaways = rawTakeaways;
    } else if (reportObj && typeof reportObj.summary === 'string') {
      finalTakeaways = reportObj.summary;
    } else if (rawTakeaways && typeof rawTakeaways === 'object' && typeof (rawTakeaways as any).summary === 'string') {
      finalTakeaways = (rawTakeaways as any).summary;
    }

    // Honor explicit noOpportunity signal from TD before splitting takeaways into findings
    if (incomingNoOpportunity === true || incomingStatus === 'no_opportunity') {
      const noOppReason =
        (typeof incomingReason === 'string' && incomingReason.trim()) ||
        'Clean site: 0 technical flaws detected (no opportunity for audit outreach)';
      await query(
        `UPDATE leads SET
          audit_status = 'ready',
          audit_findings = '[]'::jsonb,
          audit_key_takeaways = $1,
          audit_score = $2,
          status = 'skipped_no_opportunity',
          outreach_stage = 'skipped_no_opportunity',
          manual_review_reason = $3,
          audit_ready_at = NOW(),
          updated_at = NOW()
         WHERE id = $4`,
        [finalTakeaways || noOppReason, finalScore, noOppReason, leadId]
      );
      return res.status(200).json({
        success: true,
        message: noOppReason,
        leadId,
        noOpportunity: true,
      });
    }

    // 2. Findings extraction (supports string[] and structured object arrays)
    let extractedFindings: string[] = [];
    if (Array.isArray(rawFindings)) {
      extractedFindings = rawFindings.map(normalizeAuditFinding).filter(Boolean);
    } else if (reportObj && Array.isArray(reportObj.criticalIssues)) {
      extractedFindings = reportObj.criticalIssues.map(normalizeAuditFinding).filter(Boolean);
    } else if (reportObj && Array.isArray(reportObj.findings)) {
      extractedFindings = reportObj.findings.map(normalizeAuditFinding).filter(Boolean);
    } else if (rawTakeaways && typeof rawTakeaways === 'object' && Array.isArray((rawTakeaways as any).findings)) {
      extractedFindings = (rawTakeaways as any).findings.map(normalizeAuditFinding).filter(Boolean);
    } else if (rawTakeaways && typeof rawTakeaways === 'object' && Array.isArray((rawTakeaways as any).issues)) {
      extractedFindings = (rawTakeaways as any).issues.map(normalizeAuditFinding).filter(Boolean);
    } else if (typeof rawTakeaways === 'string') {
      extractedFindings = rawTakeaways
        .split(/;|\n|•/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5);
    }

    // 3. Ensure audit directory & clean retention
    const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
    if (!fs.existsSync(auditsDir)) {
      fs.mkdirSync(auditsDir, { recursive: true });
    }
    await cleanupOldAuditPdfs(auditsDir, 28);

    // 4. PDF Storage & Magic Byte Validation
    let finalPdfPath = incomingPdfPath && typeof incomingPdfPath === 'string' ? incomingPdfPath : null;
    let finalPdfName = incomingPdfName && typeof incomingPdfName === 'string' ? incomingPdfName : null;

    const base64Data = rawPdfBase64 || rawPdf || reportObj?.pdfBase64 || reportObj?.pdf;
    if (base64Data && typeof base64Data === 'string') {
      const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/i, '').trim();
      const pdfBuffer = Buffer.from(cleanBase64, 'base64');

      // Strict PDF validation: size & %PDF- header check
      if (!isValidPdfBuffer(pdfBuffer)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid PDF payload: Buffer must be at least 500 bytes and start with magic header %PDF-',
        });
      }

      // B17: File names derived using DB UUID and crypto hash of leadId, NOT by stripping characters
      const leadHash = crypto.createHash('sha256').update(leadId).digest('hex').slice(0, 16);
      const filename = `Technical_Audit_${lead.id}_${leadHash}.pdf`;
      const targetPath = path.resolve(auditsDir, filename);

      // Verify targetPath is strictly inside auditsDir (path traversal defense)
      if (!targetPath.startsWith(auditsDir + path.sep)) {
        return res.status(400).json({ success: false, error: 'Path traversal attempt blocked' });
      }

      finalPdfPath = targetPath;
      finalPdfName = filename;
      fs.writeFileSync(finalPdfPath, pdfBuffer);
      console.log(`[AuditCallback] Stored valid audit PDF on disk: ${finalPdfPath} (${pdfBuffer.length} bytes)`);
      logPipeline('GENERATED_PDF', `Stored audit PDF from TD for ${slotLabel}: "${filename}" (${pdfBuffer.length} bytes) | "${lead.business_name}"`);
    }

    // 4.1 On-the-fly PDF Generation if TD returned JSON without compiled PDF
    if (!finalPdfPath && extractedFindings.length > 0) {
      try {
        const domain = (lead.website || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'website';
        const regenReport: ClientAuditReport = {
          targetUrl: lead.website || `https://${domain}`,
          finalDestinationUrl: lead.website || `https://${domain}`,
          domain,
          hasWebsite: true,
          auditToolUrl: '',
          overallScore: finalScore,
          grade: finalScore >= 80 ? 'Good' : finalScore >= 55 ? 'Needs Work' : 'Poor',
          responseTimeMs: 240,
          mobileFriendly: true,
          checks: [],
          criticalIssues: extractedFindings,
          recommendations: [
            {
              priority: 'high',
              title: 'Remediate Critical Performance & Technical Issues',
              detail: finalTakeaways || 'Audit optimizations and infrastructure remediation.',
              odsSolution: 'Cloud Consultancy Engineering & Architecture Team',
            },
          ],
          summary: finalTakeaways || `Technical audit summary for ${lead.business_name}`,
          auditedAt: new Date().toISOString(),
        };

        const genResult = await technicalAuditPdfService.generateAuditPdf(regenReport, lead.business_name);
        finalPdfPath = genResult.pdfPath;
        finalPdfName = genResult.pdfName;
        console.log(`[AuditCallback] 📄 Synthesized branded audit PDF on-the-fly from TD JSON findings: ${finalPdfPath}`);
        logPipeline('GENERATED_PDF', `Synthesized PDF for ${slotLabel}: "${genResult.pdfName}" (${genResult.fileSize} bytes) | "${lead.business_name}"`);
      } catch (genErr: any) {
        console.warn(`[AuditCallback] ⚠️ On-the-fly PDF synthesis error:`, genErr?.message);
        logPipelineError(`PDF Generation | ${slotLabel}`, `Failed synthesizing PDF for "${lead.business_name}"`, genErr);
      }
    }

    // 5. Unified Audit Asset Validation
    const validation = validateAuditAsset(extractedFindings, finalPdfPath, finalScore);
    if (validation.noOpportunity) {
      await query(
        `UPDATE leads SET
          audit_status = 'ready',
          audit_findings = '[]'::jsonb,
          audit_score = $1,
          status = 'skipped_no_opportunity',
          outreach_stage = 'skipped_no_opportunity',
          manual_review_reason = 'Clean site: 0 technical flaws detected (no opportunity for audit outreach)',
          audit_ready_at = NOW(),
          updated_at = NOW()
         WHERE id = $2`,
        [finalScore, leadId]
      );
      return res.status(200).json({
        success: true,
        message: 'Clean site recorded: 0 technical flaws detected. No opportunity for outreach.',
        leadId,
        noOpportunity: true,
      });
    }

    if (!validation.ready) {
      return res.status(400).json({
        success: false,
        error: `Audit asset rejected: ${validation.reason}`,
      });
    }

    // 5.1 Cloud Consultancy Service Matcher & Confusion Gate (https://cloudconsultancy.in/)
    const serviceAnalysis = serviceRecommendationEngine.analyzeAudit(
      validation.findings,
      validation.score,
      { businessName: lead.business_name, website: lead.website }
    );

    if (serviceAnalysis.isConfused) {
      console.warn(`[AuditCallback] ⚠️ Confusion in TD audit analysis for "${lead.business_name}" (${leadId}): ${serviceAnalysis.confusionReason}`);
      await query(
        `UPDATE leads SET 
          status = 'manual_review', 
          manual_review_reason = $1, 
          audit_status = 'failed',
          updated_at = NOW() 
         WHERE id = $2`,
        [`Audit analysis confusion: ${serviceAnalysis.confusionReason}`, leadId]
      );
      const { failureLogService } = await import('../services/failureLogService');
      await failureLogService.logFailure({
        leadId,
        company: lead.business_name,
        website: lead.website,
        email: lead.email,
        slotId: (lead.slot_id as any) || 'A',
        stage: lead.outreach_stage || 'initial',
        type: 'AUDIT_CONFUSION' as any,
        errorMessage: serviceAnalysis.confusionReason || 'Ambiguous audit findings; moved to manual review',
      });
      return res.status(200).json({
        success: true,
        quarantined: true,
        reason: serviceAnalysis.confusionReason,
        leadId,
      });
    }

    // 6. Database Update
    const primaryServiceJson = JSON.stringify(serviceAnalysis.primaryService || null);
    await query(
      `UPDATE leads SET
        audit_status = 'ready',
        audit_findings = $1,
        audit_key_takeaways = $2,
        audit_score = $3,
        audit_pdf_name = $4,
        audit_pdf_path = $5,
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{matched_service}', $6::jsonb),
        audit_ready_at = NOW(),
        updated_at = NOW()
       WHERE id = $7`,
      [
        JSON.stringify(validation.findings),
        finalTakeaways || validation.findings.slice(0, 3).join('; '),
        validation.score,
        finalPdfName || (finalPdfPath ? path.basename(finalPdfPath) : null),
        finalPdfPath,
        primaryServiceJson,
        leadId,
      ]
    );

    // 7. Un-Strand Late Callbacks SAFELY:
    // Only un-strand if the lead was quarantined strictly for AUDIT_TIMEOUT, AUDIT_FAILED, or PDF_MISSING.
    // NEVER un-strand leads that are bounced, complained, unsubscribed, or suppressed!
    const isSuppressedLead =
      ['bounced', 'opted_out', 'unsubscribed', 'complaint', 'spam'].includes(lead.consent_status) ||
      (await suppressionService.isSuppressed({ email: lead.email, phone: lead.phone })).suppressed;

    if (lead.status === 'manual_review' && !isSuppressedLead) {
      const openAuditFailures = await query<{ id: string }>(
        `SELECT id FROM failure_log 
         WHERE lead_id = $1 AND resolved = false AND type IN ('AUDIT_TIMEOUT', 'AUDIT_FAILED', 'PDF_MISSING')
         LIMIT 1`,
        [leadId]
      );
      const isAuditQuarantine =
        openAuditFailures.rows.length > 0 ||
        /audit|timeout|pdf missing|not ready/i.test(lead.manual_review_reason || '');

      // Ensure no unresolved SEND_FAILED or bounce caused permanent isolation
      const hasSendFailure = await query<{ id: string }>(
        `SELECT id FROM failure_log WHERE lead_id = $1 AND type = 'SEND_FAILED' AND resolved = false LIMIT 1`,
        [leadId]
      );

      if (isAuditQuarantine && hasSendFailure.rows.length === 0) {
        await query(
          `UPDATE leads 
           SET status = 'active', 
               manual_review_reason = NULL,
               updated_at = NOW() 
           WHERE id = $1`,
          [leadId]
        );
        console.log(`[AuditCallback] 🔄 Late callback arrived! Safely un-stranded "${lead.business_name}" (${leadId}) to active queue.`);
      } else {
        console.log(`[AuditCallback] 🛡️ Preserved manual_review status for "${lead.business_name}" (${leadId}): has send failure or non-audit quarantine.`);
      }
    } else if (isSuppressedLead) {
      console.log(`[AuditCallback] 🛡️ Preserved quarantine for "${lead.business_name}" (${leadId}): recipient is suppressed/opted-out.`);
    }

    // Resolve any open audit-related failure logs for this lead
    await query(
      `UPDATE failure_log 
       SET resolved = true, 
           resolved_at = NOW() 
       WHERE lead_id = $1 AND resolved = false AND type IN ('AUDIT_TIMEOUT', 'PDF_MISSING', 'AUDIT_FAILED')`,
      [leadId]
    );

    console.log(
      `[AuditCallback] ✅ Audit callback stored for "${lead.business_name}" (${leadId}): ${validation.findings.length} findings, score: ${validation.score}, PDF: "${finalPdfName}" (Status: ready)`
    );
    logPipeline(
      'RECEIVED_JSON',
      `Received JSON for ${slotLabel}: "${lead.business_name}" (${lead.website || 'no-site'}) | Score: ${validation.score}/100 | Findings: ${validation.findings.length} | PDF: ${finalPdfName || 'None'}`
    );

    res.json({
      success: true,
      message: 'Audit takeaways and PDF report successfully stored for lead',
      leadId,
      auditStatus: 'ready',
      score: validation.score,
      findingsCount: validation.findings.length,
      pdfStored: Boolean(finalPdfPath && fs.existsSync(finalPdfPath)),
    });
  } catch (err: any) {
    console.error('[AuditCallback] Processing exception:', err);
    logPipelineError('TD Callback', 'Exception processing audit callback JSON', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to process audit callback' });
  }
});
