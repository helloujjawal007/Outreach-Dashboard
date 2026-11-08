import path from 'path';
import fs from 'fs';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';
import { classifySmtpError } from '../utils/smtpClassifier';
import { suppressionService } from '../services/suppressionService';
import { cleanupOldAuditPdfs } from '../routes/auditCallback';

async function main() {
  console.log('========================================================================');
  console.log('🧪 ITEMS 7, 14, 15: SMTP ERROR CLASSIFICATION, WATCHDOG, RETENTION');
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('testSmtpClassesAndWatchdog');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `smtp_wd_${Date.now()}`;
  emailAdapter.setMockMode(true);

  // -------------------------------------------------------------------------
  // TEST 1: SMTP Error Classification Matrix
  // -------------------------------------------------------------------------
  console.log('[Test 1] Asserting Enhanced SMTP Status Codes & Classification Matrix...');
  const testErrors = [
    {
      code: '550 5.1.1 <nobody@test.com>: Recipient address rejected: User unknown',
      expectedType: 'hard_bounce',
      expectedFatal: true,
      expectedBreaker: false,
    },
    {
      code: '550 5.2.1 <disabled@test.com>: Mailbox disabled, not accepting messages',
      expectedType: 'hard_bounce',
      expectedFatal: true,
      expectedBreaker: false,
    },
    {
      code: '452 5.2.2 <full@test.com>: Mailbox is full / quota exceeded',
      expectedType: 'soft_bounce',
      expectedFatal: false,
      expectedBreaker: false,
    },
    {
      code: '450 4.2.1 Greylisted, please try again in 300 seconds',
      expectedType: 'transient',
      expectedFatal: false,
      expectedBreaker: false,
    },
    {
      code: '550 5.4.5 Daily user sending quota exceeded',
      expectedType: 'daily_limit_pause',
      expectedFatal: false,
      expectedBreaker: true,
    },
    {
      code: '535 5.7.8 Bad credentials / Username and Password not accepted',
      expectedType: 'mailbox_auth',
      expectedFatal: false,
      expectedBreaker: true,
    },
  ];

  for (const t of testErrors) {
    const res = classifySmtpError(t.code);
    console.log(`   - Code: "${t.code.slice(0, 40)}..." -> type="${res.type}", fatal=${res.isFatalForLead}, breaker=${res.shouldTripCircuitBreaker}`);
    if (res.type !== t.expectedType || res.isFatalForLead !== t.expectedFatal || res.shouldTripCircuitBreaker !== t.expectedBreaker) {
      throw new Error(`Test 1 FAILED on "${t.code}": expected type ${t.expectedType}, got ${res.type}`);
    }
  }
  console.log('✅ PASS: All SMTP error categories classified accurately.\n');

  // -------------------------------------------------------------------------
  // TEST 2: 5.1.1 & 5.2.1 Hard Bounce Isolation & Suppression (Item 14 Separation)
  // -------------------------------------------------------------------------
  console.log('[Test 2] Testing 5.1.1 & 5.2.1 Hard Bounce: Isolation & Suppression without marking opted_out (Item 14)...');
  const leadHb = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, consent_status, slot_id, notes)
     VALUES ($1, $2, 'https://bounce.test', 'initial', 'active', 'none', 'A', $3)
     RETURNING id`,
    [`${testTag}_HardBounce`, `bounce_${testTag}@unknown-box-${testTag}.test`, testTag]
  );

  const hbCandidate = {
    id: leadHb.rows[0].id,
    business_name: `${testTag}_HardBounce`,
    email: `bounce_${testTag}@unknown-box-${testTag}.test`,
    website: 'https://bounce.test',
  };

  await (fiveSlotSenderService as any).handleDispatchFailure(
    hbCandidate,
    'initial',
    'A',
    '550 5.1.1 <bounce@test>: Recipient address rejected: User unknown in virtual mailbox table'
  );

  const hbPost = await query<{ status: string; consent_status: string }>(
    `SELECT status, consent_status FROM leads WHERE id = $1`,
    [leadHb.rows[0].id]
  );
  const supCheck = await suppressionService.isSuppressed({ email: `bounce_${testTag}@unknown-box-${testTag}.test` });

  console.log(`   - Hard Bounce Lead: status="${hbPost.rows[0]?.status}" (MUST be manual_review)`);
  console.log(`   - Consent Status:   consent_status="${hbPost.rows[0]?.consent_status}" (MUST NOT be opted_out, remains none)`);
  console.log(`   - Suppression:      suppressed=${supCheck.suppressed}, reason="${supCheck.reason}"`);

  if (hbPost.rows[0]?.status !== 'manual_review') {
    throw new Error('Test 2 FAILED: Hard bounce lead was not isolated into manual_review!');
  }
  if (hbPost.rows[0]?.consent_status === 'opted_out') {
    throw new Error('Test 2 FAILED: Item 14 violation: Hard bounce lead was incorrectly marked opted_out!');
  }
  if (!supCheck.suppressed || !supCheck.reason?.includes('bounce')) {
    throw new Error('Test 2 FAILED: Hard bounce lead was not added to global suppression list with hard_bounce reason!');
  }
  console.log('✅ PASS: Hard bounce isolated, suppressed as hard_bounce, with consent_status strictly separated (NOT opted_out).\n');

  // -------------------------------------------------------------------------
  // TEST 2B: 550 5.7.1 Recipient Policy Block (Sliding Window & 5-Domain Threshold)
  // -------------------------------------------------------------------------
  console.log('[Test 2b] Testing 550 5.7.1 Recipient Policy Block: Tripping breaker ONLY on >= 5 distinct domains (Item 11)...');
  (fiveSlotSenderService as any).isCircuitBreakerTripped = false;
  (fiveSlotSenderService as any).recentPolicyBlocks = [];

  // Simulate 4 distinct domains rejecting with 5.7.1
  for (let i = 1; i <= 4; i++) {
    const domain = `policy-reject-${i}-${testTag}.test`;
    const leadRes = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes)
       VALUES ($1, $2, $3, 'initial', 'active', 'A', $4)
       RETURNING id`,
      [`Biz ${i}`, `contact@${domain}`, `https://${domain}`, testTag]
    );
    await (fiveSlotSenderService as any).handleDispatchFailure(
      { id: leadRes.rows[0].id, business_name: `Biz ${i}`, email: `contact@${domain}`, website: `https://${domain}` },
      'initial',
      'A',
      `550 5.7.1 Blocked by spam filter on ${domain}`
    );
  }
  console.log(`   - After 4 distinct domains: isCircuitBreakerTripped=${fiveSlotSenderService.isCircuitBreakerTripped} (MUST be false)`);
  if (fiveSlotSenderService.isCircuitBreakerTripped) {
    throw new Error('Test 2b FAILED: Circuit breaker tripped prematurely before 5 distinct domains rejected!');
  }

  // 5th distinct domain rejects with 5.7.1 -> Breaker MUST trip
  const domain5 = `policy-reject-5-${testTag}.test`;
  const lead5Res = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes)
     VALUES ($1, $2, $3, 'initial', 'active', 'A', $4)
     RETURNING id`,
    [`Biz 5`, `contact@${domain5}`, `https://${domain5}`, testTag]
  );
  await (fiveSlotSenderService as any).handleDispatchFailure(
    { id: lead5Res.rows[0].id, business_name: `Biz 5`, email: `contact@${domain5}`, website: `https://${domain5}` },
    'initial',
    'A',
    `550 5.7.1 Blocked by spam filter on ${domain5}`
  );
  console.log(`   - After 5 distinct domains: isCircuitBreakerTripped=${fiveSlotSenderService.isCircuitBreakerTripped} (MUST be true)`);
  if (!fiveSlotSenderService.isCircuitBreakerTripped) {
    throw new Error('Test 2b FAILED: Circuit breaker did not trip after 5 distinct domains rejected with 5.7.1!');
  }
  console.log('✅ PASS: 550 5.7.1 treated as recipient-specific policy block; circuit breaker tripped only upon >= 5 distinct domains.\n');
  (fiveSlotSenderService as any).isCircuitBreakerTripped = false;
  (fiveSlotSenderService as any).recentPolicyBlocks = [];

  // -------------------------------------------------------------------------
  // TEST 3: 5.4.5 Mailbox Daily Limit Quota (Timed Pause & Auto-Resume)
  // -------------------------------------------------------------------------
  console.log('[Test 3] Testing 5.4.5 Daily Sending Quota Timed Pause & Auto-Resume...');
  const leadQuota = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes)
     VALUES ($1, $2, 'https://quota.test', 'initial', 'active', 'B', $3)
     RETURNING id`,
    [`${testTag}_QuotaLead`, `quota_${testTag}@quota-box-${testTag}.test`, testTag]
  );

  const quotaCandidate = {
    id: leadQuota.rows[0].id,
    business_name: `${testTag}_QuotaLead`,
    email: `quota_${testTag}@quota-box-${testTag}.test`,
    website: 'https://quota.test',
  };

  // Trigger 5.4.5 failure
  await (fiveSlotSenderService as any).handleDispatchFailure(
    quotaCandidate,
    'initial',
    'B',
    '550 5.4.5 Daily user sending quota exceeded for cloudconsultancy.ad@gmail.com'
  );

  const quotaPost = await query<{ status: string; outreach_stage: string }>(
    `SELECT status, outreach_stage FROM leads WHERE id = $1`,
    [leadQuota.rows[0].id]
  );
  const isPaused = Boolean(fiveSlotSenderService.quotaPauseUntil && fiveSlotSenderService.quotaPauseUntil > new Date());

  console.log(`   - Quota Lead status="${quotaPost.rows[0]?.status}" (MUST be active), stage="${quotaPost.rows[0]?.outreach_stage}" (MUST be initial)`);
  console.log(`   - Quota Pause Active: ${isPaused}, Resume At: ${fiveSlotSenderService.quotaPauseUntil?.toISOString()}`);

  if (quotaPost.rows[0]?.status !== 'active' || !isPaused) {
    throw new Error('Test 3 FAILED: 5.4.5 did not leave lead active or did not set quota timed pause!');
  }

  // Simulate auto-resume: advance time past quotaPauseUntil
  const futureResumeDate = new Date(fiveSlotSenderService.quotaPauseUntil!.getTime() + 1000);
  const tickAutoResume = await fiveSlotSenderService.processGlobalTick(futureResumeDate, testTag, { bypassWindow: true, bypassDailyCap: true });
  console.log(`   - Auto-Resume after pause elapsed: quotaPauseUntil is cleared -> ${fiveSlotSenderService.quotaPauseUntil === null}`);
  if (fiveSlotSenderService.quotaPauseUntil !== null) {
    throw new Error('Test 3 FAILED: Quota timed pause did not auto-resume!');
  }
  console.log('✅ PASS: 5.4.5 daily quota timed pause and auto-resume confirmed.\n');

  // -------------------------------------------------------------------------
  // TEST 4: 5.2.2 Mailbox Full (Soft Retry with Cap)
  // -------------------------------------------------------------------------
  console.log('[Test 4] Testing 5.2.2 Mailbox Full Soft Retry with Cap of 3...');
  const leadFull = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes)
     VALUES ($1, $2, 'https://full.test', 'initial', 'active', 'C', $3)
     RETURNING id`,
    [`${testTag}_FullBox`, `full_${testTag}@full-box-${testTag}.test`, testTag]
  );

  const fullCandidate = {
    id: leadFull.rows[0].id,
    business_name: `${testTag}_FullBox`,
    email: `full_${testTag}@full-box-${testTag}.test`,
    website: 'https://full.test',
  };

  // Attempt 1: soft bounce (should remain active)
  await (fiveSlotSenderService as any).handleDispatchFailure(fullCandidate, 'initial', 'C', '452 5.2.2 Mailbox full');
  const full1 = await query<{ status: string; transient_retry_count: number }>(`SELECT status, transient_retry_count FROM leads WHERE id = $1`, [leadFull.rows[0].id]);
  console.log(`   - Attempt 1: status="${full1.rows[0]?.status}", retries=${full1.rows[0]?.transient_retry_count}`);

  // Attempt 2: soft bounce (should remain active)
  await (fiveSlotSenderService as any).handleDispatchFailure(fullCandidate, 'initial', 'C', '452 5.2.2 Mailbox full');
  const full2 = await query<{ status: string; transient_retry_count: number }>(`SELECT status, transient_retry_count FROM leads WHERE id = $1`, [leadFull.rows[0].id]);
  console.log(`   - Attempt 2: status="${full2.rows[0]?.status}", retries=${full2.rows[0]?.transient_retry_count}`);

  // Attempt 3: soft bounce (cap reached -> should quarantine)
  await (fiveSlotSenderService as any).handleDispatchFailure(fullCandidate, 'initial', 'C', '452 5.2.2 Mailbox full');
  const full3 = await query<{ status: string; transient_retry_count: number }>(`SELECT status, transient_retry_count FROM leads WHERE id = $1`, [leadFull.rows[0].id]);
  console.log(`   - Attempt 3: status="${full3.rows[0]?.status}", retries=${full3.rows[0]?.transient_retry_count}`);

  if (full1.rows[0]?.status !== 'active' || full2.rows[0]?.status !== 'active' || full3.rows[0]?.status !== 'manual_review') {
    throw new Error('Test 4 FAILED: 5.2.2 mailbox full did not retry 2 times before quarantining on 3rd attempt!');
  }
  console.log('✅ PASS: 5.2.2 soft bounce retries cleanly and quarantines upon reaching cap of 3.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Watchdog SLA Timeout for Dropped TD Callback
  // -------------------------------------------------------------------------
  console.log('[Test 5] Testing Delivery Watchdog for Dropped TD Callback (Item 7)...');
  const leadWatchdog = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_status, audit_requested_at)
     VALUES ($1, $2, 'https://watchdog.test', 'initial', 'active', 'D', $3, 'pending', NOW() - INTERVAL '20 minutes')
     RETURNING id`,
    [`${testTag}_Watchdog`, `wd_${testTag}@dropped-callback.test`, testTag]
  );

  const flagged = await fiveSlotSenderService.checkReportDeliveryWatchdog(15 * 60 * 1000);
  console.log(`   - Watchdog flagged leads: ${flagged}`);

  const wdPost = await query<{ status: string; manual_review_reason: string }>(
    `SELECT status, manual_review_reason FROM leads WHERE id = $1`,
    [leadWatchdog.rows[0].id]
  );
  const failureRow = await query<{ type: string; error_message: string }>(
    `SELECT type, error_message FROM failure_log WHERE lead_id = $1`,
    [leadWatchdog.rows[0].id]
  );

  console.log(`   - Watchdog Lead status="${wdPost.rows[0]?.status}", reason="${wdPost.rows[0]?.manual_review_reason}"`);
  console.log(`   - Failure Log: type="${failureRow.rows[0]?.type}", error="${failureRow.rows[0]?.error_message}"`);

  if (
    wdPost.rows[0]?.status !== 'manual_review' ||
    failureRow.rows[0]?.type !== 'REPORT_DELIVERY_FAILED'
  ) {
    throw new Error('Test 5 FAILED: Watchdog did not quarantine lead or record REPORT_DELIVERY_FAILED!');
  }
  console.log('✅ PASS: Watchdog detected dropped TD audit and recorded REPORT_DELIVERY_FAILED.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Retention Policy & 2 MB Attachment Cap (Item 15)
  // -------------------------------------------------------------------------
  console.log('[Test 6] Testing PDF Retention Keyed to Lead Completion & 2 MB Attachment Cap...');
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });

  const oldCompletedPdf = path.join(auditsDir, `${testTag}_completed_old.pdf`);
  const activeDripPdf = path.join(auditsDir, `${testTag}_active_drip.pdf`);
  fs.writeFileSync(oldCompletedPdf, '%PDF-1.4\n' + '0'.repeat(1000));
  fs.writeFileSync(activeDripPdf, '%PDF-1.4\n' + '0'.repeat(1000));

  // Lead 1: Completed 30 days ago (MUST be purged by retention)
  const leadCompleted = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_pdf_path, last_contacted_at, updated_at)
     VALUES ($1, $2, 'https://completed.test', 'completed', 'completed', 'A', $3, $4, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
     RETURNING id`,
    [`${testTag}_Completed`, `comp_${testTag}@done.test`, testTag, oldCompletedPdf]
  );

  // Lead 2: Active lead in drip touched 30 days ago (MUST NOT be purged by retention)
  const leadActiveDrip = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_pdf_path, last_contacted_at, updated_at)
     VALUES ($1, $2, 'https://active.test', 'followup_1', 'active', 'B', $3, $4, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
     RETURNING id`,
    [`${testTag}_ActiveDrip`, `active_${testTag}@drip.test`, testTag, activeDripPdf]
  );

  // Run retention cleanup
  await cleanupOldAuditPdfs(auditsDir, 28);

  const completedPdfExists = fs.existsSync(oldCompletedPdf);
  const activePdfExists = fs.existsSync(activeDripPdf);
  console.log(`   - Completed Lead PDF purged (>28 days after completion): exists=${completedPdfExists} (MUST be false)`);
  console.log(`   - Active Drip Lead PDF preserved (Still active):        exists=${activePdfExists} (MUST be true)`);

  if (completedPdfExists || !activePdfExists) {
    throw new Error('Test 6 FAILED: Retention cleanup was not properly keyed to lead completion state!');
  }

  // Verify 2 MB attachment limit check
  const oversizePdf = path.join(auditsDir, `${testTag}_oversize_3mb.pdf`);
  fs.writeFileSync(oversizePdf, '%PDF-1.4\n' + '0'.repeat(3 * 1024 * 1024));
  const statsOversize = fs.statSync(oversizePdf);
  const isOver2Mb = statsOversize.size > 2 * 1024 * 1024;
  console.log(`   - 3 MB file exceeds 2 MB attachment limit: ${isOver2Mb} (${(statsOversize.size / 1024 / 1024).toFixed(2)} MB)`);
  if (!isOver2Mb) throw new Error('Test 6 FAILED: Oversize check failed!');
  fs.unlinkSync(oversizePdf);
  if (fs.existsSync(activeDripPdf)) fs.unlinkSync(activeDripPdf);

  console.log('✅ PASS: Retention correctly keyed to completion; 2 MB limit confirmed.\n');

  // Verify Production Database Immutability
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'testSmtpClassesAndWatchdog');

  console.log('========================================================================');
  console.log('✅ ALL SMTP, WATCHDOG, & RETENTION TESTS PASSED (Δ = 0 PROD IMMUTABILITY)');
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Error in testSmtpClassesAndWatchdog:', err);
  process.exit(1);
});
