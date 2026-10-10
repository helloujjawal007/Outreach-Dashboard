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
  Globe,
  Trash2,
  Compass,
  MailX,
  Copy,
} from 'lucide-react';
import type { CrmSubFilter } from '@/types';

export type PageId = 'import' | 'scraper' | 'builder' | 'crm' | 'health' | 'copilot';

export interface CountryCountItem {
  country: string;
  count: number;
  flag: string;
}

export interface ChannelCountItem {
  id: string;
  label: string;
  icon: string;
  count: number;
}

interface SidebarProps {
  current: PageId;
  activeSubFilter?: CrmSubFilter;
  activeCountryFilter?: string;
  activeChannelFilter?: string;
  countryCounts?: CountryCountItem[];
  channelCounts?: ChannelCountItem[];
  onNavigate: (page: PageId, subFilter?: CrmSubFilter, country?: string, channel?: string) => void;
  onOpenMessages?: () => void;
  onOpenScheduleModal?: () => void;
  counts: {
    leads: number;
    addedLeads: number;
    notAddedLeads: number;
    clients: number;
    manualReview: number;
    invalidList?: number;
    duplicates?: number;
    trash?: number;
    queue: number;
    unreadMessages: number;
  };
}

export function Sidebar({
  current,
  activeSubFilter = 'all',
  activeCountryFilter = 'all',
  activeChannelFilter = 'all',
  countryCounts = [],
  channelCounts = [],
  onNavigate,
  onOpenMessages,
  onOpenScheduleModal: _onOpenScheduleModal,
  counts,
}: SidebarProps) {
  const [crmExpanded, setCrmExpanded] = useState(false);
  const [countriesExpanded, setCountriesExpanded] = useState(false);
  const [channelsExpanded, setChannelsExpanded] = useState(false);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-200">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <Zap size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-sm font-bold text-ink-900 leading-tight">Outreach Dashboard</h1>
          <p className="text-xs text-brand-600 font-semibold leading-tight">Omni-Channel Engine</p>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {/* 1. AI Copilot (Proactive Suggestions on What To Do) */}
        <button
          onClick={() => onNavigate('copilot')}
          className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'copilot'
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-900 font-bold ring-1 ring-indigo-300 shadow-2xs'
              : 'text-ink-600 hover:bg-slate-50 hover:text-ink-900'
          }`}
          title="AI Copilot: Smart Suggestions & What to Do Next"
        >
          <div className="flex items-center gap-3">
            <Bot
              size={18}
              className={current === 'copilot' ? 'text-indigo-600' : 'text-indigo-400 group-hover:text-indigo-600'}
            />
            <div className="flex items-center gap-1.5">
              <span>AI Copilot</span>
              <Sparkles size={13} className="text-amber-500 animate-spin-slow" />
            </div>
          </div>
          <span className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-2xs uppercase tracking-wider">
            Suggestions
          </span>
        </button>

        {/* 2. Lead Scraper (GMB) */}
        <button
          onClick={() => onNavigate('scraper')}
          className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'scraper'
              ? 'bg-amber-50 text-amber-900 font-semibold ring-1 ring-amber-300/70 shadow-2xs'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
          title="Scrape up to 100 leads from Google Business Profiles"
        >
          <div className="flex items-center gap-3">
            <Compass
              size={18}
              className={current === 'scraper' ? 'text-amber-600 animate-spin-slow' : 'text-ink-300 group-hover:text-amber-600'}
            />
            <span>Lead Scraper</span>
          </div>
          <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.2 text-[10px] font-extrabold text-white shadow-2xs">
            GMB 100
          </span>
        </button>

        {/* 3. Lead Import */}
        <button
          onClick={() => onNavigate('import')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'import'
              ? 'bg-brand-50 text-brand-700 font-semibold'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
          title="Bulk CSV / Text Ingestion & Manual Entry"
        >
          <Upload
            size={18}
            className={current === 'import' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
          />
          <span>Lead Import</span>
        </button>

        {/* 4. Create Campaign */}
        <button
          onClick={() => onNavigate('builder')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'builder'
              ? 'bg-brand-50 text-brand-700 font-semibold'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
          title="Build & Schedule Multi-Channel Campaigns"
        >
          <MessageSquarePlus
            size={18}
            className={current === 'builder' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
          />
          <span>Create Campaign</span>
        </button>

        {/* 4. Leads & Clients (With Subitems) */}
        <div className="pt-1">
          <div
            className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              current === 'crm' && activeSubFilter === 'all' && activeCountryFilter === 'all'
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
            }`}
            onClick={() => {
              onNavigate('crm', 'all', 'all');
              setCrmExpanded(!crmExpanded);
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
                onClick={() => onNavigate('crm', 'lead_added', activeCountryFilter)}
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
                onClick={() => onNavigate('crm', 'lead_not_added', activeCountryFilter)}
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
                onClick={() => onNavigate('crm', 'client', activeCountryFilter)}
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
                onClick={() => onNavigate('crm', 'manual_review', activeCountryFilter)}
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

              {/* Invalid List (Flagged invalid before outreach) */}
              <button
                onClick={() => onNavigate('crm', 'invalid_list', activeCountryFilter)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'invalid_list'
                    ? 'bg-rose-50 text-rose-800 font-bold ring-1 ring-rose-200'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
                title="Leads with invalid, disposable, or unresolvable email addresses flagged before sending"
              >
                <div className="flex items-center gap-2">
                  <MailX size={13} className={counts.invalidList && counts.invalidList > 0 ? 'text-rose-600' : 'text-slate-400'} />
                  <span>Invalid List</span>
                </div>
                {counts.invalidList && counts.invalidList > 0 ? (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700">
                    {counts.invalidList}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
                    0
                  </span>
                )}
              </button>

              {/* Duplicates (Quarantined Duplicate Contacts) */}
              <button
                onClick={() => onNavigate('crm', 'duplicates', activeCountryFilter)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'duplicates'
                    ? 'bg-amber-50 text-amber-800 font-bold ring-1 ring-amber-300'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
                title="Leads detected as duplicates of existing CRM contacts across any list"
              >
                <div className="flex items-center gap-2">
                  <Copy size={13} className={counts.duplicates && counts.duplicates > 0 ? 'text-amber-600' : 'text-slate-400'} />
                  <span>Duplicates</span>
                </div>
                {counts.duplicates && counts.duplicates > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    {counts.duplicates}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
                    0
                  </span>
                )}
              </button>

              {/* Trash Bin (28-day Soft Retention) */}
              <button
                onClick={() => onNavigate('crm', 'trash', 'all')}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  current === 'crm' && activeSubFilter === 'trash'
                    ? 'bg-rose-50 text-rose-800 font-bold'
                    : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                }`}
                title="Deleted leads preserved for 28 days"
              >
                <div className="flex items-center gap-2">
                  <Trash2 size={13} className={counts.trash && counts.trash > 0 ? 'text-rose-600' : 'text-slate-400'} />
                  <span>Trash Bin (28d)</span>
                </div>
                {counts.trash && counts.trash > 0 ? (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700">
                    {counts.trash}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
                    0
                  </span>
                )}
              </button>

              {/* Country Sub-filter list: only countries whose leads are listed */}
              {countryCounts.length > 0 && (
                <div className="pt-2">
                  <div
                    className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-400 cursor-pointer hover:text-ink-600 select-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCountriesExpanded(!countriesExpanded);
                    }}
                    title="Toggle Country Filters"
                  >
                    <div className="flex items-center gap-1.5">
                      <Globe size={11} className="text-brand-500" />
                      <span>By Country</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-ink-500">
                        {countryCounts.length}
                      </span>
                      {countriesExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </div>
                  </div>

                  {countriesExpanded && (
                    <div className="space-y-0.5 mt-0.5">
                      {countryCounts.map(({ country, count, flag }) => {
                        const isCountryActive =
                          current === 'crm' &&
                          activeCountryFilter.toLowerCase() === country.toLowerCase();
                        return (
                          <button
                            key={country}
                            onClick={() =>
                              onNavigate(
                                'crm',
                                activeSubFilter === 'trash' || activeSubFilter === 'manual_review' || activeSubFilter === 'invalid_list'
                                  ? 'all'
                                  : activeSubFilter,
                                isCountryActive ? 'all' : country
                              )
                            }
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-medium transition-all ${
                              isCountryActive
                                ? 'bg-indigo-50 text-indigo-900 font-bold ring-1 ring-indigo-300 shadow-2xs'
                                : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                            }`}
                            title={`Filter leads located in ${country} (${count} leads)`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-xs">{flag}</span>
                              <span className="truncate">{country}</span>
                            </div>
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                isCountryActive
                                  ? 'bg-indigo-200 text-indigo-950'
                                  : 'bg-slate-100 text-ink-600'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Channel Sub-filter list: available outreach channels with lead counts */}
              {channelCounts && channelCounts.length > 0 && (
                <div className="pt-2">
                  <div
                    className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-400 cursor-pointer hover:text-ink-600 select-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChannelsExpanded(!channelsExpanded);
                    }}
                    title="Toggle Channel Filters"
                  >
                    <div className="flex items-center gap-1.5">
                      <Zap size={11} className="text-amber-500" />
                      <span>By Channel</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-ink-500">
                        {channelCounts.length}
                      </span>
                      {channelsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </div>
                  </div>

                  {channelsExpanded && (
                    <div className="space-y-0.5 mt-0.5">
                      {channelCounts.map(({ id, label, icon, count }) => {
                        const isChannelActive =
                          current === 'crm' && activeChannelFilter === id;
                        return (
                          <button
                            key={id}
                            onClick={() =>
                              onNavigate(
                                'crm',
                                activeSubFilter === 'trash' || activeSubFilter === 'manual_review' || activeSubFilter === 'invalid_list'
                                  ? 'all'
                                  : activeSubFilter,
                                activeCountryFilter,
                                isChannelActive ? 'all' : id
                              )
                            }
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-medium transition-all ${
                              isChannelActive
                                ? 'bg-amber-50 text-amber-900 font-bold ring-1 ring-amber-300 shadow-2xs'
                                : 'text-ink-500 hover:bg-slate-50 hover:text-ink-800'
                            }`}
                            title={`Filter leads with ${label} (${count} leads)`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-xs">{icon}</span>
                              <span className="truncate">{label}</span>
                            </div>
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                isChannelActive
                                  ? 'bg-amber-200 text-amber-950'
                                  : 'bg-slate-100 text-ink-600'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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

        {/* 7. Send Tracker & Health (Track sent, received, bounced per day) */}
        <button
          onClick={() => onNavigate('health')}
          className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
            current === 'health'
              ? 'bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-200'
              : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
          }`}
          title="Daily Send Tracker: View how much sent, received and bounced per day"
        >
          <Activity
            size={18}
            className={current === 'health' ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
          />
          <div className="flex-1 text-left min-w-0">
            <span className="block truncate">Send Tracker &amp; Health</span>
            <span className="block text-[10px] text-ink-400 font-normal leading-tight truncate">
              Daily Sent · Recv · Bounce
            </span>
          </div>
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
