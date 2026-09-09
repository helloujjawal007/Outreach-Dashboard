import React, { useState, useMemo, useEffect } from 'react';
import {
  Mail,
  Search,
  RefreshCw,
  ArrowRight,
  Clock,
  Phone,
  Tag,
  CheckCircle2,
  CheckCheck,
  Sparkles,
  Inbox,
  History,
  Eye,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { InboundReplyMessage } from '@/types';

interface InboundRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  replies: InboundReplyMessage[];
  onOpenConversation: (entityId: string, entityType: 'lead' | 'client') => void;
  onSyncInbox: () => Promise<void>;
  isSyncing?: boolean;
  onMarkSeen?: (replyId: string) => Promise<void>;
  onMarkHandled?: (replyId: string) => Promise<void>;
}

export function InboundRepliesModal({
  isOpen,
  onClose,
  replies,
  onOpenConversation,
  onSyncInbox,
  isSyncing = false,
  onMarkSeen,
  onMarkHandled,
}: InboundRepliesModalProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [allHistoryReplies, setAllHistoryReplies] = useState<InboundReplyMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Fetch all history when switching to "all" tab
  useEffect(() => {
    if (isOpen && tab === 'all') {
      setIsLoadingHistory(true);
      api.getInboundReplies(undefined, 'all')
        .then((data) => setAllHistoryReplies(data))
        .catch((err) => console.error('Failed to load inbound history:', err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [isOpen, tab]);

  const activeList = tab === 'pending' ? replies : allHistoryReplies;

  const filteredReplies = useMemo(() => {
    if (!search.trim()) return activeList;
    const q = search.toLowerCase();
    return activeList.filter(
      (r) =>
        r.business_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.text?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
    );
  }, [activeList, search]);

  const handleSyncClick = async () => {
    setSyncFeedback(null);
    try {
      await onSyncInbox();
      setSyncFeedback('Gmail inbox checked successfully');
      if (tab === 'all') {
        const fresh = await api.getInboundReplies(undefined, 'all');
        setAllHistoryReplies(fresh);
      }
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch {
      setSyncFeedback('Sync failed. Please verify IMAP configuration.');
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleMarkHandledClick = async (replyId: string, businessName: string) => {
    try {
      if (onMarkHandled) {
        await onMarkHandled(replyId);
      } else {
        await api.markInboundHandled(replyId);
      }
      setActionFeedback(`Marked "${businessName}" as handled & removed from inbox`);
      if (tab === 'all') {
        const fresh = await api.getInboundReplies(undefined, 'all');
        setAllHistoryReplies(fresh);
      }
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      console.error('Failed to mark handled:', err);
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
        {/* Info zero-inbox banner */}
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-cyan-50/80 p-3 text-xs text-blue-900 shadow-sm flex items-start gap-2.5">
          <Inbox size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-blue-950">Active Queue (Inbox Zero System)</p>
            <p className="text-blue-800/90 text-[11px] mt-0.5">
              Messages will leave this active queue once <strong>seen and replied to</strong> (or marked as handled). They will stay out until a <strong>new incoming message</strong> arrives from the contact.
            </p>
          </div>
        </div>

        {/* Tab & Search toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl bg-slate-50 p-2.5 border border-slate-200">
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-200/70 p-1 shrink-0">
            <button
              onClick={() => setTab('pending')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                tab === 'pending'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox size={13} />
              <span>Needs Attention</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  tab === 'pending'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-300 text-slate-700'
                }`}
              >
                {replies.length}
              </span>
            </button>
            <button
              onClick={() => setTab('all')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                tab === 'all'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={13} />
              <span>All History</span>
            </button>
          </div>

          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60 shrink-0"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Gmail'}</span>
          </button>
        </div>

        {syncFeedback && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 border border-emerald-200">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {actionFeedback && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 border border-blue-200 animate-in fade-in">
            <CheckCheck size={14} className="text-blue-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Total counts header */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold text-slate-600">
            {filteredReplies.length} {filteredReplies.length === 1 ? 'Message' : 'Messages'}{' '}
            {tab === 'pending' ? 'in Active Queue' : 'in History'}
          </p>
          <span className="text-[11px] text-slate-400">
            Live synchronization via Gmail IMAP (Port 993)
          </span>
        </div>

        {/* Replies Stream */}
        <div className="max-h-[58vh] overflow-y-auto space-y-3 pr-1">
          {isLoadingHistory ? (
            <div className="rounded-xl border border-slate-200 p-8 text-center bg-slate-50/50">
              <RefreshCw size={24} className="mx-auto text-blue-600 animate-spin mb-2" />
              <p className="text-xs font-medium text-slate-600">Loading conversation history...</p>
            </div>
          ) : filteredReplies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
              <Inbox size={36} className="mx-auto text-slate-400 mb-2 opacity-50" />
              <p className="text-sm font-semibold text-slate-700">
                {tab === 'pending' ? 'Inbox Zero! No pending messages' : 'No email replies found'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {search
                  ? `No incoming messages match "${search}". Try clearing your search.`
                  : tab === 'pending'
                  ? 'All received inbound messages have been seen and replied to! When a contact sends a new message, it will appear right here.'
                  : 'No inbound message history found in the database.'}
              </p>
              {!search && tab === 'pending' && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setTab('all')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <History size={12} />
                    View All History
                  </button>
                  <button
                    onClick={handleSyncClick}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                    Check Gmail Inbox Now
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredReplies.map((reply) => {
              const targetId = reply.client_id || reply.lead_id || '';
              const entityType = reply.entity_type || (reply.client_id ? 'client' : 'lead');
              const isReplied = Boolean(reply.is_replied);
              const isSeen = Boolean(reply.is_seen);

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

                          {/* Replied / Seen status pill */}
                          {isReplied ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <CheckCheck size={10} /> Replied
                            </span>
                          ) : isSeen ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              <Eye size={10} /> Seen
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 animate-pulse">
                              ● Needs Reply
                            </span>
                          )}

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
                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 size={12} /> Saved in Conversation
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isReplied && (
                        <button
                          type="button"
                          onClick={() => handleMarkHandledClick(reply.id, reply.business_name)}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                          title="Mark this message as handled so it leaves the active inbound queue"
                        >
                          <CheckCheck size={12} className="text-slate-500" />
                          <span>Mark as Done</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          if (targetId) {
                            if (onMarkSeen) {
                              onMarkSeen(reply.id).catch(() => {});
                            }
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
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <p className="text-[11px] text-slate-500">
            {tab === 'pending'
              ? `${replies.length} contact replies waiting for attention`
              : 'Viewing all historical messages'}
          </p>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
