import { useState, useCallback, useMemo } from 'react';
import {
  Upload,
  FileText,
  AlertTriangle,
  Copy,
  CheckCircle2,
  Inbox,
  FileUp,
  Loader2,
  UserPlus,
  Building2,
  Mail,
  Phone,
  MessageCircle,
  Instagram,
  Globe,
  Tag,
  FolderPlus,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { PageHeader, type PageId } from '@/components/Sidebar';
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

const categorySuggestions = [
  'Software & SaaS',
  'Digital Marketing & Agency',
  'E-commerce & Retail',
  'Healthcare & Wellness',
  'Financial Services & Legal',
  'Real Estate & Construction',
  'Education & Coaching',
  'Hospitality & Restaurants',
  'Auto & Transportation',
  'Consulting & Professional Services',
];

interface SingleLeadFormData {
  businessName: string;
  category: string;
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  status: 'active' | 'inactive';
  listId: string;
  batchTag: string;
  notes: string;
}

const emptySingleLead: SingleLeadFormData = {
  businessName: '',
  category: '',
  email: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  status: 'active',
  listId: 'none',
  batchTag: '',
  notes: '',
};

const sampleLeadTemplates: SingleLeadFormData[] = [
  {
    businessName: 'Apex Cloud Systems',
    category: 'Software & SaaS',
    email: 'hello@apexcloud.io',
    phone: '+1 (415) 555-0199',
    whatsapp: '+1 (415) 555-0199',
    instagram: '@apexcloud',
    facebook: 'ApexCloudSystems',
    status: 'active',
    listId: 'none',
    batchTag: 'Inbound Inquiries',
    notes: 'CTO expressed interest in multi-channel outbound integration. Reach out by email first.',
  },
  {
    businessName: 'Lumina Dental Studio',
    category: 'Healthcare & Wellness',
    email: 'contact@luminadental.com',
    phone: '+1 (650) 555-0148',
    whatsapp: '+1 (650) 555-0148',
    instagram: '@luminadental',
    facebook: 'LuminaDentalStudio',
    status: 'active',
    listId: 'none',
    batchTag: 'Local Clinic Outreach',
    notes: 'Dr. Rivera requested appointment scheduling automation info.',
  },
  {
    businessName: 'Vanguard Marketing Lab',
    category: 'Digital Marketing & Agency',
    email: 'growth@vanguardagency.co',
    phone: '+1 (510) 555-0174',
    whatsapp: '+1 (510) 555-0174',
    instagram: '@vanguardgrowth',
    facebook: 'VanguardMarketingLab',
    status: 'inactive',
    listId: 'none',
    batchTag: 'Q3 Agency Prospects',
    notes: 'Contract up for renewal in 60 days. Parked as inactive until review.',
  },
];

interface Props {
  store: Store;
  onNavigate?: (page: PageId) => void;
}

export function LeadImportPage({ store, onNavigate }: Props) {
  // Tab state: 'single' form vs 'bulk' import
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single Lead Form state
  const [singleLead, setSingleLead] = useState<SingleLeadFormData>(emptySingleLead);
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);
  const [singleSuccess, setSingleSuccess] = useState<{
    lead: Lead;
    assignedListName?: string;
  } | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Bulk Import state
  const [rawText, setRawText] = useState('');
  const [batchName, setBatchName] = useState('');
  const [rows, setRows] = useState<ParsedLeadRow[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    incomplete: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Live duplicate warning for single lead form
  const duplicateWarning = useMemo(() => {
    const trimmed = singleLead.email.trim().toLowerCase();
    if (!trimmed) return null;
    const match = store.leads.find(
      (l) => l.email && l.email.toLowerCase() === trimmed && !l.deletedAt
    );
    if (match) {
      return {
        name: match.businessName,
        type: match.entityType === 'client' ? 'Active Client' : 'Active Lead',
        status: match.status,
      };
    }
    return null;
  }, [singleLead.email, store.leads]);

  // Handle Single Lead Submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleLead.businessName.trim()) {
      setSingleError('Business name is required.');
      return;
    }

    let formattedInstagram = singleLead.instagram.trim();
    if (
      formattedInstagram &&
      !formattedInstagram.startsWith('@') &&
      !formattedInstagram.startsWith('http')
    ) {
      formattedInstagram = `@${formattedInstagram}`;
    }

    try {
      setIsSubmittingSingle(true);
      setSingleError(null);
      setSingleSuccess(null);

      const created = await store.createSingleLead({
        businessName: singleLead.businessName.trim(),
        category: singleLead.category.trim() || undefined,
        email: singleLead.email.trim() || undefined,
        phone: singleLead.phone.trim() || undefined,
        whatsapp: singleLead.whatsapp.trim() || undefined,
        instagram: formattedInstagram || undefined,
        facebook: singleLead.facebook.trim() || undefined,
        status: singleLead.status,
        notes: singleLead.notes.trim() || undefined,
        listId: singleLead.listId !== 'none' ? singleLead.listId : undefined,
      });

      const assignedList = store.lists.find((l) => l.id === singleLead.listId)?.name;
      setSingleSuccess({
        lead: created,
        assignedListName: assignedList,
      });

      // Clear the form
      setSingleLead(emptySingleLead);
    } catch (err) {
      console.error('Failed to create single lead:', err);
      setSingleError(err instanceof Error ? err.message : 'Failed to create lead. Duplicate email or invalid data.');
    } finally {
      setIsSubmittingSingle(false);
    }
  };

  // Populate sample lead into form
  const handleFillSampleLead = () => {
    const randomTemplate = sampleLeadTemplates[Math.floor(Math.random() * sampleLeadTemplates.length)];
    setSingleLead({ ...randomTemplate });
    setSingleError(null);
    setSingleSuccess(null);
  };

  const handleResetSingleForm = () => {
    setSingleLead(emptySingleLead);
    setSingleError(null);
    setSingleSuccess(null);
  };

  // Bulk Import Handlers
  const handleParse = useCallback(() => {
    const parsed = parseImport(rawText);
    const withDupes = markDuplicates(parsed, store.leads);
    const final = markIncomplete(withDupes);
    setRows(final);
    setHasParsed(true);
    setImportResult(null);
    setImportError(null);
  }, [rawText, store.leads]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setImportResult(null);
        setImportError(null);
      };
      reader.readAsText(file);
    },
    [store.leads]
  );

  const handleImportBulk = useCallback(async () => {
    const validRows = rows.filter((r) => !r.isDuplicate && !r.isIncomplete);
    if (validRows.length === 0) return;

    try {
      setIsImporting(true);
      setImportError(null);
      const newLeads: Lead[] = validRows.map(parsedRowToLead);
      const res = await store.addLeads(newLeads, batchName.trim() || undefined);

      setImportResult({
        imported: res.importedCount,
        duplicates: res.duplicateCount,
        incomplete: res.incompleteCount,
      });

      setRows([]);
      setRawText('');
      setBatchName('');
      setHasParsed(false);
    } catch (err) {
      console.error('Import failed:', err);
      setImportError(err instanceof Error ? err.message : 'Import failed. Check server logs.');
    } finally {
      setIsImporting(false);
    }
  }, [rows, batchName, store]);

  const handleLoadSampleBulk = useCallback(() => {
    setRawText(sampleCsv);
    setHasParsed(false);
    setRows([]);
    setImportResult(null);
    setImportError(null);
  }, []);

  const bulkStats = useMemo(() => {
    const total = rows.length;
    const duplicates = rows.filter((r) => r.isDuplicate).length;
    const incomplete = rows.filter((r) => r.isIncomplete).length;
    const valid = rows.filter((r) => !r.isDuplicate && !r.isIncomplete).length;
    return { total, duplicates, incomplete, valid };
  }, [rows]);

  // Overall lead counts for stats card
  const leadStats = useMemo(() => {
    const all = store.leads || [];
    const activeLeads = all.filter((l) => l.entityType === 'lead' && l.status === 'active').length;
    const inactiveLeads = all.filter((l) => l.status === 'inactive').length;
    const clients = all.filter((l) => l.entityType === 'client').length;
    return {
      total: all.length,
      activeLeads,
      inactiveLeads,
      clients,
    };
  }, [store.leads]);

  // Recently created leads (top 3)
  const recentLeads = useMemo(() => {
    return [...(store.leads || [])]
      .filter((l) => l.entityType === 'lead')
      .slice(0, 3);
  }, [store.leads]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Lead Ingestion & Import"
        subtitle="Add individual leads manually with full contact channels and segmentation, or bulk-import via CSV / raw text with PostgreSQL deduplication."
      />

      {/* Mode / Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'single'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-ink-500 hover:text-ink-900 hover:bg-slate-200/50'
            }`}
          >
            <UserPlus size={16} className={activeTab === 'single' ? 'text-brand-600' : ''} />
            <span>Add Single Lead</span>
            <span
              className={`ml-1 text-[11px] rounded-full px-2 py-0.5 font-medium ${
                activeTab === 'single' ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-ink-500'
              }`}
            >
              Form
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === 'bulk'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-ink-500 hover:text-ink-900 hover:bg-slate-200/50'
            }`}
          >
            <Upload size={16} className={activeTab === 'bulk' ? 'text-brand-600' : ''} />
            <span>Bulk Import</span>
            <span
              className={`ml-1 text-[11px] rounded-full px-2 py-0.5 font-medium ${
                activeTab === 'bulk' ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-ink-500'
              }`}
            >
              CSV / Paste
            </span>
          </button>
        </div>

        {activeTab === 'single' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFillSampleLead}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-brand-700 border-brand-200 hover:bg-brand-50"
            >
              <Sparkles size={14} className="text-brand-600" />
              <span>Fill Sample Data</span>
            </button>
            <button
              type="button"
              onClick={handleResetSingleForm}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLoadSampleBulk}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <FileText size={14} />
            <span>Load Sample CSV</span>
          </button>
        )}
      </div>

      {/* TAB 1: SINGLE LEAD FORM */}
      {activeTab === 'single' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Form Column (2/3 width) */}
          <div className="lg:col-span-2 space-y-5">
            {/* Success Banner */}
            {singleSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm animate-fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-900">
                        Lead &ldquo;{singleSuccess.lead.businessName}&rdquo; registered successfully!
                      </h4>
                      <p className="mt-0.5 text-xs text-emerald-700">
                        Saved in PostgreSQL database with status{' '}
                        <span className="font-semibold capitalize">{singleSuccess.lead.status}</span>.
                        {singleSuccess.assignedListName && (
                          <span>
                            {' '}
                            Assigned to list: <strong>{singleSuccess.assignedListName}</strong>.
                          </span>
                        )}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {singleSuccess.lead.email && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100/80 px-2 py-0.5 text-xs text-emerald-800 font-mono">
                            <Mail size={12} /> {singleSuccess.lead.email}
                          </span>
                        )}
                        {singleSuccess.lead.phone && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100/80 px-2 py-0.5 text-xs text-emerald-800 font-mono">
                            <Phone size={12} /> {singleSuccess.lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('crm')}
                        className="btn bg-emerald-600 text-white hover:bg-emerald-700 text-xs py-1.5 px-3 flex items-center gap-1 font-semibold"
                      >
                        <span>View in CRM</span>
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {singleError && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in">
                <AlertTriangle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-900">Lead Registration Failed</h4>
                  <p className="mt-0.5 text-xs text-red-700">{singleError}</p>
                </div>
              </div>
            )}

            {/* Live Duplicate Warning */}
            {duplicateWarning && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 animate-fade-in">
                <Copy size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <span className="font-semibold">Duplicate Email Detected:</span> An active{' '}
                  <span className="font-bold">{duplicateWarning.type}</span> named{' '}
                  <span className="font-bold underline">{duplicateWarning.name}</span> with status{' '}
                  <span className="font-semibold uppercase text-amber-900">({duplicateWarning.status})</span> is already
                  registered. Duplicate prevention will block submission with this email.
                </div>
              </div>
            )}

            {/* Single Lead Form Card */}
            <form onSubmit={handleSingleSubmit} className="card p-6 shadow-sm border border-slate-200 space-y-6">
              {/* Form Title & Description */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 border border-brand-100">
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink-900">Single Lead Details</h3>
                    <p className="text-xs text-ink-500">
                      Fill out company information, communication channels, and initial list assignment.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 1: Company / Profile */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                  <Building2 size={14} className="text-brand-600" />
                  <span>Company Profile</span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="businessName">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="businessName"
                        type="text"
                        required
                        value={singleLead.businessName}
                        onChange={(e) => setSingleLead({ ...singleLead, businessName: e.target.value })}
                        placeholder="e.g. Acme Innovations Corp"
                        className="input font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="category">
                      Industry / Category
                    </label>
                    <input
                      id="category"
                      type="text"
                      list="category-options"
                      value={singleLead.category}
                      onChange={(e) => setSingleLead({ ...singleLead, category: e.target.value })}
                      placeholder="e.g. Software & SaaS"
                      className="input"
                    />
                    <datalist id="category-options">
                      {categorySuggestions.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>

              {/* Section 2: Contact Channels */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                    <Mail size={14} className="text-brand-600" />
                    <span>Outreach & Communication Channels</span>
                  </div>
                  <span className="text-[11px] text-ink-400">At least one channel recommended</span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label flex items-center justify-between" htmlFor="email">
                      <span className="flex items-center gap-1.5">
                        <Mail size={13} className="text-ink-400" /> Email Address
                      </span>
                      {duplicateWarning && <span className="text-[10px] text-amber-600 font-semibold">Exists</span>}
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={singleLead.email}
                      onChange={(e) => setSingleLead({ ...singleLead, email: e.target.value })}
                      placeholder="prospect@example.com"
                      className={`input ${
                        duplicateWarning ? 'border-amber-300 bg-amber-50/30 focus:border-amber-500' : ''
                      }`}
                    />
                  </div>

                  <div>
                    <label className="label flex items-center gap-1.5" htmlFor="phone">
                      <Phone size={13} className="text-ink-400" /> Phone Number
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={singleLead.phone}
                      onChange={(e) => setSingleLead({ ...singleLead, phone: e.target.value })}
                      placeholder="+1 (555) 234-5678"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label flex items-center gap-1.5" htmlFor="whatsapp">
                      <MessageCircle size={13} className="text-emerald-500" /> WhatsApp Number
                    </label>
                    <input
                      id="whatsapp"
                      type="tel"
                      value={singleLead.whatsapp}
                      onChange={(e) => setSingleLead({ ...singleLead, whatsapp: e.target.value })}
                      placeholder="+1 (555) 234-5678"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label flex items-center gap-1.5" htmlFor="instagram">
                      <Instagram size={13} className="text-violet-500" /> Instagram Handle
                    </label>
                    <input
                      id="instagram"
                      type="text"
                      value={singleLead.instagram}
                      onChange={(e) => setSingleLead({ ...singleLead, instagram: e.target.value })}
                      placeholder="@company_handle"
                      className="input"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label flex items-center gap-1.5" htmlFor="facebook">
                      <Globe size={13} className="text-blue-500" /> Facebook Page or Profile
                    </label>
                    <input
                      id="facebook"
                      type="text"
                      value={singleLead.facebook}
                      onChange={(e) => setSingleLead({ ...singleLead, facebook: e.target.value })}
                      placeholder="FacebookPageName or full profile URL"
                      className="input"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Status & List Segmentation */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                  <Tag size={14} className="text-brand-600" />
                  <span>Pipeline Status & List Assignment</span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="label">Initial Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSingleLead({ ...singleLead, status: 'active' })}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 px-2.5 text-xs font-semibold transition-all ${
                          singleLead.status === 'active'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100'
                            : 'border-slate-200 bg-white text-ink-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>Active</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSingleLead({ ...singleLead, status: 'inactive' })}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 px-2.5 text-xs font-semibold transition-all ${
                          singleLead.status === 'inactive'
                            ? 'border-amber-300 bg-amber-50 text-amber-800 ring-2 ring-amber-100'
                            : 'border-slate-200 bg-white text-ink-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>Inactive</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="listAssignment">
                      Assign to Custom List
                    </label>
                    <div className="relative">
                      <select
                        id="listAssignment"
                        value={singleLead.listId}
                        onChange={(e) => setSingleLead({ ...singleLead, listId: e.target.value })}
                        className="input bg-white pr-8 text-xs font-medium"
                      >
                        <option value="none">Default (No list)</option>
                        {store.lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name} ({list.lead_count ?? 0} leads)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor="batchTag">
                      Source / Batch Tag
                    </label>
                    <input
                      id="batchTag"
                      type="text"
                      value={singleLead.batchTag}
                      onChange={(e) => setSingleLead({ ...singleLead, batchTag: e.target.value })}
                      placeholder="e.g. Website Form, Referral"
                      className="input text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Outreach Notes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="label" htmlFor="leadNotes">
                  Internal Notes & Outreach Context
                </label>
                <textarea
                  id="leadNotes"
                  rows={3}
                  value={singleLead.notes}
                  onChange={(e) => setSingleLead({ ...singleLead, notes: e.target.value })}
                  placeholder="Add background information, meeting summary, target pain points, or specific instructions for sequence templates..."
                  className="textarea text-xs"
                />
              </div>

              {/* Form Submission Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResetSingleForm}
                  className="btn-secondary text-xs"
                >
                  Clear Fields
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmittingSingle || !singleLead.businessName.trim()}
                    className="btn-primary py-2.5 px-6 text-sm font-semibold shadow-sm"
                  >
                    {isSubmittingSingle ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Saving Lead...
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} /> Save Lead to CRM
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Right Sidebar Column (1/3 width): Stats, Tips, and Recent Leads */}
          <div className="space-y-6">
            {/* Quick Metrics Card */}
            <div className="card p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-3">
                Current Database Counts
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <div className="text-2xl font-black text-ink-900">{leadStats.activeLeads}</div>
                  <div className="text-xs font-medium text-emerald-600 flex items-center gap-1 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active Leads
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <div className="text-2xl font-black text-ink-900">{leadStats.inactiveLeads}</div>
                  <div className="text-xs font-medium text-amber-600 flex items-center gap-1 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Inactive Leads
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <div className="text-2xl font-black text-ink-900">{leadStats.clients}</div>
                  <div className="text-xs font-medium text-brand-600 flex items-center gap-1 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Converted Clients
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                  <div className="text-2xl font-black text-ink-900">{store.lists.length}</div>
                  <div className="text-xs font-medium text-violet-600 flex items-center gap-1 mt-0.5">
                    <FolderPlus size={12} /> Custom Lists
                  </div>
                </div>
              </div>
            </div>

            {/* Database & Safety Rules */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                <ShieldCheck size={16} className="text-brand-600" />
                <span>Enterprise Ingestion Rules</span>
              </div>
              <ul className="space-y-2.5 text-xs text-ink-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">
                    1
                  </span>
                  <span>
                    <strong>Strict Deduplication:</strong> Duplicate emails across active leads and active clients are rejected automatically to prevent double-contacting.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">
                    2
                  </span>
                  <span>
                    <strong>Single Entity Model:</strong> A contact is exclusively categorized as either a Lead or a Converted Client.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">
                    3
                  </span>
                  <span>
                    <strong>28-Day Trash Retention:</strong> Deleted records remain safely in Trash for 28 days with 1-click restore before auto-purge.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">
                    4
                  </span>
                  <span>
                    <strong>Automated Sequence Ready:</strong> Active leads with email can be sent first outreach messages directly from the CRM with one click.
                  </span>
                </li>
              </ul>
            </div>

            {/* Recently Registered Leads */}
            {recentLeads.length > 0 && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                    <Clock size={13} />
                    <span>Recent Leads in CRM</span>
                  </h4>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('crm')}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-800"
                    >
                      View all &rarr;
                    </button>
                  )}
                </div>
                <div className="space-y-2.5">
                  {recentLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-xs"
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold text-ink-800 truncate">{lead.businessName}</div>
                        <div className="text-[11px] text-ink-400 truncate">
                          {lead.email || lead.phone || lead.category || 'No contact'}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                          lead.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : lead.status === 'inactive'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {lead.status || 'active'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BULK IMPORT (CSV / RAW TEXT) */}
      {activeTab === 'bulk' && (
        <div className="space-y-6">
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
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!rawText.trim()}
                  className="btn-primary"
                >
                  <FileText size={16} /> Parse &amp; Review
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
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          {importResult && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 animate-fade-in">
              <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
              <div className="text-sm text-emerald-800">
                <span className="font-semibold">
                  Successfully imported {importResult.imported}{' '}
                  {importResult.imported === 1 ? 'lead' : 'leads'} into PostgreSQL.
                </span>
                {importResult.duplicates > 0 && (
                  <span className="ml-2 text-xs text-amber-700">
                    ({importResult.duplicates} duplicate{' '}
                    {importResult.duplicates === 1 ? 'record' : 'records'} skipped by database)
                  </span>
                )}
              </div>
            </div>
          )}

          {importError && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 animate-fade-in">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
              <p className="text-sm font-medium text-red-800">{importError}</p>
            </div>
          )}

          {hasParsed && rows.length === 0 && (
            <div className="card">
              <EmptyState
                icon={<Inbox size={24} />}
                title="No rows parsed"
                description="Make sure your text includes comma-separated values with business name, email, or phone."
              />
            </div>
          )}

          {rows.length > 0 && (
            <div className="animate-fade-in space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-ink-900">
                  Preview ({bulkStats.total} rows parsed)
                </h3>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-ink-700 font-medium">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      {bulkStats.valid} valid
                    </span>
                    <span className="flex items-center gap-1.5 text-ink-500">
                      <Copy size={14} className="text-amber-600" />
                      {bulkStats.duplicates} duplicates
                    </span>
                    <span className="flex items-center gap-1.5 text-ink-500">
                      <AlertTriangle size={14} className="text-red-600" />
                      {bulkStats.incomplete} incomplete
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      placeholder="Batch Name (e.g. Q3 Tech Founders)"
                      className="input py-1.5 px-3 text-xs w-56 font-medium"
                    />
                    <button
                      type="button"
                      onClick={handleImportBulk}
                      disabled={bulkStats.valid === 0 || isImporting}
                      className="btn-primary"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Importing...
                        </>
                      ) : (
                        <>
                          <Upload size={16} /> Import {bulkStats.valid} Lead
                          {bulkStats.valid !== 1 ? 's' : ''}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Business Name
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Category
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Email
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Social
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Status
                        </th>
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
                          <td className="px-4 py-3 font-medium text-ink-900">
                            {row.businessName || <span className="text-ink-300 italic">Missing</span>}
                          </td>
                          <td className="px-4 py-3 text-ink-500">
                            {row.category || <span className="text-ink-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-ink-500">
                            {row.phone || <span className="text-ink-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-ink-500">
                            {row.email || <span className="text-ink-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-ink-500">
                            {row.instagram || row.facebook || row.whatsapp ? (
                              <span className="flex flex-wrap gap-1">
                                {row.instagram && (
                                  <span className="text-xs text-violet-600">{row.instagram}</span>
                                )}
                                {row.facebook && (
                                  <span className="text-xs text-blue-600">{row.facebook}</span>
                                )}
                                {row.whatsapp && (
                                  <span className="text-xs text-emerald-600">{row.whatsapp}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {row.isDuplicate ? (
                              <Badge variant="yellow" title={row.duplicateReason}>
                                <Copy size={12} /> Duplicate
                              </Badge>
                            ) : row.isIncomplete ? (
                              <Badge variant="red">
                                <AlertTriangle size={12} /> No contact info
                              </Badge>
                            ) : (
                              <Badge variant="green">
                                <CheckCircle2 size={12} /> Ready
                              </Badge>
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
      )}
    </div>
  );
}
