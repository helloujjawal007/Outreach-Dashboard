import { useState, useCallback, useMemo } from 'react';
import { Upload, FileText, AlertTriangle, Copy, CheckCircle2, Inbox, FileUp } from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { parseImport, markDuplicates, markIncomplete, parsedRowToLead, type ParsedLeadRow } from '@/utils/parseImport';
import type { Store } from '@/store';
import type { Lead } from '@/types';

const sampleCsv = `business_name,category,phone,email,instagram,facebook,whatsapp
Harbor Light Books,Retail,+1 415-555-0190,orders@harborlightbooks.com,@harborlightbooks,HarborLightBooks,
Summit Auto Repair,Auto Services,+1 650-555-0145,service@summitauto.com,,,+1 650-555-0145
Zenith Yoga Studio,Fitness & Wellness,+1 510-555-0162,info@zenithyoga.com,@zenithyoga,ZenithYogaStudio,
Blue Wave Surf Shop,Retail,+1 415-555-0188,,@bluewavesurf,BlueWaveSurfShop,
Unknown Vendor,Misc,,,,,`;

interface Props {
  store: Store;
}

export function LeadImportPage({ store }: Props) {
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState<ParsedLeadRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const handleParse = useCallback(() => {
    const parsed = parseImport(rawText);
    const withDupes = markDuplicates(parsed, store.leads);
    const final = markIncomplete(withDupes);
    setRows(final);
    setHasParsed(true);
    setImportedCount(null);
  }, [rawText, store.leads]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text);
      const parsed = parseImport(text);
      const withDupes = markDuplicates(parsed, store.leads);
      const final = markIncomplete(withDupes);
      setRows(final);
      setHasParsed(true);
      setImportedCount(null);
    };
    reader.readAsText(file);
  }, [store.leads]);

  const handleImport = useCallback(() => {
    const validRows = rows.filter((r) => !r.isDuplicate);
    const newLeads: Lead[] = validRows.map(parsedRowToLead);
    store.addLeads(newLeads);
    setImportedCount(newLeads.length);
    setRows([]);
    setRawText('');
    setHasParsed(false);
  }, [rows, store]);

  const handleLoadSample = useCallback(() => {
    setRawText(sampleCsv);
    setHasParsed(false);
    setRows([]);
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const duplicates = rows.filter((r) => r.isDuplicate).length;
    const incomplete = rows.filter((r) => r.isIncomplete).length;
    const valid = total - duplicates - incomplete;
    return { total, duplicates, incomplete, valid };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Lead Import"
        subtitle="Paste raw text or upload a CSV to bulk-import leads into your pipeline."
        actions={
          <button onClick={handleLoadSample} className="btn-secondary">
            <FileText size={16} /> Load Sample
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText size={18} className="text-brand-600" />
            <h3 className="text-sm font-bold text-ink-900">Paste Raw Text / CSV</h3>
          </div>
          <p className="mb-3 text-xs text-ink-500">
            Expected columns: business_name, category, phone, email, instagram, facebook, whatsapp
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="business_name,category,phone,email,instagram,facebook,whatsapp&#10;Acme Corp,Retail,+1 555-0100,hello@acme.com,@acme,AcmeCorp,"
            rows={10}
            className="textarea font-mono text-xs"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={handleParse} disabled={!rawText.trim()} className="btn-primary">
              <FileText size={16} /> Parse & Preview
            </button>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileUp size={18} className="text-brand-600" />
            <h3 className="text-sm font-bold text-ink-900">Upload CSV File</h3>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-12 px-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50">
            <Upload size={28} className="text-ink-300 mb-2" />
            <span className="text-sm font-semibold text-ink-700">Click to upload a CSV file</span>
            <span className="mt-1 text-xs text-ink-500">Max 10MB — headers auto-detected</span>
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {importedCount !== null && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 animate-fade-in">
          <CheckCircle2 size={20} className="text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800">
            Successfully imported {importedCount} {importedCount === 1 ? 'lead' : 'leads'} into your pipeline.
          </p>
        </div>
      )}

      {hasParsed && rows.length === 0 && (
        <div className="mt-6 card">
          <EmptyState
            icon={<Inbox size={24} />}
            title="No rows parsed"
            description="Make sure your text includes comma-separated values with business name, email, or phone."
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 animate-fade-in">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink-900">Preview ({stats.total} rows)</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-ink-500">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  {stats.valid} valid
                </span>
                <span className="flex items-center gap-1.5 text-ink-500">
                  <Copy size={14} className="text-amber-600" />
                  {stats.duplicates} duplicate
                </span>
                <span className="flex items-center gap-1.5 text-ink-500">
                  <AlertTriangle size={14} className="text-red-600" />
                  {stats.incomplete} incomplete
                </span>
              </div>
              <button onClick={handleImport} className="btn-primary">
                <Upload size={16} /> Import {stats.valid} Lead{stats.valid !== 1 ? 's' : ''}
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Business Name</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Category</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Social</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Consent</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr
                      key={row.tempId}
                      className={`transition-colors hover:bg-slate-50 ${
                        row.isDuplicate ? 'bg-amber-50/50' : row.isIncomplete ? 'bg-red-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-ink-900">{row.businessName || <span className="text-ink-300 italic">Missing</span>}</td>
                      <td className="px-4 py-3 text-ink-500">{row.category || <span className="text-ink-300">—</span>}</td>
                      <td className="px-4 py-3 text-ink-500">{row.phone || <span className="text-ink-300">—</span>}</td>
                      <td className="px-4 py-3 text-ink-500">{row.email || <span className="text-ink-300">—</span>}</td>
                      <td className="px-4 py-3 text-ink-500">
                        {row.instagram || row.facebook || row.whatsapp ? (
                          <span className="flex flex-wrap gap-1">
                            {row.instagram && <span className="text-xs text-violet-600">{row.instagram}</span>}
                            {row.facebook && <span className="text-xs text-blue-600">{row.facebook}</span>}
                            {row.whatsapp && <span className="text-xs text-emerald-600">{row.whatsapp}</span>}
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="gray">none</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {row.isDuplicate ? (
                          <Badge variant="yellow"><Copy size={12} /> Possible duplicate</Badge>
                        ) : row.isIncomplete ? (
                          <Badge variant="red"><AlertTriangle size={12} /> No contact info</Badge>
                        ) : (
                          <Badge variant="green"><CheckCircle2 size={12} /> Ready</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
