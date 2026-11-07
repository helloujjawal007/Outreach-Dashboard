import { query, assertNotProduction, captureProductionSnapshot } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';

async function runReaperBugAndStagesTest() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING ITEM 2 & 3: REAPER STAGE RESET BUG & TEST ISOLATION');
  console.log('========================================================================\n');

  // 1. Refuse to run against production
  assertNotProduction('Reaper & Test Isolation Harness');
  console.log('✓ Production Safety Check: Confirmed local/test isolated database.');

  // 2. Capture baseline production snapshot
  const beforeSnapshot = await captureProductionSnapshot();
  console.log('✓ Baseline Production Snapshot Captured:');
  console.log(`   - Real Leads: ${beforeSnapshot.realLeadsCount}`);
  console.log(`   - Stage Breakdown:`, JSON.stringify(beforeSnapshot.stagesCount));
  console.log(`   - Failure Log Records: ${beforeSnapshot.failureLogsCount}\n`);

  const testTag = `reaper_test_${Date.now()}`;
  const createdLeadIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST A: Crash BEFORE send at followup_1 -> Must reset to SAME stage (followup_1)
    // -------------------------------------------------------------------------
    console.log('[Test A] Testing crash BEFORE send at followup_1...');
    const leadA = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, claimed_stage, claimed_at, last_sent_stage, last_sent_at, notes, updated_at
       )
       VALUES (
         $1, $2, $3, 'A', 'active', 'none',
         'sending', 'followup_1', NOW() - INTERVAL '6 minutes',
         'initial', NOW() - INTERVAL '50 hours', $4, NOW() - INTERVAL '6 minutes'
       ) RETURNING id`,
      [`${testTag}_A`, `a_${testTag}@example.test`, 'https://a.test', testTag]
    );
    createdLeadIds.push(leadA.rows[0].id);

    await fiveSlotSenderService.reapStaleSendingClaims();

    const leadAPost = await query<{ outreach_stage: string; claimed_stage: string | null }>(
      `SELECT outreach_stage, claimed_stage FROM leads WHERE id = $1`,
      [leadA.rows[0].id]
    );
    console.log(`   - Stage after crash-before-send: "${leadAPost.rows[0]?.outreach_stage}" (expected "followup_1")`);
    if (leadAPost.rows[0]?.outreach_stage !== 'followup_1') {
      throw new Error(`Test A FAILED: Crash before send at followup_1 reset to "${leadAPost.rows[0]?.outreach_stage}" instead of "followup_1"!`);
    }
    console.log('✅ Test A Passed: Crash before send at followup_1 safely reset to SAME stage "followup_1".\n');

    // -------------------------------------------------------------------------
    // TEST B: Crash BEFORE send at followup_2 -> Must reset to SAME stage (followup_2)
    // -------------------------------------------------------------------------
    console.log('[Test B] Testing crash BEFORE send at followup_2...');
    const leadB = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, claimed_stage, claimed_at, last_sent_stage, last_sent_at, notes, updated_at
       )
       VALUES (
         $1, $2, $3, 'B', 'active', 'none',
         'sending', 'followup_2', NOW() - INTERVAL '6 minutes',
         'followup_1', NOW() - INTERVAL '75 hours', $4, NOW() - INTERVAL '6 minutes'
       ) RETURNING id`,
      [`${testTag}_B`, `b_${testTag}@example.test`, 'https://b.test', testTag]
    );
    createdLeadIds.push(leadB.rows[0].id);

    await fiveSlotSenderService.reapStaleSendingClaims();

    const leadBPost = await query<{ outreach_stage: string; claimed_stage: string | null }>(
      `SELECT outreach_stage, claimed_stage FROM leads WHERE id = $1`,
      [leadB.rows[0].id]
    );
    console.log(`   - Stage after crash-before-send: "${leadBPost.rows[0]?.outreach_stage}" (expected "followup_2")`);
    if (leadBPost.rows[0]?.outreach_stage !== 'followup_2') {
      throw new Error(`Test B FAILED: Crash before send at followup_2 reset to "${leadBPost.rows[0]?.outreach_stage}" instead of "followup_2"!`);
    }
    console.log('✅ Test B Passed: Crash before send at followup_2 safely reset to SAME stage "followup_2".\n');

    // -------------------------------------------------------------------------
    // TEST C: Crash AFTER send at initial -> Must advance by EXACTLY ONE stage to followup_1
    // -------------------------------------------------------------------------
    console.log('[Test C] Testing crash AFTER send at initial...');
    const leadC = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, claimed_stage, claimed_at, last_sent_stage, last_sent_at, last_sent_message_id, notes, updated_at
       )
       VALUES (
         $1, $2, $3, 'C', 'active', 'none',
         'sending', 'initial', NOW() - INTERVAL '6 minutes',
         'initial', NOW() - INTERVAL '5 minutes', '<c-msg@test.local>', $4, NOW() - INTERVAL '6 minutes'
       ) RETURNING id`,
      [`${testTag}_C`, `c_${testTag}@example.test`, 'https://c.test', testTag]
    );
    createdLeadIds.push(leadC.rows[0].id);

    await fiveSlotSenderService.reapStaleSendingClaims();

    const leadCPost = await query<{ outreach_stage: string; claimed_stage: string | null }>(
      `SELECT outreach_stage, claimed_stage FROM leads WHERE id = $1`,
      [leadC.rows[0].id]
    );
    console.log(`   - Stage after crash-after-send: "${leadCPost.rows[0]?.outreach_stage}" (expected "followup_1")`);
    if (leadCPost.rows[0]?.outreach_stage !== 'followup_1') {
      throw new Error(`Test C FAILED: Crash after send at initial advanced to "${leadCPost.rows[0]?.outreach_stage}" instead of "followup_1"!`);
    }
    console.log('✅ Test C Passed: Crash after send at initial advanced by exactly one stage to "followup_1".\n');

    // -------------------------------------------------------------------------
    // TEST D: Crash AFTER send at followup_1 -> Must advance by EXACTLY ONE stage to followup_2
    // -------------------------------------------------------------------------
    console.log('[Test D] Testing crash AFTER send at followup_1...');
    const leadD = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, claimed_stage, claimed_at, last_sent_stage, last_sent_at, last_sent_message_id, notes, updated_at
       )
       VALUES (
         $1, $2, $3, 'D', 'active', 'none',
         'sending', 'followup_1', NOW() - INTERVAL '6 minutes',
         'followup_1', NOW() - INTERVAL '5 minutes', '<d-msg@test.local>', $4, NOW() - INTERVAL '6 minutes'
       ) RETURNING id`,
      [`${testTag}_D`, `d_${testTag}@example.test`, 'https://d.test', testTag]
    );
    createdLeadIds.push(leadD.rows[0].id);

    await fiveSlotSenderService.reapStaleSendingClaims();

    const leadDPost = await query<{ outreach_stage: string }>(
      `SELECT outreach_stage FROM leads WHERE id = $1`,
      [leadD.rows[0].id]
    );
    console.log(`   - Stage after crash-after-send: "${leadDPost.rows[0]?.outreach_stage}" (expected "followup_2")`);
    if (leadDPost.rows[0]?.outreach_stage !== 'followup_2') {
      throw new Error(`Test D FAILED: Crash after send at followup_1 advanced to "${leadDPost.rows[0]?.outreach_stage}" instead of "followup_2"!`);
    }
    console.log('✅ Test D Passed: Crash after send at followup_1 advanced by exactly one stage to "followup_2".\n');

    // -------------------------------------------------------------------------
    // TEST E: Crash AFTER send at followup_2 -> Must advance by EXACTLY ONE stage to completed
    // -------------------------------------------------------------------------
    console.log('[Test E] Testing crash AFTER send at followup_2...');
    const leadE = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, claimed_stage, claimed_at, last_sent_stage, last_sent_at, last_sent_message_id, notes, updated_at
       )
       VALUES (
         $1, $2, $3, 'E', 'active', 'none',
         'sending', 'followup_2', NOW() - INTERVAL '6 minutes',
         'followup_2', NOW() - INTERVAL '5 minutes', '<e-msg@test.local>', $4, NOW() - INTERVAL '6 minutes'
       ) RETURNING id`,
      [`${testTag}_E`, `e_${testTag}@example.test`, 'https://e.test', testTag]
    );
    createdLeadIds.push(leadE.rows[0].id);

    await fiveSlotSenderService.reapStaleSendingClaims();

    const leadEPost = await query<{ outreach_stage: string }>(
      `SELECT outreach_stage FROM leads WHERE id = $1`,
      [leadE.rows[0].id]
    );
    console.log(`   - Stage after crash-after-send: "${leadEPost.rows[0]?.outreach_stage}" (expected "completed")`);
    if (leadEPost.rows[0]?.outreach_stage !== 'completed') {
      throw new Error(`Test E FAILED: Crash after send at followup_2 advanced to "${leadEPost.rows[0]?.outreach_stage}" instead of "completed"!`);
    }
    console.log('✅ Test E Passed: Crash after send at followup_2 advanced by exactly one stage to "completed".\n');

    // -------------------------------------------------------------------------
    // TEST F: Reaper Threshold Honored (< 5 minutes NOT reaped, >= 5 minutes REAPED)
    // -------------------------------------------------------------------------
    console.log('[Test F] Testing Reaper 5-Minute Stale Threshold...');
    const leadYoung = await query<{ id: string }>(
      `INSERT INTO leads (
         business_name, email, website, slot_id, status, consent_status,
         outreach_stage, claimed_stage, claimed_at, notes, updated_at
       )
       VALUES (
         $1, $2, $3, 'A', 'active', 'none',
         'sending', 'initial', NOW() - INTERVAL '2 minutes', $4, NOW() - INTERVAL '2 minutes'
       ) RETURNING id`,
      [`${testTag}_Young`, `young_${testTag}@example.test`, 'https://young.test', testTag]
    );
    createdLeadIds.push(leadYoung.rows[0].id);

    // Run reaper with standard 5-minute threshold
    await fiveSlotSenderService.reapStaleSendingClaims(5);

    const leadYoungPost = await query<{ outreach_stage: string }>(
      `SELECT outreach_stage FROM leads WHERE id = $1`,
      [leadYoung.rows[0].id]
    );
    console.log(`   - Young claim (2 min old): outreach_stage="${leadYoungPost.rows[0]?.outreach_stage}" (expected "sending" - NOT reaped)`);
    if (leadYoungPost.rows[0]?.outreach_stage !== 'sending') {
      throw new Error('Test F FAILED: Young claim (< 5 min) was incorrectly reaped!');
    }

    // Now artificially age it to 6 minutes
    await query(`UPDATE leads SET updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`, [leadYoung.rows[0].id]);
    await fiveSlotSenderService.reapStaleSendingClaims(5);

    const leadAgedPost = await query<{ outreach_stage: string }>(
      `SELECT outreach_stage FROM leads WHERE id = $1`,
      [leadYoung.rows[0].id]
    );
    console.log(`   - Aged claim (6 min old): outreach_stage="${leadAgedPost.rows[0]?.outreach_stage}" (expected "initial" - reaped)`);
    if (leadAgedPost.rows[0]?.outreach_stage !== 'initial') {
      throw new Error('Test F FAILED: Aged claim (>= 5 min) was NOT reaped!');
    }
    console.log('✅ Test F Passed: Stale claim threshold strictly honored.\n');

  } finally {
    // Clean up test records
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
  }

  // 3. Assert Production Snapshot Immutability
  const afterSnapshot = await captureProductionSnapshot();
  console.log('========================================================================');
  console.log('🛡️ PRODUCTION DATABASE IMMUTABILITY VERIFICATION');
  console.log('========================================================================');
  console.log(`Real Leads: Before=${beforeSnapshot.realLeadsCount}, After=${afterSnapshot.realLeadsCount} -> Δ = ${afterSnapshot.realLeadsCount - beforeSnapshot.realLeadsCount}`);
  console.log(`Failure Log Rows: Before=${beforeSnapshot.failureLogsCount}, After=${afterSnapshot.failureLogsCount} -> Δ = ${afterSnapshot.failureLogsCount - beforeSnapshot.failureLogsCount}`);
  console.log(`Stages breakdown before:`, JSON.stringify(beforeSnapshot.stagesCount));
  console.log(`Stages breakdown after: `, JSON.stringify(afterSnapshot.stagesCount));

  if (
    beforeSnapshot.realLeadsCount !== afterSnapshot.realLeadsCount ||
    beforeSnapshot.failureLogsCount !== afterSnapshot.failureLogsCount ||
    JSON.stringify(beforeSnapshot.stagesCount) !== JSON.stringify(afterSnapshot.stagesCount)
  ) {
    throw new Error('CRITICAL IMMUTABILITY VIOLATION: Production data was modified during test run!');
  }

  console.log('✅ IMMUTABILITY CONFIRMED: 0 production rows modified, 0 production stages changed.');
  console.log('========================================================================\n');
}

runReaperBugAndStagesTest()
  .then(() => {
    console.log('🎉 REAPER BUG & TEST ISOLATION VERIFICATION COMPLETED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Reaper Bug Test Failed:', err);
    process.exit(1);
  });

