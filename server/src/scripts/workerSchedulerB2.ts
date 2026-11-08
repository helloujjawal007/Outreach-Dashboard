import { query, assertNotProduction } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

async function runWorker() {
  await assertNotProduction('WorkerSchedulerB2');
  emailAdapter.setMockMode(true);

  console.log(`[B2 Worker] Process started. PID: ${process.pid} at ${new Date().toISOString()}`);

  const testTag = process.env.TEST_TAG || `b2_sigkill_${Date.now()}`;

  // Start tick loop every 1s
  const interval = setInterval(async () => {
    try {
      const tick = await fiveSlotSenderService.processGlobalTick(undefined, testTag, {
        bypassWindow: true,
        bypassMinGap: true,
        bypassDailyCap: true,
      });

      if (tick.dispatched) {
        console.log(`🚀 [B2 Worker DISPATCH] Slot: ${tick.activeSlot} | Lead: ${tick.leadId} | Real Clock: ${new Date().toISOString()}`);
      }
    } catch (err: any) {
      console.error(`[B2 Worker Error]`, err?.message);
    }
  }, 1000);

  process.on('SIGTERM', () => {
    clearInterval(interval);
    process.exit(0);
  });
}

runWorker().catch((err) => {
  console.error('[B2 Worker Fatal]', err);
  process.exit(1);
});

