import { query } from '../server/src/config/db';

async function check() {
  const l = await query(`SELECT id, business_name, email, consent_status, status FROM leads WHERE email ILIKE '%ransh5035%'`);
  console.log('Leads for ransh5035:', l.rows);
  const c = await query(`SELECT id, business_name, email, status FROM clients WHERE email ILIKE '%ransh5035%'`);
  console.log('Clients for ransh5035:', c.rows);
  const conv = await query(`
    SELECT c.id, c.entity_type, c.lead_id, c.client_id, m.direction, m.channel, m.text, m.sent_at 
    FROM conversations c 
    LEFT JOIN messages m ON m.conversation_id = c.id 
    WHERE c.lead_id IN (SELECT id FROM leads WHERE email ILIKE '%ransh5035%') 
       OR c.client_id IN (SELECT id FROM clients WHERE email ILIKE '%ransh5035%') 
    ORDER BY m.sent_at ASC
  `);
  console.log('Conversations & Messages:', conv.rows);
  process.exit(0);
}

check();
