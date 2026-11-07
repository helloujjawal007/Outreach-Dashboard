import assert from 'assert';

async function testHealthEndpoint() {
  console.log('Testing public vs authenticated /api/health endpoint...');

  // 1. Unauthenticated request must return only { status: "ok" }
  const publicRes = await fetch('http://localhost:5001/api/health');
  assert.strictEqual(publicRes.status, 200);
  const publicData = await publicRes.json();
  assert.deepStrictEqual(publicData, { status: 'ok' }, 'Public health response must only be { status: "ok" }');
  assert(!publicData.system, 'Must not expose internal system details to public');
  assert(!publicData.health, 'Must not expose bounce/deliverability rates to public');
  console.log('✓ Public /api/health returns only { status: "ok" }');

  // 2. Authenticated request must return full diagnostics
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  const authRes = await fetch('http://localhost:5001/api/health', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(authRes.status, 200);
  const authData = await authRes.json();
  assert(authData.success, 'Authenticated response must have success: true');
  assert(authData.health, 'Authenticated response must have health data');
  assert(authData.system, 'Authenticated response must have system status');
  console.log('✓ Authenticated /api/health returns complete deliverability & system metrics');

  console.log('All health endpoint tests passed!');
}

testHealthEndpoint().catch(err => {
  console.error(err);
  process.exit(1);
});

