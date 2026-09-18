import { query } from '../config/db';

export async function addLinkedInTables() {
  console.log('[Migration] Creating LinkedIn accounts, posts, and auto-reply tables...');

  // 1. linkedin_accounts table
  await query(`
    CREATE TABLE IF NOT EXISTS linkedin_accounts (
      id VARCHAR(50) PRIMARY KEY,
      account_name VARCHAR(255) NOT NULL DEFAULT 'LinkedIn User',
      headline VARCHAR(255) DEFAULT 'Growth & Outreach Executive',
      profile_url VARCHAR(255) DEFAULT '',
      auth_method VARCHAR(50) NOT NULL DEFAULT 'cookie',
      session_cookie TEXT DEFAULT '',
      access_token TEXT DEFAULT '',
      is_connected BOOLEAN DEFAULT true,
      daily_comments_used INT DEFAULT 0,
      daily_posts_used INT DEFAULT 0,
      quota_reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Insert default active account record if none exists
  await query(`
    INSERT INTO linkedin_accounts (id, account_name, headline, auth_method, is_connected)
    VALUES ('default_account', 'Ujjawal Kumar', 'Founder & Head of Growth • Enterprise Outbound', 'cookie', true)
    ON CONFLICT (id) DO NOTHING;
  `);

  // 2. linkedin_posts table
  await query(`
    CREATE TABLE IF NOT EXISTS linkedin_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) DEFAULT '',
      content TEXT NOT NULL,
      status VARCHAR(50) DEFAULT 'published',
      scheduled_for TIMESTAMPTZ,
      published_at TIMESTAMPTZ DEFAULT NOW(),
      tags TEXT[] DEFAULT '{}',
      ai_generated BOOLEAN DEFAULT true,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 3. linkedin_prospect_comments table
  await query(`
    CREATE TABLE IF NOT EXISTS linkedin_prospect_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
      prospect_name VARCHAR(255) NOT NULL,
      prospect_headline VARCHAR(255) DEFAULT '',
      prospect_profile_url VARCHAR(255) DEFAULT '',
      post_url VARCHAR(500) DEFAULT '',
      post_snippet TEXT NOT NULL,
      generated_comment TEXT NOT NULL,
      status VARCHAR(50) DEFAULT 'pending_approval',
      posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add index on prospect comment status
  await query(`
    CREATE INDEX IF NOT EXISTS idx_linkedin_comments_status ON linkedin_prospect_comments(status, created_at DESC);
  `);

  // Add linkedin column to leads and clients
  await query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin TEXT DEFAULT '';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin TEXT DEFAULT '';
  `);

  // Update conversations and messages channel check constraints to include linkedin
  await query(`
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
    ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook', 'linkedin', 'website_form'));

    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_check;
    ALTER TABLE messages ADD CONSTRAINT messages_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook', 'linkedin', 'website_form'));
  `);

  console.log('[Migration] LinkedIn tables and columns created successfully.');
}

if (process.argv[1]?.endsWith('add_linkedin_tables.ts') || process.argv[1]?.endsWith('add_linkedin_tables.js')) {
  addLinkedInTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('LinkedIn migration failed:', err);
      process.exit(1);
    });
}
