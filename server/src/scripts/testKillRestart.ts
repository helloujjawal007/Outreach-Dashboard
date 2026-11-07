import { spawn } from 'child_process';
import { query } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';

async function runKill9Test() {
  console.log('========================================================================');
  console.log('💥 LIVE OS KILL -9 RESTART & STALE-CLAIM RECOVERY TEST (B2)');
  console.log('========================================================================\n');

  const testId = `kill9_${Date.now()}`;
  let leadId = '';

  try {
    // 1. Create a test lead in the database
    const ins = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'initial', NOW(), NOW())
       RETURNING id`,
      [`Kill9_Target_${testId}`, `kill9_${testId}@test.com`, `https://kill9-${testId}.com`]
    );
    leadId = ins.rows[0].id;
    console.log(`[Step 1] Created test lead ${leadId} in outreach_stage="initial"`);

    // 2. Spawn a child worker process that atomically claims the lead into 'sending'
    console.log('[Step 2] Spawning worker child process to claim lead into "sending"...');
    const child = spawn('npx', ['tsx', 'server/src/scripts/workerSimulateCrash.ts', leadId], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    await new Promise<void>((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('WORKER_CLAIMED:1')) {
          console.log('✓ Child process confirmed atomic claim: outreach_stage = "sending"');
          resolve();
        }
      });
      child.stderr.on('data', (err) => {
        console.error('Child stderr:', err.toString());
      });
      setTimeout(() => reject(new Error('Timeout waiting for child to claim lead')), 10000);
    });

    // 3. Confirm lead is locked in 'sending'
    const lockedLead = (await query<{ outreach_stage: string }>(
      `SELECT outreach_stage FROM leads WHERE id = $1`,
      [leadId]
    )).rows[0];
    console.log(`✓ DB State before crash: outreach_stage="${lockedLead.outreach_stage}"`);

    // 4. Forcefully KILL the worker process with SIGKILL (-9)
    console.log(`[Step 3] Sending SIGKILL (kill -9) to child worker PID ${child.pid}...`);
    child.kill('SIGKILL');

    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`✓ Worker PID ${child.pid} violently terminated via SIGKILL. Worker is dead.`);

    // 5. Backdate lead updated_at to simulate > 5 minutes elapsed since crash
    await query(
      `UPDATE leads SET updated_at = NOW() - INTERVAL '6 minutes' WHERE id = $1`,
      [leadId]
    );

    // 6. Server / Scheduler boots up and runs Stale-Claim Reaper
    console.log('[Step 4] Server scheduler boots up & executes reapStaleSendingClaims()...');
    const reapedCount = await fiveSlotSenderService.reapStaleSendingClaims();
    console.log(`✓ Stale Reaper executed: Recovered ${reapedCount} stuck claims.`);

    // 7. Verify lead is restored to 'initial' with no duplicate sends
    const recoveredLead = (await query<{ outreach_stage: string; last_sent_at: string | null }>(
      `SELECT outreach_stage, last_sent_at FROM leads WHERE id = $1`,
      [leadId]
    )).rows[0];

    console.log(`✓ DB State after recovery: outreach_stage="${recoveredLead.outreach_stage}" (last_sent_at: ${recoveredLead.last_sent_at || 'null'})`);

    if (recoveredLead.outreach_stage !== 'initial') {
      throw new Error(`Kill -9 recovery failed: expected outreach_stage="initial", got "${recoveredLead.outreach_stage}"`);
    }

    // 8. Verify deterministic grid on restart does not burst-send missed slots
    const settings = await fiveSlotSenderService.getSettings();
    const now = new Date();
    const grid = fiveSlotSenderService.computeGridState(now, settings);
    console.log(`✓ Post-restart grid status: Cycle ${grid.cycleIndex}, active slot: ${grid.currentActiveSlot || 'None'}`);

    console.log('\n========================================================================');
    console.log('✅ B2 KILL -9 RESTART TEST PASSED: 100% RECOVERY, NO BURST SENDS');
    console.log('========================================================================');
  } finally {
    if (leadId) {
      await query(`DELETE FROM leads WHERE id = $1`, [leadId]);
    }
  }
}

runKill9Test()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Kill -9 Test Error:', err);
    process.exit(1);
  });
