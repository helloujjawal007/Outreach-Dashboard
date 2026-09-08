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
