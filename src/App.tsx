import { useState, useMemo, useEffect } from 'react';
import { Sidebar, type PageId } from '@/components/Sidebar';
import { useStore } from '@/store';
import { LeadImportPage } from '@/pages/LeadImportPage';
import { LeadScraperPage } from '@/pages/LeadScraperPage';
import { CampaignBuilderPage } from '@/pages/CampaignBuilderPage';
import { CrmPage } from '@/pages/CrmPage';
import { SendingHealthPage } from '@/pages/SendingHealthPage';
import { AiCopilotPage } from '@/pages/AiCopilotPage';
import { InboundEmailPopup } from '@/components/InboundEmailPopup';
import { InboundRepliesModal } from '@/components/InboundRepliesModal';
import { ScheduleListModal } from '@/components/ScheduleListModal';
import { AutopilotControlModal } from '@/components/AutopilotControlModal';
import { LoginPage } from '@/pages/LoginPage';
import { DealsPipelinePage } from '@/pages/DealsPipelinePage';
import { CommandPalette } from '@/components/CommandPalette';
import { SuppressionListModal } from '@/components/SuppressionListModal';
import { api } from '@/services/api';
import type { CrmSubFilter } from '@/types';
import { getCountryFlag } from '@/utils/countryFlag';
import { MessageSquare, RefreshCw, Zap, AlertTriangle, Search } from 'lucide-react';

const VALID_PAGES: PageId[] = ['crm', 'pipeline', 'builder', 'copilot', 'import', 'scraper', 'health'];

function getInitialPage(): PageId {
  if (typeof window === 'undefined') return 'crm';
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase() as PageId;
  if (VALID_PAGES.includes(hash)) return hash;
  const path = window.location.pathname.replace(/^\//, '').toLowerCase() as PageId;
  if (VALID_PAGES.includes(path)) return path;
  return 'crm';
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [page, setPage] = useState<PageId>(getInitialPage);
  const [crmSubFilter, setCrmSubFilter] = useState<CrmSubFilter>('all');
  const [crmCountryFilter, setCrmCountryFilter] = useState<string>('all');
  const [crmChannelFilter, setCrmChannelFilter] = useState<string>('all');
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isAutopilotModalOpen, setIsAutopilotModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSuppressionModalOpen, setIsSuppressionModalOpen] = useState(false);
  const [autoOpenContact, setAutoOpenContact] = useState<{ id: string; entityType: 'lead' | 'client' } | null>(null);
  const store = useStore();

  useEffect(() => {
    // Check initial authentication state with backend
    api.checkAuth().then((authed) => {
      setIsAuthenticated(authed);
    });

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('ods:unauthorized', handleUnauthorized);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('ods:unauthorized', handleUnauthorized);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
  };

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase() as PageId;
      if (VALID_PAGES.includes(hash)) {
        setPage(hash);
        return;
      }
      const path = window.location.pathname.replace(/^\//, '').toLowerCase() as PageId;
      if (VALID_PAGES.includes(path)) {
        setPage(path);
        return;
      }
      setPage('crm');
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const counts = useMemo(() => {
    const activeLeads = store.leads.filter((l) => !l.deletedAt);
    const duplicateLeads = activeLeads.filter((l) => l.status === 'duplicate');
    const nonDuplicateLeads = activeLeads.filter((l) => l.status !== 'duplicate');
    const leadEntities = nonDuplicateLeads.filter((l) => l.entityType === 'lead');
    const clientEntities = nonDuplicateLeads.filter((l) => l.entityType === 'client');
    const addedLeads = leadEntities.filter((l) => Boolean(l.lists && l.lists.length > 0) && l.status !== 'manual_review');
    const notAddedLeads = leadEntities.filter((l) => (!l.lists || l.lists.length === 0) && l.status !== 'manual_review');
    const manualReviewLeads = leadEntities.filter((l) => l.status === 'manual_review');
    const invalidLeads = leadEntities.filter((l) =>
      l.lists?.some((m) => m.name.toLowerCase() === 'invalid list' || m.name.toLowerCase() === 'invalid leads') ||
      (l.emailVerificationStatus && l.emailVerificationStatus !== 'verified' && l.emailVerificationStatus !== 'unverified')
    );
    const unreadMessages = store.inboundReplies.filter((r) => !r.is_read && !r.is_replied).length;

    return {
      leads: leadEntities.length,
      addedLeads: addedLeads.length,
      notAddedLeads: notAddedLeads.length,
      clients: clientEntities.length,
      manualReview: manualReviewLeads.length,
      invalidList: invalidLeads.length,
      duplicates: duplicateLeads.length,
      trash: store.trashLeads.length,
      queue: store.queue.length,
      unreadMessages,
    };
  }, [store.leads, store.trashLeads, store.queue, store.inboundReplies]);

  // Derive countries dynamically whose leads are listed in the database
  const countryCounts = useMemo(() => {
    const countryMap = new Map<string, number>();
    store.leads.forEach((l) => {
      if (l.deletedAt) return;
      const c =
        (l.country || '').trim() ||
        (l.location && l.location.toLowerCase().includes('not identified')
          ? '(Not identified)'
          : 'Other');
      countryMap.set(c, (countryMap.get(c) || 0) + 1);
    });

    return Array.from(countryMap.entries())
      .filter(([_, count]) => count > 0)
      .map(([country, count]) => ({
        country,
        count,
        flag: getCountryFlag(country),
      }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  }, [store.leads]);

  // Derive channels dynamically whose leads are listed in the database
  const channelCounts = useMemo(() => {
    const active = store.leads.filter((l) => !l.deletedAt);
    const whatsapp = active.filter(
      (l) => (l.whatsapp && l.whatsapp.trim().length > 0) || (l.phone && l.phone.trim().length > 0)
    ).length;
    const whatsappMobile = active.filter((l) => l.whatsappEligible === true).length;
    const websiteForm = active.filter(
      (l) => Boolean(l.website || l.googleProfile?.website)
    ).length;
    const email = active.filter((l) => Boolean(l.email && l.email.includes('@'))).length;
    const instagram = active.filter((l) => Boolean(l.instagram && l.instagram.trim())).length;
    const linkedin = active.filter((l) => Boolean(l.linkedin && l.linkedin.trim())).length;

    return [
      { id: 'whatsapp', label: 'WhatsApp', icon: '💬', count: whatsapp },
      { id: 'whatsapp_mobile', label: 'WhatsApp Mobile', icon: '📱', count: whatsappMobile },
      { id: 'website_form', label: 'Website Form', icon: '🌐', count: websiteForm },
      { id: 'email', label: 'Email', icon: '✉️', count: email },
      { id: 'instagram', label: 'Instagram', icon: '📸', count: instagram },
      { id: 'linkedin', label: 'LinkedIn', icon: '💼', count: linkedin },
    ].filter((c) => c.count > 0);
  }, [store.leads]);

  const handleNavigate = (
    newPage: PageId,
    subFilter?: CrmSubFilter,
    country?: string,
    channel?: string
  ) => {
    setPage(newPage);
    if (window.location.hash !== `#${newPage}`) {
      window.history.pushState(null, '', `#${newPage}`);
    }
    if (subFilter !== undefined) {
      setCrmSubFilter(subFilter);
    }
    if (country !== undefined) {
      setCrmCountryFilter(country);
    }
    if (channel !== undefined) {
      setCrmChannelFilter(channel);
    }
  };

  const handleOpenConversation = (entityId: string, entityType: 'lead' | 'client') => {
    setPage('crm');
    if (window.location.hash !== '#crm') {
      window.history.pushState(null, '', '#crm');
    }
    setAutoOpenContact({ id: entityId, entityType });
    store.dismissNotification();
  };

  const pageTitleMap: Record<PageId, string> = {
    crm:
      crmCountryFilter !== 'all'
        ? `Contacts & Accounts • ${getCountryFlag(crmCountryFilter)} ${crmCountryFilter}`
        : crmChannelFilter !== 'all'
        ? `Contacts & Accounts • Channel: ${crmChannelFilter}`
        : crmSubFilter === 'lead_added'
        ? 'Contacts & Accounts • Added Leads'
        : crmSubFilter === 'lead_not_added'
        ? 'Contacts & Accounts • Not Added (Unassigned)'
        : crmSubFilter === 'client'
        ? 'Contacts & Accounts • Won Retainers & Clients'
        : crmSubFilter === 'manual_review'
        ? 'Contacts & Accounts • Needs Review (Flagged)'
        : crmSubFilter === 'invalid_list'
        ? 'Contacts & Accounts • Invalid List'
        : crmSubFilter === 'inbound'
        ? 'Contacts & Accounts • Inbound Activity'
        : crmSubFilter === 'duplicates'
        ? 'Contacts & Accounts • Duplicates'
        : crmSubFilter === 'trash'
        ? 'Contacts & Accounts • Trash Bin'
        : 'Contacts & Accounts CRM',
    pipeline: 'Deals & Revenue Pipeline • Kanban Board',
    builder: 'Campaign Sequences & Multi-Channel Outreach',
    import: 'Lead & Contact Import',
    scraper: 'Google Business Profile (GMB) Lead Scraper',
    health: 'Infrastructure Deliverability & Health',
    copilot: 'AI Executive Copilot & Strategy Center',
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono tracking-wider">Verifying secure session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={() => {
          setIsAuthenticated(true);
          store.refreshAll();
        }}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        current={page}
        activeSubFilter={crmSubFilter}
        activeCountryFilter={crmCountryFilter}
        activeChannelFilter={crmChannelFilter}
        countryCounts={countryCounts}
        channelCounts={channelCounts}
        onNavigate={handleNavigate}
        onOpenMessages={() => setIsMessagesModalOpen(true)}
        onOpenScheduleModal={() => setIsScheduleModalOpen(true)}
        onOpenSuppression={() => setIsSuppressionModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onLogout={handleLogout}
        counts={counts}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Persistent Top Navigation Bar Accessible from Anywhere */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Cloud Consultancy</span>
            <span className="text-slate-300">/</span>
            <h2 className="text-sm font-bold text-slate-800">{pageTitleMap[page]}</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Search Shortcut Button */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shadow-2xs"
              title="Search leads, deals, or run quick actions (Cmd+K)"
            >
              <Search size={13} className="text-slate-400" />
              <span>Search or jump to...</span>
              <kbd className="px-1.5 py-0.2 text-[10px] font-mono bg-white border border-slate-200 rounded text-slate-400">
                ⌘K
              </kbd>
            </button>
            {/* 24/7 Autopilot Master Button */}
            <button
              onClick={() => setIsAutopilotModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 px-3 py-1.5 text-xs font-bold text-indigo-950 shadow-2xs hover:border-indigo-400 hover:from-indigo-100 hover:to-purple-100 transition-all cursor-pointer"
              title="Manage 24/7 Drip Autopilot, Inbound AI & Contact Enricher"
            >
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${store.autopilotStatus?.dripEngine.enabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${store.autopilotStatus?.dripEngine.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
              </span>
              <Zap size={14} className="text-amber-500 fill-amber-500" />
              <span>Autopilot</span>
              <span className="rounded-full bg-indigo-600/10 text-indigo-700 px-1.5 py-0.5 text-[10px] font-extrabold border border-indigo-300/40">
                {store.autopilotStatus?.dripEngine.enabled ? '24/7 Active' : 'Paused'}
              </span>
            </button>

            {/* Sync Inboxes Trigger */}
            <button
              onClick={() => store.syncEmailReplies()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
              title="Sync connected inboxes for incoming client replies"
            >
              <RefreshCw size={13} className="text-slate-500" />
              <span className="hidden sm:inline">Sync Inboxes</span>
            </button>

            {/* Global Messages & Inbox button with live unread counter */}
            <button
              onClick={() => setIsMessagesModalOpen(true)}
              className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs hover:border-brand-300 hover:bg-brand-50/40 transition-all"
              title="Open Multi-Channel Messages & Inbox from anywhere"
            >
              <div className="relative flex items-center">
                <MessageSquare
                  size={16}
                  className={counts.unreadMessages > 0 ? 'text-brand-600' : 'text-slate-500 group-hover:text-brand-600'}
                />
                {counts.unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                )}
              </div>
              <span>Messages</span>
              {counts.unreadMessages > 0 ? (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-2xs animate-pulse">
                  {counts.unreadMessages} unread
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  0 unread
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Global Connection / Offline Error Banner */}
        {store.error && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 flex items-center justify-between text-xs text-rose-800 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-rose-600 shrink-0" />
              <span>
                <strong>System Notice:</strong> {store.error}
              </span>
            </div>
            <button
              onClick={() => store.refreshAll()}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 rounded-lg font-semibold text-rose-700 hover:bg-rose-100/60 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {page === 'copilot' ? (
            <AiCopilotPage />
          ) : (
            <div className="mx-auto max-w-7xl px-6 py-8">
              {page === 'import' && <LeadImportPage store={store} onNavigate={setPage} />}
              {page === 'scraper' && <LeadScraperPage store={store} onNavigate={setPage} />}
              {page === 'builder' && <CampaignBuilderPage store={store} />}
              {page === 'pipeline' && <DealsPipelinePage />}
              {page === 'crm' && (
                <CrmPage
                  store={store}
                  autoOpenContact={autoOpenContact}
                  onClearAutoOpenContact={() => setAutoOpenContact(null)}
                  subFilter={crmSubFilter}
                  onSubFilterChange={setCrmSubFilter}
                  countryFilter={crmCountryFilter}
                  onCountryFilterChange={setCrmCountryFilter}
                  channelFilter={crmChannelFilter as any}
                  onChannelFilterChange={setCrmChannelFilter as any}
                  onOpenGlobalMessages={() => setIsMessagesModalOpen(true)}
                />
              )}
              {page === 'health' && <SendingHealthPage store={store} />}
            </div>
          )}
        </main>
      </div>

      {/* Global Multi-Channel Messages & Inbox Modal Accessible from ANYWHERE */}
      <InboundRepliesModal
        isOpen={isMessagesModalOpen}
        onClose={() => setIsMessagesModalOpen(false)}
        replies={store.inboundReplies}
        onOpenConversation={handleOpenConversation}
        onOpenProfile={handleOpenConversation}
        onSyncInbox={store.syncEmailReplies}
        onMarkRead={store.markMessageRead}
        onMarkHandled={store.markInboundHandled}
        onDeleteLead={store.deleteLead}
      />

      {/* Global Automated List Outreach & Humanizer Scheduler Modal */}
      <ScheduleListModal
        open={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        store={store}
      />

      {/* Global Inbound Email Reply Alert Popup */}
      <InboundEmailPopup
        notification={store.latestReplyNotification}
        onClose={store.dismissNotification}
        onOpenConversation={handleOpenConversation}
        onDeleteLead={store.deleteLead}
      />

      {/* Autonomous 24/7 Outreach Autopilot Master Modal */}
      <AutopilotControlModal
        isOpen={isAutopilotModalOpen}
        onClose={() => setIsAutopilotModalOpen(false)}
        store={store}
      />

      {/* Global Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onOpenSuppression={() => setIsSuppressionModalOpen(true)}
        onOpenAutopilot={() => setIsAutopilotModalOpen(true)}
      />

      {/* Global Email Suppression List Modal */}
      <SuppressionListModal
        isOpen={isSuppressionModalOpen}
        onClose={() => setIsSuppressionModalOpen(false)}
      />
    </div>
  );
}

export default App;
