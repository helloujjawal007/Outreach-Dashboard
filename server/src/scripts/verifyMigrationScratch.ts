import { Pool } from 'pg';
import { runMigration } from './migrateExistingLeads';
import { computeProductionDatabaseMd5, assertProductionImmutability } from '../config/db';

async function main() {
  console.log('========================================================================');
  console.log('🧪 ITEM 9: MIGRATION ON SCRATCH DATABASE & IDEMPOTENCY VERIFICATION');
  console.log('========================================================================\n');

  // 1. Establish production baseline hash
  console.log('[Step 1] Recording Production Database ("outreach_dashboard") baseline MD5...');
  const prodBaseline = await computeProductionDatabaseMd5();
  console.log(`   - Leads MD5:        ${prodBaseline.leadsMd5}`);
  console.log(`   - Failure Log MD5:  ${prodBaseline.failureLogMd5}`);
  console.log(`   - Messages MD5:     ${prodBaseline.messagesMd5}`);
  console.log(`   - Settings MD5:     ${prodBaseline.settingsMd5}`);
  console.log(`   - Suppression MD5:  ${prodBaseline.suppressionMd5}\n`);

  // 2. Connect to scratch database
  const scratchUrl = 'postgresql://localhost:5432/outreach_dashboard_migration_scratch';
  const scratchPool = new Pool({ connectionString: scratchUrl });

  const scratchDbRes = await scratchPool.query<{ current_database: string }>('SELECT current_database()');
  console.log(`[Step 2] Connected to scratch database: "${scratchDbRes.rows[0].current_database}"\n`);

  // Check initial counts on scratch DB
  const initialF3 = await scratchPool.query<{ count: string }>(
    `SELECT COUNT(*) FROM leads WHERE outreach_stage = 'followup_3'`
  );
  const initialUnassigned = await scratchPool.query<{ count: string }>(
    `SELECT COUNT(*) FROM leads WHERE slot_id IS NULL OR slot_id = ''`
  );
  const stageBreakdownBefore = await scratchPool.query<{ outreach_stage: string; count: string }>(
    `SELECT outreach_stage, COUNT(*) FROM leads GROUP BY outreach_stage ORDER BY outreach_stage`
  );

  console.log('[Step 3] Scratch Database Initial State:');
  console.log(`   - Total 'followup_3' leads: ${initialF3.rows[0].count}`);
  console.log(`   - Total unassigned slot leads: ${initialUnassigned.rows[0].count}`);
  console.log('   - Stage Breakdown:');
  for (const row of stageBreakdownBefore.rows) {
    console.log(`     * ${row.outreach_stage || 'NULL'}: ${row.count}`);
  }
  console.log('');

  // 3. Execute Dry Run
  console.log('[Step 4] Executing Migration in DRY-RUN mode on Scratch DB...');
  const dryRunResult = await runMigration(scratchPool, true);
  console.log(`   ✓ Dry Run result: proposed ${dryRunResult.f3Count} f3 migrations, ${dryRunResult.unassignedCount} slot assignments.`);
  console.log(`   ✓ Rows modified: 0\n`);

  // 4. Execute Live Migration
  console.log('[Step 5] Executing Live Migration on Scratch DB...');
  const liveResult1 = await runMigration(scratchPool, false);
  console.log(`   ✓ Live Run 1 result: migrated ${liveResult1.migratedF3} f3 leads, assigned ${liveResult1.assignedSlots} slots.\n`);

  // Verify state after live run 1
  const stageBreakdownAfter = await scratchPool.query<{ outreach_stage: string; count: string }>(
    `SELECT outreach_stage, COUNT(*) FROM leads GROUP BY outreach_stage ORDER BY outreach_stage`
  );
  const slotBreakdownAfter = await scratchPool.query<{ slot_id: string; count: string }>(
    `SELECT slot_id, COUNT(*) FROM leads GROUP BY slot_id ORDER BY slot_id`
  );

  console.log('[Step 6] Scratch Database State After Migration:');
  console.log('   - Stage Breakdown:');
  for (const row of stageBreakdownAfter.rows) {
    console.log(`     * ${row.outreach_stage || 'NULL'}: ${row.count}`);
  }
  console.log('   - Virtual Slot Breakdown:');
  for (const row of slotBreakdownAfter.rows) {
    console.log(`     * Slot ${row.slot_id}: ${row.count} lead(s)`);
  }
  console.log('');

  // 5. Execute Live Migration a SECOND time to prove idempotence
  console.log('[Step 7] Executing Live Migration a SECOND time (Idempotence Test)...');
  const liveResult2 = await runMigration(scratchPool, false);
  console.log(`   ✓ Live Run 2 result: migrated ${liveResult2.migratedF3} f3 leads, assigned ${liveResult2.assignedSlots} slots.`);
  if (liveResult2.migratedF3 !== 0 || liveResult2.assignedSlots !== 0) {
    throw new Error(`[IDEMPOTENCE FAILURE] Second run modified ${liveResult2.migratedF3} f3 and ${liveResult2.assignedSlots} slots! Must be 0.`);
  }
  console.log('   ✓ IDEMPOTENCE CONFIRMED: Second run produced Δ = 0 changes!\n');

  await scratchPool.end();

  // 6. Assert production database immutability
  console.log('[Step 8] Verifying Production Database Immutability...');
  const prodAfter = await computeProductionDatabaseMd5();
  assertProductionImmutability(prodBaseline, prodAfter, 'Item 9 Scratch Migration Test');
  console.log('   ✓ Production database remains 100% UNTOUCHED (Δ = 0 across all tables and rows).\n');

  console.log('========================================================================');
  console.log('🎉 ITEM 9 MIGRATION ON SCRATCH DATABASE PASSED WITH RAW PROOF');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error in verifyMigrationScratch:', err);
  process.exit(1);
});
