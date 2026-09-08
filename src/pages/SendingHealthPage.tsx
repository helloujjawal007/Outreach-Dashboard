import { useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Mail, MessageCircle, Instagram, Trash2, Send, Clock } from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import type { Store } from '@/store';
import { mockSendHealth } from '@/mockData';
import { channelLabels } from '@/types';

interface Props {
  store: Store;
}

export function SendingHealthPage({ store }: Props) {
  const healthData = useMemo(() => mockSendHealth, []);

  const totals = useMemo(() => {
    const sent = healthData.reduce((s, d) => s + d.sent, 0);
    const bounced = healthData.reduce((s, d) => s + d.bounced, 0);
    const drafted = healthData.reduce((s, d) => s + d.drafted, 0);
    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    return { sent, bounced, drafted, bounceRate };
  }, [healthData]);

  const healthStatus = useMemo(() => {
    if (totals.bounceRate > 5) return { level: 'red' as const, label: 'Poor', description: 'Bounce rate above 5% — review your lead list quality.' };
    if (totals.bounceRate > 2) return { level: 'yellow' as const, label: 'Fair', description: 'Bounce rate slightly elevated — monitor closely.' };
    return { level: 'green' as const, label: 'Healthy', description: 'Sending reputation looks good. Bounce rate is within normal range.' };
  }, [totals.bounceRate]);

  const maxSent = Math.max(...healthData.map((d) => d.sent));

  const statusColors = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', badge: 'green' as const },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', badge: 'yellow' as const },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', badge: 'red' as const },
  };

  const sc = statusColors[healthStatus.level];

  const channelIcon = (channel: string) => {
    if (channel === 'email') return <Mail size={14} className="text-brand-500" />;
    if (channel === 'whatsapp') return <MessageCircle size={14} className="text-emerald-500" />;
    return <Instagram size={14} className="text-violet-500" />;
  };

  return (
    <div>
      <PageHeader
        title="Sending Health"
        subtitle="Monitor delivery performance, bounce rates, and your manual send queue."
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
        <Badge variant={sc.badge}>
          {healthStatus.level === 'green' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {totals.bounceRate.toFixed(1)}% bounce rate
        </Badge>
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Total Sent (7d)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
              <Send size={16} className="text-brand-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{totals.sent.toLocaleString()}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
            <TrendingUp size={12} /> +18% vs last week
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
            <TrendingDown size={12} /> {totals.bounceRate.toFixed(1)}% bounce rate
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Drafted (Manual)</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Clock size={16} className="text-amber-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{totals.drafted}</p>
          <p className="mt-1 text-xs text-ink-500">Needs human send</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Queue Pending</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
              <Activity size={16} className="text-violet-600" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-900">{store.queue.length}</p>
          <p className="mt-1 text-xs text-ink-500">Instagram / FB drafts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Daily Send Volume Chart */}
        <div className="card p-5 lg:col-span-3">
          <h3 className="mb-4 text-sm font-bold text-ink-900">Daily Send Volume</h3>
          <div className="flex items-end gap-3 h-48">
            {healthData.map((day) => {
              const sentHeight = (day.sent / maxSent) * 100;
              const bouncedHeight = maxSent > 0 ? (day.bounced / maxSent) * 100 : 0;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 flex-col justify-end gap-0.5">
                    <div
                      className="w-full rounded-t bg-red-400 transition-all hover:bg-red-500"
                      style={{ height: `${Math.max(bouncedHeight, 1)}%` }}
                      title={`${day.bounced} bounced`}
                    />
                    <div
                      className="w-full rounded-t bg-brand-500 transition-all hover:bg-brand-600"
                      style={{ height: `${sentHeight}%` }}
                      title={`${day.sent} sent`}
                    />
                  </div>
                  <span className="text-xs text-ink-500">{day.date}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-ink-500">
              <span className="h-2.5 w-2.5 rounded bg-brand-500" /> Sent
            </span>
            <span className="flex items-center gap-1.5 text-ink-500">
              <span className="h-2.5 w-2.5 rounded bg-red-400" /> Bounced
            </span>
          </div>
        </div>

        {/* Bounce Rate Chart */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-ink-900">Bounce Rate (Daily)</h3>
          <div className="space-y-3">
            {healthData.map((day) => {
              const rate = day.sent > 0 ? (day.bounced / day.sent) * 100 : 0;
              const color = rate > 5 ? 'bg-red-500' : rate > 2 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-ink-500">{day.date}</span>
                  <div className="flex-1 h-6 rounded bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded ${color} transition-all`}
                      style={{ width: `${Math.min(rate * 10, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-ink-700">{rate.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Manual Send Queue */}
      <div className="mt-6 card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Manual Send Queue</h3>
            <p className="text-xs text-ink-500 mt-0.5">Instagram / Facebook messages drafted for human review — these are never auto-sent.</p>
          </div>
          <Badge variant="yellow">{store.queue.length} pending</Badge>
        </div>

        {store.queue.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-ink-700">Queue is clear</p>
            <p className="text-xs text-ink-500">No drafts waiting for manual send.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {store.queue.map((item) => (
              <div key={item.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                  {channelIcon(item.channel)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink-900">{item.leadName}</p>
                    <Badge variant="gray">{channelLabels[item.channel]}</Badge>
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {item.campaignName} · {item.stepName}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-700 line-clamp-2">{item.messagePreview}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn-secondary text-xs">
                    <Send size={14} /> Mark Sent
                  </button>
                  <button
                    onClick={() => store.removeQueueItem(item.id)}
                    className="rounded-lg p-2 text-ink-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={14} />
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
