import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Bot,
  MessageSquare,
  FileText,
  Download,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { InboundReplyMessage, WhatsAppSessionStatus, Channel, ConversationMessage } from '@/types';

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
type LayoutMode = 'messenger' | 'feed';

interface ChatThread {
  key: string;
  entityId: string;
  entityType: 'lead' | 'client';
  businessName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  category?: string;
  channel: Channel;
  messages: InboundReplyMessage[];
  lastMessage: InboundReplyMessage;
  lastMessageAt: string;
  unreadCount: number;
  hasAiDraft: boolean;
  hasBounced: boolean;
}

function toThreadMessage(
  m: InboundReplyMessage | ConversationMessage,
  defaults: Partial<InboundReplyMessage> = {}
): InboundReplyMessage {
  const id = m.id;
  const channel = m.channel;
  const direction = m.direction;
  const text = m.text;
  const sent_at = 'sent_at' in m ? m.sent_at : (m as ConversationMessage).timestamp;
  const status = m.status;
  const is_read = m.is_read;
  const read_at = m.read_at;
  const is_replied = m.is_replied;
  const inbox_email = m.inbox_email;
  const lead_id = 'lead_id' in m ? m.lead_id : (m as ConversationMessage).leadId;
  const client_id = 'client_id' in m ? m.client_id : undefined;
  const business_name = ('business_name' in m ? m.business_name : defaults.business_name) || '';
  const email = ('email' in m ? m.email : defaults.email) || '';
  const phone = ('phone' in m ? m.phone : defaults.phone) || '';
  const whatsapp = ('whatsapp' in m ? m.whatsapp : defaults.whatsapp) || '';
  const facebook = ('facebook' in m ? m.facebook : defaults.facebook) || '';
  const instagram = ('instagram' in m ? m.instagram : defaults.instagram) || '';
  const category = ('category' in m ? m.category : defaults.category) || '';
  const inbound_intent = 'inbound_intent' in m ? m.inbound_intent : undefined;
  const inbound_intent_confidence = 'inbound_intent_confidence' in m ? m.inbound_intent_confidence : undefined;
  const ai_suggested_reply = 'ai_suggested_reply' in m ? m.ai_suggested_reply : undefined;
  const entity_type = ('entity_type' in m ? m.entity_type : defaults.entity_type) || 'lead';

  return {
    id,
    conversation_id: 'conversation_id' in m ? m.conversation_id : id,
    channel,
    direction,
    text,
    sent_at: sent_at || new Date().toISOString(),
    status: status || 'delivered',
    is_read,
    read_at,
    is_replied,
    inbox_email,
    inbound_intent,
    inbound_intent_confidence,
    ai_suggested_reply,
    metadata: m.metadata,
    entity_type,
    lead_id,
    client_id,
    business_name,
    email,
    phone,
    whatsapp,
    facebook,
    instagram,
    category,
  };
}

function getInitials(name?: string) {
  if (!name || name.trim() === '' || name === 'Contact') return 'CO';
  const clean = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatChatTime(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatThreadDate(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatChatDateDivider(dateStr?: string): string {
  if (!dateStr) return 'Recent';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateStr;
  }
}

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
  // Mode: messenger (new messaging app experience) vs feed (legacy card list)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('messenger');

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

  // Messenger-specific state
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [composerChannel, setComposerChannel] = useState<Channel>('whatsapp');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [threadHistoryMap, setThreadHistoryMap] = useState<Record<string, InboundReplyMessage[]>>({});
  const chatScrollRef = useRef<HTMLDivElement>(null);

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

  // Compute unread count (strictly genuine inbound messages, never bounces)
  const unreadCount = useMemo(() => {
    const pool = allRecentMessages.length > 0 ? allRecentMessages : replies;
    return pool.filter(
      (m) =>
        m.direction === 'inbound' &&
        m.status !== 'bounced' &&
        !m.text?.startsWith('[DELIVERY FAILURE') &&
        !m.is_read &&
        !m.is_replied
    ).length;
  }, [allRecentMessages, replies]);

  // Compute active base dataset based on viewTab
  const baseDataset = useMemo(() => {
    if (viewTab === 'unread') {
      const pool = allRecentMessages.length > 0 ? allRecentMessages : replies;
      return pool.filter(
        (m) =>
          m.direction === 'inbound' &&
          m.status !== 'bounced' &&
          !m.text?.startsWith('[DELIVERY FAILURE') &&
          !m.is_read &&
          !m.is_replied
      );
    }
    if (viewTab === 'pending') {
      return replies.filter(
        (m) => m.status !== 'bounced' && !m.text?.startsWith('[DELIVERY FAILURE')
      );
    }
    if (viewTab === 'inbound') {
      const pool = allInboundHistory.length > 0 ? allInboundHistory : replies;
      return pool.filter(
        (m) => m.status !== 'bounced' && !m.text?.startsWith('[DELIVERY FAILURE')
      );
    }
    if (viewTab === 'outbound') {
      return allRecentMessages.filter((m) => m.direction === 'outbound');
    }
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

  // Filter dataset by channel, date, and search query for Feed View
  const filteredMessages = useMemo(() => {
    let list = baseDataset;

    if (channelFilter !== 'all') {
      list = list.filter((m) => m.channel === channelFilter);
    }

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

  // Group all messages into conversation threads for Messenger View
  const allThreads = useMemo<ChatThread[]>(() => {
    const pool = allRecentMessages.length > 0 ? allRecentMessages : replies;
    const map = new Map<string, ChatThread>();

    for (const m of pool) {
      const key =
        m.lead_id ? `lead_${m.lead_id}` :
        m.client_id ? `client_${m.client_id}` :
        m.whatsapp ? `wa_${m.whatsapp.replace(/\D/g, '')}` :
        m.phone ? `ph_${m.phone.replace(/\D/g, '')}` :
        m.email ? `em_${m.email.toLowerCase().trim()}` :
        `msg_${m.id}`;

      const existing = map.get(key);
      const isUnread =
        m.direction === 'inbound' &&
        !m.is_read &&
        !m.is_replied &&
        m.status !== 'bounced' &&
        !m.text?.startsWith('[DELIVERY FAILURE');
      const hasAi = Boolean(m.ai_suggested_reply && !m.is_replied);
      const isBounce = m.status === 'bounced' || Boolean(m.text?.startsWith('[DELIVERY FAILURE'));

      if (!existing) {
        map.set(key, {
          key,
          entityId: m.lead_id || m.client_id || '',
          entityType: m.entity_type || (m.client_id ? 'client' : 'lead'),
          businessName: m.business_name || 'Contact',
          email: m.email,
          phone: m.phone,
          whatsapp: m.whatsapp,
          facebook: m.facebook,
          instagram: m.instagram,
          category: m.category,
          channel: m.channel,
          messages: [m],
          lastMessage: m,
          lastMessageAt: m.sent_at || '',
          unreadCount: isUnread ? 1 : 0,
          hasAiDraft: hasAi,
          hasBounced: isBounce,
        });
      } else {
        existing.messages.push(m);
        if ((!existing.businessName || existing.businessName === 'Contact') && m.business_name) {
          existing.businessName = m.business_name;
        }
        if (!existing.email && m.email) existing.email = m.email;
        if (!existing.phone && m.phone) existing.phone = m.phone;
        if (!existing.whatsapp && m.whatsapp) existing.whatsapp = m.whatsapp;
        if (!existing.category && m.category) existing.category = m.category;
        if (isUnread) existing.unreadCount += 1;
        if (hasAi) existing.hasAiDraft = true;
        if (isBounce) existing.hasBounced = true;
      }
    }

    const threadList = Array.from(map.values());
    for (const t of threadList) {
      t.messages.sort(
        (a, b) => new Date(a.sent_at || 0).getTime() - new Date(b.sent_at || 0).getTime()
      );
      t.lastMessage = t.messages[t.messages.length - 1];
      t.lastMessageAt = t.lastMessage.sent_at;
    }

    threadList.sort(
      (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
    );
    return threadList;
  }, [allRecentMessages, replies]);

  // Filter threads for Messenger sidebar
  const filteredThreads = useMemo(() => {
    let list = allThreads;

    if (viewTab === 'unread') {
      list = list.filter((t) => t.unreadCount > 0);
    } else if (viewTab === 'pending') {
      list = list.filter(
        (t) =>
          t.hasAiDraft ||
          replies.some((r) => r.lead_id === t.entityId || r.client_id === t.entityId)
      );
    } else if (viewTab === 'inbound') {
      list = list.filter((t) => t.messages.some((m) => m.direction === 'inbound'));
    } else if (viewTab === 'outbound') {
      list = list.filter((t) => t.messages.some((m) => m.direction === 'outbound'));
    }

    if (channelFilter !== 'all') {
      list = list.filter(
        (t) =>
          t.channel === channelFilter ||
          t.messages.some((m) => m.channel === channelFilter)
      );
    }

    if (dateFilter !== 'all') {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      list = list.filter((t) => {
        const time = new Date(t.lastMessageAt || Date.now()).getTime();
        if (dateFilter === 'today') return now - time <= oneDay;
        if (dateFilter === '7d') return now - time <= 7 * oneDay;
        if (dateFilter === '30d') return now - time <= 30 * oneDay;
        return true;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.businessName.toLowerCase().includes(q) ||
          t.email?.toLowerCase().includes(q) ||
          t.phone?.toLowerCase().includes(q) ||
          t.whatsapp?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          t.messages.some((m) => m.text?.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allThreads, viewTab, channelFilter, dateFilter, search, replies]);

  // Currently active thread in messenger view
  const activeThread = useMemo(() => {
    if (!selectedThreadKey) {
      return filteredThreads[0] || null;
    }
    return (
      allThreads.find((t) => t.key === selectedThreadKey) ||
      filteredThreads[0] ||
      null
    );
  }, [selectedThreadKey, filteredThreads, allThreads]);

  // Automatically select first thread if none selected
  useEffect(() => {
    if (!selectedThreadKey && filteredThreads.length > 0) {
      setSelectedThreadKey(filteredThreads[0].key);
    }
  }, [filteredThreads, selectedThreadKey]);

  // Set default composer channel whenever active thread changes
  useEffect(() => {
    if (activeThread) {
      const rawWa = (activeThread.whatsapp || activeThread.phone || '').replace(/\D/g, '');
      if (activeThread.channel === 'whatsapp' || rawWa.length >= 8) {
        setComposerChannel('whatsapp');
      } else if (activeThread.email) {
        setComposerChannel('email');
      } else {
        setComposerChannel(activeThread.channel || 'email');
      }
    }
  }, [activeThread?.key]);

  // Asynchronously fetch full historical messages for active thread
  useEffect(() => {
    if (!activeThread || !activeThread.entityId) return;
    const key = activeThread.key;
    if (threadHistoryMap[key]) return;

    let isMounted = true;
    const loadExtraHistory = async () => {
      try {
        let rawMsgs: ConversationMessage[] = [];
        if (activeThread.entityType === 'client') {
          rawMsgs = await api.getMessagesByClient(activeThread.entityId);
        } else {
          rawMsgs = await api.getMessagesByLead(activeThread.entityId);
        }
        if (!isMounted) return;
        const mapped = rawMsgs.map((m) => toThreadMessage(m, activeThread));
        setThreadHistoryMap((prev) => ({ ...prev, [key]: mapped }));
      } catch (err) {
        console.warn('Could not load extended thread history:', err);
      }
    };

    loadExtraHistory();
    return () => {
      isMounted = false;
    };
  }, [activeThread?.key, activeThread?.entityId, activeThread?.entityType, threadHistoryMap]);

  // Unified chronological message list for the active thread
  const activeThreadMessages = useMemo(() => {
    if (!activeThread) return [];
    const base = activeThread.messages;
    const extra = threadHistoryMap[activeThread.key] || [];
    const map = new Map<string, InboundReplyMessage>();
    for (const m of [...base, ...extra]) {
      map.set(m.id, m);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.sent_at || 0).getTime() - new Date(b.sent_at || 0).getTime()
    );
  }, [activeThread, threadHistoryMap]);

  // Auto-scroll chat area to bottom
  useEffect(() => {
    if (layoutMode === 'messenger' && activeThread) {
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [layoutMode, activeThread?.key, activeThreadMessages.length]);

  // Handlers
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
        prev.map((m) =>
          m.id === messageId ? { ...m, is_read: targetRead, read_at: readTimestamp } : m
        )
      );
      setAllInboundHistory((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, is_read: targetRead, read_at: readTimestamp } : m
        )
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
      setAllRecentMessages((prev) =>
        prev.filter((m) => m.lead_id !== leadId && m.client_id !== leadId)
      );
      setAllInboundHistory((prev) =>
        prev.filter((m) => m.lead_id !== leadId && m.client_id !== leadId)
      );
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      console.error('Failed to move lead to trash:', err);
      setActionFeedback(`Failed to move to trash: ${err?.message || 'Error'}`);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleClearAllUnmatched = async () => {
    if (!confirm(`Are you sure you want to dismiss all ${unmatchedEmails.length} unmatched notices?`)) {
      return;
    }
    try {
      await api.clearAllUnmatchedEmails();
      setUnmatchedEmails([]);
      setActionFeedback('All unmatched notices cleared successfully');
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to clear unmatched emails:', err);
    }
  };

  const handleDismissUnmatched = async (item: { id: string; senderEmail: string }) => {
    try {
      await api.dismissUnmatchedEmail(item.id);
      setUnmatchedEmails((prev) => prev.filter((u) => u.id !== item.id));
      setActionFeedback(`Dismissed notice from ${item.senderEmail}`);
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to dismiss unmatched item:', err);
    }
  };

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

  // Messenger Composer Send Handler
  const handleSendComposerReply = async () => {
    if (!activeThread || !composerText.trim() || isSendingReply) return;
    const textToSend = composerText.trim();
    setIsSendingReply(true);

    try {
      const res = await api.sendReply({
        leadId: activeThread.entityType === 'lead' && activeThread.entityId ? activeThread.entityId : undefined,
        clientId: activeThread.entityType === 'client' && activeThread.entityId ? activeThread.entityId : undefined,
        channel: composerChannel,
        text: textToSend,
      });

      if (res.success) {
        setComposerText('');
        setActionFeedback(`Sent via ${composerChannel.toUpperCase()} to ${activeThread.businessName}!`);

        // Optimistically add to messages
        const optimisticMsg: InboundReplyMessage = {
          id: `opt_${Date.now()}`,
          conversation_id: activeThread.messages[0]?.conversation_id || `conv_${Date.now()}`,
          channel: composerChannel,
          direction: 'outbound',
          text: textToSend,
          sent_at: new Date().toISOString(),
          status: 'delivered',
          entity_type: activeThread.entityType,
          lead_id: activeThread.entityType === 'lead' ? activeThread.entityId : null,
          client_id: activeThread.entityType === 'client' ? activeThread.entityId : null,
          business_name: activeThread.businessName,
          email: activeThread.email || '',
          phone: activeThread.phone || '',
          whatsapp: activeThread.whatsapp || '',
          category: activeThread.category || '',
        };

        setAllRecentMessages((prev) => [optimisticMsg, ...prev]);
        setThreadHistoryMap((prev) => ({
          ...prev,
          [activeThread.key]: [...(prev[activeThread.key] || activeThread.messages), optimisticMsg],
        }));

        setTimeout(() => setActionFeedback(null), 3500);
        fetchRecentMessages();
      } else {
        setActionFeedback(`Send failed: ${res.message || 'Error'}`);
      }
    } catch (err: any) {
      setActionFeedback(`Send error: ${err.message || 'Failed to dispatch'}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Generate AI Draft for composer
  const handleGenerateAiReply = async () => {
    if (!activeThread || isGeneratingAi) return;
    setIsGeneratingAi(true);
    try {
      const res = await api.generateAiDraft({
        businessName: activeThread.businessName,
        category: activeThread.category,
        channel: composerChannel,
        intent: activeThread.lastMessage?.inbound_intent || 'consultative_reply',
      });
      if (res.draft) {
        setComposerText(res.draft);
        setActionFeedback('✨ AI consultative reply generated!');
        setTimeout(() => setActionFeedback(null), 3000);
      }
    } catch (err: any) {
      console.error('Failed to generate AI reply:', err);
      setActionFeedback('Failed to generate AI draft. Please type directly.');
      setTimeout(() => setActionFeedback(null), 3000);
    } finally {
      setIsGeneratingAi(false);
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
    <Modal open={isOpen} onClose={onClose} title="" maxWidth="max-w-7xl w-full">
      <div className="flex flex-col -mt-1 h-full">
        {/* Top Header: Title, Status, View Switcher & Sync */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-purple-600 text-white shadow-sm">
              <Layers size={22} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Multi-Channel Messages &amp; Inbox</h2>
                <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-xs font-extrabold text-brand-700">
                  WA • Email • FB • IG
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Interactive real-time messenger with verified channel attribution and instant 1-click replies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle Switcher: Messenger View vs Card Feed View */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setLayoutMode('messenger')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  layoutMode === 'messenger'
                    ? 'bg-white text-brand-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to modern messaging app layout"
              >
                <MessageSquare size={13} className="text-brand-600" />
                <span>💬 Messenger View</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('feed')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  layoutMode === 'feed'
                    ? 'bg-white text-brand-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to classic card feed list"
              >
                <Layers size={13} className="text-slate-600" />
                <span>📋 Feed View</span>
              </button>
            </div>

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

            {/* Sync Inboxes button */}
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-60 shadow-2xs cursor-pointer"
              title="Check connected inboxes for new client replies"
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Inboxes'}</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {syncFeedback && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-medium text-blue-800 animate-fadeIn">
            <RefreshCw size={14} className="text-blue-600" />
            <span>{syncFeedback}</span>
          </div>
        )}
        {actionFeedback && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-800 animate-fadeIn">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LAYOUT 1: MODERN MESSAGING APP VIEW (DEFAULT)                            */}
        {/* ========================================================================= */}
        {layoutMode === 'messenger' && viewTab !== 'unmatched' ? (
          <div className="mt-3 flex flex-col md:flex-row h-[74vh] rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {/* ----------------- LEFT PANE: THREADS SIDEBAR ----------------- */}
            <div className="w-full md:w-80 lg:w-96 flex flex-col border-r border-slate-200 bg-slate-50/60 shrink-0">
              {/* Sidebar Header: Search & View Tabs */}
              <div className="p-3 border-b border-slate-200 space-y-2.5 bg-white">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search chats, leads, phone, email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-inner"
                  />
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewTab('recent')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      viewTab === 'recent'
                        ? 'bg-brand-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    All ({allThreads.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewTab('unread')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      viewTab === 'unread'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <span>Unread</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[9px] font-extrabold ${
                        unreadCount > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {unreadCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewTab('pending')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      viewTab === 'pending'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    Needs Attention ({replies.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewTab('outbound')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      viewTab === 'outbound'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Sent
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewTab('unmatched')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                      (viewTab as string) === 'unmatched'
                        ? 'bg-rose-700 text-white shadow-2xs'
                        : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    <AlertTriangle size={11} />
                    <span>Bounces ({unmatchedEmails.length})</span>
                  </button>
                </div>

                {/* Channel Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pt-0.5">
                  <button
                    type="button"
                    onClick={() => setChannelFilter('all')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                      channelFilter === 'all'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelFilter('whatsapp')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                      channelFilter === 'whatsapp'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <MessageCircle size={10} />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelFilter('email')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                      channelFilter === 'email'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    <Mail size={10} />
                    <span>Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelFilter('linkedin')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                      channelFilter === 'linkedin'
                        ? 'bg-[#0a66c2] text-white border-[#0a66c2]'
                        : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                    }`}
                  >
                    <Linkedin size={10} />
                    <span>LinkedIn</span>
                  </button>
                </div>
              </div>

              {/* Thread List Items */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {isLoading ? (
                  <div className="p-8 text-center text-slate-400">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-brand-600" />
                    <p className="text-xs font-semibold">Loading conversation threads...</p>
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <Inbox size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-bold text-slate-600">No chats found</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try clearing filters or search query</p>
                  </div>
                ) : (
                  filteredThreads.map((thread) => {
                    const isSelected = activeThread?.key === thread.key;
                    const isOutboundLast = thread.lastMessage.direction === 'outbound';
                    const ch = thread.channel;

                    return (
                      <button
                        key={thread.key}
                        type="button"
                        onClick={() => setSelectedThreadKey(thread.key)}
                        className={`w-full text-left p-3 flex items-start gap-3 transition-colors relative cursor-pointer ${
                          isSelected
                            ? 'bg-brand-50/90 border-l-4 border-brand-600'
                            : thread.unreadCount > 0
                            ? 'bg-rose-50/30 hover:bg-rose-50/60'
                            : 'hover:bg-slate-100/70'
                        }`}
                      >
                        {/* Contact Avatar with Channel icon corner badge */}
                        <div className="relative shrink-0">
                          <div
                            className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs shadow-2xs ${
                              ch === 'whatsapp'
                                ? 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white'
                                : ch === 'email'
                                ? 'bg-gradient-to-tr from-blue-500 to-indigo-600 text-white'
                                : ch === 'linkedin'
                                ? 'bg-gradient-to-tr from-sky-600 to-blue-700 text-white'
                                : 'bg-gradient-to-tr from-purple-500 to-pink-600 text-white'
                            }`}
                          >
                            {getInitials(thread.businessName)}
                          </div>
                          {/* Corner Channel Icon */}
                          <div
                            className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-white ring-2 ring-white text-[9px] ${
                              ch === 'whatsapp'
                                ? 'bg-emerald-600'
                                : ch === 'email'
                                ? 'bg-blue-600'
                                : ch === 'linkedin'
                                ? 'bg-[#0a66c2]'
                                : 'bg-pink-600'
                            }`}
                          >
                            {ch === 'whatsapp' && <MessageCircle size={9} />}
                            {ch === 'email' && <Mail size={9} />}
                            {ch === 'linkedin' && <Linkedin size={9} />}
                            {ch === 'instagram' && <Instagram size={9} />}
                          </div>
                        </div>

                        {/* Thread Preview Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <h4
                              className={`text-xs font-bold truncate ${
                                isSelected ? 'text-brand-950' : 'text-slate-900'
                              }`}
                            >
                              {thread.businessName}
                            </h4>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                              {formatThreadDate(thread.lastMessageAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-full ${
                                ch === 'whatsapp'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ch === 'email'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {ch}
                            </span>
                            {thread.category && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                {thread.category}
                              </span>
                            )}
                          </div>

                          {/* Last message snippet */}
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`text-xs truncate flex items-center gap-1 ${
                                thread.unreadCount > 0
                                  ? 'font-bold text-slate-900'
                                  : 'text-slate-500 font-normal'
                              }`}
                            >
                              {isOutboundLast && (
                                <CheckCheck size={12} className="text-brand-600 shrink-0" />
                              )}
                              <span className="truncate">
                                {thread.lastMessage.text || 'No message content'}
                              </span>
                            </p>

                            {/* Unread Pill or AI Draft Badge */}
                            {thread.unreadCount > 0 ? (
                              <span className="shrink-0 h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow-2xs">
                                {thread.unreadCount}
                              </span>
                            ) : thread.hasAiDraft ? (
                              <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700">
                                <Sparkles size={8} /> AI
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* ----------------- RIGHT PANE: CHAT MESSAGING APP WINDOW ----------------- */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
              {activeThread ? (
                <>
                  {/* Chat Top Header: Contact identity, channel deep links & profile action */}
                  <div className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3 shadow-2xs shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-2xs ${
                          activeThread.channel === 'whatsapp'
                            ? 'bg-gradient-to-tr from-emerald-500 to-teal-600'
                            : 'bg-gradient-to-tr from-brand-600 to-indigo-600'
                        }`}
                      >
                        {getInitials(activeThread.businessName)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {activeThread.businessName}
                          </h3>
                          {activeThread.category && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {activeThread.category}
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              activeThread.channel === 'whatsapp'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {activeThread.channel}
                          </span>
                        </div>

                        {/* Contact details line */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 truncate">
                          {(activeThread.whatsapp || activeThread.phone) && (
                            <span className="flex items-center gap-1 font-mono text-emerald-700">
                              <Phone size={11} className="text-emerald-600" />
                              {activeThread.whatsapp || activeThread.phone}
                            </span>
                          )}
                          {activeThread.email && (
                            <span className="flex items-center gap-1 font-mono text-blue-700">
                              <Mail size={11} className="text-blue-600" />
                              {activeThread.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chat Action Shortcuts */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Deep links */}
                      {(activeThread.whatsapp || activeThread.phone) && (
                        <a
                          href={`https://wa.me/${(activeThread.whatsapp || activeThread.phone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1 text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 shadow-2xs"
                          title="Open WhatsApp web chat"
                        >
                          <ExternalLink size={12} />
                          <span>wa.me</span>
                        </a>
                      )}

                      {/* Open Profile Button */}
                      {onOpenProfile && activeThread.entityId && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenProfile(activeThread.entityId, activeThread.entityType);
                            onClose();
                          }}
                          className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1 text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 shadow-2xs cursor-pointer"
                          title="Open full contact CRM profile"
                        >
                          <User size={12} className="text-indigo-600" />
                          <span>Profile ↗</span>
                        </button>
                      )}

                      {/* Move to Trash */}
                      {activeThread.entityId && (
                        <button
                          type="button"
                          onClick={() => handleMoveLeadToTrash(activeThread.entityId, activeThread.businessName)}
                          className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 shadow-2xs cursor-pointer"
                          title="Move lead to Trash"
                        >
                          <Trash2 size={12} className="text-rose-600" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chat Message Stream Viewport */}
                  <div
                    ref={chatScrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70"
                    style={{
                      backgroundImage: 'radial-gradient(#cbd5e1 0.75px, transparent 0.75px)',
                      backgroundSize: '16px 16px',
                    }}
                  >
                    {activeThreadMessages.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <MessageSquare size={28} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-xs font-semibold">No messages in this conversation yet</p>
                      </div>
                    ) : (
                      activeThreadMessages.map((msg, index) => {
                        const isInbound = msg.direction === 'inbound';
                        const isBounce = msg.status === 'bounced' || msg.text?.startsWith('[DELIVERY FAILURE');
                        const isRead = Boolean(msg.is_read);
                        const isReplied = Boolean(msg.is_replied);

                        // Date divider calculation
                        const prevMsg = activeThreadMessages[index - 1];
                        const showDateDivider =
                          !prevMsg ||
                          new Date(prevMsg.sent_at || 0).toDateString() !==
                            new Date(msg.sent_at || 0).toDateString();

                        return (
                          <div key={msg.id} className="space-y-2">
                            {/* Sticky Date Divider */}
                            {showDateDivider && (
                              <div className="flex justify-center my-3">
                                <span className="rounded-full bg-slate-200/90 backdrop-blur-sm px-3 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs border border-slate-300/60">
                                  {formatChatDateDivider(msg.sent_at)}
                                </span>
                              </div>
                            )}

                            {/* Message Bubble Container */}
                            <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
                              <div
                                className={`group relative max-w-[82%] rounded-2xl p-3.5 shadow-2xs transition-all ${
                                  isInbound
                                    ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-xs'
                                    : msg.channel === 'whatsapp'
                                    ? 'bg-[#dcf8c6] text-emerald-950 border border-emerald-300/70 rounded-tr-xs'
                                    : 'bg-[#eef2ff] text-indigo-950 border border-indigo-200 rounded-tr-xs'
                                }`}
                              >
                                {/* Header inside Bubble: Source attribution or Channel badge */}
                                <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-black/5 text-[10px]">
                                  {isInbound ? (
                                    <div className="flex items-center gap-1.5 flex-wrap font-semibold">
                                      <span className="flex items-center gap-1 font-bold text-slate-800">
                                        {msg.channel === 'whatsapp' ? (
                                          <MessageCircle size={11} className="text-emerald-600" />
                                        ) : (
                                          <Mail size={11} className="text-blue-600" />
                                        )}
                                        <span>
                                          {msg.channel === 'whatsapp' ? 'WhatsApp Direct' : 'Email Reply'}
                                        </span>
                                      </span>
                                      <span className="text-slate-400">•</span>
                                      <span className="text-slate-600 font-mono text-[10px]">
                                        {msg.inbox_email || msg.phone || activeThread.businessName}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700">
                                      <span>
                                        {msg.channel === 'whatsapp'
                                          ? '📤 Outbound via WhatsApp Direct'
                                          : '📤 Outbound via Gmail'}
                                      </span>
                                    </div>
                                  )}

                                  {/* AI Intent Badge on Inbound */}
                                  {msg.inbound_intent && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                        msg.inbound_intent === 'meeting_request'
                                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                          : msg.inbound_intent === 'interested'
                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                          : 'bg-blue-100 text-blue-900'
                                      }`}
                                    >
                                      <Zap size={9} />
                                      {msg.inbound_intent === 'meeting_request'
                                        ? 'Meeting'
                                        : msg.inbound_intent === 'interested'
                                        ? 'Interested'
                                        : msg.inbound_intent}
                                    </span>
                                  )}
                                </div>

                                {/* Message Content */}
                                <p className="text-xs leading-relaxed whitespace-pre-wrap font-normal select-text">
                                  {msg.text}
                                </p>

                                {/* SEO Audit Attachment pill / download card if attached or mentioned */}
                                {(() => {
                                  // 1. Check metadata attachments
                                  const rawAttachments = (msg as any).metadata?.attachments;
                                  const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];

                                  // 2. Check if text mentions a PDF filename (e.g. Technical_Audit_*.pdf or anything.pdf)
                                  const pdfMatch = msg.text?.match(/([a-zA-Z0-9_\-.]+\.pdf)/i);
                                  const pdfNameFromText = pdfMatch ? pdfMatch[1] : null;

                                  const displayAttachments = attachments.length > 0
                                    ? attachments
                                    : pdfNameFromText
                                    ? [{ filename: pdfNameFromText }]
                                    : [];

                                  if (displayAttachments.length === 0) return null;

                                  return (
                                    <div className="mt-2 space-y-1.5">
                                      {displayAttachments.map((att: any, idx: number) => {
                                        const fname = att.filename || 'Technical_Audit_Report.pdf';
                                        const downloadUrl = `/api/audit/download/${encodeURIComponent(fname)}`;
                                        return (
                                          <a
                                            key={idx}
                                            href={downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 rounded-lg bg-white/95 border border-slate-200/90 p-2 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 transition-colors group cursor-pointer"
                                          >
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-50 text-rose-600 border border-rose-100 group-hover:scale-105 transition-transform">
                                              <FileText size={16} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate font-bold text-slate-800 text-[11px] group-hover:text-blue-600 transition-colors">
                                                {fname}
                                              </p>
                                              <p className="text-[10px] text-slate-500 font-normal">
                                                Technical Audit PDF • Click to view / download
                                              </p>
                                            </div>
                                            <Download size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors mr-1" />
                                          </a>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}

                                {/* Bubble Footer: Timestamp & delivery checkmarks */}
                                <div className="mt-1.5 flex items-center justify-between gap-3 pt-1 text-[10px] text-slate-500">
                                  <div className="flex items-center gap-2">
                                    {isInbound && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRead(msg.id, !isRead)}
                                        className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                      >
                                        {isRead ? <EyeOff size={10} /> : <CheckCircle2 size={10} />}
                                        <span>{isRead ? 'Mark unread' : 'Mark read'}</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 ml-auto">
                                    <span>{formatChatTime(msg.sent_at)}</span>
                                    {!isInbound && (
                                      <CheckCheck size={13} className="text-emerald-700 inline" />
                                    )}
                                  </div>
                                </div>

                                {/* Embedded AI Autonomous Consultative Draft Box (if present on inbound) */}
                                {msg.ai_suggested_reply && isInbound && !isReplied && (
                                  <div className="mt-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-purple-50/50 to-pink-50/40 p-3 shadow-2xs space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                                        <Sparkles size={13} className="text-indigo-600" />
                                        <span>AI Autonomous Consultative Draft</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingDraftId(editingDraftId === msg.id ? null : msg.id)
                                        }
                                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                      >
                                        <Edit3 size={11} />
                                        <span>{editingDraftId === msg.id ? 'Done' : 'Edit'}</span>
                                      </button>
                                    </div>

                                    {editingDraftId === msg.id ? (
                                      <textarea
                                        value={draftOverrides[msg.id] ?? msg.ai_suggested_reply}
                                        onChange={(e) =>
                                          setDraftOverrides((prev) => ({
                                            ...prev,
                                            [msg.id]: e.target.value,
                                          }))
                                        }
                                        rows={3}
                                        className="w-full rounded-lg border border-indigo-300 bg-white p-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner"
                                      />
                                    ) : (
                                      <p className="text-xs text-slate-800 leading-relaxed italic bg-white/90 p-2 rounded-lg border border-indigo-100">
                                        "{draftOverrides[msg.id] ?? msg.ai_suggested_reply}"
                                      </p>
                                    )}

                                    <div className="flex items-center justify-end">
                                      <button
                                        type="button"
                                        disabled={approvingReplyId === msg.id}
                                        onClick={() => handleApproveAndSend(msg)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
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
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* ----------------- CHAT COMPOSER DOCK (BOTTOM) ----------------- */}
                  <div className="border-t border-slate-200 bg-white p-3 space-y-2 shrink-0">
                    {/* Channel Selector Pills & AI Draft Generator */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500">Send via:</span>

                        {/* WhatsApp pill */}
                        <button
                          type="button"
                          onClick={() => setComposerChannel('whatsapp')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            composerChannel === 'whatsapp'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-emerald-50'
                          }`}
                        >
                          <MessageCircle size={12} />
                          <span>WhatsApp</span>
                        </button>

                        {/* Email pill */}
                        <button
                          type="button"
                          onClick={() => setComposerChannel('email')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            composerChannel === 'email'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
                          }`}
                        >
                          <Mail size={12} />
                          <span>Email</span>
                        </button>

                        {/* LinkedIn pill */}
                        <button
                          type="button"
                          onClick={() => setComposerChannel('linkedin')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            composerChannel === 'linkedin'
                              ? 'bg-[#0a66c2] text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-sky-50'
                          }`}
                        >
                          <Linkedin size={12} />
                          <span>LinkedIn</span>
                        </button>
                      </div>

                      {/* Quick AI consultative reply generator button */}
                      <button
                        type="button"
                        onClick={handleGenerateAiReply}
                        disabled={isGeneratingAi}
                        className="btn-secondary py-1 px-2.5 text-xs font-bold flex items-center gap-1.5 text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition shadow-2xs cursor-pointer"
                        title="Auto-draft an intelligent consultative response"
                      >
                        <Sparkles size={12} className={isGeneratingAi ? 'animate-spin text-indigo-600' : 'text-indigo-600'} />
                        <span>{isGeneratingAi ? 'Drafting...' : '✨ AI Auto-Reply'}</span>
                      </button>
                    </div>

                    {/* Chat Text Input and Send Button */}
                    <div className="flex items-end gap-2">
                      <div className="relative flex-1">
                        <textarea
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendComposerReply();
                            }
                          }}
                          placeholder={`Type a message to ${activeThread.businessName}... (Press Enter to send, Shift+Enter for new line)`}
                          rows={2}
                          className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-inner resize-none font-sans"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={!composerText.trim() || isSendingReply}
                        onClick={handleSendComposerReply}
                        className="h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                      >
                        {isSendingReply ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={14} />
                            <span>Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <MessageSquare size={48} className="text-slate-300 mb-3" />
                  <h3 className="text-sm font-bold text-slate-700">Select a Conversation</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Choose a contact from the list on the left to start messaging in real-time across WhatsApp, Email, or LinkedIn.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ========================================================================= */}
        {/* LAYOUT 2: UNMATCHED EMAILS & BOUNCES VIEW                                */}
        {/* ========================================================================= */}
        {viewTab === 'unmatched' && (
          <div className="mt-3 space-y-3 max-h-[64vh] overflow-y-auto pr-1">
            {filteredUnmatched.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm font-bold text-slate-700">No Unmatched or Bounced Emails</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  All inbound emails and delivery status notifications have been automatically matched to registered contacts in your CRM!
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3 mb-1">
                  <div className="text-xs text-slate-600 font-medium">
                    Showing <strong className="text-slate-900">{filteredUnmatched.length}</strong> unmatched notice(s)
                  </div>
                  {unmatchedEmails.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllUnmatched}
                      className="btn-secondary py-1 px-3 text-xs font-bold text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                      title="Clear and dismiss all unmatched notifications permanently"
                    >
                      <Trash2 size={12} className="text-rose-600" />
                      <span>Dismiss All ({unmatchedEmails.length})</span>
                    </button>
                  )}
                </div>

                {filteredUnmatched.map((item) => (
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
                        onClick={() => handleDismissUnmatched(item)}
                        className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                        title="Dismiss delivery notification"
                      >
                        <Trash2 size={12} className="text-rose-600" />
                        <span>Dismiss / Trash</span>
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* LAYOUT 3: CLASSIC CARD FEED VIEW (PRESERVED)                             */}
        {/* ========================================================================= */}
        {layoutMode === 'feed' && viewTab !== 'unmatched' && (
          <div className="space-y-3.5 mt-2">
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
              </div>

              {/* Quick Search & Date Filter */}
              <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md ml-auto">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs text-slate-700 font-medium focus:border-brand-500 focus:outline-none shadow-2xs shrink-0"
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

            {/* Messages Feed Stream */}
            <div className="max-h-[58vh] overflow-y-auto space-y-3 pr-1">
              {isLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-brand-600" />
                  <p className="text-xs font-semibold">Loading messages across all channels...</p>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                  <Inbox size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-700">No messages found</p>
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const targetId = msg.client_id || msg.lead_id || '';
                  const entityType = msg.entity_type || (msg.client_id ? 'client' : 'lead');
                  const isReplied = Boolean(msg.is_replied);
                  const isInbound = msg.direction === 'inbound';
                  const isRead = Boolean(msg.is_read);
                  const channel = msg.channel || 'email';
                  const isBounce = msg.status === 'bounced' || msg.text?.startsWith('[DELIVERY FAILURE');
                  const rawPhone = (msg.whatsapp || msg.phone || '').trim();
                  const cleanWaNumber = rawPhone.replace(/\D/g, '');

                  return (
                    <div
                      key={msg.id}
                      className={`group relative rounded-xl border p-3.5 shadow-2xs transition-all hover:shadow-md ${
                        isBounce
                          ? 'border-rose-200 bg-rose-50/30'
                          : isInbound && !isRead && !isReplied
                          ? 'border-rose-300 bg-rose-50/20 ring-1 ring-rose-400/30'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                              isBounce
                                ? 'bg-rose-100 text-rose-700 border-rose-300'
                                : channel === 'whatsapp'
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                : channel === 'email'
                                ? 'bg-blue-50 text-blue-600 border-blue-200'
                                : 'bg-pink-50 text-pink-600 border-pink-200'
                            }`}
                          >
                            {channel === 'whatsapp' && <MessageCircle size={18} />}
                            {channel === 'email' && <Mail size={18} />}
                            {channel === 'facebook' && <Facebook size={18} />}
                            {channel === 'instagram' && <Instagram size={18} />}
                            {channel === 'linkedin' && <Linkedin size={18} />}
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
                                  className="text-sm font-bold text-slate-900 hover:text-brand-600 hover:underline truncate text-left flex items-center gap-1.5 cursor-pointer"
                                >
                                  <span>{msg.business_name || 'Contact'}</span>
                                  <span className="text-[10px] text-brand-600 font-semibold bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
                                    Profile ↗
                                  </span>
                                </button>
                              ) : (
                                <h4 className="text-sm font-bold text-slate-900 truncate">
                                  {msg.business_name || 'Contact'}
                                </h4>
                              )}

                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  channel === 'whatsapp'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {channel}
                              </span>

                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  isInbound
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {isInbound ? '📥 Inbound' : '📤 Outbound'}
                              </span>

                              {isInbound && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleRead(msg.id, !isRead)}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold border transition ${
                                    !isRead
                                      ? 'bg-rose-500 text-white border-rose-500 animate-pulse'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {isRead ? 'Read' : 'UNREAD'}
                                </button>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                              {rawPhone && <span className="font-mono">{rawPhone}</span>}
                              {msg.email && <span className="font-mono">{msg.email}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                          <Clock size={12} />
                          <span>{formatDate(msg.sent_at)}</span>
                        </div>
                      </div>

                      <div className="mt-2.5 rounded-lg bg-slate-50 p-2.5 border border-slate-200/80">
                        <p className="text-xs text-slate-800 whitespace-pre-wrap">{msg.text}</p>
                      </div>

                      {/* Card Action Toolbar */}
                      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                        <span className="text-[11px] text-slate-500">
                          {isInbound ? 'Inbound Reply' : 'Outbound Outreach'}
                        </span>

                        <div className="flex items-center gap-2">
                          {cleanWaNumber && (
                            <a
                              href={`https://wa.me/${cleanWaNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-emerald-700 bg-emerald-50 border-emerald-200"
                            >
                              <ExternalLink size={12} />
                              <span>wa.me</span>
                            </a>
                          )}
                          {targetId && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenConversation(targetId, entityType as 'lead' | 'client');
                                onClose();
                              }}
                              className="btn-primary py-1 px-3 text-xs font-bold flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white border-0 shadow-2xs"
                            >
                              <Sparkles size={12} />
                              <span>Open Thread &amp; Reply</span>
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer info bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
          <p className="text-[11px] text-slate-500">
            {layoutMode === 'messenger' ? (
              <>
                💬 <strong>{allThreads.length} active threads</strong> • {unreadCount} unread • Multi-channel real-time messaging
              </>
            ) : (
              <>
                Showing <strong>{filteredMessages.length}</strong> message(s) •{' '}
                {channelFilter === 'all' ? 'All Channels' : channelFilter.toUpperCase()}
              </>
            )}
          </p>
          <button
            onClick={onClose}
            className="btn-secondary py-1.5 px-4 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
