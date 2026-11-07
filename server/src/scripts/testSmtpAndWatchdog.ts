import http from 'http';
import { query, assertNotProduction, captureProductionSnapshot } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { classifySmtpError } from '../utils/smtpClassifier';
import { suppressionService } from '../services/suppressionService';

async function runSmtpAndWatchdogTest() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING ITEM 6 & 7: SMTP ENHANCED CLASSIFICATION & DELIVERY WATCHDOG');
  console.log('========================================================================\n');

  assertNotProduction('SMTP & Watchdog Harness');
  const beforeSnapshot = await captureProductionSnapshot();

  const testTag = `smtp_wd_${Date.now()}`;
  const createdLeadIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: SMTP Error Classifier Unit Assertions
    // -------------------------------------------------------------------------
    console.log('[Test 1] Asserting Enhanced Status Code Classifier outputs...');
    
    // 1a. 5.1.1 Bad Recipient
    const c511 = classifySmtpError('550 5.1.1 <user@example.com>: Recipient address rejected: User unknown');
    console.log(`   - 5.1.1 Code: type="${c511.type}", fatalForLead=${c511.isFatalForLead}, tripBreaker=${c511.shouldTripCircuitBreaker}`);
    if (c511.type !== 'hard_bounce' || !c511.isFatalForLead || c511.shouldTripCircuitBreaker) {
      throw new Error('5.1.1 must be hard_bounce, fatal for lead, without tripping breaker');
    }

    // 1b. 5.4.5 Daily Quota
    const c545 = classifySmtpError('550 5.4.5 Daily user sending quota exceeded');
    console.log(`   - 5.4.5 Code: type="${c545.type}", fatalForLead=${c545.isFatalForLead}, tripBreaker=${c545.shouldTripCircuitBreaker}`);
    if (c545.type !== 'mailbox_auth' || c545.isFatalForLead || !c545.shouldTripCircuitBreaker) {
      throw new Error('5.4.5 must be mailbox_auth, non-fatal for lead, tripping breaker');
    }

    // 1c. 5.7.1 Policy / Relay
    const c571 = classifySmtpError('554 5.7.1 Relay access denied - Policy violation');
    console.log(`   - 5.7.1 Code: type="${c571.type}", fatalForLead=${c571.isFatalForLead}, tripBreaker=${c571.shouldTripCircuitBreaker}`);
    if (c571.type !== 'mailbox_auth' || c571.isFatalForLead || !c571.shouldTripCircuitBreaker) {
      throw new Error('5.7.1 must be mailbox_auth, non-fatal for lead, tripping breaker');
    }

    // 1d. Transient (421 / ETIMEDOUT)
    const c421 = classifySmtpError('421 4.7.0 Try again later, server closing transmission channel');
    console.log(`   - 421 Code: type="${c421.type}", fatalForLead=${c421.isFatalForLead}, retryLead=${c421.shouldRetryLead}`);
    if (c421.type !== 'transient' || c421.isFatalForLead || !c4421IsRetry(c421)) {
      throw new Error('421 must be transient, non-fatal for lead, retry lead');
    }
    console.log('✅ Test 1 Passed: Enhanced SMTP status codes accurately classified.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Hard Bounce (5.1.1) Execution in Dispatch Failure
    // -------------------------------------------------------------------------
    console.log('[Test 2] Testing 5.1.1 Hard Bounce Lead Isolation & Suppression...');
    const leadHb = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status, outreach_stage, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'sending', $4, NOW(), NOW()) RETURNING id`,
      [`${testTag}_HardBounce`, `bounce_${testTag}@unknown-mailbox-${testTag}.test`, 'https://hb.test', testTag]
    );
    createdLeadIds.push(leadHb.rows[0].id);

    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadHb.rows[0].id,
        business_name: 'Bounce Lead Co',
        website: 'https://hb.test',
        email: `bounce_${testTag}@unknown-mailbox-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'A',
      '550 5.1.1 <bounce@test>: Recipient address rejected: User unknown in virtual mailbox table'
    );

    const hbPost = await query<{ status: string; consent_status: string }>(
      `SELECT status, consent_status FROM leads WHERE id = $1`,
      [leadHb.rows[0].id]
    );
    const supCheck = await suppressionService.isSuppressed({ email: `bounce_${testTag}@unknown-mailbox-${testTag}.test` });
    const isSuppressed = supCheck.suppressed;
    console.log(`   - Hard Bounce Lead: status="${hbPost.rows[0]?.status}", consent_status="${hbPost.rows[0]?.consent_status}", suppressed=${isSuppressed}`);

    if (hbPost.rows[0]?.status !== 'manual_review' || hbPost.rows[0]?.consent_status !== 'opted_out' || !isSuppressed) {
      throw new Error('Test 2 FAILED: Hard bounce lead was not isolated and suppressed!');
    }
    console.log('✅ Test 2 Passed: 5.1.1 hard bounce isolated, marked manual_review, and added to suppression list.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Mailbox Auth (535) Leaves First Leads Untouched + Trips Breaker on 3rd + Resumes
    // -------------------------------------------------------------------------
    console.log('[Test 3] Testing 535 Auth Failure non-isolation of leads & Circuit Breaker trip/resume...');
    fiveSlotSenderService.resetCircuitBreaker();

    const leadAuth1 = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status, outreach_stage, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'B', 'active', 'none', 'sending', $4, NOW(), NOW()) RETURNING id`,
      [`${testTag}_AuthLead1`, `auth1_${testTag}@good-prospect-${testTag}.test`, 'https://good1.test', testTag]
    );
    createdLeadIds.push(leadAuth1.rows[0].id);

    // 1st 535 Failure
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadAuth1.rows[0].id,
        business_name: 'Auth Lead 1',
        website: 'https://good1.test',
        email: `auth1_${testTag}@good-prospect-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'B',
      '535 5.7.8 Username and Password not accepted (credentials revoked)'
    );

    const lead1Check = await query<{ status: string; outreach_stage: string }>(
      `SELECT status, outreach_stage FROM leads WHERE id = $1`,
      [leadAuth1.rows[0].id]
    );
    let cbState = fiveSlotSenderService.getCircuitBreakerState();
    console.log(`   - Hit #1 (535): Lead status="${lead1Check.rows[0]?.status}" (expected "active"), stage="${lead1Check.rows[0]?.outreach_stage}" (expected "initial"), CB failures=${cbState.failures}`);
    if (lead1Check.rows[0]?.status !== 'active' || lead1Check.rows[0]?.outreach_stage !== 'initial' || cbState.failures !== 1) {
      throw new Error('Test 3 FAILED: First lead hit by 535 was improperly isolated or stage altered!');
    }

    // 2nd 535 Failure
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadAuth1.rows[0].id,
        business_name: 'Auth Lead 1',
        website: 'https://good1.test',
        email: `auth1_${testTag}@good-prospect-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'B',
      '535 5.7.8 Bad credentials'
    );
    cbState = fiveSlotSenderService.getCircuitBreakerState();
    console.log(`   - Hit #2 (535): CB failures=${cbState.failures}, tripped=${cbState.tripped}`);

    // 3rd 535 Failure -> Must trip circuit breaker
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadAuth1.rows[0].id,
        business_name: 'Auth Lead 1',
        website: 'https://good1.test',
        email: `auth1_${testTag}@good-prospect-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'B',
      '535 5.7.8 Bad credentials'
    );
    cbState = fiveSlotSenderService.getCircuitBreakerState();
    console.log(`   - Hit #3 (535): CB tripped=${cbState.tripped}, failures=${cbState.failures}, alert="${cbState.alert}"`);
    if (!cbState.tripped || cbState.failures !== 3 || !cbState.alert) {
      throw new Error('Test 3 FAILED: Circuit breaker did not trip after 3 auth failures!');
    }

    // Lead STILL must remain active (never quarantined for mailbox credentials issue!)
    const lead1CheckFinal = await query<{ status: string }>(`SELECT status FROM leads WHERE id = $1`, [leadAuth1.rows[0].id]);
    console.log(`   - Lead status after CB tripped: "${lead1CheckFinal.rows[0]?.status}" (MUST BE "active")`);
    if (lead1CheckFinal.rows[0]?.status !== 'active') {
      throw new Error('Test 3 FAILED: Lead was quarantined when mailbox failed auth!');
    }

    // Resume circuit breaker
    console.log('   - Resuming circuit breaker via resumeCircuitBreaker()...');
    await fiveSlotSenderService.resumeCircuitBreaker();
    const settingsDb = await fiveSlotSenderService.getSettings();
    const cbResumedState = fiveSlotSenderService.getCircuitBreakerState();
    console.log(`   - Resumed state: tripped=${cbResumedState.tripped}, failures=${cbResumedState.failures}, DB is_active=${settingsDb.is_active}`);
    if (cbResumedState.tripped !== false || cbResumedState.failures !== 0 || !settingsDb.is_active) {
      throw new Error('Test 3 FAILED: Circuit breaker did not resume cleanly!');
    }
    console.log('✅ Test 3 Passed: 535 never isolates prospect leads, trips breaker on 3rd failure, and resumes cleanly.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Transient Faults (421 / ETIMEDOUT) Retry Cap
    // -------------------------------------------------------------------------
    console.log('[Test 4] Testing Transient error retry cap (no isolation on attempts 1-2, isolation on attempt 3)...');
    const leadTransient = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status, outreach_stage, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, 'C', 'active', 'none', 'sending', $4, NOW(), NOW()) RETURNING id`,
      [`${testTag}_TransientLead`, `trans_${testTag}@network-glitch-${testTag}.test`, 'https://glitch.test', testTag]
    );
    createdLeadIds.push(leadTransient.rows[0].id);

    // Attempt 1: Transient 421
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadTransient.rows[0].id,
        business_name: 'Transient Co',
        website: 'https://glitch.test',
        email: `trans_${testTag}@network-glitch-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'C',
      '421 4.4.2 Connection timed out'
    );
    const trans1 = await query<{ status: string; transient_retry_count: number }>(
      `SELECT status, transient_retry_count FROM leads WHERE id = $1`,
      [leadTransient.rows[0].id]
    );
    console.log(`   - Transient Attempt 1: status="${trans1.rows[0]?.status}", retries=${trans1.rows[0]?.transient_retry_count}`);
    if (trans1.rows[0]?.status !== 'active' || trans1.rows[0]?.transient_retry_count !== 1) {
      throw new Error('Transient attempt 1 should increment retry count without isolating lead');
    }

    // Set outreach_stage back to 'sending' for attempt 2 simulation
    await query(`UPDATE leads SET outreach_stage = 'sending' WHERE id = $1`, [leadTransient.rows[0].id]);
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadTransient.rows[0].id,
        business_name: 'Transient Co',
        website: 'https://glitch.test',
        email: `trans_${testTag}@network-glitch-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'C',
      'ETIMEDOUT: Connection reset by peer'
    );
    const trans2 = await query<{ status: string; transient_retry_count: number }>(
      `SELECT status, transient_retry_count FROM leads WHERE id = $1`,
      [leadTransient.rows[0].id]
    );
    console.log(`   - Transient Attempt 2: status="${trans2.rows[0]?.status}", retries=${trans2.rows[0]?.transient_retry_count}`);
    if (trans2.rows[0]?.status !== 'active' || trans2.rows[0]?.transient_retry_count !== 2) {
      throw new Error('Transient attempt 2 should increment retry count without isolating lead');
    }

    // Set outreach_stage back to 'sending' for attempt 3 simulation
    await query(`UPDATE leads SET outreach_stage = 'sending' WHERE id = $1`, [leadTransient.rows[0].id]);
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: leadTransient.rows[0].id,
        business_name: 'Transient Co',
        website: 'https://glitch.test',
        email: `trans_${testTag}@network-glitch-${testTag}.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'C',
      '451 4.3.0 Mail server busy'
    );
    const trans3 = await query<{ status: string; transient_retry_count: number }>(
      `SELECT status, transient_retry_count FROM leads WHERE id = $1`,
      [leadTransient.rows[0].id]
    );
    console.log(`   - Transient Attempt 3: status="${trans3.rows[0]?.status}" (expected "manual_review"), retries=${trans3.rows[0]?.transient_retry_count}`);
    if (trans3.rows[0]?.status !== 'manual_review' || trans3.rows[0]?.transient_retry_count !== 3) {
      throw new Error('Transient attempt 3 should reach cap and isolate lead');
    }
    console.log('✅ Test 4 Passed: Transient faults retry cleanly with cap of 3 before quarantine.\n');

    // -------------------------------------------------------------------------
    // TEST 5: REPORT_DELIVERY_FAILED Watchdog
    // TD accepts request (HTTP 200) but never calls back within SLA
    // -------------------------------------------------------------------------
    console.log('[Test 5] Testing TD Stub & Watchdog for REPORT_DELIVERY_FAILED...');
    
    // Create an HTTP stub for TD that accepts requests with HTTP 200 but never delivers callback
    const stubPort = 5066;
    let stubRequestsReceived = 0;
    const tdStubServer = http.createServer((req, res) => {
      stubRequestsReceived++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Audit queued in TD', jobId: `job_${Date.now()}` }));
    });
    await new Promise<void>((resolve) => tdStubServer.listen(stubPort, '127.0.0.1', () => resolve()));

    // Insert lead that was dispatched to TD 20 minutes ago (audit_requested_at is 20m old, SLA is 15m)
    const leadDropped = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status, outreach_stage,
         audit_status, audit_requested_at, notes, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'D', 'active', 'none', 'initial',
         'pending', NOW() - INTERVAL '20 minutes', $4, NOW() - INTERVAL '20 minutes', NOW()
       ) RETURNING id`,
      [`${testTag}_DroppedTD`, `dropped_${testTag}@dropped-client-${testTag}.test`, 'https://dropped.test', testTag]
    );
    createdLeadIds.push(leadDropped.rows[0].id);

    console.log(`   - Queued lead ${leadDropped.rows[0].id} with audit_requested_at 20 minutes ago.`);
    console.log(`   - Running checkReportDeliveryWatchdog(15m timeout)...`);

    // Execute Watchdog
    const flaggedCount = await fiveSlotSenderService.checkReportDeliveryWatchdog(15 * 60 * 1000);
    console.log(`   - Watchdog flagged ${flaggedCount} dropped lead(s).`);

    // Verify lead status
    const droppedLeadPost = await query<{ status: string; manual_review_reason: string }>(
      `SELECT status, manual_review_reason FROM leads WHERE id = $1`,
      [leadDropped.rows[0].id]
    );
    console.log(`   - Lead status after watchdog: "${droppedLeadPost.rows[0]?.status}" (expected "manual_review")`);
    console.log(`   - Reason: "${droppedLeadPost.rows[0]?.manual_review_reason}"`);

    // Verify failure_log entry
    const logRes = await query<{ type: string; error_message: string }>(
      `SELECT type, error_message FROM failure_log WHERE lead_id = $1`,
      [leadDropped.rows[0].id]
    );
    console.log(`   - Failure log type: "${logRes.rows[0]?.type}" (expected "REPORT_DELIVERY_FAILED")`);
    console.log(`   - Error message: "${logRes.rows[0]?.error_message}"`);

    tdStubServer.close();

    if (
      droppedLeadPost.rows[0]?.status !== 'manual_review' ||
      logRes.rows[0]?.type !== 'REPORT_DELIVERY_FAILED' ||
      !logRes.rows[0]?.error_message.includes('Technical Dashboard accepted audit but never called back')
    ) {
      throw new Error('Test 5 FAILED: Watchdog did not record REPORT_DELIVERY_FAILED!');
    }
    console.log('✅ Test 5 Passed: Watchdog successfully detected dropped TD callback and recorded REPORT_DELIVERY_FAILED.\n');

  } finally {
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM failure_log WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
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

function c4421IsRetry(r: any): boolean {
  return r.shouldRetryLead === true;
}

runSmtpAndWatchdogTest()
  .then(() => {
    console.log('🎉 SMTP ENHANCED CLASSIFICATION & DELIVERY WATCHDOG COMPLETED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test Failed:', err);
    process.exit(1);
  });
