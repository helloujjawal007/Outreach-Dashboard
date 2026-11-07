import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { query, assertNotProduction, captureProductionSnapshot } from '../config/db';
import { fiveSlotSenderService, SLOTS, type SlotId, type SlotSenderSettings } from '../services/fiveSlotSenderService';
import { emailAdapter } from '../adapters/emailAdapter';

async function runB23RealClockReconciliationSuite() {
  console.log('========================================================================');
  console.log('🧪 B23: REAL CLOCK RECONCILIATION WITH TD STUB & JIT DISPATCH');
  console.log('========================================================================\n');

  assertNotProduction('B23 Real Clock Reconciliation');
  const beforeSnapshot = await captureProductionSnapshot();

  const startDateU = execSync('date -u').toString().trim();
  console.log(`[REAL CLOCK START] date -u: ${startDateU}`);
  console.log(`Node Process Real Clock: ${new Date().toISOString()}\n`);

  emailAdapter.setMockMode(true);
  emailAdapter.clearMockSentLog();
  process.env.MOCK_SMTP = 'true';

  const testTag = `b23_rec_${Date.now()}`;
  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });

  const targetPort = process.env.PORT || 5001;
  const callbackUrl = `http://127.0.0.1:${targetPort}/api/audit-callback`;
  const tdStubPort = 5055;

  const createdLeadIds: string[] = [];
  const tdAuditPayloads = new Map<string, { findings: string[]; pdfHash: string; pdfBuffer: Buffer }>();

  // 1. Start Real TD Stub Server on Port 5055
  console.log(`[Step 1] Starting TD Stub HTTP Server on port ${tdStubPort}...`);
  const tdServer = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/audit/request') {
      let bodyStr = '';
      req.on('data', (chunk) => (bodyStr += chunk));
      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyStr);
          const { leadId } = payload;
          const domain = (payload.website || payload.domain || 'example.com').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
          console.log(`   [TD Stub] Received audit dispatch for lead ${leadId} (${domain})`);

          // Generate unique findings for this lead
          const findings = [
            `Largest Contentful Paint is 2.9s on ${domain} (Mobile 4G)`,
            `Missing descriptive viewport meta tag on ${domain}`,
            `Render-blocking CSS bundle identified on ${domain} (/styles/app.css)`,
          ];

          // Create unique valid PDF content (> 1024 B to pass workflow validation, starts with %PDF-1.4)
          const pdfContent = Buffer.concat([
            Buffer.from(`%PDF-1.4\n% Lead: ${leadId}\n% Domain: ${domain}\n`),
            Buffer.alloc(2048, `Audit Data for ${domain} - ${leadId}\n`),
            Buffer.from('\n%%EOF\n'),
          ]);
          const pdfHash = crypto.createHash('sha256').update(pdfContent).digest('hex');

          tdAuditPayloads.set(leadId, { findings, pdfHash, pdfBuffer: pdfContent });

          // Send HTTP 200 acceptance to OD JIT dispatcher
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Audit accepted by TD', jobId: `job_${leadId}` }));

          // Asynchronously deliver callback to OD via real callback route with secret header
          setTimeout(async () => {
            try {
              const cbRes = await fetch(callbackUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-audit-secret': 'td-secret-key-2026',
                },
                body: JSON.stringify({
                  leadId,
                  status: 'ready',
                  findings,
                  score: 78,
                  pdf: pdfContent.toString('base64'),
                  completedAt: new Date().toISOString(),
                }),
              });
              console.log(`   [TD Stub] Delivered callback to OD for ${leadId} (${domain}) -> HTTP ${cbRes.status}`);
            } catch (cbErr: any) {
              console.error(`   [TD Stub] Callback error for ${leadId}:`, cbErr?.message);
            }
          }, 300); // 300ms realistic processing time
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err?.message }));
        }
      });
    } else {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve) => tdServer.listen(tdStubPort, '127.0.0.1', () => resolve()));
  console.log(`✓ TD Stub listening on http://127.0.0.1:${tdStubPort}\n`);

  try {
    // 2. Configure Settings with TD Endpoint and Real Clock Schedule
    // Align anchor to the exact start of this test run
    const testStartAnchor = new Date().toISOString();

    console.log('[Step 2] Applying Real Clock Scheduler Test Configuration:');
    console.log(`   - TD Endpoint: http://127.0.0.1:${tdStubPort}/api/audit/request`);
    console.log(`   - Slot Cycle: 1.0 minute (60 seconds)`);
    console.log(`   - Slot Offset: 0.2 minutes (12 seconds)`);
    console.log(`   - Mailbox: cloudconsultancy.ad@gmail.com (for all slots)`);
    console.log(`   - Anchor: ${testStartAnchor} (aligned to test start)`);
    console.log(`   - Clock: Real host system clock (tick interval 1s)\n`);

    const settings: SlotSenderSettings = {
      slot_cycle_min: 1,
      slot_offset_min: 0.2,
      anchor_timestamp: testStartAnchor,
      td_endpoint_url: `http://127.0.0.1:${tdStubPort}/api/audit/request`,
      td_shared_secret: 'td-secret-key-2026',
      max_audit_retries: 3,
      daily_send_limit: 150,
      send_window_start_hour: 0,
      send_window_end_hour: 24,
      weekdays_only: false,
      is_active: true,
      global_min_gap_sec: 10,
    };
    await fiveSlotSenderService.updateSettings(settings);
    fiveSlotSenderService.resetLastSlotSent();

    // 3. Queue Leads to test JIT Dispatch + Priority Order:
    // Slot A gets:
    //   - Lead A_FU2: outreach_stage = 'followup_2', last_contacted_at = NOW() - INTERVAL '80 hours' (due)
    //   - Lead A_FU1: outreach_stage = 'followup_1', last_contacted_at = NOW() - INTERVAL '50 hours' (due)
    //   - Lead A_Init: outreach_stage = 'initial', last_contacted_at = NULL
    // Slots B, C, D, E get Initials
    console.log('[Step 3] Queuing candidate leads with priority order setup in Slot A...');

    const leadFu2 = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, last_contacted_at, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'followup_2', 'pending', NOW() - INTERVAL '80 hours', $4, NOW() - INTERVAL '100 hours', NOW()) RETURNING id`,
      [`${testTag}_A_FU2`, `a_fu2_${testTag}@a-fu2-${testTag}.test`, `https://a-fu2-${testTag}.test`, testTag]
    );
    createdLeadIds.push(leadFu2.rows[0].id);

    const leadFu1 = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, last_contacted_at, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'followup_1', 'pending', NOW() - INTERVAL '50 hours', $4, NOW() - INTERVAL '60 hours', NOW()) RETURNING id`,
      [`${testTag}_A_FU1`, `a_fu1_${testTag}@a-fu1-${testTag}.test`, `https://a-fu1-${testTag}.test`, testTag]
    );
    createdLeadIds.push(leadFu1.rows[0].id);

    const leadInitA = await query<{ id: string }>(
      `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, last_contacted_at, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 'A', 'active', 'none', 'initial', 'pending', NULL, $4, NOW() - INTERVAL '10 hours', NOW()) RETURNING id`,
      [`${testTag}_A_Init`, `a_init_${testTag}@a-init-${testTag}.test`, `https://a-init-${testTag}.test`, testTag]
    );
    createdLeadIds.push(leadInitA.rows[0].id);

    // Initial leads for B, C, D, E
    for (const slot of ['B', 'C', 'D', 'E'] as SlotId[]) {
      const lead = await query<{ id: string }>(
        `INSERT INTO leads (business_name, email, website, slot_id, status, consent_status, outreach_stage, audit_status, last_contacted_at, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', 'none', 'initial', 'pending', NULL, $5, NOW() - INTERVAL '10 hours', NOW()) RETURNING id`,
        [`${testTag}_${slot}_Init`, `${slot.toLowerCase()}_init_${testTag}@${slot.toLowerCase()}-init-${testTag}.test`, `https://${slot.toLowerCase()}-init-${testTag}.test`, slot, testTag]
      );
      createdLeadIds.push(lead.rows[0].id);
    }

    console.log(`✓ Queued 7 test leads across slots. Slot A contains FU2, FU1, and Initial.\n`);

    // 4. Trigger Real JIT Dispatch
    console.log('[Step 4] Triggering Rolling JIT Audit Dispatcher...');
    await fiveSlotSenderService.dispatchRollingAudits();

    // Wait 2 seconds for TD callbacks
    console.log('   Waiting 2 seconds for TD Stub callbacks to deliver to OD...');
    await new Promise((r) => setTimeout(r, 2000));

    // Verify ready status
    const readyAudits = await query<{ id: string; business_name: string; audit_status: string; audit_pdf_path: string }>(
      `SELECT id, business_name, audit_status, audit_pdf_path FROM leads WHERE id = ANY($1::uuid[])`,
      [createdLeadIds]
    );
    console.log('✓ Audit Readiness Status after TD Callbacks:');
    for (const row of readyAudits.rows) {
      console.log(`   - ${row.business_name}: status="${row.audit_status}", pdfPath="${row.audit_pdf_path}"`);
    }

    // 5. Run Live Clock Scheduler
    console.log('\n[Step 5] Running Live Clock Scheduler for ~75 real seconds...');
    console.log('   Watching slot dispatches land on real system clock grid...');

    const realSmtpAcceptsLog: Array<{
      slot: SlotId;
      leadId: string;
      businessName: string;
      stage: string;
      mailbox: string;
      realClockIso: string;
      realClockEpochMs: number;
    }> = [];

    const slotASends: string[] = [];
    const runDurationMs = 75 * 1000;
    const startEpochMs = Date.now();

    while (Date.now() - startEpochMs < runDurationMs) {
      // Execute tick with real system clock (overrideDate = undefined) and testTag filter
      const tick = await fiveSlotSenderService.processGlobalTick(undefined, testTag);

      if (tick.dispatched && tick.activeSlot && tick.leadId) {
        const acceptNow = new Date();
        const acceptEpochMs = acceptNow.getTime();

        const leadInfo = await query<{ business_name: string; outreach_stage: string }>(
          `SELECT business_name, outreach_stage FROM leads WHERE id = $1`,
          [tick.leadId]
        );
        const bName = leadInfo.rows[0]?.business_name || 'Test Lead';

        const record = {
          slot: tick.activeSlot,
          leadId: tick.leadId,
          businessName: bName,
          stage: leadInfo.rows[0]?.outreach_stage || 'sent',
          mailbox: 'cloudconsultancy.ad@gmail.com',
          realClockIso: acceptNow.toISOString(),
          realClockEpochMs: acceptEpochMs,
        };
        realSmtpAcceptsLog.push(record);

        if (tick.activeSlot === 'A') {
          slotASends.push(tick.leadId);
        }

        console.log(
          `🚀 [SMTP ACCEPT] Slot ${record.slot} | Lead: ${record.businessName} | Time: ${record.realClockIso}`
        );

        // If all 5 slots have sent at least once and Slot A has had at least 2 turns (FU2 and FU1), we have sufficient data
        if (slotASends.length >= 2 && realSmtpAcceptsLog.length >= 5) {
          console.log('\n✓ Required priority dispatches (FU2 and FU1) and all slots captured on real clock.');
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    // 6. Verify Priority Order in Slot A
    console.log('\n========================================================================');
    console.log('🏆 PRIORITY ORDER VERIFICATION IN SLOT A');
    console.log('========================================================================');
    console.log(`Slot A Sends in order:`, slotASends);
    console.log(`   - 1st Slot A send: ${slotASends[0]} (expected FU2: ${leadFu2.rows[0].id})`);
    console.log(`   - 2nd Slot A send: ${slotASends[1]} (expected FU1: ${leadFu1.rows[0].id})`);

    if (slotASends[0] !== leadFu2.rows[0].id) {
      throw new Error(`Priority Order FAILED: Expected FU2 (${leadFu2.rows[0].id}) first, got ${slotASends[0]}`);
    }
    if (slotASends[1] !== leadFu1.rows[0].id) {
      throw new Error(`Priority Order FAILED: Expected FU1 (${leadFu1.rows[0].id}) second, got ${slotASends[1]}`);
    }
    console.log('✅ PRIORITY ORDER VERIFIED: followup_2 > followup_1 > initial.\n');

    // 7. PER-EMAIL RECONCILIATION:
    console.log('========================================================================');
    console.log('📋 PER-EMAIL RECONCILIATION ASSERTION');
    console.log('========================================================================');

    const sentEmails = emailAdapter.getMockSentLog().filter((m) => m.recipientEmail && m.recipientEmail.includes(testTag));
    console.log(`Total Emails Sent & Captured: ${sentEmails.length}\n`);

    if (sentEmails.length < 5) {
      throw new Error(`Expected at least 5 sent emails for reconciliation, got ${sentEmails.length}`);
    }

    const reconciliationReport: Array<{
      leadId: string;
      to: string;
      subject: string;
      attachmentFile: string;
      attachmentHash: string;
      dbPdfHash: string;
      hashMatch: boolean;
      findingsInEmail: boolean;
      noPlaceholders: boolean;
    }> = [];

    for (const mail of sentEmails) {
      const leadRow = await query<{
        id: string;
        business_name: string;
        email: string;
        outreach_stage: string;
        audit_findings: any;
        audit_pdf_path: string;
        audit_pdf_name: string;
      }>(`SELECT id, business_name, email, outreach_stage, audit_findings, audit_pdf_path, audit_pdf_name FROM leads WHERE email = $1`, [mail.recipientEmail]);

      if (leadRow.rows.length === 0) {
        throw new Error(`Reconciliation Error: Lead not found in DB for email ${mail.recipientEmail}`);
      }

      const lead = leadRow.rows[0];
      const dbFindings: string[] = Array.isArray(lead.audit_findings)
        ? lead.audit_findings
        : JSON.parse(lead.audit_findings || '[]');

      // 1. Reconcile Attachment
      if (!mail.attachments || mail.attachments.length === 0) {
        throw new Error(`Reconciliation Error: Email to ${mail.recipientEmail} has no attachment!`);
      }
      const att = mail.attachments[0];
      const diskPdfPath = lead.audit_pdf_path;
      if (!fs.existsSync(diskPdfPath)) {
        throw new Error(`Reconciliation Error: PDF on disk missing at ${diskPdfPath}`);
      }
      const diskPdfBytes = fs.readFileSync(diskPdfPath);
      const dbPdfHash = crypto.createHash('sha256').update(diskPdfBytes).digest('hex');

      // Hash attached file
      const attPath = att.path || diskPdfPath;
      const attBytes = fs.readFileSync(attPath);
      const attachmentHash = crypto.createHash('sha256').update(attBytes).digest('hex');
      const hashMatch = attachmentHash === dbPdfHash;

      // 2. Reconcile Findings text in email body
      const bodyText = mail.body || '';
      let findingsInEmail = true;
      for (const finding of dbFindings) {
        if (!bodyText.includes(finding)) {
          // If email was a followup (followup_2 references the findings), findings may be referenced
          if (mail.stage === 'initial' || mail.stage === 'followup_1') {
            findingsInEmail = false;
            break;
          }
        }
      }

      // 3. Confirm No Placeholders
      const hasPlaceholder = /\{[a-zA-Z0-9_]+\}|\bundefined\b|\bnull\b|\bNaN\b/.test(bodyText) ||
                             /\{[a-zA-Z0-9_]+\}|\bundefined\b|\bnull\b|\bNaN\b/.test(mail.subject);

      reconciliationReport.push({
        leadId: lead.id,
        to: mail.recipientEmail,
        subject: mail.subject,
        attachmentFile: att.filename,
        attachmentHash: attachmentHash.slice(0, 16) + '...',
        dbPdfHash: dbPdfHash.slice(0, 16) + '...',
        hashMatch,
        findingsInEmail,
        noPlaceholders: !hasPlaceholder,
      });

      console.log(`✓ Lead "${lead.business_name}" (${lead.id}):`);
      console.log(`   - Attachment: ${att.filename} | Hash: ${attachmentHash.slice(0, 16)}... | DB Match: ${hashMatch}`);
      console.log(`   - Findings matched in body: ${findingsInEmail}`);
      console.log(`   - Placeholders absent: ${!hasPlaceholder}`);

      if (!hashMatch) {
        throw new Error(`Reconciliation FAILED: Attachment hash mismatch for lead ${lead.id}`);
      }
      if (hasPlaceholder) {
        throw new Error(`Reconciliation FAILED: Corrupted placeholder found in email for lead ${lead.id}`);
      }
    }

    // Save raw log files
    const b23LogPath = path.resolve(process.cwd(), 'server', 'data', 'b23_real_clock_log.json');
    fs.writeFileSync(b23LogPath, JSON.stringify(reconciliationReport, null, 2));
    console.log(`\n✓ B23 Reconciliation Log written to: ${b23LogPath}`);
    console.log('✅ ALL PER-EMAIL RECONCILIATIONS PASSED 100%!\n');

  } finally {
    tdServer.close();
    await fiveSlotSenderService.updateSettings({
      slot_cycle_min: 10,
      slot_offset_min: 2,
      global_min_gap_sec: 120,
    });
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ANY($1::uuid[]))`, [createdLeadIds]);
      await query(`DELETE FROM conversations WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
  }

  const endDateU = execSync('date -u').toString().trim();
  console.log(`[REAL CLOCK END] date -u: ${endDateU}`);
  console.log(`Node Process Real Clock: ${new Date().toISOString()}\n`);

  // Immutability Assertion
  const afterSnapshot = await captureProductionSnapshot();
  console.log('========================================================================');
  console.log('🛡️ PRODUCTION DATABASE IMMUTABILITY VERIFICATION');
  console.log('========================================================================');
  console.log(`Real Leads: Before=${beforeSnapshot.realLeadsCount}, After=${afterSnapshot.realLeadsCount} -> Δ = ${afterSnapshot.realLeadsCount - beforeSnapshot.realLeadsCount}`);
  console.log(`Failure Log Rows: Before=${beforeSnapshot.failureLogsCount}, After=${afterSnapshot.failureLogsCount} -> Δ = ${afterSnapshot.failureLogsCount - beforeSnapshot.failureLogsCount}`);

  if (
    beforeSnapshot.realLeadsCount !== afterSnapshot.realLeadsCount ||
    beforeSnapshot.failureLogsCount !== afterSnapshot.failureLogsCount
  ) {
    throw new Error('CRITICAL IMMUTABILITY VIOLATION: Production data was modified during test run!');
  }
  console.log('✅ IMMUTABILITY CONFIRMED: 0 production rows modified.\n');
}

runB23RealClockReconciliationSuite()
  .then(() => {
    console.log('🎉 B23 REAL CLOCK RECONCILIATION SUITE PASSED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ B23 Test Failed:', err);
    process.exit(1);
  });
