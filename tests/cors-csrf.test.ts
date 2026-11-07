async function runCorsTests() {
  // 1. Log in to get session cookie
  const loginRes = await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const token = (await loginRes.json()).token;
  console.log('Set-Cookie received:', cookieHeader ? cookieHeader.split(';')[0] : 'none');

  console.log('\n=== TEST 1: Cross-Origin Preflight (OPTIONS) with Origin: http://evil.com ===');
  const preflightRes = await fetch('http://localhost:5001/api/leads', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://evil.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization',
    },
  });
  console.log('Preflight status:', preflightRes.status);
  console.log('Access-Control-Allow-Origin:', preflightRes.headers.get('access-control-allow-origin'));
  console.log('Access-Control-Allow-Credentials:', preflightRes.headers.get('access-control-allow-credentials'));

  console.log('\n=== TEST 2: Cross-Origin State-Changing Request (POST /api/leads) with Session Cookie ===');
  const cookieStr = `ods_session=${token}`;
  const crossOriginRes = await fetch('http://localhost:5001/api/leads', {
    method: 'POST',
    headers: {
      'Origin': 'http://evil.com',
      'Content-Type': 'application/json',
      'Cookie': cookieStr,
    },
    body: JSON.stringify({
      businessName: 'CSRF Exploit Target',
      email: 'csrf-target@domain.org',
    }),
  });
  const crossOriginBody = await crossOriginRes.json();
  console.log('State-changing POST status:', crossOriginRes.status);
  console.log('Response body:', crossOriginBody);
  console.log('Response Access-Control-Allow-Origin:', crossOriginRes.headers.get('access-control-allow-origin'));
  console.log('Response Access-Control-Allow-Credentials:', crossOriginRes.headers.get('access-control-allow-credentials'));

  if (crossOriginBody.success && crossOriginBody.lead?.id) {
    console.log('🚨 VULNERABILITY CONFIRMED: Cross-origin request succeeded using session cookie without CSRF token!');
    // Clean up
    await fetch(`http://localhost:5001/api/leads/${crossOriginBody.lead.id}/permanent`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log('Cleaned up exploit lead.');
  }
}

runCorsTests().catch(console.error).then(() => process.exit(0));

