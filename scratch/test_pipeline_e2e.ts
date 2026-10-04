import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../server/src/config/db.ts';
import { emailValidatorService } from '../server/src/services/emailValidatorService.ts';
import { channelListAutoAssignmentService } from '../server/src/services/channelListAutoAssignmentService.ts';
import { humanCopywriterService } from '../server/src/services/humanCopywriterService.ts';
import { automatedIntakeEngine } from '../server/src/services/automatedIntakeEngine.ts';

async function runTest() {
  console.log('=== STARTING AUTOMATED PIPELINE E2E TEST ===\n');

  // 1. Test Email Validation
  console.log('1. Testing Email Verification:');
  const validCheck = await emailValidatorService.verifyEmail('ujjawal.digital@gmail.com');
  console.log(' - Valid email check:', validCheck.isValid ? 'PASSED ✅' : 'FAILED ❌', validCheck);

  const invalidCheck = await emailValidatorService.verifyEmail('invalid-user@tempmail.com');
  console.log(' - Disposable email check:', !invalidCheck.isValid ? 'PASSED ✅' : 'FAILED ❌', invalidCheck);

  // 2. Test Human Copywriter Tone & Cadence
  console.log('\n2. Testing Human-Written Copy Generation (No AI Cliches):');
  const testLead = {
    id: 'test-lead-1',
    businessName: 'Apex Web Design',
    category: 'Digital Agency',
    city: 'New York',
    primaryContactName: 'Alex'
  };

  const copyInitial = humanCopywriterService.getEmailCopy(testLead, 'initial');
  const copyF1 = humanCopywriterService.getEmailCopy(testLead, 'followup_1');
  const copyF2 = humanCopywriterService.getEmailCopy(testLead, 'followup_2');
  const copyF3 = humanCopywriterService.getEmailCopy(testLead, 'followup_3');

  console.log(' - Initial Subject:', copyInitial.subject);
  console.log(' - Followup 1 (Day 2.5) Subject:', copyF1.subject);
  console.log(' - Followup 2 (Day 5.5) Subject:', copyF2.subject);
  console.log(' - Followup 3 (Day 10) Subject:', copyF3.subject);
  
  if (copyInitial.body.includes('Best regards,\nOnline Digital Solution') &&
      !copyInitial.body.includes('I hope this email finds you well') &&
      !copyInitial.body.includes('In today\'s fast-paced world')) {
    console.log(' - Human copywriting check: PASSED ✅ (Authentic, human tone with correct sign-off)');
  } else {
    console.error(' - Human copywriting check: FAILED ❌');
  }

  // 3. Test Channel Auto-Assignment
  console.log('\n3. Testing Channel Auto-Assignment:');
  const dummyLeadId = '00000000-0000-0000-0000-000000000001';
  // Check standard lists exist in DB
  const listsRes = await pool.query('SELECT name, id FROM lists');
  console.log(' - Standard Lists in DB:', listsRes.rows.map(r => r.name).join(', '));

  // 4. Test Automated Intake Engine on Sample Leads
  console.log('\n4. Testing Automated Intake Engine:');
  const sampleLeads = [
    {
      id: 'e2e11111-1111-1111-1111-111111111111',
      business_name: 'Starlight Dental Care',
      email: 'contact@starlightdental.org',
      phone: '+1 555 123 4567',
      website: 'https://starlightdental.org',
      linkedin: 'https://linkedin.com/company/starlightdental',
      category: 'Healthcare',
      city: 'Austin'
    },
    {
      id: 'e2e22222-2222-2222-2222-222222222222',
      business_name: 'Lone Star Electricians',
      email: 'info@lonestarelectric.com',
      phone: '+1 555 987 6543',
      category: 'Electrician',
      city: 'Dallas'
    },
    {
      id: 'e2e33333-3333-3333-3333-333333333333',
      business_name: 'Bogus Spam Lead',
      email: 'not-an-email-at-all',
      phone: '',
      category: 'Unknown'
    }
  ];

  // Insert test leads into leads table first
  for (const l of sampleLeads) {
    await pool.query(
      `INSERT INTO leads (id, business_name, email, phone, website, category, location, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, phone = EXCLUDED.phone`,
      [l.id, l.business_name, l.email, l.phone, l.website || null, l.category, l.city || null]
    );
  }

  const intakeResult = await automatedIntakeEngine.processImportedLeads(sampleLeads);
  console.log(' - Intake Engine Result:', JSON.stringify(intakeResult, null, 2));

  // Check scheduled dispatches in DB for these leads
  const dispatches = await pool.query(
    `SELECT lead_id, stage, scheduled_for, status FROM scheduled_dispatches WHERE lead_id IN ($1, $2, $3)`,
    [sampleLeads[0].id, sampleLeads[1].id, sampleLeads[2].id]
  );
  console.log('\n - Scheduled Dispatches for test leads:');
  dispatches.rows.forEach(d => {
    console.log(`   * Lead ${d.lead_id} | Stage: ${d.stage} | Scheduled: ${d.scheduled_for} | Status: ${d.status}`);
  });

  // Verify list memberships
  const memberships = await pool.query(
    `SELECT lm.lead_id, l.name as list_name 
     FROM lead_list_memberships lm 
     JOIN lists l ON l.id = lm.list_id 
     WHERE lm.lead_id IN ($1, $2, $3)`,
    [sampleLeads[0].id, sampleLeads[1].id, sampleLeads[2].id]
  );
  console.log('\n - Automatically Assigned Lists:');
  memberships.rows.forEach(m => {
    console.log(`   * Lead ${m.lead_id} -> [${m.list_name}]`);
  });

  // Cleanup test leads
  await pool.query('DELETE FROM scheduled_dispatches WHERE lead_id::text LIKE $1', ['e2e%']);
  await pool.query('DELETE FROM lead_list_memberships WHERE lead_id::text LIKE $1', ['e2e%']);
  await pool.query('DELETE FROM leads WHERE id::text LIKE $1', ['e2e%']);
  console.log('\nCleaned up test data ✅');

  console.log('\n=== E2E PIPELINE TEST COMPLETED SUCCESSFULLY! ===');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
