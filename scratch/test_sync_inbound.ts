import { emailInboundService } from '../server/src/services/emailInboundService';
import { query } from '../server/src/config/db';

async function testSync() {
  console.log('--- Triggering Gmail IMAP Inbound Sync ---');
  const result = await emailInboundService.syncInboundEmails();
  console.log('Result:', JSON.stringify(result, null, 2));

  // Verify database state for Abse
  const leadRes = await query(
    `SELECT id, business_name, email, consent_status, last_contacted_at, status FROM leads WHERE email ILIKE '%ransh5035%'`
  );
  console.log('Lead after sync:', leadRes.rows);

  const msgRes = await query(`
    SELECT m.id, m.conversation_id, m.channel, m.direction, m.text, m.sent_at 
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.lead_id = $1 OR c.client_id IN (SELECT id FROM clients WHERE email ILIKE '%ransh5035%')
    ORDER BY m.sent_at ASC
  `, [leadRes.rows[0]?.id]);
  console.log('Messages in timeline:', msgRes.rows);

  process.exit(0);
}

testSync();
