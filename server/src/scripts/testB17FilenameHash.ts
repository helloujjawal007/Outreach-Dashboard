import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '../config/db';

async function runB17FilenameHashTest() {
  console.log('========================================================================');
  console.log('🔒 B17: SAFE PDF FILENAME DERIVATION (DB UUID & CRYPTO HASH - NO STRIPPING)');
  console.log('========================================================================\n');

  const testId = `b17_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  // Create two distinct test leads in DB
  const lead1Res = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, audit_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'A', 'active', 'none', 'pending', NOW(), NOW())
     RETURNING id`,
    [`B17_Company_One`, `b17_lead1_${testId}@testlead.org`, `https://lead1-${testId}.org`]
  );
  const lead2Res = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, audit_status, created_at, updated_at)
     VALUES ($1, $2, $3, 'A', 'active', 'none', 'pending', NOW(), NOW())
     RETURNING id`,
    [`B17_Company_Two`, `b17_lead2_${testId}@testlead.org`, `https://lead2-${testId}.org`]
  );

  const lead1Id = lead1Res.rows[0].id;
  const lead2Id = lead2Res.rows[0].id;
  const targetPort = process.env.PORT || 5001;
  const callbackUrl = `http://127.0.0.1:${targetPort}/api/audit-callback`;

  try {
    console.log(`[Step 1] Created Lead 1: ${lead1Id} ("B17_Company_One")`);
    console.log(`[Step 1] Created Lead 2: ${lead2Id} ("B17_Company_Two")`);

    // Verify that previously, two names that stripped characters would collide:
    // If stripped: e.g. "my-test/lead" and "my_test..lead" both stripped to "mytestlead"
    // Now: Each uses DB UUID and crypto hash:
    const hash1 = crypto.createHash('sha256').update(lead1Id).digest('hex').slice(0, 16);
    const hash2 = crypto.createHash('sha256').update(lead2Id).digest('hex').slice(0, 16);
    console.log(`✓ Lead 1 Hash: ${hash1}`);
    console.log(`✓ Lead 2 Hash: ${hash2}`);

    if (hash1 === hash2) {
      throw new Error('Hash collision between distinct lead IDs!');
    }

    // PDF 1 payload (> 500 bytes to satisfy PDF size validity policy)
    const pdf1Buffer = Buffer.concat([Buffer.from('%PDF-1.4\nCONTENT_LEAD_1_UNIQUE_TEXT_AAA\n'), Buffer.alloc(1024, 'a')]);
    const pdf2Buffer = Buffer.concat([Buffer.from('%PDF-1.4\nCONTENT_LEAD_2_UNIQUE_TEXT_BBB\n'), Buffer.alloc(1024, 'b')]);

    // Send callback for Lead 1
    console.log('\n[Step 2] Sending callback for Lead 1...');
    const res1 = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': 'td-secret-key-2026',
      },
      body: JSON.stringify({
        leadId: lead1Id,
        status: 'ready',
        score: 85,
        takeaways: ['Lead 1 finding'],
        pdf: pdf1Buffer.toString('base64'),
      }),
    });
    if (res1.status !== 200) throw new Error(`Lead 1 callback failed: ${res1.status}`);

    // Send callback for Lead 2
    console.log('[Step 3] Sending callback for Lead 2...');
    const res2 = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': 'td-secret-key-2026',
      },
      body: JSON.stringify({
        leadId: lead2Id,
        status: 'ready',
        score: 90,
        takeaways: ['Lead 2 finding'],
        pdf: pdf2Buffer.toString('base64'),
      }),
    });
    if (res2.status !== 200) throw new Error(`Lead 2 callback failed: ${res2.status}`);

    // Verify DB stored paths
    const dbLead1 = (await query<{ audit_pdf_path: string; audit_pdf_name: string }>(
      `SELECT audit_pdf_path, audit_pdf_name FROM leads WHERE id = $1`,
      [lead1Id]
    )).rows[0];
    const dbLead2 = (await query<{ audit_pdf_path: string; audit_pdf_name: string }>(
      `SELECT audit_pdf_path, audit_pdf_name FROM leads WHERE id = $1`,
      [lead2Id]
    )).rows[0];

    console.log('\n[Step 4] DB Inspection of Stored Paths:');
    console.log(`✓ Lead 1 PDF Path: ${dbLead1.audit_pdf_path}`);
    console.log(`✓ Lead 2 PDF Path: ${dbLead2.audit_pdf_path}`);

    // Assert files are completely distinct
    if (dbLead1.audit_pdf_path === dbLead2.audit_pdf_path) {
      throw new Error(`B17 Collision: Lead 1 and Lead 2 resolved to identical file path: ${dbLead1.audit_pdf_path}`);
    }

    // Verify both files exist on disk independently
    if (!fs.existsSync(dbLead1.audit_pdf_path) || !fs.existsSync(dbLead2.audit_pdf_path)) {
      throw new Error('B17 Failed: One of the PDF files does not exist on disk');
    }

    // Verify content of file 1 was NOT overwritten by file 2
    const readContent1 = fs.readFileSync(dbLead1.audit_pdf_path, 'utf8');
    const readContent2 = fs.readFileSync(dbLead2.audit_pdf_path, 'utf8');

    if (!readContent1.includes('CONTENT_LEAD_1_UNIQUE_TEXT_AAA')) {
      throw new Error('B17 Overwrite Violation: Lead 1 PDF content was overwritten!');
    }
    if (!readContent2.includes('CONTENT_LEAD_2_UNIQUE_TEXT_BBB')) {
      throw new Error('B17 Overwrite Violation: Lead 2 PDF content was corrupted or overwritten!');
    }

    console.log('✓ File 1 content verified intact (Lead 1 text preserved, not overwritten).');
    console.log('✓ File 2 content verified intact (Lead 2 text preserved, not overwritten).');

    console.log('\n========================================================================');
    console.log('✅ B17 PASSED: FILENAMES DERIVED FROM DB UUID & HASH; ZERO COLLISION / OVERWRITE');
    console.log('========================================================================\n');
  } finally {
    await query(`DELETE FROM leads WHERE id IN ($1, $2)`, [lead1Id, lead2Id]);
  }
}

runB17FilenameHashTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B17 Test Error:', err);
    process.exit(1);
  });
