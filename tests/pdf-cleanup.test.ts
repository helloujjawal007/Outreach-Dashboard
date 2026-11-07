import fs from 'fs';
import path from 'path';
import { query } from '../server/src/config/db';

async function runPdfCleanupTest() {
  const token = (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SecureAdminPass2026_ODS!' }),
  }).then(r => r.json())).token;

  const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  const dummyPdfName = `test_audit_${Date.now()}.pdf`;
  const dummyPdfPath = path.join(auditsDir, dummyPdfName);
  fs.writeFileSync(dummyPdfPath, '%PDF-1.4 Dummy PDF Content for QA Test');
  console.log(`Created test PDF file on disk: ${dummyPdfPath}`);
  console.log(`File exists before delete: ${fs.existsSync(dummyPdfPath)}`);

  // Insert lead referencing this PDF
  const insertLead = await query<{ id: string }>(
    `INSERT INTO leads (business_name, email, audit_pdf_name, audit_pdf_path, status)
     VALUES ('PDF Cleanup Corp', 'pdfclean@domain.org', $1, $2, 'active')
     RETURNING id`,
    [dummyPdfName, dummyPdfPath]
  );
  const leadId = insertLead.rows[0].id;
  console.log(`Created lead ${leadId} referencing ${dummyPdfName}`);

  console.log('\n--- Scenario A: Soft Delete (DELETE /api/leads/:id) ---');
  const softDelRes = await fetch(`http://localhost:5001/api/leads/${leadId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log(`Soft delete status: ${softDelRes.status}`);
  console.log(`File exists after soft-delete: ${fs.existsSync(dummyPdfPath)}`);

  console.log('\n--- Scenario B: Permanent Delete (DELETE /api/leads/:id/permanent) ---');
  const permDelRes = await fetch(`http://localhost:5001/api/leads/${leadId}/permanent`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log(`Permanent delete status: ${permDelRes.status}`);
  const fileStillExists = fs.existsSync(dummyPdfPath);
  console.log(`File exists after permanent delete: ${fileStillExists}`);

  if (fileStillExists) {
    console.log('🚨 ORPHANED FILE CONFIRMED: Physical PDF remains on disk in server/data/audits/ after permanent lead purge.');
    fs.unlinkSync(dummyPdfPath);
    console.log('Cleaned up disk file manually.');
  }
}

runPdfCleanupTest().catch(console.error).then(() => process.exit(0));

