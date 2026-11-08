import { Pool } from 'pg';
import {
  assertNotProduction,
  computeProductionDatabaseMd5,
  assertProductionImmutability,
} from '../config/db';

async function main() {
  console.log('========================================================================');
  console.log('🛡️ ITEM 1: DATABASE ISOLATION & FULL-TABLE MD5 IMMUTABILITY VERIFICATION');
  console.log('========================================================================\n');

  // 1. Verify that assertNotProduction() blocks the live CRM database
  console.log('[Step 1] Verifying that assertNotProduction() refuses live production database...');
  const prodPool = new Pool({
    connectionString: 'postgresql://localhost:5432/outreach_dashboard',
  });

  try {
    let blockedAsExpected = false;
    let blockReason = '';
    try {
      await assertNotProduction('Live Production Safety Check', prodPool);
    } catch (err: any) {
      blockedAsExpected = true;
      blockReason = err.message;
    }
    console.log(`   - Blocked Status: ${blockedAsExpected}`);
    console.log(`   - Refusal Error: "${blockReason}"`);

    if (!blockedAsExpected) {
      throw new Error('FAILED: assertNotProduction() did not block outreach_dashboard!');
    }
    console.log('✅ PASS: assertNotProduction() strictly checked DB against allowlist and refused production.\n');
  } finally {
    await prodPool.end();
  }

  // 2. Verify that assertNotProduction() permits the isolated test database
  console.log('[Step 2] Verifying that assertNotProduction() accepts outreach_dashboard_test...');
  await assertNotProduction('Isolated Test Database Harness');
  console.log('✅ PASS: Connected to isolated database "outreach_dashboard_test" (on allowlist).\n');

  // 3. Compute baseline MD5 checksums over ALL production rows (no filter, covering NULL notes)
  console.log('[Step 3] Computing baseline MD5 over full ordered production database tables:');
  const prodMd5Before = await computeProductionDatabaseMd5('postgresql://localhost:5432/outreach_dashboard');
  console.log(`   - leads MD5:         ${prodMd5Before.leadsMd5}`);
  console.log(`   - failure_log MD5:   ${prodMd5Before.failureLogMd5}`);
  console.log(`   - messages MD5:      ${prodMd5Before.messagesMd5}`);
  console.log(`   - settings MD5:      ${prodMd5Before.settingsMd5}\n`);

  // 4. Perform intensive database writes inside outreach_dashboard_test
  console.log('[Step 4] Executing test database writes and settings updates in outreach_dashboard_test...');
  const testPool = new Pool({
    connectionString: 'postgresql://localhost:5432/outreach_dashboard_test',
  });
  try {
    const testLeadId = '00000000-0000-0000-0000-000000000001';
    await testPool.query(
      `INSERT INTO leads (id, business_name, email, notes, outreach_stage, status)
       VALUES ($1, 'Isolation Test Lead', 'test@isolation.test', NULL, 'initial', 'active')
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [testLeadId]
    );

    await testPool.query(
      `UPDATE slot_sender_settings 
       SET slot_cycle_min = 2, slot_offset_min = 0.4, updated_at = NOW() 
       WHERE id = 'default'`
    );
    console.log('   ✓ Wrote test lead and updated slot_sender_settings in outreach_dashboard_test.');
  } finally {
    await testPool.end();
  }

  // 5. Compute post-test MD5 checksums on production database
  console.log('\n[Step 5] Computing post-test MD5 checksums on production database:');
  const prodMd5After = await computeProductionDatabaseMd5('postgresql://localhost:5432/outreach_dashboard');
  console.log(`   - leads MD5:         ${prodMd5After.leadsMd5}`);
  console.log(`   - failure_log MD5:   ${prodMd5After.failureLogMd5}`);
  console.log(`   - messages MD5:      ${prodMd5After.messagesMd5}`);
  console.log(`   - settings MD5:      ${prodMd5After.settingsMd5}\n`);

  // 6. Assert 100% Immutability
  console.log('[Step 6] Verifying zero production changes (Full Table MD5 comparison)...');
  assertProductionImmutability(prodMd5Before, prodMd5After, 'Item 1 Isolation Suite');

  console.log('========================================================================');
  console.log('✅ IMMUTABILITY CONFIRMED: 0 production rows modified, Δ = 0');
  console.log('   leads MD5 match:        TRUE');
  console.log('   failure_log MD5 match:  TRUE');
  console.log('   messages MD5 match:     TRUE');
  console.log('   settings MD5 match:     TRUE');
  console.log('========================================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Error in testIsolationAndMd5:', err);
  process.exit(1);
});
