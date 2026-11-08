import fs from 'fs';
import path from 'path';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { stageOutreachService } from '../services/stageOutreachService';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

async function main() {
  console.log('========================================================================');
  console.log('🛡️ ITEM 13: MANUAL SEND SAFEGUARDS VERIFICATION (5 GUARDS)');
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('testManualSendGuards');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `manual_guards_${Date.now()}`;
  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();

  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });

  // -------------------------------------------------------------------------
  // Guard 1: Audit Gate Check (Missing findings / corrupt PDF)
  // -------------------------------------------------------------------------
  console.log('[Guard 1] Manual Send: Audit Gate Enforcement...');
  const leadGateRes = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, consent_status, audit_status, slot_id, notes)
     VALUES ($1, $2, 'https://no-audit.test', 'initial', 'active', 'none', 'pending', 'A', $3)
     RETURNING id`,
    ['No Audit Biz', `noaudit_${testTag}@guard-test.com`, testTag]
  );
  const gateLeadId = leadGateRes.rows[0].id;

  const gateResult = await stageOutreachService.sendNextStageToLead(gateLeadId);
  console.log(`   - Result: success=${gateResult.success}, skipped=${gateResult.skipped}, reason="${gateResult.reason}"`);
  if (gateResult.success || !gateResult.reason?.includes('Audit gate blocked')) {
    throw new Error('Guard 1 FAILED: Manual send bypassed audit gate without ready audit!');
  }
  console.log('   ✓ Guard 1 PASSED: Manual send blocked by audit gate.\n');

  // Prepare a valid PDF for guards
  const validPdfPath = path.join(auditsDir, `${testTag}_valid.pdf`);
  const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Audit) >>\nendobj\n');
  const pdfPad = Buffer.alloc(1500, 'Z');
  const pdfFooter = Buffer.from('\n%%EOF');
  const makePdf = (p: string) => fs.writeFileSync(p, Buffer.concat([pdfHeader, pdfPad, pdfFooter]));
  makePdf(validPdfPath);

  // -------------------------------------------------------------------------
  // Guard 2: Recipient Send Window Enforcement
  // -------------------------------------------------------------------------
  console.log('[Guard 2] Manual Send: Recipient Send Window Enforcement...');
  // Lead located in Tokyo / Sydney (where local time is outside 09:00 - 17:00 or configured to be blocked)
  const leadWindowRes = await query<{ id: string }>(
    `INSERT INTO leads (
       business_name, email, website, outreach_stage, status, consent_status,
       audit_status, audit_ready_at, audit_pdf_path, audit_findings, slot_id, metadata, notes
     ) VALUES (
       $1, $2, 'https://window-guard.test', 'initial', 'active', 'none',
       'ready', NOW(), $3, $4, 'B', $5, $6
     ) RETURNING id`,
    [
      'Nighttime Biz',
      `night_${testTag}@guard-test.com`,
      validPdfPath,
      JSON.stringify(['Finding 1: slow server response', 'Finding 2: uncompressed scripts', 'Finding 3: missing h1']),
      JSON.stringify({ timezone: 'Pacific/Honolulu' }), // 18:00 Honolulu (Sunday evening/night)
      testTag,
    ]
  );
  const windowLeadId = leadWindowRes.rows[0].id;

  // Temporarily configure restrictive window in settings
  await fiveSlotSenderService.updateSettings({
    send_window_start_hour: 9,
    send_window_end_hour: 17,
    weekdays_only: true,
  });

  const windowResult = await stageOutreachService.sendNextStageToLead(windowLeadId);
  console.log(`   - Result: success=${windowResult.success}, skipped=${windowResult.skipped}, reason="${windowResult.reason}"`);
  if (windowResult.success || (!windowResult.reason?.includes('window') && !windowResult.reason?.includes('weekend'))) {
    throw new Error('Guard 2 FAILED: Manual send bypassed recipient send window!');
  }
  console.log('   ✓ Guard 2 PASSED: Manual send blocked by recipient send window.\n');

  // -------------------------------------------------------------------------
  // Guard 3: Daily Send Cap Enforcement
  // -------------------------------------------------------------------------
  console.log('[Guard 3] Manual Send: Daily Cap Enforcement...');
  // Open window so evaluation reaches daily cap check
  await fiveSlotSenderService.updateSettings({
    send_window_start_hour: 0,
    send_window_end_hour: 24,
    weekdays_only: false,
    daily_send_limit: 0,
  });

  const leadCapRes = await query<{ id: string }>(
    `INSERT INTO leads (
       business_name, email, website, outreach_stage, status, consent_status,
       audit_status, audit_ready_at, audit_pdf_path, audit_findings, slot_id, metadata, notes
     ) VALUES (
       $1, $2, 'https://cap-guard.test', 'initial', 'active', 'none',
       'ready', NOW(), $3, $4, 'C', $5, $6
     ) RETURNING id`,
    [
      'Cap Biz',
      `cap_${testTag}@guard-test.com`,
      validPdfPath,
      JSON.stringify(['Finding 1: slow LCP', 'Finding 2: uncompressed css', 'Finding 3: missing description']),
      JSON.stringify({ timezone: 'UTC' }),
      testTag,
    ]
  );
  const capLeadId = leadCapRes.rows[0].id;

  const capResult = await stageOutreachService.sendNextStageToLead(capLeadId);
  console.log(`   - Result: success=${capResult.success}, skipped=${capResult.skipped}, reason="${capResult.reason}"`);
  if (capResult.success || !capResult.reason?.includes('Daily send limit reached')) {
    throw new Error('Guard 3 FAILED: Manual send bypassed daily send cap!');
  }
  console.log('   ✓ Guard 3 PASSED: Manual send blocked by daily cap.\n');

  // Restore daily limit for Guard 4 test
  await fiveSlotSenderService.updateSettings({
    daily_send_limit: 150,
  });

  // -------------------------------------------------------------------------
  // Guard 4: Global Minimum Gap Enforcement
  // -------------------------------------------------------------------------
  console.log('[Guard 4] Manual Send: Global Minimum Gap Guard...');
  makePdf(validPdfPath);
  await query(`UPDATE slot_sender_settings SET global_min_gap_sec = 120 WHERE id = 'default'`);
  // Set last global send timestamp to NOW (simulating another send just happened 5 seconds ago)
  (fiveSlotSenderService as any).lastGlobalSentEpochMs = Date.now() - 5000;

  const leadGapRes = await query<{ id: string }>(
    `INSERT INTO leads (
       business_name, email, website, outreach_stage, status, consent_status,
       audit_status, audit_ready_at, audit_pdf_path, audit_findings, slot_id, metadata, notes
     ) VALUES (
       $1, $2, 'https://gap-guard.test', 'initial', 'active', 'none',
       'ready', NOW(), $3, $4, 'D', $5, $6
     ) RETURNING id`,
    [
      'Gap Biz',
      `gap_${testTag}@guard-test.com`,
      validPdfPath,
      JSON.stringify(['Finding 1: slow LCP', 'Finding 2: uncompressed css', 'Finding 3: missing description']),
      JSON.stringify({ timezone: 'UTC' }),
      testTag,
    ]
  );
  const gapLeadId = leadGapRes.rows[0].id;

  const gapResult = await stageOutreachService.sendNextStageToLead(gapLeadId);
  console.log(`   - Result: success=${gapResult.success}, skipped=${gapResult.skipped}, reason="${gapResult.reason}"`);
  if (gapResult.success || !gapResult.reason?.includes('Global minimum-gap guard active')) {
    throw new Error('Guard 4 FAILED: Manual send bypassed global minimum gap guard!');
  }
  console.log('   ✓ Guard 4 PASSED: Manual send blocked by global minimum gap.\n');
  (fiveSlotSenderService as any).lastGlobalSentEpochMs = 0;

  // -------------------------------------------------------------------------
  // Guard 5: Oversize Attachment Check (> 2 MB)
  // -------------------------------------------------------------------------
  console.log('[Guard 5] Manual Send: > 2 MB Attachment Rejection...');
  const oversizePdfPath = path.join(auditsDir, `${testTag}_oversize_3mb.pdf`);
  const bigBuffer = Buffer.alloc(3 * 1024 * 1024, 'X');
  fs.writeFileSync(oversizePdfPath, Buffer.concat([pdfHeader, bigBuffer, pdfFooter]));

  const leadOversizeRes = await query<{ id: string }>(
    `INSERT INTO leads (
       business_name, email, website, outreach_stage, status, consent_status,
       audit_status, audit_ready_at, audit_pdf_path, audit_findings, slot_id, notes
     ) VALUES (
       $1, $2, 'https://oversize-guard.test', 'initial', 'active', 'none',
       'ready', NOW(), $3, $4, 'E', $5
     ) RETURNING id`,
    [
      'Oversize Biz',
      `oversize_${testTag}@guard-test.com`,
      oversizePdfPath,
      JSON.stringify(['Finding 1: slow LCP', 'Finding 2: uncompressed css', 'Finding 3: missing description']),
      testTag,
    ]
  );
  const oversizeLeadId = leadOversizeRes.rows[0].id;

  const oversizeResult = await stageOutreachService.sendNextStageToLead(oversizeLeadId, undefined, { bypassGuards: true });
  console.log(`   - Result: success=${oversizeResult.success}, skipped=${oversizeResult.skipped}, reason="${oversizeResult.reason}"`);
  if (oversizeResult.success || !oversizeResult.reason?.includes('exceeds 2 MB limit')) {
    throw new Error('Guard 5 FAILED: Manual send accepted > 2 MB attachment!');
  }
  console.log('   ✓ Guard 5 PASSED: Manual send strictly rejected attachment > 2 MB.\n');

  // Clean up
  if (fs.existsSync(validPdfPath)) fs.unlinkSync(validPdfPath);
  if (fs.existsSync(oversizePdfPath)) fs.unlinkSync(oversizePdfPath);
  await query(`DELETE FROM leads WHERE notes = $1`, [testTag]);

  // Verify production database immutability
  console.log('[Step 6] Verifying Production Database Immutability...');
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'testManualSendGuards');
  console.log('   ✓ Production database remains 100% UNTOUCHED (Δ = 0 across all tables and rows).\n');

  console.log('========================================================================');
  console.log('🎉 ALL 5 MANUAL SEND SAFEGUARDS VERIFIED WITH ZERO BYPASS');
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in testManualSendGuards:', err);
  process.exit(1);
});
