import { query } from '../config/db';

export async function addAiCommandHistoryTable() {
  console.log('[Migration] Ensuring ai_command_history table exists...');
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ai_command_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        command_text TEXT NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        items_processed INT DEFAULT 0,
        success BOOLEAN DEFAULT TRUE,
        summary TEXT,
        ai_advice TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        execution_time_ms INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ai_command_history_created_at ON ai_command_history(created_at DESC);
    `);
    console.log('✅ ai_command_history table ready');
  } catch (err) {
    console.error('⚠️ Error creating ai_command_history table:', err);
  }
}
