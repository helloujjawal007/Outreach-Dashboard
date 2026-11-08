import fs from 'fs';
import path from 'path';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService, SLOTS } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';
import { analyzeSoakLogFile } from './analyzeSoakLog';

/**
 * 3-Hour Production-Like Soak Test for 5-Slot Sender
 * - Real system clock (no fake timers or computed dates)
 * - 10-minute cycle / 2-minute offset (production timing)
 * - Writes raw JSON lines with exact ISO timestamps to soak_3hour_log.jsonl
 * - Runs for 3 hours (18 cycles * 5 slots = up to 90 turns, or configurable duration)
 */
async function main() {
  const durationHours = parseFloat(process.env.SOAK_HOURS || '3.0');
  const durationMs = durationHours * 3600 * 1000;

  console.log('========================================================================');
  console.log(`⏱️ 3-HOUR PRODUCTION SOAK TEST (REAL SYSTEM CLOCK | DURATION: ${durationHours}h)`);
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('soak3HourGridTest');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `soak3h_${Date.now()}`;
  const logDir = path.resolve(process.cwd(), 'server', 'data');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'soak_3hour_log.jsonl');
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile); // Start clean log

  const auditsDir = path.join(logDir, 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });

  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();

  // Configure production settings: 10m cycle, 2m offset, 90s global min gap
  const startAnchor = new Date().toISOString();
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 10,
    slot_offset_min: 2,
    anchor_timestamp: startAnchor,
    daily_send_limit: 500,
    send_window_start_hour: 0,
    send_window_end_hour: 24,
    weekdays_only: false,
    global_min_gap_sec: 90,
    is_active: true,
  });
  fiveSlotSenderService.resetLastSlotSent();

  // Seed ready test leads for each slot
  console.log('[Step 1] Seeding ready leads for all 5 slots...');
  for (const slot of SLOTS) {
    for (let i = 1; i <= 20; i++) {
      const pdfPath = path.join(auditsDir, `soak_${slot}_${i}.pdf`);
      const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Soak Audit) >>\nendobj\n');
      const pdfPad = Buffer.alloc(1200, 'S');
      const pdfFooter = Buffer.from('\n%%EOF\n');
      fs.writeFileSync(pdfPath, Buffer.concat([pdfHeader, pdfPad, pdfFooter]));

      await query(
        `INSERT INTO leads (
           business_name, email, website, slot_id, status, consent_status, outreach_stage,
           audit_status, audit_ready_at, audit_pdf_path, audit_findings, notes, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, 'active', 'none', 'initial',
           'ready', NOW(), $5, $6, $7, NOW() - INTERVAL '1 hour' + ($8 || ' seconds')::interval, NOW()
         )`,
        [
          `Soak Biz ${slot}-${i}`,
          `soak_${slot}_${i}_${testTag}@soak-test.com`,
          `https://soak-${slot}-${i}.test`,
          slot,
          pdfPath,
          JSON.stringify(['Finding 1: slow server response (TTFB > 1.2s)', 'Finding 2: uncompressed scripts', 'Finding 3: missing viewport tag']),
          testTag,
          i * 10,
        ]
      );
    }
  }
  console.log('   ✓ Seeded 100 ready candidate leads across Slots A-E.\n');

  console.log(`[Step 2] Commencing 10-Second Tick Grid Polling for ${durationHours} hours...`);
  console.log(`   - Log Destination: ${logFile}`);
  console.log('   - Press Ctrl+C at any time to stop early and analyze collected dispatches.\n');

  const startTime = Date.now();
  let tickCount = 0;
  let dispatches = 0;

  while (Date.now() - startTime < durationMs) {
    tickCount++;
    const now = new Date();

    try {
      const tickResult = await fiveSlotSenderService.processGlobalTick(now, testTag, {
        bypassWindow: true,
        bypassDailyCap: true,
        bypassMinGap: false, // Strict 90s min-gap enforced!
      });

      if (tickResult.dispatched && tickResult.leadId) {
        dispatches++;
        const recentMock = emailAdapter.getMockSentLog().slice(-1)[0];
        const settings = await fiveSlotSenderService.getSettings();
        const grid = fiveSlotSenderService.computeGridState(now, settings);
        const slotInfo = tickResult.activeSlot ? grid.slotTimes[tickResult.activeSlot] : undefined;
        const dueTimeIso = slotInfo ? slotInfo.nextDate.toISOString() : now.toISOString();

        const logEntry = {
          cycle: grid.cycleIndex,
          slot: tickResult.activeSlot,
          leadId: tickResult.leadId,
          recipientEmail: recentMock?.recipientEmail || '',
          mailbox: recentMock?.mailbox || '',
          dueTimeIso,
          smtpAcceptTimeIso: now.toISOString(),
          messageId: recentMock?.messageId || '',
        };

        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
        const lagSec = (now.getTime() - new Date(dueTimeIso).getTime()) / 1000;
        console.log(`[SOAK SEND #${dispatches}] Slot ${tickResult.activeSlot} (Cycle ${grid.cycleIndex}) | Lead: ${tickResult.leadId.slice(0, 8)}... | Due: ${dueTimeIso.slice(11, 23)} | Actual: ${now.toISOString().slice(11, 23)} | Lag: ${lagSec >= 0 ? '+' : ''}${lagSec.toFixed(3)}s`);
      }
    } catch (tickErr: any) {
      console.error(`[Tick #${tickCount}] Error:`, tickErr?.message);
    }

    // Production 10-second tick interval (10,000ms real sleep)
    await new Promise((r) => setTimeout(r, 10000));
  }

  console.log(`\n[REAL CLOCK END] date -u: ${new Date().toUTCString()}`);
  console.log(`[Step 3] Soak Complete: ${tickCount} ticks processed, ${dispatches} sends logged to ${logFile}.\n`);

  // Run OLS regression analysis on the resulting log
  if (dispatches >= 2) {
    const analysis = analyzeSoakLogFile(logFile);
    console.log('========================================================================');
    console.log('📊 SOAK REGRESSION RESULTS:');
    console.log(`   - Min Lag:   ${analysis.minLagSec.toFixed(3)}s`);
    console.log(`   - Max Lag:   ${analysis.maxLagSec.toFixed(3)}s`);
    console.log(`   - Mean Lag:  ${analysis.meanLagSec.toFixed(3)}s`);
    console.log(`   - Slope (β): ${analysis.regressionSlopeBeta.toFixed(6)} s/send (Ratcheting: ${analysis.isRatcheting})`);
    console.log('========================================================================\n');
  }

  // Cleanup test leads
  await query(`DELETE FROM leads WHERE notes = $1`, [testTag]);

  // Immutability check
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'soak3HourGridTest');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Soak Error:', err);
  process.exit(1);
});
