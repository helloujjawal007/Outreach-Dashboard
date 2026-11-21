import 'dotenv/config';

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

    const data = await res.json();
    console.log('\n[API Response Summary]:', JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('\n✅ 5-Slot Pipeline Test Successfully Completed!');
      process.exit(0);
    } else {
      console.error('\n❌ 5-Slot Pipeline Test Failed:', data.error);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Failed to connect to backend on port 5001:', err?.message || err);
    process.exit(1);
  }
}

main();
