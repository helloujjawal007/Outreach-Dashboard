import { query } from '../config/db';

export async function addExtremeAutomation() {
  console.log('[Migration] Setting up Extreme Automation & Autopilot Infrastructure...');

  // 1. Create autopilot_settings table for persistent 24/7 daemon configuration
  await query(`
    CREATE TABLE IF NOT EXISTS autopilot_settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed default autopilot configuration if not present
  const defaultSettings = [
    {
      key: 'drip_engine',
      value: {
        enabled: true,
        daily_limit: 150,
        batch_size: 5,
        cycle_interval_seconds: 30,
        followup_1_delay_days: 3,
        followup_2_delay_days: 5,
        pacing_delay_min_seconds: 3,
        pacing_delay_max_seconds: 8,
        preferred_channel: 'email',
        working_hours_only: false,
      },
      description: '24/7 Continuous Drip Outreach Engine settings',
    },
    {
      key: 'inbound_agent',
      value: {
        enabled: true,
        auto_classify_intent: true,
        auto_convert_hot_leads: true,
        auto_draft_replies: true,
        auto_send_replies: false, // Default false: human approves auto-drafts by default for safety
        confidence_threshold: 0.85,
      },
      description: 'Autonomous Inbound Intent & Auto-Reply Agent settings',
    },
    {
      key: 'enrichment_engine',
      value: {
        auto_discover_emails: true,
        auto_resolve_locations: true,
        auto_scan_website_forms: true,
        max_concurrent_workers: 3,
      },
      description: 'Autonomous Lead Contact & Location Enrichment settings',
    },
  ];

  for (const s of defaultSettings) {
    await query(
      `INSERT INTO autopilot_settings (key, value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO NOTHING;`,
      [s.key, JSON.stringify(s.value), s.description]
    );
  }

  // 2. Add columns to leads table for discovered emails, socials, and inbound AI intent
  await query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS discovered_emails JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS discovered_socials JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inbound_intent VARCHAR(50),
      ADD COLUMN IF NOT EXISTS inbound_intent_confidence NUMERIC(4, 2),
      ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT,
      ADD COLUMN IF NOT EXISTS ai_reply_status VARCHAR(30) DEFAULT 'none';
  `);

  // 3. Add columns to messages table for AI analysis
  await query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS intent VARCHAR(50),
      ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20),
      ADD COLUMN IF NOT EXISTS ai_draft_reply TEXT,
      ADD COLUMN IF NOT EXISTS ai_draft_generated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS inbound_intent VARCHAR(50),
      ADD COLUMN IF NOT EXISTS inbound_intent_confidence NUMERIC(4, 2),
      ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT;

    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
    ALTER TABLE messages ADD CONSTRAINT messages_status_check CHECK (status IN ('draft', 'sent', 'delivered', 'failed', 'bounced', 'queued'));
  `);

  // 4. Create high-performance composite indexes for instant sub-millisecond querying
  try {
    // Lead auto-pilot query index: super fast lookup of eligible leads due for outreach
    await query(`
      CREATE INDEX IF NOT EXISTS idx_leads_autopilot_filter
      ON leads (deleted_at, consent_status, status, outreach_stage, last_contacted_at);
    `);

    // Fast lead listing and sorting by created_at DESC
    await query(`
      CREATE INDEX IF NOT EXISTS idx_leads_active_created
      ON leads (deleted_at, created_at DESC);
    `);

    // Scheduled dispatches queue index for instant SKIP LOCKED queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_dispatches_due_queue
      ON scheduled_dispatches (status, scheduled_for ASC);
    `);

    // Fast conversation messages thread retrieval
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conv_thread
      ON messages (conversation_id, sent_at ASC);
    `);

    // Fast inbound unread / replied lookup
    await query(`
      CREATE INDEX IF NOT EXISTS idx_messages_inbound_status
      ON messages (direction, is_seen, is_replied, sent_at DESC);
    `);

    console.log('✅ Composite performance indexes created successfully.');
  } catch (idxErr) {
    console.warn('⚠️ Index creation notice (continuing):', idxErr);
  }

  console.log('[Migration] Extreme Automation & Autopilot Infrastructure ready.');
}
