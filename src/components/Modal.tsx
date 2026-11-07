import { type ReactNode, useEffect, useRef } from 'react';
import { X, Minus } from 'lucide-react';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  maxWidth?: string;
}

const widthMap = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, isOpen, onClose, onMinimize, title, children, footer, width = 'lg', maxWidth }: ModalProps) {
  const isVisible = open ?? isOpen ?? false;
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Focus trap and keyboard dismiss (Escape & Tab cycling)
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalContainerRef.current) {
        const focusableElements = modalContainerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus into modal
    const timer = setTimeout(() => {
      if (modalContainerRef.current) {
        const firstInputOrBtn = modalContainerRef.current.querySelector<HTMLElement>(
          'input, button:not([title="Close modal"]):not([aria-label="Close modal"]), select, textarea'
        );
        if (firstInputOrBtn) {
          firstInputOrBtn.focus();
        }
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalContainerRef}
        className={`relative w-full ${maxWidth || widthMap[width]} max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl animate-slide-in flex flex-col`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="modal-title" className="text-lg font-bold text-ink-900">{title}</h2>
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="rounded-lg p-1 text-ink-400 hover:bg-slate-100 hover:text-ink-700 transition-colors"
                title="Minimize modal"
                aria-label="Minimize modal"
              >
                <Minus size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ink-300 hover:bg-slate-100 hover:text-ink-700 transition-colors"
              title="Close modal"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">{footer}</div>}
      </div>
    </div>
  );
}
