import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  TrendingUp,
  Users,
  Activity,
  Bot,
  Compass,
  FileSpreadsheet,
  ShieldAlert,
  Calendar,
  Zap,
  Plus,
  RefreshCw,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import type { PageId } from './Sidebar';
import { api } from '@/services/api';
import type { Deal, Lead } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onOpenSuppression?: () => void;
  onOpenTasks?: () => void;
  onOpenNewDeal?: () => void;
  onOpenAutopilot?: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: any;
  category: 'Navigation' | 'Actions' | 'Deals' | 'Leads';
  action: () => void;
  badge?: string;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onOpenSuppression,
  onOpenTasks,
  onOpenNewDeal,
  onOpenAutopilot,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dealResults, setDealResults] = useState<Deal[]>([]);
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Live search for deals and leads when user types >= 2 characters
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      setDealResults([]);
      setLeadResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const [dealsRes, allLeads] = await Promise.all([
          api.getDeals().catch(() => ({ deals: [] })),
          api.getLeads().catch(() => [] as Lead[]),
        ]);

        const filteredDeals = (dealsRes.deals || []).filter((d) =>
          d.title.toLowerCase().includes(query.toLowerCase()) ||
          (d.contact_name && d.contact_name.toLowerCase().includes(query.toLowerCase())) ||
          (d.business_name && d.business_name.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, 4);

        const filteredLeads = (allLeads || []).filter((l) =>
          l.businessName.toLowerCase().includes(query.toLowerCase()) ||
          (l.email && l.email.toLowerCase().includes(query.toLowerCase())) ||
          (l.primaryContactName && l.primaryContactName.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, 4);

        setDealResults(filteredDeals);
        setLeadResults(filteredLeads);
      } catch (err) {
        console.warn('CommandPalette search error:', err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Base navigation and action items
  const baseItems: CommandItem[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-pipeline',
      title: 'Deals & Pipeline',
      subtitle: 'View active sales pipeline & Kanban board',
      icon: TrendingUp,
      category: 'Navigation',
      action: () => {
        onNavigate('pipeline');
        onClose();
      },
    },
    {
      id: 'nav-crm',
      title: 'CRM Contacts & Leads',
      subtitle: 'Manage all scraped and imported outreach leads',
      icon: Users,
      category: 'Navigation',
      action: () => {
        onNavigate('crm');
        onClose();
      },
    },
    {
      id: 'nav-health',
      title: 'Sending Health & Mailboxes',
      subtitle: 'Inspect connected SMTP inboxes and rotation limits',
      icon: Activity,
      category: 'Navigation',
      action: () => {
        onNavigate('health');
        onClose();
      },
    },
    {
      id: 'nav-copilot',
      title: 'AI Command Copilot',
      subtitle: 'Execute natural language CRM actions & queries',
      icon: Bot,
      category: 'Navigation',
    action: () => {
        onNavigate('copilot');
        onClose();
      },
    },
    {
      id: 'nav-scraper',
      title: 'Google Maps Lead Scraper',
      subtitle: 'Extract verified local clinics and businesses',
      icon: Compass,
      category: 'Navigation',
      action: () => {
        onNavigate('scraper');
        onClose();
      },
    },
    {
      id: 'nav-import',
      title: 'CSV Import & Batches',
      subtitle: 'Upload cold contact lists and enrichment data',
      icon: FileSpreadsheet,
      category: 'Navigation',
      action: () => {
        onNavigate('import');
        onClose();
      },
    },
    // Quick Actions
    {
      id: 'act-new-deal',
      title: 'Create New Deal',
      subtitle: 'Add an opportunity to the pipeline',
      icon: Plus,
      category: 'Actions',
      badge: 'Action',
      action: () => {
        onClose();
        if (onOpenNewDeal) onOpenNewDeal();
        else onNavigate('pipeline');
      },
    },
    {
      id: 'act-today-tasks',
      title: "Open Today's Tasks",
      subtitle: 'View calls, emails, and follow-ups due today',
      icon: Calendar,
      category: 'Actions',
      badge: 'Today',
      action: () => {
        onClose();
        if (onOpenTasks) onOpenTasks();
        else onNavigate('pipeline');
      },
    },
    {
      id: 'act-suppression',
      title: 'Global Suppression List',
      subtitle: 'Manage unsubscribes, hard bounces, and blacklists',
      icon: ShieldAlert,
      category: 'Actions',
      badge: 'Email Engine',
      action: () => {
        onClose();
        if (onOpenSuppression) onOpenSuppression();
      },
    },
    {
      id: 'act-autopilot',
      title: 'Autopilot Drip Engine',
      subtitle: 'Configure daily limits, pacing jitter, and working hours',
      icon: Zap,
      category: 'Actions',
      action: () => {
        onClose();
        if (onOpenAutopilot) onOpenAutopilot();
      },
    },
    {
      id: 'act-sync-imap',
      title: 'Sync Inbound Replies',
      subtitle: 'Check mailboxes for new prospect responses',
      icon: RefreshCw,
      category: 'Actions',
      action: async () => {
        onClose();
        try {
          await api.syncEmailReplies();
          alert('Inbound email sync completed.');
        } catch {
          alert('Inbound sync triggered.');
        }
      },
    },
  ], [onNavigate, onClose, onOpenNewDeal, onOpenTasks, onOpenSuppression, onOpenAutopilot]);

  // Dynamic deal and lead items from search
  const dealItems: CommandItem[] = useMemo(
    () =>
      dealResults.map((d) => ({
        id: `deal-${d.id}`,
        title: d.title,
        subtitle: `${d.contact_name ? d.contact_name + ' • ' : ''}$${Number(d.value).toLocaleString()} (${d.stage})`,
        icon: TrendingUp,
        category: 'Deals',
        badge: `$${Number(d.value).toLocaleString()}`,
        action: () => {
          onNavigate('pipeline');
          onClose();
        },
      })),
    [dealResults, onNavigate, onClose]
  );

  const leadItems: CommandItem[] = useMemo(
    () =>
      leadResults.map((l) => ({
        id: `lead-${l.id}`,
        title: l.businessName,
        subtitle: `${l.email || l.phone || 'No contact'} • ${l.category || 'Lead'} (${l.outreachStage || 'Initial'})`,
        icon: Users,
        category: 'Leads',
        badge: l.outreachStage || 'Initial',
        action: () => {
          onNavigate('crm');
          onClose();
        },
      })),
    [leadResults, onNavigate, onClose]
  );

  // Filter items based on query
  const filteredItems = useMemo(
    () => [
      ...dealItems,
      ...leadItems,
      ...baseItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase())) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      ),
    ],
    [dealItems, leadItems, baseItems, query]
  );

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Palette Modal */}
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[520px] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/40">
          <Search className="w-5 h-5 text-indigo-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search leads, deals, tasks..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded">
              ESC
            </kbd>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Sparkles className="w-6 h-6 mx-auto mb-2 text-slate-600" />
              <p className="text-xs">No matching commands or contacts found</p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      {item.category}
                    </span>
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-slate-600 opacity-0'
                      }`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Helper */}
        <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 font-mono text-[9px] bg-slate-800 rounded">↑</kbd>
              <kbd className="px-1 py-0.5 font-mono text-[9px] bg-slate-800 rounded">↓</kbd> to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono text-[9px] bg-slate-800 rounded">↵</kbd> to select
            </span>
          </div>
          <span>Cloud Consultancy Quick Search</span>
        </div>
      </div>
    </div>
  );
}
