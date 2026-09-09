import { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  Lead,
  ConversationMessage,
  Campaign,
  QueueItem,
  ConsentStatus,
  Channel,
  CustomList,
  UploadBatch,
  Client,
  AutoSendNextResult,
  InboundReplyMessage,
  ScheduledDispatch,
  ScheduleListRequest,
} from './types';
import { api, type HealthResponse, type SendReplyResult } from './services/api';

export function useStore() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lists, setLists] = useState<CustomList[]>([]);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [trashLeads, setTrashLeads] = useState<Lead[]>([]);
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [inboundReplies, setInboundReplies] = useState<InboundReplyMessage[]>([]);
  const [latestReplyNotification, setLatestReplyNotification] = useState<InboundReplyMessage | null>(null);
  const [dispatches, setDispatches] = useState<ScheduledDispatch[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [health, setHealth] = useState<HealthResponse['health'] | null>(null);
  const [systemStatus, setSystemStatus] = useState<HealthResponse['system'] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load all initial data from backend API
  const refreshAll = useCallback(async (listId?: string, batchId?: string) => {
    try {
      setLoading(true);
      setError(null);

      const [leadsData, clientsData, campaignsData, queueData, healthData, listsData, batchesData, trashData, inboundData, dispatchesData] = await Promise.all([
        api.getLeads(listId, batchId).catch((err) => {
          console.error('Failed to load leads:', err);
          return [] as Lead[];
        }),
        api.getClients().catch((err) => {
          console.error('Failed to load clients:', err);
          return [] as Lead[];
        }),
        api.getCampaigns().catch((err) => {
          console.error('Failed to load campaigns:', err);
          return [] as Campaign[];
        }),
        api.getQueue().catch((err) => {
          console.error('Failed to load queue:', err);
          return [] as QueueItem[];
        }),
        api.getHealth().catch((err) => {
          console.error('Failed to load health:', err);
          return null;
        }),
        api.getLists().catch((err) => {
          console.error('Failed to load lists:', err);
          return [] as CustomList[];
        }),
        api.getBatches().catch((err) => {
          console.error('Failed to load batches:', err);
          return [] as UploadBatch[];
        }),
        api.getTrashLeads().catch((err) => {
          console.error('Failed to load trash leads:', err);
          return [] as Lead[];
        }),
        api.getInboundReplies().catch((err) => {
          console.error('Failed to load inbound replies:', err);
          return [] as InboundReplyMessage[];
        }),
        api.getScheduledDispatches().catch((err) => {
          console.error('Failed to load scheduled dispatches:', err);
          return [] as ScheduledDispatch[];
        }),
      ]);

      // If a specific list or batch is selected, only show leads matching that filter
      if ((listId && listId !== 'all') || (batchId && batchId !== 'all')) {
        setLeads(leadsData);
      } else {
        // Enforce single-entity view: distinct leads + clients
        setLeads([...leadsData, ...clientsData]);
      }

      setLists(listsData);
      setBatches(batchesData);
      setTrashLeads(trashData);
      setInboundReplies(inboundData);
      setDispatches(dispatchesData);
      setCampaigns(campaignsData);
      setQueue(queueData);
      if (healthData) {
        setHealth(healthData.health);
        setSystemStatus(healthData.system);
      }
    } catch (err) {
      console.error('[Store] refreshAll error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to backend API');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDispatches = useCallback(async (filter?: { status?: string; listId?: string }) => {
    try {
      const data = await api.getScheduledDispatches(filter);
      setDispatches(data);
    } catch (err) {
      console.error('Failed to fetch scheduled dispatches:', err);
    }
  }, []);

  const scheduleListDispatch = useCallback(
    async (params: ScheduleListRequest) => {
      const res = await api.scheduleListDispatch(params);
      await fetchDispatches();
      return res;
    },
    [fetchDispatches]
  );

  const cancelScheduledDispatch = useCallback(async (id: string) => {
    await api.cancelScheduledDispatch(id);
    setDispatches((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'cancelled' as const } : d))
    );
  }, []);

  const retryScheduledDispatch = useCallback(async (id: string) => {
    await api.retryScheduledDispatch(id);
    setDispatches((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: 'scheduled' as const, scheduled_for: new Date().toISOString() }
          : d
      )
    );
  }, []);


  const fetchHealth = useCallback(async () => {
    try {
      const healthData = await api.getHealth();
      if (healthData) {
        setHealth(healthData.health);
        setSystemStatus(healthData.system);
      }
    } catch (err) {
      console.error('[Store] fetchHealth error:', err);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Upload Batches
  const fetchBatches = useCallback(async () => {
    try {
      const freshBatches = await api.getBatches();
      setBatches(freshBatches);
      return freshBatches;
    } catch (err) {
      console.error('[Store] fetchBatches error:', err);
      return [];
    }
  }, []);

  // Bulk import leads with server-side deduplication against both leads and clients
  const addLeads = useCallback(
    async (newLeads: Partial<Lead>[], batchName?: string) => {
      try {
        const result = await api.importLeads(newLeads, batchName);
        // Refresh leads and clients list from server
        const [freshLeads, freshClients] = await Promise.all([api.getLeads(), api.getClients()]);
        setLeads([...freshLeads, ...freshClients]);
        await fetchBatches();
        return result;
      } catch (err) {
        console.error('[Store] addLeads error:', err);
        throw err;
      }
    },
    [fetchBatches]
  );

  // Add single lead with manual form details, validation, and optional list assignment
  const createSingleLead = useCallback(
    async (leadData: {
      businessName: string;
      category?: string;
      phone?: string;
      email?: string;
      instagram?: string;
      facebook?: string;
      whatsapp?: string;
      status?: 'active' | 'inactive' | 'paused';
      notes?: string;
      listId?: string;
      batchId?: string;
    }) => {
      try {
        const created = await api.createLead(leadData);
        await refreshAll();
        return created;
      } catch (err) {
        console.error('[Store] createSingleLead error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  // Convert lead to client in database
  const convertToClient = useCallback(async (leadId: string, notes?: string) => {
    try {
      const res = await api.convertLeadToClient(leadId, notes);
      // Refresh list to show updated client status
      const [freshLeads, freshClients] = await Promise.all([api.getLeads(), api.getClients()]);
      setLeads([...freshLeads, ...freshClients]);
      return res;
    } catch (err) {
      console.error('[Store] convertToClient error:', err);
      throw err;
    }
  }, []);

  // Unmark client and revert back to active lead
  const unmarkClient = useCallback(async (clientId: string) => {
    try {
      const res = await api.unmarkClient(clientId);
      const [freshLeads, freshClients] = await Promise.all([api.getLeads(), api.getClients()]);
      setLeads([...freshLeads, ...freshClients]);
      return res;
    } catch (err) {
      console.error('[Store] unmarkClient error:', err);
      throw err;
    }
  }, []);

  // Update lead consent status
  const updateLeadConsent = useCallback(async (leadId: string, status: ConsentStatus) => {
    try {
      // Optimistic update
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, consentStatus: status } : l)));
      await api.updateLeadConsent(leadId, status);
    } catch (err) {
      console.error('[Store] updateLeadConsent error:', err);
      // Refresh to restore accurate state
      const [freshLeads, freshClients] = await Promise.all([api.getLeads(), api.getClients()]);
      setLeads([...freshLeads, ...freshClients]);
      throw err;
    }
  }, []);

  // Send outbound message / reply through Channel Router
  const sendReply = useCallback(
    async (params: {
      leadId?: string;
      clientId?: string;
      channel: Channel;
      text: string;
    }): Promise<SendReplyResult> => {
      try {
        const res = await api.sendReply(params);

        // If an item was queued as draft, reload the queue
        if (res.result?.actionTaken === 'queued_draft') {
          const freshQueue = await api.getQueue();
          setQueue(freshQueue);
        }

        // If recipient was a lead or client, refresh conversation history
        const entityId = params.leadId || params.clientId;
        if (entityId) {
          const msgs = params.clientId
            ? await api.getMessagesByClient(params.clientId)
            : await api.getMessagesByLead(params.leadId!);
          setConversations((prev) => {
            const others = prev.filter((m) => m.leadId !== entityId);
            return [...others, ...msgs];
          });
        }

        // Inbound inbox update: Immediately refresh inbound replies so answered messages leave the queue
        try {
          const freshInbound = await api.getInboundReplies();
          setInboundReplies(freshInbound);
        } catch (inboundErr) {
          console.warn('[Store] Background inbound refresh warning:', inboundErr);
        }

        return res;
      } catch (err) {
        console.error('[Store] sendReply error:', err);
        throw err;
      }
    },
    []
  );

  // Backwards-compatible addConversation
  const addConversation = useCallback(
    async (msg: ConversationMessage) => {
      await sendReply({
        leadId: msg.leadId,
        channel: msg.channel,
        text: msg.text,
      });
    },
    [sendReply]
  );

  // Add new campaign
  const addCampaign = useCallback(async (campaign: Campaign) => {
    try {
      await api.createCampaign({
        name: campaign.name,
        targetCategory: campaign.targetCategory,
        targetChannel: campaign.targetChannel,
        steps: campaign.steps,
      });
      const fresh = await api.getCampaigns();
      setCampaigns(fresh);
    } catch (err) {
      console.error('[Store] addCampaign error:', err);
      throw err;
    }
  }, []);

  // Queue actions
  const sendQueueItem = useCallback(async (id: string) => {
    try {
      await api.sendQueueItem(id);
      const freshQueue = await api.getQueue();
      setQueue(freshQueue);
    } catch (err) {
      console.error('[Store] sendQueueItem error:', err);
      throw err;
    }
  }, []);

  const removeQueueItem = useCallback(async (id: string) => {
    try {
      await api.discardQueueItem(id);
      setQueue((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      console.error('[Store] removeQueueItem error:', err);
      throw err;
    }
  }, []);

  // Fetch messages dynamically for a lead or client
  const fetchConversationsForEntity = useCallback(async (id: string, isClient: boolean = false) => {
    try {
      const msgs = isClient ? await api.getMessagesByClient(id) : await api.getMessagesByLead(id);
      setConversations((prev) => {
        const others = prev.filter((m) => m.leadId !== id);
        return [...others, ...msgs];
      });
      return msgs;
    } catch (err) {
      console.error('[Store] fetchConversationsForEntity error:', err);
      return [];
    }
  }, []);

  const conversationsByLead = useCallback(
    (leadId: string) =>
      conversations
        .filter((m) => m.leadId === leadId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [conversations]
  );

  const fetchInboundReplies = useCallback(async (channel?: string) => {
    try {
      const data = await api.getInboundReplies(channel);
      setInboundReplies(data);
      return data;
    } catch (err) {
      console.error('[Store] fetchInboundReplies error:', err);
      return [];
    }
  }, []);

  const dismissNotification = useCallback(() => {
    setLatestReplyNotification(null);
  }, []);

  const triggerNotification = useCallback((reply: InboundReplyMessage) => {
    setLatestReplyNotification(reply);
  }, []);

  const markInboundSeen = useCallback(async (replyId: string) => {
    try {
      await api.markInboundSeen(replyId);
      const updated = await api.getInboundReplies();
      setInboundReplies(updated);
    } catch (err) {
      console.error('[Store] markInboundSeen error:', err);
    }
  }, []);

  const markInboundHandled = useCallback(async (replyId: string) => {
    try {
      await api.markInboundHandled(replyId);
      const updated = await api.getInboundReplies();
      setInboundReplies(updated);
    } catch (err) {
      console.error('[Store] markInboundHandled error:', err);
    }
  }, []);

  const markEntityInboundSeen = useCallback(async (entityType: 'lead' | 'client', entityId: string) => {
    try {
      await api.markEntityInboundSeen(entityType, entityId);
      const updated = await api.getInboundReplies();
      setInboundReplies(updated);
    } catch (err) {
      console.error('[Store] markEntityInboundSeen error:', err);
    }
  }, []);

  // Synchronize incoming email replies from Gmail IMAP
  const syncEmailReplies = useCallback(async () => {
    try {
      const res = await api.syncEmailReplies();
      const updatedReplies = await api.getInboundReplies();
      setInboundReplies(updatedReplies);

      if (res.syncedCount > 0 || (res.newReplies && res.newReplies.length > 0)) {
        await refreshAll();
        if (res.newReplies && res.newReplies.length > 0) {
          const newest = res.newReplies[0];
          const matched = updatedReplies.find(
            (r) => (r.lead_id === newest.entityId || r.client_id === newest.entityId)
          ) || {
            id: `reply-${Date.now()}`,
            conversation_id: '',
            channel: 'email' as Channel,
            direction: 'inbound' as const,
            text: newest.text,
            sent_at: new Date().toISOString(),
            status: 'delivered',
            entity_type: newest.entityType,
            lead_id: newest.entityType === 'lead' ? newest.entityId : null,
            client_id: newest.entityType === 'client' ? newest.entityId : null,
            business_name: newest.businessName,
            email: newest.senderEmail,
            category: 'Inbound Reply',
            entity_status: 'active',
            consent_status: 'replied',
          };
          setLatestReplyNotification(matched);
        }
      }
      return res;
    } catch (err) {
      console.error('[Store] syncEmailReplies error:', err);
      throw err;
    }
  }, [refreshAll]);

  // Periodically check for new Gmail replies (every 30s)
  useEffect(() => {
    const timer = setInterval(() => {
      syncEmailReplies().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [syncEmailReplies]);

  // Delete a single lead or client (moves to trash for 28 days, removes from leads & clients)
  const deleteLead = useCallback(
    async (id: string) => {
      try {
        setLeads((prev) => prev.filter((l) => l.id !== id));
        const target = leads.find((l) => l.id === id);
        if (target?.entityType === 'client') {
          await api.deleteClient(id);
        } else {
          await api.deleteLead(id);
        }
        await refreshAll();
      } catch (err) {
        console.error('[Store] deleteLead error:', err);
        await refreshAll();
        throw err;
      }
    },
    [leads, refreshAll]
  );

  // Bulk delete leads/clients (moves to trash for 28 days, removes from leads & clients)
  const bulkDeleteLeads = useCallback(
    async (ids: string[]) => {
      try {
        const idSet = new Set(ids);
        setLeads((prev) => prev.filter((l) => !idSet.has(l.id)));

        const leadIds: string[] = [];
        const clientIds: string[] = [];
        for (const id of ids) {
          const target = leads.find((l) => l.id === id);
          if (target?.entityType === 'client') {
            clientIds.push(id);
          } else {
            leadIds.push(id);
          }
        }

        await Promise.all([
          leadIds.length > 0 ? api.bulkDeleteLeads(leadIds) : Promise.resolve(),
          ...clientIds.map((cid) => api.deleteClient(cid)),
        ]);

        await refreshAll();
      } catch (err) {
        console.error('[Store] bulkDeleteLeads error:', err);
        await refreshAll();
        throw err;
      }
    },
    [leads, refreshAll]
  );

  // Update single lead or client status ('active' | 'inactive' | 'paused')
  const updateLeadStatus = useCallback(
    async (id: string, status: 'active' | 'inactive' | 'paused') => {
      try {
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
        const target = leads.find((l) => l.id === id);
        if (target?.entityType === 'client') {
          await api.updateClientStatus(id, status);
        } else {
          await api.updateLeadStatus(id, status);
        }
        await refreshAll();
      } catch (err) {
        console.error('[Store] updateLeadStatus error:', err);
        await refreshAll();
        throw err;
      }
    },
    [leads, refreshAll]
  );

  // Bulk update status for leads and clients
  const bulkUpdateLeadStatus = useCallback(
    async (ids: string[], status: 'active' | 'inactive' | 'paused') => {
      try {
        const idSet = new Set(ids);
        setLeads((prev) => prev.map((l) => (idSet.has(l.id) ? { ...l, status } : l)));

        const leadIds: string[] = [];
        const clientIds: string[] = [];
        for (const id of ids) {
          const target = leads.find((l) => l.id === id);
          if (target?.entityType === 'client') {
            clientIds.push(id);
          } else {
            leadIds.push(id);
          }
        }

        await Promise.all([
          leadIds.length > 0 ? api.bulkUpdateLeadStatus(leadIds, status) : Promise.resolve(),
          ...clientIds.map((cid) => api.updateClientStatus(cid, status)),
        ]);

        await refreshAll();
      } catch (err) {
        console.error('[Store] bulkUpdateLeadStatus error:', err);
        await refreshAll();
        throw err;
      }
    },
    [leads, refreshAll]
  );

  // Lists management
  const createList = useCallback(async (name: string, description?: string) => {
    try {
      const newList = await api.createList(name, description);
      setLists((prev) => [...prev, newList]);
      return newList;
    } catch (err) {
      console.error('[Store] createList error:', err);
      throw err;
    }
  }, []);

  const deleteList = useCallback(async (id: string) => {
    try {
      setLists((prev) => prev.filter((l) => l.id !== id));
      await api.deleteList(id);
    } catch (err) {
      console.error('[Store] deleteList error:', err);
      throw err;
    }
  }, []);

  const addLeadsToList = useCallback(async (listId: string, leadIds: string[]) => {
    try {
      await api.addLeadsToList(listId, leadIds);
      const [freshLists, freshLeads, freshClients] = await Promise.all([
        api.getLists(),
        api.getLeads(),
        api.getClients(),
      ]);
      setLists(freshLists);
      setLeads([...freshLeads, ...freshClients]);
    } catch (err) {
      console.error('[Store] addLeadsToList error:', err);
      throw err;
    }
  }, []);

  const removeLeadsFromList = useCallback(async (listId: string, leadIds: string[]) => {
    try {
      await api.removeLeadsFromList(listId, leadIds);
      const [freshLists, freshLeads, freshClients] = await Promise.all([
        api.getLists(),
        api.getLeads(),
        api.getClients(),
      ]);
      setLists(freshLists);
      setLeads([...freshLeads, ...freshClients]);
    } catch (err) {
      console.error('[Store] removeLeadsFromList error:', err);
      throw err;
    }
  }, []);

  const removeLeadFromList = useCallback(async (listId: string, leadId: string) => {
    try {
      await api.removeLeadFromList(listId, leadId);
      const [freshLists, freshLeads, freshClients] = await Promise.all([
        api.getLists(),
        api.getLeads(),
        api.getClients(),
      ]);
      setLists(freshLists);
      setLeads([...freshLeads, ...freshClients]);
    } catch (err) {
      console.error('[Store] removeLeadFromList error:', err);
      throw err;
    }
  }, []);


  const shootBatchEmails = useCallback(
    async (batchId: string) => {
      try {
        const result = await api.shootBatchEmails(batchId);
        await refreshAll();
        return result;
      } catch (err) {
        console.error('[Store] shootBatchEmails error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  const deleteBatch = useCallback(async (batchId: string) => {
    try {
      await api.deleteBatch(batchId);
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
    } catch (err) {
      console.error('[Store] deleteBatch error:', err);
      throw err;
    }
  }, []);

  // Client Update
  const updateClient = useCallback(async (id: string, data: Partial<Client>) => {
    try {
      const updated = await api.updateClient(id, data);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                businessName: updated.business_name,
                primaryContactName: updated.primary_contact_name,
                category: updated.category,
                phone: updated.phone,
                email: updated.email,
                instagram: updated.instagram,
                facebook: updated.facebook,
                whatsapp: updated.whatsapp,
                notes: updated.notes,
              }
            : l
        )
      );
      return updated;
    } catch (err) {
      console.error('[Store] updateClient error:', err);
      throw err;
    }
  }, []);

  // 28-Day Trash & Retention
  const fetchTrash = useCallback(async () => {
    try {
      const trash = await api.getTrashLeads();
      setTrashLeads(trash);
      return trash;
    } catch (err) {
      console.error('[Store] fetchTrash error:', err);
      return [];
    }
  }, []);

  const restoreLead = useCallback(
    async (id: string) => {
      try {
        const restored = await api.restoreLead(id);
        setTrashLeads((prev) => prev.filter((l) => l.id !== id));
        await refreshAll();
        return restored;
      } catch (err) {
        console.error('[Store] restoreLead error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  const bulkRestoreLeads = useCallback(
    async (ids: string[]) => {
      try {
        const count = await api.bulkRestoreLeads(ids);
        setTrashLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
        await refreshAll();
        return count;
      } catch (err) {
        console.error('[Store] bulkRestoreLeads error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  const restoreAllTrash = useCallback(async () => {
    try {
      const freshTrash = await api.getTrashLeads();
      const allIds = freshTrash.map((l) => l.id);
      if (allIds.length === 0) return 0;
      const count = await api.bulkRestoreLeads(allIds);
      setTrashLeads([]);
      await refreshAll();
      return count;
    } catch (err) {
      console.error('[Store] restoreAllTrash error:', err);
      throw err;
    }
  }, [refreshAll]);

  const permanentDeleteLead = useCallback(async (id: string) => {
    try {
      await api.permanentDeleteLead(id);
      setTrashLeads((prev) => prev.filter((l) => l.id !== id));
      await refreshAll();
    } catch (err) {
      console.error('[Store] permanentDeleteLead error:', err);
      throw err;
    }
  }, [refreshAll]);

  const bulkPermanentDeleteLeads = useCallback(async (ids: string[]) => {
    try {
      const count = await api.bulkPermanentDeleteLeads(ids);
      setTrashLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      await refreshAll();
      return count;
    } catch (err) {
      console.error('[Store] bulkPermanentDeleteLeads error:', err);
      throw err;
    }
  }, [refreshAll]);

  const clearTrash = useCallback(async () => {
    try {
      const count = await api.clearTrash();
      setTrashLeads([]);
      await refreshAll();
      return count;
    } catch (err) {
      console.error('[Store] clearTrash error:', err);
      throw err;
    }
  }, [refreshAll]);

  // Automated Condition-Based Stage Send
  const autoSendNextStep = useCallback(
    async (leadIdOrIds: string | string[]) => {
      try {
        const result = await api.autoSendNextStep(leadIdOrIds);
        await refreshAll();
        return result;
      } catch (err) {
        console.error('[Store] autoSendNextStep error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  return useMemo(
    () => ({
      leads,
      lists,
      batches,
      trashLeads,
      conversations,
      campaigns,
      queue,
      health,
      systemStatus,
      loading,
      error,
      fetchHealth,
      refreshAll,
      addLeads,
      createSingleLead,
      deleteLead,
      bulkDeleteLeads,
      createList,
      deleteList,
      addLeadsToList,
      removeLeadsFromList,
      removeLeadFromList,
      fetchBatches,
      shootBatchEmails,
      deleteBatch,
      updateClient,
      fetchTrash,
      restoreLead,
      bulkRestoreLeads,
      restoreAllTrash,
      permanentDeleteLead,
      bulkPermanentDeleteLeads,
      clearTrash,
      autoSendNextStep,
      convertToClient,
      unmarkClient,
      updateLeadConsent,
      updateLeadStatus,
      bulkUpdateLeadStatus,
      sendReply,
      addConversation,
      addCampaign,
      sendQueueItem,
      removeQueueItem,
      fetchConversationsForEntity,
      conversationsByLead,
      syncEmailReplies,
      inboundReplies,
      latestReplyNotification,
      fetchInboundReplies,
      markInboundSeen,
      markInboundHandled,
      markEntityInboundSeen,
      dismissNotification,
      triggerNotification,
      dispatches,
      fetchDispatches,
      scheduleListDispatch,
      cancelScheduledDispatch,
      retryScheduledDispatch,
    }),
    [
      dispatches,
      fetchDispatches,
      scheduleListDispatch,
      cancelScheduledDispatch,
      retryScheduledDispatch,
      leads,
      lists,
      batches,
      trashLeads,
      conversations,
      campaigns,
      queue,
      health,
      systemStatus,
      loading,
      error,
      fetchHealth,
      refreshAll,
      addLeads,
      createSingleLead,
      deleteLead,
      bulkDeleteLeads,
      createList,
      deleteList,
      addLeadsToList,
      removeLeadsFromList,
      removeLeadFromList,
      fetchBatches,
      shootBatchEmails,
      deleteBatch,
      updateClient,
      fetchTrash,
      restoreLead,
      bulkRestoreLeads,
      restoreAllTrash,
      permanentDeleteLead,
      bulkPermanentDeleteLeads,
      clearTrash,
      autoSendNextStep,
      convertToClient,
      unmarkClient,
      updateLeadConsent,
      updateLeadStatus,
      bulkUpdateLeadStatus,
      sendReply,
      addConversation,
      addCampaign,
      sendQueueItem,
      removeQueueItem,
      fetchConversationsForEntity,
      conversationsByLead,
      syncEmailReplies,
      inboundReplies,
      latestReplyNotification,
      fetchInboundReplies,
      markInboundSeen,
      markInboundHandled,
      markEntityInboundSeen,
      dismissNotification,
      triggerNotification,
    ]
  );
}

export type Store = ReturnType<typeof useStore>;
