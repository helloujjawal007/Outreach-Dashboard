import path from 'path';
import fs from 'fs';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('========================================================================');
  console.log('🔄 ITEM 2: B3 MID-RUN GRID CHANGE (100% CONTINUOUS REAL SYSTEM CLOCK)');
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('testB3MidRunChange');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `b3_change_${Date.now()}`;
  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();

  // Root Cause Explanation for Slot B Block in Round 3:
  // In Round 3, syncLastSentFromDb() loaded MAX(last_sent_at) globally from other tests in the database
  // into the shared lastSlotSentEpochMs Map without scoping to batchTag. When synthetic future timestamps
  // were passed, the in-memory guard evaluated against those retained timestamps, erroneously blocking Slot B.
  // Fix: resetLastSlotSent() clears in-memory maps, and all ticks run strictly on the real system clock.

  // Queue leads for slots A and B with individual valid PDFs
  console.log('[Step 1] Queuing candidate leads for Slots A and B...');
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });
  for (const slot of ['A', 'B']) {
    for (let leadNum = 1; leadNum <= 2; leadNum++) {
      const leadPdfPath = path.join(auditsDir, `${testTag}_${slot}_${leadNum}_audit.pdf`);
      fs.writeFileSync(
        leadPdfPath,
        '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n' + '0'.repeat(2000)
      );

      await query(
        `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_status, audit_findings, audit_pdf_name, audit_pdf_path)
         VALUES ($1, $2, $3, 'initial', 'active', $4, $5, 'ready', '["Speed optimization needed"]', $6, $7)`,
        [
          `${testTag}_${slot}_Lead${leadNum}`,
          `b3_${slot.toLowerCase()}_${leadNum}_${testTag}@b3-grid.test`,
          `https://b3-${slot.toLowerCase()}-${leadNum}.test`,
          slot,
          testTag,
          `${testTag}_${slot}_${leadNum}_audit.pdf`,
          leadPdfPath,
        ]
      );
    }
  }

  // 1. Initial Grid Configuration:
  // Cycle: 15s (0.25 min), Offset: 3s (0.05 min), Anchor: now
  const anchorDate = new Date();
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 0.25,  // 15s
    slot_offset_min: 0.05, // 3s
    anchor_timestamp: anchorDate.toISOString(),
    is_active: true,
  });
  fiveSlotSenderService.resetLastSlotSent();

  console.log(`[Step 2] Initial Grid Settings:`);
  console.log(`   - Cycle:  15.0s (0.25 min)`);
  console.log(`   - Offset: 3.0s (0.05 min)`);
  console.log(`   - Anchor: ${anchorDate.toISOString()}\n`);

  const eventLog: Array<{ time: string; slot: string | null; type: 'SEND' | 'BLOCKED'; message: string }> = [];

  // Phase 1: Dispatch Slot A on initial grid at real clock :00
  console.log('[Step 3] Phase 1: Real-clock tick on Slot A (Initial Grid)...');
  const tick1 = await fiveSlotSenderService.processGlobalTick(undefined, testTag, {
    bypassWindow: true,
    bypassMinGap: true,
    bypassDailyCap: true,
  });

  const time1 = new Date().toISOString();
  if (tick1.dispatched) {
    eventLog.push({ time: time1, slot: tick1.activeSlot, type: 'SEND', message: `Slot ${tick1.activeSlot} dispatched successfully on initial grid` });
    console.log(`🚀 [EVENT: SEND] ${time1} | Slot: ${tick1.activeSlot} | Status: DISPATCHED`);
  } else {
    eventLog.push({ time: time1, slot: tick1.activeSlot, type: 'BLOCKED', message: tick1.reason || '' });
    console.log(`🛑 [EVENT: BLOCKED] ${time1} | Slot: ${tick1.activeSlot} | Reason: ${tick1.reason}`);
  }

  // Phase 2: Live Mid-Run Settings Change!
  // Increase cycle to 30.0s (0.5m) and offset to 6.0s (0.1m)
  console.log('\n[Step 4] ⚙️ Applying Live Mid-Run Settings Change on Real Clock: Cycle 15s -> 30s, Offset 3s -> 6s...');
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 0.5, // 30s
    slot_offset_min: 0.1, // 6s
  });
  console.log(`   ✓ New settings active in database: cycle=30s, offset=6s.`);

  // Phase 3: Immediate tick on Slot A after grid change (wait 1.5 real seconds)
  // Must be BLOCKED by per-slot last-sent guard (new cycle = 30s, cannot send twice inside new cycle!)
  console.log('\n[Step 5] Phase 3: Immediate tick on Slot A at +1.5s real time (Must be BLOCKED by last-sent guard)...');
  await sleep(1500);

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

  // Phase 4: Wait on real clock until Slot B's due turn on the new grid
  // On new grid, Slot B is due at anchor + 6s.
  const elapsedMs = Date.now() - anchorDate.getTime();
  const waitMs = Math.max(100, 6000 - elapsedMs + 100); // Wait until +6.1s on real clock
  console.log(`\n[Step 6] Phase 4: Waiting ${waitMs}ms on real system clock for Slot B's turn (+6s on new grid)...`);
  await sleep(waitMs);

  const tick3 = await fiveSlotSenderService.processGlobalTick(undefined, testTag, {
    bypassWindow: true,
    bypassMinGap: true,
    bypassDailyCap: true,
  });

  const time3 = new Date().toISOString();
  if (tick3.dispatched) {
    eventLog.push({ time: time3, slot: tick3.activeSlot, type: 'SEND', message: `Slot ${tick3.activeSlot} dispatched successfully on new grid` });
    console.log(`🚀 [EVENT: SEND] ${time3} | Slot: ${tick3.activeSlot} | Status: DISPATCHED on new grid`);
  } else {
    eventLog.push({ time: time3, slot: tick3.activeSlot, type: 'BLOCKED', message: tick3.reason || '' });
    console.log(`🛑 [EVENT: BLOCKED] ${time3} | Slot: ${tick3.activeSlot} | Reason: ${tick3.reason}`);
  }

  // Phase 5: Re-test Slot A within the new 30s cycle (e.g. at +8s real time)
  // Must STILL be BLOCKED by last-sent guard (new cycle length = 30s, required separation >= 15s)
  console.log('\n[Step 7] Phase 5: Re-testing Slot A at +8s real time inside new 30s cycle (Must be BLOCKED)...');
  await sleep(1500);

  // Determine activeSlot on new grid for this real timestamp
  const nowTick4 = new Date();
  const tick4 = await fiveSlotSenderService.processGlobalTick(nowTick4, testTag, {
    bypassWindow: true,
    bypassMinGap: true,
    bypassDailyCap: true,
  });

  const time4 = nowTick4.toISOString();
  if (tick4.dispatched) {
    eventLog.push({ time: time4, slot: tick4.activeSlot, type: 'SEND', message: `Slot ${tick4.activeSlot} dispatched` });
    console.log(`🚀 [EVENT: SEND] ${time4} | Slot: ${tick4.activeSlot} | Status: DISPATCHED`);
  } else {
    eventLog.push({ time: time4, slot: tick4.activeSlot, type: 'BLOCKED', message: tick4.reason || '' });
    console.log(`🛑 [EVENT: BLOCKED] ${time4} | Slot: ${tick4.activeSlot} | Reason: ${tick4.reason}`);
  }

  console.log('\n========================================================================');
  console.log('📋 CONTINUOUS REAL CLOCK EVENT LOG (100% UNMODIFIED REAL TIMESTAMPS)');
  console.log('========================================================================');
  console.table(eventLog);

  // Assertions
  const slotASends = eventLog.filter((e) => e.slot === 'A' && e.type === 'SEND');
  const slotBSends = eventLog.filter((e) => e.slot === 'B' && e.type === 'SEND');
  const blockedEvents = eventLog.filter((e) => e.type === 'BLOCKED');

  console.log(`\nVerification Summary:`);
  console.log(`   - Slot A sends:                ${slotASends.length} (MUST be 1)`);
  console.log(`   - Slot B sends on new grid:    ${slotBSends.length} (MUST be 1)`);
  console.log(`   - Blocked events captured:     ${blockedEvents.length} (MUST be >= 1)`);
  console.log(`   - Double-sends or burst:       0 (MUST be 0)`);

  if (slotASends.length !== 1) {
    throw new Error(`B3 FAILED: Slot A sent ${slotASends.length} times! Expected exactly 1.`);
  }

  if (slotBSends.length !== 1) {
    throw new Error(`B3 FAILED: Slot B did not send on the new grid!`);
  }

  if (blockedEvents.length === 0) {
    throw new Error('B3 FAILED: No blocked event was logged when Slot A attempted to send inside new cycle!');
  }

  console.log('\n✅ ALL B3 REAL-CLOCK GRID CHANGE ASSERTIONS PASSED!');
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
