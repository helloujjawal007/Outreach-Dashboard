import React, { useState } from 'react';
import {
  Zap,
  Activity,
  CheckCircle2,
  X,
  Play,
  Pause,
  RefreshCw,
  Search,
  Sparkles,
  ShieldCheck,
  Mail,
  Sliders,
  AlertCircle,
  TrendingUp,
  Clock,
} from 'lucide-react';
import type { Store } from '@/store';

interface AutopilotControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store;
}

export const AutopilotControlModal: React.FC<AutopilotControlModalProps> = ({
  isOpen,
  onClose,
  store,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [isTriggering, setIsTriggering] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Settings form state
  const status = store.autopilotStatus;
  const dripEngine = status?.dripEngine;
  const inboundAgent = status?.inboundAgent;

  const [f1Days, setF1Days] = useState(2.5);
  const [f2Days, setF2Days] = useState(5.5);
  const [f3Days, setF3Days] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(dripEngine?.dailyLimit || 200);
  const [autoConvert, setAutoConvert] = useState(inboundAgent?.autoConvertHotLeads ?? true);
  const [autoDraft, setAutoDraft] = useState(inboundAgent?.autoDraftReplies ?? true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  if (!isOpen) return null;

  const isDripActive = dripEngine?.enabled ?? true;
  const sentToday = dripEngine?.sentToday || 0;
  const maxToday = dripEngine?.dailyLimit || 200;
  const capacityPct = Math.min(100, Math.round((sentToday / Math.max(1, maxToday)) * 100));

  const handleToggleDrip = async () => {
    try {
      await store.toggleAutopilot(!isDripActive, 'drip_engine');
      setFeedback({
        type: 'success',
        message: !isDripActive
          ? 'Autonomous 24/7 Drip Engine activated!'
          : 'Drip Engine paused.',
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to toggle drip engine' });
    }
  };

  const handleTriggerCycle = async () => {
    setIsTriggering(true);
    setFeedback(null);
    try {
      const res = await store.triggerAutopilotCycle();
      setFeedback({
        type: 'success',
        message: res.message || `Dispatched ${res.dispatchedCount} due leads in this cycle!`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error triggering cycle' });
    } finally {
      setIsTriggering(false);
    }
  };

  const handleEnrichNow = async () => {
    setIsEnriching(true);
    setFeedback(null);
    try {
      const res = await store.enrichLeadsNow(30);
      setFeedback({
        type: 'success',
        message: `Discovered ${res.result?.emailsDiscoveredCount || 0} corporate emails & ${res.result?.locationsResolvedCount || 0} locations!`,
      });
      setTimeout(() => setFeedback(null), 6000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error running email enrichment' });
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await store.updateAutopilotSettings({
        dripSettings: {
          daily_limit: Number(dailyLimit),
          followup_1_delay_days: Number(f1Days),
          followup_2_delay_days: Number(f2Days),
          followup_3_delay_days: Number(f3Days),
        },
        inboundSettings: {
          auto_convert_hot_leads: autoConvert,
          auto_draft_replies: autoDraft,
        },
      });
      setFeedback({ type: 'success', message: 'Autopilot settings saved successfully!' });
      setTimeout(() => setFeedback(null), 4000);
      setActiveTab('overview');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save settings' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        {/* Top Header Strip with Gradient */}
        <div className="px-6 py-5 border-b bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 shadow-inner">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">Autonomous 24/7 Outreach Autopilot</h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isDripActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-slate-700 text-slate-300 border border-slate-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isDripActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
                  {isDripActive ? 'ACTIVE 24/7' : 'PAUSED'}
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Continuous Drip Sequencing, Inbound AI Intent Classifier & Autonomous Email Discoverer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-indigo-200 transition-colors rounded-lg hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center justify-between px-6 pt-3 border-b bg-slate-50 border-slate-200">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 px-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'border-indigo-600 text-indigo-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              Live Autopilot Dashboard
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2.5 px-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'border-indigo-600 text-indigo-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Automation Parameters
            </button>
          </div>

          <div className="pb-2">
            <button
              onClick={handleToggleDrip}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isDripActive
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              {isDripActive ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pause Autopilot
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Activate 24/7 Autopilot
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center gap-2 border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Daily Throughput Meter */}
              <div className="p-4 border rounded-xl bg-slate-50 border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-semibold text-slate-700">Today's Dispatch Velocity</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900">
                    {sentToday} / {maxToday} messages ({capacityPct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500"
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                  <span>Rotating across {dripEngine?.activeInboxesCount || 1} connected inboxes</span>
                  <span>{dripEngine?.remainingCapacityToday || 0} slots remaining today</span>
                </div>
              </div>

              {/* 3 Pipeline Cards */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* 1. Continuous Drip Engine */}
                <div className="p-4 border rounded-xl border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Continuous Drip</span>
                      <Zap className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="text-2xl font-black text-slate-900 mb-1">
                      {dripEngine?.leadsDueTotal || 0}
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Leads currently due for next outreach step</p>

                    <div className="space-y-1.5 text-xs text-slate-600 border-t pt-2 border-slate-100">
                      <div className="flex justify-between">
                        <span>First Touch Due:</span>
                        <span className="font-semibold text-slate-900">{dripEngine?.initialDueCount || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Follow-up 1 Due (Day 2.5):</span>
                        <span className="font-semibold text-slate-900">{dripEngine?.followup1DueCount || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Follow-up 2 Due (Day 5.5):</span>
                        <span className="font-semibold text-slate-900">{dripEngine?.followup2DueCount || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Follow-up 3 Due (Day 10 Final):</span>
                        <span className="font-semibold text-slate-900">{dripEngine?.followup3DueCount || 0}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleTriggerCycle}
                    disabled={isTriggering || !isDripActive}
                    className="mt-4 w-full py-2 px-3 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTriggering ? 'animate-spin' : ''}`} />
                    {isTriggering ? 'Running Cycle...' : '⚡ Run Drip Cycle Now'}
                  </button>
                </div>

                {/* 2. Autonomous Inbound Agent */}
                <div className="p-4 border rounded-xl border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">Inbound AI Agent</span>
                      <Sparkles className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-black text-slate-900 mb-1">
                      24/7 Live
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Instant sentiment classification & auto-drafting</p>

                    <div className="space-y-1.5 text-xs text-slate-600 border-t pt-2 border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Meeting Intent Classifier</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Auto-Convert Hot Leads</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Contextual AI Auto-Drafts</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-2 bg-purple-50 border border-purple-100 rounded-lg text-center">
                    <span className="text-[11px] font-semibold text-purple-800">
                      Autonomous Handoff to Clients Active
                    </span>
                  </div>
                </div>

                {/* 3. Autonomous Contact Enricher */}
                <div className="p-4 border rounded-xl border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Contact Enricher</span>
                      <Search className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-black text-slate-900 mb-1">
                      Auto-Crawl
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Finds missing corporate emails from websites</p>

                    <div className="space-y-1.5 text-xs text-slate-600 border-t pt-2 border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Deep Website Email Finder</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Area Code Geo-Resolution</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>WhatsApp E.164 Formatting</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleEnrichNow}
                    disabled={isEnriching}
                    className="mt-4 w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <Search className={`w-3.5 h-3.5 ${isEnriching ? 'animate-spin' : ''}`} />
                    {isEnriching ? 'Crawling Sites...' : '🔍 Auto-Discover Emails'}
                  </button>
                </div>
              </div>

              {/* 4-Touch Automated Cadence Timeline */}
              <div className="p-4 border rounded-xl bg-slate-900 text-white shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      4-Touch Human Email Outreach Cadence
                    </span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    200 Cap/Day • Rollover Active
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    <div className="text-[10px] text-indigo-300 font-bold uppercase">Shoot 1</div>
                    <div className="text-sm font-black text-white mt-0.5">Day 0</div>
                    <div className="text-[10px] text-slate-400 mt-1">Verified on import; excess rolls over to next day 9:15 AM</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    <div className="text-[10px] text-amber-300 font-bold uppercase">Shoot 2</div>
                    <div className="text-sm font-black text-white mt-0.5">Day 2.5</div>
                    <div className="text-[10px] text-slate-400 mt-1">Strictly ≥ 48h (60h); gentle business value follow-up</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    <div className="text-[10px] text-cyan-300 font-bold uppercase">Shoot 3</div>
                    <div className="text-sm font-black text-white mt-0.5">Day 5.5</div>
                    <div className="text-[10px] text-slate-400 mt-1">132h mark; concise case study & quick question</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
                    <div className="text-[10px] text-purple-300 font-bold uppercase">Shoot 4</div>
                    <div className="text-sm font-black text-white mt-0.5">Day 10</div>
                    <div className="text-[10px] text-slate-400 mt-1">240h mark; polite permission close (sequence complete)</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                  <span>✨ 100% Human-written conversational copy (no robotic AI phrasing)</span>
                  <span className="text-amber-300 font-medium">Auto-halts immediately if lead replies</span>
                </div>
              </div>

              {/* Safety & Compliance Guarantee */}
              <div className="p-4 border rounded-xl bg-indigo-50/50 border-indigo-100 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-indigo-900">Anti-Spam & Deliverability Protection Guarantee</h4>
                  <p className="text-xs text-indigo-800/80 mt-0.5 leading-relaxed">
                    The 24/7 Autopilot strictly respects warm-up limits, rotates between authenticated inboxes, halts automatically if bounce rates exceed 5%, and injects randomized human pacing jitter (3s - 7s) between dispatches. Opt-outs and unsubscribes are hard-suppressed across all tables immediately.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Settings Tab */
            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="p-4 border rounded-xl bg-slate-50 border-slate-200">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  Drip Sequence Pacing
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Daily Email Cap
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Safe max per day (200 limit)</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shoot 2 Delay (Days)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min={2}
                      max={14}
                      value={f1Days}
                      onChange={(e) => setF1Days(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Min 2 days (2.5d recommended)</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shoot 3 Delay (Days)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min={3}
                      max={21}
                      value={f2Days}
                      onChange={(e) => setF2Days(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">From initial touch (5.5d)</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Shoot 4 Delay (Days)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min={5}
                      max={30}
                      value={f3Days}
                      onChange={(e) => setF3Days(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Final close touch (10d)</p>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-xl bg-slate-50 border-slate-200">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Inbound Intelligence & Lead Conversion
                </h4>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoConvert}
                      onChange={(e) => setAutoConvert(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800">
                        Auto-Convert High-Intent Leads to Paying Clients
                      </span>
                      <p className="text-[11px] text-slate-500">
                        When an inbound reply requests a call or expresses clear positive interest, automatically promote the lead to the Clients table and enroll them in onboarding.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDraft}
                      onChange={(e) => setAutoDraft(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800">
                        Autonomous Contextual AI Reply Drafting
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Automatically generate personalized, consultative replies addressed to the sender's specific questions or calendar requests.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-all"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Parameters'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
