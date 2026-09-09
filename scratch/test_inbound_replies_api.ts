async function testInboundRepliesApi() {
  console.log('--- Testing Inbound Replies & Notification API ---');
  const baseURL = 'http://localhost:5001/api';

  try {
    // 1. Fetch all inbound replies
    console.log('[1] Fetching inbound replies...');
    const res = await fetch(`${baseURL}/conversations/inbound-replies`);
    const data = await res.json() as any;
    console.log('Inbound replies status:', res.status, 'Count:', data.count);
    if (!data.success || !Array.isArray(data.replies)) {
      throw new Error('Expected success: true and replies array');
    }

    console.log(`Found ${data.replies.length} inbound replies:`);
    for (const reply of data.replies) {
      console.log(`- From: ${reply.business_name} <${reply.email}> [${reply.entity_type}]`);
      console.log(`  Message: "${reply.text?.trim()}" | Sent at: ${reply.sent_at}`);
      console.log(`  Target ID: ${reply.client_id || reply.lead_id}`);
    }

    // 2. Test filter by channel
    console.log('\n[2] Testing filter by channel=email...');
    const emailOnlyRes = await fetch(`${baseURL}/conversations/inbound-replies?channel=email`);
    const emailData = await emailOnlyRes.json() as any;
    console.log('Email replies count:', emailData.count);

    // 3. Test sync-inbox endpoint
    console.log('\n[3] Triggering /conversations/sync-inbox...');
    const syncRes = await fetch(`${baseURL}/conversations/sync-inbox`, { method: 'POST' });
    const syncData = await syncRes.json() as any;
    console.log('Sync inbox result:', syncData);

    console.log('\n✅ All Inbound Replies API tests PASSED successfully!');
  } catch (err: any) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

testInboundRepliesApi();
