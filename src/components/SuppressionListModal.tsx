import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Plus,
  Trash2,
  X,
  RefreshCw,
  Download,
  AlertTriangle,
  Mail,
  Phone,
  Globe,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { SuppressedRecord, SuppressionStats } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SuppressionListModal({ isOpen, onClose }: Props) {
  const [records, setRecords] = useState<SuppressedRecord[]>([]);
  const [stats, setStats] = useState<SuppressionStats>({
    total: 0,
    unsubscribed: 0,
    hardBounce: 0,
    complaint: 0,
    manual: 0,
    invalidMx: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form fields
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newReason, setNewReason] = useState('unsubscribed');
  const [addError, setAddError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchSuppressionData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getSuppressionList({
        search: search.trim() || undefined,
        reason: selectedReason !== 'all' ? selectedReason : undefined,
      });
      if (res.success) {
        setRecords(res.records || []);
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err: any) {
      console.error('Failed to load suppression data:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedReason]);

  useEffect(() => {
    if (isOpen) {
      fetchSuppressionData();
    }
  }, [isOpen, fetchSuppressionData]);

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail && !newPhone && !newDomain) {
      setAddError('Please enter at least an email, phone number, or domain.');
      return;
    }

    try {
      setIsSubmitting(true);
      setAddError('');
      const res = await api.addSuppression({
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        domain: newDomain.trim() || undefined,
        reason: newReason,
      });

      if (res.success) {
        setStatusMessage(res.message);
        setNewEmail('');
        setNewPhone('');
        setNewDomain('');
        setShowAddForm(false);
        fetchSuppressionData();
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add suppression');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id: string, label: string) => {
    if (!window.confirm(`Unsuppress "${label}"? This will allow sending outbound messages again.`)) {
      return;
    }

    try {
      const res = await api.removeSuppression(id);
      if (res.success) {
        setStatusMessage(`Successfully unsuppressed "${label}"`);
        fetchSuppressionData();
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (err: any) {
      alert(`Failed to unsuppress: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleExportCsv = () => {
    if (records.length === 0) return;
    const headers = ['Email', 'Phone', 'Domain', 'Reason', 'Source', 'Added At'];
    const rows = records.map((r) => [
      r.email || '',
      r.phone || '',
      r.domain || '',
      r.reason || '',
      r.source || '',
      new Date(r.created_at).toLocaleString(),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `suppression_list_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getReasonBadge = (reason: string) => {
    const lower = reason.toLowerCase();
    if (lower.includes('unsub') || lower.includes('opt')) {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Unsubscribed</span>;
    }
    if (lower.includes('bounce') || lower.includes('dsn')) {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">Hard Bounce</span>;
    }
    if (lower.includes('mx') || lower.includes('domain')) {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">Invalid MX</span>;
    }
    if (lower.includes('complaint') || lower.includes('spam')) {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">Complaint</span>;
    }
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">{reason}</span>;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" width="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Global Suppression List
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {stats.total} suppressed
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Permanently blocked recipients. Outbound emails, drip sequences, and WhatsApp skip these automatically.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Suppression
            </button>
            <button
              onClick={handleExportCsv}
              disabled={records.length === 0}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={fetchSuppressionData}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {statusMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-xs text-slate-400">Total Blocked</div>
            <div className="text-xl font-bold text-white mt-1 font-mono">{stats.total}</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <div className="text-xs text-amber-400">Unsubscribed</div>
            <div className="text-xl font-bold text-amber-300 mt-1 font-mono">{stats.unsubscribed}</div>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
            <div className="text-xs text-rose-400">Hard Bounces</div>
            <div className="text-xl font-bold text-rose-300 mt-1 font-mono">{stats.hardBounce}</div>
          </div>
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
            <div className="text-xs text-red-400">Invalid MX</div>
            <div className="text-xl font-bold text-red-300 mt-1 font-mono">{stats.invalidMx}</div>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
            <div className="text-xs text-indigo-400">Manual / Staff</div>
            <div className="text-xl font-bold text-indigo-300 mt-1 font-mono">{stats.manual}</div>
          </div>
        </div>

        {/* Add Form Drawer */}
        {showAddForm && (
          <form
            onSubmit={handleAddSuppression}
            className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-400" />
                Add Entry to Global Suppression List
              </h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {addError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="prospect@company.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Phone Number (Optional)</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+1 210-555-0199"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Reason</label>
                <select
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="unsubscribed">Prospect Unsubscribed / Opted Out</option>
                  <option value="hard_bounce">Hard Bounce / Dead Mailbox</option>
                  <option value="complaint">Spam Complaint / Do Not Contact</option>
                  <option value="invalid_mx">Invalid Domain / No MX Records</option>
                  <option value="manual_request">Manual Staff Request</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Add to Suppression'}
              </button>
            </div>
          </form>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, phone, or domain..."
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'unsubscribed', label: 'Unsubscribes' },
              { id: 'hard_bounce', label: 'Bounces' },
              { id: 'invalid_mx', label: 'Invalid MX' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedReason(f.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedReason === f.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Records Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 sticky top-0 text-slate-400 font-medium uppercase tracking-wider border-b border-slate-800 z-10">
                <tr>
                  <th className="py-2.5 px-3">Target / Contact</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Suppressed At</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      {loading ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                          <span>Loading suppression list...</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
                          <p className="text-slate-400 font-medium">No suppressed contacts found</p>
                          <p className="text-slate-600 text-xs">Your sending list is clean and unblocked.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const label = r.email || r.phone || r.domain || 'Unknown';
                    return (
                      <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            {r.email ? (
                              <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            ) : r.phone ? (
                              <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            )}
                            <span className="font-mono text-xs">{label}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">{getReasonBadge(r.reason)}</td>
                        <td className="py-2.5 px-3 text-slate-400 capitalize">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                            {r.source.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleRemove(r.id, label)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Unsuppress contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Suppressed emails receive 0 outbound messages to safeguard domain reputation.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
