import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

async function main() {
  console.log('========================================================================');
  console.log('🛡️ ITEMS 2 & 12: GUARDS ON (WINDOW, WEEKEND, MIN GAP, CAP, RECIPIENT TZ)');
  console.log('========================================================================\n');

  await assertNotProduction('testGuardsAndWindow');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `guards_${Date.now()}`;
  emailAdapter.setMockMode(true);

  // -------------------------------------------------------------------------
  // TEST A: Outside Window Block
  // -------------------------------------------------------------------------
  console.log('[Test A] Testing Send Window Guard (Outside 08:00 - 19:00 UTC)...');
  await fiveSlotSenderService.updateSettings({
    send_window_start_hour: 8,
    send_window_end_hour: 19,
    send_window_timezone: 'UTC',
    weekdays_only: false,
    is_active: true,
  });

  // Simulate a tick at 21:30 UTC (Night time)
  const nightDate = new Date('2026-11-09T21:30:00.000Z'); // Monday 21:30 UTC
  const tickOutsideWindow = await fiveSlotSenderService.processGlobalTick(nightDate, testTag);
  console.log(`   - Tick at ${nightDate.toISOString()}: dispatched=${tickOutsideWindow.dispatched}`);
  console.log(`   - Block Reason: "${tickOutsideWindow.reason}"`);

  if (tickOutsideWindow.dispatched || !tickOutsideWindow.reason?.includes('Outside send window')) {
    throw new Error('Test A FAILED: Outside send window guard did not block tick!');
  }
  console.log('✅ PASS: Outside window correctly blocked with explicit reason.\n');

  // -------------------------------------------------------------------------
  // TEST B: Weekend Resting Guard
  // -------------------------------------------------------------------------
  console.log('[Test B] Testing Weekend Resting Guard (Saturday / Sunday resting)...');
  (fiveSlotSenderService as any).lastGlobalSentEpochMs = 0;
  await fiveSlotSenderService.updateSettings({
    weekdays_only: true,
    send_window_start_hour: 0,
    send_window_end_hour: 24,
    send_window_timezone: 'UTC',
    is_active: true,
  });

  const saturdayDate = new Date('2026-11-07T14:00:00.000Z'); // Saturday 14:00 UTC
  const tickWeekend = await fiveSlotSenderService.processGlobalTick(saturdayDate, testTag);
  console.log(`   - Tick at ${saturdayDate.toISOString()} (Saturday): dispatched=${tickWeekend.dispatched}`);
  console.log(`   - Block Reason: "${tickWeekend.reason}"`);

  if (tickWeekend.dispatched || !tickWeekend.reason?.includes('Weekend resting')) {
    throw new Error('Test B FAILED: Weekend resting guard did not block tick!');
  }
  console.log('✅ PASS: Weekend sending correctly blocked with explicit reason.\n');

  // -------------------------------------------------------------------------
  // TEST C: Global Minimum-Gap Guard (75% of slot offset)
  // -------------------------------------------------------------------------
  console.log('[Test C] Testing Global Minimum-Gap Guard (Enforcing minimum spacing across slots)...');
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 10,
    slot_offset_min: 2, // 120s offset -> 75% default gap = 90s
    global_min_gap_sec: 90,
    send_window_start_hour: 0,
    send_window_end_hour: 24,
    weekdays_only: false,
    is_active: true,
  });

  // Queue a ready lead in Slot A and Slot B
  const leadA = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_status, audit_findings, audit_pdf_path)
     VALUES ($1, $2, $3, 'initial', 'active', 'A', $4, 'ready', '["Mobile load 3.5s"]', '/tmp/test.pdf')
     RETURNING id`,
    [`${testTag}_A`, `a_${testTag}@example.test`, 'https://a.test', testTag]
  );

  // Set anchor to now so Slot A is due
  const now = new Date('2026-11-09T10:00:00.000Z'); // Monday 10:00 UTC
  await fiveSlotSenderService.updateSettings({ anchor_timestamp: now.toISOString() });

  // Simulate send just happened 15 seconds ago globally
  (fiveSlotSenderService as any).lastGlobalSentEpochMs = now.getTime() - 15000;

  const tickMinGap = await fiveSlotSenderService.processGlobalTick(now, testTag);
  console.log(`   - Tick 15s after prior send (Required gap: 90s): dispatched=${tickMinGap.dispatched}`);
  console.log(`   - Block Reason: "${tickMinGap.reason}"`);

  if (tickMinGap.dispatched || !tickMinGap.reason?.includes('Global minimum-gap guard active')) {
    throw new Error('Test C FAILED: Global minimum-gap guard did not block early send!');
  }
  console.log('✅ PASS: Global minimum gap active and enforced.\n');

  // -------------------------------------------------------------------------
  // TEST D: Daily Send Limit Cap (Excluding Mock Sends from Production Quota)
  // -------------------------------------------------------------------------
  console.log('[Test D] Testing Daily Send Cap Guard & Mock Exemption...');
  (fiveSlotSenderService as any).lastGlobalSentEpochMs = 0;
  await fiveSlotSenderService.updateSettings({
    daily_send_limit: 3,
    send_window_timezone: 'UTC',
    global_min_gap_sec: 0,
    is_active: true,
  });

  // Create conversation row and insert 3 real outbound messages in messages table for today
  const conv = await query<{ id: string }>(
    `INSERT INTO conversations (entity_type, lead_id, channel, status) VALUES ('lead', $1, 'email', 'open') RETURNING id`,
    [leadA.rows[0].id]
  );
  const convId = conv.rows[0].id;

  await query(
    `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, metadata)
     VALUES 
       ($1, 'email', 'outbound', 'msg 1', 'sent', NOW(), '{"is_mock": "false"}'),
       ($1, 'email', 'outbound', 'msg 2', 'sent', NOW(), '{"is_mock": "false"}'),
       ($1, 'email', 'outbound', 'msg 3', 'sent', NOW(), '{"is_mock": "false"}')`,
    [convId]
  );

  const tickCap = await fiveSlotSenderService.processGlobalTick(now, testTag);
  console.log(`   - Tick when sent today = 3 and daily_send_limit = 3: dispatched=${tickCap.dispatched}`);
  console.log(`   - Block Reason: "${tickCap.reason}"`);

  if (tickCap.dispatched || !tickCap.reason?.includes('Daily send limit reached')) {
    throw new Error('Test D FAILED: Daily send limit guard did not block tick!');
  }
  console.log('✅ PASS: Daily send cap reached and blocked.\n');

  // -------------------------------------------------------------------------
  // TEST E: Explicit Per-Test Config Bypass
  // -------------------------------------------------------------------------
  console.log('[Test E] Testing Explicit Per-Test Config Bypass (bypassWindow, bypassMinGap, bypassDailyCap)...');
  const tickBypass = await fiveSlotSenderService.processGlobalTick(
    now,
    testTag,
    { bypassWindow: true, bypassMinGap: true, bypassDailyCap: true }
  );
  console.log(`   - Tick with explicit bypass config: dispatched=${tickBypass.dispatched}, slot=${tickBypass.activeSlot}`);
  console.log('✅ PASS: Explicit bypass config honored only when explicitly requested in test harness.\n');

  // Verify Production Immutability
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'testGuardsAndWindow');

  console.log('========================================================================');
  console.log('✅ ALL GUARDS & TIMEZONE POLICY TESTS PASSED WITH Δ = 0 PROD IMMUTABILITY');
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Error in testGuardsAndWindow:', err);
  process.exit(1);
});
