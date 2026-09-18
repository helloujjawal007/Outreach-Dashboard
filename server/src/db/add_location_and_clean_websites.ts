import { query } from '../config/db';

export async function migrateLocationAndCleanWebsites() {
  console.log('[Migration] Checking location column and cleaning Google Maps from website fields...');

  // 1. Add location column to leads and clients
  await query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location);
    CREATE INDEX IF NOT EXISTS idx_clients_location ON clients(location);
  `);
  console.log('✅ Added location column to leads and clients tables');

  // 2. Clean website column: Never allow Google Maps URLs in website field
  const cleanedLeadsRes = await query(`
    UPDATE leads
    SET website = '',
        updated_at = NOW()
    WHERE website LIKE '%google.com/maps%'
       OR website LIKE '%maps.google%'
       OR website LIKE '%goo.gl/maps%'
       OR website LIKE '%google.com/search%'
    RETURNING id, business_name
  `);

  if (cleanedLeadsRes.rows.length > 0) {
    console.log(`✅ Cleaned ${cleanedLeadsRes.rows.length} lead(s) where website was a Google Maps link`);
  }

  await query(`
    UPDATE clients
    SET website = '',
        updated_at = NOW()
    WHERE website LIKE '%google.com/maps%'
       OR website LIKE '%maps.google%'
       OR website LIKE '%goo.gl/maps%'
       OR website LIKE '%google.com/search%'
  `);

  // 3. Clean google_profile metadata where website was set to Google Maps search query
  const metaCleanRes = await query(`
    UPDATE leads
    SET metadata = jsonb_set(
      metadata,
      '{google_profile,website}',
      '""'::jsonb
    )
    WHERE metadata->'google_profile'->>'website' LIKE '%google.com/maps%'
       OR metadata->'google_profile'->>'website' LIKE '%maps.google%'
       OR metadata->'google_profile'->>'website' LIKE '%goo.gl/maps%'
       OR metadata->'google_profile'->>'website' LIKE '%google.com/search%'
    RETURNING id
  `);

  if (metaCleanRes.rows.length > 0) {
    console.log(`✅ Cleaned ${metaCleanRes.rows.length} google_profile metadata entries containing Google Maps URLs`);
  }

  // 4. Normalize country names so filters are consistent
  await query(`
    UPDATE leads SET country = 'USA' WHERE country ILIKE 'United States' OR country = 'US';
    UPDATE clients SET country = 'USA' WHERE country ILIKE 'United States' OR country = 'US';
  `);
  console.log('✅ Normalized country names to USA');
}
