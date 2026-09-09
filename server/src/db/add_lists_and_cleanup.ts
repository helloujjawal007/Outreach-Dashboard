import { query } from '../config/db';

export async function migrateListsAndEnforceSingleEntity() {
  console.log('--- Running Migration: Lists System & Single-Entity Enforcement ---');

  // 1. Create lists table
  await query(`
    CREATE TABLE IF NOT EXISTS lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 2. Create lead_list_memberships table
  await query(`
    CREATE TABLE IF NOT EXISTS lead_list_memberships (
      list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, lead_id)
    )
  `);

  // 3. Create default "Saved for Later" list if no lists exist
  const existingLists = await query(`SELECT COUNT(*) FROM lists`);
  if (parseInt(existingLists.rows[0]?.count || '0', 10) === 0) {
    await query(`
      INSERT INTO lists (name, description)
      VALUES 
        ('Saved for Later', 'Leads bookmarked to reach out to at a later date'),
        ('High Priority', 'VIP high-converting prospects')
    `);
    console.log('[Migration] Created default lists: "Saved for Later" and "High Priority"');
  }

  // 4. Data Cleanup: Enforce "One info can only be in leads or client"
  // Move all conversations and messages from original_lead_id to client_id
  const convertedClients = await query<{ id: string; original_lead_id: string }>(
    `SELECT id, original_lead_id FROM clients WHERE original_lead_id IS NOT NULL`
  );

  console.log(`[Migration] Found ${convertedClients.rows.length} converted clients to reconcile...`);

  for (const client of convertedClients.rows) {
    const leadId = client.original_lead_id;
    const clientId = client.id;

    // Check if client already has a conversation
    const clientConv = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE entity_type = 'client' AND client_id = $1 LIMIT 1`,
      [clientId]
    );

    const leadConv = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 LIMIT 1`,
      [leadId]
    );

    if (leadConv.rows.length > 0) {
      if (clientConv.rows.length > 0) {
        // Move messages from lead conv to client conv
        await query(
          `UPDATE messages SET conversation_id = $1 WHERE conversation_id = $2`,
          [clientConv.rows[0].id, leadConv.rows[0].id]
        );
        await query(`DELETE FROM conversations WHERE id = $1`, [leadConv.rows[0].id]);
      } else {
        // Switch lead conv to client conv
        await query(
          `UPDATE conversations SET entity_type = 'client', client_id = $1, lead_id = NULL WHERE id = $2`,
          [clientId, leadConv.rows[0].id]
        );
      }
    }

    // Clean up send queue for this lead
    await query(`DELETE FROM send_queue WHERE lead_id = $1`, [leadId]);

    // Clean up list memberships for this lead
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = $1`, [leadId]);

    // Finally, remove the lead row so it ONLY exists in clients!
    await query(`DELETE FROM leads WHERE id = $1`, [leadId]);
  }

  console.log('[Migration] Migration complete. All converted contacts now exist strictly in `clients`.');
}

if (process.argv[1]?.endsWith('add_lists_and_cleanup.ts') || process.argv[1]?.endsWith('add_lists_and_cleanup.js')) {
  migrateListsAndEnforceSingleEntity()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
