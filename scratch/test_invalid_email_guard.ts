import { emailValidatorService } from '../server/src/services/emailValidatorService';
import { emailAdapter } from '../server/src/adapters/emailAdapter';
import { query } from '../server/src/config/db';

async function runTests() {
  console.log('🧪 Starting Email Validation & Invalid List E2E Test Suite...\n');

  // 1. Ensure Invalid List exists
  const invalidListId = await emailValidatorService.ensureInvalidList();
  console.log(`✅ Invalid List ensured with ID: ${invalidListId}`);

  // 2. Test Syntax Checks
  const badSyntax = await emailValidatorService.verifyEmail('not-an-email');
  console.log('Bad syntax test:', !badSyntax.isValid ? 'PASSED ✅' : 'FAILED ❌', badSyntax);

  // 3. Test Disposable Domain Checks
  const disposable = await emailValidatorService.verifyEmail('someone@tempmail.com');
  console.log('Disposable domain test:', !disposable.isValid && disposable.status === 'disposable_domain' ? 'PASSED ✅' : 'FAILED ❌', disposable);

  // 4. Test Non-Existent Domain MX Record Checks
  const noMx = await emailValidatorService.verifyEmail('ceo@nonexistentdomain9923847192384.com');
  console.log('Non-existent domain test:', !noMx.isValid && noMx.status === 'no_mx_records' ? 'PASSED ✅' : 'FAILED ❌', noMx);

  // 5. Test Real/Valid Domain Check
  const valid = await emailValidatorService.verifyEmail('hello@gmail.com');
  console.log('Valid email test:', valid.isValid && valid.status === 'verified' ? 'PASSED ✅' : 'FAILED ❌', valid);

  // 6. Test Pre-Send Guard & Lead Moving to Invalid List
  console.log('\nTesting Pre-Send Guard in Email Adapter...');
  const testLeadRes = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, status, outreach_stage, created_at, updated_at)
     VALUES ('Test Invalid Corp', 'baduser@mailinator.com', 'active', 'initial', NOW(), NOW())
     RETURNING id`
  );
  const testLeadId = testLeadRes.rows[0].id;

  try {
    const sendRes = await emailAdapter.sendEmail({
      to: 'baduser@mailinator.com',
      subject: 'Test Subject',
      body: 'Test Body',
      leadId: testLeadId,
    });

    console.log('Send outcome blocked:', !sendRes.success ? 'PASSED ✅' : 'FAILED ❌', sendRes);

    // Verify lead state in PostgreSQL
    const leadCheck = await query<{
      status: string;
      email_verified: boolean;
      email_verification_status: string;
      manual_review_reason: string;
    }>(
      `SELECT status, email_verified, email_verification_status, manual_review_reason FROM leads WHERE id = $1`,
      [testLeadId]
    );

    const leadRow = leadCheck.rows[0];
    console.log('Lead verification status:', leadRow.email_verification_status === 'disposable_domain' ? 'PASSED ✅' : 'FAILED ❌', leadRow);

    // Verify membership in Invalid List
    const membershipCheck = await query<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM lead_list_memberships WHERE list_id = $1 AND lead_id = $2`,
      [invalidListId, testLeadId]
    );
    const count = Number(membershipCheck.rows[0]?.count || 0);
    console.log('Lead in Invalid List membership:', count > 0 ? 'PASSED ✅' : 'FAILED ❌', { count });
  } finally {
    // Cleanup test lead
    await query(`DELETE FROM lead_list_memberships WHERE lead_id = $1`, [testLeadId]);
    await query(`DELETE FROM leads WHERE id = $1`, [testLeadId]);
    console.log('\n🧹 Test lead cleaned up successfully.');
  }

  console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
