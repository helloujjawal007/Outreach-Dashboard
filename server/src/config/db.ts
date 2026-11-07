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

/**
 * Production Safety Assertion:
 * Refuses execution if connection string points to Supabase, Neon, AWS or if NODE_ENV=production.
 */
export function assertNotProduction(contextName = 'Test Harness'): void {
  const url = (process.env.DATABASE_URL || '').toLowerCase();
  if (
    process.env.NODE_ENV === 'production' ||
    url.includes('supabase.com') ||
    url.includes('render.com') ||
    url.includes('neon.tech') ||
    url.includes('aws')
  ) {
    throw new Error(
      `[CRITICAL SAFETY ERROR] ${contextName} refused to run against production database (${url}). Tests must execute against local/isolated database only!`
    );
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
