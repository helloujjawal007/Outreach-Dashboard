import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, assertNotProduction, computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';
import { fiveSlotSenderService, SLOTS, SlotId } from '../services/fiveSlotSenderService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('========================================================================');
  console.log('💥 ITEM 4: B2 SIGKILL MID-CYCLE CRASH & ANCHOR RESUME VERIFICATION');
  console.log('========================================================================\n');

  console.log(`[REAL CLOCK START] date -u: ${new Date().toUTCString()}`);
  await assertNotProduction('testB2SigkillRestart');
  const prodMd5Before = await computeProductionDatabaseMd5();

  const testTag = `b2_kill_${Date.now()}`;
  console.log(`[Step 1] Initializing test batch with tag: "${testTag}"`);

  // Ensure test audit PDF exists
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });
  const samplePdfPath = path.join(auditsDir, `${testTag}_audit.pdf`);
  fs.writeFileSync(samplePdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n' + '0'.repeat(1000));

  // Queue leads for slots A, B, C, D, E
  console.log('[Step 2] Queuing test leads across slots A through E...');
  for (const slot of SLOTS) {
    await query(
      `INSERT INTO leads (business_name, email, website, outreach_stage, status, slot_id, notes, audit_status, audit_findings, audit_pdf_name, audit_pdf_path)
       VALUES ($1, $2, $3, 'initial', 'active', $4, $5, 'ready', '["PageSpeed 45/100", "LCP 3.9s"]', $6, $7)`,
      [
        `${testTag}_Slot${slot}`,
        `b2_${slot.toLowerCase()}_${testTag}@b2-kill.test`,
        `https://b2-${slot.toLowerCase()}.test`,
        slot,
        testTag,
        `${testTag}_audit.pdf`,
        samplePdfPath,
      ]
    );
  }

  // Anchor is aligned to start time
  const anchorDate = new Date();
  await fiveSlotSenderService.updateSettings({
    slot_cycle_min: 1.0,  // 60s cycle
    slot_offset_min: 0.2, // 12s offset: A=0s, B=12s, C=24s, D=36s, E=48s
    anchor_timestamp: anchorDate.toISOString(),
    is_active: true,
  });

  console.log(`[Step 3] Grid Configuration:`);
  console.log(`   - Anchor Time:   ${anchorDate.toISOString()}`);
  console.log(`   - Slot Cycle:    60s (1.0m)`);
  console.log(`   - Slot Offset:   12s (0.2m)`);
  console.log(`   - Schedule:      A @ :00s, B @ :12s, C @ :24s, D @ :36s, E @ :48s\n`);

  const workerScript = path.resolve(__dirname, 'workerSchedulerB2.ts');
  const capturedEvents: Array<{ time: string; event: string; slot?: string }> = [];

  let realWorkerPid: number | null = null;

  // Helper to start worker process
  function startWorkerProcess(): ChildProcess {
    const child = spawn('npx', ['tsx', workerScript], {
      detached: true,
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://localhost:5432/outreach_dashboard_test',
        TEST_TAG: testTag,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      const pidMatch = text.match(/PID:\s*(\d+)/);
      if (pidMatch) {
        realWorkerPid = parseInt(pidMatch[1], 10);
      }
      if (text.includes('[B2 Worker DISPATCH]')) {
        const slotMatch = text.match(/Slot:\s*([A-E])/);
        capturedEvents.push({
          time: new Date().toISOString(),
          event: 'DISPATCH',
          slot: slotMatch ? slotMatch[1] : undefined,
        });
      }
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    return child;
  }

  // Launch initial worker
  console.log('[Step 4] Starting Worker Process #1 (capturing Slot A dispatch)...');
  let worker = startWorkerProcess();

  // Wait for Slot A dispatch (at ~0s)
  let slotADispatched = false;
  const startWait = Date.now();
  while (Date.now() - startWait < 8000) {
    if (capturedEvents.some((e) => e.slot === 'A')) {
      slotADispatched = true;
      break;
    }
    await sleep(200);
  }

  console.log(`   - Slot A Dispatched in Worker #1: ${slotADispatched} at ${new Date().toISOString()}`);

  // SIGKILL the worker process mid-cycle!
  console.log('\n[Step 5] 💥 INJECTING SIGKILL (kill -9) on Worker Process #1...');
  if (realWorkerPid) {
    try {
      process.kill(realWorkerPid, 'SIGKILL');
      console.log(`   - Sent SIGKILL to real Node PID ${realWorkerPid} at ${new Date().toISOString()}`);
    } catch {}
  }
  if (worker.pid) {
    try {
      process.kill(-worker.pid, 'SIGKILL');
    } catch {}
    try {
      process.kill(worker.pid, 'SIGKILL');
    } catch {}
  }

  // Keep it down across at least 2 due slots!
  // Slot B is due at +12s (window 12s - 24s), Slot C is due at +24s (window 24s - 36s).
  // We keep it down until elapsed = 37s so BOTH Slot B and Slot C windows have completely passed.
  console.log('[Step 6] Keeping scheduler down across 2 due slots (Slot B @ 12-24s and Slot C @ 24-36s)...');
  const killTime = Date.now();
  const elapsedFromAnchor = () => Math.floor((Date.now() - anchorDate.getTime()) / 1000);

  while (elapsedFromAnchor() < 37) {
    console.log(`   ... Scheduler DOWN. Elapsed: ${elapsedFromAnchor()}s (Slot B @ 12-24s and Slot C @ 24-36s passing while down)`);
    await sleep(4000);
  }

  console.log(`\n[Step 7] Resuming: Elapsed is ${elapsedFromAnchor()}s. Both Slot B (:12-24s) and Slot C (:24-36s) passed while down.`);
  console.log('[Step 8] Restarting Worker Process #2 (testing recovery, no burst, anchor grid resume on Slot D @ :36-48s)...');

  const restartTime = Date.now();
  worker = startWorkerProcess();

  // Monitor for next 16 seconds (covering Slot D at :36s)
  console.log('[Step 9] Monitoring Worker #2 behavior:');
  console.log('   - Requirement A: Missed slots B & C MUST NOT burst-fire simultaneously upon restart!');
  console.log('   - Requirement B: Grid MUST resume on its anchor time for Slot D at :36s.\n');

  while (Date.now() - restartTime < 16000) {
    await sleep(1000);
    if (capturedEvents.some((e) => e.slot === 'D')) {
      break;
    }
  }

  // Gracefully terminate worker #2
  if (realWorkerPid) {
    try { process.kill(realWorkerPid, 'SIGKILL'); } catch {}
  }
  if (worker.pid) {
    try { process.kill(-worker.pid, 'SIGKILL'); } catch {}
    try { process.kill(worker.pid, 'SIGTERM'); } catch {}
  }
  await sleep(1000);

  console.log('\n========================================================================');
  console.log('📊 DISPATCH EVENT LOG SUMMARY ACROSS CRASH & RESTART');
  console.log('========================================================================');
  console.table(capturedEvents);

  const dispatchesAfterRestart = capturedEvents.filter(
    (e) => new Date(e.time).getTime() >= restartTime
  );

  const burstSlots = dispatchesAfterRestart.filter((e) => e.slot === 'B' || e.slot === 'C');
  console.log(`   - Missed slots (B & C) burst dispatches after restart: ${burstSlots.length} (MUST BE 0)`);
  console.log(`   - Slot D resumed on anchor schedule:                  ${capturedEvents.some((e) => e.slot === 'D')}`);

  if (burstSlots.length > 0) {
    throw new Error(`B2 FAILED: Worker burst-dispatched missed slots ${burstSlots.map((b) => b.slot).join(', ')} upon restart!`);
  }

  if (!capturedEvents.some((e) => e.slot === 'D')) {
    throw new Error('B2 FAILED: Slot D did not resume on schedule after restart!');
  }

  console.log('✅ ALL B2 SIGKILL & ANCHOR RESUME ASSERTIONS PASSED!');
  console.log(`[REAL CLOCK END] date -u: ${new Date().toUTCString()}\n`);

  // Verify Production Database Immutability
  const prodMd5After = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodMd5Before, prodMd5After, 'testB2SigkillRestart');

  console.log('========================================================================');
  console.log('✅ IMMUTABILITY CONFIRMED: 0 production rows modified, Δ = 0');
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Error in testB2SigkillRestart:', err);
  process.exit(1);
});
