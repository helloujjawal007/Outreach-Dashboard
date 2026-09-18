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
  Sliders,
  Users,
  MessageCircle,
  Mail,
  Instagram,
  Facebook,
  Linkedin,
  Loader2,
  Smartphone,
  ExternalLink,
  ChevronRight,
  Trash2,
  Filter,
  Search,
} from 'lucide-react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { api } from '@/services/api';
import type { Lead, ScheduledDispatch, WhatsAppSessionStatus, Channel } from '@/types';
import { channelLabels } from '@/types';

export interface ScheduleOutreachModalProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  leads?: Lead[];
  defaultChannel?: Channel;
  initialSubject?: string;
  initialBody?: string;
  onScheduledSuccess?: () => void;
}

type ChannelType = Channel;

export function ScheduleOutreachModal({
  open,
  onClose,
  lead,
  leads = [],
  defaultChannel = 'whatsapp',
  initialSubject = '',
  initialBody = '',
  onScheduledSuccess,
}: ScheduleOutreachModalProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'queue'>('schedule');
  const [channel, setChannel] = useState<ChannelType>(defaultChannel);

  // Target Leads list (either 1 lead or array of leads)
  const targetLeads = useMemo(() => {
    if (lead) return [lead];
    return leads;
  }, [lead, leads]);

  const isBatch = targetLeads.length > 1;

  // Date & Time selection
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [quickPreset, setQuickPreset] = useState<string>('1h');

  // Pacing intervals for batch (anti-ban safe pacing)
  const [intervalSeconds, setIntervalSeconds] = useState<number>(45);

  // Copy customization
  const [copyMode, setCopyMode] = useState<'custom' | 'ai'>(
    initialBody ? 'custom' : 'ai'
  );
  const [subject, setSubject] = useState<string>(initialSubject);
  const [body, setBody] = useState<string>(initialBody);
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // WhatsApp connection state
  const [waStatus, setWaStatus] = useState<WhatsAppSessionStatus | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Queue state
  const [dispatches, setDispatches] = useState<ScheduledDispatch[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [queueStatusFilter, setQueueStatusFilter] = useState<string>('all');
  const [queueChannelFilter, setQueueChannelFilter] = useState<string>('all');
  const [queueSearch, setQueueSearch] = useState<string>('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Calculate quick preset date times
  const getPresetTime = useCallback((preset: string): { isoLocal: string; label: string } => {
    const now = new Date();
    const d = new Date(now);

    if (preset === '15m') {
      d.setMinutes(d.getMinutes() + 15);
    } else if (preset === '1h') {
      d.setHours(d.getHours() + 1);
    } else if (preset === 'today_5pm') {
      d.setHours(17, 0, 0, 0);
      if (d.getTime() <= now.getTime()) {
        d.setDate(d.getDate() + 1);
      }
    } else if (preset === 'tomorrow_9am') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else if (preset === 'tomorrow_2pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(14, 0, 0, 0);
    }

    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    return { isoLocal: localISOTime, label: preset };
  }, []);

  // Initialize form state
  useEffect(() => {
    if (open) {
      setChannel(defaultChannel);
      setSubject(initialSubject);
      setBody(initialBody);
      setCopyMode(initialBody ? 'custom' : 'ai');
      setSubmitFeedback(null);

      // Default preset to 1 hour
      const { isoLocal } = getPresetTime('1h');
      setScheduledDateTime(isoLocal);
      setQuickPreset('1h');

      // Adjust interval based on channel
      setIntervalSeconds(defaultChannel === 'whatsapp' ? 45 : defaultChannel === 'email' ? 25 : 30);

      // Fetch WhatsApp status
      api.getWhatsAppSessionStatus().then(setWaStatus).catch(console.error);

      // Fetch queue
      fetchQueue();
    }
  }, [open, defaultChannel, initialSubject, initialBody, getPresetTime]);

  const fetchQueue = async () => {
    setIsLoadingQueue(true);
    try {
      const data = await api.getScheduledDispatches();
      setDispatches(data);
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setIsLoadingQueue(false);
    }
  };

  // Preset click handler
  const handlePresetSelect = (presetKey: string) => {
    setQuickPreset(presetKey);
    const { isoLocal } = getPresetTime(presetKey);
    setScheduledDateTime(isoLocal);
  };

  // Leads eligible for the selected channel
  const eligibleLeads = useMemo(() => {
    return targetLeads.filter((l) => {
      if (channel === 'email') return !!(l.email && l.email.trim());
      if (channel === 'whatsapp') return !!((l.whatsapp && l.whatsapp.trim()) || (l.phone && l.phone.trim()));
      if (channel === 'facebook') return !!(l.facebook && l.facebook.trim());
      if (channel === 'instagram') return !!(l.instagram && l.instagram.trim());
      if (channel === 'linkedin') return !!(l.linkedin && l.linkedin.trim());
      return false;
    });
  }, [targetLeads, channel]);

  // Generate AI copy for single lead
  const handleGenerateAiCopy = async () => {
    if (targetLeads.length === 0) return;
    const sampleLead = targetLeads[0];
    setIsGeneratingAi(true);
    try {
      const res = await api.researchAndWrite({
        leadId: sampleLead.id,
        channel,
        customPrompt: customInstructions,
      });
      if (res.body) {
        setBody(res.body);
        if (res.subject && channel === 'email') {
          setSubject(res.subject);
        }
        setCopyMode('custom');
      }
    } catch (err) {
      console.error('Failed to generate AI copy:', err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Schedule Submit
  const handleSchedule = async () => {
    if (eligibleLeads.length === 0) {
      setSubmitFeedback({
        type: 'error',
        message: `None of the selected leads have valid contact details for ${channelLabels[channel]}.`,
      });
      return;
    }

    if (!scheduledDateTime) {
      setSubmitFeedback({
        type: 'error',
        message: 'Please choose a scheduled date and time.',
      });
      return;
    }

    const scheduledDateObj = new Date(scheduledDateTime);
    if (isNaN(scheduledDateObj.getTime())) {
      setSubmitFeedback({
        type: 'error',
        message: 'Invalid schedule date or time format.',
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitFeedback(null);

    try {
      if (!isBatch && lead) {
        // Single Lead Scheduling
        const res = await api.scheduleSingleDispatch({
          leadId: lead.id,
          channel,
          scheduledFor: scheduledDateObj.toISOString(),
          subject: channel === 'email' ? subject : undefined,
          body: copyMode === 'custom' ? body : undefined,
          customInstructions: copyMode === 'ai' ? customInstructions : undefined,
        });

        setSubmitFeedback({
          type: 'success',
          message: `Scheduled successfully! ${res.message}`,
        });
      } else {
        // Batch Leads Scheduling
        const leadIds = eligibleLeads.map((l) => l.id);
        const res = await api.scheduleBatchDispatch({
          leadIds,
          channel,
          scheduledFor: scheduledDateObj.toISOString(),
          intervalSeconds,
          customInstructions: copyMode === 'ai' ? customInstructions : undefined,
        });

        setSubmitFeedback({
          type: 'success',
          message: `Scheduled ${res.scheduledCount} leads successfully! Delivery staggered across ${intervalSeconds}s intervals.`,
        });
      }

      await fetchQueue();
      onScheduledSuccess?.();

      // Automatically switch to queue tab after 1.5s
      setTimeout(() => {
        setActiveTab('queue');
      }, 1500);
    } catch (err) {
      console.error('Schedule failed:', err);
      setSubmitFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to schedule outreach.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel / Retry handlers
  const handleCancelDispatch = async (id: string) => {
    setCancellingId(id);
    try {
      await api.cancelScheduledDispatch(id);
      await fetchQueue();
    } catch (err) {
      console.error('Failed to cancel dispatch:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const handleRetryDispatch = async (id: string) => {
    setRetryingId(id);
    try {
      await api.retryScheduledDispatch(id);
      await fetchQueue();
    } catch (err) {
      console.error('Failed to retry dispatch:', err);
    } finally {
      setRetryingId(null);
    }
  };

  // Filtered queue items
  const filteredQueue = useMemo(() => {
    return dispatches.filter((d) => {
      const matchStatus = queueStatusFilter === 'all' || d.status === queueStatusFilter;
      const matchChannel = queueChannelFilter === 'all' || (d.channel || 'email') === queueChannelFilter;
      if (!matchStatus || !matchChannel) return false;
      if (queueSearch.trim()) {
        const q = queueSearch.toLowerCase();
        return (
          d.recipient_name?.toLowerCase().includes(q) ||
          d.recipient_email?.toLowerCase().includes(q) ||
          d.recipient_phone?.toLowerCase().includes(q) ||
          d.subject?.toLowerCase().includes(q) ||
          d.body?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [dispatches, queueStatusFilter, queueChannelFilter, queueSearch]);

  // Completion time calculation for batch
  const batchScheduleTimeline = useMemo(() => {
    if (!isBatch || !scheduledDateTime || eligibleLeads.length === 0) return null;
    const start = new Date(scheduledDateTime);
    if (isNaN(start.getTime())) return null;
    const totalSeconds = (eligibleLeads.length - 1) * intervalSeconds;
    const end = new Date(start.getTime() + totalSeconds * 1000);
    const durationMinutes = Math.ceil(totalSeconds / 60);

    return {
      startTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      endTime: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      durationMinutes,
    };
  }, [isBatch, scheduledDateTime, eligibleLeads.length, intervalSeconds]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title=""
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Custom Header with Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 -mt-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-sm">
                <Clock size={18} />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Schedule Multi-Channel Outreach</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-bold border border-brand-200">
                    {isBatch ? `${eligibleLeads.length} Leads` : lead?.businessName}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Automated background scheduling for WhatsApp, Email, Facebook & Instagram
                </p>
              </div>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'schedule'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={14} />
              <span>Schedule</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'queue'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock size={14} />
              <span>Queue ({dispatches.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: SCHEDULE FORM */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            {/* Feedback Alert */}
            {submitFeedback && (
              <div
                className={`rounded-xl p-3 text-xs flex items-center gap-2 border animate-fade-in ${
                  submitFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {submitFeedback.type === 'success' ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                )}
                <span>{submitFeedback.message}</span>
              </div>
            )}

            {/* 1. Channel Selection */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Target Outreach Channel:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  {
                    id: 'whatsapp' as ChannelType,
                    name: 'WhatsApp',
                    icon: MessageCircle,
                    activeClass: 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-400/20',
                    badgeColor: 'bg-emerald-100 text-emerald-800',
                  },
                  {
                    id: 'email' as ChannelType,
                    name: 'Email',
                    icon: Mail,
                    activeClass: 'border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-400/20',
                    badgeColor: 'bg-blue-100 text-blue-800',
                  },
                  {
                    id: 'facebook' as ChannelType,
                    name: 'Facebook',
                    icon: Facebook,
                    activeClass: 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-400/20',
                    badgeColor: 'bg-indigo-100 text-indigo-800',
                  },
                  {
                    id: 'instagram' as ChannelType,
                    name: 'Instagram',
                    icon: Instagram,
                    activeClass: 'border-pink-500 bg-pink-50 text-pink-900 ring-2 ring-pink-400/20',
                    badgeColor: 'bg-pink-100 text-pink-800',
                  },
                  {
                    id: 'linkedin' as ChannelType,
                    name: 'LinkedIn',
                    icon: Linkedin,
                    activeClass: 'border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-400/20',
                    badgeColor: 'bg-sky-100 text-sky-800',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = channel === item.id;
                  const eligibleCount = targetLeads.filter((l) => {
                    if (item.id === 'email') return !!(l.email && l.email.trim());
                    if (item.id === 'whatsapp') return !!((l.whatsapp && l.whatsapp.trim()) || (l.phone && l.phone.trim()));
                    if (item.id === 'facebook') return !!(l.facebook && l.facebook.trim());
                    if (item.id === 'instagram') return !!(l.instagram && l.instagram.trim());
                    if (item.id === 'linkedin') return !!(l.linkedin && l.linkedin.trim());
                    return false;
                  }).length;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setChannel(item.id)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                        isSelected
                          ? item.activeClass
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Icon size={18} className="mb-1" />
                      <span className="text-xs font-bold">{item.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold mt-1 ${item.badgeColor}`}>
                        {eligibleCount} {eligibleCount === 1 ? 'eligible' : 'eligible'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Channel specific notice */}
              {channel === 'whatsapp' && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <Smartphone size={15} className="text-emerald-600" />
                    <span>
                      {waStatus?.isConnected ? (
                        <>
                          Automated WhatsApp dispatch active via{' '}
                          <strong className="font-bold">{waStatus.phoneNumber}</strong> ({waStatus.name || 'Ujjawal'})
                        </>
                      ) : (
                        <span className="text-amber-800">
                          ⚠️ WhatsApp not connected. Scan QR in the dashboard to enable automated delivery.
                        </span>
                      )}
                    </span>
                  </div>
                  {waStatus?.isConnected && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-800 font-bold text-[10px]">
                      Live Socket
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 2. Date & Time Picker with Presets */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar size={14} className="text-brand-600" />
                  <span>Choose Schedule Date &amp; Time:</span>
                </label>
                <span className="text-[11px] text-slate-500 font-medium">
                  Local System Time
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: '15m', label: '⚡ In 15 Mins' },
                  { id: '1h', label: '🕒 In 1 Hour' },
                  { id: 'today_5pm', label: '🌆 Today 5:00 PM' },
                  { id: 'tomorrow_9am', label: '🌅 Tomorrow 9:00 AM' },
                  { id: 'tomorrow_2pm', label: '📅 Tomorrow 2:00 PM' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset.id)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border ${
                      quickPreset === preset.id
                        ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Time Input */}
              <div className="flex items-center gap-3">
                <input
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => {
                    setScheduledDateTime(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="input text-xs font-semibold py-1.5 px-3 bg-white border-slate-300 w-full sm:w-72"
                />
                <span className="text-xs text-slate-500">
                  {scheduledDateTime
                    ? `Will dispatch on ${new Date(scheduledDateTime).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'Select a time'}
                </span>
              </div>
            </div>

            {/* 3. Anti-Ban Safe Pacing (for Batch scheduling) */}
            {isBatch && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={15} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-800">
                      Anti-Ban Staggered Pacing:
                    </span>
                  </div>
                  <span className="text-xs font-bold text-indigo-700">
                    {intervalSeconds} seconds per lead
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="15"
                    max="120"
                    step="5"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Fast (15s)</span>
                  <span className="text-emerald-700 font-bold">Recommended: 45s for WhatsApp / 25s for Email</span>
                  <span>Conservative (120s)</span>
                </div>

                {batchScheduleTimeline && (
                  <div className="pt-2 border-t border-indigo-100/80 flex items-center justify-between text-xs text-indigo-950 font-medium">
                    <span>
                      🚀 First message: <strong>{batchScheduleTimeline.startTime}</strong>
                    </span>
                    <span>
                      🏁 Last message: <strong>{batchScheduleTimeline.endTime}</strong>
                    </span>
                    <span>
                      ⏱️ Duration: <strong>{batchScheduleTimeline.durationMinutes} mins</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 4. Outreach Copy Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-brand-600" />
                  <span>Outreach Message Copy:</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCopyMode('ai')}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      copyMode === 'ai'
                        ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ✨ AI Personalized Per Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopyMode('custom')}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      copyMode === 'custom'
                        ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ✍️ Custom Message
                  </button>
                </div>
              </div>

              {copyMode === 'ai' ? (
                <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/60 via-indigo-50/40 to-slate-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600 text-white">
                      <Sparkles size={13} />
                    </span>
                    <span className="text-xs font-bold text-brand-950">
                      Hyper-Personalized AI Synthesis Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    The background dispatcher will automatically analyze each lead&apos;s business profile,
                    industry category, and pain points to craft tailored, humanized outreach at send-time.
                  </p>
                  <div>
                    <input
                      type="text"
                      placeholder="Optional custom instructions (e.g. Focus on weekend emergency calls, ask for 5-min demo)"
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      className="input text-xs py-1.5 px-3 bg-white w-full border-brand-200"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {channel === 'email' && (
                    <div>
                      <input
                        type="text"
                        placeholder="Email Subject Line (e.g. Quick question regarding {{business_name}})"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="input text-xs font-semibold py-1.5 px-3 w-full"
                      />
                    </div>
                  )}

                  <div className="relative">
                    <textarea
                      rows={4}
                      placeholder={`Enter ${channelLabels[channel]} message text...`}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="input text-xs py-2 px-3 w-full font-mono"
                    />
                    {!isBatch && (
                      <button
                        type="button"
                        onClick={handleGenerateAiCopy}
                        disabled={isGeneratingAi}
                        className="absolute bottom-3 right-3 btn-secondary py-1 px-2.5 text-[11px] font-bold flex items-center gap-1 bg-white/90 text-brand-700 border-brand-200 shadow-2xs hover:bg-brand-50"
                        title="Generate personalized pitch using Ollama / AI"
                      >
                        {isGeneratingAi ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} className="text-brand-600" />
                        )}
                        <span>AI Fill</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {body.split(/\s+/).filter(Boolean).length} words • {body.length} chars
                    </span>
                    <span>Supports placeholders: &#123;&#123;business_name&#125;&#125;</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                Scheduling <strong>{eligibleLeads.length}</strong> {channelLabels[channel]} message(s)
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary py-1.5 px-4 text-xs font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSchedule}
                  disabled={isSubmitting || eligibleLeads.length === 0}
                  className={`btn-primary py-2 px-5 text-xs font-bold flex items-center gap-1.5 text-white border-0 shadow-sm ${
                    channel === 'whatsapp'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : channel === 'email'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-brand-600 hover:bg-brand-700'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Scheduling Dispatches...</span>
                    </>
                  ) : (
                    <>
                      <Calendar size={14} />
                      <span>
                        Schedule {channelLabels[channel]} for{' '}
                        {scheduledDateTime
                          ? new Date(scheduledDateTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Selected Time'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUEUE & HISTORY */}
        {activeTab === 'queue' && (
          <div className="space-y-3">
            {/* Filters Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <select
                  value={queueStatusFilter}
                  onChange={(e) => setQueueStatusFilter(e.target.value)}
                  className="input text-xs py-1 px-2.5 font-medium"
                >
                  <option value="all">All Statuses ({dispatches.length})</option>
                  <option value="scheduled">
                    Scheduled ({dispatches.filter((d) => d.status === 'scheduled').length})
                  </option>
                  <option value="sent">
                    Sent ({dispatches.filter((d) => d.status === 'sent').length})
                  </option>
                  <option value="failed">
                    Failed ({dispatches.filter((d) => d.status === 'failed').length})
                  </option>
                  <option value="cancelled">
                    Cancelled ({dispatches.filter((d) => d.status === 'cancelled').length})
                  </option>
                </select>

                <select
                  value={queueChannelFilter}
                  onChange={(e) => setQueueChannelFilter(e.target.value)}
                  className="input text-xs py-1 px-2.5 font-medium"
                >
                  <option value="all">All Channels</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                </select>

                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search queue..."
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    className="input pl-7 pr-2 py-1 text-xs w-28 sm:w-36 bg-white border-slate-200"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={fetchQueue}
                disabled={isLoadingQueue}
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 font-semibold"
              >
                <RefreshCw size={12} className={isLoadingQueue ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Dispatches Table */}
            {filteredQueue.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <Clock size={28} className="mx-auto text-slate-400" />
                <h4 className="text-sm font-bold text-slate-700">No Scheduled Dispatches</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No dispatches found matching the filter. Switch to the Schedule tab to queue new outreach messages.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">Channel &amp; Recipient</th>
                      <th className="p-2.5">Subject &amp; Message</th>
                      <th className="p-2.5">Scheduled For</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredQueue.map((item) => {
                      const itemChannel = item.channel || 'email';
                      const recipientContact =
                        itemChannel === 'whatsapp'
                          ? item.recipient_phone || 'WhatsApp'
                          : itemChannel === 'email'
                          ? item.recipient_email || 'Email'
                          : item.recipient_handle || 'Social Handle';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              {itemChannel === 'whatsapp' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">
                                  <MessageCircle size={10} /> WA
                                </span>
                              )}
                              {itemChannel === 'email' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] bg-blue-100 text-blue-800">
                                  <Mail size={10} /> Email
                                </span>
                              )}
                              {itemChannel === 'facebook' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] bg-indigo-100 text-indigo-800">
                                  <Facebook size={10} /> FB
                                </span>
                              )}
                              {itemChannel === 'instagram' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] bg-pink-100 text-pink-800">
                                  <Instagram size={10} /> IG
                                </span>
                              )}
                              {itemChannel === 'linkedin' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[10px] bg-sky-100 text-sky-800">
                                  <Linkedin size={10} /> LinkedIn
                                </span>
                              )}
                              <span className="font-bold text-slate-900 truncate max-w-[140px]">
                                {item.recipient_name || 'Contact'}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono block">
                              {recipientContact}
                            </span>
                          </td>

                          <td className="p-2.5 max-w-xs">
                            {item.subject && (
                              <p className="font-semibold text-slate-800 truncate mb-0.5">
                                {item.subject}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-500 line-clamp-2">
                              {item.body}
                            </p>
                          </td>

                          <td className="p-2.5 whitespace-nowrap text-[11px]">
                            {item.status === 'sent' && item.sent_at ? (
                              <span className="text-emerald-700 font-semibold block">
                                Delivered:{' '}
                                {new Date(item.sent_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : (
                              <span className="text-slate-700 font-medium block">
                                {new Date(item.scheduled_for).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </td>

                          <td className="p-2.5 whitespace-nowrap">
                            {item.status === 'sent' && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1 w-fit">
                                <CheckCircle2 size={11} /> Sent
                              </span>
                            )}
                            {item.status === 'scheduled' && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1 w-fit">
                                <Clock size={11} /> Scheduled
                              </span>
                            )}
                            {item.status === 'processing' && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center gap-1 w-fit">
                                <RefreshCw size={11} className="animate-spin" /> Sending...
                              </span>
                            )}
                            {item.status === 'failed' && (
                              <span
                                className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold flex items-center gap-1 w-fit cursor-help"
                                title={item.error_message || 'Dispatch failed'}
                              >
                                <XCircle size={11} /> Failed
                              </span>
                            )}
                            {item.status === 'cancelled' && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold flex items-center gap-1 w-fit">
                                Cancelled
                              </span>
                            )}
                          </td>

                          <td className="p-2.5 text-right whitespace-nowrap">
                            {item.status === 'scheduled' && (
                              <button
                                type="button"
                                onClick={() => handleCancelDispatch(item.id)}
                                disabled={cancellingId === item.id}
                                className="btn-secondary py-1 px-2 text-[11px] text-rose-600 hover:bg-rose-50 border-rose-200"
                              >
                                {cancellingId === item.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}
                            {(item.status === 'failed' || item.status === 'cancelled') && (
                              <button
                                type="button"
                                onClick={() => handleRetryDispatch(item.id)}
                                disabled={retryingId === item.id}
                                className="btn-secondary py-1 px-2 text-[11px] text-brand-600 hover:bg-brand-50 border-brand-200"
                              >
                                {retryingId === item.id ? 'Requeueing...' : 'Retry'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
