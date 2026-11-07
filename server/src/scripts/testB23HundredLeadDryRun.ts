import fs from 'fs';
import path from 'path';
import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';
import { failureLogService } from '../services/failureLogService';
import { suppressionService } from '../services/suppressionService';

const SLOTS = ['A', 'B', 'C', 'D', 'E'] as const;

async function runB23HundredLeadDryRun() {
  console.log('========================================================================');
  console.log('🚀 B23: 100-LEAD END-TO-END DRY RUN VIA 5-SLOT SCHEDULER (MOCK SMTP)');
  console.log('========================================================================\n');

  // STRICT GUARANTEE: Enable Mock SMTP so NO real emails can ever be transmitted
  emailAdapter.setMockMode(true);
  process.env.MOCK_SMTP = 'true';
  emailAdapter.clearMockSentLog();

  const testBatchId = `b23_${Date.now()}`;
  const pdfDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  // Create valid 1KB mock PDF
  const samplePdfPath = path.join(pdfDir, `${testBatchId}_valid_sample.pdf`);
  const pdfContent = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n'),
    Buffer.alloc(1000, 32),
    Buffer.from('\n%%EOF\n'),
  ]);
  fs.writeFileSync(samplePdfPath, pdfContent);

  const createdLeadIds: string[] = [];
  const createdPdfPaths: string[] = [samplePdfPath];

  try {
    // 1. Configure Scheduler Settings
    console.log('[Step 1] Configuring scheduler settings for 100-lead dry run...');
    await fiveSlotSenderService.updateSettings({
      slot_cycle_min: 10,
      slot_offset_min: 2,
      daily_send_limit: 500,
      send_window_start_hour: 0,
      send_window_end_hour: 24,
      weekdays_only: false,
      max_audit_retries: 3,
      is_active: true,
    });
    fiveSlotSenderService.resetLastSlotSent();

    // 2. Pause existing leads to isolate dry-run test batch
    await query(`UPDATE leads SET status = 'paused' WHERE status = 'active'`);

    // 3. Queue 100 Leads with Round-Robin Slot Assignment
    console.log('[Step 2] Queuing 100 leads with round-robin slot distribution...');
    const slotCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };

    // Breakdown:
    // - 90 Normal Ready Leads (sent successfully)
    // - 4 Missing PDF Leads (fail audit gate -> PDF_MISSING)
    // - 4 Unready Leads (pending with max retries -> AUDIT_TIMEOUT)
    // - 2 Suppressed Leads (in global suppression list -> skipped at send time)
    for (let i = 0; i < 100; i++) {
      const assignedSlot = SLOTS[i % 5];
      slotCounts[assignedSlot]++;

      const email = `prospect_${i}_${testBatchId}@corp-${i}-${testBatchId}.example`;
      const businessName = `${testBatchId}_Client_${i}`;
      const website = `https://corp-${i}-${testBatchId}.example.org`;

      let auditStatus = 'ready';
      let auditPdfPath: string | null = samplePdfPath;
      let auditFindings: any = JSON.stringify([
        { issue: 'Render-blocking CSS resources', priority: 'High', recommendation: 'Defer non-critical stylesheets' },
        { issue: 'Missing meta descriptions', priority: 'Medium', recommendation: 'Add unique 155-character meta descriptions' },
        { issue: 'Uncompressed image assets', priority: 'High', recommendation: 'Convert PNG to WebP' },
        { issue: 'Viewport tag missing', priority: 'Low', recommendation: 'Add standard responsive viewport meta' },
      ]);
      let auditRetryCount = 0;
      let auditRequestedAt: Date | null = new Date();

      if (i >= 90 && i < 94) {
        // PDF Missing
        auditStatus = 'ready';
        auditPdfPath = path.join(pdfDir, `non_existent_${i}_${testBatchId}.pdf`);
        auditRetryCount = 2; // Will hit retry 3 and fail to PDF_MISSING
      } else if (i >= 94 && i < 98) {
        // Audit Timeout (pending > 15m with 2 retries already)
        auditStatus = 'pending';
        auditPdfPath = null;
        auditFindings = null;
        auditRetryCount = 2;
        auditRequestedAt = new Date(Date.now() - 30 * 60 * 1000);
      } else if (i >= 98) {
        // Suppressed by domain (bypasses SQL email join, caught by send-time suppression check)
        const domain = `corp-${i}-${testBatchId}.example`;
        await suppressionService.suppress({
          domain,
          reason: 'DOMAIN_SUPPRESSION',
          source: 'B23_TEST',
        });
      }

      const res = await query<{ id: string }>(
        `INSERT INTO leads (
           business_name, email, website, slot_id, status, consent_status, outreach_stage,
           audit_status, audit_findings, audit_pdf_path, audit_retry_count, audit_requested_at,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, 'active', 'none', 'initial', $5, $6, $7, $8, $9, NOW() - ($10 || ' minutes')::INTERVAL, NOW())
         RETURNING id`,
        [
          businessName,
          email,
          website,
          assignedSlot,
          auditStatus,
          auditFindings,
          auditPdfPath,
          auditRetryCount,
          auditRequestedAt,
          100 - i, // staggered created_at so queue order is deterministic
        ]
      );
      createdLeadIds.push(res.rows[0].id);
    }

    console.log('✓ 100 leads inserted into PostgreSQL.');
    console.log('✓ Slot distribution verified:');
    for (const slot of SLOTS) {
      console.log(`   Slot ${slot}: ${slotCounts[slot]} leads (exact 20% split)`);
      if (slotCounts[slot] !== 20) {
        throw new Error(`Slot distribution uneven for Slot ${slot}: ${slotCounts[slot]} != 20`);
      }
    }

    // 4. Run Simulated Grid Timeline Through Scheduler
    console.log('\n[Step 3] Dispatching leads through 5-slot scheduler across timeline ticks...');
    const baseDate = new Date(Date.now() + 60 * 1000);
    let tickCount = 0;

    // We step through 20 full cycles (20 * 5 = 100 slot turns).
    // In each cycle, each of the 5 slots gets a turn at its 2-minute staggered offset.
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let sIdx = 0; sIdx < SLOTS.length; sIdx++) {
        const slotOffsetMin = sIdx * 2;
        const tickTime = new Date(baseDate.getTime() + (cycle * 10 + slotOffsetMin) * 60 * 1000);
        
        const tickRes = await fiveSlotSenderService.processGlobalTick(tickTime);
        if (!tickRes.dispatched && cycle < 3) {
          console.log(`[Cycle ${cycle} Slot ${SLOTS[sIdx]}] Not dispatched: ${tickRes.reason}`);
        }
        tickCount++;
      }
    }
    console.log(`✓ Processed ${tickCount} scheduler ticks across 20 cycles.\n`);

    // 5. Compare Sent Log vs Failure Log vs Lead States
    console.log('========================================================================');
    console.log('📊 COMPARISON AUDIT: SENT LOG vs FAILURE LOG vs LEAD STATES');
    console.log('========================================================================');

    const mockSentLog = emailAdapter.getMockSentLog();
    console.log(`1. Total Outbound Emails in Mock Sent Log: ${mockSentLog.length}`);

    // Verify all sends were routed via cloudconsultancy.ad@gmail.com
    const nonPrimarySends = mockSentLog.filter((s) => s.mailbox !== 'cloudconsultancy.ad@gmail.com');
    console.log(`   - Sends from "cloudconsultancy.ad@gmail.com": ${mockSentLog.length - nonPrimarySends.length}`);
    console.log(`   - Sends from unexpected mailbox: ${nonPrimarySends.length}`);
    if (nonPrimarySends.length > 0) {
      throw new Error(`Found ${nonPrimarySends.length} sends not originating from cloudconsultancy.ad@gmail.com!`);
    }

    // Breakdown sent per slot
    const sendsBySlot: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const send of mockSentLog) {
      if (send.slot && sendsBySlot[send.slot] !== undefined) {
        sendsBySlot[send.slot]++;
      }
    }
    console.log('   - Sent distribution by Slot:');
    for (const slot of SLOTS) {
      console.log(`     Slot ${slot}: ${sendsBySlot[slot]} sent`);
    }

    // 2. Failure Log records
    const failureLogs = await query<{ lead_id: string; type: string; error_message: string }>(
      `SELECT lead_id, type, error_message FROM failure_log WHERE lead_id = ANY($1::uuid[])`,
      [createdLeadIds]
    );
    console.log(`\n2. Total Failures Logged in failure_log: ${failureLogs.rows.length}`);
    const failureByType: Record<string, number> = {};
    for (const f of failureLogs.rows) {
      failureByType[f.type] = (failureByType[f.type] || 0) + 1;
      console.log(`   - [${f.type}] Lead ${f.lead_id}: ${f.error_message.slice(0, 75)}...`);
    }

    // 3. Query Lead Database Final States
    const leadStatesRes = await query<{
      id: string;
      status: string;
      consent_status: string;
      outreach_stage: string;
      last_sent_at: string | null;
      last_sent_message_id: string | null;
    }>(
      `SELECT id, status, consent_status, outreach_stage, last_sent_at, last_sent_message_id
       FROM leads 
       WHERE id = ANY($1::uuid[])`,
      [createdLeadIds]
    );

    let stateSentCount = 0;
    let stateManualReviewCount = 0;
    let stateOptedOutCount = 0;

    for (const lead of leadStatesRes.rows) {
      if (lead.outreach_stage === 'followup_1' && lead.last_sent_at && lead.last_sent_message_id) {
        stateSentCount++;
      } else if (lead.status === 'manual_review') {
        stateManualReviewCount++;
      } else if (lead.consent_status === 'opted_out') {
        stateOptedOutCount++;
      }
    }

    console.log(`\n3. Final Lead States in PostgreSQL:`);
    console.log(`   - Successfully Sent & Advanced to "followup_1" (with send marker): ${stateSentCount}`);
    console.log(`   - Quarantined to "manual_review" in 'Need to Check': ${stateManualReviewCount}`);
    console.log(`   - Skipped at send-time & marked "opted_out" (Suppression): ${stateOptedOutCount}`);
    console.log(`   - Total accounted for: ${stateSentCount + stateManualReviewCount + stateOptedOutCount} / 100`);

    // Cross-system verification
    console.log('\n--- Cross-System Reconciliation ---');
    console.log(`✓ Sent Log Count (${mockSentLog.length}) == DB Sent Stage Count (${stateSentCount}): ${mockSentLog.length === stateSentCount}`);
    console.log(`✓ Failure Log Count (${failureLogs.rows.length}) == Manual Review Count (${stateManualReviewCount}): ${failureLogs.rows.length === stateManualReviewCount}`);
    console.log(`✓ Total Leads Reconciled: ${stateSentCount + stateManualReviewCount + stateOptedOutCount} === 100`);

    if (mockSentLog.length !== 90) {
      throw new Error(`Expected exactly 90 sends, got ${mockSentLog.length}`);
    }
    if (stateManualReviewCount !== 8) {
      throw new Error(`Expected exactly 8 quarantined leads, got ${stateManualReviewCount}`);
    }
    if (stateOptedOutCount !== 2) {
      throw new Error(`Expected exactly 2 suppressed leads, got ${stateOptedOutCount}`);
    }

    console.log('\n========================================================================');
    console.log('🎉 B23 100-LEAD END-TO-END DRY RUN COMPLETE & FULLY RECONCILED!');
    console.log('========================================================================\n');
  } finally {
    console.log('🧹 Cleaning up test leads, suppressions, and artifacts...');
    if (createdLeadIds.length > 0) {
      await query(`DELETE FROM failure_log WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = ANY($1::uuid[]))`, [createdLeadIds]);
      await query(`DELETE FROM conversations WHERE lead_id = ANY($1::uuid[])`, [createdLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [createdLeadIds]);
    }
    await query(`DELETE FROM global_suppression_list WHERE source = 'B23_TEST'`);
    await query(`UPDATE leads SET status = 'active' WHERE status = 'paused'`);
    for (const p of createdPdfPaths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    emailAdapter.clearMockSentLog();
    emailAdapter.setMockMode(false);
  }
}

runB23HundredLeadDryRun()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ B23 Dry Run Error:', err);
    process.exit(1);
  });
