import { parseImport, markDuplicates } from '../src/utils/parseImport';
import { query } from '../server/src/config/db';

async function runCsvTests() {
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  console.log('=== TEST 1: Formula Injection in Business Name ===');
  const formulaCsv = `business,email,phone
=HYPERLINK("http://evil.com","Click Me"),formula1@testdomain.org,+15551234567
+cmd|' /C calc'!A0,formula2@testdomain.org,+15551234568
@SUM(1,2),formula3@testdomain.org,+15551234569
-10+20,formula4@testdomain.org,+15551234570`;

  const parsedFormula = parseImport(formulaCsv);
  console.log('Parsed Formula Rows:', parsedFormula.map(r => ({ name: r.businessName, email: r.email })));

  const apiResFormula = await fetch('http://localhost:5001/api/leads/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      leads: parsedFormula.map(r => ({
        businessName: r.businessName,
        email: r.email,
        phone: r.phone,
        category: 'Test Formula',
      })),
      batchName: 'Formula Injection Test',
    }),
  });
  const formulaApiResult = await apiResFormula.json();
  console.log('API Import Formula Result:', formulaApiResult);

  // Check how they were stored in database
  const dbCheck = await query(`SELECT business_name, email FROM leads WHERE email LIKE 'formula%@testdomain.org'`);
  console.log('Stored in DB:', dbCheck.rows);

  // Clean up
  await query(`DELETE FROM leads WHERE email LIKE 'formula%@testdomain.org'`);

  console.log('\n=== TEST 2: Duplicate Emails Inside File ===');
  const duplicateCsv = `business,email,phone
Dupe Company A,dupe-in-file@testdomain.org,+15550001111
Dupe Company B,dupe-in-file@testdomain.org,+15550002222
Unique Company,unique-in-file@testdomain.org,+15550003333`;

  const parsedDupes = parseImport(duplicateCsv);
  const deduplicated = markDuplicates(parsedDupes, []);
  console.log('markDuplicates result:', deduplicated.map(r => ({
    name: r.businessName,
    email: r.email,
    isDuplicate: r.isDuplicate,
    reason: r.duplicateReason,
  })));

  const apiResDupe = await fetch('http://localhost:5001/api/leads/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      leads: parsedDupes.map(r => ({
        businessName: r.businessName,
        email: r.email,
        phone: r.phone,
      })),
      batchName: 'Duplicate Test',
    }),
  });
  const dupeApiResult = await apiResDupe.json();
  console.log('API Import Duplicate Result:', dupeApiResult);

  // Clean up
  await query(`DELETE FROM leads WHERE email IN ('dupe-in-file@testdomain.org', 'unique-in-file@testdomain.org')`);

  console.log('\n=== TEST 3: Quotes and Commas in Fields ===');
  const quotesCsv = `business,email,phone,notes
"Acme, Inc. (West)",quotes1@testdomain.org,+15553334444,"Said: ""Call back next week, please"""
"Baker & Sons, LLC",quotes2@testdomain.org,+15553334445,"Multi-part, comma, notes"`;
  const parsedQuotes = parseImport(quotesCsv);
  console.log('Parsed Quotes/Commas Rows:', parsedQuotes.map(r => ({
    name: r.businessName,
    email: r.email,
    notes: r.notes,
  })));

  console.log('\n=== TEST 4: Malformed Rows (Multi-line field with newline inside quotes) ===');
  const multilineCsv = `business,email,phone,notes
"Acme Multi
Line Inc",multiline@testdomain.org,+15554445555,"Note with
newline"`;
  const parsedMultiline = parseImport(multilineCsv);
  console.log('Parsed Multiline Rows Count:', parsedMultiline.length);
  console.log('Parsed Multiline Rows:', parsedMultiline.map(r => ({
    name: r.businessName,
    email: r.email,
  })));

  console.log('\n=== TEST 5: Wrong Encoding (Simulated non-UTF8 binary text) ===');
  // Buffer containing Latin-1 characters like ©, é, etc.
  const latin1Buf = Buffer.from('business,email,phone\nCafé René,cafe@testdomain.org,+15559998888\n', 'latin1');
  const decodedUtf8 = latin1Buf.toString('utf8');
  console.log('Decoded as UTF-8 (corrupted if not sanitized):', decodedUtf8);
  const parsedLatin1 = parseImport(decodedUtf8);
  console.log('Parsed Latin-1:', parsedLatin1.map(r => ({ name: r.businessName, email: r.email })));

  console.log('\n=== TEST 6: Large Scale / 50k Rows Performance Simulation ===');
  const t0 = Date.now();
  const largeBatch = [];
  for (let i = 0; i < 50000; i++) {
    largeBatch.push(`Company ${i},company${i}@testdomain.org,+1555${String(i).padStart(7, '0')}`);
  }
  const largeCsv = 'business,email,phone\n' + largeBatch.join('\n');
  console.log(`Generated 50,000 CSV lines in ${Date.now() - t0}ms. Testing parseImport speed...`);
  const t1 = Date.now();
  const parsedLarge = parseImport(largeCsv);
  console.log(`parseImport parsed ${parsedLarge.length} rows in ${Date.now() - t1}ms.`);

  // Test server memory / architectural limitation review:
  // Note: We don't send 50k rows to POST /api/leads/import because lines 1764 calls leadScraperService sequentially
  // which would hang or timeout the connection for hours.
}

runCsvTests().catch(console.error).then(() => process.exit(0));

