import { useState, useMemo } from 'react';
import { Sidebar, type PageId } from '@/components/Sidebar';
import { useStore } from '@/store';
import { LeadImportPage } from '@/pages/LeadImportPage';
import { CampaignBuilderPage } from '@/pages/CampaignBuilderPage';
import { CrmPage } from '@/pages/CrmPage';
import { SendingHealthPage } from '@/pages/SendingHealthPage';

function App() {
  const [page, setPage] = useState<PageId>('import');
  const store = useStore();

  const counts = useMemo(
    () => ({
      leads: store.leads.filter((l) => l.entityType === 'lead').length,
      clients: store.leads.filter((l) => l.entityType === 'client').length,
      queue: store.queue.length,
    }),
    [store.leads, store.queue]
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar current={page} onNavigate={setPage} counts={counts} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">
          {page === 'import' && <LeadImportPage store={store} />}
          {page === 'builder' && <CampaignBuilderPage store={store} />}
          {page === 'crm' && <CrmPage store={store} />}
          {page === 'health' && <SendingHealthPage store={store} />}
        </div>
      </main>
    </div>
  );
}

export default App;
