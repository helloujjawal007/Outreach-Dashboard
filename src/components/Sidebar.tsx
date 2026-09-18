import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Upload,
  MessageSquarePlus,
  Users,
  Activity,
  Zap,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  UserCheck,
  MessageSquare,
  Bot,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import type { CrmSubFilter } from '@/types';

export type PageId = 'import' | 'builder' | 'crm' | 'health' | 'copilot';

interface SidebarProps {
  current: PageId;
  activeSubFilter?: CrmSubFilter;
  onNavigate: (page: PageId, subFilter?: CrmSubFilter) => void;
  onOpenMessages?: () => void;
  onOpenScheduleModal?: () => void;
  counts: {
    leads: number;
    addedLeads: number;
    notAddedLeads: number;
    clients: number;
    manualReview: number;
    queue: number;
    unreadMessages: number;
  };
}

export function Sidebar({
  current,
  activeSubFilter = 'all',
  onNavigate,
  onOpenMessages,
  onOpenScheduleModal,
  counts,
}: SidebarProps) {
  const [crmExpanded, setCrmExpanded] = useState(true);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-200">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <Zap size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-sm font-bold text-ink-900 leading-tight">Online Digital Solution</h1>
          <p className="text-xs text-brand-600 font-semibold leading-tight">Omni-Channel Engine</p>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {/* 1. Lead Import */}
        <button
          onClick={() => onNavigate('import')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'import'
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
        >
          <Upload
            size={18}
            className={current === 'import' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
          />
          <span className="flex-1 text-left">Lead Import</span>
        </button>

        {/* 2. Campaign Builder */}
        <button
          onClick={() => onNavigate('builder')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'builder'
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
        >
          <MessageSquarePlus
            size={18}
            className={current === 'builder' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
          />
          <span className="flex-1 text-left">Campaign Builder</span>
        </button>

        {/* 3. Auto-Shoot & Schedule List (Left Sidebar 1-Click Action) */}
        <button
          onClick={() => {
            if (onOpenScheduleModal) {
              onOpenScheduleModal();
            } else {
              onNavigate('builder');
            }
          }}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-all bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-indigo-500/10 border border-amber-200/80 text-amber-900 hover:from-amber-500/20 hover:to-indigo-500/20 shadow-2xs"
          title="Auto-Shoot & Schedule multi-channel outreach list"
        >
          <Zap size={18} className="text-amber-600 fill-amber-500" />
          <span className="flex-1 text-left">Auto-Shoot &amp; Schedule</span>
          <span className="rounded-md bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900 shadow-2xs">
            AI
          </span>
        </button>

        {/* 4. AI Growth Copilot (Chatbox & Suggestions - Directly Below Auto-Shoot) */}
        <button
          onClick={() => onNavigate('copilot')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
            current === 'copilot'
              ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm'
              : 'bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-brand-50/50 border border-indigo-200/80 text-indigo-950 hover:border-indigo-300 hover:shadow-2xs'
          }`}
          title="AI Command Center & Live Business Growth Engine"
        >
          <div className={`flex h-6 w-6 items-center justify-center rounded-md ${
            current === 'copilot' ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
          }`}>
            <Bot size={15} />
          </div>
          <span className="flex-1 text-left">AI Growth Copilot</span>
          <span className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
            current === 'copilot' ? 'bg-white/20 text-white' : 'bg-indigo-200/90 text-indigo-950'
          }`}>
            <Sparkles size={10} className="text-amber-500 fill-amber-500" />
            AI
          </span>
        </button>

        {/* 4. Leads & Clients (With Subitems) */}
        <div className="pt-1">
          <div
            className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              current === 'crm' && activeSubFilter === 'all'
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
            }`}
            onClick={() => {
              onNavigate('crm', 'all');
              setCrmExpanded(true);
            }}
          >
            <div className="flex items-center gap-3">
              <Users
                size={18}
                className={current === 'crm' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
              />
              <span className="text-left font-semibold">Leads &amp; Clients</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-ink-300">
                {counts.leads + counts.clients}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCrmExpanded(!crmExpanded);
                }}
                className="p-0.5 text-ink-400 hover:text-ink-600"
              >
                {crmExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>
          </div>

          {/* Subitems: Added Leads, Not Added Leads, Clients */}
          {crmExpanded && (
            <div className="ml-5 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-3">
              {/* Added Leads */}
              <button
                onClick={() => onNavigate('crm', 'lead_added')}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'lead_added'
                    ? 'bg-emerald-50 text-emerald-800 font-bold'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>Added Leads</span>
                </div>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  {counts.addedLeads}
                </span>
              </button>

              {/* Not Added Leads */}
              <button
                onClick={() => onNavigate('crm', 'lead_not_added')}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'lead_not_added'
                    ? 'bg-amber-50 text-amber-800 font-bold'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-amber-600" />
                  <span>Not Added</span>
                </div>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  {counts.notAddedLeads}
                </span>
              </button>

              {/* Clients */}
              <button
                onClick={() => onNavigate('crm', 'client')}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'client'
                    ? 'bg-brand-50 text-brand-800 font-bold'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={13} className="text-brand-600" />
                  <span>Clients</span>
                </div>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
                  {counts.clients}
                </span>
              </button>

              {/* Manual Checking (Bounces & Anonymous) */}
              <button
                onClick={() => onNavigate('crm', 'manual_review')}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'manual_review'
                    ? 'bg-rose-50 text-rose-800 font-bold'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={13} className={counts.manualReview > 0 ? 'text-rose-600' : 'text-slate-400'} />
                  <span>Manual Checking</span>
                </div>
                {counts.manualReview > 0 ? (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700 animate-pulse">
                    {counts.manualReview}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
                    0
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 4. Messages / Inbox Center (Accessible from anywhere!) */}
        <button
          onClick={() => {
            if (onOpenMessages) {
              onOpenMessages();
            } else {
              onNavigate('crm', 'inbound');
            }
          }}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-ink-500 hover:bg-slate-50 hover:text-ink-700`}
        >
          <MessageSquare
            size={18}
            className="text-ink-300 group-hover:text-ink-500"
          />
          <span className="flex-1 text-left">Messages &amp; Inbox</span>
          {counts.unreadMessages > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white shadow-xs animate-pulse">
              {counts.unreadMessages}
            </span>
          ) : (
            <span className="text-xs text-ink-300 font-medium">0</span>
          )}
        </button>

        {/* 5. Sending Health */}
        <button
          onClick={() => onNavigate('health')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'health'
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
        >
          <Activity
            size={18}
            className={current === 'health' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
          />
          <span className="flex-1 text-left">Sending Health</span>
          {counts.queue > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">
              {counts.queue}
            </span>
          )}
        </button>
      </nav>

      {/* User Footer */}
      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-xs font-bold text-white shadow-xs">
            ODS
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-700 truncate">Online Digital Solution</p>
            <p className="text-xs text-ink-500 truncate">Enterprise Growth Platform</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-ink-900 tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
