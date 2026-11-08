import path from 'path';
import fs from 'fs';
import { query, assertNotProduction, assertProductionImmutability, computeProductionDatabaseMd5 } from '../config/db';
import { stageOutreachService } from '../services/stageOutreachService';
import { emailAdapter } from '../adapters/emailAdapter';

async function main() {
  console.log('========================================================================');
  console.log('📄 ITEM 1: AUDIT PDF LIFECYCLE & FOLLOW-UP 1 ATTACHMENT VERIFICATION');
  console.log('========================================================================\n');
  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);

  assertNotProduction('testItem1PdfLifecycleFollowup1');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `pdf_life_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });

  const testPdfName = `${testTag}_Technical_Audit.pdf`;
  const testPdfPath = path.join(auditsDir, testPdfName);

  // Create valid PDF (>500B with %PDF- header)
  const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
  const pdfPadding = Buffer.alloc(600, 'A');
  fs.writeFileSync(testPdfPath, Buffer.concat([pdfHeader, pdfPadding]));

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Initial Email Dispatch (Must attach PDF and PRESERVE it on disk)
    // -------------------------------------------------------------------------
    console.log('[Phase 1] Queuing Lead and Dispatching Initial Email (Touch 1)...');
    const leadRes = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status, outreach_stage,
         audit_status, audit_ready_at, audit_pdf_path, audit_pdf_name, audit_findings, audit_score, notes
       ) VALUES (
         'Apex Orthodontics', $1, 'https://apexortho.test', 'A', 'active', 'none', 'initial',
         'ready', NOW(), $2, $3, $4, 68, $5
       ) RETURNING id`,
      [
        `contact_${testTag}@apexortho.test`,
        testPdfPath,
        testPdfName,
        JSON.stringify([
          'LCP is 4.6s on mobile, exceeding Google 2.5s threshold',
          '3 render-blocking CSS stylesheets delay First Contentful Paint',
          'Missing meta description causing default snippets in search results'
        ]),
        testTag
      ]
    );
    const leadId = leadRes.rows[0].id;

    // Dispatch Initial Email
    const initialResult = await stageOutreachService.sendNextStageToLead(leadId);
    console.log(`   - Initial send result: success=${initialResult.success}, stage=${initialResult.stage}`);

    if (!initialResult.success) {
      throw new Error(`Initial dispatch failed: ${initialResult.reason}`);
    }

    // Check mock sent email for attachment
    const initialSent = emailAdapter.getMockSentLog().slice(-1)[0];
    const initialHasAttachment = (initialSent?.attachments?.length || 0) > 0;
    console.log(`   - Initial email has PDF attachment: ${initialHasAttachment} (${initialSent?.attachments?.[0]?.filename})`);
    if (!initialHasAttachment) {
      throw new Error('FAILED: Initial email was sent without PDF attachment!');
    }

    // Verify PDF still exists on disk for Follow-up 1
    const existsAfterInitial = fs.existsSync(testPdfPath);
    console.log(`   - PDF on disk after Initial dispatch: ${existsAfterInitial ? 'PRESERVED (PASS)' : 'DELETED PREMATURELY (FAIL)'}`);
    if (!existsAfterInitial) {
      throw new Error('FAILED: Audit PDF was deleted immediately after initial send! Follow-up 1 will not have it.');
    }

    // Verify lead record still holds audit_pdf_path
    const leadAfterInitial = await query<{ audit_pdf_path: string }>(`SELECT audit_pdf_path FROM leads WHERE id = $1`, [leadId]);
    const actualPdfPath = leadAfterInitial.rows[0]?.audit_pdf_path;
    console.log(`   - Lead audit_pdf_path in DB after Initial dispatch: "${actualPdfPath}" (Must be non-empty)`);
    if (!actualPdfPath) {
      throw new Error('FAILED: Lead audit_pdf_path was cleared from database after initial send!');
    }
    console.log('✅ Phase 1 PASSED: Initial email attached PDF, and PDF was safely preserved for Follow-up 1.\n');

    // -------------------------------------------------------------------------
    // Phase 2: Follow-up 1 Dispatch (Must attach preserved PDF, then purge it)
    // -------------------------------------------------------------------------
    console.log('[Phase 2] Dispatching Follow-up 1 (Day 2.5 Check-in)...');
    // Simulate 60 hours elapsed
    await query(`UPDATE leads SET last_contacted_at = NOW() - INTERVAL '60 hours' WHERE id = $1`, [leadId]);

    const fu1Result = await stageOutreachService.sendNextStageToLead(leadId);
    console.log(`   - Follow-up 1 send result: success=${fu1Result.success}, stage=${fu1Result.stage}`);
    if (!fu1Result.success) {
      throw new Error(`Follow-up 1 dispatch failed: ${fu1Result.reason}`);
    }

    const fu1Sent = emailAdapter.getMockSentLog().slice(-1)[0];
    const fu1HasAttachment = (fu1Sent?.attachments?.length || 0) > 0;
    console.log(`   - Follow-up 1 email has PDF attachment: ${fu1HasAttachment} (${fu1Sent?.attachments?.[0]?.filename})`);
    if (!fu1HasAttachment) {
      throw new Error('FAILED: Follow-up 1 was sent without PDF attachment!');
    }

    // Verify PDF is now deleted post-FU1
    const existsAfterFu1 = fs.existsSync(actualPdfPath);
    console.log(`   - PDF on disk after Follow-up 1 dispatch: ${existsAfterFu1 ? 'STILL ON DISK' : 'PURGED FROM DISK (PASS)'}`);
    if (existsAfterFu1) {
      throw new Error('FAILED: Audit PDF was not purged after Follow-up 1 completed!');
    }
    console.log('✅ Phase 2 PASSED: Follow-up 1 sent with PDF attached, and PDF was subsequently purged.\n');

    // -------------------------------------------------------------------------
    // Phase 3: On-The-Fly Regeneration from Stored DB JSON (If PDF missing on disk)
    // -------------------------------------------------------------------------
    console.log('[Phase 3] Testing Dynamic On-The-Fly PDF Regeneration from Stored DB Audit JSON...');
    const regenLeadRes = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status, outreach_stage,
         audit_status, audit_ready_at, audit_pdf_path, audit_pdf_name, audit_findings, audit_score, notes
       ) VALUES (
         'Summit Dental Care', $1, 'https://summitdental.test', 'B', 'active', 'none', 'initial',
         'ready', NOW(), '/nonexistent/path/deleted_audit.pdf', 'deleted_audit.pdf', $2, 72, $3
       ) RETURNING id`,
      [
        `contact_regen_${testTag}@summitdental.test`,
        JSON.stringify([
          'LCP is 4.2s on mobile devices',
          'Hero image uncompressed (1.8 MB)',
          'Viewport tag improperly configured'
        ]),
        testTag
      ]
    );
    const regenLeadId = regenLeadRes.rows[0].id;

    // Dispatch lead whose disk file was missing
    const regenResult = await stageOutreachService.sendNextStageToLead(regenLeadId);
    console.log(`   - Dispatch result for missing PDF lead: success=${regenResult.success}, stage=${regenResult.stage}`);
    if (!regenResult.success) {
      throw new Error(`Regen dispatch failed: ${regenResult.reason}`);
    }

    const regenSent = emailAdapter.getMockSentLog().slice(-1)[0];
    const regenHasAttachment = (regenSent?.attachments?.length || 0) > 0;
    console.log(`   - Email sent with regenerated attachment: ${regenHasAttachment} (${regenSent?.attachments?.[0]?.filename})`);
    if (!regenHasAttachment) {
      throw new Error('FAILED: Email sent without regenerated attachment!');
    }
    console.log('✅ Phase 3 PASSED: Dynamically reconstructed PDF from stored DB JSON when file was missing on disk.\n');

    // -------------------------------------------------------------------------
    // Immutability Check
    // -------------------------------------------------------------------------
    console.log('[Step 4] Verifying Production Database Immutability...');
    const prodMd5After = await computeProductionDatabaseMd5();
    assertProductionImmutability(prodMd5Before, prodMd5After, 'testItem1PdfLifecycleFollowup1');
    console.log('   ✓ Production database remains 100% UNTOUCHED (Δ = 0 across all tables and rows).\n');

    console.log(`[REAL CLOCK END] date -u: ${new Date().toUTCString()}`);
    console.log('========================================================================');
    console.log('🎉 ITEM 1 AUDIT PDF LIFECYCLE & FOLLOW-UP 1 ATTACHMENT FULLY VERIFIED');
    console.log('========================================================================\n');
  } finally {
    if (fs.existsSync(testPdfPath)) {
      try { fs.unlinkSync(testPdfPath); } catch (_) {}
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal Error in testItem1PdfLifecycleFollowup1:', err);
  process.exit(1);
});
