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
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
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
        ADD COLUMN IF NOT EXISTS ai_reply_status VARCHAR(30) DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS primary_contact_name VARCHAR(150) DEFAULT '',
        ADD COLUMN IF NOT EXISTS audit_key_takeaways TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS audit_pdf_name VARCHAR(255) DEFAULT '',
        ADD COLUMN IF NOT EXISTS audit_pdf_path TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS gmb_notes TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS audit_status VARCHAR(30) DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS audit_score INTEGER DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS audit_payload JSONB DEFAULT NULL;

      -- Ensure all columns on clients table
      ALTER TABLE clients 
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS deleted_expires_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '',
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

      -- Global suppression list table & guaranteed schema columns
      ALTER TABLE leads ALTER COLUMN status TYPE VARCHAR(50);

      CREATE TABLE IF NOT EXISTS global_suppression_list (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255),
          phone VARCHAR(50),
          domain VARCHAR(255),
          reason VARCHAR(255) NOT NULL DEFAULT 'unsubscribed',
          source VARCHAR(50) DEFAULT 'system',
          created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE global_suppression_list
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reason VARCHAR(255) DEFAULT 'unsubscribed',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      CREATE INDEX IF NOT EXISTS idx_suppression_email ON global_suppression_list(LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_suppression_phone ON global_suppression_list(phone);
      CREATE INDEX IF NOT EXISTS idx_suppression_domain ON global_suppression_list(LOWER(domain));

      -- Sequence enrollments table
      CREATE TABLE IF NOT EXISTS sequence_enrollments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
          sequence_name VARCHAR(100) NOT NULL DEFAULT 'Cold Outreach 4-Step',
          current_step INTEGER NOT NULL DEFAULT 1,
          total_steps INTEGER NOT NULL DEFAULT 4,
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          next_step_due_at TIMESTAMPTZ,
          last_step_sent_at TIMESTAMPTZ,
          enrolled_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          metadata JSONB DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_lead_id ON sequence_enrollments(lead_id);

      -- Connected inboxes table
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
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          is_default BOOLEAN NOT NULL DEFAULT false,
          last_error TEXT,
          last_sent_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Scheduled dispatches table & multi-channel columns
      CREATE TABLE IF NOT EXISTS scheduled_dispatches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
          list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
          channel VARCHAR(50) NOT NULL DEFAULT 'email',
          recipient_email VARCHAR(255),
          recipient_phone VARCHAR(50),
          recipient_name VARCHAR(255),
          business_name VARCHAR(255),
          subject TEXT,
          body TEXT NOT NULL,
          scheduled_for TIMESTAMPTZ NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
          stage VARCHAR(50) DEFAULT 'initial',
          attempt_count INT NOT NULL DEFAULT 0,
          max_attempts INT NOT NULL DEFAULT 3,
          locked_at TIMESTAMPTZ DEFAULT NULL,
          sent_at TIMESTAMPTZ,
          error_message TEXT,
          inbox_id UUID REFERENCES connected_inboxes(id) ON DELETE SET NULL,
          inbox_email VARCHAR(255) DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE scheduled_dispatches
        ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;
      CREATE INDEX IF NOT EXISTS idx_sched_disp_status_time ON scheduled_dispatches(status, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_sched_disp_processing_lock ON scheduled_dispatches(status, locked_at) WHERE status = 'processing';

      -- Ensure all message columns
      ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS is_seen BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS is_replied BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES connected_inboxes(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS inbox_email VARCHAR(255) DEFAULT '';

      -- Deals, activity_logs, and tasks
      CREATE TABLE IF NOT EXISTS deals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
          title VARCHAR(255) NOT NULL,
          value NUMERIC(12, 2) DEFAULT 0,
          stage VARCHAR(50) NOT NULL DEFAULT 'interested',
          probability INTEGER DEFAULT 25,
          lost_reason VARCHAR(255),
          contact_name VARCHAR(255),
          contact_email VARCHAR(255),
          contact_phone VARCHAR(50),
          expected_close_date TIMESTAMPTZ,
          closed_at TIMESTAMPTZ,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
          deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
          actor_type VARCHAR(50) DEFAULT 'system',
          activity_type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id);

      CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
          deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          due_date TIMESTAMPTZ,
          priority VARCHAR(20) DEFAULT 'medium',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- WhatsApp session keys
      CREATE TABLE IF NOT EXISTS whatsapp_session_keys (
          key_id VARCHAR(255) PRIMARY KEY,
          key_data TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 5-Slot Staggered Sender & Audit-First Pipeline columns
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS slot_id VARCHAR(5) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS audit_findings JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS audit_retry_count INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS audit_requested_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS audit_ready_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS slot_assigned_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_sent_message_id TEXT DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS last_sent_stage VARCHAR(50) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS claimed_stage VARCHAR(50) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS send_retry_count INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS transient_retry_count INT DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_leads_slot_id ON leads(slot_id);
      CREATE INDEX IF NOT EXISTS idx_leads_audit_status ON leads(audit_status);

      -- Failure Log table
      CREATE TABLE IF NOT EXISTS failure_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
          company VARCHAR(255) NOT NULL DEFAULT '',
          website VARCHAR(255) DEFAULT '',
          email VARCHAR(255) DEFAULT '',
          slot_id VARCHAR(10) DEFAULT '',
          stage VARCHAR(50) DEFAULT 'initial',
          type VARCHAR(50) NOT NULL,
          error_message TEXT DEFAULT '',
          attempts INT NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved BOOLEAN NOT NULL DEFAULT false,
          resolved_at TIMESTAMPTZ DEFAULT NULL
      );
      ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ DEFAULT NULL;
      CREATE INDEX IF NOT EXISTS idx_failure_log_type ON failure_log(type);
      CREATE INDEX IF NOT EXISTS idx_failure_log_slot ON failure_log(slot_id);
      CREATE INDEX IF NOT EXISTS idx_failure_log_resolved ON failure_log(resolved);
      CREATE INDEX IF NOT EXISTS idx_failure_log_created_at ON failure_log(created_at DESC);

      -- 5-Slot Sender Settings
      CREATE TABLE IF NOT EXISTS slot_sender_settings (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
          slot_cycle_min INT NOT NULL DEFAULT 10,
          slot_offset_min INT NOT NULL DEFAULT 2,
          anchor_timestamp TIMESTAMPTZ NOT NULL DEFAULT '2026-01-01 00:00:00+00',
          td_endpoint_url TEXT DEFAULT 'http://127.0.0.1:5055/api/od/audit-request',
          td_shared_secret TEXT DEFAULT 'td-secret-key-2026',
          max_audit_retries INT NOT NULL DEFAULT 3,
          daily_send_limit INT NOT NULL DEFAULT 150,
          send_window_start_hour INT NOT NULL DEFAULT 0,
          send_window_end_hour INT NOT NULL DEFAULT 24,
          weekdays_only BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE slot_sender_settings
        ADD COLUMN IF NOT EXISTS daily_send_limit INT NOT NULL DEFAULT 150,
        ADD COLUMN IF NOT EXISTS send_window_start_hour INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS send_window_end_hour INT NOT NULL DEFAULT 24,
        ADD COLUMN IF NOT EXISTS weekdays_only BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS circuit_breaker_tripped BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS consecutive_auth_failures INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS send_window_timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
        ADD COLUMN IF NOT EXISTS global_min_gap_sec INT NOT NULL DEFAULT 90,
        ADD COLUMN IF NOT EXISTS whatsapp_cold_outreach_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS whatsapp_daily_limit INT NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS active_list_id UUID DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS td_callback_secret TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS slot_offsets_min JSONB NOT NULL DEFAULT '[0, 2, 4, 6, 8]'::jsonb,
        ADD COLUMN IF NOT EXISTS slot_batch_size INT NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS slot_turn_state (
        slot_id VARCHAR(4) PRIMARY KEY CHECK (slot_id IN ('A', 'B', 'C', 'D', 'E')),
        last_turn_at TIMESTAMPTZ DEFAULT NULL,
        in_flight BOOLEAN NOT NULL DEFAULT false,
        in_flight_since TIMESTAMPTZ DEFAULT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO slot_turn_state (slot_id)
      VALUES ('A'), ('B'), ('C'), ('D'), ('E')
      ON CONFLICT (slot_id) DO NOTHING;

      ALTER TABLE slot_sender_settings 
        ALTER COLUMN slot_cycle_min TYPE NUMERIC USING slot_cycle_min::numeric,
        ALTER COLUMN slot_offset_min TYPE NUMERIC USING slot_offset_min::numeric;

      INSERT INTO slot_sender_settings (id, slot_cycle_min, slot_offset_min, anchor_timestamp, td_endpoint_url, td_shared_secret, max_audit_retries, daily_send_limit, send_window_start_hour, send_window_end_hour, weekdays_only, is_active)
      VALUES ('default', 10, 2, '2026-01-01 00:00:00+00', '', 'td-secret-key-2026', 3, 150, 0, 24, false, true)
      ON CONFLICT (id) DO NOTHING;

      -- Ensure existing settings are updated to 24/7 send window across all days
      UPDATE slot_sender_settings 
      SET send_window_start_hour = 0, send_window_end_hour = 24, weekdays_only = false
      WHERE id = 'default' AND (send_window_start_hour != 0 OR send_window_end_hour != 24 OR weekdays_only != false);

      -- Ensure cloudconsultancy.ad@gmail.com is configured as the active primary inbox for all 5 slots
      INSERT INTO connected_inboxes (
        name, email, sender_name, provider, smtp_host, smtp_port, smtp_secure,
        smtp_user, smtp_pass, daily_limit, sent_today, health_score, status, is_default, last_error, updated_at
      ) VALUES (
        'Primary (cloudconsultancy.ad@gmail.com)',
        'cloudconsultancy.ad@gmail.com',
        'Cloud Consultancy',
        'smtp',
        'smtp.gmail.com',
        465,
        true,
        'cloudconsultancy.ad@gmail.com',
        'jyiihithhtglfjdd',
        150,
        0,
        100,
        'active',
        true,
        NULL,
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        name = 'Primary (cloudconsultancy.ad@gmail.com)',
        sender_name = 'Cloud Consultancy',
        smtp_host = 'smtp.gmail.com',
        smtp_port = 465,
        smtp_secure = true,
        smtp_user = 'cloudconsultancy.ad@gmail.com',
        status = 'active',
        is_default = true,
        last_error = NULL,
        updated_at = NOW();

      -- Pause or purge non-primary inboxes so all 5 virtual slots route through cloudconsultancy.ad@gmail.com
      UPDATE connected_inboxes SET is_default = false, status = 'paused' WHERE email != 'cloudconsultancy.ad@gmail.com';

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
