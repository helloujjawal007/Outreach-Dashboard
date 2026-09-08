import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-ink-300">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink-700">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
