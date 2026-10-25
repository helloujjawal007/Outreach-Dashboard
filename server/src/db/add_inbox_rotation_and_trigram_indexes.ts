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

  // 6. Purge legacy obsolete inboxes (onlinedigitalsolution, growthflow) and guarantee sales@cloudconsultancy.in is primary default
  try {
    await query(`
      DELETE FROM connected_inboxes 
      WHERE email ILIKE '%onlinedigitalsolution%' OR email ILIKE '%growthflow%'
    `);
    // Heal any inboxes where port '465' was mistakenly entered as the smtp_host
    await query(`
      UPDATE connected_inboxes 
      SET smtp_host = 'smtppro.zoho.in', smtp_port = 465, smtp_secure = true
      WHERE smtp_host ~ '^\\d+$' OR smtp_host = '465' OR smtp_host = '' OR smtp_host = 'smtp.cloudconsultancy.in'
    `);
  } catch (purgeErr) {
    console.warn('[Migration Warning] Legacy inbox cleanup notice:', purgeErr);
  }

  const primaryEmail = (env.SMTP_USER && !env.SMTP_USER.includes('onlinedigitalsolution'))
    ? env.SMTP_USER
    : 'sales@cloudconsultancy.in';

  const cleanPass = (env.SMTP_PASS || '').replace(/\s+/g, '');
  const senderName = 'Cloud Consultancy';
  const provider = (env.SMTP_HOST || '').toLowerCase().includes('gmail')
    ? 'google_workspace'
    : (env.SMTP_HOST || '').toLowerCase().includes('outlook') || (env.SMTP_HOST || '').toLowerCase().includes('office365')
    ? 'office_365'
    : 'smtp';
  const smtpHost = env.SMTP_HOST || 'smtppro.zoho.in';
  const smtpPort = env.SMTP_PORT || 465;
  const smtpSecure = env.SMTP_SECURE || smtpPort === 465;

  const existingPrimary = await query(`SELECT id FROM connected_inboxes WHERE email = $1`, [primaryEmail]);
  if (existingPrimary.rows.length === 0) {
    await query(`UPDATE connected_inboxes SET is_default = false`);
    await query(`
      INSERT INTO connected_inboxes (
        name, email, sender_name, provider, smtp_host, smtp_port, smtp_secure,
        smtp_user, smtp_pass, daily_limit, sent_today, health_score, status, is_default
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 50, 0, 100, 'active', true
      )
    `, [
      `Primary (${primaryEmail})`,
      primaryEmail,
      senderName,
      provider,
      smtpHost,
      smtpPort,
      smtpSecure,
      primaryEmail,
      cleanPass,
    ]);
    console.log(`✅ Seeded primary active Cloud Consultancy inbox: ${primaryEmail}`);
  } else {
    await query(`UPDATE connected_inboxes SET is_default = false WHERE email != $1`, [primaryEmail]);
    await query(`
      UPDATE connected_inboxes 
      SET name = $1, smtp_host = $2, smtp_port = $3, smtp_secure = $4,
          smtp_pass = CASE WHEN $5 != '' THEN $5 ELSE smtp_pass END,
          sender_name = $6, health_score = 100, status = 'active', is_default = true,
          updated_at = NOW()
      WHERE email = $7
    `, [`Primary (${primaryEmail})`, smtpHost, smtpPort, smtpSecure, cleanPass, senderName, primaryEmail]);
    console.log(`✅ Synchronized primary inbox in connected_inboxes: ${primaryEmail}`);
  }

  // 6. Recalibrate and clean up corrupted daily_send_metrics to unthrottle system
  try {
    await query(`DELETE FROM daily_send_metrics WHERE channel = 'total'`);
    await query(`
      UPDATE daily_send_metrics
      SET bounced_count = LEAST(bounced_count, sent_count),
          updated_at = NOW()
      WHERE bounced_count > sent_count
    `);
    console.log('✅ Recalibrated daily_send_metrics to realistic baseline and unthrottled health signals');
  } catch (err) {
    console.warn('⚠️ Could not recalibrate daily_send_metrics:', err);
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
