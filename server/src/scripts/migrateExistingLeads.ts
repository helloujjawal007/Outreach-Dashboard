import { Pool } from 'pg';
import { pool } from '../config/db';

export async function runMigration(
  targetPool: Pool = pool,
  isDryRun = process.argv.includes('--dry-run'),
  confirmBackup = process.argv.includes('--confirm-backup')
) {
  console.log('========================================================================');
  console.log(`🔄 MIGRATION: LEGACY DRIP CLEANUP & ROUND-ROBIN STICKY SLOTS ${isDryRun ? '(DRY RUN)' : '(LIVE EXECUTION)'}`);
  console.log('========================================================================\n');

  const dbRes = await targetPool.query<{ current_database: string }>('SELECT current_database()');
  const dbName = dbRes.rows[0].current_database;
  console.log(`[Database Target]: "${dbName}" | Mode: ${isDryRun ? 'DRY RUN (No changes)' : 'LIVE'}\n`);

  // Mandatory Safety Checks (Mandate 16):
  // 1. Refuse to run on production database
  if (dbName === 'outreach_dashboard') {
    throw new Error('[IMMUTABILITY REFUSAL] Refusing to run migration directly on production database "outreach_dashboard". Migrations must run on scratch or test databases.');
  }

  // 2. Require --confirm-backup for live modifications
  if (!isDryRun && !confirmBackup) {
    throw new Error('[SAFETY CHECK] Live migration execution requires explicit --confirm-backup flag, or pass --dry-run for simulation.');
  }

  console.log(`[Context - Legacy Stage Cleanup & Slot Alignment]:
  • Under the legacy 4-touch cadence, leads progressed: initial -> followup_1 -> followup_2 -> followup_3.
  • Under the modern 5-Slot Sender (3-touch drip: Initial, Follow-up 1 @ Day 2.5, Follow-up 2 @ Day 5.5),
    leads that completed all outbound touches must transition to outreach_stage = 'completed'.
  • Unassigned leads without a sticky slot are evenly distributed round-robin across Slots A, B, C, D, E.\n`);

  // Step 1: Identify followup_3 leads
  const f3Query = await targetPool.query<{ id: string; business_name: string; email: string; status: string }>(
    `SELECT id, business_name, email, status FROM leads WHERE outreach_stage = 'followup_3' ORDER BY created_at ASC`
  );
  console.log(`[Step 1] Leads currently in 'followup_3': ${f3Query.rows.length}`);
  f3Query.rows.forEach((r, idx) => {
    console.log(`   ${idx + 1}. [${r.id}] "${r.business_name}" (${r.email}) -> status="${r.status}" => Proposed: outreach_stage='completed'`);
  });

  // Step 2: Identify unassigned leads
  const unassignedQuery = await targetPool.query<{ id: string; business_name: string; created_at: string }>(
    `SELECT id, business_name, created_at FROM leads WHERE slot_id IS NULL OR slot_id = '' ORDER BY created_at ASC`
  );
  console.log(`\n[Step 2] Leads without assigned virtual slot (slot_id IS NULL): ${unassignedQuery.rows.length}`);
  const slots = ['A', 'B', 'C', 'D', 'E'];
  unassignedQuery.rows.forEach((r, idx) => {
    const proposedSlot = slots[idx % 5];
    console.log(`   ${idx + 1}. [${r.id}] "${r.business_name}" => Proposed Slot: ${proposedSlot}`);
  });

  if (isDryRun) {
    console.log('\n========================================================================');
    console.log('🔍 DRY RUN COMPLETED: Plan displayed above. 0 rows modified in database.');
    console.log('========================================================================\n');
    return {
      f3Count: f3Query.rows.length,
      unassignedCount: unassignedQuery.rows.length,
      migratedF3: 0,
      assignedSlots: 0,
    };
  }

  // Live Execution
  console.log('\n[Step 3] Applying Migration Changes to database...');

  // A. Migrate followup_3 to completed
  const migrateF3 = await targetPool.query(
    `UPDATE leads
     SET outreach_stage = 'completed',
         status = CASE WHEN status = 'active' THEN 'completed' ELSE status END,
         updated_at = NOW()
     WHERE outreach_stage = 'followup_3'
     RETURNING id`
  );
  console.log(`   ✓ Migrated ${migrateF3.rowCount} lead(s) from 'followup_3' to 'completed'.`);

  // B. Assign round-robin slots
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

  // Step 4: Verify distribution
  const slotDist = await targetPool.query<{ slot_id: string; count: string }>(
    `SELECT slot_id, COUNT(*) FROM leads GROUP BY slot_id ORDER BY slot_id`
  );
  console.log('\n[Step 4] Final Virtual Slot Distribution across database:');
  for (const row of slotDist.rows) {
    console.log(`   - Slot ${row.slot_id || 'NONE'}: ${row.count} lead(s)`);
  }

  const f3After = await targetPool.query<{ count: string }>(
    `SELECT COUNT(*) FROM leads WHERE outreach_stage = 'followup_3'`
  );
  console.log(`   - Leads remaining in 'followup_3': ${f3After.rows[0].count} (MUST be 0)`);

  console.log('\n========================================================================');
  console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
  console.log('========================================================================\n');

  return {
    f3Count: f3Query.rows.length,
    unassignedCount: unassignedQuery.rows.length,
    migratedF3: migrateF3.rowCount || 0,
    assignedSlots: assignSlots.rowCount || 0,
  };
}

if (process.argv[1]?.endsWith('migrateExistingLeads.ts')) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal migration error:', err);
      process.exit(1);
    });
}
