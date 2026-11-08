import fs from 'fs';
import path from 'path';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { stageOutreachService } from '../services/stageOutreachService';
import { emailAdapter } from '../adapters/emailAdapter';

async function main() {
  console.log('========================================================================');
  console.log('🧪 TEST: AUDIT PURGE AFTER EMAIL DISPATCH & ON-DEMAND REDOWNLOAD');
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('testAuditPurgeAndRedownload');
  const prodMd5Before = await computeProductionDatabaseMd5();

  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();

  const testTag = `purge_test_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });

  // 1. Create a dummy audit PDF
  const testPdfPath = path.join(auditsDir, `${testTag}_Technical_Audit.pdf`);
  const pdfBytes = Buffer.concat([
    Buffer.from('%PDF-1.4\n% Lead Audit File\n'),
    Buffer.alloc(2048, 'Detailed site audit diagnostics\n'),
    Buffer.from('\n%%EOF\n'),
  ]);
  fs.writeFileSync(testPdfPath, pdfBytes);
  console.log(`[Step 1] Created local test audit PDF: ${testPdfPath} (${pdfBytes.length} bytes, exists: ${fs.existsSync(testPdfPath)})`);

  // 2. Insert test lead with ready audit and attached PDF
  const insRes = await query<{ id: string }>(
    `INSERT INTO leads (
       business_name, email, website, slot_id, status, consent_status, outreach_stage,
       audit_status, audit_findings, audit_pdf_path, audit_pdf_name, audit_score, notes, created_at, updated_at
     )
     VALUES ($1, $2, $3, 'A', 'active', 'none', 'initial', 'ready', $4, $5, $6, 75, $7, NOW(), NOW())
     RETURNING id`,
    [
      `${testTag}_ApexBiz`,
      `contact_${testTag}@apex-purge.test`,
      'https://apex-purge.test',
      JSON.stringify([
        'LCP is 3.8s on mobile (needs optimization)',
        '2 render-blocking stylesheets identified',
        'Mobile viewport tag missing initial-scale attribute',
      ]),
      testPdfPath,
      path.basename(testPdfPath),
      testTag,
    ]
  );
  const leadId = insRes.rows[0].id;
  console.log(`[Step 2] Inserted lead ${leadId} with audit_pdf_path="${testPdfPath}".`);

  // 3. Dispatch initial stage email
  console.log('\n[Step 3] Dispatching initial outreach email via stageOutreachService...');
  const dispatchRes = await stageOutreachService.sendNextStageToLead(leadId);
  console.log(`   ✓ Dispatch Result: success=${dispatchRes.success}, channels=${dispatchRes.emailResult?.liveDelivery}`);

  // 4. Assert that email was sent with attachment and NO unsubscribe link
  const mockSent = emailAdapter.getMockSentLog().filter((m) => m.recipientEmail === `contact_${testTag}@apex-purge.test`);
  if (mockSent.length === 0) {
    throw new Error('FAILED: Email was not sent via mock transport!');
  }
  const sentMail = mockSent[0];
  console.log(`\n[Step 4] Checking sent email content:`);
  console.log(`   - To: ${sentMail.recipientEmail}`);
  console.log(`   - Subject: ${sentMail.subject}`);
  console.log(`   - Attachment Count: ${sentMail.attachments?.length || 0}`);
  console.log(`   - Has Unsubscribe in Body: ${sentMail.body?.toLowerCase().includes('unsubscribe') || false}`);

  if (sentMail.body?.toLowerCase().includes('unsubscribe') || sentMail.body?.toLowerCase().includes('opt out')) {
    throw new Error('FAILED: Email body contains unsubscribe option! (Must NOT have any unsubscribe option)');
  }
  if (!sentMail.attachments || sentMail.attachments.length === 0) {
    throw new Error('FAILED: Email was sent without the audit PDF attachment!');
  }
  console.log('✅ PASS: Email sent with audit attachment and ZERO unsubscribe links.');

  // 5. Assert that PDF was DELETED from disk and cleared from database
  console.log('\n[Step 5] Checking that audit PDF was DELETED from disk and database...');
  const fileExistsOnDisk = fs.existsSync(testPdfPath);
  const leadPostSend = await query<{ audit_pdf_path: string | null; audit_pdf_name: string | null; outreach_stage: string }>(
    `SELECT audit_pdf_path, audit_pdf_name, outreach_stage FROM leads WHERE id = $1`,
    [leadId]
  );

  console.log(`   - File exists on disk: ${fileExistsOnDisk} (MUST be false)`);
  console.log(`   - audit_pdf_path in DB: ${leadPostSend.rows[0]?.audit_pdf_path} (MUST be null)`);
  console.log(`   - audit_pdf_name in DB: ${leadPostSend.rows[0]?.audit_pdf_name} (MUST be null)`);
  console.log(`   - Current outreach stage: ${leadPostSend.rows[0]?.outreach_stage}`);

  if (fileExistsOnDisk) {
    throw new Error(`FAILED: Audit PDF file was NOT deleted from disk after send: ${testPdfPath}`);
  }
  if (leadPostSend.rows[0]?.audit_pdf_path !== null || leadPostSend.rows[0]?.audit_pdf_name !== null) {
    throw new Error(`FAILED: audit_pdf_path or audit_pdf_name was not cleared in the database!`);
  }
  console.log('✅ PASS: Audit PDF successfully deleted from disk and cleared from database after send.');

  // 6. Assert on-demand redownload / regeneration
  console.log('\n[Step 6] Testing on-demand redownload / regeneration...');
  // Import clientAuditService & technicalAuditPdfService to test regeneration
  const { technicalAuditPdfService } = await import('../services/technicalAuditPdfService');
  const { clientAuditService } = await import('../services/clientAuditIntelligenceService');

  const report = await clientAuditService.auditWebsite('https://apex-purge.test');
  const regeneratedPdf = await technicalAuditPdfService.generateAuditPdf(report, `${testTag}_ApexBiz`);

  console.log(`   - Redownload/Regenerated file: ${regeneratedPdf.pdfPath}`);
  console.log(`   - File exists on disk: ${fs.existsSync(regeneratedPdf.pdfPath)} (MUST be true)`);
  const regeneratedBytes = fs.readFileSync(regeneratedPdf.pdfPath);
  console.log(`   - File size: ${regeneratedBytes.length} bytes, starts with: "${regeneratedBytes.subarray(0, 8).toString()}"`);

  if (!fs.existsSync(regeneratedPdf.pdfPath) || !regeneratedBytes.toString().startsWith('%PDF-1.4')) {
    throw new Error('FAILED: On-demand redownload/regeneration failed to produce valid PDF-1.4!');
  }
  // Cleanup regenerated file
  if (fs.existsSync(regeneratedPdf.pdfPath)) fs.unlinkSync(regeneratedPdf.pdfPath);
  console.log('✅ PASS: On-demand audit redownload and regeneration verified successfully.\n');

  // Verify Production Immutability
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'testAuditPurgeAndRedownload');

  console.log('========================================================================');
  console.log('✅ ALL AUDIT PURGE & REDOWNLOAD TESTS PASSED (Δ = 0 PROD IMMUTABILITY)');
  console.log('========================================================================\n');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal Error in testAuditPurgeAndRedownload:', err);
  process.exit(1);
});
