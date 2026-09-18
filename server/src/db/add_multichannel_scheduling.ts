import { query } from '../config/db';

export async function addMultiChannelScheduling() {
  console.log('[Migration] Updating scheduled_dispatches for multi-channel support (Email, WhatsApp, FB, IG)...');

  // 1. Add channel column with default 'email'
  await query(`
    ALTER TABLE scheduled_dispatches
    ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'email';
  `);

  // 2. Add recipient_phone column for WhatsApp
  await query(`
    ALTER TABLE scheduled_dispatches
    ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(50) DEFAULT '';
  `);

  // 3. Add recipient_handle column for Instagram/Facebook
  await query(`
    ALTER TABLE scheduled_dispatches
    ADD COLUMN IF NOT EXISTS recipient_handle VARCHAR(100) DEFAULT '';
  `);

  // 4. Drop NOT NULL on recipient_email so phone-only contacts can be scheduled
  await query(`
    ALTER TABLE scheduled_dispatches
    ALTER COLUMN recipient_email DROP NOT NULL;
  `);

  // 5. Drop NOT NULL on subject and set default '' (non-email channels don't use subjects)
  await query(`
    ALTER TABLE scheduled_dispatches
    ALTER COLUMN subject DROP NOT NULL;
  `);
  await query(`
    ALTER TABLE scheduled_dispatches
    ALTER COLUMN subject SET DEFAULT '';
  `);

  // 6. Ensure channel index exists
  await query(`
    CREATE INDEX IF NOT EXISTS idx_sched_disp_channel_status_time
    ON scheduled_dispatches(channel, status, scheduled_for);
  `);

  console.log('[Migration] Multi-channel scheduling columns added successfully.');
}

if (process.argv[1]?.endsWith('add_multichannel_scheduling.ts') || process.argv[1]?.endsWith('add_multichannel_scheduling.js')) {
  addMultiChannelScheduling()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Multi-channel scheduling migration failed:', err);
      process.exit(1);
    });
}
