import { query } from '../config/db';

export async function addDealsTasksAndActivities(): Promise<void> {
  try {
    // 1. Create deals table
    await query(`
      CREATE TABLE IF NOT EXISTS deals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        value NUMERIC(12, 2) DEFAULT 0,
        stage VARCHAR(50) NOT NULL DEFAULT 'interested',
        probability INTEGER DEFAULT 25,
        lost_reason VARCHAR(255),
        contact_name VARCHAR(255),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        expected_close_date TIMESTAMP WITH TIME ZONE,
        closed_at TIMESTAMP WITH TIME ZONE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON deals(lead_id);
      CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    `);

    // 2. Create activity_logs table (Unified chronological feed)
    await query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
        actor_type VARCHAR(50) DEFAULT 'system',
        activity_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
    `);

    // 3. Create tasks table (Manual follow-ups, calls, and Today view)
    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        due_date TIMESTAMP WITH TIME ZONE NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'pending',
        task_type VARCHAR(50) DEFAULT 'follow_up',
        notes TEXT,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    console.log('[Database Migration] ✅ deals, activity_logs, and tasks tables successfully initialized.');
  } catch (err: any) {
    console.error('[Database Migration Error] addDealsTasksAndActivities:', err?.message || err);
  }
}
