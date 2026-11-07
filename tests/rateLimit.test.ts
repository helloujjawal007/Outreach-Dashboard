import assert from 'assert';

async function testRateLimit() {
  console.log('Testing login rate limiter on POST /api/auth/login...');

  const results: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const res = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: `wrong-pass-${i}` }),
    });
    results.push(res.status);
    console.log(`Attempt ${i}: Status ${res.status}`);
  }

  // The first 5 should be 401 (Invalid passphrase)
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(results[i], 401, `Attempt ${i + 1} should be 401`);
  }

  // The 6th should be 429 (Too Many Requests)
  assert.strictEqual(results[5], 429, 'Attempt 6 should be 429 (Rate limited)');
  console.log('✅ Rate limiting verified: 5 failed attempts per 15 min returned 429 on the 6th attempt.');
}

testRateLimit().catch(err => {
  console.error(err);
  process.exit(1);
});

