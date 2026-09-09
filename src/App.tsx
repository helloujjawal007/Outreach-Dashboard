import { useState, useMemo } from 'react';
import { Sidebar, type PageId } from '@/components/Sidebar';
import { useStore } from '@/store';
import { LeadImportPage } from '@/pages/LeadImportPage';
import { CampaignBuilderPage } from '@/pages/CampaignBuilderPage';
import { CrmPage } from '@/pages/CrmPage';
import { SendingHealthPage } from '@/pages/SendingHealthPage';
import { InboundEmailPopup } from '@/components/InboundEmailPopup';

function App() {
  const [page, setPage] = useState<PageId>('import');
  const [autoOpenContact, setAutoOpenContact] = useState<{ id: string; entityType: 'lead' | 'client' } | null>(null);
  const store = useStore();

  const counts = useMemo(
    () => ({
      leads: store.leads.filter((l) => l.entityType === 'lead').length,
      clients: store.leads.filter((l) => l.entityType === 'client').length,
      queue: store.queue.length,
    }),
    [store.leads, store.queue]
  );

  const handleOpenConversation = (entityId: string, entityType: 'lead' | 'client') => {
    setPage('crm');
    setAutoOpenContact({ id: entityId, entityType });
    store.dismissNotification();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar current={page} onNavigate={setPage} counts={counts} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {page === 'import' && <LeadImportPage store={store} onNavigate={setPage} />}
          {page === 'builder' && <CampaignBuilderPage store={store} />}
          {page === 'crm' && (
            <CrmPage
              store={store}
              autoOpenContact={autoOpenContact}
              onClearAutoOpenContact={() => setAutoOpenContact(null)}
            />
          )}
          {page === 'health' && <SendingHealthPage store={store} />}
        </div>
      </main>

      {/* Global Inbound Email Reply Alert Popup */}
      <InboundEmailPopup
        notification={store.latestReplyNotification}
        onClose={store.dismissNotification}
        onOpenConversation={handleOpenConversation}
      />
    </div>
  );
}

export default App;
