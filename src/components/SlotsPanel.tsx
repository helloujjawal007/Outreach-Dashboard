import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import type { SlotStatus, SlotSenderSettings, SlotId } from '@/types';
import {
  Clock,
  Mail,
  Settings as SettingsIcon,
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronUp,
  Split,
  Globe,
  FileJson,
  FileText,
  Send,
  CheckCircle2,
} from 'lucide-react';

export function SlotsPanel() {
  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [settings, setSettings] = useState<SlotSenderSettings | null>(null);
  const [activeSlotNow, setActiveSlotNow] = useState<SlotId | null>(null);
  const [schedulerState, setSchedulerState] = useState<'active' | 'standby' | 'stopped' | 'tripped'>('standby');
  const [hasPendingLeads, setHasPendingLeads] = useState(false);
  const [activeList, setActiveList] = useState<{ id: string; name: string } | null>(null);
  const [updatingPresetMin, setUpdatingPresetMin] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTickRunning, setIsTickRunning] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminatingSlotId, setTerminatingSlotId] = useState<'all' | SlotId>('all');
  const [isTerminating, setIsTerminating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState<SlotId | null>(null);
  
  // Settings Form State
  const [cycleMinInput, setCycleMinInput] = useState('10');
  const [offsetMinInput, setOffsetMinInput] = useState('2');
  const [tdUrlInput, setTdUrlInput] = useState('');
  const [tdSecretInput, setTdSecretInput] = useState('');
  const [is24_7Window, setIs24_7Window] = useState(true);
  const [sendWindowStartInput, setSendWindowStartInput] = useState('0');
  const [sendWindowEndInput, setSendWindowEndInput] = useState('24');
  const [weekdaysOnlyInput, setWeekdaysOnlyInput] = useState(false);
  const [sendWindowTzInput, setSendWindowTzInput] = useState('UTC');
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
        setActiveList(res.activeList || null);
        const derivedPending =
          res.hasPendingLeads ??
          res.slots.some((s) => (s.waitingCount ?? 0) > 0 || (s.readyToSendCount ?? 0) > 0 || (s.dueFollowupCount ?? 0) > 0);
        setHasPendingLeads(derivedPending);
        const derivedState =
          res.schedulerState ??
          (res.settings?.is_active === false
            ? 'stopped'
            : res.circuitBreaker?.tripped
            ? 'tripped'
            : derivedPending
            ? 'active'
            : 'standby');
        setSchedulerState(derivedState);
        setCycleMinInput(String(res.settings.slot_cycle_min));
        setOffsetMinInput(String(res.settings.slot_offset_min));
        setTdUrlInput(res.settings.td_endpoint_url || '');
        setTdSecretInput(res.settings.td_shared_secret || '');
        
        const is24_7 =
          (res.settings.send_window_start_hour === 0 || res.settings.send_window_start_hour === undefined) &&
          (res.settings.send_window_end_hour === 24 || res.settings.send_window_end_hour === undefined) &&
          !res.settings.weekdays_only;
        setIs24_7Window(is24_7);
        setSendWindowStartInput(String(res.settings.send_window_start_hour ?? 0));
        setSendWindowEndInput(String(res.settings.send_window_end_hour ?? 24));
        setWeekdaysOnlyInput(Boolean(res.settings.weekdays_only));
        setSendWindowTzInput(res.settings.send_window_timezone || 'UTC');
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
    const onSlotsUpdated = () => {
      fetchStatus();
    };
    window.addEventListener('od:slots-updated', onSlotsUpdated);
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
      window.removeEventListener('od:slots-updated', onSlotsUpdated);
    };
  }, [fetchStatus]);

  const handleTogglePause = async () => {
    setIsPausing(true);
    setFeedback(null);
    try {
      const willPause = settings?.is_active !== false;
      const res = await api.toggleSlotsPause(willPause);
      if (res.success) {
        setFeedback(res.message);
        await fetchStatus();
      }
    } catch (err: any) {
      setFeedback(`❌ Error toggling pause: ${err?.message}`);
    } finally {
      setIsPausing(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleTerminateSchedule = async () => {
    setIsTerminating(true);
    setFeedback(null);
    try {
      const res = await api.terminateSlotSchedule({
        slotId: terminatingSlotId === 'all' ? undefined : terminatingSlotId,
        pauseSender: terminatingSlotId === 'all',
      });
      if (res.success) {
        setFeedback(`🛑 ${res.message}`);
        setShowTerminateModal(false);
        await fetchStatus();
      } else {
        setFeedback(`⚠️ ${(res as any).error || 'Failed to terminate schedule'}`);
      }
    } catch (err: any) {
      setFeedback(`❌ Error terminating schedule: ${err?.message}`);
    } finally {
      setIsTerminating(false);
      setTimeout(() => setFeedback(null), 7000);
    }
  };

  const handleTriggerTick = async (force: boolean = true) => {
    setIsTickRunning(true);
    setFeedback(null);
    try {
      const res = await api.triggerSlotTick(force);
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

  const handleQuickCyclePreset = async (minutes: number) => {
    setUpdatingPresetMin(minutes);
    setFeedback(null);
    try {
      const offsetMin = Number(Math.max(0.1, minutes / 5).toFixed(2));
      const globalMinGapSec = Math.max(5, Math.floor(offsetMin * 60 * 0.75));
      const payload: Partial<SlotSenderSettings> = {
        slot_cycle_min: minutes,
        slot_offset_min: offsetMin,
        global_min_gap_sec: globalMinGapSec,
      };
      if (settings?.anchor_timestamp) {
        const currentAnchorMs = new Date(settings.anchor_timestamp).getTime();
        const targetCapMs = Date.now() + minutes * 60 * 1000;
        if (Number.isFinite(currentAnchorMs) && currentAnchorMs > targetCapMs) {
          payload.anchor_timestamp = new Date(targetCapMs).toISOString();
        }
      }
      const res = await api.updateSlotsSettings(payload);
      if (res.success) {
        setSettings(res.settings);
        const offsetText = offsetMin < 1 ? `${Math.round(offsetMin * 60)}s` : `${offsetMin}m`;
        setFeedback(`✓ Cycle set to ${minutes}m (${offsetText} between slots)`);
        await fetchStatus();
      }
    } catch (err: any) {
      setFeedback(`❌ Failed updating interval: ${err?.message}`);
    } finally {
      setUpdatingPresetMin(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleClearListScope = async () => {
    setIsDistributing(true);
    setFeedback(null);
    try {
      await api.updateSlotsSettings({ active_list_id: null });
      const res = await api.distributeLeadsToSlots({ rebalanceAll: false, replaceExisting: true });
      setFeedback(`✓ Switched back to All Active Leads (${res.assignedCount} newly assigned)`);
      await fetchStatus();
    } catch (err: any) {
      setFeedback(`❌ Error clearing list scope: ${err?.message}`);
    } finally {
      setIsDistributing(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleDistributeLeads = async (rebalanceAll: boolean = false) => {
    setIsDistributing(true);
    setFeedback(null);
    try {
      const res = await api.distributeLeadsToSlots({
        rebalanceAll,
        listId: activeList?.id,
        replaceExisting: Boolean(activeList?.id),
      });
      if (res.success) {
        setFeedback(`✓ ${rebalanceAll ? 'Rebalanced' : 'Divided'} ${res.assignedCount} leads${activeList ? ` from "${activeList.name}"` : ''} across Slots A-E`);
        await fetchStatus();
      } else {
        setFeedback(`⚠️ ${(res as any).error || 'Failed to divide leads'}`);
      }
    } catch (err: any) {
      setFeedback(`❌ Error dividing leads: ${err?.message}`);
    } finally {
      setIsDistributing(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const parsedCycle = parseFloat(cycleMinInput);
      const cycle = Number.isFinite(parsedCycle) && parsedCycle >= 0.5 ? parsedCycle : 10;
      const parsedOffset = parseFloat(offsetMinInput);
      const offset =
        Number.isFinite(parsedOffset) && parsedOffset >= 0.1
          ? Number(parsedOffset.toFixed(2))
          : Number(Math.max(0.1, cycle / 5).toFixed(2));
      const globalMinGapSec = Math.max(5, Math.floor(offset * 60 * 0.75));

      const payload: Partial<SlotSenderSettings> = {
        slot_cycle_min: cycle,
        slot_offset_min: offset,
        global_min_gap_sec: globalMinGapSec,
        td_endpoint_url: tdUrlInput.trim(),
        td_shared_secret: tdSecretInput.trim(),
        send_window_timezone: sendWindowTzInput.trim() || 'UTC',
      };

      if (is24_7Window) {
        payload.send_window_start_hour = 0;
        payload.send_window_end_hour = 24;
        payload.weekdays_only = false;
      } else {
        payload.send_window_start_hour = parseInt(sendWindowStartInput, 10) || 0;
        payload.send_window_end_hour = parseInt(sendWindowEndInput, 10) || 24;
        payload.weekdays_only = weekdaysOnlyInput;
      }

      const res = await api.updateSlotsSettings(payload);
      if (res.success) {
        setSettings(res.settings);
        setFeedback('✓ Staggered slot & send-window settings updated successfully');
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

  const isSenderActive = settings?.is_active !== false && schedulerState !== 'stopped' && schedulerState !== 'tripped';
  const hasQueuedWork =
    hasPendingLeads ||
    slots.some((s) => (s.waitingCount ?? 0) > 0 || (s.readyToSendCount ?? 0) > 0 || (s.dueFollowupCount ?? 0) > 0);
  const isActivelySending = isSenderActive && hasQueuedWork;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs mb-6 overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`h-8 w-8 rounded-lg ${isActivelySending ? 'bg-indigo-600' : 'bg-slate-600'} text-white flex items-center justify-center shadow-xs`}>
            <Layers size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">5-Slot Staggered Scheduler</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Deterministic Grid (Cycle: {settings?.slot_cycle_min || 10}m, Offset:{' '}
                {(settings?.slot_offset_min ?? 2) < 1
                  ? `${Math.round((settings?.slot_offset_min ?? 0.4) * 60)}s`
                  : `${settings?.slot_offset_min ?? 2}m`}
                )
              </span>

              {/* Quick 2m / 3m / 5m / 10m Interval Switcher for Testing */}
              <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 shadow-2xs">
                <span className="text-[9px] font-bold text-slate-400 pl-1">Pace:</span>
                {[2, 3, 5, 10].map((m) => {
                  const isCurrent = Math.abs((settings?.slot_cycle_min ?? 10) - m) < 0.05;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleQuickCyclePreset(m)}
                      disabled={updatingPresetMin !== null}
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                      }`}
                      title={`Switch 5-slot cycle to ${m} minutes (${m === 2 ? '24s' : m === 3 ? '36s' : m === 5 ? '1m' : '2m'} per slot)`}
                    >
                      {updatingPresetMin === m ? '...' : `${m}m`}
                    </button>
                  );
                })}
              </div>

              {activeList && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                  <span>List: {activeList.name}</span>
                  <button
                    type="button"
                    onClick={handleClearListScope}
                    className="ml-0.5 text-violet-500 hover:text-violet-900 font-black cursor-pointer"
                    title="Clear list filter and show all active CRM leads"
                  >
                    ×
                  </button>
                </span>
              )}

              {/* Active / Standby / Stopped Indicator */}
              {!isSenderActive ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="5-slot sending is stopped. Automated emails and audits are halted.">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  ⏸️ STOPPED
                </span>
              ) : isActivelySending ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Leads are queued and automated 5-slot sending is active">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active · Sending Leads
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300" title="No leads currently queued to send. Scheduler stands by until leads are added.">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                  Standby (No Leads Queued)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {!isSenderActive
                ? 'Scheduler stopped by user. Click Start Sending or Divide Leads when ready.'
                : isActivelySending
                ? 'Zero send conflicts. Staggered outreach active across queued leads.'
                : 'Queue empty — standing by cleanly with zero idle dispatches unless leads need sending.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {feedback && (
            <span className="text-xs font-medium px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 animate-in fade-in">
              {feedback}
            </span>
          )}

          {/* Divide Leads Button */}
          <button
            onClick={() => handleDistributeLeads(false)}
            disabled={isDistributing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Automatically split active leads across the 5 slots round-robin"
          >
            <Split size={13} className={isDistributing ? 'animate-spin text-emerald-600' : 'text-emerald-600'} />
            <span>{isDistributing ? 'Dividing...' : '⚡ Divide Leads to 5 Slots'}</span>
          </button>

          {/* Stop / Start Scheduler Button */}
          {isSenderActive ? (
            <button
              onClick={handleTogglePause}
              disabled={isPausing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Stop / Pause 5-slot sending across all slots."
            >
              <Pause size={13} className={isPausing ? 'animate-spin text-amber-700' : 'text-amber-700'} />
              <span>{isPausing ? 'Stopping...' : '⏸️ Stop Scheduler'}</span>
            </button>
          ) : (
            <button
              onClick={handleTogglePause}
              disabled={isPausing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Enable scheduler so it activates automatically whenever leads need sending."
            >
              <Play size={13} className={isPausing ? 'animate-spin text-emerald-700' : 'text-emerald-700 fill-emerald-700'} />
              <span>{isPausing ? 'Starting...' : '▶️ Start Scheduler'}</span>
            </button>
          )}

          {/* Terminate Schedule Button */}
          <button
            onClick={() => {
              setTerminatingSlotId('all');
              setShowTerminateModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer shadow-2xs"
            title="Terminate email schedule (clears active slot queue, cancels pending dispatches, keeps CRM leads intact)"
          >
            <Square size={12} className="text-rose-600 fill-rose-600" />
            <span>🛑 Terminate Schedule</span>
          </button>

          {/* Manual Trigger Tick Button */}
          <button
            onClick={() => handleTriggerTick(true)}
            disabled={isTickRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Fire a manual scheduler tick (forces send if active slot has due leads)"
          >
            <Play size={13} className={isTickRunning ? 'animate-spin' : ''} />
            <span>Trigger Tick</span>
          </button>

          {/* Settings Drawer Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
          >
            <SettingsIcon size={13} />
            <span>Settings</span>
            {showSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* Refresh Button */}
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
        <form onSubmit={handleSaveSettings} className="p-4 bg-slate-50/80 border-b border-slate-200 text-xs space-y-3.5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Slot Cycle Time (Min)</label>
              <input
                type="number"
                min="0.5"
                max="60"
                step="0.5"
                value={cycleMinInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCycleMinInput(val);
                  const num = parseFloat(val);
                  if (Number.isFinite(num) && num >= 0.5) {
                    setOffsetMinInput(String(Number(Math.max(0.1, num / 5).toFixed(2))));
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-1 mt-1">
                {[2, 3, 5, 10].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setCycleMinInput(String(m));
                      setOffsetMinInput(String(Number((m / 5).toFixed(2))));
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                      Math.abs(parseFloat(cycleMinInput) - m) < 0.05
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
                <span className="text-[10px] text-slate-400 ml-1">Quick presets</span>
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Slot Stagger Offset (Min)</label>
              <input
                type="number"
                min="0.1"
                max="30"
                step="0.1"
                value={offsetMinInput}
                onChange={(e) => setOffsetMinInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500">
                Delay between slots ({parseFloat(offsetMinInput) < 1 ? `${Math.round((parseFloat(offsetMinInput) || 0.4) * 60)}s` : `${offsetMinInput}m`})
              </span>
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

          {/* Send Window Timezone & 24/7 Controls */}
          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={is24_7Window}
                  onChange={(e) => setIs24_7Window(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                />
                <span className="font-bold text-slate-900 text-xs">
                  24/7 Send Window (Continuous Automated Outreach - All Hours & Weekends)
                </span>
              </label>
              <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {is24_7Window ? '✓ Configured for 24/7 Sending' : 'Custom Hours Mode'}
              </span>
            </div>

            {!is24_7Window && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-slate-600 text-[11px] font-medium mb-1">Start Hour (0-23)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={sendWindowStartInput}
                    onChange={(e) => setSendWindowStartInput(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-[11px] font-medium mb-1">End Hour (1-24)</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={sendWindowEndInput}
                    onChange={(e) => setSendWindowEndInput(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-[11px] font-medium mb-1">Timezone</label>
                  <input
                    type="text"
                    value={sendWindowTzInput}
                    onChange={(e) => setSendWindowTzInput(e.target.value)}
                    placeholder="UTC"
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={weekdaysOnlyInput}
                      onChange={(e) => setWeekdaysOnlyInput(e.target.checked)}
                      className="rounded text-indigo-600 h-3.5 w-3.5"
                    />
                    <span className="text-[11px] text-slate-700">Weekdays Only (Mon-Fri)</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleTestTdConnection}
              disabled={isTestingTd}
              className="px-3 py-1 rounded bg-amber-50 border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
            >
              {isTestingTd ? 'Testing TD...' : 'Test TD Connection'}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="px-3 py-1 rounded bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
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
          const isActive = isActivelySending && activeSlotNow === s.slotId;
          const countdown = isActivelySending ? formatCountdown(s.nextSendTime) : null;

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

                {!isSenderActive ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                    Stopped
                  </span>
                ) : !isActivelySending ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500">
                    Idle
                  </span>
                ) : isActive ? (
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
              <div className="space-y-1.5 text-xs bg-white/60 p-2 rounded-lg border border-slate-200/60 mb-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1 font-medium">
                    <Send size={11} className="text-blue-500" /> Sent:
                  </span>
                  <span className="font-bold text-blue-700">{s.sentCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1 font-medium">
                    <FileJson size={11} className="text-purple-500" /> Received JSON:
                  </span>
                  <span className="font-bold text-purple-700">{s.receivedJsonCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1 font-medium" title="Waiting leads in queue. When emails send successfully, this number decreases!">
                    <Clock size={11} className="text-amber-500" /> Waiting:
                  </span>
                  <span className="font-bold text-amber-700">{s.waitingCount ?? s.queuedCount}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                  <span className="text-slate-500 flex items-center gap-1">
                    <CheckCircle size={11} className="text-emerald-500" /> Ready to Send:
                  </span>
                  <span className="font-bold text-emerald-700">{s.readyToSendCount}</span>
                </div>
              </div>

              {/* Toggle Live Pipeline Drawer */}
              <button
                type="button"
                onClick={() => setExpandedSlot(expandedSlot === s.slotId ? null : s.slotId)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              >
                <span>Pipeline ({s.leads?.length ?? 0} leads)</span>
                {expandedSlot === s.slotId ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {/* Next turn timestamp */}
              <div className="mt-2.5 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Next turn:</span>
                <span className="font-mono font-medium text-slate-600">
                  {!isSenderActive
                    ? 'Stopped'
                    : !isActivelySending
                    ? 'Standby'
                    : new Date(s.nextSendTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Slot Detail Drawer */}
      {expandedSlot && (
        <div className="px-4 pb-4 animate-in fade-in">
          {(() => {
            const slot = slots.find((sl) => sl.slotId === expandedSlot);
            if (!slot) return null;
            const leads = slot.leads || [];

            return (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">
                      Slot {slot.slotId} Live Pipeline Tracking
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                      {leads.length} Active Leads
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">
                      4 Milestones: Website Sent ➔ Received JSON ➔ Created PDF ➔ Drafted & Sent
                    </span>
                    {leads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTerminatingSlotId(slot.slotId);
                          setShowTerminateModal(true);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer shadow-2xs"
                        title={`Clear queue and terminate sending schedule for Slot ${slot.slotId}`}
                      >
                        <Square size={10} className="text-rose-600 fill-rose-600" />
                        <span>Terminate Slot {slot.slotId} Schedule</span>
                      </button>
                    )}
                  </div>
                </div>

                {leads.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2 text-center">
                    No active leads assigned to Slot {slot.slotId}. Click "Divide Leads to 5 Slots" above to populate.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <div
                        key={lead.leadId}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs"
                      >
                        <div className="min-w-[180px]">
                          <p className="font-bold text-slate-900 truncate">{lead.businessName}</p>
                          <p className="text-[10px] text-slate-500 truncate" title={lead.website}>
                            {lead.website || 'No website'}
                          </p>
                          {lead.matchedService && (
                            <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[200px]">
                              {lead.matchedService}
                            </span>
                          )}
                        </div>

                        {/* 4 Pipeline Milestones */}
                        <div className="flex items-center gap-2 text-[10px]">
                          {/* 1. Website Sent to TD */}
                          <div
                            className={`flex items-center gap-1 px-2 py-1 rounded border font-semibold ${
                              lead.websiteSentToTd
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                            title={lead.websiteSentToTd ? 'Website sent to Technical Dashboard' : 'Pending TD submission'}
                          >
                            <Globe size={11} />
                            <span>1. Sent to TD</span>
                            {lead.websiteSentToTd && <CheckCircle2 size={11} className="text-emerald-600" />}
                          </div>

                          {/* 2. Received JSON */}
                          <div
                            className={`flex items-center gap-1 px-2 py-1 rounded border font-semibold ${
                              lead.receivedJson
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                            title={lead.receivedJson ? 'Audit JSON received & parsed' : 'Awaiting audit JSON'}
                          >
                            <FileJson size={11} />
                            <span>2. Received JSON</span>
                            {lead.receivedJson && <CheckCircle2 size={11} className="text-purple-600" />}
                          </div>

                          {/* 3. Created PDF */}
                          <div
                            className={`flex items-center gap-1 px-2 py-1 rounded border font-semibold ${
                              lead.createdPdf
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                            title={lead.createdPdf ? 'Technical PDF report generated' : 'Pending PDF memo creation'}
                          >
                            <FileText size={11} />
                            <span>3. Created PDF</span>
                            {lead.createdPdf && <CheckCircle2 size={11} className="text-blue-600" />}
                          </div>

                          {/* 4. Drafted & Sent */}
                          <div
                            className={`flex items-center gap-1 px-2 py-1 rounded border font-semibold ${
                              lead.emailDraftedAndSent
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                            title={lead.emailDraftedAndSent ? 'Email drafted & sent' : 'Ready / in queue to send'}
                          >
                            <Send size={11} />
                            <span>4. Drafted & Sent</span>
                            {lead.emailDraftedAndSent && <CheckCircle2 size={11} className="text-emerald-600" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Terminate Schedule Confirmation Modal */}
      {showTerminateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {terminatingSlotId === 'all'
                    ? 'Terminate Outreach Schedule'
                    : `Terminate Slot ${terminatingSlotId} Schedule`}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  This will immediately halt automated email sending and unassign scheduled leads from the active slot queue.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                <CheckCircle2 size={13} className="text-amber-600 shrink-0" />
                Leads and audit reports remain safe in CRM
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                No contacts, email addresses, or audit PDFs will be deleted. Only the automated sending queue schedule is cleared. You can re-divide and reschedule them at any time.
              </p>
            </div>

            {/* Target Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Schedule Target:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setTerminatingSlotId('all')}
                  className={`px-3 py-2 rounded-lg border text-left font-medium transition-all cursor-pointer ${
                    terminatingSlotId === 'all'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-bold block">All 5 Slots (A–E)</span>
                  <span className="text-[10px] text-slate-500">Terminate entire schedule & pause</span>
                </button>
                {(['A', 'B', 'C', 'D', 'E'] as SlotId[]).map((sId) => (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setTerminatingSlotId(sId)}
                    className={`px-3 py-2 rounded-lg border text-left font-medium transition-all cursor-pointer ${
                      terminatingSlotId === sId
                        ? 'border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-bold block">Slot {sId} Only</span>
                    <span className="text-[10px] text-slate-500">Unassign Slot {sId} queue</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTerminateModal(false)}
                disabled={isTerminating}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTerminateSchedule}
                disabled={isTerminating}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Square size={13} className={isTerminating ? 'animate-spin' : 'fill-white'} />
                <span>
                  {isTerminating
                    ? 'Terminating...'
                    : terminatingSlotId === 'all'
                    ? 'Terminate Entire Schedule'
                    : `Terminate Slot ${terminatingSlotId}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
