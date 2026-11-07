import { query } from '../config/db';

async function runB8ParallelClaimsTest() {
  console.log('========================================================================');
  console.log('⚡ B8: TRUE PARALLEL ATOMIC CLAIMS FOR INITIAL, FOLLOWUP_1, & FOLLOWUP_2');
  console.log('========================================================================\n');

  const testId = `b8_${Date.now()}`;
  const createdLeadIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Parallel Claim for 'initial'
    // -------------------------------------------------------------------------
    console.log('[Test 1] Concurrency on outreach_stage = "initial":');
    const leadInitRes = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'initial', NOW(), NOW())
       RETURNING id`,
      [`${testId}_Parallel_Init`, `init_${testId}@testlead.org`, `https://init-${testId}.org`]
    );
    const initLeadId = leadInitRes.rows[0].id;
    createdLeadIds.push(initLeadId);

    // Launch 2 parallel atomic claim queries simultaneously
    const [initWorker1, initWorker2] = await Promise.all([
      query<{ id: string }>(
        `UPDATE leads SET outreach_stage = 'sending', updated_at = NOW()
         WHERE id = $1 AND (outreach_stage = 'initial' OR outreach_stage IS NULL)
         RETURNING id`,
        [initLeadId]
      ),
      query<{ id: string }>(
        `UPDATE leads SET outreach_stage = 'sending', updated_at = NOW()
         WHERE id = $1 AND (outreach_stage = 'initial' OR outreach_stage IS NULL)
         RETURNING id`,
        [initLeadId]
      ),
    ]);

    const initWinners = (initWorker1.rows.length === 1 ? 1 : 0) + (initWorker2.rows.length === 1 ? 1 : 0);
    console.log(`✓ Worker 1 claimed: ${initWorker1.rows.length} row(s) | Worker 2 claimed: ${initWorker2.rows.length} row(s)`);
    console.log(`✓ Total successful claimants: ${initWinners}`);

    if (initWinners !== 1) {
      throw new Error(`Test 1 Failed: Expected exactly 1 winner for 'initial', got ${initWinners}`);
    }
    console.log('✅ Test 1 Passed: Exactly 1 concurrent worker claimed the "initial" lead.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Parallel Claim for 'followup_1'
    // -------------------------------------------------------------------------
    console.log('[Test 2] Concurrency on outreach_stage = "followup_1":');
    const leadFu1Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, created_at, updated_at)
       VALUES ($1, $2, $3, 'B', 'active', 'none', 'followup_1', NOW(), NOW())
       RETURNING id`,
      [`${testId}_Parallel_FU1`, `fu1_${testId}@testlead.org`, `https://fu1-${testId}.org`]
    );
    const fu1LeadId = leadFu1Res.rows[0].id;
    createdLeadIds.push(fu1LeadId);

    const [fu1Worker1, fu1Worker2] = await Promise.all([
      query<{ id: string }>(
        `UPDATE leads SET outreach_stage = 'sending', updated_at = NOW()
         WHERE id = $1 AND outreach_stage = 'followup_1'
         RETURNING id`,
        [fu1LeadId]
      ),
      query<{ id: string }>(
        `UPDATE leads SET outreach_stage = 'sending', updated_at = NOW()
         WHERE id = $1 AND outreach_stage = 'followup_1'
         RETURNING id`,
        [fu1LeadId]
      ),
    ]);

    const fu1Winners = (fu1Worker1.rows.length === 1 ? 1 : 0) + (fu1Worker2.rows.length === 1 ? 1 : 0);
    console.log(`✓ Worker 1 claimed: ${fu1Worker1.rows.length} row(s) | Worker 2 claimed: ${fu1Worker2.rows.length} row(s)`);
    console.log(`✓ Total successful claimants: ${fu1Winners}`);

    if (fu1Winners !== 1) {
      throw new Error(`Test 2 Failed: Expected exactly 1 winner for 'followup_1', got ${fu1Winners}`);
    }
    console.log('✅ Test 2 Passed: Exactly 1 concurrent worker claimed the "followup_1" lead.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Parallel Claim for 'followup_2'
    // -------------------------------------------------------------------------
    console.log('[Test 3] Concurrency on outreach_stage = "followup_2":');
    const leadFu2Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, created_at, updated_at)
       VALUES ($1, $2, $3, 'C', 'active', 'none', 'followup_2', NOW(), NOW())
       RETURNING id`,
      [`${testId}_Parallel_FU2`, `fu2_${testId}@testlead.org`, `https://fu2-${testId}.org`]
    );
    const fu2LeadId = leadFu2Res.rows[0].id;
    createdLeadIds.push(fu2LeadId);

    const [fu2Worker1, fu2Worker2] = await Promise.all([
      query<{ id: string }>(
        `UPDATE leads SET outreach_stage = 'sending', updated_at = NOW()
         WHERE id = $1 AND outreach_stage = 'followup_2'
         RETURNING id`,
        [fu2LeadId]
      ),
      query<{ id: string }>(
        `UPDATE leads SET outreach_stage = 'sending', updated_at = NOW()
         WHERE id = $1 AND outreach_stage = 'followup_2'
         RETURNING id`,
        [fu2LeadId]
      ),
    ]);

    const fu2Winners = (fu2Worker1.rows.length === 1 ? 1 : 0) + (fu2Worker2.rows.length === 1 ? 1 : 0);
    console.log(`✓ Worker 1 claimed: ${fu2Worker1.rows.length} row(s) | Worker 2 claimed: ${fu2Worker2.rows.length} row(s)`);
    console.log(`✓ Total successful claimants: ${fu2Winners}`);

    if (fu2Winners !== 1) {
      throw new Error(`Test 3 Failed: Expected exactly 1 winner for 'followup_2', got ${fu2Winners}`);
    }
    console.log('✅ Test 3 Passed: Exactly 1 concurrent worker claimed the "followup_2" lead.\n');

    console.log('========================================================================');
    console.log('🎉 ALL B8 PARALLEL CLAIM ASSERTIONS (INITIAL, FU1, FU2) PASSED!');
    console.log('========================================================================\n');
  } finally {
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
  }
}

runB8ParallelClaimsTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B8 Test Error:', err);
    process.exit(1);
  });

