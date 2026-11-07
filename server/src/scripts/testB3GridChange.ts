import fs from 'fs';
import path from 'path';
import { query } from '../config/db';
import { fiveSlotSenderService, SLOTS, type SlotId } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

async function runB3GridChangeTest() {
  console.log('========================================================================');
  console.log('🔄 B3: DYNAMIC GRID CHANGE (10m/2m -> 15m/3m) & PER-SLOT LAST-SENT GUARD');
  console.log('========================================================================\n');

  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();
  process.env.MOCK_SMTP = 'true';

  const testTag = `B3_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  const dummyPdf = path.resolve(auditsDir, `${testTag}_Audit.pdf`);
  fs.writeFileSync(dummyPdf, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 'b')]));

  const createdLeadIds: string[] = [];

  try {
    // 1. Pause other leads
    await query(`UPDATE leads SET status = 'paused' WHERE status = 'active'`);

    // 2. Queue test leads for Slot A and Slot B
    console.log('[Step 1] Queuing ready leads for Slot A and Slot B...');
    for (const slot of ['A', 'B'] as SlotId[]) {
      for (let i = 1; i <= 3; i++) {
        const ins = await query<{ id: string }>(
          `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, audit_findings, audit_pdf_path, audit_pdf_name, audit_score, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', 'none', 'initial', 'ready', $5, $6, $7, 88, $8, NOW() - INTERVAL '1 hour', NOW())
           RETURNING id`,
          [
            `${testTag}_Lead_${slot}_${i}`,
            `b3_${slot.toLowerCase()}_${i}_${testTag}@testlead.org`,
            `https://${slot.toLowerCase()}${i}-${testTag}.org`,
            slot,
            JSON.stringify(['Finding 1', 'Finding 2']),
            dummyPdf,
            path.basename(dummyPdf),
            testTag,
          ]
        );
        createdLeadIds.push(ins.rows[0].id);
      }
    }

    // 3. Configure initial settings: 10m cycle, 2m offset
    const simAnchorSec = 1772359200; // 2026-03-01 10:00:00 UTC
    await fiveSlotSenderService.updateSettings({
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
    fiveSlotSenderService.resetLastSlotSent();

    // 4. Dispatch Slot A at Minute :00 (T=0)
    console.log('\n[Step 2] Phase 1 (10m cycle): Dispatching Slot A at T=0m (10:00:00 UTC)...');
    const tickT0 = await fiveSlotSenderService.processGlobalTick(new Date(simAnchorSec * 1000));
    console.log(`✓ Slot A dispatch at T=0m: Dispatched=${tickT0.dispatched}, Lead=${tickT0.leadId?.slice(0, 8)}...`);

    if (!tickT0.dispatched || tickT0.activeSlot !== 'A') {
      throw new Error(`Failed to dispatch Slot A at T=0m: ${tickT0.reason}`);
    }

    const lastSentSlotA = fiveSlotSenderService.getLastSlotSent('A');
    console.log(`✓ Slot A last-sent timestamp recorded: ${new Date(lastSentSlotA!).toISOString()}`);

    // 5. MID-RUN SETTINGS SWITCH: Admin changes settings to 15m cycle, 3m offset at Minute :04
    console.log('\n[Step 3] Mid-run settings change at T=4m: cycle 10m->15m, offset 2m->3m...');
    await fiveSlotSenderService.updateSettings({
      slot_cycle_min: 15,
      slot_offset_min: 3,
    });
    const newSettings = await fiveSlotSenderService.getSettings();
    console.log(`✓ Active Settings: cycle=${newSettings.slot_cycle_min}m, offset=${newSettings.slot_offset_min}m`);

    // 6. Test Per-Slot Last-Sent Guard:
    // With 15m cycle, Slot A is barred from sending anywhere between T=0 and T=15m (900 seconds)
    // Let's test at T=5m, T=10m, and T=14m:
    console.log('\n[Step 4] Verifying Slot A is blocked from sending inside the new 15-minute cycle window:');
    for (const testMin of [5, 10, 14]) {
      const testDate = new Date((simAnchorSec + testMin * 60) * 1000);
      const testRes = await fiveSlotSenderService.processGlobalTick(testDate);
      console.log(`   At T+${testMin}m: Slot=${testRes.activeSlot || 'None'}, Dispatched=${testRes.dispatched}, Reason: "${testRes.reason}"`);
      if (testRes.dispatched && testRes.activeSlot === 'A') {
        throw new Error(`B3 Violation: Slot A dispatched at T+${testMin}m inside the 15m cycle!`);
      }
    }
    console.log('✅ PASS: Slot A was strictly blocked from double-sending within the 15m window.');

    // 7. Verify Slot A CAN dispatch after the full 15m cycle has elapsed (T=15m or at its next scheduled slot)
    console.log('\n[Step 5] Checking behavior after full 15m window has elapsed (T=15m):');
    const dateAt15 = new Date((simAnchorSec + 15 * 60) * 1000);
    const gridAt15 = fiveSlotSenderService.computeGridState(dateAt15, newSettings);
    console.log(`✓ At T=15m: Cycle Index=${gridAt15.cycleIndex}, Active Slot=${gridAt15.currentActiveSlot}`);

    // Slot A at T=15m is due in Cycle 1 of the 15m grid
    const tick15 = await fiveSlotSenderService.processGlobalTick(dateAt15);
    console.log(`✓ Dispatch at T=15m: Slot=${tick15.activeSlot}, Dispatched=${tick15.dispatched}, Lead=${tick15.leadId?.slice(0, 8)}...`);

    if (!tick15.dispatched || tick15.activeSlot !== 'A') {
      throw new Error(`Failed to dispatch Slot A after 15m cycle: ${tick15.reason}`);
    }

    const gapBetweenSlotASends = (fiveSlotSenderService.getLastSlotSent('A')! - lastSentSlotA!) / 1000;
    console.log(`✓ Gap between Slot A Send 1 and Send 2: ${gapBetweenSlotASends}s (${gapBetweenSlotASends / 60}m)`);

    if (gapBetweenSlotASends < 15 * 60) {
      throw new Error(`B3 Failed: Gap between sends was ${gapBetweenSlotASends}s (< 900s)!`);
    }

    console.log('\n========================================================================');
    console.log('✅ B3 PASSED: PER-SLOT LAST-SENT GUARD PREVENTS DOUBLE-SENDS ACROSS GRID CHANGES');
    console.log('========================================================================\n');
  } finally {
    // Restore default settings
    await fiveSlotSenderService.updateSettings({ slot_cycle_min: 10, slot_offset_min: 2 });
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ANY($1::uuid[]))`, [createdLeadIds]);
      await query(`DELETE FROM conversations WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
    if (fs.existsSync(dummyPdf)) {
      fs.unlinkSync(dummyPdf);
    }
    await query("UPDATE leads SET status = 'active' WHERE status = 'paused'");
    console.log('B3 Cleanup complete.');
  }
}

runB3GridChangeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B3 Test Error:', err);
    process.exit(1);
  });

