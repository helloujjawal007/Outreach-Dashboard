-- AI Client Follow-Up & Lead Outreach System
-- PostgreSQL Schema (Phase 1)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to automatically update timestamp
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. LEADS TABLE (Cold Outreach Prospects)
-- Notice: Leads and Clients are strictly separate tables.
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Uncategorized',
    phone VARCHAR(50) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    instagram VARCHAR(100) DEFAULT '',
    facebook VARCHAR(100) DEFAULT '',
    whatsapp VARCHAR(50) DEFAULT '',
    consent_status VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (consent_status IN ('none', 'replied', 'opted_out')),
    last_contacted_at TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(LOWER(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone <> '';
CREATE INDEX IF NOT EXISTS idx_leads_consent ON leads(consent_status);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 2. CLIENTS TABLE (Active / Paying Accounts)
-- Managed independently by the Conversation Orchestrator.
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    business_name VARCHAR(255) NOT NULL,
    primary_contact_name VARCHAR(255) DEFAULT '',
    category VARCHAR(100) NOT NULL DEFAULT 'Uncategorized',
    phone VARCHAR(50) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    instagram VARCHAR(100) DEFAULT '',
    facebook VARCHAR(100) DEFAULT '',
    whatsapp VARCHAR(50) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
    contract_value NUMERIC(12, 2) DEFAULT 0,
    onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(LOWER(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone) WHERE phone <> '';
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_original_lead_id ON clients(original_lead_id);

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 3. CONVERSATIONS TABLE (Omni-Channel Threads)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('lead', 'client')),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived', 'closed')),
    subject VARCHAR(255) DEFAULT '',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_conversation_entity CHECK (
        (entity_type = 'lead' AND lead_id IS NOT NULL AND client_id IS NULL) OR
        (entity_type = 'client' AND client_id IS NOT NULL AND lead_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_conv_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_client_id ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conv_entity ON conversations(entity_type, status);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 4. MESSAGES TABLE (Individual Inbound & Outbound Transcripts)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'delivered', 'failed', 'bounced')),
    external_id VARCHAR(255) DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_status ON messages(channel, status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- 5. FOLLOW_UP_RULES TABLE (Automated Scheduling Policies)
CREATE TABLE IF NOT EXISTS follow_up_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_entity_type VARCHAR(10) NOT NULL CHECK (target_entity_type IN ('lead', 'client')),
    name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL DEFAULT 'on_inactivity',
    delay_days INTEGER NOT NULL DEFAULT 3,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram')),
    template_body TEXT NOT NULL,
    max_follow_ups INTEGER NOT NULL DEFAULT 3,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_follow_up_rules_updated_at ON follow_up_rules;
CREATE TRIGGER trg_follow_up_rules_updated_at
    BEFORE UPDATE ON follow_up_rules
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 6. FOLLOW_UP_LOGS TABLE (Audit Trail & Trigger Execution)
CREATE TABLE IF NOT EXISTS follow_up_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES follow_up_rules(id) ON DELETE SET NULL,
    entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('lead', 'client')),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'failed')),
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_status_scheduled ON follow_up_logs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_logs_lead ON follow_up_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_logs_client ON follow_up_logs(client_id);

-- 7. CAMPAIGNS TABLE (Outreach Sequence Containers)
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    target_category VARCHAR(100) NOT NULL DEFAULT 'all',
    target_channel VARCHAR(50) NOT NULL DEFAULT 'all',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 8. CAMPAIGN_STEPS TABLE (Multi-Step Drip Definitions)
CREATE TABLE IF NOT EXISTS campaign_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL DEFAULT 1,
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram')),
    delay_days INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_steps_order ON campaign_steps(campaign_id, step_order);

-- 9. SEND_QUEUE TABLE (Manual Approval Queue for IG/FB & VIP Outbound)
CREATE TABLE IF NOT EXISTS send_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    step_id UUID REFERENCES campaign_steps(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram')),
    message_preview TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'discarded')),
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_lead ON send_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_send_queue_client ON send_queue(client_id);

DROP TRIGGER IF EXISTS trg_send_queue_updated_at ON send_queue;
CREATE TRIGGER trg_send_queue_updated_at
    BEFORE UPDATE ON send_queue
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_column();

-- 10. DAILY_SEND_METRICS TABLE (Deliverability & Sending Health)
CREATE TABLE IF NOT EXISTS daily_send_metrics (
    metric_date DATE NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'instagram', 'total')),
    sent_count INTEGER NOT NULL DEFAULT 0,
    bounced_count INTEGER NOT NULL DEFAULT 0,
    complaints_count INTEGER NOT NULL DEFAULT 0,
    drafted_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (metric_date, channel)
);

CREATE INDEX IF NOT EXISTS idx_metrics_date ON daily_send_metrics(metric_date DESC);
