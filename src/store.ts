import { useState, useCallback, useMemo } from 'react';
import type { Lead, ConversationMessage, Campaign, QueueItem } from './types';
import {
  mockLeads,
  mockConversations,
  mockCampaigns,
  mockQueue,
} from './mockData';

export function useStore() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [conversations, setConversations] = useState<ConversationMessage[]>(mockConversations);
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [queue, setQueue] = useState<QueueItem[]>(mockQueue);

  const addLeads = useCallback((newLeads: Lead[]) => {
    setLeads((prev) => [...prev, ...newLeads]);
  }, []);

  const convertToClient = useCallback((leadId: string) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, entityType: 'client' as const, consentStatus: 'replied' as const } : l
      )
    );
  }, []);

  const addConversation = useCallback((msg: ConversationMessage) => {
    setConversations((prev) => [...prev, msg]);
  }, []);

  const addCampaign = useCallback((campaign: Campaign) => {
    setCampaigns((prev) => [...prev, campaign]);
  }, []);

  const addQueueItems = useCallback((items: QueueItem[]) => {
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const removeQueueItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const updateLeadConsent = useCallback((leadId: string, status: Lead['consentStatus']) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, consentStatus: status } : l)));
  }, []);

  const conversationsByLead = useCallback(
    (leadId: string) => conversations.filter((m) => m.leadId === leadId).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [conversations]
  );

  return useMemo(
    () => ({
      leads,
      conversations,
      campaigns,
      queue,
      addLeads,
      convertToClient,
      addConversation,
      addCampaign,
      addQueueItems,
      removeQueueItem,
      updateLeadConsent,
      conversationsByLead,
    }),
    [
      leads,
      conversations,
      campaigns,
      queue,
      addLeads,
      convertToClient,
      addConversation,
      addCampaign,
      addQueueItems,
      removeQueueItem,
      updateLeadConsent,
      conversationsByLead,
    ]
  );
}

export type Store = ReturnType<typeof useStore>;
