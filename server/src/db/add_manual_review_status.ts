import { query } from '../config/db';

export async function addManualReviewStatus() {
  console.log('[Migration] Checking and adding manual review columns to leads...');

  // 1. Add manual_review_reason and manual_review_at to leads
  await query(`
    ALTER TABLE leads 
    ADD COLUMN IF NOT EXISTS manual_review_reason TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS manual_review_at TIMESTAMPTZ DEFAULT NULL;
  `);

  // 1b. Add error_details to send_queue
  await query(`
    ALTER TABLE send_queue
    ADD COLUMN IF NOT EXISTS error_details TEXT DEFAULT NULL;
  `);

  // 2. Create index for fast manual review filtering
  await query(`
    CREATE INDEX IF NOT EXISTS idx_leads_manual_review 
    ON leads(status) WHERE status = 'manual_review';
  `);

  // 3. Add unmatched tracking to processed_inbound_emails
  await query(`
    ALTER TABLE processed_inbound_emails
    ADD COLUMN IF NOT EXISTS is_unmatched BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS raw_snippet TEXT DEFAULT NULL;
  `);

  console.log('[Migration] Manual review columns and indexes verified successfully.');
}

if (process.argv[1]?.endsWith('add_manual_review_status.ts')) {
  addManualReviewStatus()
    .then(() => {
      console.log('Migration completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
