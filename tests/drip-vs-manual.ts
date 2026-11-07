import { query } from '../server/src/config/db';
import { stageOutreachService } from '../server/src/services/stageOutreachService';

async function main() {
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  const testEmail = `drip-manual-race-${Date.now()}@example.com`;
  const insertRes = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, outreach_stage, status, consent_status)
     VALUES ('Drip Manual Race Ltd', $1, 'initial', 'active', 'none')
     RETURNING id`,
    [testEmail]
  );
  const leadId = insertRes.rows[0].id;
  console.log('Created test lead:', leadId, testEmail);

  try {
    console.log('Firing concurrent: manual POST /api/conversations/reply vs stageOutreachService.sendNextStageToLead...');
    
    // Concurrent 1: API manual reply
    const manualPromise = fetch('http://localhost:5001/api/conversations/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId,
        channel: 'email',
        text: 'Manual send concurrent test',
      }),
    }).then(async r => ({ type: 'manual', status: r.status, body: await r.json() }));

    // Concurrent 2: Drip engine dispatch
    const dripPromise = stageOutreachService.sendNextStageToLead(leadId, 'initial')
      .then(result => ({ type: 'drip', status: 200, body: result }))
      .catch(err => ({ type: 'drip', status: 500, body: { error: err.message } }));

    const [resManual, resDrip] = await Promise.all([manualPromise, dripPromise]);

    console.log('Manual send result:', resManual);
    console.log('Drip send result:', resDrip);

    const manualConflict = resManual.status === 409;
    const dripConflict = (resDrip.body as any)?.reason?.includes('Conflict') || (resDrip.body as any)?.skipped === true;

    if (manualConflict || dripConflict) {
      console.log('✅ PASS: Atomic claim prevented collision between drip engine and manual send.');
    } else {
      console.log('🚨 FAIL: Both executions proceeded concurrently without atomic lockout.');
    }
  } finally {
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

