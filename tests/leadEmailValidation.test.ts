import assert from 'assert';

async function testLeadEmailValidation() {
  console.log('Testing email validation in POST /api/leads...');

  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  // Test 1: Invalid email syntax should be rejected with 400
  const invalidRes = await fetch('http://localhost:5001/api/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      businessName: 'QA Invalid Email Co',
      email: 'not-a-valid-email',
    }),
  });

  assert.strictEqual(invalidRes.status, 400, 'Invalid email syntax must return 400 Bad Request');
  const invalidBody = await invalidRes.json();
  assert.strictEqual(invalidBody.error, 'Invalid email address');
  console.log('✓ Invalid email correctly rejected with 400 "Invalid email address"');

  // Test 2: Valid email syntax should succeed with 201
  const uniqueEmail = `valid-test-${Date.now()}@example.com`;
  const validRes = await fetch('http://localhost:5001/api/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      businessName: 'QA Valid Email Co',
      email: uniqueEmail,
    }),
  });

  assert.strictEqual(validRes.status, 201, 'Valid email must return 201 Created');
  const validBody = await validRes.json();
  const createdId = validBody.lead.id;
  console.log('✓ Valid email lead created successfully (201 Created)');

  // Cleanup created lead
  await fetch(`http://localhost:5001/api/leads/${createdId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('✓ Cleaned up test lead');

  console.log('All lead email validation tests passed!');
}

testLeadEmailValidation().catch(err => {
  console.error(err);
  process.exit(1);
});

