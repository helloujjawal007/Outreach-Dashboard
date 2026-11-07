import { query } from '../server/src/config/db';
import { generateSessionToken, revokeToken, isTokenRevoked } from '../server/src/middleware/auth';

async function runAuthTests() {
  console.log('=== TEST 1: Logout Invalidates Token ===');
  // 1. Log in
  const loginRes = await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Obtained token:', token ? '[REDACTED_TOKEN]' : 'none');

  // Verify token works on /api/auth/me
  const meBefore = await fetch('http://localhost:5001/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('GET /api/auth/me BEFORE logout:', meBefore.status, await meBefore.json());

  // Call POST /api/auth/logout
  const logoutRes = await fetch('http://localhost:5001/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('POST /api/auth/logout status:', logoutRes.status, await logoutRes.json());

  // Verify token is rejected after logout
  const meAfter = await fetch('http://localhost:5001/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('GET /api/auth/me AFTER logout:', meAfter.status, await meAfter.json());

  console.log('\n=== TEST 2: Expired Token Rejection ===');
  // Construct an expired token (exp in the past)
  const expiredPayload = Buffer.from(JSON.stringify({
    role: 'admin',
    exp: Date.now() - 3600000, // 1 hour ago
    nonce: 'expired_nonce',
  })).toString('base64url');
  
  // Sign it with valid secret using node:crypto
  const crypto = await import('node:crypto');
  const secret = process.env.SESSION_SECRET || 'ods_master_session_secret_2026_key!';
  const sig = crypto.createHmac('sha256', secret).update(expiredPayload).digest('base64url');
  const expiredToken = `${expiredPayload}.${sig}`;

  const expiredRes = await fetch('http://localhost:5001/api/auth/me', {
    headers: { 'Authorization': `Bearer ${expiredToken}` },
  });
  console.log('GET /api/auth/me with EXPIRED token:', expiredRes.status, await expiredRes.json());

  console.log('\n=== TEST 3: ?token= Leakage in Server Logs ===');
  // Make a request with query token to /api/audit/download
  const testUrl = `http://localhost:5001/api/audit/download/nonexistent.pdf?token=LEAKED_SECRET_TOKEN_VALUE`;
  const leakRes = await fetch(testUrl);
  console.log('GET request with ?token= sent. Response status:', leakRes.status);
  console.log('Checking server console logging (server/src/index.ts lines 150-154 logs req.path vs req.originalUrl)...');

  console.log('\n=== TEST 4: Encoded Path Traversal on /api/audit/download ===');
  const traversalVariants = [
    'http://localhost:5001/api/audit/download/..%2fpackage.json',
    'http://localhost:5001/api/audit/download/%2e%2e%2fpackage.json',
    'http://localhost:5001/api/audit/download/%2e%2e%2f%2e%2e%2fpackage.json',
    'http://localhost:5001/api/audit/download/....//package.json',
  ];

  for (const url of traversalVariants) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log(`URL: ${url} -> Status: ${res.status}`);
  }
}

runAuthTests().catch(console.error).then(() => process.exit(0));

