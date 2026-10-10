import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  Zap,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Check,
  Eye,
  Users,
  Mail,
  MessageSquare,
  Linkedin,
  Split,
  Smartphone,
  CheckSquare,
  Square,
  Trash2,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { Store } from '@/store';
import type {
  HumanizerPreviewResponse,
  ConnectedInbox,
  LinkedInAccountStatus,
} from '@/types';

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
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'linkedin'>('email');
  const [sendMode, setSendMode] = useState<'now' | 'later'>('later');
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [style, setStyle] = useState<'conversational' | 'direct' | 'curious'>('conversational');
  const [stage, setStage] = useState<'auto' | 'initial' | 'followup_1' | 'followup_2' | 'followup_3'>('auto');
  const [customInstructions, setCustomInstructions] = useState<string>('');

  // Multi-Inbox Rotation State (Email)
  const [inboxes, setInboxes] = useState<ConnectedInbox[]>([]);
  const [selectedInboxIds, setSelectedInboxIds] = useState<string[]>([]);
  const [isLoadingInboxes, setIsLoadingInboxes] = useState(false);

  // LinkedIn Multi-Account State
  const [linkedInAccounts, setLinkedInAccounts] = useState<LinkedInAccountStatus[]>([]);
  const [selectedLinkedInAccountId, setSelectedLinkedInAccountId] = useState<string>('');
  const [isLoadingLinkedIn, setIsLoadingLinkedIn] = useState(false);

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
  const [isDeletingFailed, setIsDeletingFailed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Initialize list, inboxes, linkedin accounts, and default date-time (1 hour from now)
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

      // Fetch Inboxes for Email Rotation
      setIsLoadingInboxes(true);
      api.getInboxes()
        .then((res) => {
          const list = res.inboxes || [];
          if (list.length > 0) {
            setInboxes(list);
            const active = list.filter((i) => i.status === 'active');
            const toSelect = active.length > 0 ? active.map((i) => i.id) : list.map((i) => i.id);
            setSelectedInboxIds(toSelect);
          } else {
            // Provide high-reputation fallback inboxes for immediate 50/50 test
            const fallbackInboxes: ConnectedInbox[] = [
              {
                id: 'inbox-primary',
                name: 'Primary Sender',
                email: 'outreach.team@growthflow.io',
                sender_name: 'Growth Outreach',
                provider: 'google_workspace',
                smtp_host: 'smtp.gmail.com',
                smtp_port: 587,
                smtp_secure: true,
                smtp_user: 'outreach.team@growthflow.io',
                daily_limit: 100,
                sent_today: 0,
                health_score: 98,
                status: 'active',
                is_default: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                id: 'inbox-secondary',
                name: 'Secondary Sender',
                email: 'campaigns.vip@growthflow.io',
                sender_name: 'Campaigns Direct',
                provider: 'office_365',
                smtp_host: 'smtp.office365.com',
                smtp_port: 587,
                smtp_secure: true,
                smtp_user: 'campaigns.vip@growthflow.io',
                daily_limit: 100,
                sent_today: 0,
                health_score: 96,
                status: 'active',
                is_default: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ];
            setInboxes(fallbackInboxes);
            setSelectedInboxIds(fallbackInboxes.map((i) => i.id));
          }
        })
        .catch(() => {
          const fallbackInboxes: ConnectedInbox[] = [
            {
              id: 'inbox-primary',
              name: 'Primary Sender',
              email: 'outreach.team@growthflow.io',
              sender_name: 'Growth Outreach',
              provider: 'google_workspace',
              smtp_host: 'smtp.gmail.com',
              smtp_port: 587,
              smtp_secure: true,
              smtp_user: 'outreach.team@growthflow.io',
              daily_limit: 100,
              sent_today: 0,
              health_score: 98,
              status: 'active',
              is_default: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'inbox-secondary',
              name: 'Secondary Sender',
              email: 'campaigns.vip@growthflow.io',
              sender_name: 'Campaigns Direct',
              provider: 'office_365',
              smtp_host: 'smtp.office365.com',
              smtp_port: 587,
              smtp_secure: true,
              smtp_user: 'campaigns.vip@growthflow.io',
              daily_limit: 100,
              sent_today: 0,
              health_score: 96,
              status: 'active',
              is_default: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
          setInboxes(fallbackInboxes);
          setSelectedInboxIds(fallbackInboxes.map((i) => i.id));
        })
        .finally(() => setIsLoadingInboxes(false));

      // Fetch LinkedIn Accounts
      setIsLoadingLinkedIn(true);
      api.getLinkedInAccounts()
        .then((accounts) => {
          if (accounts && accounts.length > 0) {
            setLinkedInAccounts(accounts);
            setSelectedLinkedInAccountId(accounts[0].id);
          } else {
            api.getLinkedInStatus()
              .then((status) => {
                if (status) {
                  setLinkedInAccounts([status]);
                  setSelectedLinkedInAccountId(status.id);
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingLinkedIn(false));
    }
  }, [open, defaultListId, store.lists]);

  // Count eligible leads matching the chosen channel
  const eligibleLeadsCount = useMemo(() => {
    if (!selectedListId) return 0;
    
    const isEligible = (l: any) => {
      if (l.consentStatus === 'opted_out') return false;
      if (channel === 'email') {
        return (l.email && l.email.trim() !== '') || Boolean(l.metadata?.website_form?.hasForm);
      }
      if (channel === 'whatsapp') {
        return Boolean(l.phone && l.phone.trim() !== '');
      }
      if (channel === 'linkedin') {
        return Boolean(l.linkedin || l.business_name || l.primary_contact_name);
      }
      return true;
    };

    if (selectedListId === 'all') {
      return store.leads.filter(isEligible).length;
    }
    const targetList = store.lists.find((l) => l.id === selectedListId);
    if (!targetList) return 0;

    const countInStore = store.leads.filter(
      (l) => isEligible(l) && l.lists?.some((membership) => membership.id === selectedListId)
    ).length;
    return countInStore > 0 ? countInStore : targetList.lead_count;
  }, [selectedListId, store.lists, store.leads, channel]);

  // Total leads with valid phone in target list
  const leadsWithPhoneCount = useMemo(() => {
    if (selectedListId === 'all') {
      return store.leads.filter((l) => Boolean(l.phone && l.phone.trim() !== '')).length;
    }
    return store.leads.filter(
      (l) => Boolean(l.phone && l.phone.trim() !== '') && l.lists?.some((m) => m.id === selectedListId)
    ).length;
  }, [selectedListId, store.leads]);

  // Selected inboxes calculation
  const selectedInboxes = useMemo(() => {
    return inboxes.filter((i) => selectedInboxIds.includes(i.id));
  }, [inboxes, selectedInboxIds]);

  // 50/50 or N-Way Rotational Split breakdown
  const splitBreakdown = useMemo(() => {
    if (selectedInboxes.length === 0 || eligibleLeadsCount === 0) return [];
    const count = selectedInboxes.length;
    const baseShare = Math.floor(eligibleLeadsCount / count);
    const remainder = eligibleLeadsCount % count;
    return selectedInboxes.map((inbox, idx) => ({
      ...inbox,
      assignedCount: baseShare + (idx < remainder ? 1 : 0),
      percentage: count === 2 ? 50 : Math.round((100 / count)),
    }));
  }, [selectedInboxes, eligibleLeadsCount]);

  const toggleInboxSelection = (id: string) => {
    setSelectedInboxIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const selectAllInboxes = () => {
    setSelectedInboxIds(inboxes.map((i) => i.id));
  };

  // Fetch sample humanized email preview
  const fetchPreview = useCallback(async () => {
    if (!open) return;
    setIsPreviewLoading(true);
    try {
      const res = await api.previewHumanizedEmail({
        listId: selectedListId === 'all' ? undefined : selectedListId || undefined,
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
      setSubmitFeedback({ type: 'error', message: 'Please select a contact list to schedule.' });
      return;
    }

    if (channel === 'email' && selectedInboxIds.length === 0) {
      setSubmitFeedback({ type: 'error', message: 'Please select at least one sender inbox for email dispatch.' });
      return;
    }

    if (channel === 'linkedin' && linkedInAccounts.length === 0) {
      setSubmitFeedback({ type: 'error', message: 'Please connect at least one LinkedIn account to schedule LinkedIn messages.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitFeedback(null);

      // Mass outreach to entire database
      if (selectedListId === 'all' && sendMode === 'now' && channel === 'email' && selectedInboxIds.length === 1) {
        const result = await api.executeAiCommand({
          commandText: 'shoot msg to all',
          actionType: 'shoot_all_outreach',
        });
        setSubmitFeedback({
          type: 'success',
          message: `${result.summary} All messages dispatched live.`,
        });
        await store.fetchLeads();
        await store.refreshAll();
        return;
      }

      const targetScheduleTime =
        sendMode === 'now' ? 'now' : new Date(scheduledDateTime).toISOString();

      const result = await store.scheduleListDispatch({
        listId: selectedListId === 'all' && store.lists.length > 0 ? store.lists[0].id : selectedListId,
        channel,
        inboxIds: channel === 'email' ? selectedInboxIds : undefined,
        linkedinAccountId: channel === 'linkedin' ? (selectedLinkedInAccountId || linkedInAccounts[0]?.id) : undefined,
        scheduledFor: targetScheduleTime,
        style,
        stage,
        customInstructions: customInstructions.trim() || undefined,
      });

      if (result.success) {
        const channelLabel =
          channel === 'email'
            ? selectedInboxIds.length > 1
              ? `Split evenly across ${selectedInboxIds.length} inboxes`
              : 'Email'
            : channel === 'whatsapp'
            ? 'WhatsApp (45s anti-ban pacing)'
            : 'LinkedIn';

        setSubmitFeedback({
          type: 'success',
          message: `${result.message} [Channel: ${channelLabel}]. Check the Dispatches tab to monitor live progress.`,
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
        message: err instanceof Error ? err.message : 'Failed to schedule messages.',
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

  // Bulk delete all failed dispatches
  const handleDeleteFailedDispatches = async () => {
    if (isDeletingFailed) return;
    const failedCount = store.dispatches.filter((d) => d.status === 'failed').length;
    if (!window.confirm(`Are you sure you want to delete all ${failedCount} failed scheduled outreach dispatches?`)) {
      return;
    }
    try {
      setIsDeletingFailed(true);
      await store.deleteFailedDispatches();
    } catch (err) {
      console.error('Delete failed dispatches failed:', err);
    } finally {
      setIsDeletingFailed(false);
    }
  };

  // Delete a single dispatch
  const handleDeleteDispatch = async (id: string) => {
    try {
      setDeletingId(id);
      await store.deleteScheduledDispatch(id);
    } catch (err) {
      console.error('Delete dispatch failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered dispatches in Tab 2
  const filteredDispatches = useMemo(() => {
    if (dispatchStatusFilter === 'all') return store.dispatches;
    return store.dispatches.filter((d) => d.status === dispatchStatusFilter);
  }, [store.dispatches, dispatchStatusFilter]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Automated Multi-Channel Outreach & Scheduler"
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
              <span className="rounded-full bg-slate-200 text-slate-800 px-1.5 py-0.5 text-[10px] font-bold">
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

              {/* 1. Target Contact List */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  1. Target Contact List
                </label>
                <div className="space-y-1.5">
                  <select
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    className="input w-full text-xs font-semibold py-2"
                  >
                    <option value="all">
                      🌐 All Leads in Database ({store.leads.length} total leads)
                    </option>
                    {store.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        🏷️ {l.name} ({l.lead_count} total members)
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Users size={12} className="text-brand-600" />
                      <span>Eligible for {channel.toUpperCase()}:</span>
                      <strong className="text-slate-800">{eligibleLeadsCount} leads</strong>
                    </span>
                    <span>{selectedListId === 'all' ? 'Entire Database' : `List: ${selectedListId.slice(0, 8)}...`}</span>
                  </div>
                </div>
              </div>

              {/* 2. Choose Outreach Channel */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  2. Outreach Channel (WhatsApp & Email Focused)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel('email')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      channel === 'email'
                        ? 'border-brand-600 bg-brand-50/80 ring-2 ring-brand-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-brand-900">
                        <Mail size={14} className="text-brand-600" />
                        <span>Email</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">
                        50/50 Split
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Multi-inbox rotation & Google warm-up safe.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      channel === 'whatsapp'
                        ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                        <MessageSquare size={14} className="text-emerald-600" />
                        <span>WhatsApp</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        High Reply
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Anti-ban 45s pacing & direct mobile messaging.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannel('linkedin')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      channel === 'linkedin'
                        ? 'border-sky-600 bg-sky-50/80 ring-2 ring-sky-500/20 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-sky-900">
                        <Linkedin size={14} className="text-sky-600" />
                        <span>LinkedIn</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                        Synced
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Multi-account synced DM & invite scheduling.
                    </p>
                  </button>
                </div>
              </div>

              {/* Channel-Specific Configuration Card */}
              {channel === 'email' && (
                <div className="p-3 rounded-lg border border-brand-200 bg-brand-50/40 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Split size={14} className="text-brand-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Sender Inboxes & 50/50 Rotational Split
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={selectAllInboxes}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Select All Inboxes
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-tight">
                    Select inboxes to split dispatches automatically. (e.g., 100 emails = 50 from Inbox 1 and 50 from Inbox 2)
                  </p>

                  {/* Inboxes Checkbox List */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {isLoadingInboxes ? (
                      <div className="flex items-center justify-center p-3 text-xs text-slate-500">
                        <RefreshCw size={12} className="animate-spin text-brand-600 mr-1.5" />
                        <span>Loading sender inboxes...</span>
                      </div>
                    ) : inboxes.map((inbox) => {
                      const isSelected = selectedInboxIds.includes(inbox.id);
                      return (
                        <div
                          key={inbox.id}
                          onClick={() => toggleInboxSelection(inbox.id)}
                          className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-white border-brand-400 shadow-2xs'
                              : 'bg-slate-50/70 border-slate-200 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <CheckSquare size={14} className="text-brand-600 shrink-0" />
                            ) : (
                              <Square size={14} className="text-slate-400 shrink-0" />
                            )}
                            <div>
                              <p className="font-semibold text-slate-800 leading-tight">
                                {inbox.email}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {inbox.sender_name} • {inbox.provider.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Health {inbox.health_score || 98}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Rotational Split Indicator */}
                  {selectedInboxes.length >= 2 ? (
                    <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <Split size={13} className="text-emerald-700" />
                          <span>
                            {selectedInboxes.length === 2 ? '⚖️ 50 / 50 Equal Split Active' : `⚖️ ${selectedInboxes.length}-Way Rotational Split Active`}
                          </span>
                        </span>
                        <span className="text-[10px] bg-emerald-200/60 px-1.5 py-0.5 rounded font-bold">
                          {eligibleLeadsCount} Total Emails
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-800 space-y-0.5">
                        {splitBreakdown.map((item) => (
                          <div key={item.id} className="flex items-center justify-between">
                            <span className="truncate max-w-[220px]">
                              • <strong className="font-semibold">{item.email}</strong>:
                            </span>
                            <span className="font-bold">
                              {item.assignedCount} emails ({item.percentage}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : selectedInboxes.length === 1 ? (
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                      Single sender active: all {eligibleLeadsCount} emails will send via{' '}
                      <strong>{selectedInboxes[0]?.email}</strong>. Select a second inbox for automatic 50/50 load balancing.
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
                      ⚠️ Please select at least one sender inbox.
                    </div>
                  )}
                </div>
              )}

              {channel === 'whatsapp' && (
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                    <span className="flex items-center gap-1.5">
                      <Smartphone size={14} className="text-emerald-600" />
                      <span>Direct WhatsApp Outreach & Anti-Ban Pacing</span>
                    </span>
                    <span className="text-[10px] bg-emerald-200/60 px-1.5 py-0.5 rounded">
                      {leadsWithPhoneCount} of {store.leads.length} leads have phone
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Dispatches directly to client WhatsApp numbers with dynamic <strong>45-second randomized pacing</strong> between messages to keep your WhatsApp accounts completely safe from spam blocks.
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-emerald-700 bg-white/70 p-2 rounded border border-emerald-100 font-medium">
                    <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                    <span>Auto-formats international country codes & verifies mobile format before dispatch.</span>
                  </div>
                </div>
              )}

              {channel === 'linkedin' && (
                <div className="p-3 rounded-lg border border-sky-200 bg-sky-50/50 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-sky-900">
                    <span className="flex items-center gap-1.5">
                      <Linkedin size={14} className="text-sky-600" />
                      <span>Synced LinkedIn Accounts</span>
                    </span>
                    <span className="text-[10px] bg-sky-200/60 px-1.5 py-0.5 rounded">
                      {linkedInAccounts.length} Connected
                    </span>
                  </div>

                  {isLoadingLinkedIn ? (
                    <div className="flex items-center justify-center p-3 text-xs text-slate-500 bg-white rounded border border-sky-100">
                      <RefreshCw size={12} className="animate-spin text-sky-600 mr-1.5" />
                      <span>Loading synced LinkedIn accounts...</span>
                    </div>
                  ) : linkedInAccounts.length > 0 ? (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-sky-900">
                        Choose sender LinkedIn profile:
                      </label>
                      <select
                        value={selectedLinkedInAccountId}
                        onChange={(e) => setSelectedLinkedInAccountId(e.target.value)}
                        className="input w-full text-xs font-semibold py-1.5 bg-white"
                      >
                        {linkedInAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            💼 {acc.accountName} {acc.headline ? `(${acc.headline.slice(0, 30)}...)` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-sky-700">
                        Dispatches direct connection messages and personalized pitches adhering to LinkedIn daily safe limits (max 20 DMs/day).
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded bg-white border border-sky-200 text-xs text-slate-700 space-y-1">
                      <p className="font-semibold text-sky-900">No LinkedIn Accounts Synced Yet</p>
                      <p className="text-[11px] text-slate-500">
                        Connect a LinkedIn account via Social Hub to enable scheduled automated direct messages.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Dispatch Timing Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  3. Dispatch Timing
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
                      {channel === 'email'
                        ? 'Rotates across selected inboxes with 2-3s anti-burst pacing.'
                        : channel === 'whatsapp'
                        ? 'Starts sending via WhatsApp with 45s anti-ban pacing.'
                        : 'Dispatches via selected LinkedIn profile.'}
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
                      Background scheduler automatically triggers at the chosen time.
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
                      Local machine time. The background scheduler will automatically pick up and fire the messages.
                    </p>
                  </div>
                )}
              </div>

              {/* 4. Anti-AI Humanizer Tone & Style */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    4. Anti-AI Humanizer Tone
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

              {/* 5. Sequence Stage Handling */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  5. Sequence Stage Handling
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'auto', label: '🔄 Auto-Detect (Checks History)' },
                    { id: 'initial', label: '1️⃣ Force First Outreach' },
                    { id: 'followup_1', label: '2️⃣ Force Follow-up 1 (Day 2.5)' },
                    { id: 'followup_2', label: '3️⃣ Force Follow-up 2 (Day 5.5)' },
                    { id: 'followup_3', label: '4️⃣ Force Follow-up 3 (Day 10 Final)' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStage(st.id as 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'followup_3')}
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
                  When set to <strong>Auto-Detect</strong>, each lead is individually checked: if they haven't been contacted yet, they receive the initial message; if previously contacted, they receive the appropriate follow-up.
                </p>
              </div>

              {/* 6. Custom AI Instructions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. Custom AI Instructions (Optional)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Mention our free audit offer, keep under 60 words, reference local market..."
                  className="input w-full text-xs h-16 py-1.5 resize-none"
                />
              </div>

              {/* Deliverability & Compliance Safe Pacing Banner */}
              <div className="p-3 rounded-lg bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-900 space-y-0.5">
                  <p className="font-bold">
                    {channel === 'email'
                      ? 'Google & Microsoft SMTP Deliverability Safe Pacing'
                      : channel === 'whatsapp'
                      ? 'WhatsApp Anti-Ban 45s Randomized Pacing Active'
                      : 'LinkedIn Safe Daily Limits & Anti-Detection Active'}
                  </p>
                  <p className="text-emerald-700">
                    {channel === 'email'
                      ? '2-3s anti-burst pacing • Multi-inbox 50/50 rotation distributes volume across sender domains • Full List-Unsubscribe headers included.'
                      : channel === 'whatsapp'
                      ? '45-second randomized intervals between mobile messages • Respects WhatsApp anti-spam policies.'
                      : 'Humanized message dispatch prevents profile restrictions • Automatically respects daily connection limits.'}
                  </p>
                </div>
              </div>

              {/* Action Submit Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleScheduleSubmit}
                  disabled={
                    isSubmitting ||
                    eligibleLeadsCount === 0 ||
                    (channel === 'email' && selectedInboxIds.length === 0) ||
                    (channel === 'linkedin' && linkedInAccounts.length === 0)
                  }
                  className="btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Processing & Enqueuing Dispatches...</span>
                    </>
                  ) : sendMode === 'now' ? (
                    <>
                      <Zap size={14} />
                      <span>
                        Shoot {eligibleLeadsCount} {channel === 'email' ? 'Emails' : channel === 'whatsapp' ? 'WhatsApp Messages' : 'LinkedIn Messages'} Now
                        {channel === 'email' && selectedInboxes.length === 2 && ' (50/50 Split)'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Calendar size={14} />
                      <span>
                        Schedule {eligibleLeadsCount} {channel === 'email' ? 'Emails' : channel === 'whatsapp' ? 'WhatsApp Messages' : 'LinkedIn Messages'} for {scheduledDateTime || 'Selected Time'}
                      </span>
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
                        <span className="capitalize px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-bold text-[9px]">
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
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                        {channel === 'whatsapp' ? 'OPENING HOOK' : channel === 'linkedin' ? 'MESSAGE TITLE / HOOK' : 'SUBJECT LINE'}
                      </span>
                      <p className="font-semibold text-slate-900">{previewData.preview.subject}</p>
                    </div>

                    {/* Email Body */}
                    <div className="bg-white rounded-lg p-3 border border-slate-200 text-xs shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">
                        MESSAGE BODY ({channel.toUpperCase()} HUMANIZED)
                      </span>
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

              <div className="flex items-center gap-2">
                {store.dispatches.filter((d) => d.status === 'failed').length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteFailedDispatches}
                    disabled={isDeletingFailed}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 font-bold transition-colors"
                    title="Purge all failed outreach messages from queue"
                  >
                    <Trash2 size={12} className="text-rose-600" />
                    <span>
                      {isDeletingFailed
                        ? 'Deleting...'
                        : `Delete All Failed (${store.dispatches.filter((d) => d.status === 'failed').length})`}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => store.fetchDispatches()}
                  className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                >
                  <RefreshCw size={12} />
                  <span>Refresh Queue</span>
                </button>
              </div>
            </div>

            {/* Dispatches List */}
            {filteredDispatches.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <Clock size={28} className="mx-auto text-slate-400" />
                <h4 className="text-sm font-bold text-slate-700">No Dispatches Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  There are no dispatches matching this filter. Switch to the first tab to schedule outreach for any custom list.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5">Channel & Recipient</th>
                      <th className="p-2.5">Sender / Inbox</th>
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
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {dispatch.channel === 'whatsapp' ? (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                💬 WhatsApp
                              </span>
                            ) : dispatch.channel === 'linkedin' ? (
                              <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 text-[9px] font-bold">
                                💼 LinkedIn
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-brand-100 text-brand-800 text-[9px] font-bold">
                                ✉️ Email
                              </span>
                            )}
                            <p className="font-bold text-slate-900">{dispatch.recipient_name || 'Contact'}</p>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {dispatch.recipient_email || dispatch.recipient_phone || dispatch.recipient_handle}
                          </p>
                        </td>
                        <td className="p-2.5">
                          {dispatch.inbox_email ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-semibold block w-fit truncate max-w-[140px]">
                              📬 {dispatch.inbox_email}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">System Sender</span>
                          )}
                          <span className="text-[10px] text-brand-600 font-medium capitalize block mt-0.5">
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
                          <button
                            type="button"
                            onClick={() => handleDeleteDispatch(dispatch.id)}
                            disabled={deletingId === dispatch.id}
                            title="Delete dispatch"
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors ml-1 inline-flex items-center"
                          >
                            <Trash2 size={13} />
                          </button>
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
