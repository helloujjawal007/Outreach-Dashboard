import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';
import type { BusinessSuggestion, CommandExecutionResult, AiCommandHistoryItem } from '@/types';
import {
  Bot,
  Sparkles,
  Send,
  Zap,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Globe,
  MapPin,
  ShoppingCart,
  MessageSquare,
  ArrowRight,
  Terminal,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2,
  History,
  Clock,
  X,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  result?: CommandExecutionResult;
  timestamp: string;
}

export function AiCopilotPage() {
  // Suggestions State (Second Half)
  const [suggestions, setSuggestions] = useState<BusinessSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  // Chat / Command State (First Half)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'ai',
      text: "👋 Welcome to your Executive AI Command Center. I'm your Growth Copilot for Online Digital Solution.\n\nType any natural language command below, or click any of the quick action chips. On the right, I continuously scan your database for the highest-ROI actions to scale your pipeline.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  // Command History State (Last and Older Commands Executed)
  const [history, setHistory] = useState<AiCommandHistoryItem[]>([]);
  const [lastCommand, setLastCommand] = useState<AiCommandHistoryItem | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, executing]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Global Cmd/Ctrl + K shortcut to focus command box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load business suggestions and command history on mount
  useEffect(() => {
    fetchSuggestions();
    fetchHistory();
  }, []);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const data = await api.getAiSuggestions();
      setSuggestions(data);
    } catch (err) {
      console.error('Failed to load AI suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await api.getAiCommandHistory(50);
      setLastCommand(data.lastCommand);
      setHistory(data.history);
    } catch (err) {
      console.error('Failed to load command history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.clearAiCommandHistory();
      setHistory([]);
      setLastCommand(null);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-msg',
        sender: 'ai',
        text: "⚡ Chat cleared. Ready for your next executive instruction or 1-click action.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    inputRef.current?.focus();
  };

  // Dispatch a command (from text input or 1-click suggestion / quick chip)
  const handleExecute = async (command: string, actionType?: string, payload?: Record<string, unknown>) => {
    if ((!command || !command.trim()) && !actionType) return;

    const startTime = performance.now();
    const userText = command.trim() || `Execute ${actionType?.replace(/_/g, ' ')}`;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setExecuting(true);

    try {
      const result = await api.executeAiCommand({
        commandText: userText,
        actionType,
        payload,
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `${result.summary}\n\n⚡ Executed in ${elapsed}s via Omni-Channel Engine`,
        result,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      // Refresh suggestions and persistent command history
      fetchSuggestions();
      fetchHistory();
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `⚠️ Error executing command: ${err.message || 'Server error occurred'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || executing) return;
    handleExecute(inputText);
  };

  const quickChips = [
    {
      label: '🚀 1-Click Master Autopilot',
      command: 'Execute complete 1-click growth autopilot: scan forms, sync GMB & shoot omni-channel outreach',
      actionType: 'run_full_autopilot',
      color: 'border-amber-500 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-200 text-amber-950 hover:from-amber-200 hover:to-orange-200 font-black shadow-sm ring-1 ring-amber-400/60',
    },
    {
      label: '⚡ Shoot to All Leads',
      command: 'Shoot outreach message to all eligible leads in database across all channels',
      actionType: 'shoot_all_outreach',
      color: 'border-amber-400 bg-amber-100/90 text-amber-950 hover:bg-amber-200 font-extrabold shadow-2xs',
    },
    {
      label: '⚡ Shoot Due Follow-ups',
      command: 'Shoot follow-up messages to all overdue leads',
      actionType: 'shoot_due_followups',
      color: 'border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-100',
    },
    {
      label: '🔄 Reset Sequences',
      command: 'Reset completed outreach sequences to Initial stage for re-engagement',
      actionType: 'reset_completed_sequences',
      color: 'border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100',
    },
    {
      label: '🌐 Scan Website Forms',
      command: 'Scan all unscanned business websites for contact forms',
      actionType: 'scan_website_forms',
      color: 'border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100',
    },
    {
      label: '📍 Sync Google Maps (GMB)',
      command: 'Sync live star ratings and reviews from Google Maps',
      actionType: 'sync_gmb_data',
      color: 'border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100',
    },
    {
      label: '🛒 Target Shopify Stores',
      command: 'Identify e-commerce store leads and draft Shopify speed & GEO pitches',
      actionType: 'target_ecom_leads',
      color: 'border-blue-200 bg-blue-50/70 text-blue-900 hover:bg-blue-100',
    },
    {
      label: '📊 Executive Diagnostic',
      command: 'Run executive pipeline diagnostic and capacity status',
      actionType: 'run_lead_diagnostic',
      color: 'border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200',
    },
    {
      label: '💡 What should I do now?',
      command: 'What should I do right now to generate more client leads?',
      actionType: 'run_lead_diagnostic',
      color: 'border-purple-200 bg-purple-50/70 text-purple-900 hover:bg-purple-100',
    },
  ];

  const topUrgentSuggestion = suggestions.find((s) => s.priority === 'high');

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row overflow-hidden bg-slate-50">
      {/* =========================================================================
          FIRST HALF: AI Chat & Natural Language Command Hub (Left Pane)
      ========================================================================= */}
      <div className="flex flex-1 flex-col border-r border-slate-200 bg-white min-w-0">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-500 shadow-md">
              <Bot size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">AI Executive Command Center</h1>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Engine
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Talk to your platform to execute outreach, crawl forms, sync GMB &amp; scale client acquisition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="hidden md:inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 font-mono text-[11px] border border-white/10">
              <span className="text-slate-400">Focus:</span>
              <kbd className="rounded bg-black/40 px-1.5 py-0.5 font-bold text-amber-300">⌘K</kbd>
            </span>
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer shadow-2xs"
              title="View past command execution history"
            >
              <History size={13} />
              <span className="hidden sm:inline">Command History</span>
              {history.length > 0 && (
                <span className="rounded-full bg-amber-400 text-slate-950 px-1.5 py-0.2 text-[10px] font-black">
                  {history.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer shadow-2xs"
              title="Clear conversation history"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear Chat</span>
            </button>
          </div>
        </div>

        {/* High-Impact Urgent Opportunity Banner (Super-Efficient 1-Click Execution) */}
        {topUrgentSuggestion && (
          <div className="border-b border-amber-200/90 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 px-6 py-2.5 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-500 text-white font-black text-xs shadow-2xs">
                ⚡
              </span>
              <div className="text-xs truncate">
                <span className="font-extrabold text-amber-950 mr-1.5">Top Opportunity:</span>
                <span className="text-amber-900 font-semibold">{topUrgentSuggestion.title}</span>
                <span className="ml-2 inline-flex items-center rounded-md bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-950">
                  {topUrgentSuggestion.metric} {topUrgentSuggestion.metricLabel}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                handleExecute(
                  topUrgentSuggestion.title,
                  topUrgentSuggestion.actionType,
                  topUrgentSuggestion.actionPayload
                )
              }
              disabled={executing}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-extrabold text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Zap size={13} className="fill-white" />
              <span>1-Click Execute</span>
            </button>
          </div>
        )}

        {/* Quick Action Chips Bar */}
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
            <Sparkles size={14} className="text-amber-500" />
            <span>1-Click Executive Actions:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleExecute(chip.command, chip.actionType)}
                disabled={executing}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50 ${chip.color}`}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Persistent Last Executed Command Banner */}
        {lastCommand && (
          <div className="border-b border-slate-200 bg-slate-100/90 px-6 py-2 text-xs flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                ✓
              </span>
              <div className="truncate text-slate-700">
                <span className="text-slate-400 font-semibold mr-1">Last Executed:</span>
                <span className="font-bold text-slate-900 mr-1.5">"{lastCommand.commandText}"</span>
                <span className="text-[11px] text-slate-500 font-medium">
                  • {lastCommand.itemsProcessed} processed • {new Date(lastCommand.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleExecute(lastCommand.commandText, lastCommand.actionType)}
                disabled={executing}
                className="flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50 transition-all cursor-pointer shadow-2xs"
                title="Re-run last command"
              >
                <RefreshCw size={11} className={executing ? 'animate-spin' : ''} />
                <span>Re-run</span>
              </button>
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                View History ({history.length})
              </button>
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 px-1">
                {msg.sender === 'user' ? (
                  <span className="font-semibold text-slate-600">You (Executive Command)</span>
                ) : (
                  <div className="flex items-center gap-1 font-semibold text-brand-700">
                    <Sparkles size={12} className="text-brand-600" />
                    <span>AI Copilot Engine</span>
                  </div>
                )}
                <span>• {msg.timestamp}</span>
              </div>

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-br from-brand-600 to-indigo-700 text-white font-medium rounded-tr-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Rich Execution Receipt Card */}
                {msg.result && (
                  <div className="mt-3 border-t border-slate-200/80 pt-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        <span>Action: {msg.result.actionExecuted.replace(/_/g, ' ')}</span>
                      </span>
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
                        Processed: {msg.result.itemsProcessed}
                      </span>
                    </div>

                    {/* Multi-Channel Touch Breakdown Pills */}
                    {msg.result.details && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {typeof (msg.result.details as any).emailsSent === 'number' && (msg.result.details as any).emailsSent > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 shadow-2xs">
                            📧 {(msg.result.details as any).emailsSent} Emails Sent
                          </span>
                        )}
                        {typeof (msg.result.details as any).formsSubmitted === 'number' && (msg.result.details as any).formsSubmitted > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200 shadow-2xs">
                            🌐 {(msg.result.details as any).formsSubmitted} Forms Submitted
                          </span>
                        )}
                        {typeof (msg.result.details as any).whatsappDispatched === 'number' && (msg.result.details as any).whatsappDispatched > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 shadow-2xs">
                            💬 {(msg.result.details as any).whatsappDispatched} WhatsApp Touches
                          </span>
                        )}
                        {typeof (msg.result.details as any).websitesScanned === 'number' && (msg.result.details as any).websitesScanned > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 border border-violet-200 shadow-2xs">
                            🔍 {(msg.result.details as any).websitesScanned} Websites Scanned
                          </span>
                        )}
                        {typeof (msg.result.details as any).gmbSynced === 'number' && (msg.result.details as any).gmbSynced > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 shadow-2xs">
                            📍 {(msg.result.details as any).gmbSynced} GMB Verified
                          </span>
                        )}
                      </div>
                    )}

                    {/* AI Advice Callout */}
                    {msg.result.aiAdvice && msg.result.aiAdvice !== msg.text && (
                      <div className="mt-2 rounded-lg bg-indigo-50/70 border border-indigo-100 p-2.5 text-xs text-indigo-950">
                        <p className="font-semibold text-indigo-900 flex items-center gap-1 mb-1">
                          <Activity size={13} className="text-indigo-600" />
                          Growth Advice:
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.result.aiAdvice}</p>
                      </div>
                    )}

                    {/* Expandable Technical Details */}
                    {msg.result.details && Object.keys(msg.result.details).length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDetailsId(expandedDetailsId === msg.id ? null : msg.id)
                          }
                          className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-800"
                        >
                          <span>
                            {expandedDetailsId === msg.id ? 'Hide Action Payload' : 'View Action Receipt Details'}
                          </span>
                          {expandedDetailsId === msg.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        {expandedDetailsId === msg.id && (
                          <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] font-mono text-emerald-400 border border-slate-800">
                            {JSON.stringify(msg.result.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {executing && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5 text-[11px] text-brand-600 font-semibold mb-1 px-1">
                <Sparkles size={12} className="animate-spin text-brand-500" />
                <span>Executing Platform Action...</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500 shadow-xs">
                <RefreshCw size={16} className="animate-spin text-brand-600" />
                <span>Processing in background (dispatching services, crawling forms, updating DB)...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Command Area */}
        <div className="border-t border-slate-200 bg-white p-4">
          <form onSubmit={handleFormSubmit} className="relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={executing}
              placeholder="Tell your platform what to do (e.g. 'Shoot follow-up 1 to all due leads', 'Scan website forms', 'What should I do?')..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-4 pr-24 py-3 text-sm font-medium text-slate-800 placeholder-slate-400 shadow-inner focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || executing}
              className="absolute right-2 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:from-brand-700 hover:to-indigo-700 disabled:opacity-40 transition-all cursor-pointer"
            >
              {executing ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <>
                  <span>Execute</span>
                  <Send size={13} />
                </>
              )}
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Terminal size={12} />
              Natural Language Intent Engine • Dual-Trigger Email + Form Action
            </span>
            <span>Supports GMB, SEO/GEO, Web Dev &amp; Automations</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECOND HALF: "What You Should Do Now" Live Growth Engine (Right Pane)
      ========================================================================= */}
      <div className="flex w-full lg:w-[460px] xl:w-[500px] flex-col bg-slate-50/90 overflow-y-auto">
        {/* Right Header Bar */}
        <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <TrendingUp size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">What You Should Do Now</h2>
                <p className="text-[11px] text-slate-500">Live AI Opportunity Scanner &amp; Priority Queue</p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer"
              title="Re-scan database for new opportunities"
            >
              <RefreshCw size={13} className={loadingSuggestions ? 'animate-spin text-brand-600' : ''} />
              <span>Re-scan</span>
            </button>
          </div>
        </div>

        {/* Priority Suggestions Feed */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              High-ROI Recommended Actions ({suggestions.length})
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Auto-Ranked by Impact</span>
          </div>

          {loadingSuggestions && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
              <RefreshCw size={24} className="animate-spin text-brand-600" />
              <p className="text-xs">Scanning database across leads, forms, GMB, and inboxes...</p>
            </div>
          )}

          {!loadingSuggestions && suggestions.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <h3 className="text-sm font-bold text-slate-800">Everything is Optimized!</h3>
              <p className="text-xs text-slate-500 mt-1">
                No urgent follow-ups or pending forms found. Ingest new leads or launch a new campaign to expand your pipeline.
              </p>
            </div>
          )}

          {!loadingSuggestions &&
            suggestions.map((item) => {
              const badgeColors = {
                red: 'bg-red-50 text-red-700 border-red-200',
                amber: 'bg-amber-50 text-amber-800 border-amber-200',
                emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
              }[item.badgeVariant] || 'bg-slate-50 text-slate-700 border-slate-200';

              const icon = {
                run_full_autopilot: <Zap size={16} className="text-amber-500 fill-amber-400" />,
                shoot_all_outreach: <Zap size={16} className="text-amber-500 fill-amber-400" />,
                shoot_due_followups: <Zap size={16} className="text-amber-600" />,
                reset_completed_sequences: <RefreshCw size={16} className="text-indigo-600" />,
                scan_website_forms: <Globe size={16} className="text-indigo-600" />,
                sync_gmb_data: <MapPin size={16} className="text-emerald-600" />,
                target_ecom_leads: <ShoppingCart size={16} className="text-blue-600" />,
                view_inbound_replies: <MessageSquare size={16} className="text-red-600" />,
                run_lead_diagnostic: <Activity size={16} className="text-slate-600" />,
              }[item.actionType] || <Sparkles size={16} className="text-brand-600" />;

              return (
                <div
                  key={item.id}
                  className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 group-hover:bg-slate-200 transition-colors">
                        {icon}
                      </div>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeColors}`}>
                        {item.badgeText}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-extrabold text-slate-900">{item.metric}</div>
                      <div className="text-[10px] font-medium text-slate-400">{item.metricLabel}</div>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.description}</p>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleExecute(item.title, item.actionType, item.actionPayload)}
                      disabled={executing}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-brand-600 hover:shadow-xs disabled:opacity-50 transition-all cursor-pointer"
                    >
                      <Zap size={13} className="text-amber-400 fill-amber-400" />
                      <span>{item.actionTitle}</span>
                      <ArrowRight size={12} />
                    </button>

                    <span className="text-[11px] font-semibold text-slate-400">
                      {item.priority.toUpperCase()} PRIORITY
                    </span>
                  </div>
                </div>
              );
            })}

          {/* Business Model Summary Card */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/60 p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 mb-1.5">
              <Layers size={15} className="text-indigo-600" />
              <span>Your Active Agency Service Suite</span>
            </div>
            <p className="text-[11px] text-indigo-900/80 leading-relaxed">
              You are positioned as a full-service growth partner offering:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-slate-700">
              <div className="flex items-center gap-1 bg-white/80 rounded px-2 py-1 border border-indigo-100/80">
                <span className="text-emerald-600">✔</span> GMB Top 3 Maps Ranking
              </div>
              <div className="flex items-center gap-1 bg-white/80 rounded px-2 py-1 border border-indigo-100/80">
                <span className="text-emerald-600">✔</span> Modern Web Development
              </div>
              <div className="flex items-center gap-1 bg-white/80 rounded px-2 py-1 border border-indigo-100/80">
                <span className="text-emerald-600">✔</span> SEO, GEO &amp; AEO (AI Search)
              </div>
              <div className="flex items-center gap-1 bg-white/80 rounded px-2 py-1 border border-indigo-100/80">
                <span className="text-emerald-600">✔</span> Shopify / BigCommerce Speed
              </div>
              <div className="flex items-center gap-1 bg-white/80 rounded px-2 py-1 border border-indigo-100/80 col-span-2">
                <span className="text-emerald-600">✔</span> Workflow Automations &amp; Outbound Engines
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          COMMAND HISTORY & AUDIT LOG MODAL (Last and Older Commands Executed)
      ========================================================================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in">
          <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-500 text-white shadow-md">
                  <History size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    Command Execution History &amp; Audit Log
                    <span className="rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-extrabold">
                      {history.length} Total
                    </span>
                  </h2>
                  <p className="text-xs text-slate-300">
                    Audit log of the last and older commands executed across your platform
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
                    title="Clear command history"
                  >
                    <Trash2 size={12} />
                    <span>Clear Log</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
                  <RefreshCw size={24} className="animate-spin text-indigo-600 mb-2" />
                  <p className="text-xs font-semibold">Loading command history...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                  <History size={36} className="mx-auto text-slate-400 mb-3" />
                  <h3 className="text-sm font-bold text-slate-800">No Commands Recorded Yet</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Execute any instruction in the AI Copilot (e.g. "Shoot to all leads" or "Scan website forms") to see live execution receipts here.
                  </p>
                </div>
              ) : (
                <>
                  {/* SECTION 1: LAST EXECUTED COMMAND */}
                  {lastCommand && (
                    <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-brand-50/50 p-4 shadow-xs">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-wider">
                            ⚡ Last Command Executed
                          </span>
                          <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                            {lastCommand.actionType}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(lastCommand.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <h3 className="text-sm font-extrabold text-slate-900 mt-1">
                        "{lastCommand.commandText}"
                      </h3>
                      <p className="mt-1 text-xs text-slate-700 leading-relaxed font-medium">
                        {lastCommand.summary}
                      </p>

                      <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
                          <span className="flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            Success
                          </span>
                          <span>•</span>
                          <span>Processed: <strong className="text-slate-900">{lastCommand.itemsProcessed} leads</strong></span>
                          <span>•</span>
                          <span>Latency: <strong className="text-slate-900">{lastCommand.executionTimeMs}ms</strong></span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setShowHistoryModal(false);
                            handleExecute(lastCommand.commandText, lastCommand.actionType);
                          }}
                          disabled={executing}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={executing ? 'animate-spin' : ''} />
                          <span>Re-run This Command</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SECTION 2: OLDER COMMANDS EXECUTED */}
                  <div>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Clock size={13} />
                        Older Commands Executed ({history.slice(1).length})
                      </h3>
                      <span className="text-[11px] text-slate-400">Chronological Audit Trail</span>
                    </div>

                    {history.slice(1).length === 0 ? (
                      <p className="text-xs text-slate-400 italic px-1 py-3">
                        Only 1 command has been executed so far. Older commands will appear here automatically.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {history.slice(1).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-all"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900">
                                    "{item.commandText}"
                                  </span>
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                                    {item.actionType}
                                  </span>
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    ✓ {item.itemsProcessed} processed
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                                  {item.summary}
                                </p>
                                <span className="mt-1 block text-[10px] font-medium text-slate-400">
                                  Executed at {new Date(item.createdAt).toLocaleString()} • {item.executionTimeMs}ms
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setShowHistoryModal(false);
                                  handleExecute(item.commandText, item.actionType);
                                }}
                                disabled={executing}
                                className="shrink-0 flex items-center gap-1 rounded-md bg-slate-100 hover:bg-brand-50 hover:text-brand-700 border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition-all cursor-pointer disabled:opacity-50"
                                title="Re-run this command"
                              >
                                <RefreshCw size={11} className={executing ? 'animate-spin' : ''} />
                                <span>Re-run</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between text-xs text-slate-500">
              <span>All platform executions are logged with PostgreSQL timestamps &amp; item receipts.</span>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
