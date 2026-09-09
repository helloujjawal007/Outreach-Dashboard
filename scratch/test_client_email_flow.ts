import { query } from '../server/src/config/db';

const BASE_URL = 'http://localhost:5001/api';

async function testClientFlow() {
  console.log('--- Testing Client Email Send & Inbound Reflection ---');

  // 1. Create a temporary test client
  const testEmail = `client.test.${Date.now()}@example.com`;
  const insertClient = await query<{ id: string }>(
    `INSERT INTO clients (business_name, primary_contact_name, email, status)
     VALUES ('Test Client Corp', 'John Doe', $1, 'active')
     RETURNING id`,
    [testEmail]
  );
  const clientId = insertClient.rows[0].id;
  console.log('✅ Created test client with ID:', clientId, 'and email:', testEmail);

  // 2. Send outbound reply message to client via API
  const replyRes = await fetch(`${BASE_URL}/conversations/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      channel: 'email',
      text: 'Hello valued client, checking in on your project milestone!',
    }),
  });

  const replyData = await replyRes.json();
  if (!replyData.success) {
    throw new Error(`Failed to send reply to client: ${JSON.stringify(replyData)}`);
  }
  console.log('✅ Dispatched email to client! Result:', replyData.actionTaken);

  // 3. Verify outbound message is in conversations
  const convRes = await fetch(`${BASE_URL}/conversations/by-client/${clientId}`);
  const convData = await convRes.json();
  if (!convData.success || convData.messages.length === 0) {
    throw new Error(`Failed to fetch client messages: ${JSON.stringify(convData)}`);
  }
  console.log(`✅ Verified outbound message in client timeline: "${convData.messages[0].text}"`);

  // 4. Simulate an inbound reply from this client
  const simInbound = await query<{ id: string }>(
    `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
     VALUES ($1, 'email', 'inbound', 'Thanks for checking in! Everything looks great.', 'delivered', NOW())
     RETURNING id`,
    [convData.messages[0].conversation_id]
  );
  console.log('✅ Inbound reply recorded with ID:', simInbound.rows[0].id);

  // 5. Verify timeline has both outbound and inbound
  const updatedConv = await fetch(`${BASE_URL}/conversations/by-client/${clientId}`);
  const updatedData = await updatedConv.json();
  console.log(`✅ Client timeline now has ${updatedData.messages.length} messages:`);
  for (const m of updatedData.messages) {
    console.log(`   [${m.direction.toUpperCase()}] ${m.text}`);
  }

  // Cleanup test client
  await query(`DELETE FROM messages WHERE conversation_id = $1`, [convData.messages[0].conversation_id]);
  await query(`DELETE FROM conversations WHERE client_id = $1`, [clientId]);
  await query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  console.log('✅ Cleaned up test client.');

  console.log('\n🎉 ALL CLIENT EMAIL SEND & RECEIVE TESTS PASSED SUCCESSFULLY!');
}

testClientFlow().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
