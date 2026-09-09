export type Channel = 'email' | 'whatsapp' | 'instagram';

export type ConsentStatus = 'none' | 'replied' | 'opted_out';

export type LeadEntity = 'lead' | 'client';

export interface Lead {
  id: string;
  businessName: string;
  category: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  consentStatus: ConsentStatus;
  entityType: LeadEntity;
  createdAt: string;
  lastContactedAt: string | null;
  batchId?: string;
  outreachStage?: 'initial' | 'followup_1' | 'followup_2' | 'completed';
  deletedAt?: string | null;
  daysRemaining?: number;
  notes?: string;
  primaryContactName?: string;
  status?: 'active' | 'inactive' | 'paused' | 'churned';
}

export interface Client {
  id: string;
  original_lead_id?: string;
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

export interface UploadBatch {
  id: string;
  batch_name: string;
  source: string;
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  incomplete_count: number;
  created_at: string;
  expires_at: string;
  days_remaining: number;
  lead_count: number;
}

export interface AutoSendNextResult {
  leadId: string;
  businessName: string;
  email: string;
  stage: 'initial' | 'followup_1' | 'followup_2' | 'completed';
  stageLabel: string;
  subject: string;
  success: boolean;
  liveDelivery?: string;
  skipped?: boolean;
  reason?: string;
}

export interface CustomList {
  id: string;
  name: string;
  description?: string;
  lead_count: number;
  created_at: string;
  updated_at: string;
}


export interface ConversationMessage {
  id: string;
  leadId: string;
  channel: Channel;
  direction: 'outbound' | 'inbound';
  text: string;
  timestamp: string;
  status: 'sent' | 'draft' | 'delivered' | 'failed';
}

export interface InboundReplyMessage {
  id: string;
  conversation_id: string;
  channel: Channel;
  direction: 'inbound';
  text: string;
  sent_at: string;
  status: string;
  entity_type: 'lead' | 'client';
  lead_id?: string | null;
  client_id?: string | null;
  business_name: string;
  email: string;
  phone?: string;
  category?: string;
  entity_status?: string;
  consent_status?: string;
}

export type SequenceChannel = Channel;

export interface SequenceStep {
  id: string;
  name: string;
  channel: SequenceChannel;
  delayDays: number;
  body: string;
}

export interface Campaign {
  id: string;
  name: string;
  targetCategory: string | 'all';
  targetChannel: Channel | 'all';
  steps: SequenceStep[];
  createdAt: string;
}

export interface QueueItem {
  id: string;
  leadId: string;
  leadName: string;
  channel: Channel;
  campaignName: string;
  stepName: string;
  messagePreview: string;
  status: 'draft';
  createdAt: string;
}

export interface SendHealthDay {
  date: string;
  sent: number;
  bounced: number;
  complaints?: number;
  drafted: number;
}

export const channelLabels: Record<Channel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram / FB',
};

export const channelColors: Record<Channel, string> = {
  email: 'blue',
  whatsapp: 'green',
  instagram: 'purple',
};

export const consentLabels: Record<ConsentStatus, string> = {
  none: 'No response',
  replied: 'Replied',
  opted_out: 'Opted out',
};
