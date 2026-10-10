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
  InboundReplyMessage,
  ScheduledDispatch,
  ScheduleListRequest,
  ScheduleSingleRequest,
  ScheduleBatchRequest,
  AutopilotStatus,
  AutopilotSettingsUpdate,
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
  const [autopilotStatus, setAutopilotStatus] = useState<AutopilotStatus | null>(null);
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

      const [leadsData, clientsData, campaignsData, queueData, healthData, listsData, batchesData, trashData, inboundData, dispatchesData, autoStatusData] = await Promise.all([
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
        api.getAutopilotStatus().catch((err) => {
          console.error('Failed to load autopilot status:', err);
          return null;
        }),
      ]);

      if (autoStatusData) {
        setAutopilotStatus(autoStatusData);
      }

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

  const scheduleSingleDispatch = useCallback(
    async (params: ScheduleSingleRequest) => {
      const res = await api.scheduleSingleDispatch(params);
      await fetchDispatches();
      return res;
    },
    [fetchDispatches]
  );

  const scheduleBatchDispatch = useCallback(
    async (params: ScheduleBatchRequest) => {
      const res = await api.scheduleBatchDispatch(params);
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

  const deleteFailedDispatches = useCallback(async () => {
    const res = await api.deleteFailedDispatches();
    setDispatches((prev) => prev.filter((d) => d.status !== 'failed'));
    return res;
  }, []);

  const deleteScheduledDispatch = useCallback(async (id: string) => {
    await api.deleteScheduledDispatch(id);
    setDispatches((prev) => prev.filter((d) => d.id !== id));
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
      linkedin?: string;
      status?: 'active' | 'inactive' | 'paused';
      notes?: string;
      listId?: string;
      batchId?: string;
      enrichGoogle?: boolean;
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
      alsoSubmitWebsiteForm?: boolean;
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

        // Inbound inbox update: Immediately mark answered inbound messages as replied and read in local state
        setInboundReplies((prev) =>
          prev.map((r) =>
            (r.lead_id === entityId || r.client_id === entityId)
              ? { ...r, is_replied: true, replied_at: new Date().toISOString(), is_read: true, read_at: new Date().toISOString() }
              : r
          )
        );

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

  // Delete campaign
  const deleteCampaign = useCallback(async (id: string) => {
    try {
      await api.deleteCampaign(id);
      const fresh = await api.getCampaigns();
      setCampaigns(fresh);
    } catch (err) {
      console.error('[Store] deleteCampaign error:', err);
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

  const addQueueItem = useCallback(
    async (payload: {
      leadId?: string;
      clientId?: string;
      campaignId?: string;
      channel: Channel;
      messagePreview: string;
      leadName?: string;
      campaignName?: string;
    }) => {
      try {
        await api.addToQueue(payload);
        const freshQueue = await api.getQueue();
        setQueue(freshQueue);
      } catch (err) {
        console.error('[Store] addQueueItem error:', err);
        throw err;
      }
    },
    []
  );

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

  const markMessageRead = useCallback(async (messageId: string, isRead: boolean = true) => {
    try {
      await api.markMessageRead(messageId, isRead);
      const readTimestamp = isRead ? new Date().toISOString() : null;
      setConversations((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_read: isRead, read_at: readTimestamp } : m))
      );
      setInboundReplies((prev) =>
        prev.map((r) => (r.id === messageId ? { ...r, is_read: isRead, read_at: readTimestamp } : r))
      );
    } catch (err) {
      console.error('[Store] markMessageRead error:', err);
    }
  }, []);

  const markEntityInboundRead = useCallback(async (entityType: 'lead' | 'client', entityId: string, isRead: boolean = true) => {
    try {
      await api.markEntityInboundRead(entityType, entityId, isRead);
      const readTimestamp = isRead ? new Date().toISOString() : null;
      setConversations((prev) =>
        prev.map((m) => (m.leadId === entityId ? { ...m, is_read: isRead, read_at: readTimestamp } : m))
      );
      setInboundReplies((prev) =>
        prev.map((r) =>
          (r.lead_id === entityId || r.client_id === entityId)
            ? { ...r, is_read: isRead, read_at: readTimestamp }
            : r
        )
      );
    } catch (err) {
      console.error('[Store] markEntityInboundRead error:', err);
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

  // Delete a single lead or client (moves to trash for 28 days, removes from everywhere)
  const deleteLead = useCallback(
    async (id: string) => {
      try {
        const target = leads.find((l) => l.id === id);
        // 1. Optimistic removal from active CRM, queue, dispatches, conversations, inbound
        setLeads((prev) => prev.filter((l) => l.id !== id));
        setQueue((prev) => prev.filter((q) => q.leadId !== id));
        setDispatches((prev) => prev.filter((d) => d.lead_id !== id && d.client_id !== id));
        setConversations((prev) => prev.filter((c) => c.leadId !== id));
        setInboundReplies((prev) =>
          prev.filter(
            (m) =>
              (m as any).lead_id !== id &&
              (m as any).leadId !== id &&
              (m as any).client_id !== id &&
              (m as any).clientId !== id
          )
        );

        // 2. Optimistically move into Trash Bin
        if (target) {
          const softDeletedLead: Lead = {
            ...target,
            deletedAt: new Date().toISOString(),
            daysRemaining: 28,
          };
          setTrashLeads((prev) => [softDeletedLead, ...prev.filter((t) => t.id !== id)]);
        }

        // 3. Persist to API
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

  // Update a single lead
  const updateLead = useCallback(
    async (id: string, updates: Partial<Lead>) => {
      try {
        const updated = await api.updateLead(id, updates);
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
        await refreshAll();
        return updated;
      } catch (err) {
        console.error('[Store] updateLead error:', err);
        await refreshAll();
        throw err;
      }
    },
    [refreshAll]
  );

  // Bulk delete leads/clients (moves to trash for 28 days, removes from everywhere)
  const bulkDeleteLeads = useCallback(
    async (ids: string[]) => {
      try {
        const idSet = new Set(ids);
        const deletedTargets = leads
          .filter((l) => idSet.has(l.id))
          .map((l) => ({
            ...l,
            deletedAt: new Date().toISOString(),
            daysRemaining: 28,
          }));

        // 1. Optimistic removal from active CRM, queue, dispatches, conversations, inbound
        setLeads((prev) => prev.filter((l) => !idSet.has(l.id)));
        setQueue((prev) => prev.filter((q) => !idSet.has(q.leadId)));
        setDispatches((prev) =>
          prev.filter((d) => !idSet.has(d.lead_id || '') && !idSet.has(d.client_id || ''))
        );
        setConversations((prev) => prev.filter((c) => !idSet.has(c.leadId)));
        setInboundReplies((prev) =>
          prev.filter(
            (m) =>
              !idSet.has((m as any).lead_id) &&
              !idSet.has((m as any).leadId) &&
              !idSet.has((m as any).client_id) &&
              !idSet.has((m as any).clientId)
          )
        );

        // 2. Optimistically add to Trash Bin
        setTrashLeads((prev) => [...deletedTargets, ...prev.filter((t) => !idSet.has(t.id))]);

        // 3. Persist to API
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

  const deleteDuplicateLeads = useCallback(
    async (ids?: string[]) => {
      try {
        const res = await api.deleteDuplicateLeads(ids);
        if (ids && ids.length > 0) {
          setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
        } else {
          setLeads((prev) => prev.filter((l) => l.status !== 'duplicate'));
        }
        await refreshAll();
        return res;
      } catch (err) {
        console.error('[Store] deleteDuplicateLeads error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  // Update single lead or client status ('active' | 'inactive' | 'paused' | 'manual_review')
  const updateLeadStatus = useCallback(
    async (id: string, status: 'active' | 'inactive' | 'paused' | 'manual_review') => {
      try {
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
        const target = leads.find((l) => l.id === id);
        if (target?.entityType === 'client') {
          await api.updateClientStatus(id, status as any);
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
    async (ids: string[], status: 'active' | 'inactive' | 'paused' | 'manual_review') => {
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

        const promises: Promise<any>[] = [];
        if (leadIds.length > 0) promises.push(api.bulkUpdateLeadStatus(leadIds, status));
        if (clientIds.length > 0) {
          for (const cid of clientIds) {
            promises.push(api.updateClientStatus(cid, status as any));
          }
        }
        await Promise.all(promises);
        await refreshAll();
      } catch (err) {
        console.error('[Store] bulkUpdateLeadStatus error:', err);
        await refreshAll();
        throw err;
      }
    },
    [leads, refreshAll]
  );

  // Approve lead from manual review back to active
  const approveLeadReview = useCallback(
    async (id: string) => {
      try {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, status: 'active', manualReviewReason: undefined, manualReviewAt: undefined } : l
          )
        );
        await api.approveLeadReview(id);
        await refreshAll();
      } catch (err) {
        console.error('[Store] approveLeadReview error:', err);
        await refreshAll();
        throw err;
      }
    },
    [refreshAll]
  );

  // Bulk approve leads from manual review back to active
  const bulkApproveLeadReviews = useCallback(
    async (ids: string[]) => {
      try {
        const idSet = new Set(ids);
        setLeads((prev) =>
          prev.map((l) =>
            idSet.has(l.id) ? { ...l, status: 'active', manualReviewReason: undefined, manualReviewAt: undefined } : l
          )
        );
        await api.bulkApproveLeadReviews(ids);
        await refreshAll();
      } catch (err) {
        console.error('[Store] bulkApproveLeadReviews error:', err);
        await refreshAll();
        throw err;
      }
    },
    [refreshAll]
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
        const restoredTarget = trashLeads.find((l) => l.id === id);
        setTrashLeads((prev) => prev.filter((l) => l.id !== id));
        if (restoredTarget) {
          const cleanLead: Lead = {
            ...restoredTarget,
            deletedAt: null,
            daysRemaining: undefined,
          };
          setLeads((prev) => [cleanLead, ...prev.filter((l) => l.id !== id)]);
        }
        const restored = await api.restoreLead(id);
        await refreshAll();
        return restored;
      } catch (err) {
        console.error('[Store] restoreLead error:', err);
        await refreshAll();
        throw err;
      }
    },
    [trashLeads, refreshAll]
  );

  const bulkRestoreLeads = useCallback(
    async (ids: string[]) => {
      try {
        const idSet = new Set(ids);
        const restoredTargets = trashLeads
          .filter((l) => idSet.has(l.id))
          .map((l) => ({
            ...l,
            deletedAt: null,
            daysRemaining: undefined,
          }));
        setTrashLeads((prev) => prev.filter((l) => !idSet.has(l.id)));
        setLeads((prev) => [...restoredTargets, ...prev.filter((l) => !idSet.has(l.id))]);
        const count = await api.bulkRestoreLeads(ids);
        await refreshAll();
        return count;
      } catch (err) {
        console.error('[Store] bulkRestoreLeads error:', err);
        await refreshAll();
        throw err;
      }
    },
    [trashLeads, refreshAll]
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
      setInboundReplies((prev) =>
        prev.filter(
          (m) =>
            (m as any).lead_id !== id &&
            (m as any).leadId !== id &&
            (m as any).client_id !== id &&
            (m as any).clientId !== id
        )
      );
      await refreshAll();
    } catch (err) {
      console.error('[Store] permanentDeleteLead error:', err);
      throw err;
    }
  }, [refreshAll]);

  const bulkPermanentDeleteLeads = useCallback(async (ids: string[]) => {
    try {
      const count = await api.bulkPermanentDeleteLeads(ids);
      const idSet = new Set(ids);
      setTrashLeads((prev) => prev.filter((l) => !idSet.has(l.id)));
      setInboundReplies((prev) =>
        prev.filter(
          (m) =>
            !idSet.has((m as any).lead_id) &&
            !idSet.has((m as any).leadId) &&
            !idSet.has((m as any).client_id) &&
            !idSet.has((m as any).clientId)
        )
      );
      await refreshAll();
      return count;
    } catch (err) {
      console.error('[Store] bulkPermanentDeleteLeads error:', err);
      throw err;
    }
  }, [refreshAll]);

  const enrichLeadFromGoogle = useCallback(
    async (leadId: string) => {
      try {
        const enriched = await api.enrichLeadFromGoogle(leadId);
        setLeads((prev) => prev.map((l) => (l.id === leadId ? enriched : l)));
        return enriched;
      } catch (err) {
        console.error('[Store] enrichLeadFromGoogle error:', err);
        throw err;
      }
    },
    []
  );

  const syncLeadFromGoogleMaps = useCallback(
    async (leadId: string, googleMapsUrl?: string) => {
      try {
        const synced = await api.syncGoogleMaps(leadId, googleMapsUrl);
        setLeads((prev) => prev.map((l) => (l.id === leadId ? synced : l)));
        return synced;
      } catch (err) {
        console.error('[Store] syncLeadFromGoogleMaps error:', err);
        throw err;
      }
    },
    []
  );

  const submitWebsiteForm = useCallback(
    async (
      leadId: string,
      payload: {
        senderName?: string;
        senderEmail?: string;
        senderPhone?: string;
        subject?: string;
        message: string;
      }
    ) => {
      try {
        const res = await api.submitWebsiteForm(leadId, payload);
        const msgs = await api.getMessagesByLead(leadId);
        setConversations((prev) => {
          const others = prev.filter((m) => m.leadId !== leadId);
          return [...others, ...msgs];
        });
        return res;
      } catch (err) {
        console.error('[Store] submitWebsiteForm error:', err);
        throw err;
      }
    },
    []
  );

  const fetchLeads = useCallback(async (listId?: string, batchId?: string) => {
    try {
      const [leadsData, clientsData] = await Promise.all([
        api.getLeads(listId, batchId).catch((err) => {
          console.error('Failed to load leads:', err);
          return [] as Lead[];
        }),
        api.getClients().catch((err) => {
          console.error('Failed to load clients:', err);
          return [] as Lead[];
        }),
      ]);

      if ((listId && listId !== 'all') || (batchId && batchId !== 'all')) {
        setLeads(leadsData);
      } else {
        setLeads([...leadsData, ...clientsData]);
      }
    } catch (err) {
      console.error('[Store] fetchLeads error:', err);
    }
  }, []);

  const syncGmb = useCallback(async () => {
    try {
      const res = await api.syncGmb();
      await fetchLeads();
      return res;
    } catch (err) {
      console.error('[Store] syncGmb error:', err);
      throw err;
    }
  }, [fetchLeads]);

  const getGmbSyncStatus = useCallback(async () => {
    try {
      return await api.getGmbSyncStatus();
    } catch (err) {
      console.error('[Store] getGmbSyncStatus error:', err);
      throw err;
    }
  }, []);

  const scrapeLeadLocations = useCallback(
    async (options?: {
      batchSize?: number;
      delayMs?: number;
      overwriteIdentified?: boolean;
      leadIds?: string[];
    }) => {
      try {
        const res = await api.scrapeLeadLocations(options);
        return res;
      } catch (err) {
        console.error('[Store] scrapeLeadLocations error:', err);
        throw err;
      }
    },
    []
  );

  const getScrapeLocationsStatus = useCallback(async () => {
    return await api.getScrapeLocationsStatus();
  }, []);

  const stopScrapeLocations = useCallback(async () => {
    return await api.stopScrapeLocations();
  }, []);

  const scrapeSingleLeadLocation = useCallback(
    async (leadId: string) => {
      try {
        const res = await api.scrapeSingleLeadLocation(leadId);
        await fetchLeads();
        return res;
      } catch (err) {
        console.error('[Store] scrapeSingleLeadLocation error:', err);
        throw err;
      }
    },
    [fetchLeads]
  );

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

  // 24/7 Autopilot, Autonomous Drip Engine & Lead Enricher Handlers
  const fetchAutopilotStatus = useCallback(async () => {
    try {
      const data = await api.getAutopilotStatus();
      setAutopilotStatus(data);
      return data;
    } catch (err) {
      console.error('[Store] fetchAutopilotStatus error:', err);
      return null;
    }
  }, []);

  const toggleAutopilot = useCallback(
    async (enabled?: boolean, target: 'drip_engine' | 'inbound_agent' = 'drip_engine') => {
      try {
        await api.toggleAutopilot(enabled, target);
        await fetchAutopilotStatus();
      } catch (err) {
        console.error('[Store] toggleAutopilot error:', err);
        throw err;
      }
    },
    [fetchAutopilotStatus]
  );

  const updateAutopilotSettings = useCallback(async (settings: AutopilotSettingsUpdate) => {
    try {
      const res = await api.updateAutopilotSettings(settings);
      setAutopilotStatus(res.status);
    } catch (err) {
      console.error('[Store] updateAutopilotSettings error:', err);
      throw err;
    }
  }, []);

  const triggerAutopilotCycle = useCallback(async () => {
    try {
      const res = await api.triggerAutopilotCycle();
      setAutopilotStatus(res.status);
      await refreshAll();
      return res;
    } catch (err) {
      console.error('[Store] triggerAutopilotCycle error:', err);
      throw err;
    }
  }, [refreshAll]);

  const enrichLeadsNow = useCallback(
    async (limit: number = 30) => {
      try {
        const res = await api.enrichLeadsNow(limit);
        await refreshAll();
        return res;
      } catch (err) {
        console.error('[Store] enrichLeadsNow error:', err);
        throw err;
      }
    },
    [refreshAll]
  );

  return useMemo(
    () => ({
      leads,
      autopilotStatus,
      fetchAutopilotStatus,
      toggleAutopilot,
      updateAutopilotSettings,
      triggerAutopilotCycle,
      enrichLeadsNow,
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
      fetchLeads,
      syncGmb,
      getGmbSyncStatus,
      scrapeLeadLocations,
      getScrapeLocationsStatus,
      stopScrapeLocations,
      scrapeSingleLeadLocation,
      addLeads,
      createSingleLead,
      deleteLead,
      updateLead,
      bulkDeleteLeads,
      deleteDuplicateLeads,
      enrichLeadFromGoogle,
      syncLeadFromGoogleMaps,
      submitWebsiteForm,
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
      approveLeadReview,
      bulkApproveLeadReviews,
      sendReply,
      addConversation,
      addCampaign,
      deleteCampaign,
      sendQueueItem,
      removeQueueItem,
      addQueueItem,
      fetchConversationsForEntity,
      conversationsByLead,
      syncEmailReplies,
      inboundReplies,
      latestReplyNotification,
      fetchInboundReplies,
      markInboundSeen,
      markInboundHandled,
      markEntityInboundSeen,
      markMessageRead,
      markEntityInboundRead,
      dismissNotification,
      triggerNotification,
      dispatches,
      fetchDispatches,
      scheduleListDispatch,
      scheduleSingleDispatch,
      scheduleBatchDispatch,
      cancelScheduledDispatch,
      retryScheduledDispatch,
      deleteFailedDispatches,
      deleteScheduledDispatch,
    }),
    [
      autopilotStatus,
      fetchAutopilotStatus,
      toggleAutopilot,
      updateAutopilotSettings,
      triggerAutopilotCycle,
      enrichLeadsNow,
      dispatches,
      fetchDispatches,
      scheduleListDispatch,
      scheduleSingleDispatch,
      scheduleBatchDispatch,
      cancelScheduledDispatch,
      retryScheduledDispatch,
      deleteFailedDispatches,
      deleteScheduledDispatch,
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
      fetchLeads,
      syncGmb,
      getGmbSyncStatus,
      scrapeLeadLocations,
      getScrapeLocationsStatus,
      stopScrapeLocations,
      scrapeSingleLeadLocation,
      addLeads,
      createSingleLead,
      deleteLead,
      updateLead,
      bulkDeleteLeads,
      deleteDuplicateLeads,
      enrichLeadFromGoogle,
      syncLeadFromGoogleMaps,
      submitWebsiteForm,
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
      approveLeadReview,
      bulkApproveLeadReviews,
      sendReply,
      addConversation,
      addCampaign,
      deleteCampaign,
      sendQueueItem,
      removeQueueItem,
      addQueueItem,
      fetchConversationsForEntity,
      conversationsByLead,
      syncEmailReplies,
      inboundReplies,
      latestReplyNotification,
      fetchInboundReplies,
      markInboundSeen,
      markInboundHandled,
      markEntityInboundSeen,
      markMessageRead,
      markEntityInboundRead,
      dismissNotification,
      triggerNotification,
    ]
  );
}

export type Store = ReturnType<typeof useStore>;
