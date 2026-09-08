import type { ReactNode } from 'react';
import { Upload, MessageSquarePlus, Users, Activity, Zap } from 'lucide-react';

export type PageId = 'import' | 'builder' | 'crm' | 'health';

interface SidebarProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
  counts: { leads: number; clients: number; queue: number };
}

const navItems: { id: PageId; label: string; icon: typeof Upload }[] = [
  { id: 'import', label: 'Lead Import', icon: Upload },
  { id: 'builder', label: 'Campaign Builder', icon: MessageSquarePlus },
  { id: 'crm', label: 'Leads & Clients', icon: Users },
  { id: 'health', label: 'Sending Health', icon: Activity },
];

export function Sidebar({ current, onNavigate, counts }: SidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-200">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <Zap size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-sm font-bold text-ink-900 leading-tight">Lead Outreach</h1>
          <p className="text-xs text-ink-500 leading-tight">Console</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-500 hover:bg-slate-50 hover:text-ink-700'
              }`}
            >
              <Icon
                size={18}
                className={active ? 'text-brand-600' : 'text-ink-300 group-hover:text-ink-500'}
              />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'crm' && (
                <span className="text-xs font-semibold text-ink-300">
                  {counts.leads + counts.clients}
                </span>
              )}
              {item.id === 'health' && counts.queue > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-700">
                  {counts.queue}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-ink-500">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-700 truncate">Jordan Doe</p>
            <p className="text-xs text-ink-500 truncate">Outreach Manager</p>
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
