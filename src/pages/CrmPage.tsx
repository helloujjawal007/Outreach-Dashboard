import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Mail,
  MessageCircle,
  Instagram,
  UserCheck,
  UserX,
  Search,
  ArrowLeft,
  Send,
  Filter,
  AlertCircle,
  CheckCircle2,
  Trash2,
  FolderPlus,
  Bookmark,
  Plus,
  X,
  ListFilter,
  Layers,
  Zap,
  Edit3,
  Clock,
  RotateCcw,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { ChannelIcon } from '@/components/ChannelIcon';
import { Modal } from '@/components/Modal';
import { InboundRepliesModal } from '@/components/InboundRepliesModal';
import type { Store } from '@/store';
import type { Lead, ConsentStatus, Channel, AutoSendNextResult } from '@/types';
import { channelLabels, consentLabels } from '@/types';
import { api, type WhatsAppWindowStatus } from '@/services/api';

interface Props {
  store: Store;
  autoOpenContact?: { id: string; entityType: 'lead' | 'client' } | null;
  onClearAutoOpenContact?: () => void;
}

type EntityTypeFilter = 'all' | 'lead' | 'client' | 'inbound' | 'trash';
type ChannelFilter = 'all' | Channel;
type StatusFilter = 'all' | 'active' | 'inactive';

export function CrmPage({ store, autoOpenContact, onClearAutoOpenContact }: Props) {
  const [entityFilter, setEntityFilter] = useState<EntityTypeFilter>('all');
  const [isInboundInboxOpen, setIsInboundInboxOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [consentFilter, setConsentFilter] = useState<ConsentStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyChannel, setReplyChannel] = useState<Channel>('email');
  const [waWindow, setWaWindow] = useState<WhatsAppWindowStatus | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lists & Batches management state
  const [isManageListsOpen, setIsManageListsOpen] = useState(false);
  const [isAddToListOpen, setIsAddToListOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [bulkActionSuccess, setBulkActionSuccess] = useState<string | null>(null);

  // 28-day Deletion History / Trash state
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Client Info Edit state
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [clientEditForm, setClientEditForm] = useState({
    businessName: '',
    primaryContactName: '',
    category: '',
    phone: '',
    email: '',
    instagram: '',
    facebook: '',
    whatsapp: '',
    status: 'active' as 'active' | 'paused' | 'churned',
    contractValue: 1500,
    notes: '',
  });

  // Condition-Based Stage Outreach state
  const [isAutoSending, setIsAutoSending] = useState(false);
  const [isBatchShooting, setIsBatchShooting] = useState(false);
  const [leadStageInfo, setLeadStageInfo] = useState<{
    stage: string;
    stageLabel: string;
    nextStepLabel: string;
    sentCount: number;
    subject: string;
    body: string;
  } | null>(null);
  const [autoSendModalResult, setAutoSendModalResult] = useState<{
    batchName?: string;
    totalProcessed?: number;
    sentCount?: number;
    skippedCount?: number;
    failedCount?: number;
    breakdown?: { initial: number; followup_1: number; followup_2: number };
    results?: AutoSendNextResult[];
  } | null>(null);

  // Inbound Gmail IMAP Sync state & handler
  const [isSyncingInbox, setIsSyncingInbox] = useState(false);

  const handleSyncInbox = useCallback(async () => {
    try {
      setIsSyncingInbox(true);
      const res = await store.syncEmailReplies();
      if (selectedLead) {
        await store.fetchConversationsForEntity(selectedLead.id, selectedLead.entityType === 'client');
        if (selectedLead.entityType === 'lead') {
          api.getLeadStage(selectedLead.id)
            .then((st) => setLeadStageInfo(st))
            .catch(() => {});
        }
      }
      if (res.syncedCount > 0) {
        const senders = res.newReplies.map((r) => r.senderEmail).join(', ');
        setBulkActionSuccess(
          `Synced ${res.syncedCount} new email reply from Gmail inbox: ${senders}`
        );
        setTimeout(() => setBulkActionSuccess(null), 6000);
      } else {
        setBulkActionSuccess('Gmail inbox is up to date (no new unread replies).');
        setTimeout(() => setBulkActionSuccess(null), 3500);
      }
    } catch (err) {
      console.error('Failed to sync inbox:', err);
    } finally {
      setIsSyncingInbox(false);
    }
  }, [store, selectedLead]);

  const inboundContactCount = useMemo(() => {
    const replyEntityIds = new Set(
      store.inboundReplies.map((r) => r.client_id || r.lead_id).filter(Boolean)
    );
    return store.leads.filter((l) => replyEntityIds.has(l.id) || l.consentStatus === 'replied').length;
  }, [store.inboundReplies, store.leads]);

  const filtered = useMemo(() => {
    if (entityFilter === 'trash') {
      return store.trashLeads.filter((l) => {
        if (channelFilter !== 'all') {
          if (channelFilter === 'email' && !l.email) return false;
          if (channelFilter === 'whatsapp' && !l.whatsapp) return false;
          if (channelFilter === 'instagram' && !l.instagram && !l.facebook) return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          if (
            !l.businessName.toLowerCase().includes(q) &&
            !l.category.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.phone.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      });
    }

    if (entityFilter === 'inbound') {
      const replyEntityIds = new Set(
        store.inboundReplies.map((r) => r.client_id || r.lead_id).filter(Boolean)
      );
      return store.leads.filter((l) => {
        const hasReply = replyEntityIds.has(l.id) || l.consentStatus === 'replied';
        if (!hasReply) return false;
        if (statusFilter !== 'all') {
          const s = l.status || 'active';
          if (statusFilter === 'active' && s !== 'active') return false;
          if (statusFilter === 'inactive' && s !== 'inactive' && s !== 'paused') return false;
        }
        if (channelFilter !== 'all') {
          if (channelFilter === 'email' && !l.email) return false;
          if (channelFilter === 'whatsapp' && !l.whatsapp) return false;
          if (channelFilter === 'instagram' && !l.instagram && !l.facebook) return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          if (
            !l.businessName.toLowerCase().includes(q) &&
            !l.category.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.phone.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      });
    }

    return store.leads.filter((l) => {
      if (entityFilter !== 'all' && l.entityType !== entityFilter) return false;
      if (statusFilter !== 'all') {
        const s = l.status || 'active';
        if (statusFilter === 'active' && s !== 'active') return false;
        if (statusFilter === 'inactive' && s !== 'inactive' && s !== 'paused') return false;
      }
      if (consentFilter !== 'all' && l.consentStatus !== consentFilter) return false;
      if (selectedBatchFilter !== 'all' && l.batchId !== selectedBatchFilter) return false;
      if (channelFilter !== 'all') {
        if (channelFilter === 'email' && !l.email) return false;
        if (channelFilter === 'whatsapp' && !l.whatsapp) return false;
        if (channelFilter === 'instagram' && !l.instagram && !l.facebook) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.businessName.toLowerCase().includes(q) &&
          !l.category.toLowerCase().includes(q) &&
          !l.email.toLowerCase().includes(q) &&
          !l.phone.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [store.leads, store.trashLeads, store.inboundReplies, entityFilter, statusFilter, consentFilter, selectedBatchFilter, channelFilter, search]);

  const leadConversations = useMemo(() => {
    if (!selectedLead) return [];
    return store.conversationsByLead(selectedLead.id);
  }, [selectedLead, store]);

  // Dynamically load conversation messages and stage info when modal opens
  const handleOpenLead = useCallback(
    async (lead: Lead) => {
      setSelectedLead(lead);
      setReplyText('');
      setSendFeedback(null);
      setConversionMessage(null);
      setReplyChannel(lead.email ? 'email' : lead.whatsapp ? 'whatsapp' : 'instagram');
      await store.fetchConversationsForEntity(lead.id, lead.entityType === 'client');
      try {
        const win = await api.getWhatsAppWindowStatus(lead.id, lead.entityType === 'client');
        setWaWindow(win);
      } catch (err) {
        console.error('Failed to get WhatsApp window:', err);
        setWaWindow(null);
      }

      if (lead.entityType === 'lead') {
        api.getLeadStage(lead.id)
          .then((stage) => setLeadStageInfo(stage))
          .catch((err) => {
            console.error('Failed to inspect lead stage:', err);
            setLeadStageInfo(null);
          });
      } else {
        setLeadStageInfo(null);
      }
    },
    [store]
  );

  const handleOpenEntityById = useCallback(
    async (entityId: string, entityType?: 'lead' | 'client') => {
      let target = store.leads.find((l) => l.id === entityId);
      if (!target) {
        try {
          if (entityType === 'client') {
            const clients = await api.getClients();
            target = clients.find((c) => c.id === entityId);
          } else {
            const leads = await api.getLeads();
            target = leads.find((l) => l.id === entityId);
          }
        } catch {
          // ignore
        }
      }
      if (target) {
        handleOpenLead(target);
      }
    },
    [store.leads, handleOpenLead]
  );

  useEffect(() => {
    if (autoOpenContact?.id) {
      handleOpenEntityById(autoOpenContact.id, autoOpenContact.entityType);
      onClearAutoOpenContact?.();
    }
  }, [autoOpenContact, handleOpenEntityById, onClearAutoOpenContact]);

  // Selection logic
  const isAllSelected = useMemo(() => {
    return filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));
  }, [filtered, selectedIds]);

  const handleToggleSelectLead = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  }, [isAllSelected, filtered]);

  const handleListFilterChange = useCallback((listId: string) => {
    setSelectedListFilter(listId);
    store.refreshAll(listId, selectedBatchFilter);
  }, [selectedBatchFilter, store]);

  const handleBatchFilterChange = useCallback((batchId: string) => {
    setSelectedBatchFilter(batchId);
    store.refreshAll(selectedListFilter, batchId);
  }, [selectedListFilter, store]);

  // Bulk Delete (Soft-delete for 28 days)
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await store.bulkDeleteLeads(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsConfirmDeleteOpen(false);
      setBulkActionSuccess(`Soft-deleted ${count} lead(s). Preserved in Deletion History for 28 days.`);
      setTimeout(() => setBulkActionSuccess(null), 5000);
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  }, [selectedIds, store]);

  const handleAddSelectedToList = useCallback(
    async (listId: string) => {
      if (selectedIds.size === 0) return;
      try {
        await store.addLeadsToList(listId, Array.from(selectedIds));
        const targetList = store.lists.find((l) => l.id === listId);
        setIsAddToListOpen(false);
        setBulkActionSuccess(`Added ${selectedIds.size} lead(s) to "${targetList?.name || 'List'}".`);
        setTimeout(() => setBulkActionSuccess(null), 4000);
      } catch (err) {
        console.error('Add to list failed:', err);
      }
    },
    [selectedIds, store]
  );

  const handleCreateNewList = useCallback(async () => {
    if (!newListName.trim()) return;
    try {
      setIsCreatingList(true);
      const created = await store.createList(newListName.trim(), newListDesc.trim());
      const createdName = created.name;
      setNewListName('');
      setNewListDesc('');
      setIsCreatingList(false);

      if (isAddToListOpen && selectedIds.size > 0) {
        await store.addLeadsToList(created.id, Array.from(selectedIds));
        setIsAddToListOpen(false);
        setBulkActionSuccess(`Created "${createdName}" and added ${selectedIds.size} lead(s)!`);
        setTimeout(() => setBulkActionSuccess(null), 4000);
      }
    } catch (err) {
      console.error('Create list failed:', err);
      setIsCreatingList(false);
    }
  }, [newListName, newListDesc, isAddToListOpen, selectedIds, store]);

  const handleDeleteList = useCallback(
    async (listId: string) => {
      try {
        await store.deleteList(listId);
        if (selectedListFilter === listId) {
          setSelectedListFilter('all');
          store.refreshAll('all', selectedBatchFilter);
        }
      } catch (err) {
        console.error('Delete list failed:', err);
      }
    },
    [selectedListFilter, selectedBatchFilter, store]
  );

  const handleDeleteSingleLead = useCallback(
    async (leadOrId: Lead | string) => {
      const id = typeof leadOrId === 'string' ? leadOrId : leadOrId.id;
      const target = typeof leadOrId === 'object' ? leadOrId : store.leads.find((l) => l.id === id);
      const isClient = target?.entityType === 'client';
      const label = isClient ? 'client' : 'lead';
      if (
        !window.confirm(
          `Are you sure you want to delete this ${label}? It will be removed from both active leads and active clients, and preserved in Trash for 28 days.`
        )
      )
        return;
      try {
        await store.deleteLead(id);
        setSelectedLead(null);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setBulkActionSuccess(
          `${isClient ? 'Client' : 'Lead'} soft-deleted. Removed from active list and preserved in Trash for 28 days.`
        );
        setTimeout(() => setBulkActionSuccess(null), 4000);
      } catch (err) {
        console.error('Delete lead/client failed:', err);
      }
    },
    [store]
  );

  const handleToggleLeadStatus = useCallback(
    async (lead: Lead) => {
      const isInactive = lead.status === 'inactive' || lead.status === 'paused';
      const nextStatus: 'active' | 'inactive' = isInactive ? 'active' : 'inactive';
      try {
        await store.updateLeadStatus(lead.id, nextStatus);
        if (selectedLead?.id === lead.id) {
          setSelectedLead((prev) => (prev ? { ...prev, status: nextStatus } : null));
        }
        setBulkActionSuccess(
          `Marked "${lead.businessName}" as ${nextStatus === 'active' ? 'ACTIVE' : 'INACTIVE'}.`
        );
        setTimeout(() => setBulkActionSuccess(null), 3500);
      } catch (err) {
        console.error('Failed to update lead status:', err);
      }
    },
    [selectedLead, store]
  );

  const handleBulkUpdateStatus = useCallback(
    async (status: 'active' | 'inactive') => {
      if (selectedIds.size === 0) return;
      const count = selectedIds.size;
      try {
        await store.bulkUpdateLeadStatus(Array.from(selectedIds), status);
        setBulkActionSuccess(
          `Marked ${count} record(s) as ${status === 'active' ? 'ACTIVE' : 'INACTIVE'}.`
        );
        setTimeout(() => setBulkActionSuccess(null), 4000);
      } catch (err) {
        console.error('Bulk update status failed:', err);
      }
    },
    [selectedIds, store]
  );

  // Batch Email Shoot
  const handleShootBatch = useCallback(
    async (batchId: string) => {
      try {
        setIsBatchShooting(true);
        const res = await store.shootBatchEmails(batchId);
        setAutoSendModalResult(res);
        setBulkActionSuccess(
          `Batch emails dispatched: ${res.sentCount} sent (${res.breakdown.initial} first msg, ${res.breakdown.followup_1} follow-up 1, ${res.breakdown.followup_2} follow-up 2)`
        );
        setTimeout(() => setBulkActionSuccess(null), 5000);
      } catch (err) {
        console.error('Shoot batch failed:', err);
      } finally {
        setIsBatchShooting(false);
      }
    },
    [store]
  );

  const handleDeleteBatch = useCallback(
    async (batchId: string) => {
      if (!window.confirm('Delete this upload batch record? The imported leads will remain in your CRM.')) return;
      try {
        await store.deleteBatch(batchId);
        if (selectedBatchFilter === batchId) {
          setSelectedBatchFilter('all');
          store.refreshAll(selectedListFilter, 'all');
        }
      } catch (err) {
        console.error('Delete batch failed:', err);
      }
    },
    [selectedBatchFilter, selectedListFilter, store]
  );

  // Automated Condition-Based Stage Dispatches
  const handleAutoSendNextBulk = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      setIsAutoSending(true);
      const res = await store.autoSendNextStep(Array.from(selectedIds));
      setAutoSendModalResult(res);
      setSelectedIds(new Set());
      setBulkActionSuccess(
        `Auto-sent: ${res.sentCount || 0} messages dispatched (${res.breakdown?.initial || 0} first msg, ${res.breakdown?.followup_1 || 0} follow-up 1, ${res.breakdown?.followup_2 || 0} follow-up 2)`
      );
      setTimeout(() => setBulkActionSuccess(null), 5000);
    } catch (err) {
      console.error('Bulk auto-send failed:', err);
    } finally {
      setIsAutoSending(false);
    }
  }, [selectedIds, store]);

  const handleAutoSendSingle = useCallback(
    async (leadId: string) => {
      try {
        setIsAutoSending(true);
        const res = await store.autoSendNextStep(leadId);
        if (res.result) {
          if (res.result.success) {
            setSendFeedback({
              type: 'success',
              message: `Dispatched ${res.result.stageLabel} ("${res.result.subject}") via Gmail SMTP!`,
            });
            const updatedStage = await api.getLeadStage(leadId);
            setLeadStageInfo(updatedStage);
            await store.fetchConversationsForEntity(leadId, false);
          } else {
            setSendFeedback({
              type: 'warning',
              message: `Skipped: ${res.result.reason || 'Not dispatched'}`,
            });
          }
        }
      } catch (err) {
        console.error('Single auto-send failed:', err);
        setSendFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Auto-send failed',
        });
      } finally {
        setIsAutoSending(false);
      }
    },
    [store]
  );

  // Client Edit Info
  const handleOpenEditClient = useCallback((lead: Lead) => {
    setClientEditForm({
      businessName: lead.businessName,
      primaryContactName: lead.primaryContactName || lead.businessName,
      category: lead.category,
      phone: lead.phone,
      email: lead.email,
      instagram: lead.instagram,
      facebook: lead.facebook,
      whatsapp: lead.whatsapp,
      status: 'active',
      contractValue: 1500,
      notes: lead.notes || '',
    });
    setIsEditClientOpen(true);
  }, []);

  const handleSaveClientEdit = useCallback(async () => {
    if (!selectedLead) return;
    try {
      setIsSavingClient(true);
      await store.updateClient(selectedLead.id, {
        business_name: clientEditForm.businessName,
        primary_contact_name: clientEditForm.primaryContactName,
        category: clientEditForm.category,
        phone: clientEditForm.phone,
        email: clientEditForm.email,
        instagram: clientEditForm.instagram,
        facebook: clientEditForm.facebook,
        whatsapp: clientEditForm.whatsapp,
        status: clientEditForm.status,
        contract_value: clientEditForm.contractValue,
        notes: clientEditForm.notes,
      });

      setSelectedLead((prev) =>
        prev
          ? {
              ...prev,
              businessName: clientEditForm.businessName,
              primaryContactName: clientEditForm.primaryContactName,
              category: clientEditForm.category,
              phone: clientEditForm.phone,
              email: clientEditForm.email,
              instagram: clientEditForm.instagram,
              facebook: clientEditForm.facebook,
              whatsapp: clientEditForm.whatsapp,
              notes: clientEditForm.notes,
            }
          : null
      );
      setIsEditClientOpen(false);
      setBulkActionSuccess('Client information updated successfully in PostgreSQL.');
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err) {
      console.error('Update client failed:', err);
    } finally {
      setIsSavingClient(false);
    }
  }, [selectedLead, clientEditForm, store]);

  // Trash & Restore
  const handleOpenTrash = useCallback(async () => {
    await store.fetchTrash();
    setIsTrashOpen(true);
  }, [store]);

  const handleRestoreLead = useCallback(
    async (id: string) => {
      try {
        await store.restoreLead(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setBulkActionSuccess('Lead restored successfully back to active CRM!');
        setTimeout(() => setBulkActionSuccess(null), 4000);
      } catch (err) {
        console.error('Restore lead failed:', err);
      }
    },
    [store]
  );

  const handleBulkRestore = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await store.bulkRestoreLeads(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkActionSuccess(`Restored ${count} lead(s) back to active CRM!`);
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err) {
      console.error('Bulk restore failed:', err);
    }
  }, [selectedIds, store]);

  const handleRestoreAllTrash = useCallback(async () => {
    if (store.trashLeads.length === 0) return;
    if (
      !window.confirm(
        `Restore all ${store.trashLeads.length} leads in Trash back to your active CRM?`
      )
    )
      return;
    try {
      const count = await store.restoreAllTrash();
      setSelectedIds(new Set());
      setBulkActionSuccess(`Successfully restored all ${count} lead(s) back to active CRM!`);
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err) {
      console.error('Restore all trash failed:', err);
    }
  }, [store]);

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Permanently purge this record? This action cannot be reversed.')) return;
      try {
        await store.permanentDeleteLead(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setBulkActionSuccess('Record permanently purged.');
        setTimeout(() => setBulkActionSuccess(null), 4000);
      } catch (err) {
        console.error('Permanent delete failed:', err);
      }
    },
    [store]
  );

  const handleBulkPermanentDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (
      !window.confirm(
        `Permanently purge ${count} selected lead(s)? This action cannot be reversed.`
      )
    )
      return;
    try {
      await store.bulkPermanentDeleteLeads(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkActionSuccess(`Permanently purged ${count} lead(s) from Trash.`);
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err) {
      console.error('Bulk permanent delete failed:', err);
    }
  }, [selectedIds, store]);

  const handleClearAllTrash = useCallback(async () => {
    if (store.trashLeads.length === 0) return;
    const count = store.trashLeads.length;
    if (
      !window.confirm(
        `Are you sure you want to permanently clear all ${count} records in Trash? This cannot be reversed.`
      )
    )
      return;
    try {
      await store.clearTrash();
      setSelectedIds(new Set());
      setIsTrashOpen(false);
      setBulkActionSuccess(`Successfully cleared all ${count} records from Trash.`);
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err) {
      console.error('Clear trash failed:', err);
    }
  }, [store]);

  // Sync selectedLead if store.leads changes
  useEffect(() => {
    if (selectedLead) {
      const updated = store.leads.find((l) => l.id === selectedLead.id);
      if (updated) setSelectedLead(updated);
    }
  }, [store.leads, selectedLead]);

  const handleSendReply = useCallback(async () => {
    if (!selectedLead || !replyText.trim()) return;

    try {
      setIsSending(true);
      setSendFeedback(null);

      const res = await store.sendReply({
        leadId: selectedLead.entityType === 'lead' ? selectedLead.id : undefined,
        clientId: selectedLead.entityType === 'client' ? selectedLead.id : undefined,
        channel: replyChannel,
        text: replyText.trim(),
      });

      if (res.result) {
        if (res.result.actionTaken === 'blocked_consent') {
          setSendFeedback({
            type: 'error',
            message: res.result.reason || 'Blocked: Contact has opted out of communications.',
          });
        } else if (res.result.actionTaken === 'blocked_channel_rule') {
          setSendFeedback({
            type: 'warning',
            message: res.result.reason || 'Cold WhatsApp sends are disabled by policy (24-hour inbound window only).',
          });
        } else if (res.result.actionTaken === 'queued_draft') {
          setSendFeedback({
            type: 'info',
            message: 'Instagram DM drafted and added to the Human Send Approval Queue.',
          });
          setReplyText('');
        } else if (res.result.actionTaken === 'throttled_warmup') {
          setSendFeedback({
            type: 'warning',
            message: res.result.reason || 'Sending throttled: Daily email warm-up limit reached.',
          });
        } else if (res.result.actionTaken === 'sent_direct') {
          setSendFeedback({
            type: 'success',
            message:
              res.result.channel === 'whatsapp'
                ? 'WhatsApp message dispatched within active customer care window.'
                : res.result.reason || 'Email dispatched directly through Gmail SMTP.',
          });
          setReplyText('');
        }
      } else {
        setSendFeedback({
          type: 'success',
          message: 'Client message dispatched directly via Conversation Orchestrator.',
        });
        setReplyText('');
      }

      await store.fetchConversationsForEntity(selectedLead.id, selectedLead.entityType === 'client');
      const updatedWindow = await api.getWhatsAppWindowStatus(selectedLead.id, selectedLead.entityType === 'client');
      setWaWindow(updatedWindow);
    } catch (err) {
      console.error('Send reply failed:', err);
      setSendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send message',
      });
    } finally {
      setIsSending(false);
    }
  }, [selectedLead, replyText, replyChannel, store]);

  const handleConvert = useCallback(async () => {
    if (!selectedLead) return;

    try {
      setIsConverting(true);
      setConversionMessage(null);
      const res = await store.convertToClient(selectedLead.id);
      setConversionMessage(res.message || 'Successfully converted to Client in PostgreSQL database.');
      setSelectedLead((prev) => (prev ? { ...prev, entityType: 'client', consentStatus: 'replied' } : null));
    } catch (err) {
      console.error('Conversion failed:', err);
      setConversionMessage(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  }, [selectedLead, store]);

  const handleSimulateInbound = useCallback(
    async (replyType: 'positive' | 'optout') => {
      if (!selectedLead) return;
      setIsSending(true);
      try {
        const text =
          replyType === 'positive'
            ? 'Yes, I received your message and I am interested! Please tell me more about your packages.'
            : 'Please STOP sending me emails. Unsubscribe me immediately.';

        const channel = replyChannel || (selectedLead.email ? 'email' : 'whatsapp');
        const res = await api.simulateInbound({
          leadId: selectedLead.id,
          channel: channel as any,
          text,
        });

        if (res.clientConversion?.success) {
          setSendFeedback({
            type: 'success',
            message: '🎉 Inbound reply detected! Lead automatically converted to Client in PostgreSQL.',
          });
          await store.refreshAll();
          const updatedClient = store.leads.find(
            (c) => c.entityType === 'client' && (c.id === res.clientConversion?.clientId || c.email === selectedLead.email)
          );
          if (updatedClient) {
            setSelectedLead({ ...updatedClient, entityType: 'client' });
          }
        } else if (res.isOptOut) {
          setSendFeedback({
            type: 'warning',
            message: '🚫 Inbound STOP received: Contact marked as opted_out (Hard Suppression Gate active).',
          });
          await store.refreshAll();
        } else {
          setSendFeedback({
            type: 'info',
            message: 'Inbound message received.',
          });
        }

        await store.fetchConversationsForEntity(selectedLead.id, selectedLead.entityType === 'client');
      } catch (err) {
        console.error('Simulate inbound failed:', err);
        setSendFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to simulate inbound message',
        });
      } finally {
        setIsSending(false);
      }
    },
    [selectedLead, replyChannel, store]
  );

  const consentBadge = (status: ConsentStatus) => {
    if (status === 'replied') return <Badge variant="green">{consentLabels[status]}</Badge>;
    if (status === 'opted_out') return <Badge variant="red">{consentLabels[status]}</Badge>;
    return <Badge variant="gray">{consentLabels[status]}</Badge>;
  };

  const stageBadge = (lead: Lead) => {
    if (lead.entityType === 'client') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
          <UserCheck size={11} /> Client Account
        </span>
      );
    }
    if (lead.consentStatus === 'opted_out') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
          🛑 Opted Out
        </span>
      );
    }
    if (lead.consentStatus === 'replied') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={11} /> Replied
        </span>
      );
    }
    if (lead.outreachStage === 'followup_1') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
          <Clock size={11} /> Follow-up 1 Due
        </span>
      );
    }
    if (lead.outreachStage === 'followup_2') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
          <Clock size={11} /> Follow-up 2 Due
        </span>
      );
    }
    if (lead.outreachStage === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
          Completed (3x)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
        <Zap size={11} /> First Msg Needed
      </span>
    );
  };

  const currentBatch = useMemo(() => {
    if (selectedBatchFilter === 'all') return null;
    return store.batches.find((b) => b.id === selectedBatchFilter);
  }, [selectedBatchFilter, store.batches]);

  return (
    <div>
      <PageHeader
        title="Leads & Clients CRM"
        subtitle="Manage prospects and paying clients. Unified omni-channel tracking with 28-day retention."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsInboundInboxOpen(true)}
              className="btn-primary text-xs flex items-center gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700 text-white"
              title="Open Inbound Email Replies Center"
            >
              <Mail size={14} />
              <span>Inbound Inbox</span>
              <span className="rounded-full bg-blue-500/90 px-1.5 py-0.2 text-[10px] font-bold">
                {store.inboundReplies.length}
              </span>
            </button>
            <button
              type="button"
              onClick={handleSyncInbox}
              disabled={isSyncingInbox}
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-sm border-brand-200 text-brand-700 hover:bg-brand-50"
              title="Check Gmail inbox for new incoming replies from prospects"
            >
              <RefreshCw size={14} className={isSyncingInbox ? 'animate-spin text-brand-600' : 'text-brand-600'} />
              <span>{isSyncingInbox ? 'Checking Gmail...' : 'Sync Email Replies'}</span>
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {[
            { key: 'all', label: 'All Records' },
            { key: 'lead', label: 'Leads' },
            { key: 'client', label: 'Clients' },
            {
              key: 'inbound',
              label: `Email Replies (${inboundContactCount})`,
              icon: Mail,
            },
            {
              key: 'trash',
              label: `Trash (${store.trashLeads.length})`,
              icon: Trash2,
            },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setEntityFilter(key as EntityTypeFilter);
                setSelectedIds(new Set());
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                entityFilter === key
                  ? key === 'trash'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : key === 'inbound'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-brand-600 text-white shadow-sm'
                  : key === 'trash'
                  ? 'text-amber-700 hover:bg-amber-50 font-bold'
                  : key === 'inbound'
                  ? 'text-blue-700 hover:bg-blue-50 font-bold'
                  : 'text-ink-500 hover:bg-slate-100'
              }`}
            >
              {Icon && <Icon size={12} />}
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-ink-300" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="input py-1.5 text-xs w-auto font-medium"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <select
            value={consentFilter}
            onChange={(e) => setConsentFilter(e.target.value as ConsentStatus | 'all')}
            className="input py-1.5 text-xs w-auto"
          >
            <option value="all">All Consent</option>
            <option value="none">No response</option>
            <option value="replied">Replied</option>
            <option value="opted_out">Opted out</option>
          </select>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
            className="input py-1.5 text-xs w-auto"
          >
            <option value="all">All Channels</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram / FB</option>
          </select>

          {/* Lists Filter */}
          <div className="flex items-center gap-1.5 ml-1 border-l border-slate-200 pl-2">
            <Bookmark size={13} className="text-brand-500" />
            <select
              value={selectedListFilter}
              onChange={(e) => handleListFilterChange(e.target.value)}
              className="input py-1.5 text-xs w-auto font-medium"
            >
              <option value="all">📁 All Lists</option>
              {store.lists.map((lst) => (
                <option key={lst.id} value={lst.id}>
                  {lst.name} ({lst.lead_count})
                </option>
              ))}
            </select>
            <button
              onClick={() => setIsManageListsOpen(true)}
              className="btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1"
              title="Create or manage custom lists"
            >
              <ListFilter size={13} />
              <span>Lists</span>
            </button>
          </div>

          {/* Batches Filter (28-day retention) */}
          <div className="flex items-center gap-1.5 ml-1 border-l border-slate-200 pl-2">
            <Layers size={13} className="text-violet-500" />
            <select
              value={selectedBatchFilter}
              onChange={(e) => handleBatchFilterChange(e.target.value)}
              className="input py-1.5 text-xs w-auto font-medium"
            >
              <option value="all">📦 All Batches</option>
              {store.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name} ({b.lead_count} leads, {b.days_remaining}d left)
                </option>
              ))}
            </select>
          </div>

          {/* 28-Day Deletion History / Trash Button */}
          <button
            onClick={handleOpenTrash}
            className="btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 text-slate-700 hover:text-slate-900 ml-1"
            title="View leads soft-deleted within 28 days"
          >
            <Trash2 size={13} className="text-slate-500" />
            <span>Trash (28d)</span>
            {store.trashLeads.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 text-[10px] font-bold">
                {store.trashLeads.length}
              </span>
            )}
          </button>
        </div>

        <div className="relative flex-1 min-w-48 max-w-xs ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone..."
            className="input pl-9 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Selected Batch Action Banner */}
      {currentBatch && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-purple-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-600 text-white flex items-center justify-center font-bold shrink-0">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink-900">{currentBatch.batch_name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-semibold">
                  {currentBatch.lead_count} leads
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  ⏳ {currentBatch.days_remaining}d retention left
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                Uploaded {new Date(currentBatch.created_at).toLocaleDateString()} • {currentBatch.imported_count} imported,{' '}
                {currentBatch.duplicate_count} dupes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleShootBatch(currentBatch.id)}
              disabled={isBatchShooting}
              className="btn-primary bg-violet-600 hover:bg-violet-700 flex items-center gap-1.5 text-xs py-2 px-4 shadow-md"
            >
              <Zap size={15} />
              <span>{isBatchShooting ? 'Shooting...' : '🚀 Shoot Emails to this Batch'}</span>
            </button>
            <button
              onClick={() => handleDeleteBatch(currentBatch.id)}
              className="btn-secondary text-rose-600 hover:bg-rose-50 border-rose-200 text-xs py-2 px-3"
              title="Delete Batch Reference"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Inbound Replies Banner */}
      {entityFilter === 'inbound' && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-cyan-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-blue-500/20">
              <Mail size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink-900">
                  Contacts with Inbound Email Replies ({inboundContactCount})
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                  Live Gmail IMAP Synchronized
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                Displaying all contacts who responded back to email outreach. Click any contact to open their conversation thread, or open the Inbound Inbox to see every reply received.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsInboundInboxOpen(true)}
              className="btn-primary bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm"
            >
              <Sparkles size={14} />
              <span>Browse Inbound Inbox ({store.inboundReplies.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Trash Retention Banner */}
      {entityFilter === 'trash' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold shrink-0">
              <Trash2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink-900">Trash Bin ({store.trashLeads.length} records)</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                  28-day soft retention
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                All deleted leads and their full conversation histories are preserved here for 28 days before permanent purge. You can restore them anytime.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {store.trashLeads.length > 0 && (
              <>
                <button
                  onClick={handleRestoreAllTrash}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm"
                  title="Restore all leads in trash back to active CRM"
                >
                  <RotateCcw size={14} />
                  <span>Restore All ({store.trashLeads.length}) Leads</span>
                </button>
                <button
                  onClick={handleClearAllTrash}
                  className="btn-secondary text-rose-700 hover:bg-rose-50 border-rose-300 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm font-semibold transition"
                  title="Permanently empty all trash records at once"
                >
                  <Trash2 size={14} className="text-rose-600" />
                  <span>Clear Trash ({store.trashLeads.length})</span>
                </button>
              </>
            )}
            <button
              onClick={() => {
                setEntityFilter('all');
                setSelectedIds(new Set());
              }}
              className="btn-secondary text-xs py-2 px-3"
            >
              ← Back to Active CRM
            </button>
          </div>
        </div>
      )}

      {bulkActionSuccess && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>{bulkActionSuccess}</span>
          </div>
          {entityFilter !== 'trash' && store.trashLeads.length > 0 && (
            <button
              onClick={() => {
                setEntityFilter('trash');
                setSelectedIds(new Set());
              }}
              className="text-xs font-bold text-amber-800 hover:text-amber-900 underline flex items-center gap-1 shrink-0"
            >
              <span>View Trash ({store.trashLeads.length})</span>
              <span>→</span>
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {entityFilter === 'trash' ? (
                <tr className="border-b border-amber-200 bg-amber-50/70 text-left">
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all"
                      className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-900">Business Name & Contact</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-900">Category</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-900">Channels</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-900">Retention Remaining</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-900">Deleted Date</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-900 text-right">Actions</th>
                </tr>
              ) : (
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Business Name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Channels</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Stage / Action</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Consent</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Last Contacted</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500 text-right">Action</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={entityFilter === 'trash' ? 7 : 10}
                    className="px-4 py-12 text-center text-ink-300"
                  >
                    {entityFilter === 'trash'
                      ? 'Trash is empty. No deleted records found.'
                      : 'No records match your filters.'}
                  </td>
                </tr>
              ) : entityFilter === 'trash' ? (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleOpenLead(lead)}
                    className="cursor-pointer transition-colors hover:bg-amber-50/60"
                  >
                    <td
                      className="w-10 px-3 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => handleToggleSelectLead(lead.id)}
                        aria-label={`Select ${lead.businessName}`}
                        className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-ink-900 flex items-center gap-1.5">
                          <span>{lead.businessName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                            Trash
                          </span>
                        </p>
                        <p className="text-xs text-ink-400">{lead.email || lead.phone || 'No contact info'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{lead.category}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {lead.email && <Mail size={14} className="text-brand-500" />}
                        {lead.whatsapp && <MessageCircle size={14} className="text-emerald-500" />}
                        {(lead.instagram || lead.facebook) && <Instagram size={14} className="text-violet-500" />}
                        {!lead.email && !lead.whatsapp && !lead.instagram && !lead.facebook && (
                          <span className="text-xs text-ink-300">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock size={12} />
                        {lead.daysRemaining ?? 28}d left
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {lead.deletedAt
                        ? new Date(lead.deletedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Recent'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleRestoreLead(lead.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-sm transition"
                          title="Restore lead back to active CRM"
                        >
                          <RotateCcw size={12} />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(lead.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                          title="Permanently Purge Record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                filtered.map((lead) => {
                  const isInactive = lead.status === 'inactive' || lead.status === 'paused';
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => handleOpenLead(lead)}
                      className={`cursor-pointer transition-colors ${
                        isInactive
                          ? 'bg-slate-50/70 hover:bg-slate-100/80 text-ink-600'
                          : 'hover:bg-brand-50/50'
                      }`}
                    >
                      <td
                        className="w-10 px-3 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.id)}
                          onChange={() => handleToggleSelectLead(lead.id)}
                          aria-label={`Select ${lead.businessName}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {lead.entityType === 'client' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                            <UserCheck size={12} /> Client
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-ink-500">
                            Lead
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleLeadStatus(lead)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold border transition shadow-xs ${
                            isInactive
                              ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-emerald-50 hover:text-emerald-700'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                          title={
                            isInactive
                              ? 'Currently Inactive. Click to mark Active'
                              : 'Currently Active. Click to mark Inactive'
                          }
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isInactive ? 'bg-slate-400' : 'bg-emerald-500'
                            }`}
                          />
                          <span>{isInactive ? 'Inactive' : 'Active'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className={`font-semibold ${isInactive ? 'text-ink-600' : 'text-ink-900'}`}>
                            {lead.businessName}
                          </p>
                          <p className="text-xs text-ink-300">{lead.email || lead.phone || 'No contact info'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-500">{lead.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {lead.email && <Mail size={14} className="text-brand-500" />}
                          {lead.whatsapp && <MessageCircle size={14} className="text-emerald-500" />}
                          {(lead.instagram || lead.facebook) && <Instagram size={14} className="text-violet-500" />}
                          {!lead.email && !lead.whatsapp && !lead.instagram && !lead.facebook && (
                            <span className="text-xs text-ink-300">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{stageBadge(lead)}</td>
                      <td className="px-4 py-3">{consentBadge(lead.consentStatus)}</td>
                      <td className="px-4 py-3 text-xs text-ink-500">
                        {lead.lastContactedAt ? (
                          new Date(lead.lastContactedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        ) : (
                          <span className="text-ink-300">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleLeadStatus(lead)}
                            className={`p-1.5 rounded-lg transition text-xs font-semibold flex items-center gap-1 ${
                              isInactive
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                            }`}
                            title={isInactive ? 'Mark as Active' : 'Mark as Inactive'}
                          >
                            {isInactive ? <CheckCircle2 size={13} /> : <UserX size={13} />}
                            <span className="text-[10px]">{isInactive ? 'Activate' : 'Inactive'}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSingleLead(lead)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title={`Delete ${lead.entityType === 'client' ? 'client' : 'lead'} (moves to trash)`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Single Lead / Client Detail Modal */}
      <Modal
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.businessName || ''}
        width="xl"
        footer={
          selectedLead && (
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <div>
                {selectedLead.deletedAt || store.trashLeads.some((t) => t.id === selectedLead.id) ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        await handleRestoreLead(selectedLead.id);
                        setSelectedLead(null);
                      }}
                      className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm"
                    >
                      <RotateCcw size={15} /> Restore Lead to Active CRM
                    </button>
                    <button
                      onClick={async () => {
                        await handlePermanentDelete(selectedLead.id);
                        setSelectedLead(null);
                      }}
                      className="btn-secondary text-rose-600 hover:bg-rose-50 border-rose-200 text-xs py-2 px-3"
                      title="Permanently Purge Record"
                    >
                      <Trash2 size={14} /> Permanent Purge
                    </button>
                  </div>
                ) : selectedLead.entityType === 'client' ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <UserCheck size={18} /> Paying Client Account
                    </span>
                    <button
                      onClick={() => handleOpenEditClient(selectedLead)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg border border-brand-200 transition"
                      title="Update client information"
                    >
                      <Edit3 size={13} /> Edit Info
                    </button>
                    <button
                      onClick={() => handleToggleLeadStatus(selectedLead)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition"
                      title="Toggle active / inactive status"
                    >
                      {selectedLead.status === 'inactive' || selectedLead.status === 'paused' ? (
                        <>
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <span>Mark Active</span>
                        </>
                      ) : (
                        <>
                          <UserX size={13} className="text-slate-500" />
                          <span>Mark Inactive</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteSingleLead(selectedLead)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                      title="Soft-delete this client (preserved in Trash for 28 days)"
                    >
                      <Trash2 size={14} /> Delete Client
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={handleConvert} disabled={isConverting} className="btn-primary">
                      <UserCheck size={16} /> {isConverting ? 'Converting...' : 'Convert to Client'}
                    </button>
                    <button
                      onClick={() => handleToggleLeadStatus(selectedLead)}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition"
                      title="Toggle active / inactive status"
                    >
                      {selectedLead.status === 'inactive' || selectedLead.status === 'paused' ? (
                        <>
                          <CheckCircle2 size={14} className="text-emerald-600" />
                          <span>Mark Active</span>
                        </>
                      ) : (
                        <>
                          <UserX size={14} className="text-slate-500" />
                          <span>Mark Inactive</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteSingleLead(selectedLead)}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                      title="Soft-delete this lead (preserved for 28 days)"
                    >
                      <Trash2 size={15} /> Delete Lead
                    </button>
                  </div>
                )}
                {conversionMessage && <p className="mt-1 text-xs text-emerald-600 font-medium">{conversionMessage}</p>}
              </div>
              <button onClick={() => setSelectedLead(null)} className="btn-secondary">
                <ArrowLeft size={16} /> Close
              </button>
            </div>
          )
        }
      >
        {selectedLead && (
          <div className="space-y-5">
            {/* Trash status banner if lead is in Trash */}
            {(selectedLead.deletedAt || store.trashLeads.some((t) => t.id === selectedLead.id)) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertCircle size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold">This record is currently in Trash</p>
                    <p className="text-amber-700 mt-0.5">
                      Deleted on {selectedLead.deletedAt ? new Date(selectedLead.deletedAt).toLocaleDateString() : 'recently'}.{' '}
                      ⏳ <strong>{selectedLead.daysRemaining ?? 28} days remaining</strong> before permanent purge. Full conversation history is preserved.
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await handleRestoreLead(selectedLead.id);
                    setSelectedLead(null);
                  }}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs py-1.5 px-3 shrink-0 flex items-center gap-1 shadow-sm"
                >
                  <RotateCcw size={13} /> Restore Lead
                </button>
              </div>
            )}

            {/* Condition-Based Smart Outreach Card (For Leads) */}
            {selectedLead.entityType === 'lead' &&
              !selectedLead.deletedAt &&
              !store.trashLeads.some((t) => t.id === selectedLead.id) &&
              selectedLead.consentStatus !== 'opted_out' && (
              <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-amber-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                        Current Condition:{' '}
                        {leadStageInfo?.stageLabel ||
                          (selectedLead.outreachStage === 'followup_1'
                            ? 'Follow-up 1 Due'
                            : selectedLead.outreachStage === 'followup_2'
                            ? 'Follow-up 2 Due'
                            : 'First Message Needed')}
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-1">
                      Next Step:{' '}
                      <strong>
                        {leadStageInfo?.nextStepLabel || 'Shoot Next Message (Stage-Aware via Gmail)'}
                      </strong>
                    </p>
                  </div>
                  <button
                    onClick={() => handleAutoSendSingle(selectedLead.id)}
                    disabled={isAutoSending || !selectedLead.email}
                    className="btn-primary bg-amber-600 hover:bg-amber-700 text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-sm"
                  >
                    <Zap size={14} />
                    <span>{isAutoSending ? 'Sending...' : '⚡ Shoot Next Follow-up Automatically'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Entity Type</p>
                <p className="mt-1 text-sm font-semibold capitalize text-ink-700">{selectedLead.entityType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Status</p>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                      selectedLead.status === 'inactive' || selectedLead.status === 'paused'
                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedLead.status === 'inactive' || selectedLead.status === 'paused'
                          ? 'bg-slate-400'
                          : 'bg-emerald-500'
                      }`}
                    />
                    {selectedLead.status === 'inactive' || selectedLead.status === 'paused'
                      ? 'Inactive'
                      : 'Active'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Category</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.category}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Consent Status</p>
                <div className="mt-1">{consentBadge(selectedLead.consentStatus)}</div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Phone</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Email</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Social</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.instagram || selectedLead.facebook || '—'}</p>
              </div>
            </div>

            {/* Conversation History */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Conversation History</h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncInbox}
                    disabled={isSyncingInbox}
                    className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-md border border-brand-200 transition flex items-center gap-1.5"
                    title="Check Gmail for new incoming email replies"
                  >
                    <RefreshCw size={11} className={isSyncingInbox ? 'animate-spin text-brand-600' : 'text-brand-600'} />
                    <span>{isSyncingInbox ? 'Checking...' : 'Check Gmail Replies'}</span>
                  </button>
                  <button
                    onClick={() => handleSimulateInbound('positive')}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition"
                    title="Simulate client reply (triggers Lead -> Client conversion)"
                  >
                    + Sim Positive Reply
                  </button>
                  <button
                    onClick={() => handleSimulateInbound('optout')}
                    className="text-[11px] font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md border border-rose-200 transition"
                    title="Simulate inbound STOP (triggers hard suppression)"
                  >
                    + Sim Opt-Out
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {leadConversations.length === 0 ? (
                  <p className="text-center text-xs text-ink-300 py-4">No messages recorded yet.</p>
                ) : (
                  leadConversations.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-lg p-2.5 text-xs shadow-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-brand-600 text-white rounded-br-none'
                            : 'bg-white text-ink-800 border border-slate-200 rounded-bl-none'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-75">
                          <span className="font-semibold uppercase tracking-wider">{msg.channel}</span>
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Custom Reply Box */}
            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">Send Direct Reply</h4>

              {/* Channel Switcher */}
              <div className="flex gap-2 mb-3">
                {(['email', 'whatsapp', 'instagram'] as Channel[]).map((ch) => {
                  const isAvailable = ch === 'email' ? !!selectedLead.email : ch === 'whatsapp' ? !!selectedLead.whatsapp : (!!selectedLead.instagram || !!selectedLead.facebook);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setReplyChannel(ch)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        replyChannel === ch
                          ? 'bg-brand-50 text-brand-700 border-2 border-brand-500'
                          : 'bg-slate-100 text-ink-600 border border-transparent hover:bg-slate-200'
                      } ${!isAvailable ? 'opacity-50' : ''}`}
                    >
                      <ChannelIcon channel={ch} size={14} />
                      <span>{channelLabels[ch]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type message to send..."
                  rows={2}
                  className="textarea flex-1 text-sm"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || isSending}
                  className="btn-primary self-end"
                >
                  <Send size={16} />
                </button>
              </div>

              {sendFeedback && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    sendFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : sendFeedback.type === 'warning'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : sendFeedback.type === 'error'
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-brand-50 text-brand-800 border border-brand-200'
                  }`}
                >
                  {sendFeedback.type === 'success' ? (
                    <CheckCircle2 size={14} className="flex-shrink-0" />
                  ) : (
                    <AlertCircle size={14} className="flex-shrink-0" />
                  )}
                  <span>{sendFeedback.message}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-ink-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-ink-800 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-semibold bg-brand-600 px-2.5 py-0.5 rounded-full text-white">
            {selectedIds.size}
          </span>
          <span className="text-sm font-medium text-slate-200">selected</span>
          <div className="h-4 w-px bg-ink-700 mx-1" />
          {entityFilter === 'trash' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkRestore}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition"
                title="Restore all selected leads back to active CRM"
              >
                <RotateCcw size={14} />
                <span>Restore Selected ({selectedIds.size})</span>
              </button>
              <button
                onClick={handleBulkPermanentDelete}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md transition"
                title="Permanently delete all selected leads from database"
              >
                <Trash2 size={14} />
                <span>Permanently Delete ({selectedIds.size})</span>
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleAutoSendNextBulk}
                disabled={isAutoSending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-lg text-xs font-bold shadow-md transition"
                title="Auto-send next message based on each contact's current stage"
              >
                <Zap size={14} />
                <span>{isAutoSending ? 'Auto-Sending...' : 'Auto-Send Next Step'}</span>
              </button>
              <button
                onClick={() => handleBulkUpdateStatus('inactive')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold transition"
                title="Mark selected leads/clients as Inactive"
              >
                <UserX size={14} />
                <span>Mark Inactive</span>
              </button>
              <button
                onClick={() => handleBulkUpdateStatus('active')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition"
                title="Mark selected leads/clients as Active"
              >
                <CheckCircle2 size={14} />
                <span>Mark Active</span>
              </button>
              <button
                onClick={() => setIsAddToListOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition"
              >
                <Bookmark size={14} />
                <span>Save to List</span>
              </button>
              <button
                onClick={() => setIsConfirmDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition"
                title="Delete selected leads and clients (moves to Trash for 28 days)"
              >
                <Trash2 size={14} />
                <span>Delete Selected</span>
              </button>
            </>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 px-2.5 py-1.5 text-slate-400 hover:text-white text-xs transition"
          >
            <X size={14} />
            <span>Clear</span>
          </button>
        </div>
      )}

      {/* Client Edit Info Modal */}
      <Modal
        open={isEditClientOpen}
        onClose={() => setIsEditClientOpen(false)}
        title="Edit Client Account Information"
        width="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button onClick={() => setIsEditClientOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleSaveClientEdit} disabled={isSavingClient} className="btn-primary">
              <CheckCircle2 size={15} /> {isSavingClient ? 'Saving...' : 'Save Client Details'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-500">
            Update account details, contact info, contract value, and notes. Persisted directly to PostgreSQL.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Business Name *</label>
              <input
                type="text"
                value={clientEditForm.businessName}
                onChange={(e) => setClientEditForm({ ...clientEditForm, businessName: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Primary Contact Name</label>
              <input
                type="text"
                value={clientEditForm.primaryContactName}
                onChange={(e) => setClientEditForm({ ...clientEditForm, primaryContactName: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Email Address</label>
              <input
                type="email"
                value={clientEditForm.email}
                onChange={(e) => setClientEditForm({ ...clientEditForm, email: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Phone Number</label>
              <input
                type="text"
                value={clientEditForm.phone}
                onChange={(e) => setClientEditForm({ ...clientEditForm, phone: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Category / Industry</label>
              <input
                type="text"
                value={clientEditForm.category}
                onChange={(e) => setClientEditForm({ ...clientEditForm, category: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Contract Value ($)</label>
              <input
                type="number"
                value={clientEditForm.contractValue}
                onChange={(e) => setClientEditForm({ ...clientEditForm, contractValue: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">Client Status</label>
              <select
                value={clientEditForm.status}
                onChange={(e) => setClientEditForm({ ...clientEditForm, status: e.target.value as any })}
                className="input text-xs"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="churned">Churned</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-700 mb-1 block">WhatsApp Number</label>
              <input
                type="text"
                value={clientEditForm.whatsapp}
                onChange={(e) => setClientEditForm({ ...clientEditForm, whatsapp: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-700 mb-1 block">Client Notes</label>
            <textarea
              value={clientEditForm.notes}
              onChange={(e) => setClientEditForm({ ...clientEditForm, notes: e.target.value })}
              rows={3}
              placeholder="Account notes, onboarding instructions, or context..."
              className="textarea text-xs"
            />
          </div>
        </div>
      </Modal>

      {/* 28-Day Deletion History & Trash Modal */}
      <Modal
        open={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        title="Deletion History & Trash (28-Day Retention)"
        width="xl"
        footer={
          store.trashLeads.length > 0 ? (
            <div className="flex items-center justify-between gap-2 w-full">
              <button
                onClick={handleClearAllTrash}
                className="btn-secondary text-rose-600 hover:bg-rose-50 border-rose-300 text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold transition"
                title="Permanently empty all trash records at once"
              >
                <Trash2 size={14} /> Clear All Trash ({store.trashLeads.length})
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestoreAllTrash}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs py-1.5 px-3 flex items-center gap-1.5"
                >
                  <RotateCcw size={14} /> Restore All Leads
                </button>
                <button onClick={() => setIsTrashOpen(false)} className="btn-secondary text-xs py-1.5 px-3">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end w-full">
              <button onClick={() => setIsTrashOpen(false)} className="btn-secondary text-xs py-1.5 px-3">
                Close
              </button>
            </div>
          )
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs">
            <Clock size={16} className="text-blue-600 shrink-0" />
            <p>
              Records deleted within the last <strong>28 days</strong> are safely preserved with their full message history. You can restore them back to your active CRM at any time.
            </p>
          </div>

          {store.trashLeads.length === 0 ? (
            <p className="text-center text-xs text-ink-300 py-8">Trash is empty. No records deleted in the past 28 days.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              {store.trashLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink-900">{lead.businessName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                        ⏳ {lead.daysRemaining ?? 28}d left before permanent purge
                      </span>
                    </div>
                    <p className="text-ink-500 text-[11px] mt-0.5">
                      {lead.email || lead.phone || 'No contact info'} • Deleted on{' '}
                      {lead.deletedAt ? new Date(lead.deletedAt).toLocaleDateString() : 'Recent'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestoreLead(lead.id)}
                      className="btn-secondary text-brand-600 hover:bg-brand-50 border-brand-200 text-xs py-1 px-2.5 flex items-center gap-1 font-semibold"
                      title="Restore lead back to CRM"
                    >
                      <RotateCcw size={13} />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(lead.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                      title="Permanent purge"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Auto-Send Summary Result Modal */}
      <Modal
        open={!!autoSendModalResult}
        onClose={() => setAutoSendModalResult(null)}
        title="Automated Condition-Based Dispatch Results"
        width="lg"
      >
        {autoSendModalResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="card p-3 bg-slate-50 border border-slate-200">
                <p className="text-xs text-ink-500">Total Processed</p>
                <p className="text-lg font-bold text-ink-900">{autoSendModalResult.totalProcessed ?? 0}</p>
              </div>
              <div className="card p-3 bg-emerald-50 border border-emerald-200">
                <p className="text-xs text-emerald-700">Dispatched</p>
                <p className="text-lg font-bold text-emerald-700">{autoSendModalResult.sentCount ?? 0}</p>
              </div>
              <div className="card p-3 bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700">Skipped / Completed</p>
                <p className="text-lg font-bold text-amber-700">{autoSendModalResult.skippedCount ?? 0}</p>
              </div>
              <div className="card p-3 bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700">First Msg / Followups</p>
                <p className="text-xs font-bold text-blue-800 mt-1">
                  {autoSendModalResult.breakdown?.initial || 0} / {autoSendModalResult.breakdown?.followup_1 || 0} / {autoSendModalResult.breakdown?.followup_2 || 0}
                </p>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2">
              {autoSendModalResult.results?.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs">
                  <div>
                    <span className="font-semibold text-ink-900">{r.businessName}</span>
                    <span className="text-ink-500 ml-2 text-[11px] font-mono">{r.email}</span>
                  </div>
                  <div>
                    {r.success ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                        <CheckCircle2 size={10} /> {r.stageLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium text-[10px]">
                        {r.reason || 'Skipped'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Add to List Modal */}
      <Modal
        open={isAddToListOpen}
        onClose={() => setIsAddToListOpen(false)}
        title="Add Selected Leads to List"
        width="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Save <strong>{selectedIds.size}</strong> selected lead(s) into an organized list for future outreach.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-400">Choose Existing List</label>
            {store.lists.length === 0 ? (
              <p className="text-xs text-ink-400 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                No custom lists created yet. Create your first list below.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2">
                {store.lists.map((lst) => (
                  <div
                    key={lst.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 transition border border-transparent hover:border-slate-200"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Bookmark size={14} className="text-brand-600" />
                        <span className="text-sm font-semibold text-ink-800">{lst.name}</span>
                        <span className="text-xs text-ink-400 font-normal">({lst.lead_count})</span>
                      </div>
                      {lst.description && <p className="text-xs text-ink-400 mt-0.5">{lst.description}</p>}
                    </div>
                    <button
                      onClick={() => handleAddSelectedToList(lst.id)}
                      className="btn-secondary py-1 px-2.5 text-xs font-medium flex items-center gap-1 text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                    >
                      <Plus size={13} />
                      <span>Add</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1.5 block">
              Or Create New List & Save
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g. VIP Tech Founders, Follow-up in Oct"
                className="input text-xs"
              />
              <input
                type="text"
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
                placeholder="Description / note (optional)"
                className="input text-xs"
              />
              <button
                onClick={handleCreateNewList}
                disabled={!newListName.trim() || isCreatingList}
                className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-1.5"
              >
                <FolderPlus size={14} />
                <span>{isCreatingList ? 'Creating...' : 'Create List & Add Selected'}</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Manage Lists Modal */}
      <Modal
        open={isManageListsOpen}
        onClose={() => setIsManageListsOpen(false)}
        title="Custom Outreach Lists"
        width="lg"
      >
        <div className="space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">Create New List</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1 block">List Name</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g. High Priority Hot Leads"
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1 block">Description</label>
                <input
                  type="text"
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  placeholder="Notes or campaign segment"
                  className="input text-xs"
                />
              </div>
            </div>
            <button
              onClick={handleCreateNewList}
              disabled={!newListName.trim() || isCreatingList}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>{isCreatingList ? 'Creating...' : 'Add List'}</span>
            </button>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">
              Existing Lists ({store.lists.length})
            </h4>
            {store.lists.length === 0 ? (
              <p className="text-xs text-ink-400 italic py-4 text-center">No lists created yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {store.lists.map((lst) => (
                  <div key={lst.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bookmark size={15} className="text-brand-600" />
                        <span className="text-sm font-semibold text-ink-900">{lst.name}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                          {lst.lead_count} leads
                        </span>
                      </div>
                      {lst.description && <p className="text-xs text-ink-400 mt-1">{lst.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedListFilter(lst.id);
                          store.refreshAll(lst.id, selectedBatchFilter);
                          setIsManageListsOpen(false);
                        }}
                        className="btn-secondary text-xs py-1 px-2.5"
                      >
                        View Leads
                      </button>
                      <button
                        onClick={() => handleDeleteList(lst.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Delete List"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Confirm Bulk Delete Modal */}
      <Modal
        open={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title="Confirm Soft-Deletion (28-Day Retention)"
        width="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button onClick={() => setIsConfirmDeleteOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleBulkDelete} className="btn-danger">
              <Trash2 size={15} /> Delete {selectedIds.size} Record{selectedIds.size > 1 ? 's' : ''}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
            <AlertCircle size={24} className="text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">Move {selectedIds.size} selected record(s) to Trash?</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Deleted records will be removed from both active leads and active clients. All message history will be preserved in Trash for <strong>28 days</strong>, during which you can restore them anytime.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Dedicated Inbound Email Replies Center Modal */}
      <InboundRepliesModal
        isOpen={isInboundInboxOpen}
        onClose={() => setIsInboundInboxOpen(false)}
        replies={store.inboundReplies}
        onOpenConversation={(entityId, entityType) => handleOpenEntityById(entityId, entityType)}
        onSyncInbox={handleSyncInbox}
        isSyncing={isSyncingInbox}
      />
    </div>
  );
}
