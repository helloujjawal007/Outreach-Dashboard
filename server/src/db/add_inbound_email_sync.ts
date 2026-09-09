import { query } from '../config/db';

export async function addInboundEmailSyncTable() {
  console.log('[Migration] Creating processed_inbound_emails table...');
  await query(`
    CREATE TABLE IF NOT EXISTS processed_inbound_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id VARCHAR(255) UNIQUE,
      uid BIGINT,
      sender_email VARCHAR(255),
      subject TEXT,
      matched_entity_type VARCHAR(20),
      matched_entity_id UUID,
      processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_processed_inbound_msg_id ON processed_inbound_emails(message_id);
  `);
  console.log('[Migration] processed_inbound_emails table created successfully.');
}

if (process.argv[1]?.endsWith('add_inbound_email_sync.ts')) {
  addInboundEmailSyncTable()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
