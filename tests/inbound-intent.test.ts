import { unifiedAiService } from '../server/src/services/unifiedAiService';
import { query } from '../server/src/config/db';

async function runInboundIntentTests() {
  console.log('=== TEST 1: AI Intent Classification on 4 Scenarios ===');
  
  const scenarios = [
    {
      type: 'interested',
      subject: 'Re: Quick inquiry',
      text: 'Hi there, yes we are interested in learning more! Could you please send over your pricing and case studies?',
    },
    {
      type: 'not-interested',
      subject: 'Re: Quick inquiry',
      text: 'Thanks for reaching out, but we are not interested at this time. We already have an internal team handling this.',
    },
    {
      type: 'out-of-office',
      subject: 'Automatic reply: Out of Office',
      text: 'I am currently out of the office until next Monday with no access to email. If urgent, contact office@domain.org.',
    },
    {
      type: 'unsubscribe',
      subject: 'Re: Quick inquiry',
      text: 'Please stop emailing me. Unsubscribe me from your mailing list immediately.',
    },
  ];

  for (const item of scenarios) {
    const classification = await unifiedAiService.classifyInboundReply({
      businessName: 'Apex Dental Care',
      senderName: 'Dr. Smith',
      senderEmail: 'drsmith@domain.org',
      subject: item.subject,
      replyText: item.text,
    });
    console.log(`\nScenario [${item.type}]:`);
    console.log(`Intent Classified: "${classification.intent}" | Confidence: ${classification.confidence} | Sentiment: ${classification.sentiment} | Action: ${classification.recommendedAction}`);
    console.log(`Summary: "${classification.summary}"`);
  }

  console.log('\n=== TEST 2: Read / Unread Counts in Database ===');
  const leadRes = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, outreach_stage, status)
     VALUES ('Apex Dental Care', 'drsmith@domain.org', 'initial', 'active')
     RETURNING id`
  );
  const testLeadId = leadRes.rows[0].id;

  const convRes = await query<{ id: string }>(
    `INSERT INTO conversations (entity_type, lead_id, channel, status)
     VALUES ('lead', $1, 'email', 'open')
     RETURNING id`,
    [testLeadId]
  );
  const testConvId = convRes.rows[0].id;

  // Insert 1 unread message
  await query(
    `INSERT INTO messages (conversation_id, channel, direction, text, status, is_read, is_seen)
     VALUES ($1, 'email', 'inbound', 'Unread reply text', 'delivered', false, false)`,
    [testConvId]
  );

  // Check unread count query
  const unreadRes = await query<{ count: string }>(
    `SELECT COUNT(*) FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE m.direction = 'inbound' AND m.is_read = false`
  );
  console.log('Unread inbound messages count in DB:', unreadRes.rows[0].count);

  // Cleanup
  await query(`DELETE FROM messages WHERE conversation_id = $1`, [testConvId]);
  await query(`DELETE FROM conversations WHERE id = $1`, [testConvId]);
  await query(`DELETE FROM leads WHERE id = $1`, [testLeadId]);
  console.log('Cleaned up test data.');
}

runInboundIntentTests().catch(console.error).then(() => process.exit(0));

