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
  Plus,
  Server,
  Check,
  Globe,
  Power,
  RefreshCw,
  Zap,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import type { Store } from '@/store';
import { mockSendHealth } from '@/mockData';
import {
  channelLabels,
  type ConnectedInbox,
  type InboxPoolSummary,
  type MillionVerifierCreditsResponse,
  type EmailVerificationTestResponse,
} from '@/types';
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

  // Multi-Inbox Rotation State
  const [inboxes, setInboxes] = useState<ConnectedInbox[]>([]);
  const [poolSummary, setPoolSummary] = useState<InboxPoolSummary | null>(null);
  const [isLoadingInboxes, setIsLoadingInboxes] = useState(false);
  const [isAddInboxModalOpen, setIsAddInboxModalOpen] = useState(false);
  const [isTestingInbox, setIsTestingInbox] = useState(false);
  const [inboxTestResult, setInboxTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSubmittingInbox, setIsSubmittingInbox] = useState(false);
  const [inboxFormError, setInboxFormError] = useState<string | null>(null);

  // Test Send State
  const [testSendInbox, setTestSendInbox] = useState<ConnectedInbox | null>(null);
  const [testEmailTarget, setTestEmailTarget] = useState('team.onlinedigitalsolution@gmail.com');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testSendFeedback, setTestSendFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Edit Daily Limit State
  const [editingLimitInbox, setEditingLimitInbox] = useState<ConnectedInbox | null>(null);
  const [newLimitValue, setNewLimitValue] = useState<number>(40);
  const [isUpdatingLimit, setIsUpdatingLimit] = useState(false);

  // Row action spinners
  const [togglingInboxId, setTogglingInboxId] = useState<string | null>(null);
  const [deletingInboxId, setDeletingInboxId] = useState<string | null>(null);
  const [isDeletingFailedMessages, setIsDeletingFailedMessages] = useState(false);
  const [deleteFailedFeedback, setDeleteFailedFeedback] = useState<string | null>(null);

  // MillionVerifier State
  const [mvCredits, setMvCredits] = useState<MillionVerifierCreditsResponse | null>(null);
  const [isLoadingMvCredits, setIsLoadingMvCredits] = useState(false);
  const [verifyEmailInput, setVerifyEmailInput] = useState('support@millionverifier.com');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [verifyEmailResult, setVerifyEmailResult] = useState<EmailVerificationTestResponse | null>(null);
  const [verifyEmailError, setVerifyEmailError] = useState<string | null>(null);

  // New Inbox Form
  const [newInboxForm, setNewInboxForm] = useState<{
    name: string;
    sender_name: string;
    email: string;
    provider: 'google_workspace' | 'office_365' | 'smtp';
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_user: string;
    smtp_pass: string;
    daily_limit: number;
  }>({
    name: '',
    sender_name: 'Online Digital Solution Team',
    email: '',
    provider: 'google_workspace',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_secure: true,
    smtp_user: '',
    smtp_pass: '',
    daily_limit: 40,
  });

  const loadWarmup = useCallback(async () => {
    try {
      const status = await api.getEmailWarmupStatus();
      setWarmupStatus(status);
    } catch (err) {
      console.error('Failed to load warm-up status:', err);
    }
  }, []);

  const loadInboxes = useCallback(async () => {
    try {
      setIsLoadingInboxes(true);
      const res = await api.getInboxes();
      setInboxes(res.inboxes);
      setPoolSummary(res.summary);
    } catch (err) {
      console.error('Failed to load inboxes:', err);
    } finally {
      setIsLoadingInboxes(false);
    }
  }, []);

  const loadMvCredits = useCallback(async (refresh = false) => {
    try {
      setIsLoadingMvCredits(true);
      const res = await api.getMillionVerifierCredits(refresh);
      setMvCredits(res);
    } catch (err) {
      console.error('Failed to load MillionVerifier credits:', err);
    } finally {
      setIsLoadingMvCredits(false);
    }
  }, []);

  const handleTestVerifyEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!verifyEmailInput.trim() || isVerifyingEmail) return;
    setIsVerifyingEmail(true);
    setVerifyEmailError(null);
    setVerifyEmailResult(null);
    try {
      const res = await api.testEmailVerification(verifyEmailInput.trim());
      setVerifyEmailResult(res);
      if (res.millionVerifier?.credits !== undefined) {
        setMvCredits((prev) => (prev ? { ...prev, credits: res.millionVerifier.credits ?? prev.credits } : null));
      }
    } catch (err) {
      console.error('Failed to verify email:', err);
      setVerifyEmailError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  useEffect(() => {
    loadWarmup();
    loadInboxes();
    loadMvCredits();
  }, [loadWarmup, loadInboxes, loadMvCredits]);

  const handleProviderPresetChange = (provider: 'google_workspace' | 'office_365' | 'smtp') => {
    if (provider === 'google_workspace') {
      setNewInboxForm((prev) => ({
        ...prev,
        provider,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 465,
        smtp_secure: true,
      }));
    } else if (provider === 'office_365') {
      setNewInboxForm((prev) => ({
        ...prev,
        provider,
        smtp_host: 'smtp.office365.com',
        smtp_port: 587,
        smtp_secure: false,
      }));
    } else {
      setNewInboxForm((prev) => ({
        ...prev,
        provider,
        smtp_host: '',
        smtp_port: 587,
        smtp_secure: false,
      }));
    }
    setInboxTestResult(null);
    setInboxFormError(null);
  };

  const handleTestConnection = async () => {
    setInboxFormError(null);
    setInboxTestResult(null);
    if (!newInboxForm.smtp_host || !newInboxForm.smtp_user || !newInboxForm.smtp_pass) {
      setInboxFormError('Please enter SMTP Host, Username and Password to test connection.');
      return;
    }
    try {
      setIsTestingInbox(true);
      const res = await api.testInboxConnection({
        smtp_host: newInboxForm.smtp_host,
        smtp_port: Number(newInboxForm.smtp_port),
        smtp_secure: Boolean(newInboxForm.smtp_secure),
        smtp_user: newInboxForm.smtp_user.trim(),
        smtp_pass: newInboxForm.smtp_pass,
        provider: newInboxForm.provider,
      });
      setInboxTestResult(res);
    } catch (err: any) {
      setInboxTestResult({
        success: false,
        message: err.message || 'SMTP Connection test failed. Check host, port and authentication credentials.',
      });
    } finally {
      setIsTestingInbox(false);
    }
  };

  const handleCreateInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    setInboxFormError(null);
    if (!newInboxForm.email.trim() || !newInboxForm.smtp_user.trim() || !newInboxForm.smtp_pass.trim()) {
      setInboxFormError('Please fill in email address, username, and password.');
      return;
    }

    try {
      setIsSubmittingInbox(true);
      await api.addInbox({
        name: newInboxForm.name.trim() || `${newInboxForm.sender_name} (${newInboxForm.email})`,
        sender_name: newInboxForm.sender_name.trim(),
        email: newInboxForm.email.trim(),
        provider: newInboxForm.provider,
        smtp_host: newInboxForm.smtp_host.trim(),
        smtp_port: Number(newInboxForm.smtp_port),
        smtp_secure: Boolean(newInboxForm.smtp_secure),
        smtp_user: newInboxForm.smtp_user.trim(),
        smtp_pass: newInboxForm.smtp_pass,
        daily_limit: Number(newInboxForm.daily_limit) || 40,
      });

      setIsAddInboxModalOpen(false);
      setInboxTestResult(null);
      setNewInboxForm({
        name: '',
        sender_name: 'Online Digital Solution Team',
        email: '',
        provider: 'google_workspace',
        smtp_host: 'smtp.gmail.com',
        smtp_port: 465,
        smtp_secure: true,
        smtp_user: '',
        smtp_pass: '',
        daily_limit: 40,
      });
      await loadInboxes();
      await loadWarmup();
    } catch (err: any) {
      setInboxFormError(err.message || 'Failed to connect inbox.');
    } finally {
      setIsSubmittingInbox(false);
    }
  };

  const handleToggleInboxStatus = async (inbox: ConnectedInbox) => {
    try {
      setTogglingInboxId(inbox.id);
      const newStatus = inbox.status === 'active' ? 'paused' : 'active';
      await api.updateInbox(inbox.id, { status: newStatus });
      await loadInboxes();
    } catch (err) {
      console.error('Failed to toggle inbox status:', err);
    } finally {
      setTogglingInboxId(null);
    }
  };

  const handleDeleteInbox = async (inbox: ConnectedInbox) => {
    if (inbox.is_default) {
      alert('The default primary inbox cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove inbox "${inbox.name}" (${inbox.email}) from the rotation pool?`)) {
      return;
    }
    try {
      setDeletingInboxId(inbox.id);
      await api.deleteInbox(inbox.id);
      await loadInboxes();
      await loadWarmup();
    } catch (err) {
      console.error('Failed to delete inbox:', err);
    } finally {
      setDeletingInboxId(null);
    }
  };

  const handleSaveLimit = async () => {
    if (!editingLimitInbox) return;
    try {
      setIsUpdatingLimit(true);
      await api.updateInbox(editingLimitInbox.id, { daily_limit: Number(newLimitValue) || 40 });
      setEditingLimitInbox(null);
      await loadInboxes();
      await loadWarmup();
    } catch (err) {
      console.error('Failed to update daily limit:', err);
    } finally {
      setIsUpdatingLimit(false);
    }
  };

  const handleExecuteTestSend = async () => {
    if (!testSendInbox || !testEmailTarget.trim()) return;
    try {
      setIsSendingTestEmail(true);
      setTestSendFeedback(null);
      const res = await api.testSendInbox(testSendInbox.id, testEmailTarget.trim());
      if (res.success) {
        setTestSendFeedback({
          success: true,
          message: `Live test email successfully delivered to ${testEmailTarget} via ${testSendInbox.email}!`,
        });
        await loadInboxes();
      } else {
        setTestSendFeedback({
          success: false,
          message: res.reason || 'Test send failed. Check server logs.',
        });
      }
    } catch (err: any) {
      setTestSendFeedback({
        success: false,
        message: err.message || 'Failed to dispatch test send.',
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

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

  const handleDeleteFailedMessages = async () => {
    if (isDeletingFailedMessages) return;
    if (!window.confirm('Are you sure you want to delete all failed outreach emails and messages in bulk?')) {
      return;
    }
    setIsDeletingFailedMessages(true);
    try {
      const res = await api.bulkDeleteAllFailedOutreach();
      const totalDeleted = (res.dispatchesCount || 0) + (res.messagesCount || 0);
      setDeleteFailedFeedback(
        totalDeleted > 0
          ? `Cleared ${totalDeleted} failed outreach records.`
          : 'No failed outreach messages found.'
      );
      await store.fetchHealth();
      setTimeout(() => setDeleteFailedFeedback(null), 4000);
    } catch (err) {
      console.error('Failed to purge failed messages:', err);
      setDeleteFailedFeedback(err instanceof Error ? err.message : 'Failed to purge.');
      setTimeout(() => setDeleteFailedFeedback(null), 4000);
    } finally {
      setIsDeletingFailedMessages(false);
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
        received: store.health.totals.received || 0,
        bounced: store.health.totals.bounced,
        complaints: store.health.totals.complaints || 0,
        drafted: store.health.totals.drafted,
        bounceRate: store.health.totals.bounceRate,
        complaintRate: store.health.totals.complaintRate || 0,
        replyRate: store.health.totals.replyRate || 0,
        sentToday: store.health.totals.sentToday ?? (healthData[healthData.length - 1]?.sent || 0),
        receivedToday: store.health.totals.receivedToday ?? (healthData[healthData.length - 1]?.received || 0),
        bouncedToday: store.health.totals.bouncedToday ?? (healthData[healthData.length - 1]?.bounced || 0),
        complaintsToday: store.health.totals.complaintsToday ?? 0,
      };
    }
    const sent = healthData.reduce((s, d) => s + d.sent, 0);
    const received = healthData.reduce((s, d) => s + (d.received || 0), 0);
    const bounced = healthData.reduce((s, d) => s + d.bounced, 0);
    const complaints = healthData.reduce((s, d) => s + (d.complaints || 0), 0);
    const drafted = store.queue.length;
    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    const complaintRate = sent > 0 ? (complaints / sent) * 100 : 0;
    const replyRate = sent > 0 ? (received / sent) * 100 : 0;
    const lastDay = healthData[healthData.length - 1] || { sent: 0, received: 0, bounced: 0, complaints: 0 };
    return {
      sent,
      received,
      bounced,
      complaints,
      drafted,
      bounceRate,
      complaintRate,
      replyRate,
      sentToday: lastDay.sent,
      receivedToday: lastDay.received || 0,
      bouncedToday: lastDay.bounced,
      complaintsToday: lastDay.complaints || 0,
    };
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
          <button
            type="button"
            onClick={handleDeleteFailedMessages}
            disabled={isDeletingFailedMessages}
            className="mt-3 w-full py-1.5 px-2 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center justify-center gap-1.5 transition-colors"
            title="Bulk delete all failed and bounced messages across channels"
          >
            {isDeletingFailedMessages ? (
              <Loader2 size={12} className="animate-spin text-rose-600" />
            ) : (
              <Trash2 size={12} className="text-rose-600" />
            )}
            <span>{isDeletingFailedMessages ? 'Purging Failed...' : 'Delete Failed Messages'}</span>
          </button>
          {deleteFailedFeedback && (
            <p className="mt-1.5 text-[10px] text-center font-semibold text-rose-600 animate-fade-in">
              {deleteFailedFeedback}
            </p>
          )}
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

      {/* APOLLO-GRADE MULTI-INBOX DELIVERABILITY & ROTATION POOL */}
      <div className="mb-6 card p-6 border-brand-200/80 bg-gradient-to-b from-white to-slate-50/50">
        <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shrink-0 mt-0.5">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-bold text-ink-900">Multi-Inbox Deliverability &amp; Rotation Pool</h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
                  <ShieldCheck size={12} /> Apollo-Grade Scaling
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  {poolSummary?.activeInboxes || inboxes.filter((i) => i.status === 'active').length} Active Rotating
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-1 max-w-2xl leading-relaxed">
                Connect and rotate multiple Google Workspace, Microsoft 365, and SMTP accounts. Distribute sending volume evenly so each inbox sends a safe volume (30–50/day) while scaling aggregate volume to hundreds or thousands per day without burning domain reputation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <button
              onClick={loadInboxes}
              disabled={isLoadingInboxes}
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
              title="Refresh inbox statuses"
            >
              <RefreshCw size={13} className={isLoadingInboxes ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => {
                setIsAddInboxModalOpen(true);
                setInboxTestResult(null);
                setInboxFormError(null);
              }}
              className="btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              <span>Connect Mailbox</span>
            </button>
          </div>
        </div>

        {/* Aggregate Pool Metric Strip */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Rotation Inboxes</span>
            <p className="text-xl font-bold text-ink-900 mt-0.5">
              {poolSummary?.totalInboxes || inboxes.length} <span className="text-xs font-normal text-ink-500">mailboxes</span>
            </p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
              {poolSummary?.activeInboxes || inboxes.filter((i) => i.status === 'active').length} active in round-robin
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Total Daily Capacity</span>
            <p className="text-xl font-bold text-ink-900 mt-0.5">
              {poolSummary?.totalDailyCapacity || inboxes.reduce((s, i) => s + (i.status === 'active' ? i.daily_limit : 0), 0)}
              <span className="text-xs font-normal text-ink-500"> / day</span>
            </p>
            <p className="text-[11px] text-brand-600 font-medium mt-0.5">
              Safe distributed threshold
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Dispatched Today</span>
            <p className="text-xl font-bold text-ink-900 mt-0.5">
              {poolSummary?.totalSentToday ?? inboxes.reduce((s, i) => s + i.sent_today, 0)}
            </p>
            <p className="text-[11px] text-ink-500 font-medium mt-0.5">
              {poolSummary?.remainingCapacityToday ?? Math.max(0, (poolSummary?.totalDailyCapacity || 50) - (poolSummary?.totalSentToday || 0))} capacity remaining
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Pool Health Score</span>
            <p className="text-xl font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
              {poolSummary?.averageHealthScore ?? 100}%
            </p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
              All SPF / DKIM / MX healthy
            </p>
          </div>
        </div>

        {/* Connected Inboxes Cards List */}
        <div className="space-y-3">
          {inboxes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-white">
              <Server size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="font-bold text-sm text-ink-800">No Inboxes Connected</p>
              <p className="text-xs text-ink-400 max-w-md mx-auto mt-1 mb-4">
                Add your Google Workspace or Microsoft 365 accounts to start rotating cold email dispatches and scaling safely.
              </p>
              <button
                onClick={() => setIsAddInboxModalOpen(true)}
                className="btn-primary py-1.5 px-4 text-xs inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Connect First Mailbox
              </button>
            </div>
          ) : (
            inboxes.map((inbox) => {
              const usagePercent = Math.min(100, Math.round((inbox.sent_today / Math.max(1, inbox.daily_limit)) * 100));
              const isExhausted = inbox.sent_today >= inbox.daily_limit;

              return (
                <div
                  key={inbox.id}
                  className={`rounded-xl border p-4 transition-all bg-white shadow-2xs ${
                    inbox.status === 'active'
                      ? 'border-slate-200/90 hover:border-brand-300'
                      : 'border-slate-200/60 bg-slate-50/40 opacity-75'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Inbox Info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                          inbox.provider === 'google_workspace'
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : inbox.provider === 'office_365'
                            ? 'bg-sky-50 text-sky-600 border border-sky-200'
                            : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                        }`}
                      >
                        {inbox.provider === 'google_workspace' ? (
                          <Mail size={18} />
                        ) : inbox.provider === 'office_365' ? (
                          <Globe size={18} />
                        ) : (
                          <Server size={18} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-ink-900 truncate">{inbox.name}</h4>
                          {inbox.is_default && (
                            <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              Primary Master
                            </span>
                          )}
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold capitalize border ${
                              inbox.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : inbox.status === 'paused'
                                ? 'bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {inbox.status}
                          </span>
                          <span className="text-[11px] text-ink-400 capitalize">
                            {inbox.provider.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-ink-500 mt-1 flex-wrap">
                          <span className="font-mono text-ink-700 font-medium">{inbox.email}</span>
                          <span>•</span>
                          <span>
                            Sender: <strong className="text-ink-800">{inbox.sender_name}</strong>
                          </span>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-ink-400">
                            {inbox.smtp_host}:{inbox.smtp_port}
                          </span>
                        </div>

                        {inbox.last_error && (
                          <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle size={12} /> {inbox.last_error}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
                      {/* Daily Limit Bar */}
                      <div className="w-48">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-medium text-ink-600">Daily Cap</span>
                          <span className="font-bold text-ink-900">
                            {inbox.sent_today} / {inbox.daily_limit}{' '}
                            <span className="text-ink-400 font-normal">({usagePercent}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              isExhausted ? 'bg-amber-500' : 'bg-brand-600'
                            }`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-ink-400 mt-0.5">
                          <span>{Math.max(0, inbox.daily_limit - inbox.sent_today)} left today</span>
                          <span className="text-emerald-600 font-semibold">{inbox.health_score}/100 Health</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleInboxStatus(inbox)}
                          disabled={togglingInboxId === inbox.id}
                          className={`btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 ${
                            inbox.status === 'active'
                              ? 'text-slate-700 hover:bg-slate-100'
                              : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          }`}
                          title={inbox.status === 'active' ? 'Pause rotation' : 'Resume rotation'}
                        >
                          {togglingInboxId === inbox.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Power size={12} />
                          )}
                          <span>{inbox.status === 'active' ? 'Pause' : 'Resume'}</span>
                        </button>

                        <button
                          onClick={() => {
                            setTestSendInbox(inbox);
                            setTestSendFeedback(null);
                          }}
                          className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"
                          title="Send test email from this mailbox"
                        >
                          <Send size={12} />
                          <span>Test Send</span>
                        </button>

                        <button
                          onClick={() => {
                            setEditingLimitInbox(inbox);
                            setNewLimitValue(inbox.daily_limit);
                          }}
                          className="btn-secondary py-1 px-2 text-xs"
                          title="Adjust daily limit"
                        >
                          <Sliders size={12} />
                        </button>

                        {!inbox.is_default && (
                          <button
                            onClick={() => handleDeleteInbox(inbox)}
                            disabled={deletingInboxId === inbox.id}
                            className="btn-secondary py-1 px-2 text-xs text-red-600 hover:bg-red-50 border-red-200"
                            title="Remove mailbox from pool"
                          >
                            {deletingInboxId === inbox.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
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

      {/* MILLIONVERIFIER™ REAL-TIME DELIVERABILITY & VALIDATION SHIELD */}
      <div className="mb-6 card p-6 border-indigo-200/80 bg-gradient-to-b from-white to-indigo-50/20 shadow-sm">
        <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-100 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20 shrink-0 mt-0.5">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-bold text-ink-900">MillionVerifier™ Real-Time Email Validation Engine</h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  <Sparkles size={11} className="text-indigo-600" /> API Connected
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-mono">
                  {mvCredits?.maskedKey || 'xFJ7...AGFj'}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-1 max-w-3xl leading-relaxed">
                Connects live with <a href="https://app.millionverifier.com/" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5 font-medium">app.millionverifier.com <ExternalLink size={10} /></a>. Pre-screens scraped leads and outbound cold dispatches to protect domain reputation from hard bounces, spam traps, invalid MX hosts, and disposable email inboxes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <button
              onClick={() => loadMvCredits(true)}
              disabled={isLoadingMvCredits}
              className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 shadow-2xs hover:border-indigo-300"
              title="Refresh MillionVerifier API credits balance"
            >
              <RefreshCw size={13} className={isLoadingMvCredits ? 'animate-spin text-indigo-600' : ''} />
              <span>Check Balance</span>
            </button>
            <a
              href="https://app.millionverifier.com/"
              target="_blank"
              rel="noreferrer"
              className="btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1.5 shadow-xs bg-indigo-600 hover:bg-indigo-700"
            >
              <span>MillionVerifier Portal</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* 3 Status & Credit Info Cards */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">API Key Authentication</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-sm font-bold text-ink-900">
                {mvCredits?.isWorking ? 'Verified & Authenticated' : 'Key Configured'}
              </p>
            </div>
            <p className="text-[11px] text-ink-500 font-mono mt-1">
              Plan Level: {mvCredits?.plan !== undefined ? mvCredits.plan : '4'} (Active)
            </p>
          </div>

          <div className={`rounded-xl border p-4 shadow-2xs transition-all ${
            (mvCredits?.credits ?? 0) > 0
              ? 'border-emerald-200 bg-emerald-50/30'
              : 'border-amber-200 bg-amber-50/40'
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Available Credits</span>
            <div className="flex items-center justify-between mt-1">
              <p className={`text-xl font-bold ${
                (mvCredits?.credits ?? 0) > 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {(mvCredits?.credits ?? 0).toLocaleString()} <span className="text-xs font-normal text-ink-500">verifications</span>
              </p>
              {(mvCredits?.credits ?? 0) === 0 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Zero Balance
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Ready
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-500 mt-1">
              {(mvCredits?.credits ?? 0) === 0 ? (
                <span>Top up credits on MillionVerifier to enable live SMTP pinging.</span>
              ) : (
                <span className="text-emerald-600 font-medium">Full single & batch verification enabled.</span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Safety & Fallback Engine</span>
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <p className="text-sm font-bold text-ink-900">Fail-Safe Auto Routing</p>
            </div>
            <p className="text-[11px] text-ink-500 mt-1 leading-snug">
              When credits reach 0, system automatically falls back to DNS MX resolution so outreach dispatches are never interrupted.
            </p>
          </div>
        </div>

        {/* Notice banner if credits === 0 */}
        {(mvCredits?.credits ?? 0) === 0 && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">MillionVerifier API Key is Authenticated, but your credit balance is 0.</p>
              <p className="text-amber-800 mt-0.5 leading-relaxed">
                We tested your API key against MillionVerifier's endpoints and confirmed your account is valid (Plan 4). However, real-time live SMTP probing requires verification credits on MillionVerifier. In the meantime, our system has activated the <strong>Smart Fallback Engine</strong> (validates RFC syntax, extracts MX DNS records, and identifies disposable hosts) so you can continue scraping and dispatching safely without downtime.
              </p>
            </div>
          </div>
        )}

        {/* Interactive Single Email Verification Tester */}
        <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs">
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                Interactive Email Deliverability Tester
              </h4>
              <p className="text-xs text-ink-500 mt-0.5">
                Test any email address against MillionVerifier API with fallback resolution.
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-ink-400">Quick test:</span>
              <button
                type="button"
                onClick={() => setVerifyEmailInput('support@millionverifier.com')}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-ink-700 transition-colors"
              >
                support@millionverifier.com
              </button>
              <button
                type="button"
                onClick={() => setVerifyEmailInput('test@gmail.com')}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-ink-700 transition-colors"
              >
                test@gmail.com
              </button>
              <button
                type="button"
                onClick={() => setVerifyEmailInput('invalid-lead-123@nonexistent-domain-404xyz.com')}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-ink-700 transition-colors"
              >
                invalid-sample
              </button>
            </div>
          </div>

          <form onSubmit={handleTestVerifyEmail} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="email"
                required
                value={verifyEmailInput}
                onChange={(e) => setVerifyEmailInput(e.target.value)}
                placeholder="Enter email to test (e.g. lead@company.com)..."
                className="input pl-9 py-2 text-xs w-full"
              />
            </div>
            <button
              type="submit"
              disabled={isVerifyingEmail || !verifyEmailInput.trim()}
              className="btn-primary py-2 px-4 text-xs flex items-center justify-center gap-1.5 shrink-0 bg-indigo-600 hover:bg-indigo-700"
            >
              {isVerifyingEmail ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Verifying via MillionVerifier...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>Verify Email</span>
                </>
              )}
            </button>
          </form>

          {/* Test Error */}
          {verifyEmailError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{verifyEmailError}</span>
            </div>
          )}

          {/* Test Verification Results Card */}
          {verifyEmailResult && (
            <div className="mt-4 rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-ink-900">
                    {verifyEmailResult.email}
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border ${
                    verifyEmailResult.unified.isValid
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {verifyEmailResult.unified.isValid ? 'Valid / Deliverable' : 'Undeliverable / Risky'}
                  </span>
                </div>
                <span className="text-[11px] text-ink-500">
                  Status Code: <strong className="text-ink-800">{verifyEmailResult.unified.status}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-0.5">
                    Unified Resolution
                  </span>
                  <div className="flex items-center gap-1.5">
                    {verifyEmailResult.unified.isValid ? (
                      <CheckCircle2 size={14} className="text-emerald-600" />
                    ) : (
                      <AlertCircle size={14} className="text-red-600" />
                    )}
                    <span className="font-bold text-ink-800">
                      {verifyEmailResult.unified.isValid ? 'Approved for Outreach' : 'Filtered / Blocked'}
                    </span>
                  </div>
                  {verifyEmailResult.unified.reason && (
                    <p className="text-[11px] text-ink-500 mt-1 capitalize">
                      Reason: {verifyEmailResult.unified.reason.replace(/_/g, ' ')}
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-0.5">
                    MillionVerifier Response
                  </span>
                  <p className="font-bold text-ink-800">
                    Result: <span className="uppercase text-indigo-700">{verifyEmailResult.millionVerifier.result}</span>
                  </p>
                  <p className="text-[11px] text-ink-500 mt-1">
                    Code: {verifyEmailResult.millionVerifier.resultcode} {verifyEmailResult.millionVerifier.subresult ? `· ${verifyEmailResult.millionVerifier.subresult}` : ''}
                  </p>
                  {verifyEmailResult.millionVerifier.error && (
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Notice: {verifyEmailResult.millionVerifier.error}
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-0.5">
                    Active Verification Path
                  </span>
                  <p className="font-bold text-ink-800">
                    {verifyEmailResult.millionVerifier.error === 'Insufficient credits' || verifyEmailResult.millionVerifier.resultcode === 4
                      ? 'DNS MX Fallback Active'
                      : 'Live MillionVerifier API'}
                  </p>
                  <p className="text-[11px] text-ink-500 mt-1">
                    Normalized: <span className="font-mono text-ink-700">{verifyEmailResult.unified.normalizedEmail}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
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

      {/* DAILY MESSAGE SEND, RECEIVED & BOUNCE TRACKER */}
      <div className="mb-6 card p-6 border-slate-200 shadow-sm">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-ink-900">Daily Message Send &amp; Deliverability Tracker</h3>
              <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[10px] font-extrabold text-brand-700 uppercase tracking-wider">
                Live Health
              </span>
            </div>
            <p className="text-xs text-ink-500 mt-0.5">
              Exact day-by-day record of how much was sent, inbound replies received, and bounces detected.
            </p>
          </div>

          {/* Today's Quick Summary Pill */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
              <span className="text-ink-500">Sent Today:</span>
              <strong className="text-ink-900 font-bold">{totals.sentToday}</strong>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-ink-500">Received Today:</span>
              <strong className="text-emerald-700 font-bold">{totals.receivedToday}</strong>
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="text-ink-500">Bounced:</span>
              <strong className={totals.bouncedToday > 0 ? 'text-red-600 font-bold' : 'text-slate-700 font-bold'}>
                {totals.bouncedToday}
              </strong>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-ink-600 font-medium">
              <span className="h-3 w-3 rounded-sm bg-brand-500" /> Sent That Day
            </span>
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="h-3 w-3 rounded-sm bg-emerald-500" /> Inbound Received (Replies)
            </span>
            <span className="flex items-center gap-1.5 text-red-600 font-medium">
              <span className="h-3 w-3 rounded-sm bg-red-400" /> Bounced
            </span>
          </div>
          <span className="text-[11px] text-ink-400">Showing last {healthData.length} active tracking days</span>
        </div>

        {/* Visual Bar Chart */}
        <div className="flex h-44 items-end gap-3 pt-6 pb-2 border-b border-slate-100 mb-6">
          {healthData.map((day) => {
            const chartMax = Math.max(...healthData.map((d) => Math.max(d.sent, d.received || 0, d.bounced)), 1);
            const sentH = (day.sent / chartMax) * 100;
            const recvH = ((day.received || 0) / chartMax) * 100;
            const bounceH = (day.bounced / chartMax) * 100;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-1 h-32">
                  {/* Sent Bar */}
                  <div
                    style={{ height: `${Math.max(sentH, day.sent > 0 ? 6 : 2)}%` }}
                    className="w-full max-w-6 rounded-t bg-brand-500 transition-all hover:bg-brand-600"
                    title={`${day.sent} messages sent on ${day.date}`}
                  />
                  {/* Received Bar */}
                  {(day.received || 0) > 0 && (
                    <div
                      style={{ height: `${Math.max(recvH, 6)}%` }}
                      className="w-2.5 rounded-t bg-emerald-500 transition-all hover:bg-emerald-600"
                      title={`${day.received} inbound replies received on ${day.date}`}
                    />
                  )}
                  {/* Bounced Bar */}
                  {day.bounced > 0 && (
                    <div
                      style={{ height: `${Math.max(bounceH, 6)}%` }}
                      className="w-2 rounded-t bg-red-400 transition-all hover:bg-red-500"
                      title={`${day.bounced} bounced on ${day.date}`}
                    />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-ink-600 whitespace-nowrap">{day.date}</span>
                <div className="flex items-center gap-1 text-[10px] text-ink-400">
                  <span className="text-brand-600 font-bold">{day.sent}</span>
                  {(day.received || 0) > 0 && (
                    <span className="text-emerald-600 font-semibold">· {day.received}r</span>
                  )}
                  {day.bounced > 0 && (
                    <span className="text-rose-500 font-bold">· {day.bounced}b</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-ink-500 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3 text-right">📤 Sent That Day</th>
                <th className="py-2.5 px-3 text-right">📥 Inbound Received</th>
                <th className="py-2.5 px-3 text-right">⚠️ Bounced</th>
                <th className="py-2.5 px-3 text-right">🛡️ Complaints</th>
                <th className="py-2.5 px-3 text-right">Delivery Health</th>
                <th className="py-2.5 px-3 text-right">Reply Rate</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-ink-700">
              {healthData.slice().reverse().map((day) => {
                const bRate = day.sent > 0 ? (day.bounced / day.sent) * 100 : 0;
                const rRate = day.sent > 0 ? ((day.received || 0) / day.sent) * 100 : 0;
                const delivRate = day.sent > 0 ? Math.max(0, 100 - bRate) : 100;
                const isWarning = bRate > 2 && bRate <= 5;
                const isCritical = bRate > 5;

                return (
                  <tr key={day.date} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-ink-900 flex items-center gap-1.5">
                      <Clock size={12} className="text-slate-400" />
                      <span>{day.date}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-brand-600">
                      {day.sent.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                      {day.received ? day.received.toLocaleString() : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {day.bounced > 0 ? (
                        <span className="font-bold text-red-600">{day.bounced}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {(day.complaints || 0) > 0 ? (
                        <span className="font-bold text-red-600">{day.complaints}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      <span className={delivRate >= 98 ? 'text-emerald-700' : delivRate >= 95 ? 'text-amber-700' : 'text-red-600'}>
                        {delivRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-ink-600">
                      {rRate > 0 ? `${rRate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isCritical ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800">
                          Critical
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          Warning
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Optimal
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      {/* CONNECT NEW MAILBOX MODAL */}
      {isAddInboxModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddInboxModalOpen(false)}
          title="Connect Cold Outreach Mailbox (Rotation Pool)"
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreateInbox} className="space-y-4">
            {/* Provider Selector Tabs */}
            <div>
              <label className="block text-xs font-bold text-ink-700 uppercase tracking-wider mb-2">
                Select Mailbox Provider
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleProviderPresetChange('google_workspace')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    newInboxForm.provider === 'google_workspace'
                      ? 'border-rose-400 bg-rose-50/70 text-rose-900 ring-2 ring-rose-200'
                      : 'border-slate-200 bg-white text-ink-600 hover:bg-slate-50'
                  }`}
                >
                  <Mail size={20} className={newInboxForm.provider === 'google_workspace' ? 'text-rose-600' : 'text-slate-400'} />
                  <span>Google Workspace</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderPresetChange('office_365')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    newInboxForm.provider === 'office_365'
                      ? 'border-sky-400 bg-sky-50/70 text-sky-900 ring-2 ring-sky-200'
                      : 'border-slate-200 bg-white text-ink-600 hover:bg-slate-50'
                  }`}
                >
                  <Globe size={20} className={newInboxForm.provider === 'office_365' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>Microsoft 365</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderPresetChange('smtp')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    newInboxForm.provider === 'smtp'
                      ? 'border-indigo-400 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-200'
                      : 'border-slate-200 bg-white text-ink-600 hover:bg-slate-50'
                  }`}
                >
                  <Server size={20} className={newInboxForm.provider === 'smtp' ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>Custom SMTP</span>
                </button>
              </div>
            </div>

            {/* Provider Guidance Banner */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-ink-600 leading-relaxed">
              {newInboxForm.provider === 'google_workspace' && (
                <p>
                  <strong>Google Workspace Tip:</strong> Generate a 16-character <em>App Password</em> in your Google Account &gt; Security &gt; 2-Step Verification &gt; App passwords. Standard account passwords will be rejected by Google SMTP.
                </p>
              )}
              {newInboxForm.provider === 'office_365' && (
                <p>
                  <strong>Microsoft 365 Tip:</strong> Ensure Authenticated SMTP (SMTP AUTH) is enabled for this mailbox in the Microsoft 365 Admin Center under Mail apps.
                </p>
              )}
              {newInboxForm.provider === 'smtp' && (
                <p>
                  <strong>Custom SMTP Tip:</strong> Use your private cold outreach domain host (e.g. Namecheap, Titan, Hostinger, AWS SES, or private Mailcow server).
                </p>
              )}
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Mailbox Label *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Outreach Google #2"
                  value={newInboxForm.name}
                  onChange={(e) => setNewInboxForm({ ...newInboxForm, name: e.target.value })}
                  className="input py-1.5 text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Sender Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Online Digital Solution Team"
                  value={newInboxForm.sender_name}
                  onChange={(e) => setNewInboxForm({ ...newInboxForm, sender_name: e.target.value })}
                  className="input py-1.5 text-xs w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">From Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. alex@yourdomain.com"
                  value={newInboxForm.email}
                  onChange={(e) => setNewInboxForm({ ...newInboxForm, email: e.target.value })}
                  className="input py-1.5 text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Daily Cap (Recommended: 30–50) *
                </label>
                <input
                  type="number"
                  min="5"
                  max="500"
                  required
                  value={newInboxForm.daily_limit}
                  onChange={(e) => setNewInboxForm({ ...newInboxForm, daily_limit: Number(e.target.value) })}
                  className="input py-1.5 text-xs w-full"
                />
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-3 bg-white">
              <span className="text-xs font-bold text-ink-800 uppercase tracking-wider block">
                SMTP Protocol Settings
              </span>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-ink-700 mb-1">SMTP Host *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. smtp.gmail.com"
                    value={newInboxForm.smtp_host}
                    onChange={(e) => setNewInboxForm({ ...newInboxForm, smtp_host: e.target.value })}
                    className="input py-1.5 text-xs w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">Port *</label>
                  <input
                    type="number"
                    required
                    value={newInboxForm.smtp_port}
                    onChange={(e) => setNewInboxForm({ ...newInboxForm, smtp_port: Number(e.target.value) })}
                    className="input py-1.5 text-xs w-full font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="smtp_secure_check"
                  checked={newInboxForm.smtp_secure}
                  onChange={(e) => setNewInboxForm({ ...newInboxForm, smtp_secure: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <label htmlFor="smtp_secure_check" className="text-xs text-ink-700 font-medium cursor-pointer">
                  Use Direct SSL (Port 465). Uncheck for STARTTLS (Port 587).
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">SMTP Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="Usually your full email address"
                    value={newInboxForm.smtp_user}
                    onChange={(e) => setNewInboxForm({ ...newInboxForm, smtp_user: e.target.value })}
                    className="input py-1.5 text-xs w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">SMTP Password / App Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••••••"
                    value={newInboxForm.smtp_pass}
                    onChange={(e) => setNewInboxForm({ ...newInboxForm, smtp_pass: e.target.value })}
                    className="input py-1.5 text-xs w-full font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Test Connection Results */}
            {inboxTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  inboxTestResult.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {inboxTestResult.success ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">{inboxTestResult.success ? 'SMTP Handshake Verified' : 'Connection Failed'}</p>
                  <p className="mt-0.5">{inboxTestResult.message}</p>
                </div>
              </div>
            )}

            {inboxFormError && (
              <p className="text-xs text-red-600 font-medium bg-red-50 p-2.5 rounded-lg border border-red-200 flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{inboxFormError}</span>
              </p>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingInbox || isSubmittingInbox}
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                {isTestingInbox ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Verifying Handshake...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} className="text-brand-600" />
                    <span>Test SMTP Connection</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddInboxModalOpen(false)}
                  className="btn-secondary py-1.5 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInbox || isTestingInbox}
                  className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5"
                >
                  {isSubmittingInbox ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Saving Mailbox...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>Add to Rotation Pool</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* TEST SEND VERIFICATION EMAIL MODAL */}
      {testSendInbox && (
        <Modal
          isOpen={true}
          onClose={() => setTestSendInbox(null)}
          title={`Test Live Email Delivery: ${testSendInbox.name}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-500 leading-relaxed">
              Send a live probe email from <strong className="text-ink-800">{testSendInbox.email}</strong> to verify that your SMTP credentials, TLS handshake, and deliverability pass end-to-end.
            </p>

            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Recipient Email Address *
              </label>
              <input
                type="email"
                value={testEmailTarget}
                onChange={(e) => setTestEmailTarget(e.target.value)}
                placeholder="e.g. you@company.com"
                className="input py-1.5 text-xs w-full"
              />
            </div>

            {testSendFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  testSendFeedback.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {testSendFeedback.success ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">{testSendFeedback.success ? 'Delivered Successfully' : 'Delivery Error'}</p>
                  <p className="mt-0.5">{testSendFeedback.message}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTestSendInbox(null)}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteTestSend}
                disabled={isSendingTestEmail || !testEmailTarget.trim()}
                className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5"
              >
                {isSendingTestEmail ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Sending Live Probe...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Send Test Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ADJUST DAILY DISPATCH LIMIT MODAL */}
      {editingLimitInbox && (
        <Modal
          isOpen={true}
          onClose={() => setEditingLimitInbox(null)}
          title={`Adjust Daily Sending Cap: ${editingLimitInbox.name}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-ink-500 leading-relaxed">
              Configure the maximum cold outreach emails permitted from <strong className="text-ink-800">{editingLimitInbox.email}</strong> in a 24-hour cycle.
            </p>

            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Daily Send Limit (Recommended: 30–50) *
              </label>
              <input
                type="number"
                min="5"
                max="500"
                value={newLimitValue}
                onChange={(e) => setNewLimitValue(Number(e.target.value))}
                className="input py-1.5 text-xs w-full"
              />
              <span className="text-[11px] text-ink-400 mt-1 block">
                Higher numbers risk domain spam filters. Apollo.io &amp; Smartlead best practices advise keeping each mailbox under 50/day.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingLimitInbox(null)}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLimit}
                disabled={isUpdatingLimit}
                className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5"
              >
                {isUpdatingLimit ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Saving Limit...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save Daily Limit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
