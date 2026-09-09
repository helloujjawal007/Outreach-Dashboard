import React, { useEffect, useState } from 'react';
import { Mail, MessageSquare, X, ArrowRight, Sparkles, Building2 } from 'lucide-react';
import type { InboundReplyMessage } from '@/types';

interface InboundEmailPopupProps {
  notification: InboundReplyMessage | null;
  onClose: () => void;
  onOpenConversation: (entityId: string, entityType: 'lead' | 'client') => void;
  autoCloseDurationMs?: number;
}

export function InboundEmailPopup({
  notification,
  onClose,
  onOpenConversation,
  autoCloseDurationMs = 15000,
}: InboundEmailPopupProps) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!notification) {
      setProgress(100);
      return;
    }

    setProgress(100);
    const intervalMs = 100;
    const step = (intervalMs / autoCloseDurationMs) * 100;

    const timer = setInterval(() => {
      if (!isPaused) {
        setProgress((prev) => {
          if (prev <= step) {
            clearInterval(timer);
            onClose();
            return 0;
          }
          return prev - step;
        });
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [notification, onClose, autoCloseDurationMs, isPaused]);

  if (!notification) return null;

  const targetId = notification.client_id || notification.lead_id || '';
  const entityType = notification.entity_type || (notification.client_id ? 'client' : 'lead');

  return (
    <div
      className="fixed top-5 right-5 z-50 max-w-sm sm:max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
    >
      <div className="relative overflow-hidden rounded-2xl border border-blue-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-md transition-all hover:shadow-blue-500/10">
        {/* Animated accent gradient glow bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/25">
              <Mail size={18} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border border-white" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  New Email Reply Received!
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold uppercase ${
                    entityType === 'client'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {entityType}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Live Gmail Inbound Synchronization</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Dismiss popup"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sender Information */}
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50/80 px-2.5 py-2 border border-slate-100">
          <Building2 size={16} className="text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-800">
              {notification.business_name || 'Contact'}
            </p>
            <p className="truncate text-[11px] text-blue-600 font-mono">
              {notification.email}
            </p>
          </div>
        </div>

        {/* Message Snippet */}
        <div className="mt-2.5 rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
          <p className="text-[10px] font-semibold text-blue-900 uppercase tracking-wider mb-1 flex items-center gap-1">
            <MessageSquare size={11} /> Message Preview
          </p>
          <p className="text-xs text-slate-700 italic line-clamp-3 break-words font-medium">
            "{notification.text || '(No message content)'}"
          </p>
        </div>

        {/* Actions */}
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400">
            {isPaused ? 'Paused countdown' : 'Auto-dismissing...'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                if (targetId) {
                  onOpenConversation(targetId, entityType as 'lead' | 'client');
                }
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95"
            >
              <Sparkles size={12} />
              <span>Open Conversation</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Countdown progress line */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100">
          <div
            className="h-full bg-blue-500 transition-all ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
