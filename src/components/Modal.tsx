import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const widthMap = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, children, footer, width = 'lg' }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className={`relative w-full ${widthMap[width]} max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl animate-slide-in flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-300 hover:bg-slate-100 hover:text-ink-700 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">{footer}</div>}
      </div>
    </div>
  );
}
