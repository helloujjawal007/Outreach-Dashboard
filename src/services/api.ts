import type {
  Lead,
  GoogleBusinessProfile,
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
  ScheduleSingleRequest,
  ScheduleBatchRequest,
  HumanizerPreviewResponse,
  GeneratedOutreachMessage,
  BatchShootResponse,
  ChannelSegregationData,
  WhatsAppSessionStatus,
  ConnectedInbox,
  InboxPoolSummary,
  LinkedInAccountStatus,
  LinkedInPost,
  ProspectCommentTask,
  BusinessSuggestion,
  CommandExecutionResult,
  AiCommandHistoryItem,
  AiCommandHistoryResponse,
  ScraperProgressStatus,
} from '@/types';

const API_BASE = '/api';

export function cleanSiteUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (/google\.com\/maps|maps\.google\.com|goo\.gl\/maps|google\.com\/search/i.test(trimmed)) {
    return '';
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && trimmed.includes('.')) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

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
  location?: string;
  status?: 'active' | 'inactive' | 'paused' | 'churned' | 'manual_review';
  manual_review_reason?: string;
  manual_review_at?: string;
  lists?: Array<{ id: string; name: string }>;
  whatsapp_eligible?: boolean | null;
  whatsapp_decision_reason?: string;
  detected_channels?: string[];
  metadata?: Record<string, any>;
  google_profile?: GoogleBusinessProfile;
  website?: string;
  country?: string;
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
  website?: string;
  location?: string;
  country?: string;
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
  is_seen?: boolean;
  seen_at?: string;
  is_read?: boolean;
  read_at?: string;
  is_replied?: boolean;
  replied_at?: string;
  inbox_email?: string;
  metadata?: Record<string, any>;
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
  websiteFormResult?: {
    success?: boolean;
    skipped?: boolean;
    error?: string;
    reason?: string;
  };
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
    manualReviewReason: b.manual_review_reason,
    manualReviewAt: b.manual_review_at,
    lists: b.lists || [],
    whatsappEligible: b.whatsapp_eligible,
    whatsappDecisionReason: b.whatsapp_decision_reason || '',
    detectedChannels: b.detected_channels || [],
    googleProfile: b.metadata?.google_profile || b.google_profile || undefined,
    website: cleanSiteUrl(b.website || b.metadata?.google_profile?.website || ''),
    location: b.location || b.metadata?.location || '',
    country: b.country || '',
    metadata: b.metadata || {},
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
    website: cleanSiteUrl(c.website || (c as any).metadata?.google_profile?.website || ''),
    location: c.location || (c as any).metadata?.location || '',
    country: c.country || '',
    consentStatus: 'replied',
    entityType: 'client',
    createdAt: c.onboarded_at || c.created_at,
    lastContactedAt: c.updated_at,
    notes: c.notes || '',
    status: c.status || 'active',
    googleProfile: (c as any).metadata?.google_profile || undefined,
    metadata: (c as any).metadata || {},
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
    is_seen: m.is_seen,
    seen_at: m.seen_at,
    is_read: m.is_read,
    read_at: m.read_at,
    is_replied: m.is_replied,
    replied_at: m.replied_at,
    inbox_email: m.inbox_email,
    metadata: m.metadata,
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
  async getLeads(listId?: string, batchId?: string, status?: string): Promise<Lead[]> {
    const params = new URLSearchParams();
    if (listId && listId !== 'all') params.append('listId', listId);
    if (batchId && batchId !== 'all') params.append('batchId', batchId);
    if (status && status !== 'all') params.append('status', status);
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
    linkedin?: string;
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

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    const payload: Record<string, any> = {};
    if (updates.businessName !== undefined) payload.businessName = updates.businessName;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.instagram !== undefined) payload.instagram = updates.instagram;
    if (updates.facebook !== undefined) payload.facebook = updates.facebook;
    if (updates.whatsapp !== undefined) payload.whatsapp = updates.whatsapp;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.consentStatus !== undefined) payload.consentStatus = updates.consentStatus;
    if (updates.googleProfile !== undefined) payload.googleProfile = updates.googleProfile;
    if (updates.metadata !== undefined) payload.metadata = updates.metadata;
    if (updates.website !== undefined) payload.website = updates.website;
    if (updates.country !== undefined) payload.country = updates.country;

    const data = await request<{ success: boolean; lead: BackendLead }>(`/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
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

  async updateLeadStatus(id: string, status: 'active' | 'inactive' | 'paused' | 'manual_review'): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead }>(`/leads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return mapBackendLeadToLead(data.lead);
  },

  async bulkUpdateLeadStatus(ids: string[], status: 'active' | 'inactive' | 'paused' | 'manual_review'): Promise<number> {
    const data = await request<{ success: boolean; updatedCount: number }>('/leads/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
    return data.updatedCount ?? 0;
  },

  async approveLeadReview(id: string): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead }>(`/leads/${id}/approve-review`, {
      method: 'POST',
    });
    return mapBackendLeadToLead(data.lead);
  },

  async bulkApproveLeadReviews(ids: string[]): Promise<number> {
    const data = await request<{ success: boolean; approvedCount: number }>('/leads/bulk-approve-review', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return data.approvedCount ?? 0;
  },

  async getUnmatchedInbox(): Promise<
    Array<{
      id: string;
      messageId: string;
      senderEmail: string;
      subject: string;
      snippet: string;
      processedAt: string;
      isBounce: boolean;
    }>
  > {
    const data = await request<{
      success: boolean;
      count: number;
      items: Array<{
        id: string;
        messageId: string;
        senderEmail: string;
        subject: string;
        snippet: string;
        processedAt: string;
        isBounce: boolean;
      }>;
    }>('/conversations/unmatched-inbox');
    return data.items || [];
  },

  async enrichLeadFromGoogle(leadId: string): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead; googleProfile?: any }>(
      `/leads/${leadId}/enrich-google`,
      { method: 'POST' }
    );
    return mapBackendLeadToLead(data.lead);
  },

  async syncGoogleMaps(leadId: string, googleMapsUrl?: string): Promise<Lead> {
    const data = await request<{ success: boolean; lead: BackendLead; googleProfile?: any }>(
      `/leads/${leadId}/sync-google-maps`,
      {
        method: 'POST',
        body: JSON.stringify({ googleMapsUrl }),
      }
    );
    return mapBackendLeadToLead(data.lead);
  },

  async batchEnrichLeadsFromGoogle(leadIds: string[]): Promise<Lead[]> {
    const data = await request<{ success: boolean; count: number; leads: BackendLead[] }>(
      '/leads/batch-enrich-google',
      {
        method: 'POST',
        body: JSON.stringify({ ids: leadIds }),
      }
    );
    return (data.leads || []).map(mapBackendLeadToLead);
  },

  async syncGmb(): Promise<{ success: boolean; totalSynced: number; lastSyncedAt: string }> {
    return request<{ success: boolean; totalSynced: number; lastSyncedAt: string }>('/leads/sync-gmb', {
      method: 'POST',
    });
  },

  async getGmbSyncStatus(): Promise<{
    success: boolean;
    lastSyncedAt: string | null;
    nextSyncAt: string | null;
    syncedCount: number;
    isRunning: boolean;
    intervalHours: number;
  }> {
    return request('/leads/sync-gmb-status');
  },

  // Lead Scraper (Gradual Location Scraping)
  async scrapeLeadLocations(options?: {
    batchSize?: number;
    delayMs?: number;
    overwriteIdentified?: boolean;
    leadIds?: string[];
  }): Promise<{ success: boolean; total: number; message: string }> {
    return request('/leads/scrape-locations', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  async getScrapeLocationsStatus(): Promise<{ success: boolean; status: ScraperProgressStatus }> {
    return request('/leads/scrape-locations/status');
  },

  async stopScrapeLocations(): Promise<{ success: boolean; message: string }> {
    return request('/leads/scrape-locations/stop', {
      method: 'POST',
    });
  },

  async scrapeSingleLeadLocation(leadId: string): Promise<{
    success: boolean;
    lead: Lead;
    scraped: {
      location: string;
      identified: boolean;
      country?: string;
      siteUrl?: string;
      source: string;
      details?: string;
    };
  }> {
    const data = await request<{
      success: boolean;
      lead: BackendLead;
      scraped: {
        location: string;
        identified: boolean;
        country?: string;
        siteUrl?: string;
        source: string;
        details?: string;
      };
    }>(`/leads/${leadId}/scrape-location`, {
      method: 'POST',
    });
    return {
      success: data.success,
      lead: mapBackendLeadToLead(data.lead),
      scraped: data.scraped,
    };
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
    alsoSubmitWebsiteForm?: boolean;
  }): Promise<SendReplyResult> {
    return request<SendReplyResult>('/conversations/reply', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async submitWebsiteForm(leadId: string, payload: {
    senderName?: string;
    senderEmail?: string;
    senderPhone?: string;
    subject?: string;
    message: string;
  }): Promise<{ success: boolean; result: any; message?: string }> {
    return request('/conversations/submit-website-form', {
      method: 'POST',
      body: JSON.stringify({ leadId, ...payload }),
    });
  },

  async detectWebsiteForm(leadId: string, websiteUrl?: string): Promise<{ success: boolean; detection: any; lead?: any }> {
    return request('/conversations/detect-website-form', {
      method: 'POST',
      body: JSON.stringify({ leadId, websiteUrl }),
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

  async getRecentMessages(filter?: {
    channel?: string;
    direction?: string;
    limit?: number;
  }): Promise<InboundReplyMessage[]> {
    const params = new URLSearchParams();
    if (filter?.channel && filter.channel !== 'all') params.append('channel', filter.channel);
    if (filter?.direction && filter.direction !== 'all') params.append('direction', filter.direction);
    if (filter?.limit) params.append('limit', String(filter.limit));
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const data = await request<{ success: boolean; count: number; messages: InboundReplyMessage[] }>(
      `/conversations/recent-messages${queryStr}`
    );
    return data.messages || [];
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

  async markMessageRead(id: string, isRead: boolean = true): Promise<{ success: boolean; isRead: boolean }> {
    return request<{ success: boolean; isRead: boolean }>(`/conversations/messages/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ isRead }),
    });
  },

  async markEntityInboundRead(entityType: 'lead' | 'client', entityId: string, isRead: boolean = true): Promise<void> {
    await request(`/conversations/entity/${entityType}/${entityId}/read`, {
      method: 'POST',
      body: JSON.stringify({ isRead }),
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

  async deleteCampaign(id: string): Promise<void> {
    await request(`/campaigns/${id}`, { method: 'DELETE' });
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

  // AI Improvise: Human-in-the-Loop text improvise & realistic polish
  async improvise(params: {
    text: string;
    channel: Channel;
    businessName?: string;
    category?: string;
    recipientName?: string;
    tone?: string;
  }): Promise<{
    improvedText: string;
    subject?: string;
    channel: string;
    modelUsed: string;
    isAiGenerated: boolean;
    wordCount: number;
  }> {
    const res = await request<{
      success: boolean;
      result: {
        improvedText: string;
        subject?: string;
        channel: string;
        modelUsed: string;
        isAiGenerated: boolean;
        wordCount: number;
      };
    }>('/ai/improvise', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.result;
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

  async scheduleSingleDispatch(params: ScheduleSingleRequest): Promise<{
    success: boolean;
    dispatchId?: string;
    recipient: string;
    scheduledFor: string;
    channel: string;
    message: string;
  }> {
    return request('/scheduler/schedule-single', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async scheduleBatchDispatch(params: ScheduleBatchRequest): Promise<{
    success: boolean;
    scheduledCount: number;
    channel: string;
    firstScheduledAt: string;
    lastScheduledAt: string;
    message: string;
  }> {
    return request('/scheduler/schedule-batch', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getScheduledDispatches(filter?: {
    status?: string;
    channel?: string;
    listId?: string;
    limit?: number;
  }): Promise<ScheduledDispatch[]> {
    const params = new URLSearchParams();
    if (filter?.status && filter.status !== 'all') params.append('status', filter.status);
    if (filter?.channel && filter.channel !== 'all') params.append('channel', filter.channel);
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

  // 4-Channel Segregation
  async getLeadsByChannel(): Promise<ChannelSegregationData> {
    const res = await request<{
      success: boolean;
      channels: {
        email: { total: number; leads: BackendLead[] };
        whatsapp: {
          total: number;
          eligibleCount: number;
          ineligibleCount: number;
          leads: BackendLead[];
          eligibleLeads: BackendLead[];
          ineligibleLeads: BackendLead[];
        };
        facebook: { total: number; leads: BackendLead[] };
        instagram: { total: number; leads: BackendLead[] };
      };
    }>('/leads/by-channel');

    return {
      email: {
        total: res.channels.email.total,
        leads: res.channels.email.leads.map(mapBackendLeadToLead),
      },
      whatsapp: {
        total: res.channels.whatsapp.total,
        eligibleCount: res.channels.whatsapp.eligibleCount,
        ineligibleCount: res.channels.whatsapp.ineligibleCount,
        leads: res.channels.whatsapp.leads.map(mapBackendLeadToLead),
        eligibleLeads: res.channels.whatsapp.eligibleLeads.map(mapBackendLeadToLead),
        ineligibleLeads: res.channels.whatsapp.ineligibleLeads.map(mapBackendLeadToLead),
      },
      facebook: {
        total: res.channels.facebook.total,
        leads: res.channels.facebook.leads.map(mapBackendLeadToLead),
      },
      instagram: {
        total: res.channels.instagram.total,
        leads: res.channels.instagram.leads.map(mapBackendLeadToLead),
      },
    };
  },

  // AI Research & Copywriter
  async researchAndWrite(params: {
    leadId?: string;
    contact?: {
      businessName: string;
      category?: string;
      phone?: string;
      email?: string;
      instagram?: string;
      facebook?: string;
      notes?: string;
    };
    channel: Channel;
    customPrompt?: string;
  }): Promise<GeneratedOutreachMessage> {
    const res = await request<{ success: boolean; result: GeneratedOutreachMessage }>('/ai/research-and-write', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.result;
  },

  // Batch Research & Copywriter (up to 100 leads)
  async batchResearchAndWrite(params: {
    leadIds: string[];
    channel: Channel;
  }): Promise<Array<GeneratedOutreachMessage & { contactId: string }>> {
    const res = await request<{
      success: boolean;
      count: number;
      results: Array<GeneratedOutreachMessage & { contactId: string }>;
    }>('/ai/batch-research-and-write', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.results;
  },

  // Batch Shoot Engine (up to 100 leads/batch)
  async batchShoot(params: {
    channel: Channel;
    leadIds: string[];
    messages?: Record<string, { subject?: string; body: string }>;
    intervalSeconds?: number;
    alsoSubmitWebsiteForm?: boolean;
  }): Promise<BatchShootResponse> {
    return request<BatchShootResponse>('/conversations/batch-shoot', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // WhatsApp Socket Session (Option 1: Direct Phone Linking)
  async getWhatsAppSessionStatus(): Promise<WhatsAppSessionStatus> {
    return request<WhatsAppSessionStatus>('/adapters/whatsapp/session-status');
  },

  async startWhatsAppSession(): Promise<WhatsAppSessionStatus> {
    return request<WhatsAppSessionStatus>('/adapters/whatsapp/start-session', {
      method: 'POST',
    });
  },

  async requestWhatsAppPairing(phoneNumber: string): Promise<{
    success: boolean;
    pairingCode: string;
    message: string;
  }> {
    return request<{
      success: boolean;
      pairingCode: string;
      message: string;
    }>('/adapters/whatsapp/request-pairing', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  },

  async disconnectWhatsAppSession(): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/adapters/whatsapp/disconnect', {
      method: 'POST',
    });
  },

  async sendDirectWhatsApp(params: {
    recipientPhone: string;
    text: string;
    leadId?: string;
  }): Promise<{ success: boolean; messageId?: string }> {
    return request<{ success: boolean; messageId?: string }>('/adapters/whatsapp/send-direct', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // Multi-Inbox Rotation & Deliverability
  async getInboxes(): Promise<{ inboxes: ConnectedInbox[]; summary: InboxPoolSummary }> {
    const data = await request<{ success: boolean; inboxes: ConnectedInbox[]; summary: InboxPoolSummary }>('/inboxes');
    return {
      inboxes: data.inboxes || [],
      summary: data.summary,
    };
  },

  async getInboxSummary(): Promise<InboxPoolSummary> {
    const data = await request<{ success: boolean; summary: InboxPoolSummary }>('/inboxes/summary');
    return data.summary;
  },

  async testInboxConnection(config: {
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_user: string;
    smtp_pass: string;
    provider?: string;
  }): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/inboxes/test-connection', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async addInbox(data: {
    name: string;
    email: string;
    sender_name: string;
    provider: 'google_workspace' | 'office_365' | 'smtp';
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_user: string;
    smtp_pass: string;
    daily_limit?: number;
  }): Promise<ConnectedInbox> {
    const res = await request<{ success: boolean; inbox: ConnectedInbox }>('/inboxes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.inbox;
  },

  async updateInbox(id: string, data: Partial<{
    name: string;
    sender_name: string;
    daily_limit: number;
    status: 'active' | 'paused';
    smtp_pass?: string;
  }>): Promise<ConnectedInbox> {
    const res = await request<{ success: boolean; inbox: ConnectedInbox }>(`/inboxes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.inbox;
  },

  async deleteInbox(id: string): Promise<void> {
    await request(`/inboxes/${id}`, { method: 'DELETE' });
  },

  async testSendInbox(id: string, to: string): Promise<{ success: boolean; reason?: string; liveDelivery?: string }> {
    return request<{ success: boolean; reason?: string; liveDelivery?: string }>(`/inboxes/${id}/test-send`, {
      method: 'POST',
      body: JSON.stringify({ to }),
    });
  },

  // LinkedIn Social Hub & Auto-Outreach
  async getLinkedInStatus(): Promise<LinkedInAccountStatus> {
    const res = await request<{ success: boolean; data: LinkedInAccountStatus }>('/linkedin/status');
    return res.data;
  },

  async connectLinkedIn(params: {
    accountName?: string;
    headline?: string;
    profileUrl?: string;
    sessionCookie?: string;
    accessToken?: string;
    authMethod?: 'cookie' | 'oauth';
  }): Promise<LinkedInAccountStatus> {
    const res = await request<{ success: boolean; data: LinkedInAccountStatus }>('/linkedin/connect', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.data;
  },

  async disconnectLinkedIn(): Promise<void> {
    await request('/linkedin/disconnect', { method: 'POST' });
  },

  async generateLinkedInPost(params: {
    topic?: string;
    tone?: string;
    targetAudience?: string;
    callToAction?: string;
    angle?: string;
  }): Promise<{ content: string; tags: string[]; title: string }> {
    const res = await request<{ success: boolean; data: { content: string; tags: string[]; title: string } }>(
      '/linkedin/generate-post',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return res.data;
  },

  async getLinkedInPosts(): Promise<LinkedInPost[]> {
    const res = await request<{ success: boolean; data: LinkedInPost[] }>('/linkedin/posts');
    return res.data;
  },

  async createLinkedInPost(params: {
    title?: string;
    content: string;
    status?: 'draft' | 'scheduled' | 'published';
    scheduledFor?: string;
    tags?: string[];
    aiGenerated?: boolean;
  }): Promise<LinkedInPost> {
    const res = await request<{ success: boolean; data: LinkedInPost }>('/linkedin/posts', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.data;
  },

  async updateLinkedInPost(
    id: string,
    params: {
      title?: string;
      content?: string;
      status?: 'draft' | 'scheduled' | 'published';
      scheduledFor?: string | null;
    }
  ): Promise<LinkedInPost> {
    const res = await request<{ success: boolean; data: LinkedInPost }>(`/linkedin/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
    return res.data;
  },

  async publishExistingLinkedInPost(id: string): Promise<LinkedInPost> {
    const res = await request<{ success: boolean; message: string; data: LinkedInPost }>(`/linkedin/posts/${id}/publish-live`, {
      method: 'POST',
    });
    return res.data;
  },

  async confirmLinkedInPost(id: string): Promise<LinkedInPost> {
    const res = await request<{ success: boolean; message: string; data: LinkedInPost }>(`/linkedin/posts/${id}/confirm`, {
      method: 'POST',
    });
    return res.data;
  },

  async verifyLinkedInCookie(sessionCookie: string): Promise<{ valid: boolean; accountName?: string; headline?: string; error?: string }> {
    const res = await request<{ success: boolean; data: { valid: boolean; accountName?: string; headline?: string; error?: string } }>(
      '/linkedin/verify-cookie',
      {
        method: 'POST',
        body: JSON.stringify({ sessionCookie }),
      }
    );
    return res.data;
  },

  async deleteLinkedInPost(id: string): Promise<void> {
    await request(`/linkedin/posts/${id}`, { method: 'DELETE' });
  },

  async getLinkedInProspectComments(): Promise<ProspectCommentTask[]> {
    const res = await request<{ success: boolean; data: ProspectCommentTask[] }>('/linkedin/prospect-comments');
    return res.data;
  },

  async approveLinkedInComment(taskId: string, customComment?: string): Promise<ProspectCommentTask> {
    const res = await request<{ success: boolean; data: ProspectCommentTask }>(
      `/linkedin/prospect-comments/${taskId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ customComment }),
      }
    );
    return res.data;
  },

  async skipLinkedInComment(taskId: string): Promise<void> {
    await request(`/linkedin/prospect-comments/${taskId}/skip`, { method: 'POST' });
  },

  async addLinkedInProspectPost(params: {
    prospectName: string;
    prospectHeadline?: string;
    prospectProfileUrl?: string;
    postUrl?: string;
    postSnippet: string;
    leadId?: string;
  }): Promise<ProspectCommentTask> {
    const res = await request<{ success: boolean; data: ProspectCommentTask }>('/linkedin/prospect-comments', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.data;
  },

  // AI Executive Copilot & Business Growth Engine
  async getAiSuggestions(): Promise<BusinessSuggestion[]> {
    const res = await request<{ success: boolean; suggestions: BusinessSuggestion[] }>('/ai/suggestions');
    return res.suggestions || [];
  },

  async executeAiCommand(params: {
    commandText: string;
    actionType?: string;
    payload?: Record<string, unknown>;
  }): Promise<CommandExecutionResult> {
    const res = await request<{ success: boolean; result: CommandExecutionResult }>('/ai/command', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return res.result;
  },

  async getAiCommandHistory(limit: number = 50): Promise<{
    lastCommand: AiCommandHistoryItem | null;
    history: AiCommandHistoryItem[];
  }> {
    const res = await request<AiCommandHistoryResponse>(`/ai/history?limit=${limit}`);
    return {
      lastCommand: res.lastCommand || null,
      history: res.history || [],
    };
  },

  async clearAiCommandHistory(): Promise<void> {
    await request('/ai/history', { method: 'DELETE' });
  },
};



