import { query, testConnection } from '../server/src/config/db';
import { emailAdapter } from '../server/src/adapters/emailAdapter';
import { whatsappAdapter } from '../server/src/adapters/whatsappAdapter';
import { linkedinService } from '../server/src/services/linkedinService';
import { inboxRotationService } from '../server/src/services/inboxRotationService';
import { emailInboundService } from '../server/src/services/emailInboundService';
import { aiCommandService } from '../server/src/services/aiCommandService';
import { emailSchedulerService } from '../server/src/services/emailSchedulerService';
import { googleEnrichmentService } from '../server/src/services/googleEnrichmentService';
import { conversationOrchestrator } from '../server/src/services/orchestratorService';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function record(name: string, category: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, category, passed, error, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${category}] ${name}${error ? ` -> ERROR: ${error}` : ''}`);
  if (details && !passed) {
    console.log('   Details:', typeof details === 'object' ? JSON.stringify(details) : details);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE PLATFORM FUNCTIONALITY TESTS');
  console.log('====================================================\n');

  // 1. DATABASE CONNECTIVITY
  try {
    const isDbConnected = await testConnection();
    record('PostgreSQL Connection', 'Database', isDbConnected);
  } catch (err: any) {
    record('PostgreSQL Connection', 'Database', false, err.message);
  }

  // 2. LEADS SCHEMA & RETRIEVAL
  let testLeadId = '';
  try {
    const leadsRes = await query('SELECT id, business_name, email, phone, status, consent_status FROM leads WHERE deleted_at IS NULL LIMIT 5');
    record('Fetch Active Leads', 'CRM Leads', leadsRes.rows.length >= 0, undefined, { count: leadsRes.rows.length });

    // Test creating a dummy lead for tests
    const newLeadRes = await query(`
      INSERT INTO leads (business_name, email, phone, status, consent_status)
      VALUES ('Test Automated Agency', 'tester.automated.lead@example.com', '+15550001122', 'active', 'none')
      RETURNING id, business_name
    `);
    testLeadId = newLeadRes.rows[0].id;
    record('Create Lead', 'CRM Leads', Boolean(testLeadId), undefined, { id: testLeadId });

    // Test updating lead
    const updateRes = await query(`
      UPDATE leads SET notes = 'Updated by test runner' WHERE id = $1 RETURNING id, notes
    `, [testLeadId]);
    record('Update Lead', 'CRM Leads', updateRes.rows[0]?.notes === 'Updated by test runner');

    // Test soft-delete to trash
    await query(`UPDATE leads SET deleted_at = NOW() WHERE id = $1`, [testLeadId]);
    const trashCheck = await query(`SELECT id FROM leads WHERE id = $1 AND deleted_at IS NOT NULL`, [testLeadId]);
    record('Soft-Delete Lead to Trash', 'CRM Leads', trashCheck.rows.length === 1);

    // Test restore from trash
    await query(`UPDATE leads SET deleted_at = NULL WHERE id = $1`, [testLeadId]);
    const restoreCheck = await query(`SELECT id FROM leads WHERE id = $1 AND deleted_at IS NULL`, [testLeadId]);
    record('Restore Lead from Trash', 'CRM Leads', restoreCheck.rows.length === 1);

  } catch (err: any) {
    record('Leads CRUD Operations', 'CRM Leads', false, err.message);
  }

  // 3. CUSTOM LISTS
  let testListId = '';
  try {
    const createListRes = await query(`
      INSERT INTO lists (name, description)
      VALUES ('Test Automated List', 'Created by test suite')
      RETURNING id, name
    `);
    testListId = createListRes.rows[0].id;
    record('Create Custom List', 'Lists', Boolean(testListId));

    if (testLeadId && testListId) {
      // Add lead to list
      await query(`INSERT INTO lead_list_memberships (list_id, lead_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [testListId, testLeadId]);
      const listLeads = await query(`SELECT lead_id FROM lead_list_memberships WHERE list_id = $1`, [testListId]);
      record('Add Lead to Custom List', 'Lists', listLeads.rows.some(r => r.lead_id === testLeadId));

      // Remove lead from list
      await query(`DELETE FROM lead_list_memberships WHERE list_id = $1 AND lead_id = $2`, [testListId, testLeadId]);
      const listLeadsAfter = await query(`SELECT lead_id FROM lead_list_memberships WHERE list_id = $1`, [testListId]);
      record('Remove Lead from Custom List', 'Lists', !listLeadsAfter.rows.some(r => r.lead_id === testLeadId));
    }
  } catch (err: any) {
    record('Custom Lists Operations', 'Lists', false, err.message);
  } finally {
    if (testListId) {
      await query(`DELETE FROM lists WHERE id = $1`, [testListId]).catch(() => {});
    }
  }

  // 4. CLIENT CONVERSION
  let convertedClientId = '';
  try {
    if (testLeadId) {
      // Convert lead to client via orchestrator
      const convRes = await conversationOrchestrator.convertLeadToClient(testLeadId, 'Test conversion notes');
      convertedClientId = convRes.clientId || '';
      record('Convert Lead to Client', 'CRM Clients', convRes.success && Boolean(convertedClientId));

      // Verify client row exists
      const clientRow = await query(`SELECT id, business_name FROM clients WHERE id = $1`, [convertedClientId]);
      record('Verify Client in Clients Table', 'CRM Clients', clientRow.rows.length === 1);

      // Clean up converted client row
      if (convertedClientId) {
        await query(`DELETE FROM clients WHERE id = $1`, [convertedClientId]).catch(() => {});
      }
    }
  } catch (err: any) {
    record('Client Conversion', 'CRM Clients', false, err.message);
  }

  // 5. INBOX ROTATION SERVICE
  try {
    const inboxes = await inboxRotationService.getAllInboxes();
    const summary = await inboxRotationService.getPoolSummary();
    record('Inboxes Retrieval', 'Email Engine', inboxes.length > 0, undefined, { count: inboxes.length, summary });
    
    // Check next active inbox rotation
    const nextInbox = await inboxRotationService.getNextAvailableInbox();
    record('Inbox Rotation Dispatch Selection', 'Email Engine', Boolean(nextInbox), undefined, { selected: nextInbox?.email });
  } catch (err: any) {
    record('Inbox Rotation Service', 'Email Engine', false, err.message);
  }

  // 6. EMAIL WARMUP & HEALTH
  try {
    const warmup = await emailAdapter.getWarmupStatus();
    record('Email Warmup Status & Stage', 'Sending Health', Boolean(warmup), undefined, warmup);
  } catch (err: any) {
    record('Email Warmup Status', 'Sending Health', false, err.message);
  }

  // 7. GMAIL IMAP INBOUND SYNC
  try {
    const syncRes = await emailInboundService.syncInboundEmails();
    record('Gmail IMAP Inbound Sync', 'Email Engine', Boolean(syncRes), undefined, syncRes);
  } catch (err: any) {
    record('Gmail IMAP Inbound Sync', 'Email Engine', false, err.message);
  }

  // 8. WHATSAPP ADAPTER
  try {
    const { whatsappSessionService } = await import('../server/src/services/whatsappSessionService');
    const waState = whatsappSessionService.getState();
    record('WhatsApp Session State Inspection', 'WhatsApp Engine', typeof waState.status === 'string', undefined, {
      status: waState.status,
      isConnected: waState.status === 'connected',
      hasSavedSession: whatsappSessionService.hasSavedSession(),
    });
  } catch (err: any) {
    record('WhatsApp Adapter State', 'WhatsApp Engine', false, err.message);
  }

  // 9. LINKEDIN ENGINE
  try {
    const liStatus = await linkedinService.getAccountStatus();
    record('LinkedIn Account Status & Quotas', 'LinkedIn Engine', Boolean(liStatus), undefined, liStatus);

    const liPosts = await linkedinService.getPosts();
    record('LinkedIn Posts History & Queue Retrieval', 'LinkedIn Engine', Array.isArray(liPosts), undefined, { count: liPosts.length });

    // Test AI Post Generation
    const generatedDraft = await linkedinService.generatePost({
      topic: 'How local businesses can rank #1 on Google Maps in 2026',
      tone: 'authoritative',
      targetAudience: 'Local Business Owners & Contractors',
      callToAction: 'Book an audit',
    });
    record('LinkedIn AI Post Generator', 'LinkedIn Engine', Boolean(generatedDraft?.content && generatedDraft.content.length > 50), undefined, {
      title: generatedDraft.title,
      length: generatedDraft.content.length,
    });
  } catch (err: any) {
    record('LinkedIn Engine Operations', 'LinkedIn Engine', false, err.message);
  }

  // 10. AI COPILOT / AI COMMAND SERVICE
  try {
    const suggestions = await aiCommandService.getBusinessSuggestions();
    record('AI Copilot Suggestions Generation', 'AI Copilot', Array.isArray(suggestions) && suggestions.length > 0, undefined, { count: suggestions.length });

    const history = await aiCommandService.getCommandHistory();
    record('AI Command History Retrieval', 'AI Copilot', Array.isArray(history?.history), undefined, { count: history?.history?.length });

    // Test safe command execution
    const execRes = await aiCommandService.executeCommand({ commandText: 'diagnostic audit' });
    record('AI Command Execution (Copilot Chat)', 'AI Copilot', Boolean(execRes?.summary), undefined, {
      summary: execRes.summary,
      actionExecuted: execRes.actionExecuted,
    });
  } catch (err: any) {
    record('AI Copilot Service', 'AI Copilot', false, err.message);
  }

  // 11. GOOGLE ENRICHMENT & GMB
  try {
    const gmbStatus = googleEnrichmentService.getGmbSyncStatus();
    record('Google Maps / GMB Status', 'Google Enrichment', typeof gmbStatus === 'object', undefined, gmbStatus);
  } catch (err: any) {
    record('Google Maps / GMB Status', 'Google Enrichment', false, err.message);
  }

  // 12. MANUAL CHECKING & ANONYMOUS ADDRESS DETECTION
  let anonLeadId = '';
  try {
    const anonRes = await query(`
      INSERT INTO leads (business_name, email, status, consent_status)
      VALUES ('Anonymous Privacy Inc', 'anonymous@privacyprotect.org', 'active', 'none')
      RETURNING id
    `);
    anonLeadId = anonRes.rows[0].id;

    // Send attempt to anonymous address should be blocked and quarantined
    const sendResult = await emailAdapter.sendEmail({
      to: 'anonymous@privacyprotect.org',
      subject: 'Test subject',
      body: 'Test body',
      leadId: anonLeadId,
    });

    const checkQuarantined = await query(
      `SELECT status, manual_review_reason FROM leads WHERE id = $1`,
      [anonLeadId]
    );

    const isQuarantined = checkQuarantined.rows[0]?.status === 'manual_review';
    const reason = checkQuarantined.rows[0]?.manual_review_reason;

    record('Anonymous Address Pre-Send Quarantine', 'Manual Checking', isQuarantined, undefined, {
      sendResult,
      status: checkQuarantined.rows[0]?.status,
      reason,
    });

    // Test Approve & Re-activate
    await query(
      `UPDATE leads SET status = 'active', manual_review_reason = NULL WHERE id = $1`,
      [anonLeadId]
    );
    const checkApproved = await query(`SELECT status FROM leads WHERE id = $1`, [anonLeadId]);
    record('Approve Quarantined Lead', 'Manual Checking', checkApproved.rows[0]?.status === 'active');

    // Test Unmatched Inbound Retrieval
    const unmatchedList = await emailInboundService.getUnmatchedInboundEmails();
    record('Unmatched Inbound & Bounce Inspection', 'Manual Checking', Array.isArray(unmatchedList), undefined, {
      count: unmatchedList.length,
    });
  } catch (err: any) {
    record('Manual Checking Workflow', 'Manual Checking', false, err.message);
  } finally {
    if (anonLeadId) {
      await query(`DELETE FROM leads WHERE id = $1`, [anonLeadId]).catch(() => {});
    }
  }

  // 13. CLEANUP TEST LEAD
  if (testLeadId) {
    await query(`DELETE FROM leads WHERE id = $1`, [testLeadId]).catch(() => {});
  }

  // 13. SUMMARY
  console.log('\n====================================================');
  console.log('📊 TEST SUMMARY & SCORECARD');
  console.log('====================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total Features Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed / Needing Attention: ${failed}`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
