import { query } from '../config/db';

export async function addSuppressionAndSequences(): Promise<void> {
  try {
    // 1. Create global_suppression_list table
    await query(`
      CREATE TABLE IF NOT EXISTS global_suppression_list (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255),
        phone VARCHAR(50),
        domain VARCHAR(255),
        reason VARCHAR(255) NOT NULL DEFAULT 'unsubscribed',
        source VARCHAR(50) DEFAULT 'system',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_suppression_email ON global_suppression_list(LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_suppression_phone ON global_suppression_list(phone);
      CREATE INDEX IF NOT EXISTS idx_suppression_domain ON global_suppression_list(LOWER(domain));
    `);

    // 2. Create sequence_enrollments table (state machine for multi-sequence progression)
    await query(`
      CREATE TABLE IF NOT EXISTS sequence_enrollments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        sequence_name VARCHAR(100) NOT NULL DEFAULT 'Cold Outreach 4-Step',
        current_step INTEGER NOT NULL DEFAULT 1,
        total_steps INTEGER NOT NULL DEFAULT 4,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        next_step_due_at TIMESTAMP WITH TIME ZONE,
        last_step_sent_at TIMESTAMP WITH TIME ZONE,
        enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_lead_id ON sequence_enrollments(lead_id);
      CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_status ON sequence_enrollments(status);
      CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_due ON sequence_enrollments(next_step_due_at);
    `);

    console.log('[Database Migration] ✅ global_suppression_list and sequence_enrollments tables successfully initialized.');
  } catch (err: any) {
    console.error('[Database Migration Error] addSuppressionAndSequences:', err?.message || err);
  }
}

if (process.argv[1]?.endsWith('add_suppression_and_sequences.ts')) {
  addSuppressionAndSequences().then(() => process.exit(0));
}
