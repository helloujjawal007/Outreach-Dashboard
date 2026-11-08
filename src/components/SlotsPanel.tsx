import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import type { SlotStatus, SlotSenderSettings, SlotId } from '@/types';
import {
  Clock,
  Mail,
  Settings as SettingsIcon,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export function SlotsPanel() {
  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [settings, setSettings] = useState<SlotSenderSettings | null>(null);
  const [activeSlotNow, setActiveSlotNow] = useState<SlotId | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTickRunning, setIsTickRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cycleMinInput, setCycleMinInput] = useState('10');
  const [offsetMinInput, setOffsetMinInput] = useState('2');
  const [tdUrlInput, setTdUrlInput] = useState('');
  const [tdSecretInput, setTdSecretInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [isTestingTd, setIsTestingTd] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(Math.floor(Date.now() / 1000));

  const handleTestTdConnection = async () => {
    setIsTestingTd(true);
    setFeedback(null);
    try {
      const res = await api.testTdConnection({
        url: tdUrlInput.trim(),
        secret: tdSecretInput.trim(),
      });
      if (res.ok) {
        setFeedback(`✓ TD Connection Verified: ${res.message} (${res.latencyMs}ms)`);
      } else {
        setFeedback(`⚠️ TD Connection Failed: ${res.message}`);
      }
    } catch (err: any) {
      setFeedback(`❌ TD Probe Error: ${err?.message}`);
    } finally {
      setIsTestingTd(false);
      setTimeout(() => setFeedback(null), 8000);
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.getSlotsStatus();
      if (res.success) {
        setSlots(res.slots);
        setSettings(res.settings);
        setActiveSlotNow(res.activeSlotNow);
        setCycleMinInput(String(res.settings.slot_cycle_min));
        setOffsetMinInput(String(res.settings.slot_offset_min));
        setTdUrlInput(res.settings.td_endpoint_url || '');
        setTdSecretInput(res.settings.td_shared_secret || '');
      }
    } catch (err: any) {
      console.warn('[SlotsPanel] fetchStatus error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    const clockInterval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, [fetchStatus]);

  const handleTriggerTick = async () => {
    setIsTickRunning(true);
    setFeedback(null);
    try {
      const res = await api.triggerSlotTick();
      if (res.success) {
        if (res.dispatched) {
          setFeedback(`⚡ Slot ${res.activeSlot || ''} dispatched send successfully!`);
        } else {
          setFeedback(`ℹ️ Tick completed (${res.reason || 'No send dispatched'})`);
        }
        await fetchStatus();
      }
    } catch (err: any) {
      setFeedback(`❌ Tick error: ${err?.message}`);
    } finally {
      setIsTickRunning(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const cycle = parseInt(cycleMinInput, 10) || 10;
      const offset = parseInt(offsetMinInput, 10) || Math.max(1, Math.floor(cycle / 5));
      const res = await api.updateSlotsSettings({
        slot_cycle_min: cycle,
        slot_offset_min: offset,
        td_endpoint_url: tdUrlInput.trim(),
        td_shared_secret: tdSecretInput.trim(),
      });
      if (res.success) {
        setSettings(res.settings);
        setFeedback('✓ Staggered slot settings updated successfully');
        setShowSettings(false);
        await fetchStatus();
      }
    } catch (err: any) {
      setFeedback(`❌ Error saving settings: ${err?.message}`);
    } finally {
      setSavingSettings(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const formatCountdown = (isoString?: string) => {
    if (!isoString) return '--';
    const targetSec = Math.floor(new Date(isoString).getTime() / 1000);
    const diff = targetSec - nowSec;
    if (diff <= 0) return 'Due now';
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const slotColors: Record<SlotId, { border: string; bg: string; badge: string; text: string }> = {
    A: { border: 'border-blue-200', bg: 'bg-blue-50/50', badge: 'bg-blue-600', text: 'text-blue-900' },
    B: { border: 'border-purple-200', bg: 'bg-purple-50/50', badge: 'bg-purple-600', text: 'text-purple-900' },
    C: { border: 'border-emerald-200', bg: 'bg-emerald-50/50', badge: 'bg-emerald-600', text: 'text-emerald-900' },
    D: { border: 'border-amber-200', bg: 'bg-amber-50/50', badge: 'bg-amber-600', text: 'text-amber-900' },
    E: { border: 'border-rose-200', bg: 'bg-rose-50/50', badge: 'bg-rose-600', text: 'text-rose-900' },
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs mb-6 overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Layers size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">5-Slot Staggered Scheduler</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Deterministic Grid (Cycle: {settings?.slot_cycle_min || 10}m, Offset: {settings?.slot_offset_min || 2}m)
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Zero send conflicts. Audit-first pipeline with sticky slot round-robin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {feedback && (
            <span className="text-xs font-medium px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200">
              {feedback}
            </span>
          )}
          <button
            onClick={handleTriggerTick}
            disabled={isTickRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
            title="Fire a manual scheduler tick"
          >
            <Play size={13} className={isTickRunning ? 'animate-spin' : ''} />
            <span>Trigger Tick</span>
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
          >
            <SettingsIcon size={13} />
            <span>Settings</span>
            {showSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Refresh slots"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Settings Panel Drawer */}
      {showSettings && (
        <form onSubmit={handleSaveSettings} className="p-4 bg-slate-50/80 border-b border-slate-200 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Slot Cycle Time (Min)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={cycleMinInput}
                onChange={(e) => setCycleMinInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500">How often a slot sends (default: 10m)</span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Slot Stagger Offset (Min)</label>
              <input
                type="number"
                min="1"
                max="30"
                value={offsetMinInput}
                onChange={(e) => setOffsetMinInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500">Delay between slots (default: 2m)</span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">TD Audit Webhook URL</label>
              <input
                type="text"
                placeholder="https://td.example.com/api/audit"
                value={tdUrlInput}
                onChange={(e) => setTdUrlInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500">TD SEO Audit Pro endpoint (optional)</span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shared Secret Header</label>
              <input
                type="password"
                placeholder="td-secret-key"
                value={tdSecretInput}
                onChange={(e) => setTdSecretInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500">Validated on callback webhook</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleTestTdConnection}
              disabled={isTestingTd}
              className="px-3 py-1 rounded bg-amber-50 border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100 disabled:opacity-50"
            >
              {isTestingTd ? 'Testing TD...' : 'Test TD Connection'}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="px-3 py-1 rounded bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}

      {/* 5 Virtual Slots Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {slots.map((s) => {
          const colors = slotColors[s.slotId] || slotColors.A;
          const isActive = activeSlotNow === s.slotId;
          const countdown = formatCountdown(s.nextSendTime);

          return (
            <div
              key={s.slotId}
              className={`rounded-xl border ${colors.border} ${colors.bg} p-3.5 relative flex flex-col justify-between transition-all ${
                isActive ? 'ring-2 ring-indigo-500 shadow-sm' : ''
              }`}
            >
              {/* Top Slot Header */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-7 w-7 rounded-lg ${colors.badge} text-white font-black text-sm flex items-center justify-center shadow-xs`}
                  >
                    {s.slotId}
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block leading-tight">
                      Slot {s.slotId}
                    </span>
                    <span className="text-[10px] text-slate-500">Virtual Slot</span>
                  </div>
                </div>

                {isActive ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Active Now
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">
                    <Clock size={10} />
                    {countdown}
                  </span>
                )}
              </div>

              {/* Mailbox info */}
              <div className="bg-white/80 rounded-lg p-2 border border-slate-200/80 mb-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 mb-0.5">
                  <Mail size={12} className="text-indigo-500 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Mailbox</span>
                </div>
                <div className="font-semibold text-slate-800 truncate text-[11px]" title={s.assignedMailbox.email}>
                  {s.assignedMailbox.email}
                </div>
              </div>

              {/* Counts & Pipeline status */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Queued:</span>
                  <span className="font-bold text-slate-900">{s.queuedCount}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1">
                    <CheckCircle size={11} className="text-emerald-500" /> Ready to Send:
                  </span>
                  <span className="font-bold text-emerald-700">{s.readyToSendCount}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1">
                    <AlertCircle size={11} className="text-amber-500" /> Awaiting Audit:
                  </span>
                  <span className="font-bold text-amber-700">{s.waitingAuditCount}</span>
                </div>
              </div>

              {/* Next turn timestamp */}
              <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Next turn:</span>
                <span className="font-mono font-medium text-slate-600">
                  {new Date(s.nextSendTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

