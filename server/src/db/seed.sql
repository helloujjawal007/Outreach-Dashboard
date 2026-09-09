-- Seed initial data for Outreach Dashboard & Client Follow-up System

-- Clean up existing data
TRUNCATE TABLE follow_up_logs CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE conversations CASCADE;
TRUNCATE TABLE send_queue CASCADE;
TRUNCATE TABLE campaign_steps CASCADE;
TRUNCATE TABLE campaigns CASCADE;
TRUNCATE TABLE follow_up_rules CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE leads CASCADE;
TRUNCATE TABLE daily_send_metrics CASCADE;

-- 1. Insert Initial Leads
INSERT INTO leads (id, business_name, category, phone, email, instagram, facebook, whatsapp, consent_status, last_contacted_at, notes)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'Apex Dental Care', 'Healthcare', '+1 415-555-0101', 'contact@apexdental.com', '@apexdental', 'ApexDentalCare', '+1 415-555-0101', 'none', NOW() - INTERVAL '2 days', 'Interested in patient booking automation'),
    ('11111111-1111-1111-1111-111111111102', 'Golden Gate Bistro', 'Food & Beverage', '+1 415-555-0102', 'gm@goldengatebistro.com', '@ggbistro', 'GoldenGateBistro', '', 'none', NOW() - INTERVAL '5 days', 'Cold outreach candidate'),
    ('11111111-1111-1111-1111-111111111103', 'Prime Fit Studio', 'Fitness & Wellness', '+1 510-555-0103', 'owner@primefitstudio.com', '@primefit', 'PrimeFitStudio', '+1 510-555-0103', 'none', NULL, 'Imported from gym directory'),
    ('11111111-1111-1111-1111-111111111104', 'Lumina Salon & Spa', 'Fitness & Wellness', '+1 415-555-0104', 'hello@luminasalon.com', '@luminasalon', 'LuminaSalon', '', 'opted_out', NOW() - INTERVAL '10 days', 'Requested unsubscribe on first email'),
    ('11111111-1111-1111-1111-111111111105', 'Bayview Auto Detail', 'Auto Services', '+1 650-555-0105', 'service@bayviewdetail.com', '', 'BayviewDetail', '+1 650-555-0105', 'none', NOW() - INTERVAL '1 day', 'Follow-up step 2 pending');

-- 2. Insert Initial Clients (Separate table for paying accounts)
INSERT INTO clients (id, original_lead_id, business_name, primary_contact_name, category, phone, email, instagram, whatsapp, status, contract_value, onboarded_at, notes)
VALUES
    ('22222222-2222-2222-2222-222222222201', NULL, 'Elevate Yoga Collective', 'Sarah Jenkins', 'Fitness & Wellness', '+1 510-555-0120', 'sarah@elevateyoga.com', '@elevateyoga', '+1 510-555-0120', 'active', 2400.00, NOW() - INTERVAL '30 days', 'Enterprise booking chatbot deployed'),
    ('22222222-2222-2222-2222-222222222202', NULL, 'Pacific Real Estate Group', 'Michael Chen', 'Real Estate', '+1 415-555-0121', 'mchen@pacificre.com', '@pacificre', '+1 415-555-0121', 'active', 4500.00, NOW() - INTERVAL '45 days', 'Lead qualification assistant active'),
    ('22222222-2222-2222-2222-222222222203', NULL, 'Urban Roast Coffee Co.', 'Elena Rostova', 'Food & Beverage', '+1 415-555-0122', 'elena@urbanroast.com', '@urbanroast', '', 'active', 1800.00, NOW() - INTERVAL '14 days', 'Loyalty follow-up automation active');

-- 3. Insert Sample Conversations & Messages
-- Lead Conversation (Apex Dental)
INSERT INTO conversations (id, entity_type, lead_id, client_id, channel, status, subject, last_message_at)
VALUES
    ('33333333-3333-3333-3333-333333333301', 'lead', '11111111-1111-1111-1111-111111111101', NULL, 'email', 'open', 'AI Patient Assistant for Apex Dental', NOW() - INTERVAL '2 days');

INSERT INTO messages (id, conversation_id, channel, direction, text, status, sent_at)
VALUES
    ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', 'email', 'outbound', 'Hi Apex Dental team, noticed your clinic handles high volume in SF. We built an AI receptionist that recovers 35% of missed call bookings automatically. Would you be open to a 2-min demo?', 'sent', NOW() - INTERVAL '2 days');

-- Client Conversation (Elevate Yoga - Orchestrator Managed)
INSERT INTO conversations (id, entity_type, lead_id, client_id, channel, status, subject, last_message_at)
VALUES
    ('33333333-3333-3333-3333-333333333302', 'client', NULL, '22222222-2222-2222-2222-222222222201', 'whatsapp', 'open', 'Monthly Performance Check-in', NOW() - INTERVAL '1 hour');

INSERT INTO messages (id, conversation_id, channel, direction, text, status, sent_at)
VALUES
    ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333302', 'whatsapp', 'outbound', 'Hi Sarah, your AI chatbot handled 142 student inquiries this week and booked 38 trial classes! Everything running smoothly?', 'delivered', NOW() - INTERVAL '3 hours'),
    ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333302', 'whatsapp', 'inbound', 'Yes, it has been wonderful! Can we add Sunday workshop schedules to its knowledge base?', 'sent', NOW() - INTERVAL '1 hour');

-- 4. Insert Follow-Up Rules
INSERT INTO follow_up_rules (id, target_entity_type, name, trigger_event, delay_days, channel, template_body, max_follow_ups, is_active)
VALUES
    ('55555555-5555-5555-5555-555555555501', 'lead', 'Cold Lead Gentle Bump', 'on_inactivity', 3, 'email', 'Hey {{first_name}}, following up on my note regarding {{business_name}}. Here is a quick 30-second case study of similar businesses in {{category}}.', 2, true),
    ('55555555-5555-5555-5555-555555555502', 'client', 'Bi-Weekly Health Check-in', 'on_inactivity', 14, 'whatsapp', 'Hi {{contact_name}}, checking in from the support team to ensure your automations are delivering peak results. Any adjustments needed this week?', 5, true);

-- 5. Insert Sample Campaigns & Sequence Steps
INSERT INTO campaigns (id, name, target_category, target_channel, status)
VALUES
    ('66666666-6666-6666-6666-666666666601', 'Healthcare AI Booking Sprint', 'Healthcare', 'email', 'active'),
    ('66666666-6666-6666-6666-666666666602', 'Retail & Boutique Local Outreach', 'Retail', 'all', 'draft');

INSERT INTO campaign_steps (id, campaign_id, step_order, name, channel, delay_days, body)
VALUES
    ('77777777-7777-7777-7777-777777777701', '66666666-6666-6666-6666-666666666601', 1, 'Value Proposition', 'email', 0, 'Hi {{business_name}} Team,\n\nWe noticed your practice is growing rapidly. Many healthcare clinics struggle with 20%+ after-hours missed appointments. We built a zero-staff patient assistant that handles booking 24/7.\n\nWorth a quick look?'),
    ('77777777-7777-7777-7777-777777777702', '66666666-6666-6666-6666-666666666601', 2, 'Proof & Case Study', 'email', 4, 'Quick follow-up for {{business_name}}: Dr. Miller''s clinic recovered $14,000/mo in lost consultation slots using this exact workflow.\n\nHappy to send over a 1-pager if useful?');

-- 6. Insert Send Queue Items (IG / Human-in-the-loop drafts)
INSERT INTO send_queue (id, lead_id, client_id, campaign_id, step_id, channel, message_preview, status, scheduled_for)
VALUES
    ('88888888-8888-8888-8888-888888888801', '11111111-1111-1111-1111-111111111102', NULL, '66666666-6666-6666-6666-666666666602', NULL, 'instagram', 'Hey Golden Gate Bistro! Love the seasonal tasting menu you just posted. Have you considered an automated Instagram DM reservation bot?', 'draft', NOW()),
    ('88888888-8888-8888-8888-888888888802', '11111111-1111-1111-1111-111111111103', NULL, '66666666-6666-6666-6666-666666666602', NULL, 'instagram', 'Hi Prime Fit Studio! Saw your spring transformation challenge. We help boutique gyms automate trial passes directly via DMs.', 'draft', NOW());

-- 7. Insert 7-Day Daily Send Metrics (Deliverability Health)
INSERT INTO daily_send_metrics (metric_date, channel, sent_count, bounced_count, complaints_count, drafted_count)
VALUES
    (CURRENT_DATE - INTERVAL '6 days', 'total', 142, 2, 0, 15),
    (CURRENT_DATE - INTERVAL '5 days', 'total', 188, 3, 0, 22),
    (CURRENT_DATE - INTERVAL '4 days', 'total', 215, 1, 0, 18),
    (CURRENT_DATE - INTERVAL '3 days', 'total', 194, 2, 0, 25),
    (CURRENT_DATE - INTERVAL '2 days', 'total', 230, 4, 0, 30),
    (CURRENT_DATE - INTERVAL '1 day',  'total', 210, 1, 0, 12),
    (CURRENT_DATE,                     'total', 95,  0, 0, 8);
