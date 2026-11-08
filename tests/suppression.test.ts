import { query } from '../server/src/config/db';
import { suppressionService } from '../server/src/services/suppressionService';
import { stageOutreachService } from '../server/src/services/stageOutreachService';

async function runSuppressionTests() {
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  console.log('=== TEST 1: Unsubscribe Link / Route Check ===');
  // Check if public GET /unsubscribe or POST /api/unsubscribe exists
  const unsubUrls = [
    'http://localhost:5001/unsubscribe',
    'http://localhost:5001/api/unsubscribe',
    'http://localhost:5001/api/suppression/unsubscribe',
  ];
  for (const url of unsubUrls) {
    const res = await fetch(url);
    console.log(`GET ${url} -> Status ${res.status}`);
  }

  console.log('\n=== TEST 2: Suppression Blocking Across Channels (Manual, Drip, Scheduled) ===');
  const targetEmail = `suppress-test-${Date.now()}@domain.org`;
  const insertLead = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, outreach_stage, status, consent_status)
     VALUES ('Suppression Target Corp', $1, 'initial', 'active', 'none')
     RETURNING id`,
    [targetEmail]
  );
  const leadId = insertLead.rows[0].id;
  console.log('Created lead:', leadId, targetEmail);

  // 1. Add email to global suppression list
  console.log('Adding to global suppression list...');
  const suppRes = await suppressionService.suppress({
    email: targetEmail,
    reason: 'Prospect requested unsubscribe via test',
    source: 'qa_suite',
  });
  console.log('Suppression result:', suppRes);

  // 2a. Test Channel 1: Manual Send via POST /api/conversations/reply
  const manualRes = await fetch('http://localhost:5001/api/conversations/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      leadId,
      channel: 'email',
      text: 'Testing manual send to suppressed lead',
    }),
  });
  const manualBody = await manualRes.json();
  console.log('Manual send result (POST /api/conversations/reply):', manualRes.status, manualBody);

  // 2b. Test Channel 2: Drip Engine dispatch via stageOutreachService.sendNextStageToLead
  const dripResult = await stageOutreachService.sendNextStageToLead(leadId);
  console.log('Drip engine dispatch result:', {
    success: dripResult.success,
    skipped: dripResult.skipped,
    reason: dripResult.reason,
  });

  // 2c. Test Channel 3: Scheduled Dispatch via POST /api/scheduler/schedule-single
  const schedRes = await fetch('http://localhost:5001/api/scheduler/schedule-single', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      leadId,
      channel: 'email',
      scheduledFor: new Date(Date.now() + 60000).toISOString(),
    }),
  });
  const schedBody = await schedRes.json();
  console.log('Scheduled dispatch result (POST /api/scheduler/schedule-single):', schedRes.status, schedBody);

  console.log('\n=== TEST 3: Suppression Survives Lead Delete / Restore ===');
  // Soft-delete lead
  await fetch(`http://localhost:5001/api/leads/${leadId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('Soft-deleted lead.');

  // Check suppression table
  let checkSupp = await suppressionService.isSuppressed({ email: targetEmail });
  console.log('Suppression status after soft-delete:', checkSupp);

  // Restore lead
  await query(`UPDATE leads SET deleted_at = NULL, deleted_expires_at = NULL, status = 'active' WHERE id = $1`, [leadId]);
  console.log('Restored lead.');

  checkSupp = await suppressionService.isSuppressed({ email: targetEmail });
  console.log('Suppression status after restore:', checkSupp);

  // Permanent-purge lead
  await fetch(`http://localhost:5001/api/leads/${leadId}/permanent`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('Permanently purged lead from leads table.');

  checkSupp = await suppressionService.isSuppressed({ email: targetEmail });
  console.log('Suppression status after permanent lead purge:', checkSupp);

  // Clean up global suppression entry
  await query(`DELETE FROM global_suppression_list WHERE email = $1`, [targetEmail]);
  console.log('Cleaned up test data.');
}

runSuppressionTests().catch(console.error).then(() => process.exit(0));

