import fs from 'fs';
import path from 'path';
import http from 'http';
import { query } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';

async function runB15SecurityTest() {
  console.log('========================================================================');
  console.log('🛡️ B15: CALLBACK SECURITY & HEADER-FIRST DOS DEFENSE (5MB, 11MB, 50MB)');
  console.log('========================================================================\n');

  const testId = `b15_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  // 1. Create a test lead in DB
  const ins = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, audit_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'A', 'active', 'none', 'pending', NOW(), NOW())
     RETURNING id`,
    [`B15_Test_${testId}`, `b15_${testId}@testdomain.org`, `https://b15-${testId}.org`]
  );
  const leadId = ins.rows[0].id;
  const targetPort = process.env.PORT || 5001;
  const callbackUrl = `http://127.0.0.1:${targetPort}/api/audit-callback`;

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Valid-secret callback with good payload returning 200 & PDF written
    // -----------------------------------------------------------------------
    console.log('[Test 1] Valid-secret callback with valid payload -> Expect 200 & PDF written to disk...');
    // Create a 1 KB valid PDF buffer
    const validPdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 'v')]);
    const validBase64 = validPdfBuffer.toString('base64');

    const payloadGood = {
      leadId,
      status: 'ready',
      score: 88,
      takeaways: ['Valid finding 1', 'Valid finding 2'],
      pdf: validBase64,
    };

    const res1 = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': 'td-secret-key-2026',
      },
      body: JSON.stringify(payloadGood),
    });

    const res1Json = await res1.json();
    console.log(`✓ Response 1: HTTP ${res1.status} | Body:`, res1Json);

    if (res1.status !== 200) {
      throw new Error(`Test 1 Failed: Expected HTTP 200, got ${res1.status}`);
    }

    // Verify lead in DB has audit_status = 'ready' and valid audit_pdf_path
    const leadCheck1 = (await query<{ audit_status: string; audit_pdf_path: string }>(
      `SELECT audit_status, audit_pdf_path FROM leads WHERE id = $1`,
      [leadId]
    )).rows[0];

    if (leadCheck1.audit_status !== 'ready' || !leadCheck1.audit_pdf_path || !fs.existsSync(leadCheck1.audit_pdf_path)) {
      throw new Error(`Test 1 Failed: Lead audit_status is "${leadCheck1.audit_status}" or PDF file missing from disk`);
    }
    console.log(`✓ Lead audit_status updated to "ready", PDF written to: ${leadCheck1.audit_pdf_path} (${fs.statSync(leadCheck1.audit_pdf_path).size} bytes)`);
    console.log('✅ Test 1 Passed: Valid callback returned 200 and PDF stored safely on disk.\n');

    // -----------------------------------------------------------------------
    // TEST 2: 5 MB payload accepted with HTTP 200
    // -----------------------------------------------------------------------
    console.log('[Test 2] Valid-secret callback with 5 MB PDF payload -> Expect 200 accepted...');
    // Create 5 MB PDF buffer: 5 * 1024 * 1024
    const fiveMbPdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 - 10, 'm')]);
    const payload5Mb = {
      leadId,
      status: 'ready',
      score: 92,
      takeaways: ['5MB PDF stress test passed'],
      pdf: fiveMbPdfBuffer.toString('base64'),
    };

    const res2 = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': 'td-secret-key-2026',
      },
      body: JSON.stringify(payload5Mb),
    });

    console.log(`✓ Response 2: HTTP ${res2.status}`);
    if (res2.status !== 200) {
      throw new Error(`Test 2 Failed: Expected HTTP 200 for 5MB payload, got ${res2.status}`);
    }
    console.log('✅ Test 2 Passed: 5 MB payload accepted and processed cleanly.\n');

    // -----------------------------------------------------------------------
    // TEST 3: Unauthenticated 11 MB request rejected on header alone (HTTP 401)
    // -----------------------------------------------------------------------
    console.log('[Test 3] Unauthenticated 11 MB request (no secret header) -> Expect 401 BEFORE body read...');
    const payload11Mb = JSON.stringify({ leadId, padding: 'x'.repeat(11 * 1024 * 1024) });

    // Use native http to stream and verify response arrives immediately on header inspection
    const status11Mb = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: targetPort,
          path: '/api/audit-callback',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload11Mb),
            // NO secret header provided!
          },
        },
        (res) => {
          resolve(res.statusCode || 0);
        }
      );
      req.on('error', (e) => reject(e));
      req.write(payload11Mb.slice(0, 1024)); // Write only first chunk
      req.end();
    });

    console.log(`✓ Response 3: HTTP ${status11Mb} (Rejected immediately on header without reading 11 MB body)`);
    if (status11Mb !== 401) {
      throw new Error(`Test 3 Failed: Unauthenticated 11MB request returned ${status11Mb}, expected 401`);
    }
    console.log('✅ Test 3 Passed: 11 MB unauthenticated request rejected on header alone with 401.\n');

    // -----------------------------------------------------------------------
    // TEST 4: Unauthenticated 50 MB request rejected on header alone (HTTP 401)
    // -----------------------------------------------------------------------
    console.log('[Test 4] Unauthenticated 50 MB request (no secret header) -> Expect 401 BEFORE body read...');
    const fiftyMbLen = 50 * 1024 * 1024;

    const status50Mb = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: targetPort,
          path: '/api/audit-callback',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': fiftyMbLen,
            // NO secret header provided!
          },
        },
        (res) => {
          resolve(res.statusCode || 0);
        }
      );
      req.on('error', (e) => reject(e));
      req.write('{"leadId":"' + leadId + '"}'); // Send small first chunk
      req.end();
    });

    console.log(`✓ Response 4: HTTP ${status50Mb} (Rejected immediately on header without buffering 50 MB into RAM)`);
    if (status50Mb !== 401) {
      throw new Error(`Test 4 Failed: Unauthenticated 50MB request returned ${status50Mb}, expected 401`);
    }
    console.log('✅ Test 4 Passed: 50 MB unauthenticated request rejected on header alone with 401.\n');

    console.log('========================================================================');
    console.log('🎉 ALL B15 SECURITY & HEADER-FIRST DOS DEFENSE ASSERTIONS PASSED!');
    console.log('========================================================================\n');
  } finally {
    await query(`DELETE FROM leads WHERE id = $1`, [leadId]);
  }
}

runB15SecurityTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B15 Test Error:', err);
    process.exit(1);
  });

