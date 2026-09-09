const BASE_URL = 'http://localhost:5001/api';

async function testInboundSync() {
  console.log('--- Testing Inbound Email Sync & Reflection ---');

  // 1. Trigger sync-inbox endpoint
  const syncRes = await fetch(`${BASE_URL}/conversations/sync-inbox`, { method: 'POST' });
  const syncData = await syncRes.json();
  if (!syncData.success) {
    throw new Error(`sync-inbox failed: ${JSON.stringify(syncData)}`);
  }
  console.log('✅ POST /api/conversations/sync-inbox succeeded:', syncData.message);

  // 2. Fetch leads to get Abse
  const leadsRes = await fetch(`${BASE_URL}/leads`);
  const leadsData = await leadsRes.json();
  const abseLead = leadsData.leads.find((l: any) => l.email === 'ransh5035@gmail.com');
  if (!abseLead) {
    throw new Error('Abse lead not found');
  }
  console.log(`✅ Found lead: ${abseLead.business_name} (${abseLead.email})`);
  console.log(`   Consent status: ${abseLead.consent_status}`);

  // 3. Fetch conversation messages for Abse
  const convRes = await fetch(`${BASE_URL}/conversations/by-lead/${abseLead.id}`);
  const convData = await convRes.json();
  if (!convData.success) {
    throw new Error(`Failed to fetch messages: ${JSON.stringify(convData)}`);
  }

  console.log(`✅ Fetched ${convData.messages.length} messages for ${abseLead.business_name}:`);
  for (const msg of convData.messages) {
    console.log(`   [${msg.direction.toUpperCase()} | ${msg.channel}] ${msg.text.trim()} (${msg.sent_at})`);
  }

  const hasInbound = convData.messages.some((m: any) => m.direction === 'inbound' && m.text.includes('hyy Boss'));
  const hasOutbound = convData.messages.some((m: any) => m.direction === 'outbound' && m.text.includes('Helllo Boss'));

  if (!hasInbound || !hasOutbound) {
    throw new Error(`Missing expected messages! Outbound: ${hasOutbound}, Inbound: ${hasInbound}`);
  }

  console.log('✅ Both outbound ("Helllo Boss") and inbound ("hyy Boss.") are verified in conversation history!');
  console.log('\n🎉 INBOUND EMAIL SYNC & REFLECTION TEST PASSED 100%!');
}

testInboundSync().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
