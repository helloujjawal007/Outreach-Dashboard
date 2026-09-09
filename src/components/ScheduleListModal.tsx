import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Send,
  Sparkles,
  Zap,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Layers,
  Check,
  Eye,
  Sliders,
  Users,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { Store } from '@/store';
import type { ScheduledDispatch, HumanizerPreviewResponse } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  store: Store;
  defaultListId?: string;
}

export function ScheduleListModal({ open, onClose, store, defaultListId }: Props) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'dispatches'>('schedule');

  // Form Configuration
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [style, setStyle] = useState<'conversational' | 'direct' | 'curious'>('conversational');
  const [stage, setStage] = useState<'auto' | 'initial' | 'followup_1' | 'followup_2'>('auto');
  const [customInstructions, setCustomInstructions] = useState<string>('');

  // Execution & Preview State
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<HumanizerPreviewResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Dispatches Queue Filter
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<string>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Initialize list and default date-time (1 hour from now)
  useEffect(() => {
    if (open) {
      const initialListId =
        defaultListId && defaultListId !== 'all' && defaultListId !== 'unassigned'
          ? defaultListId
          : store.lists.length > 0
          ? store.lists[0].id
          : '';
      setSelectedListId(initialListId);

      // Default schedule time to next hour rounded
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      setScheduledDateTime(localISOTime);
      setSubmitFeedback(null);
    }
  }, [open, defaultListId, store.lists]);

  // Count eligible leads with email in selected list
  const eligibleLeadsCount = useMemo(() => {
    if (!selectedListId) return 0;
    const targetList = store.lists.find((l) => l.id === selectedListId);
    if (!targetList) return 0;
    // Count from store.leads matching this list that have non-empty email
    const countInStore = store.leads.filter(
      (l) =>
        l.email &&
        l.email.trim() !== '' &&
        l.lists?.some((membership) => membership.id === selectedListId)
    ).length;
    return countInStore > 0 ? countInStore : targetList.lead_count;
  }, [selectedListId, store.lists, store.leads]);

  // Fetch sample humanized email preview
  const fetchPreview = useCallback(async () => {
    if (!open) return;
    setIsPreviewLoading(true);
    try {
      const res = await api.previewHumanizedEmail({
        listId: selectedListId || undefined,
        style,
        stage: stage === 'auto' ? undefined : stage,
        customInstructions: customInstructions.trim() || undefined,
      });
      setPreviewData(res);
    } catch (err) {
      console.error('Preview fetch failed:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [open, selectedListId, style, stage, customInstructions]);

  // Regenerate preview when parameters change
  useEffect(() => {
    if (open && activeTab === 'schedule') {
      fetchPreview();
    }
  }, [open, activeTab, selectedListId, style, stage, fetchPreview]);

  // Handle Dispatch / Scheduling Submit
  const handleScheduleSubmit = async () => {
    if (!selectedListId) {
      setSubmitFeedback({ type: 'error', message: 'Please select a custom list to schedule.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitFeedback(null);

      const targetScheduleTime =
        sendMode === 'now' ? 'now' : new Date(scheduledDateTime).toISOString();

      const result = await store.scheduleListDispatch({
        listId: selectedListId,
        scheduledFor: targetScheduleTime,
        style,
        stage,
        customInstructions: customInstructions.trim() || undefined,
      });

      if (result.success) {
        setSubmitFeedback({
          type: 'success',
          message: `${result.message} Check the Dispatches tab to monitor live progress.`,
        });
        // Refresh store lists and queue
        await store.fetchDispatches();
        // Automatically switch to dispatches tab after 1.2s to show queued/sent records
        setTimeout(() => {
          setActiveTab('dispatches');
        }, 1200);
      } else {
        setSubmitFeedback({
          type: 'error',
          message: result.message || 'Failed to schedule list dispatch.',
        });
      }
    } catch (err) {
      console.error('Schedule submit failed:', err);
      setSubmitFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to schedule emails.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel a scheduled dispatch
  const handleCancelDispatch = async (id: string) => {
    try {
      setCancellingId(id);
      await store.cancelScheduledDispatch(id);
    } catch (err) {
      console.error('Cancel dispatch failed:', err);
    } finally {
      setCancellingId(null);
    }
  };

  // Retry a failed or cancelled dispatch
  const handleRetryDispatch = async (id: string) => {
    try {
      setRetryingId(id);
      await store.retryScheduledDispatch(id);
    } catch (err) {
      console.error('Retry dispatch failed:', err);
    } finally {
      setRetryingId(null);
    }
  };

  // Filtered dispatches in Tab 2
  const filteredDispatches = useMemo(() => {
    if (dispatchStatusFilter === 'all') return store.dispatches;
    return store.dispatches.filter((d) => d.status === dispatchStatusFilter);
  }, [store.dispatches, dispatchStatusFilter]);

  const selectedListObj = store.lists.find((l) => l.id === selectedListId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Automated Email Outreach & Humanizer Engine"
      width="xl"
    >
      <div className="space-y-5">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'schedule'
                ? 'border-brand-600 text-brand-600 bg-brand-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap size={14} className={activeTab === 'schedule' ? 'text-brand-600' : 'text-slate-400'} />
            <span>Auto-Shoot & Schedule List</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('dispatches');
              store.fetchDispatches();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'dispatches'
                ? 'border-brand-600 text-brand-600 bg-brand-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={14} className={activeTab === 'dispatches' ? 'text-brand-600' : 'text-slate-400'} />
            <span>Scheduled Dispatches Queue</span>
            {store.dispatches.length > 0 && (
              <span className="rounded-full bg-slate-200 text-slate-800 px-1.5 py-0.2 text-[10px] font-bold">
                {store.dispatches.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'schedule' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Form Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Feedback Alert */}
              {submitFeedback && (
                <div
                  className={`p-3 rounded-lg flex items-start gap-2.5 text-xs font-medium ${
                    submitFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {submitFeedback.type === 'success' ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span>{submitFeedback.message}</span>
                </div>
              )}

              {/* 1. Choose Target List */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  1. Target Contact List
                </label>
                {store.lists.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    No custom lists found. Create a list or use "Add Filtered to List" on the CRM page first.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="input w-full text-xs font-semibold py-2"
                    >
                      {store.lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          🏷️ {l.name} ({l.lead_count} total members)
                        </option>
                      ))}
                    </select>
                    {selectedListObj && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                        <span className="flex items-center gap-1.5">
                          <Users size={12} className="text-brand-600" />
                          <span>Eligible for Email Outreach:</span>
                          <strong className="text-slate-800">{eligibleLeadsCount} leads</strong>
                        </span>
                        <span>List ID: {selectedListId.slice(0, 8)}...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Dispatch Timing Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  2. Dispatch Timing
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSendMode('now')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      sendMode === 'now'
                        ? 'border-brand-600 bg-brand-50/70 text-brand-900 ring-2 ring-brand-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Zap size={14} className={sendMode === 'now' ? 'text-brand-600' : 'text-slate-400'} />
                      <span>Shoot Automatically Now</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Auto-writes each email & sends right away with 2-3s pacing.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSendMode('later')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      sendMode === 'later'
                        ? 'border-brand-600 bg-brand-50/70 text-brand-900 ring-2 ring-brand-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Calendar size={14} className={sendMode === 'later' ? 'text-brand-600' : 'text-slate-400'} />
                      <span>Schedule for Specific Time</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Background scheduler shoots automatically at the set time.
                    </p>
                  </button>
                </div>

                {sendMode === 'later' && (
                  <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 animate-in fade-in">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Choose Date & Time for Automated Dispatch:
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="input w-full text-xs py-1.5 font-medium"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Local machine time. The background scheduler will automatically pick up and fire the emails.
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Anti-AI Humanizer Tone & Style */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    3. Anti-AI Humanizer Tone
                  </label>
                  <span className="text-[11px] text-brand-600 font-medium flex items-center gap-1">
                    <Sparkles size={11} />
                    Zero AI Clichés Guarantee
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'conversational',
                      label: 'Conversational',
                      badge: 'Recommended',
                      desc: 'Warm founder style, casual & low-pressure.',
                    },
                    {
                      id: 'direct',
                      label: 'Direct Angle',
                      badge: 'High Response',
                      desc: 'Clear value hook, 60-second consult offer.',
                    },
                    {
                      id: 'curious',
                      label: 'Consultative',
                      badge: 'Soft Inquiry',
                      desc: 'Asks about bottlenecks in their niche.',
                    },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyle(s.id as 'conversational' | 'direct' | 'curious')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        style === s.id
                          ? 'border-brand-500 bg-brand-50/80 ring-1 ring-brand-400 font-bold text-brand-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">{s.label}</span>
                        {style === s.id && <Check size={12} className="text-brand-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-tight font-normal">
                        {s.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Sequence Stage Handling */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  4. Sequence Stage Handling
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'auto', label: '🔄 Auto-Detect (Checks History)' },
                    { id: 'initial', label: '1️⃣ Force First Outreach' },
                    { id: 'followup_1', label: '2️⃣ Force Follow-up 1' },
                    { id: 'followup_2', label: '3️⃣ Force Follow-up 2' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStage(st.id as 'auto' | 'initial' | 'followup_1' | 'followup_2')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        stage === st.id
                          ? 'bg-ink-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  When set to <strong>Auto-Detect</strong>, each lead is individually checked: if they haven't been contacted yet, they receive the initial email; if previously contacted, they receive the appropriate follow-up.
                </p>
              </div>

              {/* Anti-SPAM & Google Compliance Safe Pacing Banner */}
              <div className="p-3 rounded-lg bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-900 space-y-0.5">
                  <p className="font-bold">Google SMTP Deliverability & Safe Pacing Active</p>
                  <p className="text-emerald-700">
                    Sends with 2-3s anti-burst pacing • Max 200/day warm-up limit enforced • Full List-Unsubscribe headers & opt-out footer included to prevent SPAM flagging.
                  </p>
                </div>
              </div>

              {/* Action Submit Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleScheduleSubmit}
                  disabled={isSubmitting || eligibleLeadsCount === 0 || store.lists.length === 0}
                  className="btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Processing & Enqueuing Emails...</span>
                    </>
                  ) : sendMode === 'now' ? (
                    <>
                      <Zap size={14} />
                      <span>Auto-Shoot {eligibleLeadsCount} Emails Now</span>
                    </>
                  ) : (
                    <>
                      <Calendar size={14} />
                      <span>Schedule {eligibleLeadsCount} Emails for {scheduledDateTime || 'Selected Time'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Live Humanizer Preview (5 cols) */}
            <div className="lg:col-span-5 flex flex-col h-full">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Eye size={13} className="text-brand-600" />
                  <span>Live Humanizer Preview</span>
                </label>
                <button
                  type="button"
                  onClick={fetchPreview}
                  disabled={isPreviewLoading}
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 hover:underline"
                  title="Generate another authentic variation"
                >
                  <RefreshCw size={11} className={isPreviewLoading ? 'animate-spin' : ''} />
                  <span>Regenerate Sample</span>
                </button>
              </div>

              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm flex flex-col justify-between">
                {previewData ? (
                  <div className="space-y-3">
                    {/* Recipient Card */}
                    <div className="bg-white rounded-lg p-2.5 border border-slate-200 text-xs shadow-2xs space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span>RECIPIENT SAMPLE</span>
                        <span className="capitalize px-1.5 py-0.2 rounded bg-brand-50 text-brand-700 font-bold text-[9px]">
                          {previewData.preview.stage.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="font-bold text-slate-800">
                        {previewData.sampleContact.primary_contact_name ||
                          previewData.sampleContact.business_name}
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Company: <span className="font-medium text-slate-700">{previewData.sampleContact.business_name}</span>
                      </p>
                      {previewData.sampleContact.category && (
                        <p className="text-slate-500 text-[11px]">
                          Industry: <span className="font-medium text-slate-700">{previewData.sampleContact.category}</span>
                        </p>
                      )}
                    </div>

                    {/* Email Subject */}
                    <div className="bg-white rounded-lg p-2.5 border border-slate-200 text-xs shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">SUBJECT LINE</span>
                      <p className="font-semibold text-slate-900">{previewData.preview.subject}</p>
                    </div>

                    {/* Email Body */}
                    <div className="bg-white rounded-lg p-3 border border-slate-200 text-xs shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">EMAIL BODY (HUMANIZED)</span>
                      <div className="text-slate-700 whitespace-pre-wrap leading-relaxed font-sans text-xs">
                        {previewData.preview.body}
                      </div>
                    </div>

                    {/* Engine Badge */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1 text-brand-600 font-medium">
                        <Sparkles size={11} />
                        {previewData.preview.modelUsed}
                      </span>
                      <span>No robotic patterns detected</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin text-brand-500 mb-2" />
                    <p className="text-xs">Generating humanized preview...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Scheduled Dispatches & Queue Monitor */
          <div className="space-y-4">
            {/* Filter Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Filter Queue:</span>
                <select
                  value={dispatchStatusFilter}
                  onChange={(e) => setDispatchStatusFilter(e.target.value)}
                  className="input text-xs py-1 px-2 font-medium"
                >
                  <option value="all">All Statuses ({store.dispatches.length})</option>
                  <option value="scheduled">Scheduled ({store.dispatches.filter((d) => d.status === 'scheduled').length})</option>
                  <option value="sent">Sent ({store.dispatches.filter((d) => d.status === 'sent').length})</option>
                  <option value="failed">Failed ({store.dispatches.filter((d) => d.status === 'failed').length})</option>
                  <option value="cancelled">Cancelled ({store.dispatches.filter((d) => d.status === 'cancelled').length})</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => store.fetchDispatches()}
                className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
              >
                <RefreshCw size={12} />
                <span>Refresh Queue</span>
              </button>
            </div>

            {/* Dispatches List */}
            {filteredDispatches.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <Clock size={28} className="mx-auto text-slate-400" />
                <h4 className="text-sm font-bold text-slate-700">No Dispatches Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  There are no email dispatches matching this filter. Switch to the first tab to schedule outreach for any custom list.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5">Recipient</th>
                      <th className="p-2.5">List & Stage</th>
                      <th className="p-2.5">Subject & Preview</th>
                      <th className="p-2.5">Scheduled / Sent At</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredDispatches.map((dispatch) => (
                      <tr key={dispatch.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5">
                          <p className="font-bold text-slate-900">{dispatch.recipient_name || 'Contact'}</p>
                          <p className="text-[11px] text-slate-500">{dispatch.recipient_email}</p>
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-semibold block w-fit mb-1">
                            🏷️ {dispatch.list_name || 'List'}
                          </span>
                          <span className="text-[10px] text-brand-600 font-medium capitalize">
                            {dispatch.stage.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-2.5 max-w-xs">
                          <p className="font-semibold text-slate-800 truncate">{dispatch.subject}</p>
                          <p className="text-[11px] text-slate-500 truncate">{dispatch.body}</p>
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-[11px]">
                          {dispatch.status === 'sent' && dispatch.sent_at ? (
                            <span className="text-emerald-700 font-medium">
                              Sent: {new Date(dispatch.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-slate-600">
                              {new Date(dispatch.scheduled_for).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {dispatch.status === 'sent' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <CheckCircle2 size={11} /> Sent
                            </span>
                          )}
                          {dispatch.status === 'scheduled' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <Clock size={11} /> Scheduled
                            </span>
                          )}
                          {dispatch.status === 'processing' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <RefreshCw size={11} className="animate-spin" /> Sending...
                            </span>
                          )}
                          {dispatch.status === 'failed' && (
                            <span
                              className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold flex items-center gap-1 w-fit"
                              title={dispatch.error_message || 'Failed'}
                            >
                              <XCircle size={11} /> Failed
                            </span>
                          )}
                          {dispatch.status === 'cancelled' && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold w-fit">
                              Cancelled
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right whitespace-nowrap">
                          {dispatch.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => handleCancelDispatch(dispatch.id)}
                              disabled={cancellingId === dispatch.id}
                              className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded hover:bg-rose-50 transition"
                            >
                              {cancellingId === dispatch.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                          {(dispatch.status === 'failed' || dispatch.status === 'cancelled') && (
                            <button
                              type="button"
                              onClick={() => handleRetryDispatch(dispatch.id)}
                              disabled={retryingId === dispatch.id}
                              className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold px-2 py-1 rounded hover:bg-brand-50 transition"
                            >
                              {retryingId === dispatch.id ? 'Requeuing...' : 'Retry'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
