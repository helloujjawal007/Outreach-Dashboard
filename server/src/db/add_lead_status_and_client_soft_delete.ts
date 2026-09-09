import { pool } from '../config/db.ts';

async function migrate() {
  console.log('🔄 Running migration: add lead status & client soft-delete...');

  // 1. Add deleted_at & deleted_expires_at to clients table
  await pool.query(`
    ALTER TABLE clients 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_expires_at TIMESTAMPTZ DEFAULT NULL;
  `);
  console.log('✅ Added deleted_at & deleted_expires_at to clients table');

  // 2. Add status column to leads table
  await pool.query(`
    ALTER TABLE leads 
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
  `);
  console.log('✅ Added status column to leads table');

  // 3. Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  `);
  console.log('✅ Created indexes for clients.deleted_at and leads.status');

  console.log('🎉 Migration finished successfully!');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
