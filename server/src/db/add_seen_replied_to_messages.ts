import { query } from '../config/db';

export async function addSeenRepliedToMessages() {
  console.log('[Migration] Adding is_seen and is_replied columns to messages table...');

  await query(`
    ALTER TABLE messages 
    ADD COLUMN IF NOT EXISTS is_seen BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_replied BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_messages_inbound_status 
    ON messages(direction, is_replied, is_seen);
  `);

  // Backfill: Any inbound message that has an outbound message in the same conversation
  // with sent_at >= inbound sent_at is already replied and seen
  const backfillRes = await query(`
    UPDATE messages m
    SET is_replied = true,
        replied_at = (
          SELECT MIN(out_m.sent_at) 
          FROM messages out_m 
          WHERE out_m.conversation_id = m.conversation_id 
            AND out_m.direction = 'outbound' 
            AND out_m.sent_at >= m.sent_at
        ),
        is_seen = true,
        seen_at = COALESCE(m.sent_at, NOW())
    WHERE m.direction = 'inbound'
      AND EXISTS (
        SELECT 1 FROM messages out_m 
        WHERE out_m.conversation_id = m.conversation_id 
          AND out_m.direction = 'outbound' 
          AND out_m.sent_at >= m.sent_at
      )
    RETURNING id;
  `);

  console.log(`[Migration] Backfilled ${backfillRes.rows.length} existing inbound messages as replied & seen.`);
  console.log('[Migration] is_seen and is_replied migration completed successfully.');
}

if (process.argv[1]?.endsWith('add_seen_replied_to_messages.ts') || process.argv[1]?.endsWith('add_seen_replied_to_messages.js')) {
  addSeenRepliedToMessages()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
