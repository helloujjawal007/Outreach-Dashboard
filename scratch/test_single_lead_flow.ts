const BASE_URL = 'http://localhost:5001/api';

async function runTests() {
  console.log('--- Testing Single Lead Form & Ingestion Endpoints ---');

  const testEmail = `test.single.lead.${Date.now()}@example.com`;
  let createdLeadId: string | null = null;
  let testListId: string | null = null;

  try {
    // 1. Create a test custom list first
    const listRes = await fetch(`${BASE_URL}/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Test List ${Date.now()}`,
        description: 'Temporary list for single lead test',
      }),
    });
    const listData = await listRes.json();
    if (!listData.success) {
      throw new Error(`Failed to create list: ${JSON.stringify(listData)}`);
    }
    testListId = listData.list.id;
    console.log('✅ Created test list:', testListId, listData.list.name);

    // 2. Add single lead via POST /api/leads with listId
    const leadPayload = {
      businessName: 'Vortex Global Tech',
      category: 'Software & SaaS',
      email: testEmail,
      phone: '+1 415-555-0811',
      whatsapp: '+1 415-555-0811',
      instagram: '@vortexglobal',
      facebook: 'VortexGlobalTech',
      status: 'active',
      notes: 'Test lead added via Single Lead Ingestion Form.',
      listId: testListId,
    };

    const addRes = await fetch(`${BASE_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadPayload),
    });
    const addData = await addRes.json();
    if (addRes.status !== 201 || !addData.success) {
      throw new Error(`Failed to add single lead: ${JSON.stringify(addData)}`);
    }
    createdLeadId = addData.lead.id;
    console.log('✅ Single lead created successfully with ID:', createdLeadId);
    console.log('   Business:', addData.lead.business_name);
    console.log('   Email:', addData.lead.email);
    console.log('   Status:', addData.lead.status);

    // 3. Verify lead appears in GET /api/leads
    const getRes = await fetch(`${BASE_URL}/leads`);
    const getData = await getRes.json();
    const found = getData.leads.find((l: any) => l.id === createdLeadId);
    if (!found) {
      throw new Error('Created lead was not found in GET /api/leads');
    }
    console.log('✅ Lead confirmed present in database GET /api/leads');

    // 4. Verify duplicate detection on single lead creation
    const dupeRes = await fetch(`${BASE_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Another Company Name',
        email: testEmail, // duplicate!
      }),
    });
    const dupeData = await dupeRes.json();
    if (dupeRes.status === 409 && !dupeData.success) {
      console.log('✅ Duplicate detection verified! HTTP 409 returned:', dupeData.error);
    } else {
      throw new Error(`Duplicate detection failed! Expected 409, got ${dupeRes.status}: ${JSON.stringify(dupeData)}`);
    }

    // 5. Test adding an inactive single lead
    const inactiveEmail = `inactive.single.${Date.now()}@example.com`;
    const inactiveRes = await fetch(`${BASE_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Parked Lead Corp',
        category: 'Consulting',
        email: inactiveEmail,
        status: 'inactive',
      }),
    });
    const inactiveData = await inactiveRes.json();
    if (inactiveRes.status !== 201 || inactiveData.lead.status !== 'inactive') {
      throw new Error(`Failed to create inactive lead: ${JSON.stringify(inactiveData)}`);
    }
    console.log('✅ Inactive single lead created successfully. Status:', inactiveData.lead.status);

    // Clean up inactive lead
    await fetch(`${BASE_URL}/leads/${inactiveData.lead.id}/trash/permanent`, { method: 'DELETE' });

    // 6. Clean up active test lead and test list
    if (createdLeadId) {
      // Move to trash and permanent delete
      await fetch(`${BASE_URL}/leads/${createdLeadId}`, { method: 'DELETE' });
      await fetch(`${BASE_URL}/leads/${createdLeadId}/trash/permanent`, { method: 'DELETE' });
      console.log('✅ Test lead cleaned up');
    }
    if (testListId) {
      await fetch(`${BASE_URL}/lists/${testListId}`, { method: 'DELETE' });
      console.log('✅ Test list cleaned up');
    }

    console.log('\n🎉 ALL SINGLE LEAD INGESTION TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
