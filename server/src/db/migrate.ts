import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('[Migration] Starting comprehensive database migration...');
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);

    // Operational tables: batches, retention, deletion history, lists
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_batches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_name VARCHAR(255) NOT NULL,
          source VARCHAR(50) DEFAULT 'csv',
          total_rows INT DEFAULT 0,
          imported_count INT DEFAULT 0,
          duplicate_count INT DEFAULT 0,
          incomplete_count INT DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '28 days')
      );

      CREATE TABLE IF NOT EXISTS deletion_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entity_type VARCHAR(20) NOT NULL DEFAULT 'lead',
          entity_id UUID NOT NULL,
          business_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) DEFAULT '',
          phone VARCHAR(50) DEFAULT '',
          data JSONB DEFAULT '{}'::jsonb,
          deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '28 days')
      );

      CREATE TABLE IF NOT EXISTS lists (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT DEFAULT '',
          color VARCHAR(50) DEFAULT '#6366f1',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lead_list_memberships (
          lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
          list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
          added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (lead_id, list_id)
      );

      -- Ensure all columns on leads table
      ALTER TABLE leads 
        ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS deleted_expires_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS outreach_stage VARCHAR(30) DEFAULT 'initial',
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS linkedin TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS whatsapp_eligible BOOLEAN DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS whatsapp_decision_reason TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS detected_channels JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS manual_review_reason TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS manual_review_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS email_verification_status VARCHAR(50) DEFAULT 'unverified',
        ADD COLUMN IF NOT EXISTS discovered_emails JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS discovered_socials JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS inbound_intent VARCHAR(50),
        ADD COLUMN IF NOT EXISTS inbound_intent_confidence NUMERIC(4, 2),
        ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT,
        ADD COLUMN IF NOT EXISTS ai_reply_status VARCHAR(30) DEFAULT 'none';

      -- Ensure all columns on clients table
      ALTER TABLE clients 
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS deleted_expires_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS linkedin TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS whatsapp_eligible BOOLEAN DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS whatsapp_decision_reason TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS detected_channels JSONB DEFAULT '[]'::jsonb;

      -- Ensure all columns on conversations table
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS intent VARCHAR(50),
        ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20),
        ADD COLUMN IF NOT EXISTS ai_draft_reply TEXT,
        ADD COLUMN IF NOT EXISTS ai_draft_generated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS inbound_intent VARCHAR(50),
        ADD COLUMN IF NOT EXISTS inbound_intent_confidence NUMERIC(4, 2),
        ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT;

      -- Performance indexes
      CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_leads_batch_id ON leads(batch_id);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_batches_created_at ON upload_batches(created_at);
      CREATE INDEX IF NOT EXISTS idx_deletion_history_expires ON deletion_history(expires_at);
    `);

    await client.query('COMMIT');
    console.log('[Migration] All tables and columns migrated successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration] Migration failed, transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === __filename || process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Error]', err);
      process.exit(1);
    });
}
