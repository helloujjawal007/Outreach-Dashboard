import path from 'path';
import fs from 'fs';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';
import { isWithinRecipientWindow } from '../utils/timezoneHelper';

async function main() {
  console.log('========================================================================');
  console.log('🛡️ ITEMS 2, 4, 5, 6: GUARDS ON (WINDOW, WEEKEND, MIN GAP, CAP, RECIPIENT TZ)');
  console.log('========================================================================\n');

  await assertNotProduction('testGuardsAndWindow');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `guards_${Date.now()}`;
  emailAdapter.setMockMode(true);

  // Ensure test audit PDF exists on disk with valid magic bytes
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });
  const testPdfPath = path.join(auditsDir, `${testTag}_valid_audit.pdf`);
  fs.writeFileSync(
    testPdfPath,
    '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n' + '0'.repeat(2000)
  );

  // -------------------------------------------------------------------------
  // TEST A: Outside Window Block (Market Fallback UTC)
  // -------------------------------------------------------------------------
  console.log('[Test A] Testing Send Window Guard (Outside 08:00 - 19:00 UTC)...');
  await fiveSlotSenderService.updateSettings({
    send_window_start_hour: 8,
    send_window_end_hour: 19,
    send_window_timezone: 'UTC',
    weekdays_only: false,
    is_active: true,
  });

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
  // TEST C: Global Minimum-Gap Guard (Enforcing minimum spacing across slots)
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

  // Queue a verified ready lead in Slot A with real PDF on disk
  const leadA = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_status, audit_findings, audit_pdf_path, audit_pdf_name)
     VALUES ($1, $2, $3, 'initial', 'active', 'A', $4, 'ready', '["Mobile LCP 3.5s"]', $5, $6)
     RETURNING id`,
    [
      `${testTag}_A`,
      `a_${testTag}@example.test`,
      'https://a.test',
      testTag,
      testPdfPath,
      path.basename(testPdfPath),
    ]
  );

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
  // TEST D: Daily Send Limit Cap (Accounted exactly, excluding mock sends)
  // -------------------------------------------------------------------------
  console.log('[Test D] Testing Daily Send Cap Guard & Mock Exemption...');
  (fiveSlotSenderService as any).lastGlobalSentEpochMs = 0;

  // Count existing non-mock sent messages for today
  const existingSentRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM messages 
     WHERE direction = 'outbound' AND status IN ('sent', 'delivered')
       AND (metadata->>'is_mock' IS NULL OR metadata->>'is_mock' != 'true')
       AND sent_at >= CURRENT_DATE`
  );
  const existingSent = parseInt(existingSentRes.rows[0]?.count || '0', 10);
  const targetCap = existingSent + 3;

  await fiveSlotSenderService.updateSettings({
    daily_send_limit: targetCap,
    send_window_timezone: 'UTC',
    global_min_gap_sec: 0,
    is_active: true,
  });

  const dummyLead = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, outreach_stage, status, notes)
     VALUES ('Cap Dummy', 'dummy@cap.test', 'initial', 'active', $1) RETURNING id`,
    [testTag]
  );
  const conv = await query<{ id: string }>(
    `INSERT INTO conversations (entity_type, lead_id, channel, status) VALUES ('lead', $1, 'email', 'open') RETURNING id`,
    [dummyLead.rows[0].id]
  );
  const convId = conv.rows[0].id;

  // Insert exactly 3 outbound non-mock messages to hit the cap
  await query(
    `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, metadata)
     VALUES 
       ($1, 'email', 'outbound', 'msg 1', 'sent', NOW(), '{"is_mock": "false"}'),
       ($1, 'email', 'outbound', 'msg 2', 'sent', NOW(), '{"is_mock": "false"}'),
       ($1, 'email', 'outbound', 'msg 3', 'sent', NOW(), '{"is_mock": "false"}')`,
    [convId]
  );

  const tickCap = await fiveSlotSenderService.processGlobalTick(now, testTag);
  console.log(`   - Existing: ${existingSent}, Injected: 3, Total: ${targetCap}, Limit: ${targetCap}`);
  console.log(`   - Tick when sent today == daily_send_limit: dispatched=${tickCap.dispatched}`);
  console.log(`   - Block Reason: "${tickCap.reason}"`);

  if (tickCap.dispatched || !tickCap.reason?.includes('Daily send limit reached')) {
    throw new Error('Test D FAILED: Daily send limit guard did not block tick!');
  }
  console.log('✅ PASS: Daily send cap reached and blocked with exact count accounting.\n');

  // -------------------------------------------------------------------------
  // TEST E: Explicit Per-Test Config Bypass (MUST ACTUALLY DISPATCH)
  // -------------------------------------------------------------------------
  console.log('[Test E] Testing Explicit Per-Test Config Bypass (MUST ACTUALLY DISPATCH)...');
  // Reset last sent guard to allow clean dispatch of Slot A
  fiveSlotSenderService.resetLastSlotSent();

  const tickBypass = await fiveSlotSenderService.processGlobalTick(
    now,
    testTag,
    { bypassWindow: true, bypassMinGap: true, bypassDailyCap: true }
  );

  console.log(`   - Tick Result: dispatched=${tickBypass.dispatched}, slot=${tickBypass.activeSlot}, leadId=${tickBypass.leadId}`);

  if (!tickBypass.dispatched || tickBypass.activeSlot !== 'A') {
    throw new Error(`Test E FAILED: Explicit bypass did not dispatch lead! reason: ${tickBypass.reason}`);
  }
  console.log('✅ PASS: Gate Bug Resolved: Ready lead with valid PDF dispatched successfully in Test E.\n');

  // -------------------------------------------------------------------------
  // TEST F: Recipient Timezone-Aware Send Window (Item 6)
  // -------------------------------------------------------------------------
  console.log('[Test F] Testing Recipient-Timezone-Aware Send Windows (NY, Denver, Kolkata)...');
  // At 2026-11-09 10:00:00 UTC (Monday):
  // - New York (America/New_York, UTC-5): 05:00 AM (Early morning, OUTSIDE 09:00-17:00 window)
  // - Denver (America/Denver, UTC-7):     03:00 AM (Night time, OUTSIDE 09:00-17:00 window)
  // - Kolkata (Asia/Kolkata, UTC+5:30):   15:30 PM (Mid-afternoon, INSIDE 09:00-17:00 window)
  const testDateUtc = new Date('2026-11-09T10:00:00.000Z');

  const nyCheck = isWithinRecipientWindow(testDateUtc, 'America/New_York', 9, 17, true);
  console.log(`   - New York: localTime="${nyCheck.localTimeStr}", inWindow=${nyCheck.inWindow} (MUST be false)`);
  if (nyCheck.inWindow) {
    throw new Error('Test F FAILED: New York at 05:00 AM was wrongly allowed in window!');
  }

  const denverCheck = isWithinRecipientWindow(testDateUtc, 'America/Denver', 9, 17, true);
  console.log(`   - Denver:   localTime="${denverCheck.localTimeStr}", inWindow=${denverCheck.inWindow} (MUST be false)`);
  if (denverCheck.inWindow) {
    throw new Error('Test F FAILED: Denver at 03:00 AM was wrongly allowed in window!');
  }

  const kolkataCheck = isWithinRecipientWindow(testDateUtc, 'Asia/Kolkata', 9, 17, true);
  console.log(`   - Kolkata:  localTime="${kolkataCheck.localTimeStr}", inWindow=${kolkataCheck.inWindow} (MUST be true)`);
  if (!kolkataCheck.inWindow) {
    throw new Error('Test F FAILED: Kolkata at 15:30 PM was wrongly blocked!');
  }
  console.log('✅ PASS: Recipient-specific timezone evaluation verified across all timezones.\n');

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
