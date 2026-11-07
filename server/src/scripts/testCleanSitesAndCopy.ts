import fs from 'fs';
import path from 'path';
import { query, assertNotProduction, captureProductionSnapshot } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { validateAuditAsset } from '../utils/auditPolicy';
import { humanCopywriterService } from '../services/humanCopywriterService';
import { emailAdapter } from '../adapters/emailAdapter';

async function runCleanSitesAndCopyTest() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING ITEM 4: CLEAN SITES (noOpportunity) & REAL EMAIL COPY');
  console.log('========================================================================\n');

  assertNotProduction('Clean Sites Harness');
  const beforeSnapshot = await captureProductionSnapshot();

  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();

  const testTag = `clean_copy_${Date.now()}`;
  const createdLeadIds: string[] = [];

  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }
  const dummyPdfPath = path.resolve(auditsDir, `${testTag}_Audit.pdf`);
  fs.writeFileSync(dummyPdfPath, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 'z')]));

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Policy Validation on Clean Site (0 Findings)
    // -------------------------------------------------------------------------
    console.log('[Test 1] Policy check for clean site (0 findings)...');
    const policyResult = validateAuditAsset([], dummyPdfPath, 95);
    console.log(`   - Policy Result: ready=${policyResult.ready}, noOpportunity=${policyResult.noOpportunity}`);
    console.log(`   - Reason: "${policyResult.reason}"`);
    console.log(`   - Synthesized findings count: ${policyResult.findings.length} (MUST BE 0)`);

    if (policyResult.ready !== false || policyResult.noOpportunity !== true || policyResult.findings.length !== 0) {
      throw new Error('Test 1 FAILED: Clean site policy did not return noOpportunity: true with 0 findings!');
    }
    console.log('✅ Test 1 Passed: 0 findings correctly recognized as noOpportunity with 0 synthesized findings.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Scheduler Execution on Clean Site Lead
    // -------------------------------------------------------------------------
    console.log('[Test 2] Queue processing of clean site lead through scheduler...');
    const failuresBefore = await query<{ count: string }>(
      `SELECT COUNT(*) FROM failure_log WHERE email LIKE $1`,
      [`%${testTag}%`]
    );

    const leadClean = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, audit_status, audit_findings, audit_pdf_path, audit_score, notes, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'A', 'active', 'none',
         'initial', 'ready', $4, $5, 98, $6, NOW() - INTERVAL '10 minutes', NOW()
       ) RETURNING id`,
      [
        'Pristine Architect Studio',
        `info@pristine-${testTag}.test`,
        'https://pristine-architects.example',
        JSON.stringify([]), // 0 findings
        dummyPdfPath,
        testTag,
      ]
    );
    createdLeadIds.push(leadClean.rows[0].id);

    // Run tick targeting this slot with filterTestBatch
    fiveSlotSenderService.resetLastSlotSent();
    const tickTime = new Date('2026-05-01T10:00:00Z'); // Slot A time
    const tickResult = await fiveSlotSenderService.processGlobalTick(tickTime, testTag);
    console.log(`   - Tick result: dispatched=${tickResult.dispatched}, reason="${tickResult.reason}"`);

    // Check lead status
    const cleanLeadPost = await query<{ status: string; manual_review_reason: string }>(
      `SELECT status, manual_review_reason FROM leads WHERE id = $1`,
      [leadClean.rows[0].id]
    );
    console.log(`   - Lead status after tick: "${cleanLeadPost.rows[0]?.status}" (expected "completed")`);
    console.log(`   - Reason: "${cleanLeadPost.rows[0]?.manual_review_reason}"`);

    // Verify 0 failure log rows were created
    const failuresAfter = await query<{ count: string }>(
      `SELECT COUNT(*) FROM failure_log WHERE email LIKE $1`,
      [`%${testTag}%`]
    );
    const failureDelta = parseInt(failuresAfter.rows[0].count, 10) - parseInt(failuresBefore.rows[0].count, 10);
    console.log(`   - Failure log records added: ${failureDelta} (MUST BE 0)`);

    // Verify mock email log (NO email was sent)
    const mockSent = emailAdapter.getMockSentLog().filter((m) => m.recipientEmail.includes(testTag));
    console.log(`   - Emails dispatched to clean site: ${mockSent.length} (MUST BE 0)`);

    if (cleanLeadPost.rows[0]?.status !== 'completed' || failureDelta !== 0 || mockSent.length !== 0) {
      throw new Error('Test 2 FAILED: Clean site was not skipped cleanly without failure log!');
    }
    console.log('✅ Test 2 Passed: Clean site skipped cleanly, marked completed, 0 failure_log rows, 0 emails sent.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Real Email Copy for 1 Finding (No Placeholders)
    // -------------------------------------------------------------------------
    console.log('[Test 3] Generating real email copy for 1 finding...');
    const singleFinding = ['Largest Contentful Paint is 3.8s on 4G mobile devices exceeding the 2.5s benchmark'];
    const copy1 = humanCopywriterService.getEmailCopy(
      {
        id: '11111111-1111-1111-1111-111111111111',
        businessName: 'Apex Roofing & Solar',
        category: 'Roofing Contractor',
        website: 'https://apexroofing.com',
        primaryContactName: 'Marcus Vance',
        city: 'Denver',
        auditScore: 68,
        auditFindings: singleFinding,
        auditPdfName: 'Apex_Roofing_Technical_Audit.pdf',
        auditPdfPath: dummyPdfPath,
      },
      'initial'
    );

    console.log('--- EMAIL COPY (1 FINDING) ---');
    console.log(`Subject: ${copy1.subject}`);
    console.log(`Body:\n${copy1.body}\n------------------------------`);

    // Assertions on 1 finding copy
    assertNoPlaceholders(copy1.subject, '1 Finding Subject');
    assertNoPlaceholders(copy1.body, '1 Finding Body');
    if (!copy1.body.includes('Here is the key diagnostic observation identified on the site:')) {
      throw new Error('Expected singular phrasing for 1 finding intro');
    }
    if (!copy1.body.includes(singleFinding[0])) {
      throw new Error('Finding text was not included in body');
    }
    console.log('✅ Test 3 Passed: 1-finding email copy verified with zero placeholders and correct singular grammar.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Real Email Copy for 2 Findings (No Placeholders)
    // -------------------------------------------------------------------------
    console.log('[Test 4] Generating real email copy for 2 findings...');
    const twoFindings = [
      'Uncompressed image assets totaling 4.2 MB on homepage causing slow mobile load',
      'Missing viewport meta tag preventing responsive layout scaling',
    ];
    const copy2 = humanCopywriterService.getEmailCopy(
      {
        id: '22222222-2222-2222-2222-222222222222',
        businessName: 'Bright Dental Care',
        category: 'Dental Clinic',
        website: 'https://brightdentaldenver.com',
        primaryContactName: 'Dr. Sarah Lin',
        city: 'Denver',
        auditScore: 71,
        auditFindings: twoFindings,
        auditPdfName: 'Bright_Dental_Technical_Audit.pdf',
        auditPdfPath: dummyPdfPath,
      },
      'initial'
    );

    console.log('--- EMAIL COPY (2 FINDINGS) ---');
    console.log(`Subject: ${copy2.subject}`);
    console.log(`Body:\n${copy2.body}\n------------------------------`);

    assertNoPlaceholders(copy2.subject, '2 Findings Subject');
    assertNoPlaceholders(copy2.body, '2 Findings Body');
    if (!copy2.body.includes('Here are the top diagnostic findings identified on the site:')) {
      throw new Error('Expected plural phrasing for 2 findings intro');
    }
    for (const f of twoFindings) {
      if (!copy2.body.includes(f)) {
        throw new Error(`Finding "${f}" missing from 2 findings copy`);
      }
    }
    console.log('✅ Test 4 Passed: 2-findings email copy verified with zero placeholders and plural grammar.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Real Email Copy for Follow-up 1 and Follow-up 2 (No Placeholders)
    // -------------------------------------------------------------------------
    console.log('[Test 5] Generating real email copy for Follow-up 1 and Follow-up 2...');
    const copyFu1 = humanCopywriterService.getEmailCopy(
      {
        id: '33333333-3333-3333-3333-333333333333',
        businessName: 'Highline Plumbing',
        category: 'Plumber',
        website: 'https://highlineplumbing.com',
        primaryContactName: 'Dave Miller',
        city: 'Denver',
        auditScore: 65,
        auditFindings: twoFindings,
        auditPdfName: 'Highline_Plumbing_Technical_Audit.pdf',
        auditPdfPath: dummyPdfPath,
      },
      'followup_1'
    );
    assertNoPlaceholders(copyFu1.subject, 'Follow-up 1 Subject');
    assertNoPlaceholders(copyFu1.body, 'Follow-up 1 Body');

    const copyFu2 = humanCopywriterService.getEmailCopy(
      {
        id: '44444444-4444-4444-4444-444444444444',
        businessName: 'Highline Plumbing',
        category: 'Plumber',
        website: 'https://highlineplumbing.com',
        primaryContactName: 'Dave Miller',
        city: 'Denver',
        auditScore: 65,
        auditFindings: twoFindings,
        auditPdfName: 'Highline_Plumbing_Technical_Audit.pdf',
        auditPdfPath: dummyPdfPath,
      },
      'followup_2'
    );
    assertNoPlaceholders(copyFu2.subject, 'Follow-up 2 Subject');
    assertNoPlaceholders(copyFu2.body, 'Follow-up 2 Body');
    console.log('✅ Test 5 Passed: Follow-up 1 & 2 verified with zero placeholders.\n');

  } finally {
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
    if (fs.existsSync(dummyPdfPath)) {
      fs.unlinkSync(dummyPdfPath);
    }
  }

  // Production Immutability Assertion
  const afterSnapshot = await captureProductionSnapshot();
  console.log('========================================================================');
  console.log('🛡️ PRODUCTION DATABASE IMMUTABILITY VERIFICATION');
  console.log('========================================================================');
  console.log(`Real Leads: Before=${beforeSnapshot.realLeadsCount}, After=${afterSnapshot.realLeadsCount} -> Δ = ${afterSnapshot.realLeadsCount - beforeSnapshot.realLeadsCount}`);
  console.log(`Failure Log Rows: Before=${beforeSnapshot.failureLogsCount}, After=${afterSnapshot.failureLogsCount} -> Δ = ${afterSnapshot.failureLogsCount - beforeSnapshot.failureLogsCount}`);

  if (
    beforeSnapshot.realLeadsCount !== afterSnapshot.realLeadsCount ||
    beforeSnapshot.failureLogsCount !== afterSnapshot.failureLogsCount
  ) {
    throw new Error('CRITICAL IMMUTABILITY VIOLATION: Production data was modified during test run!');
  }
  console.log('✅ IMMUTABILITY CONFIRMED: 0 production rows modified.\n');
}

function assertNoPlaceholders(text: string, context: string): void {
  const forbiddenPatterns = [
    /\{[a-zA-Z0-9_]+\}/,
    /\bundefined\b/,
    /\bnull\b/,
    /\bNaN\b/,
    /\[object Object\]/,
  ];

  for (const pat of forbiddenPatterns) {
    if (pat.test(text)) {
      throw new Error(`Placeholder or corrupted value found in ${context}: matched ${pat.toString()} in: "${text}"`);
    }
  }
}

runCleanSitesAndCopyTest()
  .then(() => {
    console.log('🎉 CLEAN SITES & REAL EMAIL COPY VERIFICATION COMPLETED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Clean Sites Test Failed:', err);
    process.exit(1);
  });
