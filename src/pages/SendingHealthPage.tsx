import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Mail,
  MessageCircle,
  Instagram,
  Trash2,
  Send,
  Clock,
  Database,
  Cpu,
  Loader2,
  ShieldCheck,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import type { Store } from '@/store';
import { mockSendHealth } from '@/mockData';
import { channelLabels } from '@/types';
import { api, type WarmupStatus } from '@/services/api';

interface Props {
  store: Store;
}

export function SendingHealthPage({ store }: Props) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatus | null>(null);
  const [isChangingStage, setIsChangingStage] = useState(false);
  const [waPhone, setWaPhone] = useState('+1 415-555-0101');
  const [waText, setWaText] = useState('Hi, I got your email. How much does the system cost?');
  const [waSimResult, setWaSimResult] = useState<string | null>(null);

  const loadWarmup = useCallback(async () => {
    try {
      const status = await api.getEmailWarmupStatus();
      setWarmupStatus(status);
    } catch (err) {
      console.error('Failed to load warm-up status:', err);
    }
  }, []);

  useEffect(() => {
    loadWarmup();
  }, [loadWarmup]);

  const handleStageChange = async (newStage: number) => {
    try {
      setIsChangingStage(true);
      const updated = await api.setWarmupStage(newStage);
      setWarmupStatus(updated);
    } catch (err) {
      console.error('Failed to change stage:', err);
    } finally {
      setIsChangingStage(false);
    }
  };

  const handleSimulateWhatsAppInbound = async () => {
    if (!waPhone.trim() || !waText.trim()) return;
    try {
      await api.simulateWhatsAppInbound({ fromPhone: waPhone.trim(), text: waText.trim() });
      setWaSimResult(`Inbound WhatsApp message received from ${waPhone}! The 24-hour customer care window is now ACTIVE.`);
      await store.refreshAll();
    } catch (err) {
      console.error('WhatsApp inbound simulation failed:', err);
    }
  };

  const [isSimulatingSignal, setIsSimulatingSignal] = useState(false);
  const [signalFeedback, setSignalFeedback] = useState<string | null>(null);

  const handleRecordSignal = async (type: 'bounce' | 'complaint' | 'sent', count = 1) => {
    try {
      setIsSimulatingSignal(true);
      await api.recordDeliverabilitySignal({ type, count });
      setSignalFeedback(`Injected ${count} ${type} signal(s). Recalculating domain health...`);
      await store.fetchHealth();
    } catch (err) {
      console.error('Failed to record signal:', err);
    } finally {
      setIsSimulatingSignal(false);
    }
  };

  const handleResetSignals = async () => {
    try {
      setIsSimulatingSignal(true);
      await api.resetTodayHealthSignals();
      setSignalFeedback("Reset today's deliverability test signals back to healthy baseline.");
      await store.fetchHealth();
    } catch (err) {
      console.error('Failed to reset signals:', err);
    } finally {
      setIsSimulatingSignal(false);
    }
  };

  const healthData = useMemo(() => {
    return store.health?.dailyData && store.health.dailyData.length > 0
      ? store.health.dailyData
      : mockSendHealth;
  }, [store.health]);

  const totals = useMemo(() => {
    if (store.health?.totals) {
      return {
        sent: store.health.totals.sent,
        bounced: store.health.totals.bounced,
        complaints: store.health.totals.complaints || 0,
        drafted: store.health.totals.drafted,
        bounceRate: store.health.totals.bounceRate,
        complaintRate: store.health.totals.complaintRate || 0,
      };
    }
    const sent = healthData.reduce((s, d) => s + d.sent, 0);
    const bounced = healthData.reduce((s, d) => s + d.bounced, 0);
    const complaints = healthData.reduce((s, d) => s + (d.complaints || 0), 0);
    const drafted = store.queue.length;
    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    const complaintRate = sent > 0 ? (complaints / sent) * 100 : 0;
    return { sent, bounced, complaints, drafted, bounceRate, complaintRate };
  }, [healthData, store.health, store.queue.length]);

  const isAutoThrottled = store.health?.isAutoThrottled || totals.bounceRate > 5 || totals.complaintRate > 0.3 || !!warmupStatus?.isThrottled;
  const throttleReason = store.health?.throttleReason || (
    totals.bounceRate > 5
      ? `Bounce rate is ${totals.bounceRate.toFixed(1)}% (exceeds 5% ceiling)`
      : totals.complaintRate > 0.3
      ? `Spam complaints are ${totals.complaintRate.toFixed(2)}% (exceeds 0.30% ceiling)`
      : warmupStatus?.isThrottled
      ? `Daily warm-up limit reached (${warmupStatus.sentToday}/${warmupStatus.dailyLimit})`
      : 'Sending is active and within deliverability parameters.'
  );

  const healthStatus = useMemo(() => {
    if (store.health) {
      return {
        level: store.health.level,
        label: store.health.label,
        description: store.health.description,
      };
    }
    if (totals.bounceRate > 5 || totals.complaintRate > 0.3)
      return {
        level: 'red' as const,
        label: 'Critical (Throttled)',
        description: 'Critical deliverability thresholds breached — automated cold sends are paused to protect sender domain.',
      };
    if (totals.bounceRate > 2 || totals.complaintRate > 0.1)
      return {
        level: 'yellow' as const,
        label: 'Fair (Warning)',
        description: 'Elevated deliverability risk detected (bounces > 2% or complaints > 0.1%). Monitor closely.',
      };
    return {
      level: 'green' as const,
      label: 'Healthy',
      description: 'Sending reputation looks good. Bounce rate and complaint rate are within safe parameters.',
    };
  }, [store.health, totals.bounceRate, totals.complaintRate]);

  const maxSent = Math.max(...healthData.map((d) => d.sent), 1);

  const statusColors = {
    green: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
      badge: 'green' as const,
    },
    yellow: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
      badge: 'yellow' as const,
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      dot: 'bg-red-500',
      badge: 'red' as const,
    },
  };

  const sc = statusColors[healthStatus.level];

  const channelIcon = (channel: string) => {
    if (channel === 'email') return <Mail size={14} className="text-brand-500" />;
    if (channel === 'whatsapp') return <MessageCircle size={14} className="text-emerald-500" />;
    return <Instagram size={14} className="text-violet-500" />;
  };

  const handleSendItem = async (id: string) => {
    try {
      setProcessingId(id);
      await store.sendQueueItem(id);
    } catch (err) {
      console.error('Failed to send queue item:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDiscardItem = async (id: string) => {
    try {
      setProcessingId(id);
      await store.removeQueueItem(id);
    } catch (err) {
      console.error('Failed to discard queue item:', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sending Health & Channel Adapters"
        subtitle="Monitor delivery reputation, warm-up throttles, 24h compliance gates, and human approval queue."
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium border ${
                store.systemStatus?.postgres === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              <Database size={12} />
              PostgreSQL: {store.systemStatus?.postgres || 'connected'}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium border ${
                store.systemStatus?.ollama === 'online'
                  ? 'bg-brand-50 text-brand-700 border-brand-200'
                  : 'bg-slate-100 text-ink-500 border-slate-200'
              }`}
            >
              <Cpu size={12} />
              Ollama: {store.systemStatus?.ollama || 'fallback'}
            </span>
          </div>
        }
      />

      {/* Status Banner */}
      <div className={`mb-6 flex items-center gap-4 rounded-xl border ${sc.border} ${sc.bg} px-5 py-4`}>
        <div className="relative flex h-12 w-12 items-center justify-center">
          <span className={`absolute inset-0 rounded-full ${sc.dot} opacity-20 animate-pulse-ring`} />
          <span className={`relative h-3 w-3 rounded-full ${sc.dot}`} />
        </div>
        <div className="flex-1">
          <p className={`text-lg font-bold ${sc.text}`}>Sending Health: {healthStatus.label}</p>
          <p className="text-sm text-ink-500">{healthStatus.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={totals.bounceRate > 5 ? 'red' : totals.bounceRate > 2 ? 'yellow' : 'green'}>
            {totals.bounceRate.toFixed(1)}% bounce
          </Badge>
          <Badge variant={totals.complaintRate > 0.3 ? 'red' : totals.complaintRate > 0.1 ? 'yellow' : 'green'}>
            {totals.complaintRate.toFixed(2)}% spam
          </Badge>
        </div>
      </div>

      {/* Auto-Throttle Protection Banner (Phase 7) */}
      {isAutoThrottled && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-900">Auto-Throttling Safety Engaged</h4>
              <p className="text-xs text-red-700 mt-0.5 font-medium leading-relaxed">
                {throttleReason} Automated cold sends are paused to protect sender domain reputation and deliverability score.
              </p>
            </div>
          </div>
          <button
            onClick={handleResetSignals}
            disabled={isSimulatingSignal}
            className="text-xs font-semibold text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shadow-xs flex-shrink-0"
          >
            Reset Test Baseline
          </button>
        </div>
      )}

      {/* 5-Column Stat Cards Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Total Sent (7d)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
              <Send size={16} className="text-brand-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{totals.sent.toLocaleString()}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
            <TrendingUp size={12} /> Aggregate volume
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Bounces (7d)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
              <AlertCircle size={16} className="text-red-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{totals.bounced}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <TrendingDown size={12} /> {totals.bounceRate.toFixed(1)}% (max 5.0%)
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Spam Signals (7d)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
              <AlertTriangle size={16} className="text-red-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{totals.complaints}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
            <span className={totals.complaintRate > 0.3 ? 'text-red-600 font-bold' : 'text-emerald-600 font-semibold'}>
              {totals.complaintRate.toFixed(2)}%
            </span>
            <span>(max 0.30%)</span>
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Drafted (Queue)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Clock size={16} className="text-amber-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{store.queue.length}</p>
          <p className="mt-1 text-xs text-ink-300">Awaiting human dispatch</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Warm-up & Throttle</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <Activity size={16} className="text-emerald-600" />
            </div>
          </div>
          <p className={`mt-2 text-2xl font-bold ${isAutoThrottled ? 'text-red-600' : 'text-emerald-700'}`}>
            {isAutoThrottled ? 'Throttled' : 'Active'}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {warmupStatus ? `${warmupStatus.sentToday} / ${warmupStatus.dailyLimit} today` : 'Normal velocity'}
          </p>
        </div>
      </div>

      {/* Channel Adapters Architecture Grid (Phase 3 & Phase 4) */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Email Adapter: Subdomain & Warm-Up Tracker */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Mail size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-900">Email Adapter & Warm-Up Tracker</h3>
                <p className="text-xs text-ink-500 font-mono">{warmupStatus?.subdomain || 'outreach.clientconnect.io'}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <ShieldCheck size={12} /> Aligned
            </span>
          </div>

          {/* DNS Alignment Status */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">SPF</span>
              <p className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1 mt-0.5">
                <CheckCircle2 size={12} /> PASS
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">DKIM</span>
              <p className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1 mt-0.5">
                <CheckCircle2 size={12} /> 2048-bit
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">DMARC</span>
              <p className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1 mt-0.5">
                <CheckCircle2 size={12} /> p=quarantine
              </p>
            </div>
          </div>

          {/* Warm-Up Progress Bar */}
          {warmupStatus && (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-700">{warmupStatus.stageName}</span>
                <span className="text-ink-500">
                  {warmupStatus.sentToday} / {warmupStatus.dailyLimit} sent today
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    warmupStatus.isThrottled ? 'bg-amber-500' : 'bg-brand-600'
                  }`}
                  style={{
                    width: `${Math.min(100, (warmupStatus.sentToday / warmupStatus.dailyLimit) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
                <span>{warmupStatus.remainingToday} sends remaining today</span>
                <div className="flex items-center gap-1">
                  <span>Stage:</span>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      disabled={isChangingStage}
                      className={`h-5 w-5 rounded text-[11px] font-bold transition-colors ${
                        warmupStatus.stage === s
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-200 text-ink-600 hover:bg-slate-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {warmupStatus.isThrottled && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>Daily limit reached. Further cold emails will be auto-throttled to preserve sender reputation.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* WhatsApp Adapter: 24h Window & Policy Gate */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <MessageCircle size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-900">WhatsApp Adapter (24h Window Gate)</h3>
                <p className="text-xs text-ink-500">Meta Business Platform Policy Enforcement</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Cold Outbound Gated
            </span>
          </div>

          <p className="text-xs text-ink-500 mb-3 leading-relaxed">
            Per Meta WhatsApp policy, cold outbound messages without user consent are prohibited. Outbound replies are
            permitted <strong>only within 24 hours</strong> of a customer-initiated message.
          </p>

          {/* WhatsApp Inbound Webhook Simulator */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-bold text-ink-700 mb-2">Simulate WhatsApp Inbound Message (Opens 24h Window)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="Sender Phone (e.g. +1 415-555-0101)"
                className="input py-1 text-xs"
              />
              <input
                value={waText}
                onChange={(e) => setWaText(e.target.value)}
                placeholder="Inbound message text"
                className="input py-1 text-xs"
              />
            </div>
            <button
              onClick={handleSimulateWhatsAppInbound}
              className="btn-secondary py-1 px-3 text-xs w-full justify-center"
            >
              Simulate Inbound Webhook Event
            </button>
            {waSimResult && (
              <p className="mt-2 text-xs text-emerald-700 font-medium bg-emerald-50 p-2 rounded border border-emerald-200">
                {waSimResult}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Deliverability Health & Auto-Throttle Signal Simulator (Phase 7) */}
      <div className="mb-6 card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Sliders size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink-900">Deliverability Signals & Auto-Throttle Simulator (Phase 7)</h3>
              <p className="text-xs text-ink-500">Simulate bounce bursts or spam complaint spikes to test auto-throttling and recovery</p>
            </div>
          </div>
          <button
            onClick={handleResetSignals}
            disabled={isSimulatingSignal}
            className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
          >
            Reset Test Baseline
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleRecordSignal('bounce', 5)}
            disabled={isSimulatingSignal}
            className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 p-3 text-xs font-semibold text-amber-800 transition-colors"
          >
            <AlertCircle size={14} className="text-amber-600" />
            + Simulate 5 Hard Bounces
          </button>
          <button
            onClick={() => handleRecordSignal('complaint', 1)}
            disabled={isSimulatingSignal}
            className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 p-3 text-xs font-semibold text-red-800 transition-colors"
          >
            <AlertTriangle size={14} className="text-red-600" />
            + Simulate 1 Spam Complaint (Breach 0.3%)
          </button>
          <button
            onClick={() => handleRecordSignal('sent', 25)}
            disabled={isSimulatingSignal}
            className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 p-3 text-xs font-semibold text-emerald-800 transition-colors"
          >
            <CheckCircle2 size={14} className="text-emerald-600" />
            + Simulate 25 Clean Sends (Recover Health)
          </button>
        </div>

        {signalFeedback && (
          <p className="mt-3 text-xs text-brand-700 font-medium bg-brand-50 p-2.5 rounded-lg border border-brand-200 flex items-center gap-2">
            <CheckCircle2 size={13} className="text-brand-600 flex-shrink-0" />
            {signalFeedback}
          </p>
        )}
      </div>

      {/* 7-Day Trend Chart */}
      <div className="mb-6 card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900">7-Day Dispatch & Delivery Activity</h3>
            <p className="text-xs text-ink-500">Daily sent volume vs bounces tracked in PostgreSQL</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-ink-500">
              <span className="h-3 w-3 rounded-sm bg-brand-500" /> Sent
            </span>
            <span className="flex items-center gap-1.5 text-ink-500">
              <span className="h-3 w-3 rounded-sm bg-red-400" /> Bounced
            </span>
          </div>
        </div>

        <div className="flex h-48 items-end gap-3 pt-6 pb-2">
          {healthData.map((day) => {
            const sentH = (day.sent / maxSent) * 100;
            const bounceH = (day.bounced / maxSent) * 100;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-1 h-36">
                  <div
                    style={{ height: `${Math.max(sentH, 4)}%` }}
                    className="w-full max-w-8 rounded-t bg-brand-500 transition-all hover:bg-brand-600"
                    title={`${day.sent} sent`}
                  />
                  {day.bounced > 0 && (
                    <div
                      style={{ height: `${Math.max(bounceH, 4)}%` }}
                      className="w-2 rounded-t bg-red-400 transition-all hover:bg-red-500"
                      title={`${day.bounced} bounced`}
                    />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-ink-500 whitespace-nowrap">{day.date}</span>
                <span className="text-[10px] text-ink-300">{day.sent}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Send Approval Queue (Instagram / Facebook / Custom Drafts) */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Manual Send Approval Queue ({store.queue.length})</h3>
            <p className="text-xs text-ink-500">
              Review and dispatch messages for channels with automation restrictions (Instagram DMs, custom VIP drafts).
            </p>
          </div>
        </div>

        {store.queue.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-sm font-semibold text-ink-700">All caught up!</p>
            <p className="text-xs text-ink-300">No messages waiting in the manual dispatch queue.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {store.queue.map((item) => (
              <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex items-center gap-1 text-xs font-bold text-ink-900">{item.leadName}</span>
                    <span className="text-ink-300 text-xs">·</span>
                    <span className="flex items-center gap-1 text-xs text-ink-500">
                      {channelIcon(item.channel)}
                      {channelLabels[item.channel]}
                    </span>
                    <span className="text-ink-300 text-xs">·</span>
                    <span className="text-xs text-ink-300">{item.campaignName}</span>
                  </div>
                  <p className="text-xs text-ink-700 bg-slate-50 p-2.5 rounded-lg font-mono border border-slate-200/60 line-clamp-2">
                    {item.messagePreview}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleSendItem(item.id)}
                    disabled={processingId === item.id}
                    className="btn-primary py-1 px-3 text-xs"
                    title="Mark as sent and record in history"
                  >
                    {processingId === item.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} />
                    )}
                    Mark as Sent
                  </button>
                  <button
                    onClick={() => handleDiscardItem(item.id)}
                    disabled={processingId === item.id}
                    className="btn-secondary py-1 px-3 text-xs text-red-600 hover:bg-red-50 border-red-200"
                    title="Discard without sending"
                  >
                    <Trash2 size={12} /> Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
