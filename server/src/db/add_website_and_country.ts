import { query } from '../config/db';

export async function migrateWebsiteAndCountry() {
  console.log('[Migration] Adding website and country columns...');

  // 1. Add columns to leads and clients
  await query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';

    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
    ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook', 'linkedin', 'website_form'));

    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_check;
    ALTER TABLE messages ADD CONSTRAINT messages_channel_check 
      CHECK (channel IN ('email', 'whatsapp', 'instagram', 'facebook', 'linkedin', 'website_form'));
  `);

  // 2. Fetch all leads to backfill
  const leadsRes = await query<{
    id: string;
    business_name: string;
    phone: string;
    notes: string;
    metadata: any;
    website: string;
    country: string;
  }>(`SELECT id, business_name, phone, notes, metadata, website, country FROM leads`);

  console.log(`[Migration] Evaluating ${leadsRes.rows.length} leads for website and country backfill...`);

  let updatedCount = 0;
  for (const lead of leadsRes.rows) {
    const notes = lead.notes || '';
    const phone = lead.phone || '';
    const meta = lead.metadata || {};
    const gp = meta.google_profile || {};

    // Determine website
    let website = lead.website || '';
    if (!website) {
      if (gp.website && !gp.website.includes('google.com/maps/search/?api=1&query=')) {
        website = gp.website;
      } else if (meta.website) {
        website = meta.website;
      } else {
        const webMatch = notes.match(/Website:\s*([^|\s]+)/i);
        if (webMatch) {
          let w = webMatch[1].trim();
          if (!w.startsWith('http://') && !w.startsWith('https://')) {
            w = `https://${w}`;
          }
          website = w;
        }
      }
    }

    // Special hardcoded / verified checks for top known leads
    const lowerName = lead.business_name.toLowerCase();
    if (lowerName.includes('rooter')) {
      website = 'https://www.mrrooter.ca';
    } else if (lowerName.includes('conestogo')) {
      website = 'https://conestogo.on.ca';
    }

    // Determine country
    let country = lead.country || '';
    if (!country) {
      if (phone.startsWith('+91')) {
        country = 'India';
      } else if (phone.startsWith('+61')) {
        country = 'Australia';
      } else if (phone.startsWith('+44')) {
        country = 'United Kingdom';
      } else if (phone.startsWith('+1')) {
        const searchCorpus = `${notes} ${gp.formattedAddress || ''} ${lead.business_name}`;
        if (/\b(SK|ON|BC|NS|AB|MB|QC|NB|PE|NL|Canada|Regina|Saskatoon|Kitchener|Kelowna|Halifax|Dartmouth)\b/i.test(searchCorpus)) {
          country = 'Canada';
        } else {
          country = 'United States';
        }
      } else {
        // Fallback checks on address or notes
        const searchCorpus = `${notes} ${gp.formattedAddress || ''}`;
        if (/canada/i.test(searchCorpus)) country = 'Canada';
        else if (/australia|brisbane|perth|sydney/i.test(searchCorpus)) country = 'Australia';
        else if (/india|kolkata|delhi|mumbai/i.test(searchCorpus)) country = 'India';
        else country = 'Canada'; // Default to North America / Canada
      }
    }

    // Update if website or country changed
    if (website !== lead.website || country !== lead.country) {
      await query(
        `UPDATE leads SET website = $1, country = $2 WHERE id = $3`,
        [website, country, lead.id]
      );
      updatedCount++;
    }
  }

  // 3. Backfill clients as well
  await query(`
    UPDATE clients c
    SET website = COALESCE(l.website, ''),
        country = COALESCE(l.country, 'Canada')
    FROM leads l
    WHERE c.original_lead_id = l.id
      AND (c.website IS NULL OR c.website = '' OR c.country IS NULL OR c.country = '')
  `);

  console.log(`[Migration] Successfully updated ${updatedCount} leads with website and country!`);
}

if (import.meta.url.endsWith(process.argv[1])) {
  migrateWebsiteAndCountry()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration Error]', err);
      process.exit(1);
    });
}
