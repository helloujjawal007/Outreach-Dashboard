import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('[Migration] Starting database migration for Phase 1...');
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Migration] Schema migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration] Migration failed, transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === __filename || process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Error]', err);
      process.exit(1);
    });
}
