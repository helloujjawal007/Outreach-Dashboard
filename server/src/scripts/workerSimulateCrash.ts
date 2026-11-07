import { query } from '../config/db';

async function main() {
  const leadId = process.argv[2];
  if (!leadId) {
    console.error('No leadId provided to worker');
    process.exit(1);
  }

  const res = await query(
    "UPDATE leads SET outreach_stage = 'sending', updated_at = NOW() WHERE id = $1 RETURNING id",
    [leadId]
  );

  console.log(`WORKER_CLAIMED:${res.rows.length}`);
  // Worker process hangs indefinitely mid-send until parent sends SIGKILL (-9)
  setInterval(() => {}, 1000);
}

main().catch((err) => {
  console.error('Worker error:', err);
  process.exit(1);
});

