import { useState, useEffect, useCallback } from 'react';
import { api, getStoredToken } from '@/services/api';
import type { FailureRecord, FailureType, SlotId } from '@/types';
import { SlotsPanel } from '@/components/SlotsPanel';
import {
  AlertTriangle,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  RotateCcw,
  ExternalLink,
  Mail,
  Clock,
  Check,
  XCircle,
  FileText,
  Trash2,
} from 'lucide-react';

export function FailuresPage() {
  const [records, setRecords] = useState<FailureRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; unresolved: number; byType: Record<string, number> }>({
    total: 0,
    unresolved: 0,
    byType: {},
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedSlot, setSelectedSlot] = useState<string>('ALL');
  const [resolvedFilter, setResolvedFilter] = useState<string>('unresolved'); // 'all' | 'unresolved' | 'resolved'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionInProgress, setActionInProgress] = useState<Record<string, string>>({}); // id -> action label
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<FailureRecord | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchFailures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getFailures({
        type: selectedType,
        slotId: selectedSlot,
        resolved: resolvedFilter === 'all' ? undefined : resolvedFilter === 'resolved',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: debouncedSearch || undefined,
        limit: 100,
      });

      if (res.success) {
        setRecords(res.records);
        setTotal(res.total);
        setStats(res.stats);
      }
    } catch (err: any) {
      console.error('[FailuresPage] fetch error:', err);
      setFeedback(`❌ Error loading failures: ${err?.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedType, selectedSlot, resolvedFilter, startDate, endDate, debouncedSearch]);

  useEffect(() => {
    fetchFailures();
  }, [fetchFailures]);

  const handleResolve = async (id: string) => {
    setActionInProgress((prev) => ({ ...prev, [id]: 'resolving' }));
    try {
      const res = await api.resolveFailure(id);
      if (res.success) {
        setFeedback('✓ Failure record marked as resolved');
        await fetchFailures();
      }
    } catch (err: any) {
      setFeedback(`❌ Resolve error: ${err?.message}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleRetry = async (id: string) => {
    setActionInProgress((prev) => ({ ...prev, [id]: 'retrying' }));
    try {
      const res = await api.retryFailure(id);
      if (res.success) {
        setFeedback(`⚡ ${res.message || 'Lead re-queued into active rotation. Audit initiated!'}`);
        await fetchFailures();
      } else {
        setFeedback(`⚠️ ${res.message || 'Cannot retry this lead.'}`);
      }
    } catch (err: any) {
      setFeedback(`❌ Retry error: ${err?.message}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleConfirmDeleteLead = async () => {
    if (!deleteConfirmRecord) return;
    const target = deleteConfirmRecord;
    setActionInProgress((prev) => ({ ...prev, [target.id]: 'deleting' }));
    try {
      const res = await api.deleteFailedLead(target.id);
      if (res.success) {
        setFeedback(`🗑️ ${res.message}`);
        setDeleteConfirmRecord(null);
        await fetchFailures();
      } else {
        setFeedback(`⚠️ ${res.message || 'Failed to delete lead'}`);
      }
    } catch (err: any) {
      setFeedback(`❌ Delete error: ${err?.message}`);
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleExportCsv = async () => {
    const url = api.getFailuresExportUrl({
      type: selectedType,
      slotId: selectedSlot,
      resolved: resolvedFilter === 'all' ? undefined : resolvedFilter === 'resolved',
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: debouncedSearch || undefined,
    });
    try {
      const token = getStoredToken();
      const response = await fetch(url, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Export failed (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `outreach-failures-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      setFeedback(`❌ Export error: ${err?.message || 'Failed to download CSV'}`);
    }
  };

  const typeBadges: Record<FailureType | string, { bg: string; text: string; label: string }> = {
    SEND_FAILED: { bg: 'bg-rose-100', text: 'text-rose-800', label: 'Send Failed' },
    AUDIT_FAILED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Audit Failed' },
    AUDIT_TIMEOUT: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Audit Timeout' },
    PDF_MISSING: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'PDF Missing' },
    REPORT_DELIVERY_FAILED: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Report Delivery' },
  };

  const slotPills: Record<SlotId, string> = {
    A: 'bg-blue-100 text-blue-800 border-blue-200',
    B: 'bg-purple-100 text-purple-800 border-purple-200',
    C: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    D: 'bg-amber-100 text-amber-800 border-amber-200',
    E: 'bg-rose-100 text-rose-800 border-rose-200',
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
      {/* Top Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Outreach Failure &amp; Audit Log</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
              {stats.unresolved} Open
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time tracking of SMTP bounces, TD audit timeouts, missing PDFs, and isolated leads.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {feedback && (
            <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white shadow-xs">
              {feedback}
            </span>
          )}
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors cursor-pointer"
            title="Download CSV export"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={fetchFailures}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 5-Slot Live Grid Overview Panel */}
      <SlotsPanel />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unresolved Failures</span>
            <span className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle size={16} />
            </span>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{stats.unresolved}</p>
          <span className="text-[11px] text-slate-400">Requires retry or manual review</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Logged</span>
            <span className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <FileText size={16} />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.total}</p>
          <span className="text-[11px] text-slate-400">All-time recorded issues</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Timeouts &amp; Missing</span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock size={16} />
            </span>
          </div>
          <p className="text-2xl font-black text-amber-600 mt-2">
            {(stats.byType['AUDIT_TIMEOUT'] || 0) + (stats.byType['PDF_MISSING'] || 0) + (stats.byType['AUDIT_FAILED'] || 0)}
          </p>
          <span className="text-[11px] text-slate-400">TD crawl or report delays</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Send / SMTP Errors</span>
            <span className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <Mail size={16} />
            </span>
          </div>
          <p className="text-2xl font-black text-purple-600 mt-2">
            {(stats.byType['SEND_FAILED'] || 0) + (stats.byType['REPORT_DELIVERY_FAILED'] || 0)}
          </p>
          <span className="text-[11px] text-slate-400">Socket drops, bounces, or auth fails</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search company, website, email, error text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="ALL">All Error Types</option>
              <option value="SEND_FAILED">Send Failed (SMTP)</option>
              <option value="AUDIT_FAILED">Audit Failed (TD)</option>
              <option value="AUDIT_TIMEOUT">Audit Timeout (3 retries)</option>
              <option value="PDF_MISSING">PDF Missing</option>
              <option value="REPORT_DELIVERY_FAILED">Report Delivery Failed</option>
            </select>
          </div>

          {/* Slot filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Slot:</span>
            <select
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="ALL">All Slots (A-E)</option>
              <option value="A">Slot A</option>
              <option value="B">Slot B</option>
              <option value="C">Slot C</option>
              <option value="D">Slot D</option>
              <option value="E">Slot E</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-500">Status:</span>
            <select
              value={resolvedFilter}
              onChange={(e) => setResolvedFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="unresolved">Open Only</option>
              <option value="resolved">Resolved Only</option>
              <option value="all">All Records</option>
            </select>
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs"
              title="Start Date"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs"
              title="End Date"
            />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Date / Time</th>
                <th className="py-3 px-4">Company &amp; Website</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Slot</th>
                <th className="py-3 px-4">Stage</th>
                <th className="py-3 px-4">Error Type</th>
                <th className="py-3 px-4">Error Details &amp; Retries</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-indigo-500" />
                    <span>Loading failure records...</span>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                    <p className="font-semibold text-slate-700">No failures matching criteria</p>
                    <p className="text-xs text-slate-400 mt-0.5">All outreach slots and audits are operating smoothly.</p>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const typeBadge = typeBadges[r.type] || { bg: 'bg-slate-100', text: 'text-slate-700', label: r.type };
                  const slotClass = r.slot_id ? slotPills[r.slot_id] : 'bg-slate-100 text-slate-600 border-slate-200';
                  const isResolving = actionInProgress[r.id] === 'resolving';
                  const isRetrying = actionInProgress[r.id] === 'retrying';
                  const isDeleting = actionInProgress[r.id] === 'deleting';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        <div>{new Date(r.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Company & Website */}
                      <td className="py-3 px-4 max-w-[200px]">
                        <div className="font-bold text-slate-900 truncate" title={r.company}>
                          {r.company || 'Unknown Lead'}
                        </div>
                        {r.website && (
                          <a
                            href={r.website.startsWith('http') ? r.website : `https://${r.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 truncate mt-0.5"
                          >
                            <span className="truncate">{r.website}</span>
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        )}
                      </td>

                      {/* Recipient Email */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-700 text-[11px]" title={r.email}>
                          {r.email || '--'}
                        </div>
                      </td>

                      {/* Slot */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {r.slot_id ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border ${slotClass}`}
                          >
                            Slot {r.slot_id}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">--</span>
                        )}
                      </td>

                      {/* Stage */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold">
                          {r.stage || 'initial'}
                        </span>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${typeBadge.bg} ${typeBadge.text}`}
                        >
                          {typeBadge.label}
                        </span>
                      </td>

                      {/* Error Details */}
                      <td className="py-3 px-4 max-w-[280px]">
                        <div className="text-slate-800 font-medium text-[11px] line-clamp-2" title={r.error_message}>
                          {r.error_message}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Attempts: <span className="font-bold text-slate-600">{r.attempts}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        {r.resolved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check size={10} /> Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle size={10} /> Open
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleRetry(r.id)}
                            disabled={isRetrying || isResolving || isDeleting}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Re-enqueue lead & trigger audit diagnostic"
                          >
                            <RotateCcw size={11} className={isRetrying ? 'animate-spin' : ''} />
                            <span>Retry</span>
                          </button>

                          {!r.resolved && (
                            <button
                              onClick={() => handleResolve(r.id)}
                              disabled={isResolving || isRetrying || isDeleting}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                              title="Mark issue resolved"
                            >
                              <Check size={11} />
                              <span>Resolve</span>
                            </button>
                          )}

                          <button
                            onClick={() => setDeleteConfirmRecord(r)}
                            disabled={isDeleting || isRetrying || isResolving}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Delete failed lead from CRM and remove this failure record"
                          >
                            <Trash2 size={11} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-800">{records.length}</strong> of{' '}
            <strong className="text-slate-800">{total}</strong> failures
          </span>
          <span className="text-[11px] text-slate-400">
            Failure telemetry for the 5-slot scheduler engine (click Refresh for latest)
          </span>
        </div>
      </div>

      {/* Delete Failed Lead Confirmation Modal */}
      {deleteConfirmRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Failed Lead</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Remove <strong className="text-slate-800">{deleteConfirmRecord.company || 'this lead'}</strong> from CRM &amp; active outreach queues and clear its failure logs?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <div><span className="font-semibold text-slate-700">Reason:</span> {deleteConfirmRecord.error_message}</div>
              {deleteConfirmRecord.email && <div><span className="font-semibold text-slate-700">Email:</span> {deleteConfirmRecord.email}</div>}
              {deleteConfirmRecord.website && <div><span className="font-semibold text-slate-700">Website:</span> {deleteConfirmRecord.website}</div>}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmRecord(null)}
                disabled={Boolean(actionInProgress[deleteConfirmRecord.id])}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLead}
                disabled={Boolean(actionInProgress[deleteConfirmRecord.id])}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{actionInProgress[deleteConfirmRecord.id] === 'deleting' ? 'Deleting...' : 'Delete Lead'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

