import { useState, useMemo } from 'react';
import { Sidebar, type PageId } from '@/components/Sidebar';
import { useStore } from '@/store';
import { LeadImportPage } from '@/pages/LeadImportPage';
import { CampaignBuilderPage } from '@/pages/CampaignBuilderPage';
import { CrmPage } from '@/pages/CrmPage';
import { SendingHealthPage } from '@/pages/SendingHealthPage';
import { AiCopilotPage } from '@/pages/AiCopilotPage';
import { InboundEmailPopup } from '@/components/InboundEmailPopup';
import { InboundRepliesModal } from '@/components/InboundRepliesModal';
import { ScheduleListModal } from '@/components/ScheduleListModal';
import type { CrmSubFilter } from '@/types';
import { getCountryFlag } from '@/pages/CrmPage';
import { MessageSquare, RefreshCw, Layers } from 'lucide-react';

function App() {
  const [page, setPage] = useState<PageId>('import');
  const [crmSubFilter, setCrmSubFilter] = useState<CrmSubFilter>('all');
  const [crmCountryFilter, setCrmCountryFilter] = useState<string>('all');
  const [crmChannelFilter, setCrmChannelFilter] = useState<string>('all');
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [autoOpenContact, setAutoOpenContact] = useState<{ id: string; entityType: 'lead' | 'client' } | null>(null);
  const store = useStore();

  const counts = useMemo(() => {
    const activeLeads = store.leads.filter((l) => !l.deletedAt);
    const leadEntities = activeLeads.filter((l) => l.entityType === 'lead');
    const clientEntities = activeLeads.filter((l) => l.entityType === 'client');
    const addedLeads = leadEntities.filter((l) => Boolean(l.lists && l.lists.length > 0) && l.status !== 'manual_review');
    const notAddedLeads = leadEntities.filter((l) => (!l.lists || l.lists.length === 0) && l.status !== 'manual_review');
    const manualReviewLeads = leadEntities.filter((l) => l.status === 'manual_review');
    const unreadMessages = store.inboundReplies.filter((r) => !r.is_read && !r.is_replied).length;

    return {
      leads: leadEntities.length,
      addedLeads: addedLeads.length,
      notAddedLeads: notAddedLeads.length,
      clients: clientEntities.length,
      manualReview: manualReviewLeads.length,
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
    const facebook = active.filter((l) => Boolean(l.facebook && l.facebook.trim())).length;
    const linkedin = active.filter((l) => Boolean(l.linkedin && l.linkedin.trim())).length;

    return [
      { id: 'whatsapp', label: 'WhatsApp', icon: '💬', count: whatsapp },
      { id: 'whatsapp_mobile', label: 'WhatsApp Mobile', icon: '📱', count: whatsappMobile },
      { id: 'website_form', label: 'Website Form', icon: '🌐', count: websiteForm },
      { id: 'email', label: 'Email', icon: '✉️', count: email },
      { id: 'instagram', label: 'Instagram', icon: '📸', count: instagram },
      { id: 'facebook', label: 'Facebook', icon: '👥', count: facebook },
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
    setAutoOpenContact({ id: entityId, entityType });
    store.dismissNotification();
  };

  const pageTitleMap: Record<PageId, string> = {
    import: 'Lead Import & Ingestion',
    builder: 'Multi-Channel Campaign Builder',
    crm:
      crmCountryFilter !== 'all'
        ? `Leads & Clients • ${getCountryFlag(crmCountryFilter)} ${crmCountryFilter}`
        : crmChannelFilter !== 'all'
        ? `Leads & Clients • Channel: ${crmChannelFilter}`
        : crmSubFilter === 'lead_added'
        ? 'Leads & Clients • Added Leads'
        : crmSubFilter === 'lead_not_added'
        ? 'Leads & Clients • Not Added (Unassigned)'
        : crmSubFilter === 'client'
        ? 'Leads & Clients • Converted Clients'
        : crmSubFilter === 'manual_review'
        ? 'Leads & Clients • Manual Checking (Bounced & Anonymous)'
        : crmSubFilter === 'inbound'
        ? 'Leads & Clients • Inbound Replies'
        : crmSubFilter === 'trash'
        ? 'Leads & Clients • Trash Bin'
        : 'Leads & Clients CRM',
    health: 'Sending Infrastructure & Health',
    copilot: 'AI Executive Command Center & Growth Copilot',
  };

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
        counts={counts}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Persistent Top Navigation Bar Accessible from Anywhere */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Online Digital Solution</span>
            <span className="text-slate-300">/</span>
            <h2 className="text-sm font-bold text-slate-800">{pageTitleMap[page]}</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Sync Gmail Trigger */}
            <button
              onClick={() => store.syncEmailReplies()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
              title="Sync Gmail inbox for incoming client replies"
            >
              <RefreshCw size={13} className="text-slate-500" />
              <span className="hidden sm:inline">Sync Gmail</span>
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

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {page === 'copilot' ? (
            <AiCopilotPage />
          ) : (
            <div className="mx-auto max-w-7xl px-6 py-8">
              {page === 'import' && <LeadImportPage store={store} onNavigate={setPage} />}
              {page === 'builder' && <CampaignBuilderPage store={store} />}
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
    </div>
  );
}

export default App;
