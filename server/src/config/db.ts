import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/outreach_dashboard';

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
