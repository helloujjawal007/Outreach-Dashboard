import React, { useState, useMemo } from 'react';
import {
  Mail,
  Search,
  RefreshCw,
  ArrowRight,
  Clock,
  Building2,
  Phone,
  Tag,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { Modal } from './Modal';
import type { InboundReplyMessage } from '@/types';

interface InboundRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  replies: InboundReplyMessage[];
  onOpenConversation: (entityId: string, entityType: 'lead' | 'client') => void;
  onSyncInbox: () => Promise<void>;
  isSyncing?: boolean;
}

export function InboundRepliesModal({
  isOpen,
  onClose,
  replies,
  onOpenConversation,
  onSyncInbox,
  isSyncing = false,
}: InboundRepliesModalProps) {
  const [search, setSearch] = useState('');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const filteredReplies = useMemo(() => {
    if (!search.trim()) return replies;
    const q = search.toLowerCase();
    return replies.filter(
      (r) =>
        r.business_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.text?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
    );
  }, [replies, search]);

  const handleSyncClick = async () => {
    setSyncFeedback(null);
    try {
      await onSyncInbox();
      setSyncFeedback('Gmail inbox synced successfully');
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch {
      setSyncFeedback('Sync failed. Please verify IMAP configuration.');
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Inbound Email Replies Center" width="xl">
      <div className="space-y-4">
        {/* Top toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search incoming emails by name, email, or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
              <span>{isSyncing ? 'Syncing Gmail...' : 'Sync Gmail Inbox'}</span>
            </button>
          </div>
        </div>

        {syncFeedback && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 border border-emerald-200">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Total counts header */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-slate-600">
            {filteredReplies.length} {filteredReplies.length === 1 ? 'Message' : 'Messages'} Received from Email
          </p>
          <span className="text-[11px] text-slate-400">
            Synchronized via IMAP (imap.gmail.com:993)
          </span>
        </div>

        {/* Replies Stream */}
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {filteredReplies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
              <Mail size={36} className="mx-auto text-slate-400 mb-2 opacity-50" />
              <p className="text-sm font-semibold text-slate-700">No email replies found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {search
                  ? `No incoming messages match "${search}". Try clearing your search.`
                  : 'When leads or clients reply to your outreach emails, their incoming messages will be automatically captured and organized here.'}
              </p>
              {!search && (
                <button
                  onClick={handleSyncClick}
                  disabled={isSyncing}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                  Check Gmail Inbox Now
                </button>
              )}
            </div>
          ) : (
            filteredReplies.map((reply) => {
              const targetId = reply.client_id || reply.lead_id || '';
              const entityType = reply.entity_type || (reply.client_id ? 'client' : 'lead');

              return (
                <div
                  key={reply.id}
                  className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    {/* Contact identity */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                        <Mail size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">
                            {reply.business_name || 'Unknown Contact'}
                          </h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              entityType === 'client'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {entityType}
                          </span>
                          {reply.category && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <Tag size={10} />
                              {reply.category}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span className="font-mono text-blue-600">{reply.email}</span>
                          {reply.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} className="text-slate-400" />
                              {reply.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sent timestamp */}
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                      <Clock size={12} />
                      <span>{formatDate(reply.sent_at)}</span>
                    </div>
                  </div>

                  {/* Message body */}
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 border border-slate-200/80">
                    <p className="text-xs text-slate-800 font-normal leading-relaxed whitespace-pre-wrap">
                      {reply.text}
                    </p>
                  </div>

                  {/* Bottom actions */}
                  <div className="mt-3.5 flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 size={12} /> Synced & Stored in Conversation
                    </span>
                    <button
                      onClick={() => {
                        if (targetId) {
                          onOpenConversation(targetId, entityType as 'lead' | 'client');
                          onClose();
                        }
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95"
                    >
                      <Sparkles size={12} />
                      <span>Open Conversation & Reply</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-200">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
