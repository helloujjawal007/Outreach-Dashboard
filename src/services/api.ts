import type {
  Lead,
  ConversationMessage,
  Campaign,
  QueueItem,
  Channel,
  ConsentStatus,
  SendHealthDay,
  CustomList,
  UploadBatch,
  Client,
  AutoSendNextResult,
  InboundReplyMessage,
  ScheduledDispatch,
  ScheduleListRequest,
  HumanizerPreviewResponse,
} from '@/types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

// Backend shape interfaces
export interface BackendLead {
  id: string;
  business_name: string;
  category: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  consent_status: ConsentStatus;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  batch_id?: string;
  outreach_stage?: 'initial' | 'followup_1' | 'followup_2' | 'completed';
  deleted_at?: string | null;
  days_remaining?: number;
  notes?: string;
  status?: 'active' | 'inactive' | 'paused';
  lists?: Array<{ id: string; name: string }>;
}

export interface BackendClient {
  id: string;
  original_lead_id: string | null;
  business_name: string;
  primary_contact_name: string;
  category: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  status: 'active' | 'paused' | 'churned';
  contract_value: number;
  onboarded_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BackendMessage {
  id: string;
  conversation_id: string;
  channel: Channel;
  direction: 'inbound' | 'outbound';
  text: string;
  status: 'draft' | 'sent' | 'delivered' | 'failed' | 'bounced';
  sent_at: string;
  created_at: string;
  lead_id?: string;
  client_id?: string;
}

export interface BackendQueueItem {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  channel: Channel;
  message_preview: string;
  status: 'draft' | 'approved' | 'sent' | 'discarded';
  scheduled_for: string;
  created_at: string;
  lead_name: string;
  campaign_name: string;
  step_name: string;
}

export interface HealthResponse {
  success: boolean;
  health: {
    level: 'green' | 'yellow' | 'red';
    label: string;
    description: string;
    isAutoThrottled: boolean;
    throttleReason: string;
    totals: {
      sent: number;
      bounced: number;
      complaints: number;
      drafted: number;
      bounceRate: number;
      complaintRate: number;
    };
    warmup?: {
      stage: number;
      stageName: string;
      dailyLimit: number;
      sentToday: number;
      remainingToday: number;
      isThrottled: boolean;
    };
    dailyData: SendHealthDay[];
  };
  system: {
    postgres: 'connected' | 'disconnected';
    ollama: 'online' | 'offline';
    ollamaModels: string[];
    ollamaError?: string;
  };
}

export interface SendReplyResult {
  success: boolean;
  result?: {
    allowed: boolean;
    channel: Channel;
    actionTaken: 'sent_direct' | 'queued_draft' | 'blocked_consent' | 'blocked_channel_rule' | 'throttled_warmup';
    reason?: string;
    messageId?: string;
    queueId?: string;
    deepLink?: string;
  };
  message?: unknown;
  actionTaken?: string;
  error?: string;
}

export interface DnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  name: string;
  value: string;
  status: 'valid' | 'pending' | 'failed';
  description: string;
}

export interface WarmupStatus {
  subdomain: string;
  stage: number;
  stageName: string;
  dailyLimit: number;
  sentToday: number;
  remainingToday: number;
  isThrottled: boolean;
  spf: 'valid' | 'pending' | 'failed';
  dkim: 'valid' | 'pending' | 'failed';
  dmarc: 'valid' | 'pending' | 'failed';
  dnsRecords: DnsRecord[];
}

export interface WhatsAppWindowStatus {
  hasInbound: boolean;
  isOpen: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingMinutes: number;
  reason: string;
}

export interface InboundSimulationResult {
  success: boolean;
  inboundMessage: BackendMessage;
  isOptOut: boolean;
  leadConsentStatus: ConsentStatus;
  clientConversion: {
    success: boolean;
    clientId?: string;
    leadId: string;
    message?: string;
  } | null;
}

// Mappers
export function mapBackendLeadToLead(b: BackendLead): Lead {
  return {
    id: b.id,
    businessName: b.business_name,
    category: b.category || 'Uncategorized',
    phone: b.phone || '',
    email: b.email || '',
    instagram: b.instagram || '',
    facebook: b.facebook || '',
    whatsapp: b.whatsapp || '',
    consentStatus: b.consent_status || 'none',
    entityType: 'lead',
    createdAt: b.created_at,
    lastContactedAt: b.last_contacted_at,
    batchId: b.batch_id,
    outreachStage: b.outreach_stage || 'initial',
    deletedAt: b.deleted_at,
    daysRemaining: b.days_remaining,
    notes: b.notes || '',
    status: b.status || 'active',
    lists: b.lists || [],
  };
}

export function mapBackendClientToLead(c: BackendClient): Lead {
  return {
    id: c.id,
    businessName: c.business_name,
    primaryContactName: c.primary_contact_name || '',
    category: c.category || 'Uncategorized',
    phone: c.phone || '',
    email: c.email || '',
    instagram: c.instagram || '',
    facebook: c.facebook || '',
    whatsapp: c.whatsapp || '',
    consentStatus: 'replied',
    entityType: 'client',
    createdAt: c.onboarded_at || c.created_at,
    lastContactedAt: c.updated_at,
    notes: c.notes || '',
    status: c.status || 'active',
  };
}

export function mapBackendMessage(m: BackendMessage, fallbackLeadId: string): ConversationMessage {
  return {
    id: m.id,
    leadId: m.lead_id || m.client_id || fallbackLeadId,
    channel: m.channel,
    direction: m.direction,
    text: m.text,
    timestamp: m.sent_at || m.created_at,
    status: m.status === 'bounced' ? 'failed' : m.status,
  };
}

export function mapBackendQueueItem(q: BackendQueueItem): QueueItem {
  return {
    id: q.id,
    leadId: q.lead_id || q.client_id || '',
    leadName: q.lead_name || 'Unknown',
    channel: q.channel,
    campaignName: q.campaign_name || 'Direct Outbound',
    stepName: q.step_name || 'Manual Touch',
    messagePreview: q.message_preview,
    status: 'draft',
    createdAt: q.created_at,
  };
}

// API Service
export const api = {
  // Leads
  async getLeads(listId?: string, batchId?: string): Promise<Lead[]> {
    const params = new URLSearchParams();
    if (listId && listId !== 'all') params.append('listId', listId);
    if (batchId && batchId !== 'all') params.append('batchId', batchId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const data = await request<{ success: boolean; leads: BackendLead[] }>(`/leads${queryString}`);
    return (data.leads || []).map(mapBackendLeadToLead);
  },

  async createLead(lead: {
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
  }): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead }>('/leads', {
      method: 'POST',
      body: JSON.stringify(lead),
    });
    return mapBackendLeadToLead(data.lead);
  },

  async deleteLead(id: string): Promise<void> {
    await request(`/leads/${id}`, { method: 'DELETE' });
  },

  async bulkDeleteLeads(ids: string[]): Promise<{ deletedCount: number }> {
    return request<{ success: boolean; deletedCount: number }>('/leads/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  // 28-Day Deletion History & Trash
  async getTrashLeads(): Promise<Lead[]> {
    const data = await request<{ success: boolean; count: number; leads: BackendLead[] }>('/leads/trash');
    return (data.leads || []).map(mapBackendLeadToLead);
  },

  async restoreLead(id: string): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead }>(`/leads/${id}/restore`, {
      method: 'POST',
    });
    return mapBackendLeadToLead(data.lead);
  },

  async bulkRestoreLeads(ids: string[]): Promise<number> {
    const data = await request<{ success: boolean; restoredCount: number }>('/leads/bulk-restore', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return data.restoredCount;
  },

  async permanentDeleteLead(id: string): Promise<void> {
    await request(`/leads/${id}/permanent`, { method: 'DELETE' });
  },

  async bulkPermanentDeleteLeads(ids: string[]): Promise<number> {
    const data = await request<{ success: boolean; purgedCount: number }>('/leads/trash/bulk-permanent-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return data.purgedCount ?? 0;
  },

  async clearTrash(): Promise<number> {
    const data = await request<{ success: boolean; clearedCount: number }>('/leads/trash/clear', {
      method: 'POST',
    });
    return data.clearedCount ?? 0;
  },

  async updateLeadStatus(id: string, status: 'active' | 'inactive' | 'paused'): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead }>(`/leads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return mapBackendLeadToLead(data.lead);
  },

  async bulkUpdateLeadStatus(ids: string[], status: 'active' | 'inactive' | 'paused'): Promise<number> {
    const data = await request<{ success: boolean; updatedCount: number }>('/leads/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
    return data.updatedCount ?? 0;
  },

  async deleteClient(id: string): Promise<void> {
    await request(`/clients/${id}`, { method: 'DELETE' });
  },

  async updateClientStatus(id: string, status: 'active' | 'paused' | 'churned' | 'inactive'): Promise<Client> {
    const data = await request<{ success: boolean; client: Client }>(`/clients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return data.client;
  },

  // Upload Batches Management (28-day retention)
  async getBatches(): Promise<UploadBatch[]> {
    const data = await request<{ success: boolean; batches: UploadBatch[] }>('/batches');
    return data.batches || [];
  },

  async shootBatchEmails(batchId: string): Promise<{
    success: boolean;
    batchName: string;
    totalProcessed: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    breakdown: { initial: number; followup_1: number; followup_2: number };
    results: AutoSendNextResult[];
  }> {
    return request(`/batches/${batchId}/shoot-emails`, { method: 'POST' });
  },

  async deleteBatch(batchId: string): Promise<void> {
    await request(`/batches/${batchId}`, { method: 'DELETE' });
  },

  // Client Update
  async updateClient(id: string, data: Partial<Client>): Promise<Client> {
    const res = await request<{ success: boolean; client: Client }>(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.client;
  },

  // Condition-Based Stage Outreach & Auto-Send
  async getLeadStage(leadId: string): Promise<{
    stage: 'initial' | 'followup_1' | 'followup_2' | 'completed';
    stageLabel: string;
    nextStepLabel: string;
    sentCount: number;
    subject: string;
    body: string;
  }> {
    return request(`/conversations/stage/${leadId}`);
  },

  async autoSendNextStep(leadIdOrIds: string | string[]): Promise<{
    success: boolean;
    result?: AutoSendNextResult;
    totalProcessed?: number;
    sentCount?: number;
    skippedCount?: number;
    failedCount?: number;
    breakdown?: { initial: number; followup_1: number; followup_2: number };
    results?: AutoSendNextResult[];
  }> {
    const body = Array.isArray(leadIdOrIds)
      ? { leadIds: leadIdOrIds }
      : { leadId: leadIdOrIds };

    return request('/conversations/auto-send-next', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Lists Management
  async getLists(): Promise<CustomList[]> {
    const data = await request<{ success: boolean; lists: CustomList[] }>('/lists');
    return data.lists || [];
  },

  async createList(name: string, description?: string): Promise<CustomList> {
    const data = await request<{ success: boolean; list: CustomList }>('/lists', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    return data.list;
  },

  async deleteList(id: string): Promise<void> {
    await request(`/lists/${id}`, { method: 'DELETE' });
  },

  async addLeadsToList(listId: string, leadIds: string[]): Promise<{ addedCount: number }> {
    return request<{ success: boolean; addedCount: number }>(`/lists/${listId}/members`, {
      method: 'POST',
      body: JSON.stringify({ leadIds }),
    });
  },

  async removeLeadsFromList(listId: string, leadIds: string[]): Promise<{ removedCount: number }> {
    return request<{ success: boolean; removedCount: number }>(`/lists/${listId}/members`, {
      method: 'DELETE',
      body: JSON.stringify({ leadIds }),
    });
  },

  async removeLeadFromList(listId: string, leadId: string): Promise<void> {
    await request(`/lists/${listId}/members/${leadId}`, {
      method: 'DELETE',
    });
  },

  async importLeads(leads: Partial<Lead>[], batchName?: string): Promise<{
    importedCount: number;
    duplicateCount: number;
    incompleteCount: number;
    batch?: UploadBatch;
    leads: Lead[];
  }> {
    const data = await request<{
      success: boolean;
      importedCount: number;
      duplicateCount: number;
      incompleteCount: number;
      batch?: UploadBatch;
      leads: BackendLead[];
    }>('/leads/import', {
      method: 'POST',
      body: JSON.stringify({ leads, batchName }),
    });

    return {
      importedCount: data.importedCount,
      duplicateCount: data.duplicateCount,
      incompleteCount: data.incompleteCount,
      batch: data.batch,
      leads: (data.leads || []).map(mapBackendLeadToLead),
    };
  },

  async updateLeadConsent(leadId: string, status: ConsentStatus): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead }>(`/leads/${leadId}/consent`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return mapBackendLeadToLead(data.lead);
  },


  // Clients
  async getClients(): Promise<Lead[]> {
    const data = await request<{ success: boolean; clients: BackendClient[] }>('/clients');
    return (data.clients || []).map(mapBackendClientToLead);
  },

  async convertLeadToClient(leadId: string, notes?: string): Promise<{ success: boolean; client: Lead; message?: string }> {
    const data = await request<{
      success: boolean;
      client: BackendClient;
      alreadyClient?: boolean;
      message?: string;
    }>('/clients/convert', {
      method: 'POST',
      body: JSON.stringify({ leadId, notes }),
    });
    return {
      success: data.success,
      client: mapBackendClientToLead(data.client),
      message: data.message,
    };
  },

  async unmarkClient(clientId: string): Promise<{ success: boolean; lead: Lead; message?: string }> {
    const data = await request<{
      success: boolean;
      lead: BackendLead;
      message?: string;
    }>(`/clients/${clientId}/unmark`, {
      method: 'POST',
    });
    return {
      success: data.success,
      lead: mapBackendLeadToLead(data.lead),
      message: data.message,
    };
  },

  // Conversations & Messages
  async getMessagesByLead(leadId: string): Promise<ConversationMessage[]> {
    const data = await request<{ success: boolean; messages: BackendMessage[] }>(`/conversations/by-lead/${leadId}`);
    return (data.messages || []).map((m) => mapBackendMessage(m, leadId));
  },

  async getMessagesByClient(clientId: string): Promise<ConversationMessage[]> {
    const data = await request<{ success: boolean; messages: BackendMessage[] }>(`/conversations/by-client/${clientId}`);
    return (data.messages || []).map((m) => mapBackendMessage(m, clientId));
  },

  async sendReply(params: {
    leadId?: string;
    clientId?: string;
    channel: Channel;
    text: string;
  }): Promise<SendReplyResult> {
    return request<SendReplyResult>('/conversations/reply', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async simulateInbound(params: {
    leadId: string;
    channel: Channel;
    text: string;
  }): Promise<InboundSimulationResult> {
    return request<InboundSimulationResult>('/conversations/inbound', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // Gmail IMAP Inbound Sync
  async syncEmailReplies(): Promise<{
    success: boolean;
    syncedCount: number;
    newReplies: Array<{
      senderEmail: string;
      businessName: string;
      text: string;
      subject: string;
      entityType: 'lead' | 'client';
      entityId: string;
    }>;
    bouncesRecorded: number;
    message: string;
  }> {
    return request<{
      success: boolean;
      syncedCount: number;
      newReplies: Array<{
        senderEmail: string;
        businessName: string;
        text: string;
        subject: string;
        entityType: 'lead' | 'client';
        entityId: string;
      }>;
      bouncesRecorded: number;
      message: string;
    }>('/conversations/sync-inbox', {
      method: 'POST',
    });
  },

  async getInboundReplies(
    channel?: string,
    status: 'pending' | 'handled' | 'all' = 'pending'
  ): Promise<InboundReplyMessage[]> {
    const params = new URLSearchParams();
    if (channel && channel !== 'all') params.append('channel', channel);
    if (status !== 'pending') params.append('status', status);
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const data = await request<{ success: boolean; count: number; replies: InboundReplyMessage[] }>(
      `/conversations/inbound-replies${queryStr}`
    );
    return data.replies || [];
  },

  async markInboundSeen(id: string): Promise<void> {
    await request(`/conversations/inbound-replies/${id}/seen`, {
      method: 'POST',
    });
  },

  async markInboundHandled(id: string): Promise<void> {
    await request(`/conversations/inbound-replies/${id}/handled`, {
      method: 'POST',
    });
  },

  async markEntityInboundSeen(entityType: 'lead' | 'client', entityId: string): Promise<void> {
    await request(`/conversations/entity/${entityType}/${entityId}/seen`, {
      method: 'POST',
    });
  },

  // Campaigns
  async getCampaigns(): Promise<Campaign[]> {
    const data = await request<{ success: boolean; campaigns: Campaign[] }>('/campaigns');
    return data.campaigns || [];
  },

  async createCampaign(campaign: Omit<Campaign, 'id' | 'createdAt'>): Promise<Campaign> {
    const data = await request<{ success: boolean; campaign: Campaign }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaign),
    });
    return data.campaign;
  },

  // Queue
  async getQueue(): Promise<QueueItem[]> {
    const data = await request<{ success: boolean; queue: BackendQueueItem[] }>('/queue');
    return (data.queue || []).map(mapBackendQueueItem);
  },

  async sendQueueItem(id: string): Promise<void> {
    await request(`/queue/${id}/send`, { method: 'POST' });
  },

  async discardQueueItem(id: string): Promise<void> {
    await request(`/queue/${id}/discard`, { method: 'POST' });
  },

  // Health
  async getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/health');
  },

  // Adapters
  async getEmailWarmupStatus(): Promise<WarmupStatus> {
    const data = await request<{ success: boolean; status: WarmupStatus }>('/adapters/email/warmup');
    return data.status;
  },

  async configureSubdomain(subdomain: string): Promise<void> {
    await request('/adapters/email/subdomain', {
      method: 'POST',
      body: JSON.stringify({ subdomain }),
    });
  },

  async setWarmupStage(stage: number): Promise<WarmupStatus> {
    const data = await request<{ success: boolean; status: WarmupStatus }>('/adapters/email/stage', {
      method: 'POST',
      body: JSON.stringify({ stage }),
    });
    return data.status;
  },

  async getWhatsAppWindowStatus(id: string, isClient?: boolean): Promise<WhatsAppWindowStatus> {
    const data = await request<{ success: boolean; status: WhatsAppWindowStatus }>(
      `/adapters/whatsapp/window/${id}${isClient ? '?isClient=true' : ''}`
    );
    return data.status;
  },

  async simulateWhatsAppInbound(params: { fromPhone: string; text: string }): Promise<void> {
    await request('/adapters/whatsapp/webhook', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // AI Assistant
  async generateAiDraft(params: {
    businessName?: string;
    category?: string;
    channel?: string;
    intent?: string;
  }): Promise<{ draft: string; modelUsed: string; fallback: boolean }> {
    const data = await request<{ success: boolean; draft: string; modelUsed: string; fallback: boolean }>(
      '/ai/draft',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return {
      draft: data.draft,
      modelUsed: data.modelUsed,
      fallback: data.fallback,
    };
  },

  // Deliverability Health & Signals
  async recordDeliverabilitySignal(params: {
    type: 'bounce' | 'complaint' | 'sent';
    count?: number;
    channel?: string;
  }): Promise<void> {
    await request('/health/signal', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async resetTodayHealthSignals(): Promise<void> {
    await request('/health/reset-today', {
      method: 'POST',
    });
  },

  // Automated Email Scheduler & Humanizer
  async previewHumanizedEmail(params: {
    listId?: string;
    leadId?: string;
    style?: 'conversational' | 'direct' | 'curious';
    stage?: string;
    customInstructions?: string;
  }): Promise<HumanizerPreviewResponse> {
    return request<HumanizerPreviewResponse>('/scheduler/preview', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async scheduleListDispatch(params: ScheduleListRequest): Promise<{
    success: boolean;
    scheduledCount: number;
    listName: string;
    scheduledFor: string;
    message: string;
  }> {
    return request<{
      success: boolean;
      scheduledCount: number;
      listName: string;
      scheduledFor: string;
      message: string;
    }>('/scheduler/schedule-list', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getScheduledDispatches(filter?: {
    status?: string;
    listId?: string;
    limit?: number;
  }): Promise<ScheduledDispatch[]> {
    const params = new URLSearchParams();
    if (filter?.status && filter.status !== 'all') params.append('status', filter.status);
    if (filter?.listId && filter.listId !== 'all') params.append('listId', filter.listId);
    if (filter?.limit) params.append('limit', String(filter.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await request<{ success: boolean; dispatches: ScheduledDispatch[] }>(`/scheduler/dispatches${qs}`);
    return res.dispatches;
  },

  async cancelScheduledDispatch(id: string): Promise<void> {
    await request(`/scheduler/dispatches/${id}/cancel`, {
      method: 'POST',
    });
  },

  async retryScheduledDispatch(id: string): Promise<void> {
    await request(`/scheduler/dispatches/${id}/retry`, {
      method: 'POST',
    });
  },
};

