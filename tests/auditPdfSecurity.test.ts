import assert from 'assert';

async function testPdfAndTokenSecurity() {
  console.log('Testing PDF exact match, traversal security, and token handling...');

  // 1. Login with new valid password
  const loginRes = await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const { token } = await loginRes.json();

  // Test A: General routes reject ?token= in URL
  const generalUrlRes = await fetch(`http://localhost:5001/api/leads?token=${encodeURIComponent(token)}`);
  assert.strictEqual(generalUrlRes.status, 401, 'General route must reject ?token= in URL query');
  console.log('✓ General route /api/leads rejected ?token= in URL query');

  // Test B: Exact filename matching on PDF download (BUG-01)
  const substringRes = await fetch(`http://localhost:5001/api/audit/download/a.pdf`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(substringRes.status, 404, 'a.pdf must return 404 Not Found (no fuzzy substring match)');
  console.log('✓ a.pdf returns 404 (loose substring match removed)');

  // Test C: Path traversal variants (%2e%2e%2f and ..%2f)
  const traversalRes1 = await fetch(`http://localhost:5001/api/audit/download/%2e%2e%2fpackage.json`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert(traversalRes1.status === 404 || traversalRes1.status === 403, 'Traversal %2e%2e%2f must be blocked');

  const traversalRes2 = await fetch(`http://localhost:5001/api/audit/download/..%2f..%2fpackage.json`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert(traversalRes2.status === 404 || traversalRes2.status === 403, 'Traversal ..%2f must be blocked');
  console.log('✓ Path traversal variants (%2e%2e%2f and ..%2f) are safely rejected');

  // Test D: Short-lived 60s file-scoped token
  const tokenGenRes = await fetch(`http://localhost:5001/api/audit/token/Technical_Audit_crunch_com.pdf`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(tokenGenRes.status, 200);
  const tokenData = await tokenGenRes.json();
  assert(tokenData.token, 'Must return scoped token');

  // Use scoped token on correct file
  const scopedFileRes = await fetch(`http://localhost:5001/api/audit/download/Technical_Audit_crunch_com.pdf?token=${encodeURIComponent(tokenData.token)}`);
  assert.strictEqual(scopedFileRes.status, 200, 'Scoped token must allow viewing the exact file');
  console.log('✓ 60s scoped token allows viewing exact intended PDF file');

  // Attempt using scoped token on a DIFFERENT file (cross-file tampering)
  const tamperRes = await fetch(`http://localhost:5001/api/audit/download/Technical_Audit_cbac_com.pdf?token=${encodeURIComponent(tokenData.token)}`);
  assert.strictEqual(tamperRes.status, 401, 'Scoped token must fail when used on a different file');
  console.log('✓ Scoped token correctly rejected when used to access a different file');

  // Test E: Logout and server-side token revocation
  const logoutRes = await fetch('http://localhost:5001/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout should succeed');

  // Verify revoked token is immediately rejected on subsequent requests
  const afterLogoutRes = await fetch('http://localhost:5001/api/leads', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(afterLogoutRes.status, 401, 'Revoked token must be rejected after logout');
  console.log('✓ Token revocation verified: revoked token rejected after logout');

  console.log('All audit PDF and token handling tests passed!');
}

testPdfAndTokenSecurity().catch(err => {
  console.error(err);
  process.exit(1);
});

