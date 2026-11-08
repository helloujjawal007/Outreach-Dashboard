import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const rawDbUrl = process.env.DATABASE_URL?.trim();
const isProduction = process.env.NODE_ENV === 'production';

if (!rawDbUrl && isProduction) {
  console.warn(
    '⚠️ [PostgreSQL Warning] DATABASE_URL is not set in Environment Variables! ' +
    'The server is trying to connect to localhost:5432 which does not exist on Render. ' +
    'Please add DATABASE_URL (from Supabase or Neon) in your Render Dashboard -> Environment Variables.'
  );
}

const connectionString = rawDbUrl || 'postgresql://localhost:5432/outreach_dashboard';

const isRemoteDb =
  !!rawDbUrl &&
  (rawDbUrl.includes('render.com') ||
    rawDbUrl.includes('supabase.co') ||
    rawDbUrl.includes('neon.tech') ||
    rawDbUrl.includes('pooler.supabase.com') ||
    rawDbUrl.includes('aws') ||
    !rawDbUrl.includes('localhost'));

export const pool = new Pool({
  connectionString,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production' && duration > 200) {
      console.warn(`[PostgreSQL Slow Query] ${duration}ms: ${text.slice(0, 100)}...`);
    }
    return res;
  } catch (err) {
    console.error(`[PostgreSQL Query Error] Query: ${text}`, err);
    throw err;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await query<{ now: string; db: string }>('SELECT NOW() as now, current_database() as db');
    console.log(`[PostgreSQL] Connected successfully to "${res.rows[0].db}" at ${res.rows[0].now}`);
    return true;
  } catch (error) {
    console.error('[PostgreSQL] Connection failed:', error);
    return false;
  }
}

const TEST_DB_ALLOWLIST = ['outreach_dashboard_test', 'test_outreach_dashboard'];

/**
 * Production Safety Assertion:
 * 1. Verifies that NODE_ENV !== 'production' and URL is not a remote provider (Supabase, Render, Neon, AWS).
 * 2. Strictly checks the connected database name against TEST_DB_ALLOWLIST ('outreach_dashboard_test').
 *    Refuses execution if connected to the live CRM database ('outreach_dashboard') or any non-allowlisted DB.
 */
export async function assertNotProduction(contextName = 'Test Harness', targetPool: Pool = pool): Promise<void> {
  const url = (process.env.DATABASE_URL || '').toLowerCase();
  if (
    process.env.NODE_ENV === 'production' ||
    url.includes('supabase.com') ||
    url.includes('render.com') ||
    url.includes('neon.tech') ||
    url.includes('aws')
  ) {
    throw new Error(
      `[CRITICAL SAFETY ERROR] ${contextName} refused to run against production database (${url}). Tests must execute against local/isolated test database only!`
    );
  }

  try {
    const res = await targetPool.query<{ db: string }>('SELECT current_database() as db');
    const currentDb = res.rows[0]?.db;
    if (!TEST_DB_ALLOWLIST.includes(currentDb)) {
      throw new Error(
        `[CRITICAL SAFETY ERROR] ${contextName} refused: Connected to database "${currentDb}", which is NOT on the test allowlist [${TEST_DB_ALLOWLIST.join(', ')}]. Tests must execute against outreach_dashboard_test only!`
      );
    }
  } catch (err: any) {
    if (err.message.includes('CRITICAL SAFETY ERROR')) {
      throw err;
    }
    // If query fails, verify connection string directly
    const parsedDb = connectionString.split('/').pop()?.split('?')[0];
    if (!TEST_DB_ALLOWLIST.includes(parsedDb || '')) {
      throw new Error(
        `[CRITICAL SAFETY ERROR] ${contextName} refused: Configured database "${parsedDb}" is NOT in test allowlist [${TEST_DB_ALLOWLIST.join(', ')}]!`
      );
    }
  }
}

export interface ProductionDatabaseMd5 {
  leadsMd5: string;
  failureLogMd5: string;
  messagesMd5: string;
  settingsMd5: string;
}

/**
 * Connects directly to the live production CRM database ('outreach_dashboard')
 * and computes MD5 checksums over ALL ordered rows (covering NULL notes and every column).
 * Zero filter is applied: any change to production leads, failure_log, messages, or settings will alter the MD5.
 */
export async function computeProductionDatabaseMd5(
  prodDbUrl = process.env.PROD_DATABASE_URL || 'postgresql://localhost:5432/outreach_dashboard'
): Promise<ProductionDatabaseMd5> {
  const prodPool = new Pool({
    connectionString: prodDbUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await prodPool.query<{
      leads_md5: string;
      failure_log_md5: string;
      messages_md5: string;
      settings_md5: string;
    }>(`
      SELECT 
        (SELECT md5(COALESCE(string_agg(row_to_json(l)::text, '' ORDER BY l.id), '')) FROM leads l) as leads_md5,
        (SELECT md5(COALESCE(string_agg(row_to_json(f)::text, '' ORDER BY f.id), '')) FROM failure_log f) as failure_log_md5,
        (SELECT md5(COALESCE(string_agg(row_to_json(m)::text, '' ORDER BY m.id), '')) FROM messages m) as messages_md5,
        (SELECT md5(COALESCE(string_agg(row_to_json(s)::text, '' ORDER BY s.id), '')) FROM slot_sender_settings s) as settings_md5
    `);

    return {
      leadsMd5: res.rows[0]?.leads_md5 || '',
      failureLogMd5: res.rows[0]?.failure_log_md5 || '',
      messagesMd5: res.rows[0]?.messages_md5 || '',
      settingsMd5: res.rows[0]?.settings_md5 || '',
    };
  } finally {
    await prodPool.end();
  }
}

/**
 * Asserts that the production database has not changed a single byte during a test execution.
 */
export function assertProductionImmutability(
  before: ProductionDatabaseMd5,
  after: ProductionDatabaseMd5,
  contextName = 'Test Suite'
): void {
  if (before.leadsMd5 !== after.leadsMd5) {
    throw new Error(`[IMMUTABILITY VIOLATION] ${contextName}: Production leads table was modified! Before: ${before.leadsMd5}, After: ${after.leadsMd5}`);
  }
  if (before.failureLogMd5 !== after.failureLogMd5) {
    throw new Error(`[IMMUTABILITY VIOLATION] ${contextName}: Production failure_log table was modified! Before: ${before.failureLogMd5}, After: ${after.failureLogMd5}`);
  }
  if (before.messagesMd5 !== after.messagesMd5) {
    throw new Error(`[IMMUTABILITY VIOLATION] ${contextName}: Production messages table was modified! Before: ${before.messagesMd5}, After: ${after.messagesMd5}`);
  }
  if (before.settingsMd5 !== after.settingsMd5) {
    throw new Error(`[IMMUTABILITY VIOLATION] ${contextName}: Production slot_sender_settings table was modified! Before: ${before.settingsMd5}, After: ${after.settingsMd5}`);
  }
}

export interface ProductionSnapshot {
  realLeadsCount: number;
  stagesCount: Record<string, number>;
  failureLogsCount: number;
}

/**
 * Captures snapshot counts of real CRM leads, stages, and failure logs
 * to assert before/after immutability during test runs.
 */
export async function captureProductionSnapshot(): Promise<ProductionSnapshot> {
  const leadsRes = await query<{ count: string }>(
    `SELECT COUNT(*) FROM leads 
     WHERE (notes IS NULL OR (notes NOT LIKE '%test%' AND notes NOT LIKE '%B23%' AND notes NOT LIKE '%B1%')) 
       AND email NOT LIKE '%@example%' AND email NOT LIKE '%@test.%'`
  );
  const stagesRes = await query<{ outreach_stage: string; count: string }>(
    `SELECT COALESCE(outreach_stage, 'none') as outreach_stage, COUNT(*) FROM leads 
     WHERE (notes IS NULL OR (notes NOT LIKE '%test%' AND notes NOT LIKE '%B23%' AND notes NOT LIKE '%B1%')) 
       AND email NOT LIKE '%@example%' AND email NOT LIKE '%@test.%'
     GROUP BY outreach_stage`
  );
  const failuresRes = await query<{ count: string }>(
    `SELECT COUNT(*) FROM failure_log 
     WHERE email NOT LIKE '%@example%' AND email NOT LIKE '%@test.%'`
  );

  const stagesCount: Record<string, number> = {};
  for (const row of stagesRes.rows) {
    stagesCount[row.outreach_stage] = parseInt(row.count, 10);
  }

  return {
    realLeadsCount: parseInt(leadsRes.rows[0]?.count || '0', 10),
    stagesCount,
    failureLogsCount: parseInt(failuresRes.rows[0]?.count || '0', 10),
  };
}
