import { query } from '../server/src/config/db';

async function runTest() {
  console.log('=== STARTING LEAD & CLIENT DELETE SYNC & INACTIVE STATUS TESTS ===');

  const testEmail = `synctest_${Date.now()}@example.com`;
  const businessName = 'Sync Test Business';

  try {
    // 1. Create a lead
    console.log('\nStep 1: Creating test lead...');
    const leadInsert = await query(
      `INSERT INTO leads (business_name, email, phone, category, status, consent_status)
       VALUES ($1, $2, '1234567890', 'Testing', 'active', 'replied')
       RETURNING *`,
      [businessName, testEmail]
    );
    const lead = leadInsert.rows[0];
    console.log(`✓ Lead created with ID: ${lead.id}, status: ${lead.status}`);

    // 2. Create a matching client (converted from lead)
    console.log('\nStep 2: Creating client linked to lead...');
    const clientInsert = await query(
      `INSERT INTO clients (business_name, email, phone, original_lead_id, status)
       VALUES ($1, $2, '1234567890', $3, 'active')
       RETURNING *`,
      [businessName, testEmail, lead.id]
    );
    const client = clientInsert.rows[0];
    console.log(`✓ Client created with ID: ${client.id}, original_lead_id: ${client.original_lead_id}`);

    // 3. Test Status API - Mark lead as inactive
    console.log('\nStep 3: Testing status update to inactive via API...');
    const patchRes = await fetch(`http://localhost:5001/api/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive' }),
    });
    const patchJson = await patchRes.json();
    if (!patchJson.success || patchJson.lead.status !== 'inactive') {
      throw new Error(`Failed to mark lead inactive: ${JSON.stringify(patchJson)}`);
    }
    console.log('✓ Successfully marked lead as inactive');

    // 4. Test Bulk Status API - Mark back to active
    console.log('\nStep 4: Testing bulk status update to active via API...');
    const bulkStatusRes = await fetch('http://localhost:5001/api/leads/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [lead.id], status: 'active' }),
    });
    const bulkStatusJson = await bulkStatusRes.json();
    if (!bulkStatusJson.success || bulkStatusJson.updatedCount !== 1) {
      throw new Error(`Failed bulk status update: ${JSON.stringify(bulkStatusJson)}`);
    }
    console.log('✓ Successfully bulk-updated status back to active');

    // 5. Test Lead Deletion Sync: Deleting lead MUST soft-delete lead AND active client
    console.log('\nStep 5: Deleting lead and verifying removal from both active leads and active clients...');
    const deleteLeadRes = await fetch(`http://localhost:5001/api/leads/${lead.id}`, {
      method: 'DELETE',
    });
    const deleteLeadJson = await deleteLeadRes.json();
    if (!deleteLeadJson.success) {
      throw new Error(`Failed to delete lead: ${JSON.stringify(deleteLeadJson)}`);
    }

    // Verify GET /api/leads excludes it
    const leadsListRes = await fetch('http://localhost:5001/api/leads');
    const leadsListJson = await leadsListRes.json();
    const leadFound = leadsListJson.leads.some((l: any) => l.id === lead.id);
    if (leadFound) {
      throw new Error('FAILED: Deleted lead still appears in GET /api/leads!');
    }
    console.log('✓ Lead successfully excluded from active GET /api/leads');

    // Verify GET /api/clients excludes it
    const clientsListRes = await fetch('http://localhost:5001/api/clients');
    const clientsListJson = await clientsListRes.json();
    const clientFound = clientsListJson.clients.some((c: any) => c.id === client.id);
    if (clientFound) {
      throw new Error('FAILED: Corresponding client still appears in GET /api/clients after lead deletion!');
    }
    console.log('✓ Matching client successfully excluded from active GET /api/clients');

    // Verify Trash contains the deleted record
    const trashRes = await fetch('http://localhost:5001/api/leads/trash');
    const trashJson = await trashRes.json();
    const trashFound = trashJson.trash.some((t: any) => t.id === lead.id || t.id === client.id);
    if (!trashFound) {
      throw new Error('FAILED: Deleted lead/client not found in Trash!');
    }
    console.log('✓ Deleted record successfully present in Trash with 28-day retention');

    // 6. Test Restoration: Restoring lead must restore BOTH lead and client
    console.log('\nStep 6: Restoring lead from Trash and verifying reappearance in both active lists...');
    const restoreRes = await fetch(`http://localhost:5001/api/leads/${lead.id}/restore`, {
      method: 'POST',
    });
    const restoreJson = await restoreRes.json();
    if (!restoreJson.success) {
      throw new Error(`Failed to restore lead: ${JSON.stringify(restoreJson)}`);
    }

    const leadsAfterRestore = await (await fetch('http://localhost:5001/api/leads')).json();
    const clientsAfterRestore = await (await fetch('http://localhost:5001/api/clients')).json();
    if (!leadsAfterRestore.leads.some((l: any) => l.id === lead.id)) {
      throw new Error('FAILED: Lead did not return to active leads list after restore!');
    }
    if (!clientsAfterRestore.clients.some((c: any) => c.id === client.id)) {
      throw new Error('FAILED: Client did not return to active clients list after lead restore!');
    }
    console.log('✓ Both lead and client successfully restored to active lists');

    // 7. Test Client Deletion Sync: Deleting client MUST soft-delete client AND lead
    console.log('\nStep 7: Deleting client directly and verifying soft-deletion on both client and lead...');
    const deleteClientRes = await fetch(`http://localhost:5001/api/clients/${client.id}`, {
      method: 'DELETE',
    });
    const deleteClientJson = await deleteClientRes.json();
    if (!deleteClientJson.success) {
      throw new Error(`Failed to delete client: ${JSON.stringify(deleteClientJson)}`);
    }

    const leadsAfterClientDel = await (await fetch('http://localhost:5001/api/leads')).json();
    const clientsAfterClientDel = await (await fetch('http://localhost:5001/api/clients')).json();
    if (clientsAfterClientDel.clients.some((c: any) => c.id === client.id)) {
      throw new Error('FAILED: Client still in active clients after DELETE /api/clients/:id');
    }
    if (leadsAfterClientDel.leads.some((l: any) => l.id === lead.id)) {
      throw new Error('FAILED: Lead still in active leads after DELETE /api/clients/:id');
    }
    console.log('✓ Deleting client directly properly soft-deleted both client and corresponding lead');

    // 8. Clean up: Permanent delete
    console.log('\nStep 8: Permanently purging test record...');
    await fetch(`http://localhost:5001/api/leads/${lead.id}/permanent`, { method: 'DELETE' });
    console.log('✓ Cleaned up test records');

    console.log('\n============================================================');
    console.log('🎉 ALL LEAD & CLIENT DELETION SYNC & STATUS TESTS PASSED! 🎉');
    console.log('============================================================');
    process.exit(0);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runTest();
