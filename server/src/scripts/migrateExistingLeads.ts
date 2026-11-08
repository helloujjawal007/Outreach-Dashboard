import { query, pool } from '../config/db';

export async function runMigration(targetPool = pool) {
  console.log('========================================================================');
  console.log('🔄 MIGRATION: LEGACY DRIP CLEANUP & ROUND-ROBIN STICKY SLOT ASSIGNMENT');
  console.log('========================================================================\n');

  const dbRes = await targetPool.query<{ current_database: string }>('SELECT current_database()');
  const dbName = dbRes.rows[0].current_database;
  console.log(`[Database Target]: "${dbName}"\n`);

  console.log(`[Historical Context - followup_3 Leads Explanation]:
  • Under the legacy 4-touch cadence, leads progressed: initial -> followup_1 -> followup_2 -> followup_3.
  • Once the 4th email was delivered, the legacy scheduler left the leads with outreach_stage = 'followup_3'.
  • Under the modern 5-Slot Staggered Sender (3-touch drip: Initial, Follow-up 1 @ Day 2.5, Follow-up 2 @ Day 5.5),
    any lead that has completed all outbound touches must transition to outreach_stage = 'completed'.
  • Leaving them in 'followup_3' causes ambiguity and risk of improper stage progression.
  • Migration Action: Any active/pending leads at outreach_stage = 'followup_3' are transitioned to
    outreach_stage = 'completed' and status = 'completed' (or 'inactive').\n`);

  // Step 1: Count followup_3 leads before migration
  const f3Before = await targetPool.query<{ count: string }>(
    `SELECT COUNT(*) FROM leads WHERE outreach_stage = 'followup_3'`
  );
  console.log(`[Step 1] Leads currently in 'followup_3': ${f3Before.rows[0].count}`);

  // Step 2: Migrate followup_3 leads to 'completed'
  const migrateF3 = await targetPool.query(
    `UPDATE leads
     SET outreach_stage = 'completed',
         status = CASE WHEN status = 'active' THEN 'completed' ELSE status END,
         updated_at = NOW()
     WHERE outreach_stage = 'followup_3'
     RETURNING id`
  );
  console.log(`   ✓ Migrated ${migrateF3.rowCount} lead(s) from 'followup_3' to 'completed'.`);

  // Step 3: Count leads with unassigned slot_id
  const unassignedBefore = await targetPool.query<{ count: string }>(
    `SELECT COUNT(*) FROM leads WHERE slot_id IS NULL OR slot_id = ''`
  );
  console.log(`\n[Step 2] Leads without assigned virtual slot (slot_id IS NULL): ${unassignedBefore.rows[0].count}`);

  // Step 4: Round-robin assign sticky slot_id (A, B, C, D, E) to unassigned leads
  const slots = ['A', 'B', 'C', 'D', 'E'];
  const assignSlots = await targetPool.query(`
    WITH ranked AS (
      SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1) % 5 AS slot_idx
      FROM leads
      WHERE slot_id IS NULL OR slot_id = ''
    )
    UPDATE leads l
    SET slot_id = CASE r.slot_idx
      WHEN 0 THEN 'A'
      WHEN 1 THEN 'B'
      WHEN 2 THEN 'C'
      WHEN 3 THEN 'D'
      WHEN 4 THEN 'E'
    END,
    updated_at = NOW()
    FROM ranked r
    WHERE l.id = r.id
    RETURNING l.id, l.slot_id
  `);
  console.log(`   ✓ Assigned sticky slots to ${assignSlots.rowCount} lead(s) using even round-robin.`);

  // Step 5: Verify distribution
  const slotDist = await targetPool.query<{ slot_id: string; count: string }>(
    `SELECT slot_id, COUNT(*) FROM leads GROUP BY slot_id ORDER BY slot_id`
  );
  console.log('\n[Step 3] Virtual Slot Distribution across database:');
  for (const row of slotDist.rows) {
    console.log(`   - Slot ${row.slot_id || 'NONE'}: ${row.count} lead(s)`);
  }

  console.log('\n========================================================================');
  console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
  console.log('========================================================================\n');
}

if (process.argv[1]?.endsWith('migrateExistingLeads.ts')) {
  runMigration().then(() => process.exit(0)).catch((err) => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

