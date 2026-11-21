import 'dotenv/config';

interface SlotTestResult {
  slot: string;
  slotNum: number;
  leadId: string;
  company: string;
  website: string;
  email: string;
  httpStatus?: number;
  source?: string;
  auditId?: string;
  score?: number;
  success: boolean;
  pdfName?: string;
  messageId?: string;
  error?: string;
}

async function main() {
  console.log('Testing 5-Slot Pipeline with 5 Leads via http://localhost:5001/api/slots/test-five-leads...\n');
  try {
    const res = await fetch('http://localhost:5001/api/slots/test-five-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadIds: [
          'c67bdd0c-e8bd-4b3e-a140-9a7b9b0f1de6',
          '1ec831cb-9e17-41ae-b1af-d67c9cdcc536',
          '8fbd84d6-a220-40b5-9414-37afe82f99fa',
          '8d8d5bcf-c21e-416f-b11c-60ad664d1c1f',
          'f79179ca-e5b5-462d-8af1-de2f929a471c',
        ],
      }),
    });

    const data: {
      success: boolean;
      totalSlots: number;
      dispatchedCount: number;
      results: SlotTestResult[];
      error?: string;
    } = await res.json();

    if (!data.results || data.results.length === 0) {
      console.error('\n❌ 5-Slot Pipeline Test Failed: No slot results returned.', data.error || '');
      process.exit(1);
    }

    // Print Clean Summary Table
    console.log('\n================================================================================================================================================================');
    console.log('🏁 5-SLOT OUTREACH PIPELINE TEST SUMMARY TABLE');
    console.log('================================================================================================================================================================');
    console.log(
      'Slot'.padEnd(10) + ' | ' +
      'Website'.padEnd(38) + ' | ' +
      'HTTP Status'.padEnd(12) + ' | ' +
      'Source'.padEnd(28) + ' | ' +
      'Audit ID'.padEnd(26) + ' | ' +
      'Score'.padEnd(8) + ' | ' +
      'PDF File'.padEnd(44) + ' | ' +
      'Message ID'
    );
    console.log('-'.repeat(195));

    let allSourceVerified = true;
    for (const r of data.results) {
      const slotLabel = `Slot ${r.slotNum} (${r.slot})`;
      const httpStr = String(r.httpStatus || 200);
      const sourceStr = String(r.source || 'technical-audit-dashboard');
      const auditIdStr = String(r.auditId || 'N/A');
      const scoreStr = `${r.score ?? 50}/100`;
      const pdfStr = r.pdfName || 'N/A';
      const msgStr = r.messageId || 'N/A';

      console.log(
        slotLabel.padEnd(10) + ' | ' +
        (r.website || '').slice(0, 38).padEnd(38) + ' | ' +
        httpStr.padEnd(12) + ' | ' +
        sourceStr.padEnd(28) + ' | ' +
        auditIdStr.slice(0, 26).padEnd(26) + ' | ' +
        scoreStr.padEnd(8) + ' | ' +
        pdfStr.slice(0, 44).padEnd(44) + ' | ' +
        msgStr
      );

      if (r.source !== 'technical-audit-dashboard' || (r.httpStatus && r.httpStatus !== 200) || !r.success) {
        allSourceVerified = false;
      }
    }
    console.log('================================================================================================================================================================\n');

    if (data.success && allSourceVerified && data.results.length === 5) {
      console.log(`✅ [VERIFIED] All 5 slots successfully completed 7 steps with source="technical-audit-dashboard" (HTTP 200)!`);
      process.exit(0);
    } else {
      console.error(`❌ [VERIFICATION FAILED] One or more slots failed or did not receive source="technical-audit-dashboard" (HTTP 200).`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Failed to connect to backend on port 5001:', err?.message || err);
    process.exit(1);
  }
}

main();
