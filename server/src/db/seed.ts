import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runSeed() {
  console.log('[Seed] Starting database seed...');
  const seedPath = path.resolve(__dirname, 'seed.sql');

  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found at: ${seedPath}`);
  }

  const sql = fs.readFileSync(seedPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Seed] Database seeded successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Seed] Seeding failed, transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === __filename || process.argv[1]?.endsWith('seed.ts')) {
  runSeed()
    .then(() => {
      console.log('[Seed] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Error]', err);
      process.exit(1);
    });
}
