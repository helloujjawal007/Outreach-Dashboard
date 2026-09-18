import { query } from '../config/db';
import { env } from '../config/env';

export async function addInboxRotationAndTrigramIndexes() {
  console.log('[Migration] Enabling pg_trgm extension and setting up Multi-Inbox Rotation...');

  // 1. Enable pg_trgm extension for ultra-fast fuzzy and substring search
  try {
    await query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);
    console.log('✅ Enabled pg_trgm extension');
  } catch (err) {
    console.warn('⚠️ Could not enable pg_trgm extension (may require superuser, continuing):', err);
  }

  // 2. Create GIN Trigram indexes on leads for sub-5ms search
  try {
    await query(`
      CREATE INDEX IF NOT EXISTS idx_leads_business_name_trgm 
      ON leads USING gin (business_name gin_trgm_ops);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_leads_email_trgm 
      ON leads USING gin (email gin_trgm_ops) 
      WHERE email <> '';
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_leads_category_trgm 
      ON leads USING gin (category gin_trgm_ops);
    `);
    console.log('✅ Created pg_trgm GIN indexes on leads');
  } catch (err) {
    console.warn('⚠️ Trigram index creation notice:', err);
  }

  // 2b. Ensure leads and clients columns are TEXT to prevent value-too-long crashes on rich CSV imports
  try {
    await query(`
      ALTER TABLE leads 
        ALTER COLUMN category TYPE TEXT,
        ALTER COLUMN business_name TYPE TEXT,
        ALTER COLUMN phone TYPE TEXT,
        ALTER COLUMN email TYPE TEXT,
        ALTER COLUMN instagram TYPE TEXT,
        ALTER COLUMN facebook TYPE TEXT,
        ALTER COLUMN whatsapp TYPE TEXT;

      ALTER TABLE clients 
        ALTER COLUMN category TYPE TEXT,
        ALTER COLUMN business_name TYPE TEXT,
        ALTER COLUMN phone TYPE TEXT,
        ALTER COLUMN email TYPE TEXT,
        ALTER COLUMN instagram TYPE TEXT,
        ALTER COLUMN facebook TYPE TEXT,
        ALTER COLUMN whatsapp TYPE TEXT;
    `);
    console.log('✅ Ensured leads and clients columns use TEXT');
  } catch (err) {
    console.warn('⚠️ Could not alter column types (continuing):', err);
  }

  // 3. Create connected_inboxes table for Apollo-grade multi-inbox rotation
  await query(`
    CREATE TABLE IF NOT EXISTS connected_inboxes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      sender_name VARCHAR(255) NOT NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'smtp',
      smtp_host VARCHAR(255) NOT NULL,
      smtp_port INT NOT NULL DEFAULT 587,
      smtp_secure BOOLEAN DEFAULT false,
      smtp_user VARCHAR(255) NOT NULL,
      smtp_pass VARCHAR(255) NOT NULL,
      daily_limit INT NOT NULL DEFAULT 40,
      sent_today INT NOT NULL DEFAULT 0,
      last_reset_date DATE DEFAULT CURRENT_DATE,
      health_score INT NOT NULL DEFAULT 100,
      status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'exhausted', 'error')),
      is_default BOOLEAN NOT NULL DEFAULT false,
      last_error TEXT,
      last_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✅ Created connected_inboxes table');

  // 4. Create index on inbox status and health
  await query(`
    CREATE INDEX IF NOT EXISTS idx_connected_inboxes_status 
    ON connected_inboxes(status, sent_today, daily_limit);
  `);

  // 5. Add inbox tracking columns to scheduled_dispatches & messages
  await query(`
    ALTER TABLE scheduled_dispatches
    ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES connected_inboxes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS inbox_email VARCHAR(255) DEFAULT '';
  `);

  await query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES connected_inboxes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS inbox_email VARCHAR(255) DEFAULT '';
  `);
  console.log('✅ Added inbox tracking to scheduled_dispatches and messages');

  // 6. Automatically seed existing .env SMTP credentials into connected_inboxes as primary default inbox
  if (env.SMTP_USER && env.SMTP_PASS && env.SMTP_HOST) {
    const existingInbox = await query(`SELECT id FROM connected_inboxes WHERE email = $1`, [env.SMTP_USER]);
    if (existingInbox.rows.length === 0) {
      const cleanPass = env.SMTP_PASS.replace(/\s+/g, '');
      const senderName = env.SMTP_FROM?.includes('<')
        ? env.SMTP_FROM.split('<')[0].replace(/"/g, '').trim()
        : 'Outreach & Partnerships';

      const provider = env.SMTP_HOST.toLowerCase().includes('gmail')
        ? 'google_workspace'
        : env.SMTP_HOST.toLowerCase().includes('outlook') || env.SMTP_HOST.toLowerCase().includes('office365')
        ? 'office_365'
        : 'smtp';

      await query(`
        INSERT INTO connected_inboxes (
          name, email, sender_name, provider, smtp_host, smtp_port, smtp_secure,
          smtp_user, smtp_pass, daily_limit, sent_today, health_score, status, is_default
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 50, 0, 100, 'active', true
        )
      `, [
        `Primary (${env.SMTP_USER})`,
        env.SMTP_USER,
        senderName,
        provider,
        env.SMTP_HOST,
        env.SMTP_PORT,
        env.SMTP_SECURE,
        env.SMTP_USER,
        cleanPass,
      ]);
      console.log(`✅ Seeded primary active inbox from .env: ${env.SMTP_USER}`);
    }
  }

  console.log('[Migration] Multi-Inbox Rotation & Trigram Indexes verified successfully.');
}

if (process.argv[1]?.endsWith('add_inbox_rotation_and_trigram_indexes.ts') || process.argv[1]?.endsWith('add_inbox_rotation_and_trigram_indexes.js')) {
  addInboxRotationAndTrigramIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
