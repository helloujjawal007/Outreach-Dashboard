import { pool } from '../config/db.ts';

async function migrateBatchesAndRetention() {
  console.log('🔄 Running migration: 28-day retention, upload batches, and soft deletion...');

  // 1. Create upload_batches table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upload_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_name VARCHAR(255) NOT NULL,
        source VARCHAR(50) DEFAULT 'csv',
        total_rows INT DEFAULT 0,
        imported_count INT DEFAULT 0,
        duplicate_count INT DEFAULT 0,
        incomplete_count INT DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '28 days')
    );
  `);
  console.log('✅ Created upload_batches table');

  // 2. Add batch_id, deleted_at, deleted_expires_at, outreach_stage to leads table
  await pool.query(`
    ALTER TABLE leads 
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_expires_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS outreach_stage VARCHAR(30) DEFAULT 'initial';
  `);
  console.log('✅ Added batch_id, deleted_at, deleted_expires_at, outreach_stage columns to leads table');

  // 3. Create deletion_history audit table for persistent deletion records
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deletion_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(20) NOT NULL DEFAULT 'lead',
        entity_id UUID NOT NULL,
        business_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) DEFAULT '',
        phone VARCHAR(50) DEFAULT '',
        data JSONB DEFAULT '{}'::jsonb,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '28 days')
    );
  `);
  console.log('✅ Created deletion_history table');

  // 4. Create Indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_leads_batch_id ON leads(batch_id);
    CREATE INDEX IF NOT EXISTS idx_batches_created_at ON upload_batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_deletion_history_expires ON deletion_history(expires_at);
  `);
  console.log('✅ Created indexes for retention and batch queries');

  console.log('🎉 Migration completed successfully!');
  await pool.end();
}

migrateBatchesAndRetention().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
