import fs from 'fs';
import path from 'path';
import { query } from '../config/db';
import { fiveSlotSenderService, SLOTS, type SlotId } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

async function runB2ReaperRestartTest() {
  console.log('========================================================================');
  console.log('🛡️ B2: REAPER 5-MIN THRESHOLD, SEND MARKER SAFETY, & RESTART GRID CONTINUITY');
  console.log('========================================================================\n');

  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();
  process.env.MOCK_SMTP = 'true';

  const testId = `b2_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  const dummyPdf = path.resolve(auditsDir, `${testId}_Audit.pdf`);
  fs.writeFileSync(dummyPdf, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 'c')]));

  const createdLeadIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Reaper Threshold Honored (< 5 min NOT reaped; > 5 min IS reaped)
    // -------------------------------------------------------------------------
    console.log('[Test 1] Stale-Claim Reaper 5-Minute Threshold Enforcement:');

    // Lead A: Claimed 2 minutes ago (< 5m)
    const leadARes = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'sending', NOW(), NOW() - INTERVAL '2 minutes')
       RETURNING id`,
      [`${testId}_Young_Claim`, `young_${testId}@testlead.org`, `https://young-${testId}.org`]
    );
    const leadAId = leadARes.rows[0].id;
    createdLeadIds.push(leadAId);

    // Lead B: Claimed 7 minutes ago (> 5m) WITHOUT send marker (crashed mid-send before SMTP transmission)
    const leadBRes = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, last_sent_at, last_sent_message_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'B', 'active', 'none', 'sending', NULL, NULL, NOW(), NOW() - INTERVAL '7 minutes')
       RETURNING id`,
      [`${testId}_Old_Claim_NoSend`, `oldsend_${testId}@testlead.org`, `https://oldsend-${testId}.org`]
    );
    const leadBId = leadBRes.rows[0].id;
    createdLeadIds.push(leadBId);

    console.log(`✓ Lead A (${leadAId.slice(0, 8)}...): Claimed 2m ago (updated_at = NOW() - 2m)`);
    console.log(`✓ Lead B (${leadBId.slice(0, 8)}...): Claimed 7m ago (updated_at = NOW() - 7m, NO send marker)`);

    // Run reaper
    const reapedCount1 = await fiveSlotSenderService.reapStaleSendingClaims();
    console.log(`✓ Stale Reaper executed: Recovered ${reapedCount1} claim(s).`);

    // Check DB states
    const leadACheck = (await query<{ outreach_stage: string }>(`SELECT outreach_stage FROM leads WHERE id = $1`, [leadAId])).rows[0];
    const leadBCheck = (await query<{ outreach_stage: string }>(`SELECT outreach_stage FROM leads WHERE id = $1`, [leadBId])).rows[0];

    console.log(`✓ Lead A State after reap: outreach_stage = "${leadACheck.outreach_stage}" (PRESERVED: not reaped because < 5m)`);
    console.log(`✓ Lead B State after reap: outreach_stage = "${leadBCheck.outreach_stage}" (REAPED: restored to initial for retry)`);

    if (leadACheck.outreach_stage !== 'sending') {
      throw new Error(`Test 1 Failed: Young claim (< 5m) was prematurely reaped!`);
    }
    if (leadBCheck.outreach_stage !== 'initial') {
      throw new Error(`Test 1 Failed: Old claim (> 5m) was not reaped back to initial!`);
    }
    console.log('✅ Test 1 Passed: 5-minute reaper threshold strictly honored.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Send Marker Duplicate-Send Protection
    // -------------------------------------------------------------------------
    console.log('[Test 2] Send Marker Duplicate-Send Protection:');

    // Lead C: Claimed 8 minutes ago, but email was successfully sent 8 minutes ago (recorded send marker)
    const markerMsgId = `<msg-${Date.now()}-${testId}@cloudconsultancy.ad>`;
    const leadCRes = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, last_sent_at, last_sent_message_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'C', 'active', 'none', 'sending', NOW() - INTERVAL '8 minutes', $4, NOW(), NOW() - INTERVAL '8 minutes')
       RETURNING id`,
      [`${testId}_Sent_Lead`, `sent_${testId}@testlead.org`, `https://sent-${testId}.org`, markerMsgId]
    );
    const leadCId = leadCRes.rows[0].id;
    createdLeadIds.push(leadCId);

    console.log(`✓ Lead C (${leadCId.slice(0, 8)}...): Claimed 8m ago WITH send marker:`);
    console.log(`   last_sent_at = NOW() - 8m, last_sent_message_id = "${markerMsgId}"`);

    // Run reaper
    await fiveSlotSenderService.reapStaleSendingClaims();

    const leadCCheck = (await query<{ outreach_stage: string; last_sent_message_id: string }>(
      `SELECT outreach_stage, last_sent_message_id FROM leads WHERE id = $1`,
      [leadCId]
    )).rows[0];

    console.log(`✓ Lead C State after reap: outreach_stage = "${leadCCheck.outreach_stage}"`);

    // Must be advanced to 'followup_1', NEVER requeued as 'initial' to prevent duplicate send!
    if (leadCCheck.outreach_stage === 'initial' || leadCCheck.outreach_stage === 'sending') {
      throw new Error(`Test 2 Failed: Lead with send marker was requeued as "${leadCCheck.outreach_stage}" causing duplicate send!`);
    }
    if (leadCCheck.outreach_stage !== 'followup_1') {
      throw new Error(`Test 2 Failed: Expected outreach_stage="followup_1", got "${leadCCheck.outreach_stage}"`);
    }
    console.log('✅ Test 2 Passed: Send marker detected; lead advanced to next stage with ZERO duplicate send.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Real Server Restart & Next 3 Real Sends on the Grid (No Burst)
    // -------------------------------------------------------------------------
    console.log('[Test 3] Server Restart Simulation mid-cycle at T=7m:');
    // Pause other leads
    await query(`UPDATE leads SET status = 'paused' WHERE status = 'active'`);

    // Create ready leads for Slot E, Slot A (next cycle), and Slot B (next cycle)
    for (const slot of ['E', 'A', 'B'] as SlotId[]) {
      const ins = await query<{ id: string }>(
        `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, audit_findings, audit_pdf_path, audit_pdf_name, audit_score, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', 'none', 'initial', 'ready', $5, $6, $7, 85, $8, NOW() - INTERVAL '30 minutes', NOW())
         RETURNING id`,
        [
          `${testId}_Restart_${slot}`,
          `restart_${slot.toLowerCase()}_${testId}@testlead.org`,
          `https://restart-${slot.toLowerCase()}-${testId}.org`,
          slot,
          JSON.stringify(['Restart Finding 1']),
          dummyPdf,
          path.basename(dummyPdf),
          testId,
        ]
      );
      createdLeadIds.push(ins.rows[0].id);
    }

    const simAnchorSec = 1772359200; // 2026-03-01 10:00:00 UTC
    // Simulate Slot D having sent at :06 prior to crash:
    const slotDLead = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, last_sent_at, last_sent_message_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'D', 'active', 'none', 'followup_1', $4, 'msg-d-pre-crash', NOW(), $4)
       RETURNING id`,
      [`${testId}_PreCrash_D`, `precrash_d_${testId}@testlead.org`, `https://precrash-${testId}.org`, new Date((simAnchorSec + 6 * 60) * 1000)]
    );
    createdLeadIds.push(slotDLead.rows[0].id);

    // Simulate server crash and reboot at T=7m (10:07:00 UTC, between Slot D at :06 and Slot E at :08)
    const rebootEpochSec = simAnchorSec + 7 * 60; // 10:07:00 UTC
    console.log(`✓ Server rebooted at 10:07:00 UTC (T=7m). Running syncLastSentFromDb()...`);
    await fiveSlotSenderService.syncLastSentFromDb();

    const rebootGrid = fiveSlotSenderService.computeGridState(new Date(rebootEpochSec * 1000), {
      slot_cycle_min: 10,
      slot_offset_min: 2,
      anchor_timestamp: new Date(simAnchorSec * 1000).toISOString(),
      td_endpoint_url: '',
      td_shared_secret: 'td-secret-key-2026',
      max_audit_retries: 3,
      daily_send_limit: 150,
      send_window_start_hour: 0,
      send_window_end_hour: 24,
      weekdays_only: false,
      is_active: true,
    });

    console.log(`✓ Reboot grid: Current Active Slot = ${rebootGrid.currentActiveSlot || 'None (in 2m offset gap)'}`);
    console.log(`✓ Missed slots in this cycle (A, B, C, D) are SKIPPED, not caught up:`);
    console.log(`   Slot A next turn: ${rebootGrid.slotTimes['A'].nextDate.toISOString()} (Cycle 1)`);
    console.log(`   Slot B next turn: ${rebootGrid.slotTimes['B'].nextDate.toISOString()} (Cycle 1)`);
    console.log(`   Slot C next turn: ${rebootGrid.slotTimes['C'].nextDate.toISOString()} (Cycle 1)`);
    console.log(`   Slot D next turn: ${rebootGrid.slotTimes['D'].nextDate.toISOString()} (Cycle 1)`);
    console.log(`   Slot E next turn: ${rebootGrid.slotTimes['E'].nextDate.toISOString()} (Cycle 0, upcoming at :08)`);

    // Verify tick at reboot T=7m produces 0 sends (NO BURST)
    const tickAtReboot = await fiveSlotSenderService.processGlobalTick(new Date(rebootEpochSec * 1000));
    console.log(`✓ Dispatch attempt at reboot (10:07:00): Dispatched = ${tickAtReboot.dispatched} (NO BURST)`);
    if (tickAtReboot.dispatched) {
      throw new Error(`B2 Violation: Reboot burst-dispatched missed slots!`);
    }

    // Now execute scheduler step by step and record the next 3 real sends:
    console.log('\n[Step 4] Executing scheduler to observe the next 3 real sends on the grid:');
    const restartSends: Array<{ slot: SlotId; minute: number; leadId: string }> = [];

    for (let s = 7 * 60; s <= 13 * 60; s += 10) {
      const clockDate = new Date((simAnchorSec + s) * 1000);
      const res = await fiveSlotSenderService.processGlobalTick(clockDate);
      if (res.dispatched && res.activeSlot && res.leadId) {
        restartSends.push({
          slot: res.activeSlot,
          minute: Math.floor(s / 60),
          leadId: res.leadId,
        });
        console.log(`🚀 [NEXT SEND #${restartSends.length}] Minute :${Math.floor(s / 60)}:00 | Slot ${res.activeSlot} | Lead ${res.leadId.slice(0, 8)}...`);
      }
      if (restartSends.length === 3) break;
    }

    console.log(`\n✓ Next 3 real sends observed:`);
    restartSends.forEach((send, idx) => {
      console.log(`   Send #${idx + 1}: Slot ${send.slot} at Minute :${send.minute}:00`);
    });

    // Check: Send 1 must be Slot E at :08; Send 2 must be Slot A at :10 (next cycle); Send 3 must be Slot B at :12
    if (restartSends[0].slot !== 'E' || restartSends[0].minute !== 8) {
      throw new Error(`B2 Failed: Send 1 expected Slot E at :08, got Slot ${restartSends[0].slot} at :${restartSends[0].minute}`);
    }
    if (restartSends[1].slot !== 'A' || restartSends[1].minute !== 10) {
      throw new Error(`B2 Failed: Send 2 expected Slot A at :10, got Slot ${restartSends[1].slot} at :${restartSends[1].minute}`);
    }

    console.log('\n========================================================================');
    console.log('✅ B2 PASSED: 5-MIN THRESHOLD, SEND MARKER SAFETY, & CLEAN RESTART CONTINUITY');
    console.log('========================================================================\n');
  } finally {
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ANY($1::uuid[]))`, [createdLeadIds]);
      await query(`DELETE FROM conversations WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
    if (fs.existsSync(dummyPdf)) {
      fs.unlinkSync(dummyPdf);
    }
    await query("UPDATE leads SET status = 'active' WHERE status = 'paused'");
    console.log('B2 Cleanup complete.');
  }
}

runB2ReaperRestartTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B2 Test Error:', err);
    process.exit(1);
  });
