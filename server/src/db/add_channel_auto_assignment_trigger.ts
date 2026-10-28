import { query } from '../config/db';

/**
 * Migration: Sets up standard channel lists (Email Leads, WhatsApp Leads, LinkedIn Leads,
 * Instagram Leads, Facebook Leads, Website Leads) and a PostgreSQL trigger on the `leads` table.
 * Whenever a lead is inserted or updated with an email, phone/whatsapp, linkedin, instagram,
 * facebook, or website, they are automatically enrolled into their corresponding channel lists.
 */
export async function addChannelAutoAssignmentTrigger(): Promise<void> {
  console.log('[Migration] Ensuring channel lists and auto-assignment trigger on leads table...');

  // 1. Ensure lists table and memberships table exist with proper columns and indexes
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, lead_id)
    );

    ALTER TABLE lead_list_memberships
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE INDEX IF NOT EXISTS idx_lists_name ON lists (name);
    CREATE INDEX IF NOT EXISTS idx_lead_list_memberships_lead_id ON lead_list_memberships (lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_list_memberships_list_id ON lead_list_memberships (list_id);
  `);

  // 2. Ensure all standard platform channel lists exist
  const channelLists = [
    {
      name: 'Email Leads',
      description: 'Auto-populated list of all leads with verified email addresses.',
    },
    {
      name: 'WhatsApp Leads',
      description: 'Auto-populated list of all leads with phone numbers or WhatsApp contact.',
    },
    {
      name: 'LinkedIn Leads',
      description: 'Auto-populated list of all leads with LinkedIn profiles.',
    },
    {
      name: 'Instagram Leads',
      description: 'Auto-populated list of all leads with Instagram handles or profiles.',
    },
    {
      name: 'Facebook Leads',
      description: 'Auto-populated list of all leads with Facebook business pages.',
    },
    {
      name: 'Website Leads',
      description: 'Auto-populated list of all leads with active company websites.',
    },
    {
      name: 'Invalid List',
      description: 'Auto-populated list of leads with invalid, disposable, non-existent, or bounced emails.',
    },
  ];

  for (const list of channelLists) {
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

  // 3. Create or replace PostgreSQL trigger function to auto-assign leads on insert or update
  await query(`
    CREATE OR REPLACE FUNCTION fn_auto_assign_lead_channel_lists()
    RETURNS TRIGGER AS $$
    DECLARE
      v_email_list_id UUID;
      v_whatsapp_list_id UUID;
      v_linkedin_list_id UUID;
      v_instagram_list_id UUID;
      v_facebook_list_id UUID;
      v_website_list_id UUID;
      v_clean_phone TEXT;
      v_clean_wa TEXT;
    BEGIN
      -- Ignore soft-deleted leads
      IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
      END IF;

      -- Resolve channel list IDs
      SELECT id INTO v_email_list_id FROM lists WHERE name = 'Email Leads' LIMIT 1;
      SELECT id INTO v_whatsapp_list_id FROM lists WHERE name = 'WhatsApp Leads' LIMIT 1;
      SELECT id INTO v_linkedin_list_id FROM lists WHERE name = 'LinkedIn Leads' LIMIT 1;
      SELECT id INTO v_instagram_list_id FROM lists WHERE name = 'Instagram Leads' LIMIT 1;
      SELECT id INTO v_facebook_list_id FROM lists WHERE name = 'Facebook Leads' LIMIT 1;
      SELECT id INTO v_website_list_id FROM lists WHERE name = 'Website Leads' LIMIT 1;

      -- 1. Email Leads: present and has '@'
      IF v_email_list_id IS NOT NULL THEN
        IF NEW.email IS NOT NULL AND TRIM(NEW.email) != '' AND NEW.email LIKE '%@%' THEN
          INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
          VALUES (v_email_list_id, NEW.id, NOW(), NOW())
          ON CONFLICT (list_id, lead_id) DO NOTHING;
        ELSE
          DELETE FROM lead_list_memberships WHERE lead_id = NEW.id AND list_id = v_email_list_id;
        END IF;
      END IF;

      -- 2. WhatsApp Leads: phone or whatsapp has at least 7 digits
      IF v_whatsapp_list_id IS NOT NULL THEN
        v_clean_phone := regexp_replace(COALESCE(NEW.phone, ''), '\\D', '', 'g');
        v_clean_wa := regexp_replace(COALESCE(NEW.whatsapp, ''), '\\D', '', 'g');
        IF length(v_clean_phone) >= 7 OR length(v_clean_wa) >= 7 THEN
          INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
          VALUES (v_whatsapp_list_id, NEW.id, NOW(), NOW())
          ON CONFLICT (list_id, lead_id) DO NOTHING;
        ELSE
          DELETE FROM lead_list_memberships WHERE lead_id = NEW.id AND list_id = v_whatsapp_list_id;
        END IF;
      END IF;

      -- 3. LinkedIn Leads: linkedin is present
      IF v_linkedin_list_id IS NOT NULL THEN
        IF NEW.linkedin IS NOT NULL AND TRIM(NEW.linkedin) != '' THEN
          INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
          VALUES (v_linkedin_list_id, NEW.id, NOW(), NOW())
          ON CONFLICT (list_id, lead_id) DO NOTHING;
        ELSE
          DELETE FROM lead_list_memberships WHERE lead_id = NEW.id AND list_id = v_linkedin_list_id;
        END IF;
      END IF;

      -- 4. Instagram Leads: instagram is present
      IF v_instagram_list_id IS NOT NULL THEN
        IF NEW.instagram IS NOT NULL AND TRIM(NEW.instagram) != '' THEN
          INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
          VALUES (v_instagram_list_id, NEW.id, NOW(), NOW())
          ON CONFLICT (list_id, lead_id) DO NOTHING;
        ELSE
          DELETE FROM lead_list_memberships WHERE lead_id = NEW.id AND list_id = v_instagram_list_id;
        END IF;
      END IF;

      -- 5. Facebook Leads: facebook is present
      IF v_facebook_list_id IS NOT NULL THEN
        IF NEW.facebook IS NOT NULL AND TRIM(NEW.facebook) != '' THEN
          INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
          VALUES (v_facebook_list_id, NEW.id, NOW(), NOW())
          ON CONFLICT (list_id, lead_id) DO NOTHING;
        ELSE
          DELETE FROM lead_list_memberships WHERE lead_id = NEW.id AND list_id = v_facebook_list_id;
        END IF;
      END IF;

      -- 6. Website Leads: website is present and not a Google Maps link
      IF v_website_list_id IS NOT NULL THEN
        IF NEW.website IS NOT NULL AND TRIM(NEW.website) != ''
           AND NEW.website NOT LIKE '%google.com/maps%' AND NEW.website NOT LIKE '%maps.google%' THEN
          INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
          VALUES (v_website_list_id, NEW.id, NOW(), NOW())
          ON CONFLICT (list_id, lead_id) DO NOTHING;
        ELSE
          DELETE FROM lead_list_memberships WHERE lead_id = NEW.id AND list_id = v_website_list_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_auto_assign_lead_channel_lists ON leads;

    CREATE TRIGGER trg_auto_assign_lead_channel_lists
    AFTER INSERT OR UPDATE OF email, phone, whatsapp, linkedin, instagram, facebook, website
    ON leads
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_assign_lead_channel_lists();
  `);

  // 4. Retroactive backfill: sync all existing leads into appropriate channel lists
  await query(`
    -- 1. Email Leads backfill
    INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
    SELECT lst.id, l.id, NOW(), NOW()
    FROM leads l
    JOIN lists lst ON lst.name = 'Email Leads'
    WHERE l.deleted_at IS NULL
      AND l.email IS NOT NULL AND TRIM(l.email) != '' AND l.email LIKE '%@%'
    ON CONFLICT (list_id, lead_id) DO NOTHING;

    -- 2. WhatsApp Leads backfill (phone or whatsapp >= 7 digits)
    INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
    SELECT lst.id, l.id, NOW(), NOW()
    FROM leads l
    JOIN lists lst ON lst.name = 'WhatsApp Leads'
    WHERE l.deleted_at IS NULL
      AND (
        length(regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g')) >= 7
        OR length(regexp_replace(COALESCE(l.whatsapp, ''), '\\D', '', 'g')) >= 7
      )
    ON CONFLICT (list_id, lead_id) DO NOTHING;

    -- 3. LinkedIn Leads backfill
    INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
    SELECT lst.id, l.id, NOW(), NOW()
    FROM leads l
    JOIN lists lst ON lst.name = 'LinkedIn Leads'
    WHERE l.deleted_at IS NULL
      AND l.linkedin IS NOT NULL AND TRIM(l.linkedin) != ''
    ON CONFLICT (list_id, lead_id) DO NOTHING;

    -- 4. Instagram Leads backfill
    INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
    SELECT lst.id, l.id, NOW(), NOW()
    FROM leads l
    JOIN lists lst ON lst.name = 'Instagram Leads'
    WHERE l.deleted_at IS NULL
      AND l.instagram IS NOT NULL AND TRIM(l.instagram) != ''
    ON CONFLICT (list_id, lead_id) DO NOTHING;

    -- 5. Facebook Leads backfill
    INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
    SELECT lst.id, l.id, NOW(), NOW()
    FROM leads l
    JOIN lists lst ON lst.name = 'Facebook Leads'
    WHERE l.deleted_at IS NULL
      AND l.facebook IS NOT NULL AND TRIM(l.facebook) != ''
    ON CONFLICT (list_id, lead_id) DO NOTHING;

    -- 6. Website Leads backfill
    INSERT INTO lead_list_memberships (list_id, lead_id, created_at, added_at)
    SELECT lst.id, l.id, NOW(), NOW()
    FROM leads l
    JOIN lists lst ON lst.name = 'Website Leads'
    WHERE l.deleted_at IS NULL
      AND l.website IS NOT NULL AND TRIM(l.website) != ''
      AND l.website NOT LIKE '%google.com/maps%' AND l.website NOT LIKE '%maps.google%'
    ON CONFLICT (list_id, lead_id) DO NOTHING;
  `);

  console.log('✅ Channel lists and PostgreSQL auto-assignment trigger configured successfully.');
}

if (process.argv[1]?.includes('add_channel_auto_assignment_trigger')) {
  addChannelAutoAssignmentTrigger()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
