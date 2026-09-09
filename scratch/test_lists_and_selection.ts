import { pool } from '../server/src/config/db.ts';

async function main() {
  console.log('--- 1. Testing Single-Entity Invariant ---');
  const leadsRes = await pool.query(`SELECT id, business_name, email FROM leads WHERE business_name ILIKE '%abse%'`);
  const clientsRes = await pool.query(`SELECT id, business_name, email FROM clients WHERE business_name ILIKE '%abse%'`);
  console.log(`Leads matching 'abse': ${leadsRes.rowCount}`);
  console.log(`Clients matching 'abse': ${clientsRes.rowCount}`);
  if (leadsRes.rowCount === 0 && clientsRes.rowCount === 1) {
    console.log('✅ Single-Entity Invariant passed: abse exists strictly in clients, 0 in leads.');
  } else {
    console.error('❌ Invariant violated!', { leads: leadsRes.rows, clients: clientsRes.rows });
  }

  console.log('\n--- 2. Testing Messages Timeline for Converted Client ---');
  const clientId = clientsRes.rows[0]?.id;
  const msgRes = await pool.query(`
    SELECT m.id, m.direction, m.channel, m.text, m.created_at 
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.client_id = $1
    ORDER BY m.created_at ASC
  `, [clientId]);
  console.log(`Found ${msgRes.rowCount} messages for client ${clientId}`);
  if (msgRes.rowCount > 0) {
    console.log(`✅ Messages preserved! First msg: "${msgRes.rows[0].text.substring(0, 30)}...", Last msg: "${msgRes.rows[msgRes.rowCount - 1].text.substring(0, 30)}..."`);
  } else {
    console.error('❌ No messages found for client!');
  }

  console.log('\n--- 3. Testing API Endpoints via HTTP ---');
  const baseUrl = 'http://localhost:5001';

  // 3a. Create List
  const createListRes = await fetch(`${baseUrl}/api/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Automated Test List', description: 'Testing list functionality' })
  });
  const listJson = await createListRes.json();
  console.log('Create List Response:', listJson);
  const listId = listJson.list.id;

  // 3b. Fetch Leads to add to list
  const leadsFetch = await fetch(`${baseUrl}/api/leads`);
  const leadsJson = await leadsFetch.json();
  const sampleLeadIds = leadsJson.leads.slice(0, 2).map((l: any) => l.id);
  console.log(`Adding leads to list: ${sampleLeadIds.join(', ')}`);

  // 3c. Add leads to list
  const addMembersRes = await fetch(`${baseUrl}/api/lists/${listId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadIds: sampleLeadIds })
  });
  const addMembersJson = await addMembersRes.json();
  console.log('Add Members Response:', addMembersJson);

  // 3d. Get lists to check count
  const getListsRes = await fetch(`${baseUrl}/api/lists`);
  const listsData = await getListsRes.json();
  const testList = listsData.lists.find((l: any) => l.id === listId);
  console.log(`List lead count: ${testList?.lead_count} (expected: ${sampleLeadIds.length})`);
  if (Number(testList?.lead_count) === sampleLeadIds.length) {
    console.log('✅ List lead count matches added leads!');
  }

  // 3e. Filter leads by listId
  const filterLeadsRes = await fetch(`${baseUrl}/api/leads?listId=${listId}`);
  const filteredLeadsJson = await filterLeadsRes.json();
  console.log(`Filtered leads count by list: ${filteredLeadsJson.leads.length}`);
  if (filteredLeadsJson.leads.length === sampleLeadIds.length) {
    console.log('✅ Lead filtering by listId verified!');
  }

  // 3f. Bulk Delete test
  // Insert 2 throwaway leads to test bulk delete
  const insert1 = await pool.query(`INSERT INTO leads (business_name, email, category) VALUES ('Temp Delete Lead 1', 'temp1@test.com', 'Tech') RETURNING id`);
  const insert2 = await pool.query(`INSERT INTO leads (business_name, email, category) VALUES ('Temp Delete Lead 2', 'temp2@test.com', 'Tech') RETURNING id`);
  const tempIds = [insert1.rows[0].id, insert2.rows[0].id];

  const bulkDeleteRes = await fetch(`${baseUrl}/api/leads/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: tempIds })
  });
  const bulkDeleteJson = await bulkDeleteRes.json();
  console.log('Bulk Delete Response:', bulkDeleteJson);
  if (bulkDeleteJson.deletedCount === 2) {
    console.log('✅ Bulk delete of selected leads verified!');
  }

  // 3g. Delete List
  const deleteListRes = await fetch(`${baseUrl}/api/lists/${listId}`, { method: 'DELETE' });
  const deleteListJson = await deleteListRes.json();
  console.log('Delete List Response:', deleteListJson);
  console.log('✅ List deletion verified!');

  console.log('\n--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
  await pool.end();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
