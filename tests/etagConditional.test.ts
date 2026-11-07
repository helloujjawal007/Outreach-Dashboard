import assert from 'assert';

async function testEtagPerformance() {
  console.log('Testing ETag / conditional request optimization on /api/leads...');

  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  // 1. Initial request to /api/leads
  const res1 = await fetch('http://localhost:5001/api/leads', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert.strictEqual(res1.status, 200);
  const etag = res1.headers.get('ETag');
  assert(etag, 'Response must include ETag header');
  console.log('✓ Initial request returned HTTP 200 with ETag:', etag);

  // 2. Subsequent conditional request with If-None-Match
  const res2 = await fetch('http://localhost:5001/api/leads', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'If-None-Match': etag,
    },
  });
  assert.strictEqual(res2.status, 304, 'Conditional request must return 304 Not Modified when leads unchanged');
  const bodyText = await res2.text();
  assert.strictEqual(bodyText, '', '304 response body must be empty (0 bytes transferred)');
  console.log('✓ Conditional polling request returned HTTP 304 Not Modified (0 bytes transferred)');

  console.log('All ETag / conditional request tests passed!');
}

testEtagPerformance().catch(err => {
  console.error(err);
  process.exit(1);
});

