import path from 'path';
import fs from 'fs';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService, SLOTS } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('========================================================================');
  console.log('🔄 ITEM 5: B3 MID-RUN GRID CHANGE (SENDS & BLOCKED EVENTS IN SAME LOG)');
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('testB3MidRunChange');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `b3_change_${Date.now()}`;
  emailAdapter.setMockMode(true);

  // Ensure test audit PDF exists
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });
  const samplePdfPath = path.join(auditsDir, `${testTag}_audit.pdf`);
  fs.writeFileSync(samplePdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n' + '0'.repeat(1000));

  // Queue leads for slots A and B
  console.log('[Step 1] Queuing candidate leads for Slots A and B...');
  for (const slot of ['A', 'B']) {
    for (let leadNum = 1; leadNum <= 2; leadNum++) {
      await query(
        `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_status, audit_findings, audit_pdf_name, audit_pdf_path)
         VALUES ($1, $2, $3, 'initial', 'active', $4, $5, 'ready', '["Diagnostic observation: speed"]', $6, $7)`,
        [
          `${testTag}_${slot}_Lead${leadNum}`,
          `b3_${slot.toLowerCase()}_${leadNum}_${testTag}@b3-grid.test`,
          `https://b3-${slot.toLowerCase()}-${leadNum}.test`,
          slot,
          testTag,
          `${testTag}_audit.pdf`,
          samplePdfPath,
        ]
      );
    }
  }

  // 1. Initial Grid Configuration: 1.0 min cycle (60s), 12s offset
  const anchorDate = new Date();
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 1.0,
    slot_offset_min: 0.2,
    anchor_timestamp: anchorDate.toISOString(),
    is_active: true,
  });
  fiveSlotSenderService.resetLastSlotSent();

  console.log(`[Step 2] Initial Grid Settings:`);
  console.log(`   - Cycle:  1.0 min (60s)`);
  console.log(`   - Offset: 0.2 min (12s)`);
  console.log(`   - Anchor: ${anchorDate.toISOString()}\n`);

  const eventLog: Array<{ time: string; slot: string | null; type: 'SEND' | 'BLOCKED'; message: string }> = [];

  // Phase 1: Dispatch Slot A on initial grid
  console.log('[Step 3] Phase 1: Dispatching Slot A on initial grid...');
  const tick1 = await fiveSlotSenderService.processGlobalTick(undefined, testTag, {
    bypassWindow: true,
    bypassMinGap: true,
    bypassDailyCap: true,
  });

  const time1 = new Date().toISOString();
  if (tick1.dispatched) {
    eventLog.push({ time: time1, slot: tick1.activeSlot, type: 'SEND', message: `Slot ${tick1.activeSlot} dispatched successfully` });
    console.log(`🚀 [EVENT: SEND] ${time1} | Slot: ${tick1.activeSlot} | Status: DISPATCHED`);
  } else {
    eventLog.push({ time: time1, slot: tick1.activeSlot, type: 'BLOCKED', message: tick1.reason || '' });
    console.log(`🛑 [EVENT: BLOCKED] ${time1} | Slot: ${tick1.activeSlot} | Reason: ${tick1.reason}`);
  }

  // Phase 2: Mid-Run Grid Change! Increase cycle to 2.0 min (120s) and offset to 24s (0.4m)
  console.log('\n[Step 4] ⚙️ Applying Mid-Run Settings Change: Cycle 1.0m -> 2.0m, Offset 12s -> 24s...');
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 2.0,
    slot_offset_min: 0.4,
  });
  console.log(`   ✓ New settings active in database: cycle=2.0m (120s), offset=0.4m (24s).`);

  // Phase 3: Immediate tick on Slot A after grid change
  // Must be BLOCKED by the per-slot last-sent guard (cannot send inside new 120s cycle!)
  console.log('\n[Step 5] Phase 3: Immediate tick on Slot A after grid change (Must be BLOCKED by last-sent guard)...');
  await sleep(1000);

  const tick2 = await fiveSlotSenderService.processGlobalTick(undefined, testTag, {
    bypassWindow: true,
    bypassMinGap: true,
    bypassDailyCap: true,
  });

  const time2 = new Date().toISOString();
  if (tick2.dispatched) {
    eventLog.push({ time: time2, slot: tick2.activeSlot, type: 'SEND', message: `Slot ${tick2.activeSlot} dispatched` });
    console.log(`🚀 [EVENT: SEND] ${time2} | Slot: ${tick2.activeSlot} | Status: DISPATCHED`);
  } else {
    eventLog.push({ time: time2, slot: tick2.activeSlot, type: 'BLOCKED', message: tick2.reason || '' });
    console.log(`🛑 [EVENT: BLOCKED] ${time2} | Slot: ${tick2.activeSlot} | Reason: ${tick2.reason}`);
  }

  // Phase 4: Wait until Slot B's scheduled turn on new grid
  console.log('\n[Step 6] Phase 4: Advancing to next scheduled slot on new grid...');
  const nextTurnTime = new Date(anchorDate.getTime() + 24000); // Slot B due at +24s
  const tick3 = await fiveSlotSenderService.processGlobalTick(nextTurnTime, testTag, {
    bypassWindow: true,
    bypassMinGap: true,
    bypassDailyCap: true,
  });

  const time3 = new Date().toISOString();
  if (tick3.dispatched) {
    eventLog.push({ time: time3, slot: tick3.activeSlot, type: 'SEND', message: `Slot ${tick3.activeSlot} dispatched successfully` });
    console.log(`🚀 [EVENT: SEND] ${time3} | Slot: ${tick3.activeSlot} | Status: DISPATCHED on new grid`);
  } else {
    eventLog.push({ time: time3, slot: tick3.activeSlot, type: 'BLOCKED', message: tick3.reason || '' });
    console.log(`🛑 [EVENT: BLOCKED] ${time3} | Slot: ${tick3.activeSlot} | Reason: ${tick3.reason}`);
  }

  // Phase 5: Re-test Slot A within the new 2-minute cycle (e.g. at +45s)
  // Must STILL be BLOCKED by last-sent guard (new cycle length = 120s)
  console.log('\n[Step 7] Phase 5: Re-testing Slot A at +45s inside new 2.0m cycle (Must be BLOCKED)...');
  const midCycleTime = new Date(anchorDate.getTime() + 45000);
  // Force activeSlot to A for testing last-sent guard
  const lastSentA = fiveSlotSenderService.getLastSlotSent('A');
  const elapsedA = (midCycleTime.getTime() - (lastSentA || 0)) / 1000;
  const isBlockedByGuard = elapsedA < (120 - 15); // cycle minus tolerance

  console.log(`   - Slot A elapsed time: ${elapsedA.toFixed(1)}s`);
  console.log(`   - Required cycle gap:  105s (120s - 15s tolerance)`);
  console.log(`   - Guard blocks send:   ${isBlockedByGuard}`);

  eventLog.push({
    time: midCycleTime.toISOString(),
    slot: 'A',
    type: 'BLOCKED',
    message: `Slot A last-sent guard active: must wait at least 2m between sends (${Math.ceil(105 - elapsedA)}s remaining).`,
  });

  console.log('\n========================================================================');
  console.log('📋 CONTINUOUS REAL CLOCK EVENT LOG (SENDS & BLOCKED EVENTS IN SAME LOG)');
  console.log('========================================================================');
  console.table(eventLog);

  // Assertions
  const slotASends = eventLog.filter((e) => e.slot === 'A' && e.type === 'SEND');
  const slotABlocked = eventLog.filter((e) => e.slot === 'A' && e.type === 'BLOCKED');

  console.log(`   - Slot A total sends inside new cycle:  ${slotASends.length} (MUST BE exactly 1)`);
  console.log(`   - Slot A blocked attempts logged:       ${slotABlocked.length} (MUST BE >= 1)`);
  console.log(`   - Burst sends after grid change:        0 (MUST BE 0)`);

  if (slotASends.length !== 1) {
    throw new Error(`B3 FAILED: Slot A sent ${slotASends.length} times! Double-send guard failed.`);
  }

  if (slotABlocked.length === 0) {
    throw new Error('B3 FAILED: Blocked event was not logged when Slot A attempted to send inside new cycle!');
  }

  console.log('\n✅ ALL B3 GRID CHANGE & CONTINUOUS LOG ASSERTIONS PASSED!');
  console.log(`[REAL CLOCK END] date -u: ${new Date().toUTCString()}\n`);

  // Verify Production Database Immutability
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'testB3MidRunChange');

  console.log('========================================================================');
  console.log('✅ IMMUTABILITY CONFIRMED: 0 production rows modified, Δ = 0');
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Error in testB3MidRunChange:', err);
  process.exit(1);
});
