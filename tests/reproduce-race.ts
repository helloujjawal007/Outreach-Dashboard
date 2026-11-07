import { query } from '../server/src/config/db';

async function main() {
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  // 1. Insert temporary lead
  const testEmail = `race-test-${Date.now()}@example.com`;
  const insertRes = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, outreach_stage, status, consent_status)
     VALUES ('Race Condition Test Inc', $1, 'initial', 'active', 'none')
     RETURNING id`,
    [testEmail]
  );
  const leadId = insertRes.rows[0].id;
  console.log('Created test lead:', leadId, testEmail);

  try {
    // 2. Fire two parallel requests
    console.log('Firing 2 simultaneous POST /api/conversations/reply requests...');
    const p1 = fetch('http://localhost:5001/api/conversations/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId,
        channel: 'email',
        text: 'Hello from concurrent request 1',
      }),
    });

    const p2 = fetch('http://localhost:5001/api/conversations/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId,
        channel: 'email',
        text: 'Hello from concurrent request 2',
      }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    const body1 = await res1.json();
    const body2 = await res2.json();

    console.log(`Response 1: Status ${res1.status}`, body1);
    console.log(`Response 2: Status ${res2.status}`, body2);

    if (res1.status === 200 && res2.status === 200) {
      console.log('🚨 REPRODUCED RACE CONDITION: Both requests succeeded (HTTP 200)! Duplicate sends occurred.');
    } else if (res1.status === 409 || res2.status === 409) {
      console.log('✅ FIXED: One request claimed the lead and the other was rejected with HTTP 409 Conflict.');
    }
  } finally {
    // Clean up test lead
    await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = $1)`, [leadId]);
    await query(`DELETE FROM conversations WHERE lead_id = $1`, [leadId]);
    await query(`DELETE FROM leads WHERE id = $1`, [leadId]);
    console.log('Cleaned up test lead.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
