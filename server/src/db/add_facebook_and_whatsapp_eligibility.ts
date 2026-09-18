import { pool } from '../config/db';

async function migrate() {
  console.log('🔄 Running migration: add Facebook channel support & WhatsApp eligibility columns...');

  // 1. Update conversations channel check constraint
  await pool.query(`
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
    ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook'));
  `);
  console.log('✅ Updated conversations_channel_check to include facebook');

  // 2. Update messages channel check constraint
  await pool.query(`
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_check;
    ALTER TABLE messages ADD CONSTRAINT messages_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook'));
  `);
  console.log('✅ Updated messages_channel_check to include facebook');

  // 3. Update follow_up_rules channel check constraint
  await pool.query(`
    ALTER TABLE follow_up_rules DROP CONSTRAINT IF EXISTS follow_up_rules_channel_check;
    ALTER TABLE follow_up_rules ADD CONSTRAINT follow_up_rules_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook'));
  `);
  console.log('✅ Updated follow_up_rules_channel_check to include facebook');

  // 4. Add whatsapp_eligible and whatsapp_decision_reason to leads table
  await pool.query(`
    ALTER TABLE leads 
    ADD COLUMN IF NOT EXISTS whatsapp_eligible BOOLEAN DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_decision_reason TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS detected_channels JSONB DEFAULT '[]'::jsonb;
  `);
  console.log('✅ Added whatsapp_eligible, whatsapp_decision_reason, and detected_channels to leads');

  // 5. Add whatsapp_eligible and whatsapp_decision_reason to clients table
  await pool.query(`
    ALTER TABLE clients 
    ADD COLUMN IF NOT EXISTS whatsapp_eligible BOOLEAN DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS whatsapp_decision_reason TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS detected_channels JSONB DEFAULT '[]'::jsonb;
  `);
  console.log('✅ Added whatsapp_eligible, whatsapp_decision_reason, and detected_channels to clients');

  // 6. Create indexes for quick channel querying
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_eligible ON leads(whatsapp_eligible);
    CREATE INDEX IF NOT EXISTS idx_leads_facebook ON leads(facebook) WHERE facebook <> '';
    CREATE INDEX IF NOT EXISTS idx_leads_instagram ON leads(instagram) WHERE instagram <> '';
  `);
  console.log('✅ Created indexes for channel querying');

  console.log('🎉 Facebook & WhatsApp eligibility migration completed successfully!');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
