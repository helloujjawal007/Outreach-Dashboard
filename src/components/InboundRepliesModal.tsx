import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Mail,
  MessageCircle,
  Facebook,
  Instagram,
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
  EyeOff,
  Smartphone,
  ExternalLink,
  Layers,
  Send,
  Filter,
  Linkedin,
  User,
  AlertTriangle,
  Trash2,
  Zap,
  Edit3,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { InboundReplyMessage, WhatsAppSessionStatus } from '@/types';

interface InboundRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  replies: InboundReplyMessage[];
  onOpenConversation: (entityId: string, entityType: 'lead' | 'client') => void;
  onOpenProfile?: (entityId: string, entityType: 'lead' | 'client') => void;
  onSyncInbox: () => Promise<any>;
  isSyncing?: boolean;
  onMarkRead?: (messageId: string, isRead: boolean) => Promise<void>;
  onMarkSeen?: (replyId: string) => Promise<void>;
  onMarkHandled?: (replyId: string) => Promise<void>;
  onDeleteLead?: (leadId: string) => Promise<void>;
}

type ChannelFilter = 'all' | 'whatsapp' | 'email' | 'instagram' | 'linkedin';
type ViewTab = 'recent' | 'unread' | 'pending' | 'inbound' | 'outbound' | 'unmatched';
type DateFilter = 'all' | 'today' | '7d' | '30d';

export function InboundRepliesModal({
  isOpen,
  onClose,
  replies,
  onOpenConversation,
  onOpenProfile,
  onSyncInbox,
  isSyncing = false,
  onMarkRead,
  onMarkHandled,
  onDeleteLead,
}: InboundRepliesModalProps) {
  const [search, setSearch] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('recent');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Messages state
  const [allRecentMessages, setAllRecentMessages] = useState<InboundReplyMessage[]>([]);
  const [allInboundHistory, setAllInboundHistory] = useState<InboundReplyMessage[]>([]);
  const [unmatchedEmails, setUnmatchedEmails] = useState<
    Array<{
      id: string;
      messageId: string;
      senderEmail: string;
      subject: string;
      snippet: string;
      processedAt: string;
      isBounce: boolean;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  // Status & Feedback state
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<WhatsAppSessionStatus | null>(null);
  const [approvingReplyId, setApprovingReplyId] = useState<string | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>({});
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const handleApproveAndSend = async (msg: InboundReplyMessage) => {
    const replyText = draftOverrides[msg.id] ?? msg.ai_suggested_reply;
    if (!replyText || !replyText.trim()) return;

    setApprovingReplyId(msg.id);
    try {
      const res = await api.sendReply({
        leadId: msg.lead_id || undefined,
        clientId: msg.client_id || undefined,
        channel: msg.channel,
        text: replyText.trim(),
      });
      if (res.success) {
        setActionFeedback(`AI reply dispatched to ${msg.business_name} via ${msg.channel}!`);
        if (onMarkHandled) await onMarkHandled(msg.id);
        fetchRecentMessages();
        fetchInboundHistory();
      } else {
        setActionFeedback(`Failed to send: ${res.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      setActionFeedback(`Error: ${err.message || 'Failed to dispatch reply'}`);
    } finally {
      setApprovingReplyId(null);
    }
  };

  // Fetch recent messages across all channels
  const fetchRecentMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const [messagesData, waStatusData] = await Promise.all([
        api.getRecentMessages({ limit: 150 }).catch((err) => {
          console.error('Failed to load recent messages:', err);
          return [] as InboundReplyMessage[];
        }),
        api.getWhatsAppSessionStatus().catch(() => null),
      ]);
      setAllRecentMessages(messagesData);
      if (waStatusData) setWaStatus(waStatusData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch inbound history
  const fetchInboundHistory = useCallback(async () => {
    try {
      const data = await api.getInboundReplies(undefined, 'all');
      setAllInboundHistory(data);
    } catch (err) {
      console.error('Failed to load inbound history:', err);
    }
  }, []);

  // Fetch unmatched emails / bounces
  const fetchUnmatched = useCallback(async () => {
    try {
      const items = await api.getUnmatchedInbox();
      setUnmatchedEmails(items);
    } catch (err) {
      console.error('Failed to load unmatched inbox:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRecentMessages();
      fetchInboundHistory();
      fetchUnmatched();
    }
  }, [isOpen, fetchRecentMessages, fetchInboundHistory, fetchUnmatched]);

  // Compute unread count
  const unreadCount = useMemo(() => {
    const pool = allRecentMessages.length > 0 ? allRecentMessages : replies;
    return pool.filter((m) => m.direction === 'inbound' && !m.is_read && !m.is_replied).length;
  }, [allRecentMessages, replies]);

  // Compute active base dataset based on viewTab
  const baseDataset = useMemo(() => {
    if (viewTab === 'unread') {
      const pool = allRecentMessages.length > 0 ? allRecentMessages : replies;
      return pool.filter((m) => m.direction === 'inbound' && !m.is_read && !m.is_replied);
    }
    if (viewTab === 'pending') {
      // Unhandled / pending replies (Needs Attention)
      return replies;
    }
    if (viewTab === 'inbound') {
      // All received inbound replies
      return allInboundHistory.length > 0 ? allInboundHistory : replies;
    }
    if (viewTab === 'outbound') {
      // Dispatched / outbound messages
      return allRecentMessages.filter((m) => m.direction === 'outbound');
    }
    // Default 'recent': All messages (inbound + outbound across WA, Email, FB, IG)
    return allRecentMessages.length > 0 ? allRecentMessages : replies;
  }, [viewTab, replies, allInboundHistory, allRecentMessages]);

  // Channel counts for pills in current viewTab
  const channelCounts = useMemo(() => {
    return {
      all: baseDataset.length,
      whatsapp: baseDataset.filter((m) => m.channel === 'whatsapp').length,
      email: baseDataset.filter((m) => m.channel === 'email').length,
      instagram: baseDataset.filter((m) => m.channel === 'instagram').length,
      linkedin: baseDataset.filter((m) => m.channel === 'linkedin').length,
    };
  }, [baseDataset]);

  // Filter dataset by channel, date, and search query
  const filteredMessages = useMemo(() => {
    let list = baseDataset;

    // Filter by channel
    if (channelFilter !== 'all') {
      list = list.filter((m) => m.channel === channelFilter);
    }

    // Filter by date
    if (dateFilter !== 'all') {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      list = list.filter((m) => {
        const t = new Date(m.sent_at || Date.now()).getTime();
        if (dateFilter === 'today') return now - t <= oneDay;
        if (dateFilter === '7d') return now - t <= 7 * oneDay;
        if (dateFilter === '30d') return now - t <= 30 * oneDay;
        return true;
      });
    }

    // Filter by search query
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.business_name?.toLowerCase().includes(q) ||
          m.email?.toLowerCase().includes(q) ||
          m.phone?.toLowerCase().includes(q) ||
          m.whatsapp?.toLowerCase().includes(q) ||
          m.facebook?.toLowerCase().includes(q) ||
          m.instagram?.toLowerCase().includes(q) ||
          m.text?.toLowerCase().includes(q) ||
          m.category?.toLowerCase().includes(q) ||
          m.inbox_email?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [baseDataset, channelFilter, dateFilter, search]);

  const filteredUnmatched = useMemo(() => {
    if (!search.trim()) return unmatchedEmails;
    const q = search.toLowerCase();
    return unmatchedEmails.filter(
      (item) =>
        item.senderEmail.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.snippet.toLowerCase().includes(q)
    );
  }, [unmatchedEmails, search]);

  const handleSyncClick = async () => {
    setSyncFeedback(null);
    try {
      await onSyncInbox();
      setSyncFeedback('Gmail inbox synced successfully');
      await Promise.all([fetchRecentMessages(), fetchInboundHistory(), fetchUnmatched()]);
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch {
      setSyncFeedback('Sync failed. Please verify IMAP configuration.');
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleToggleRead = async (messageId: string, targetRead: boolean) => {
    try {
      if (onMarkRead) {
        await onMarkRead(messageId, targetRead);
      } else {
        await api.markMessageRead(messageId, targetRead);
      }
      const readTimestamp = targetRead ? new Date().toISOString() : null;
      setAllRecentMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_read: targetRead, read_at: readTimestamp } : m))
      );
      setAllInboundHistory((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_read: targetRead, read_at: readTimestamp } : m))
      );
      setActionFeedback(targetRead ? 'Message marked as read' : 'Message marked as unread');
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to toggle read status:', err);
    }
  };

  const handleMarkHandledClick = async (replyId: string, businessName: string) => {
    try {
      if (onMarkHandled) {
        await onMarkHandled(replyId);
      } else {
        await api.markInboundHandled(replyId);
      }
      setActionFeedback(`Marked "${businessName}" as handled`);
      await Promise.all([fetchRecentMessages(), fetchInboundHistory()]);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err) {
      console.error('Failed to mark handled:', err);
    }
  };

  const handleMoveLeadToTrash = async (leadId: string, businessName: string) => {
    if (!confirm(`Move "${businessName}" to Trash? (Address is not present/useful)`)) {
      return;
    }
    try {
      if (onDeleteLead) {
        await onDeleteLead(leadId);
      } else {
        await api.deleteLead(leadId);
      }
      setActionFeedback(`Moved "${businessName}" to Trash`);
      // Filter out messages for this contact from active lists
      setAllRecentMessages((prev) => prev.filter((m) => m.lead_id !== leadId && m.client_id !== leadId));
      setAllInboundHistory((prev) => prev.filter((m) => m.lead_id !== leadId && m.client_id !== leadId));
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      console.error('Failed to move lead to trash:', err);
      setActionFeedback(`Failed to move to trash: ${err?.message || 'Error'}`);
      setTimeout(() => setActionFeedback(null), 4000);
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
    <Modal open={isOpen} onClose={onClose} title="" width="xl">
      <div className="space-y-3.5 -mt-1">
        {/* Custom Header with Title and Live Sync Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-purple-600 text-white shadow-sm">
              <Layers size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Multi-Channel Messages &amp; Inbox</span>
                <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-xs font-extrabold text-brand-700">
                  WA • Email • FB • IG
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Live message center with verified source tracking and explicit read controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live WhatsApp Status indicator */}
            {waStatus?.isConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>WA Live: {waStatus.phoneNumber}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <Smartphone size={12} />
                <span>WA Offline</span>
              </span>
            )}

            {/* Sync Gmail button */}
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60 shadow-2xs"
              title="Check Gmail inbox for new client replies"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Gmail'}</span>
            </button>
          </div>
        </div>

        {/* View Mode Tabs (Recent Messages, Unread, Needs Attention, Inbound, Outbound) */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 flex-wrap">
            <button
              onClick={() => setViewTab('recent')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewTab === 'recent'
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={13} />
              <span>All Messages</span>
              <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold">
                {allRecentMessages.length}
              </span>
            </button>

            {/* Unread Only Tab */}
            <button
              onClick={() => setViewTab('unread')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewTab === 'unread'
                  ? 'bg-white text-rose-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail size={13} />
              <span>Unread Only</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  unreadCount > 0
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {unreadCount}
              </span>
            </button>

            <button
              onClick={() => setViewTab('pending')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewTab === 'pending'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox size={13} />
              <span>Needs Attention</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  replies.length > 0
                    ? 'bg-amber-100 text-amber-800 font-bold'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {replies.length}
              </span>
            </button>

            <button
              onClick={() => setViewTab('inbound')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewTab === 'inbound'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox size={13} />
              <span>Inbound History</span>
              <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold">
                {allInboundHistory.length}
              </span>
            </button>

            <button
              onClick={() => setViewTab('outbound')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewTab === 'outbound'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send size={13} />
              <span>Outbound Sent</span>
              <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold">
                {allRecentMessages.filter((m) => m.direction === 'outbound').length}
              </span>
            </button>

            <button
              onClick={() => setViewTab('unmatched')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewTab === 'unmatched'
                  ? 'bg-white text-rose-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle size={13} />
              <span>Unmatched & Bounces</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  unmatchedEmails.length > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {unmatchedEmails.length}
              </span>
            </button>
          </div>

          {/* Quick Search & Date Filter */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md ml-auto">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-700 font-medium focus:border-brand-500 focus:outline-none shadow-2xs shrink-0"
              title="Filter messages by date received"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>

            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search text, phone, email, inbox..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Channel Filter Pills (WhatsApp, Email, Facebook, Instagram) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 shrink-0">
            <Filter size={12} />
            <span>Filter Channel:</span>
          </span>

          <button
            onClick={() => setChannelFilter('all')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border transition-all ${
              channelFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>All Channels</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {channelCounts.all}
            </span>
          </button>

          <button
            onClick={() => setChannelFilter('whatsapp')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border transition-all ${
              channelFilter === 'whatsapp'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <span>WhatsApp</span>
            <span className="rounded-full bg-emerald-200/80 px-1.5 py-0.5 text-[10px]">
              {channelCounts.whatsapp}
            </span>
          </button>

          <button
            onClick={() => setChannelFilter('email')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border transition-all ${
              channelFilter === 'email'
                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
            }`}
          >
            <span>Email</span>
            <span className="rounded-full bg-blue-200/80 px-1.5 py-0.5 text-[10px]">
              {channelCounts.email}
            </span>
          </button>

          <button
            onClick={() => setChannelFilter('instagram')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border transition-all ${
              channelFilter === 'instagram'
                ? 'bg-pink-600 text-white border-pink-600 shadow-2xs'
                : 'bg-pink-50 text-pink-800 border-pink-200 hover:bg-pink-100'
            }`}
          >
            <span>Instagram</span>
            <span className="rounded-full bg-pink-200/80 px-1.5 py-0.5 text-[10px]">
              {channelCounts.instagram}
            </span>
          </button>

          <button
            onClick={() => setChannelFilter('linkedin')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border transition-all ${
              channelFilter === 'linkedin'
                ? 'bg-[#0a66c2] text-white border-[#0a66c2] shadow-2xs'
                : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
            }`}
          >
            <Linkedin size={12} />
            <span>LinkedIn</span>
            <span className="rounded-full bg-sky-200/80 px-1.5 py-0.5 text-[10px]">
              {channelCounts.linkedin}
            </span>
          </button>
        </div>

        {/* Feedback alerts */}
        {syncFeedback && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-medium text-blue-800 animate-fadeIn">
            <RefreshCw size={14} className="text-blue-600" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {actionFeedback && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-800 animate-fadeIn">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Messages List Stream */}
        <div className="max-h-[58vh] overflow-y-auto space-y-3 pr-1">
          {viewTab === 'unmatched' ? (
            filteredUnmatched.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm font-bold text-slate-700">No Unmatched or Bounced Emails</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  All inbound emails and delivery status notifications have been automatically matched to registered contacts in your CRM!
                </p>
              </div>
            ) : (
              filteredUnmatched.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50/50 via-white to-amber-50/30 p-3.5 shadow-2xs space-y-2 hover:border-rose-300 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-rose-950 font-mono">
                            {item.senderEmail}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                            {item.isBounce ? 'Delivery Failure (Bounce)' : 'Unregistered Sender'}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-slate-900 mt-1">
                          {item.subject || '(No Subject)'}
                        </h4>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-slate-400">
                        {item.processedAt
                          ? new Date(item.processedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                  </div>
                  {item.snippet && (
                    <div className="rounded-lg bg-white border border-slate-200 p-2.5 text-xs text-slate-700 font-mono line-clamp-3">
                      {item.snippet}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-rose-100/80">
                    <span className="text-[11px] text-slate-500">
                      {item.isBounce ? 'Delivery failure report' : 'Unregistered sender inquiry'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUnmatchedEmails((prev) => prev.filter((u) => u.id !== item.id));
                        setActionFeedback(`Dismissed notice from ${item.senderEmail}`);
                        setTimeout(() => setActionFeedback(null), 3000);
                      }}
                      className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 transition shadow-2xs"
                      title="Dismiss delivery notification"
                    >
                      <Trash2 size={12} className="text-rose-600" />
                      <span>Dismiss / Trash</span>
                    </button>
                  </div>
                </div>
              ))
            )
          ) : isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-brand-600" />
              <p className="text-xs font-semibold">Loading messages across all channels...</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
              <Inbox size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">
                {viewTab === 'unread'
                  ? 'All caught up! No unread messages'
                  : viewTab === 'pending'
                  ? 'Inbox Zero! No pending messages'
                  : 'No messages found'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {search
                  ? `No messages match "${search}". Try clearing your search or switching channels.`
                  : viewTab === 'unread'
                  ? 'All received messages have been read or replied to! Click "All Messages" to see full history.'
                  : `No recent messages recorded for ${channelFilter.toUpperCase()}.`}
              </p>
              {viewTab === 'unread' && (
                <button
                  onClick={() => setViewTab('recent')}
                  className="btn-primary py-1.5 px-3.5 text-xs font-bold inline-flex items-center gap-1.5 mt-2"
                >
                  <History size={13} />
                  <span>View All Messages</span>
                </button>
              )}
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const targetId = msg.client_id || msg.lead_id || '';
              const entityType = msg.entity_type || (msg.client_id ? 'client' : 'lead');
              const isReplied = Boolean(msg.is_replied);
              const isInbound = msg.direction === 'inbound';
              const isRead = Boolean(msg.is_read);
              const channel = msg.channel || 'email';

              // Clean phone number for WhatsApp deep link
              const rawPhone = (msg.whatsapp || msg.phone || '').trim();
              const cleanWaNumber = rawPhone.replace(/\D/g, '');

              return (
                <div
                  key={msg.id}
                  className={`group relative rounded-xl border p-3.5 shadow-2xs transition-all hover:shadow-md ${
                    isInbound && !isRead && !isReplied
                      ? 'border-rose-300 bg-rose-50/20 ring-1 ring-rose-400/30'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    {/* Contact identity & Channel icon */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Channel Icon container */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          channel === 'whatsapp'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : channel === 'email'
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : channel === 'facebook'
                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                            : 'bg-pink-50 text-pink-600 border-pink-200'
                        }`}
                      >
                        {channel === 'whatsapp' && <MessageCircle size={18} />}
                        {channel === 'email' && <Mail size={18} />}
                        {channel === 'facebook' && <Facebook size={18} />}
                        {channel === 'instagram' && <Instagram size={18} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {onOpenProfile && targetId ? (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenProfile(targetId, entityType as 'lead' | 'client');
                                onClose();
                              }}
                              className="text-sm font-bold text-slate-900 hover:text-brand-600 hover:underline truncate text-left flex items-center gap-1.5 group cursor-pointer transition"
                              title="Click to open full contact profile with details & Google information"
                            >
                              <span>{msg.business_name || 'Contact'}</span>
                              <span className="opacity-0 group-hover:opacity-100 text-[10px] text-brand-600 font-semibold flex items-center gap-0.5 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200 transition">
                                <User size={10} />
                                Profile ↗
                              </span>
                            </button>
                          ) : (
                            <h4 className="text-sm font-bold text-slate-900 truncate">
                              {msg.business_name || 'Contact'}
                            </h4>
                          )}

                          {/* Channel Badge */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              channel === 'whatsapp'
                                ? 'bg-emerald-100 text-emerald-800'
                                : channel === 'email'
                                ? 'bg-blue-100 text-blue-800'
                                : channel === 'facebook'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-pink-100 text-pink-800'
                            }`}
                          >
                            {channel}
                          </span>

                          {/* Direction Badge */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isInbound
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {isInbound ? '📥 Inbound' : '📤 Outbound'}
                          </span>

                          {/* Read / Unread Status Badge for Inbound */}
                          {isInbound && (
                            <>
                              {!isRead && !isReplied ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-2xs animate-pulse">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                                  UNREAD
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  <CheckCircle2 size={10} />
                                  Read
                                </span>
                              )}

                              {isReplied && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  <CheckCheck size={10} /> Replied
                                </span>
                              )}
                            </>
                          )}

                          {/* AI Intent Classification Badge */}
                          {msg.inbound_intent && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                msg.inbound_intent === 'meeting_request'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'
                                  : msg.inbound_intent === 'interested'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs'
                                  : msg.inbound_intent === 'question'
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                  : msg.inbound_intent === 'not_now'
                                  ? 'bg-slate-100 text-slate-800 border border-slate-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                              title={`AI Intent: ${msg.inbound_intent}${msg.inbound_intent_confidence ? ` (${Math.round(msg.inbound_intent_confidence * 100)}% confidence)` : ''}`}
                            >
                              <Zap size={10} className={msg.inbound_intent === 'meeting_request' || msg.inbound_intent === 'interested' ? 'text-amber-600 fill-amber-500' : ''} />
                              {msg.inbound_intent === 'meeting_request' && '🔥 Meeting Request'}
                              {msg.inbound_intent === 'interested' && '✨ Interested'}
                              {msg.inbound_intent === 'question' && '❓ Question'}
                              {msg.inbound_intent === 'not_now' && '⏳ Not Now'}
                              {msg.inbound_intent === 'opt_out' && '🛑 Opt-Out'}
                              {msg.inbound_intent_confidence ? ` (${Math.round(msg.inbound_intent_confidence * 100)}%)` : ''}
                            </span>
                          )}

                          {msg.category && (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <Tag size={10} />
                              {msg.category}
                            </span>
                          )}
                        </div>

                        {/* Contact details */}
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {channel === 'whatsapp' && (rawPhone || msg.phone) && (
                            <span className="flex items-center gap-1 text-emerald-700 font-mono font-medium">
                              <Phone size={11} className="text-emerald-600" />
                              {rawPhone || msg.phone}
                            </span>
                          )}
                          {channel === 'email' && msg.email && (
                            <span className="font-mono text-blue-600">{msg.email}</span>
                          )}
                          {channel === 'facebook' && (msg.facebook || msg.business_name) && (
                            <span className="font-mono text-indigo-600 flex items-center gap-1">
                              <Facebook size={11} />
                              {msg.facebook || msg.business_name}
                            </span>
                          )}
                          {channel === 'instagram' && (msg.instagram || msg.business_name) && (
                            <span className="font-mono text-pink-600 flex items-center gap-1">
                              <Instagram size={11} />
                              @{String(msg.instagram || msg.business_name).replace(/^@/, '')}
                            </span>
                          )}
                        </div>

                        {/* PROMINENT SOURCE ATTRIBUTION: Always show exact source! */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-100/90 px-2.5 py-1 text-xs text-slate-700 border border-slate-200">
                          <span className="font-bold text-slate-900 flex items-center gap-1 shrink-0">
                            <Layers size={12} className="text-brand-600" />
                            <span>Source:</span>
                          </span>

                          {channel === 'email' && (
                            <div className="flex items-center gap-1 flex-wrap text-[11px]">
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-900">
                                Email Inbox
                              </span>
                              <span className="text-slate-400">via</span>
                              <span className="font-mono font-bold text-blue-700">
                                {msg.inbox_email || 'team.onlinedigitalsolution@gmail.com'}
                              </span>
                              {msg.email && (
                                <>
                                  <span className="text-slate-400">• sender:</span>
                                  <span className="font-mono text-slate-800">{msg.email}</span>
                                </>
                              )}
                            </div>
                          )}

                          {channel === 'whatsapp' && (
                            <div className="flex items-center gap-1 flex-wrap text-[11px]">
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-900">
                                WhatsApp Direct
                              </span>
                              <span className="text-slate-400">from</span>
                              <span className="font-mono font-bold text-emerald-800">
                                {rawPhone || msg.phone || 'Prospect'}
                              </span>
                              <span className="text-slate-400">via</span>
                              <span className="text-emerald-700 font-medium">
                                {waStatus?.phoneNumber ? `Account ${waStatus.phoneNumber}` : 'Connected Session'}
                              </span>
                            </div>
                          )}

                          {channel === 'instagram' && (
                            <div className="flex items-center gap-1 flex-wrap text-[11px]">
                              <span className="rounded bg-pink-100 px-1.5 py-0.5 font-bold text-pink-900">
                                Instagram DM
                              </span>
                              <span className="text-slate-400">handle:</span>
                              <span className="font-mono font-bold text-pink-800">
                                @{String(msg.instagram || msg.business_name).replace(/^@/, '')}
                              </span>
                            </div>
                          )}

                          {channel === 'facebook' && (
                            <div className="flex items-center gap-1 flex-wrap text-[11px]">
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-900">
                                Facebook Messenger
                              </span>
                              <span className="text-slate-400">page:</span>
                              <span className="font-mono font-bold text-indigo-800">
                                {msg.facebook || msg.business_name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                      <Clock size={12} />
                      <span>{formatDate(msg.sent_at)}</span>
                    </div>
                  </div>

                  {/* Message body */}
                  <div className="mt-2.5 rounded-lg bg-slate-50 p-2.5 border border-slate-200/80">
                    <p className="text-xs text-slate-800 font-normal leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  </div>

                  {/* AI Autonomous Consultative Draft Response */}
                  {msg.ai_suggested_reply && isInbound && !isReplied && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-purple-50/50 p-3 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                          <Sparkles size={13} className="text-indigo-600" />
                          <span>AI Autonomous Consultative Draft</span>
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-indigo-700">
                            Ready to Dispatch
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingDraftId(editingDraftId === msg.id ? null : msg.id)}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition"
                        >
                          <Edit3 size={11} />
                          <span>{editingDraftId === msg.id ? 'Done' : 'Edit Draft'}</span>
                        </button>
                      </div>

                      {editingDraftId === msg.id ? (
                        <textarea
                          value={draftOverrides[msg.id] ?? msg.ai_suggested_reply}
                          onChange={(e) => setDraftOverrides((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                          rows={3}
                          className="w-full rounded-lg border border-indigo-300 bg-white p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner font-sans"
                          placeholder="Customize your response before sending..."
                        />
                      ) : (
                        <p className="text-xs text-slate-800 leading-relaxed italic bg-white/85 p-2.5 rounded-lg border border-indigo-100">
                          "{draftOverrides[msg.id] ?? msg.ai_suggested_reply}"
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] text-indigo-700 font-medium">
                          ✨ Tailored to {msg.category || 'business'} • Zero manual drafting required
                        </span>
                        <button
                          type="button"
                          disabled={approvingReplyId === msg.id}
                          onClick={() => handleApproveAndSend(msg)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3 py-1.5 text-xs font-bold shadow-xs hover:shadow transition disabled:opacity-50 cursor-pointer"
                        >
                          {approvingReplyId === msg.id ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} />
                              <span>Approve &amp; Send Reply</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bottom action toolbar */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {isInbound ? 'Client Reply' : 'Outreach Message'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Direct channel links */}
                      {channel === 'whatsapp' && cleanWaNumber && (
                        <a
                          href={`https://wa.me/${cleanWaNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                          title="Open WhatsApp chat"
                        >
                          <ExternalLink size={12} />
                          <span>wa.me</span>
                        </a>
                      )}

                      {channel === 'email' && msg.email && (
                        <a
                          href={`mailto:${msg.email}`}
                          className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-blue-700 hover:bg-blue-50 border-blue-200"
                          title="Compose email"
                        >
                          <Mail size={12} />
                          <span>Email</span>
                        </a>
                      )}

                      {channel === 'facebook' && (
                        <a
                          href={
                            msg.facebook?.startsWith('http')
                              ? msg.facebook
                              : `https://m.me/${String(msg.facebook || '').replace(/^[/@]/, '')}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                        >
                          <ExternalLink size={12} />
                          <span>Messenger</span>
                        </a>
                      )}

                      {channel === 'instagram' && msg.instagram && (
                        <a
                          href={`https://instagram.com/${msg.instagram.replace(/^@/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-pink-700 hover:bg-pink-50 border-pink-200"
                        >
                          <ExternalLink size={12} />
                          <span>IG DM</span>
                        </a>
                      )}

                      {/* Explicit Mark as Read / Mark as Unread Button */}
                      {isInbound && (
                        <button
                          type="button"
                          onClick={() => handleToggleRead(msg.id, !isRead)}
                          className={`btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 transition ${
                            !isRead
                              ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 font-bold'
                              : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                          title={isRead ? 'Mark as unread' : 'Mark as read'}
                        >
                          {isRead ? <EyeOff size={12} /> : <CheckCircle2 size={12} />}
                          <span>{isRead ? 'Mark Unread' : 'Mark as Read'}</span>
                        </button>
                      )}

                      {/* Mark handled button */}
                      {isInbound && !isReplied && (
                        <button
                          type="button"
                          onClick={() => handleMarkHandledClick(msg.id, msg.business_name)}
                          className="btn-secondary py-1 px-2 text-xs font-semibold flex items-center gap-1 text-slate-700 hover:bg-slate-100 border-slate-200"
                          title="Mark this inbound message as handled"
                        >
                          <CheckCheck size={12} className="text-slate-500" />
                          <span>Mark Done</span>
                        </button>
                      )}

                      {/* View Full Profile Button */}
                      {onOpenProfile && targetId && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenProfile(targetId, entityType as 'lead' | 'client');
                            onClose();
                          }}
                          className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition shadow-2xs"
                          title="Open full contact profile with Google details and activity"
                        >
                          <User size={12} className="text-indigo-600" />
                          <span>View Profile</span>
                        </button>
                      )}

                      {/* Move Lead to Trash Button */}
                      {targetId && (
                        <button
                          type="button"
                          onClick={() => handleMoveLeadToTrash(targetId, msg.business_name || 'Contact')}
                          className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition shadow-2xs"
                          title="No use of this lead (address missing or invalid). Move contact to Trash"
                        >
                          <Trash2 size={12} className="text-rose-600" />
                          <span>Move to Trash</span>
                        </button>
                      )}

                      {/* Open full thread button: NOTE: Does NOT mark as read! */}
                      <button
                        type="button"
                        onClick={() => {
                          if (targetId) {
                            onOpenConversation(targetId, entityType as 'lead' | 'client');
                            onClose();
                          }
                        }}
                        className="btn-primary py-1 px-3 text-xs font-bold flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white border-0 shadow-2xs"
                      >
                        <Sparkles size={12} />
                        <span>Open Thread &amp; Reply</span>
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
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-200">
          <p className="text-[11px] text-slate-500">
            Showing <strong>{viewTab === 'unmatched' ? filteredUnmatched.length : filteredMessages.length}</strong> {viewTab === 'unmatched' ? 'unmatched email(s)' : 'message(s)'} •{' '}
            {viewTab === 'unmatched' ? 'Gmail Inbound' : channelFilter === 'all' ? 'All Channels' : channelFilter.toUpperCase()}
          </p>
          <button
            onClick={onClose}
            className="btn-secondary py-1.5 px-4 text-xs font-semibold text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
