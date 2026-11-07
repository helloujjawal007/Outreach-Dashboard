import { query } from '../server/src/config/db';

async function runSchedulerTests() {
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  // Insert a test lead for scheduling
  const insertLead = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, outreach_stage, status, consent_status)
     VALUES ('Scheduler Time Corp', 'sched-test@domain.org', 'initial', 'active', 'none')
     RETURNING id`
  );
  const leadId = insertLead.rows[0].id;

  try {
    console.log('=== TEST 1: Invalid Date String (Expect 400, not 500 DB error) ===');
    const invalidDateRes = await fetch('http://localhost:5001/api/scheduler/schedule-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId,
        channel: 'email',
        scheduledFor: 'not-a-valid-date-string-1234',
      }),
    });
    const invalidDateBody = await invalidDateRes.json();
    console.log(`Status: ${invalidDateRes.status}`, invalidDateBody);

    console.log('\n=== TEST 2: Non-UTC Client Timezone (e.g. US Eastern EDT -04:00) ===');
    // Client in New York sends 2:30 PM EDT (14:30 -04:00) -> UTC is 18:30:00Z
    const nonUtcTime = '2026-10-15T14:30:00-04:00';
    const nonUtcRes = await fetch('http://localhost:5001/api/scheduler/schedule-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId,
        channel: 'email',
        scheduledFor: nonUtcTime,
      }),
    });
    const nonUtcBody = await nonUtcRes.json();
    console.log(`Status: ${nonUtcRes.status}`, nonUtcBody);

    // Verify stored timestamp in DB
    if (nonUtcBody.dispatchId) {
      const dbRow = await query<{ scheduled_for: string }>(
        `SELECT scheduled_for FROM scheduled_dispatches WHERE id = $1`,
        [nonUtcBody.dispatchId]
      );
      console.log('Stored DB Timestamp (TIMESTAMPTZ):', dbRow.rows[0]?.scheduled_for);
      console.log('Expected UTC (18:30:00.000Z):', new Date(nonUtcTime).toISOString());
    }

    console.log('\n=== TEST 3: Across DST Change Boundary ===');
    // In US, DST ends on Sunday Nov 1, 2026.
    // 2026-10-31 10:00:00 EDT (-04:00) -> UTC is 14:00:00Z
    // 2026-11-02 10:00:00 EST (-05:00) -> UTC is 15:00:00Z
    const preDst = '2026-10-31T10:00:00-04:00';
    const postDst = '2026-11-02T10:00:00-05:00';

    const resPre = await fetch('http://localhost:5001/api/scheduler/schedule-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ leadId, channel: 'email', scheduledFor: preDst }),
    });
    const bodyPre = await resPre.json();

    const resPost = await fetch('http://localhost:5001/api/scheduler/schedule-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ leadId, channel: 'email', scheduledFor: postDst }),
    });
    const bodyPost = await resPost.json();

    console.log('Pre-DST Dispatch ID:', bodyPre.dispatchId, 'ScheduledFor:', bodyPre.scheduledFor);
    console.log('Post-DST Dispatch ID:', bodyPost.dispatchId, 'ScheduledFor:', bodyPost.scheduledFor);

  } finally {
    await query(`DELETE FROM scheduled_dispatches WHERE lead_id = $1`, [leadId]);
    await query(`DELETE FROM leads WHERE id = $1`, [leadId]);
    console.log('Cleaned up test data.');
  }
}

runSchedulerTests().catch(console.error).then(() => process.exit(0));

