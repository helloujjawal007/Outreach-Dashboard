import { query } from '../config/db';

export async function addScheduledDispatchesTable() {
  console.log('[Migration] Ensuring scheduled_dispatches table exists...');

  await query(`
    CREATE TABLE IF NOT EXISTS scheduled_dispatches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
      list_name VARCHAR(255) DEFAULT '',
      entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('lead', 'client')),
      lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
      recipient_email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(255) DEFAULT '',
      subject VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      stage VARCHAR(50) DEFAULT 'initial',
      style VARCHAR(50) DEFAULT 'conversational',
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
      scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sched_disp_status_time ON scheduled_dispatches(status, scheduled_for);
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_sched_disp_list ON scheduled_dispatches(list_id);
  `);

  console.log('[Migration] scheduled_dispatches table verified successfully.');
}

if (process.argv[1]?.endsWith('add_scheduled_dispatches.ts') || process.argv[1]?.endsWith('add_scheduled_dispatches.js')) {
  addScheduledDispatchesTable()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
