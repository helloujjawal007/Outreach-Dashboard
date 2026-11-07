import fs from 'fs';
import path from 'path';
import { query } from '../config/db';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { failureLogService } from '../services/failureLogService';

async function runB20RealPathsTest() {
  console.log('========================================================================');
  console.log('💥 B20: TRIGGERING ALL 5 FAILURE TYPES THROUGH REAL SYSTEM CODE PATHS');
  console.log('========================================================================\n');

  const testId = `b20_${Date.now()}`;
  const targetPort = process.env.PORT || 5001;
  const callbackUrl = `http://127.0.0.1:${targetPort}/api/audit-callback`;
  const createdLeadIds: string[] = [];

  try {
    // Set mock TD endpoint so rolling audit dispatcher doesn't run local auto-audit
    await fiveSlotSenderService.updateSettings({
      td_endpoint_url: 'https://td-mock.test/api/audit',
      slot_cycle_min: 10,
      slot_offset_min: 2,
      max_audit_retries: 3,
    });
    fiveSlotSenderService.resetLastSlotSent();

    // -------------------------------------------------------------------------
    // 1. REAL PATH FOR SEND_FAILED (SMTP Rejection / Hard Bounce)
    // -------------------------------------------------------------------------
    console.log('[Path 1] Triggering SEND_FAILED via real SMTP dispatch failure handler:');
    const lead1Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'sending', NOW(), NOW())
       RETURNING id`,
      [`${testId}_Send_Fail_Co`, `bounce_${testId}@invalid-domain.test`, `https://sendfail-${testId}.org`]
    );
    const lead1Id = lead1Res.rows[0].id;
    createdLeadIds.push(lead1Id);

    // Call real dispatcher failure handler (invoked by emailAdapter error during dispatch)
    await fiveSlotSenderService.handleDispatchFailure(
      {
        id: lead1Id,
        business_name: `${testId}_Send_Fail_Co`,
        website: `https://sendfail-${testId}.org`,
        email: `bounce_${testId}@invalid-domain.test`,
        outreach_stage: 'initial',
      },
      'initial',
      'A',
      '550 5.1.1 Recipient address rejected: User unknown'
    );

    const log1 = await query<{ type: string; error_message: string }>(
      `SELECT type, error_message FROM failure_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [lead1Id]
    );
    console.log(`✓ SEND_FAILED recorded in DB: type="${log1.rows[0]?.type}", error="${log1.rows[0]?.error_message}"`);
    if (log1.rows[0]?.type !== 'SEND_FAILED') throw new Error('Path 1 failed');
    console.log('✅ Path 1 Passed: SEND_FAILED logged through real SMTP failure handler.\n');

    // -------------------------------------------------------------------------
    // 2. REAL PATH FOR AUDIT_FAILED (TD Reports Crawl Error via Callback)
    // -------------------------------------------------------------------------
    console.log('[Path 2] Triggering AUDIT_FAILED via real POST /api/audit-callback error status:');
    const lead2Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, audit_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'B', 'active', 'none', 'pending', NOW(), NOW())
       RETURNING id`,
      [`${testId}_Audit_Fail_Co`, `auditfail_${testId}@testlead.org`, `https://auditfail-${testId}.org`]
    );
    const lead2Id = lead2Res.rows[0].id;
    createdLeadIds.push(lead2Id);

    const res2 = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': 'td-secret-key-2026',
      },
      body: JSON.stringify({
        leadId: lead2Id,
        status: 'failed',
        error: 'Crawl failure: DNS NXDOMAIN - Host unreachable',
      }),
    });
    console.log(`✓ Callback responded with HTTP ${res2.status}`);

    const log2 = await query<{ type: string; error_message: string }>(
      `SELECT type, error_message FROM failure_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [lead2Id]
    );
    console.log(`✓ AUDIT_FAILED recorded in DB: type="${log2.rows[0]?.type}", error="${log2.rows[0]?.error_message}"`);
    if (log2.rows[0]?.type !== 'AUDIT_FAILED') throw new Error('Path 2 failed');
    console.log('✅ Path 2 Passed: AUDIT_FAILED logged through real TD callback endpoint.\n');

    // -------------------------------------------------------------------------
    // 3. REAL PATH FOR AUDIT_TIMEOUT (Scheduler Exceeds Max Retries)
    // -------------------------------------------------------------------------
    console.log('[Path 3] Triggering AUDIT_TIMEOUT via real slot turn retry expiration:');
    const lead3Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, audit_retry_count, audit_requested_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'C', 'active', 'none', 'initial', 'pending', 2, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes', NOW())
       RETURNING id`,
      [`${testId}_Timeout_Co`, `timeout_${testId}@testlead.org`, `https://timeout-${testId}.org`]
    );
    const lead3Id = lead3Res.rows[0].id;
    createdLeadIds.push(lead3Id);

    // Pause other leads
    await query(`UPDATE leads SET status = 'paused' WHERE id != $1 AND status = 'active'`, [lead3Id]);

    // Process tick for Slot C (at offset :04)
    const tickTimeC = new Date('2026-03-01T10:04:00Z');
    await fiveSlotSenderService.processGlobalTick(tickTimeC);

    const log3 = await query<{ type: string; error_message: string }>(
      `SELECT type, error_message FROM failure_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [lead3Id]
    );
    console.log(`✓ AUDIT_TIMEOUT recorded in DB: type="${log3.rows[0]?.type}", error="${log3.rows[0]?.error_message}"`);
    if (log3.rows[0]?.type !== 'AUDIT_TIMEOUT') throw new Error('Path 3 failed');
    console.log('✅ Path 3 Passed: AUDIT_TIMEOUT logged through real scheduler retry gate.\n');

    // -------------------------------------------------------------------------
    // 4. REAL PATH FOR PDF_MISSING (Status is "ready" but PDF Missing on Disk)
    // -------------------------------------------------------------------------
    console.log('[Path 4] Triggering PDF_MISSING via real scheduler missing-file gate:');
    const lead4Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, audit_findings, audit_pdf_path, audit_retry_count, created_at, updated_at)
       VALUES ($1, $2, $3, 'D', 'active', 'none', 'initial', 'ready', $4, $5, 2, NOW() - INTERVAL '30 minutes', NOW())
       RETURNING id`,
      [
        `${testId}_Ghost_PDF_Co`,
        `ghostpdf_${testId}@testlead.org`,
        `https://ghostpdf-${testId}.org`,
        JSON.stringify(['Finding 1']),
        path.resolve(process.cwd(), 'server', 'data', 'audits', 'non_existent_ghost_report.pdf'),
      ]
    );
    const lead4Id = lead4Res.rows[0].id;
    createdLeadIds.push(lead4Id);

    await query(`UPDATE leads SET status = 'paused' WHERE id != $1 AND status = 'active'`, [lead4Id]);

    // Process tick for Slot D (at offset :06)
    const tickTimeD = new Date('2026-03-01T10:06:00Z');
    await fiveSlotSenderService.processGlobalTick(tickTimeD);

    const log4 = await query<{ type: string; error_message: string }>(
      `SELECT type, error_message FROM failure_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [lead4Id]
    );
    console.log(`✓ PDF_MISSING recorded in DB: type="${log4.rows[0]?.type}", error="${log4.rows[0]?.error_message}"`);
    if (log4.rows[0]?.type !== 'PDF_MISSING') throw new Error('Path 4 failed');
    console.log('✅ Path 4 Passed: PDF_MISSING logged through real scheduler asset validator.\n');

    // -------------------------------------------------------------------------
    // 5. REAL PATH FOR REPORT_DELIVERY_FAILED (TD Delivery Failed Callback / Watchdog)
    // -------------------------------------------------------------------------
    console.log('[Path 5] Triggering REPORT_DELIVERY_FAILED via real TD delivery_failed callback status:');
    const lead5Res = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, audit_status, created_at, updated_at)
       VALUES ($1, $2, $3, 'E', 'active', 'none', 'pending', NOW(), NOW())
       RETURNING id`,
      [`${testId}_Delivery_Fail_Co`, `deliveryfail_${testId}@testlead.org`, `https://deliveryfail-${testId}.org`]
    );
    const lead5Id = lead5Res.rows[0].id;
    createdLeadIds.push(lead5Id);

    const res5 = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-audit-secret': 'td-secret-key-2026',
      },
      body: JSON.stringify({
        leadId: lead5Id,
        status: 'delivery_failed',
        error: 'Report delivery failed: Internal TD webhook upload dropped after 3 retries',
      }),
    });
    console.log(`✓ Callback responded with HTTP ${res5.status}`);

    const log5 = await query<{ type: string; error_message: string }>(
      `SELECT type, error_message FROM failure_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [lead5Id]
    );
    console.log(`✓ REPORT_DELIVERY_FAILED recorded in DB: type="${log5.rows[0]?.type}", error="${log5.rows[0]?.error_message}"`);
    if (log5.rows[0]?.type !== 'REPORT_DELIVERY_FAILED') throw new Error('Path 5 failed');
    console.log('✅ Path 5 Passed: REPORT_DELIVERY_FAILED logged through real webhook delivery fault path.\n');

    // -------------------------------------------------------------------------
    // SUMMARY QUERY OF ALL 5 FAILURE TYPES
    // -------------------------------------------------------------------------
    console.log('--- Summary: Verifying All 5 Distinct Failure Types in DB ---');
    const allFailures = await failureLogService.getFailures({ limit: 10 });
    const typesFound = new Set(allFailures.records.map((r) => r.type));

    const expectedTypes = ['SEND_FAILED', 'AUDIT_FAILED', 'AUDIT_TIMEOUT', 'PDF_MISSING', 'REPORT_DELIVERY_FAILED'];
    for (const exp of expectedTypes) {
      console.log(`✓ Type [${exp}]: Present = ${typesFound.has(exp as any)}`);
      if (!typesFound.has(exp as any)) {
        throw new Error(`Summary Check Failed: Type ${exp} missing from failure_log!`);
      }
    }

    console.log('\n========================================================================');
    console.log('🎉 ALL 5 FAILURE TYPES SUCCESSFULLY TRIGGERED THROUGH REAL CODE PATHS!');
    console.log('========================================================================\n');
  } finally {
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM failure_log WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
    await query(`UPDATE leads SET status = 'active' WHERE status = 'paused'`);
  }
}

runB20RealPathsTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B20 Real Paths Test Error:', err);
    process.exit(1);
  });
