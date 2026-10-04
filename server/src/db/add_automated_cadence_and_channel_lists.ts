import { query } from '../config/db';

/**
 * Migration: Adds automated cadence tracking columns, creates standard platform channel lists,
 * and sets default daily email capacity to 200 with 4-touch follow-up schedule (2.5d, 5.5d, 10d).
 */
export async function addAutomatedCadenceAndChannelLists(): Promise<void> {
  console.log('[Migration] Setting up automated cadence, email verification, and channel lists...');

  // 1. Add first_contacted_at and email verification columns to leads table
  await query(`
    ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verification_status VARCHAR(50) DEFAULT 'unverified';
  `);

  // 2. Backfill first_contacted_at for already contacted leads if null
  await query(`
    UPDATE leads
    SET first_contacted_at = last_contacted_at
    WHERE first_contacted_at IS NULL AND last_contacted_at IS NOT NULL;
  `);

  // 3. Create performance indexes for cadence checking and email verification
  await query(`
    CREATE INDEX IF NOT EXISTS idx_leads_cadence_timing 
    ON leads (deleted_at, status, consent_status, outreach_stage, first_contacted_at, last_contacted_at);

    CREATE INDEX IF NOT EXISTS idx_leads_email_verified 
    ON leads (email_verified);
  `);

  // 4. Ensure lists table exists
  await query(`
    CREATE TABLE IF NOT EXISTS lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lead_list_memberships (
      list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, lead_id)
    );
  `);

  // 5. Ensure core platform channel lists exist
  const platformLists = [
    {
      name: 'Email Leads',
      description: 'Automatically aggregated list of all verified leads with email addresses ready for email outreach.',
    },
    {
      name: 'WhatsApp Leads',
      description: 'Automatically aggregated list of all leads with verified WhatsApp / mobile contact numbers.',
    },
    {
      name: 'LinkedIn Leads',
      description: 'Automatically aggregated list of all leads with verified LinkedIn profiles.',
    },
    {
      name: 'Instagram Leads',
      description: 'Automatically aggregated list of all leads with verified Instagram accounts.',
    },
    {
      name: 'Facebook Leads',
      description: 'Automatically aggregated list of all leads with verified Facebook business pages.',
    },
    {
      name: 'Invalid List',
      description: 'Auto-populated list of leads with invalid, disposable, non-existent, or bounced email addresses flagged before outreach.',
    },
  ];

  for (const list of platformLists) {
    const existing = await query(`SELECT id FROM lists WHERE name = $1 LIMIT 1`, [list.name]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO lists (name, description, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())`,
        [list.name, list.description]
      );
      console.log(`[Migration] Created platform channel list: "${list.name}"`);
    }
  }

  // 6. Ensure autopilot_settings has updated 200/day limit and 4-touch cadence (2.5d, 5.5d, 10d)
  const dripEngineConfig = {
    enabled: true,
    batch_size: 10,
    daily_limit: 200,
    preferred_channel: 'email',
    working_hours_only: false,
    followup_1_delay_days: 2.5,
    followup_2_delay_days: 5.5,
    followup_3_delay_days: 10.0,
    cycle_interval_seconds: 30,
    pacing_delay_min_seconds: 3,
    pacing_delay_max_seconds: 8,
  };

  await query(`
    INSERT INTO autopilot_settings (key, value, description, updated_at)
    VALUES ('drip_engine', $1, '24/7 Drip Outreach Engine (200/day limit, 2.5d/5.5d/10d cadence)', NOW())
    ON CONFLICT (key)
    DO UPDATE SET 
      value = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              autopilot_settings.value, 
              '{daily_limit}', '200'::jsonb
            ),
            '{followup_1_delay_days}', '2.5'::jsonb
          ),
          '{followup_2_delay_days}', '5.5'::jsonb
        ),
        '{followup_3_delay_days}', '10.0'::jsonb
      ),
      updated_at = NOW();
  `, [JSON.stringify(dripEngineConfig)]);

  // 7. Increase connected_inboxes daily limits to comfortably accommodate 200 emails/day
  await query(`
    UPDATE connected_inboxes
    SET daily_limit = 100
    WHERE daily_limit < 100;
  `);

  console.log('✅ Automated cadence, email verification, and channel lists verified successfully.');
}
