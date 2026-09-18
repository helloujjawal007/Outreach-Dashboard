export type Channel = 'email' | 'whatsapp' | 'instagram' | 'facebook' | 'linkedin' | 'website_form';

export type ConsentStatus = 'none' | 'replied' | 'opted_out';

export type LeadEntity = 'lead' | 'client';

export interface GoogleBusinessProfile {
  placeName: string;
  googleMapsUrl: string;
  rating: number;
  reviewsCount: number;
  formattedAddress: string;
  category: string;
  status: 'OPERATIONAL' | 'VERIFIED' | 'CLAIMED';
  website?: string;
  phone?: string;
  placeId?: string;
  hasGbpClaimed: boolean;
  searchSummary?: string;
  userVerified?: boolean;
  lastCheckedAt?: string;
  lastEnrichedAt: string;
}

export interface Lead {
  id: string;
  businessName: string;
  category: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  linkedin?: string;
  website?: string;
  location?: string;
  country?: string;
  consentStatus: ConsentStatus;
  entityType: LeadEntity;
  createdAt: string;
  lastContactedAt: string | null;
  batchId?: string;
  outreachStage?: 'initial' | 'followup_1' | 'followup_2' | 'completed';
  stage?: string;
  deletedAt?: string | null;
  daysRemaining?: number;
  notes?: string;
  primaryContactName?: string;
  status?: 'active' | 'inactive' | 'paused' | 'churned' | 'manual_review';
  manualReviewReason?: string;
  manualReviewAt?: string;
  lists?: Array<{ id: string; name: string }>;
  whatsappEligible?: boolean | null;
  whatsappDecisionReason?: string;
  detectedChannels?: string[];
  googleProfile?: GoogleBusinessProfile;
  metadata?: Record<string, any>;
}

export interface Client {
  id: string;
  original_lead_id?: string;
  business_name: string;
  primary_contact_name?: string;
  category: string;
  phone: string;
  email: string;
  website?: string;
  location?: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  status: 'active' | 'paused' | 'churned';
  contract_value: number;
  onboarded_at: string;
  updated_at: string;
  notes?: string;
  deleted_at?: string | null;
  metadata?: Record<string, any>;
}

export interface ScraperProgressStatus {
  isRunning: boolean;
  total: number;
  processed: number;
  identifiedCount: number;
  unidentifiedCount: number;
  currentLeadName?: string;
  lastRunAt: string | null;
  message?: string;
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


export type CrmSubFilter = 'all' | 'lead_added' | 'lead_not_added' | 'client' | 'inbound' | 'manual_review' | 'trash';

export interface ConversationMessage {
  id: string;
  leadId: string;
  channel: Channel;
  direction: 'outbound' | 'inbound';
  text: string;
  timestamp: string;
  status: 'sent' | 'draft' | 'delivered' | 'failed';
  is_seen?: boolean;
  seen_at?: string | null;
  is_read?: boolean;
  read_at?: string | null;
  is_replied?: boolean;
  replied_at?: string | null;
  inbox_email?: string;
  metadata?: Record<string, any>;
}

export interface InboundReplyMessage {
  id: string;
  conversation_id: string;
  channel: Channel;
  direction: 'inbound' | 'outbound' | string;
  text: string;
  sent_at: string;
  status: string;
  is_seen?: boolean;
  seen_at?: string | null;
  is_read?: boolean;
  read_at?: string | null;
  is_replied?: boolean;
  replied_at?: string | null;
  inbox_email?: string;
  metadata?: Record<string, any>;
  entity_type: 'lead' | 'client';
  lead_id?: string | null;
  client_id?: string | null;
  business_name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
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
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  website_form: 'Website Form',
};

export const channelColors: Record<Channel, string> = {
  email: 'blue',
  whatsapp: 'emerald',
  instagram: 'pink',
  facebook: 'indigo',
  linkedin: 'blue',
  website_form: 'amber',
};

export const consentLabels: Record<ConsentStatus, string> = {
  none: 'No response',
  replied: 'Replied',
  opted_out: 'Opted out',
};

export interface ScheduledDispatch {
  id: string;
  channel?: Channel;
  list_id?: string;
  list_name: string;
  entity_type: 'lead' | 'client';
  lead_id?: string;
  client_id?: string;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_handle?: string;
  recipient_name: string;
  subject: string;
  body: string;
  stage: string;
  style: string;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string;
  sent_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleListRequest {
  listId: string;
  channel?: Channel;
  scheduledFor?: string;
  intervalSeconds?: number;
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
  customInstructions?: string;
}

export interface ScheduleSingleRequest {
  leadId: string;
  channel: Channel;
  scheduledFor?: string;
  subject?: string;
  body?: string;
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
  customInstructions?: string;
}

export interface ScheduleBatchRequest {
  leadIds: string[];
  channel: Channel;
  scheduledFor?: string;
  intervalSeconds?: number;
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
  customInstructions?: string;
}

export interface HumanizerPreviewResponse {
  success: boolean;
  sampleContact: {
    id: string;
    business_name: string;
    primary_contact_name?: string;
    email?: string;
    category?: string;
    notes?: string;
  };
  preview: {
    subject: string;
    body: string;
    stage: string;
    isAiGenerated: boolean;
    modelUsed: string;
  };
}

export interface ResearchBrief {
  cleanBusinessName: string;
  salutation: string;
  industry: string;
  detectedPainPoints: string[];
  personalizedHook: string;
  recommendedValueProp: string;
}

export interface GeneratedOutreachMessage {
  channel: Channel;
  subject?: string;
  body: string;
  researchBrief: ResearchBrief;
  isAiGenerated: boolean;
  modelUsed: string;
  wordCount: number;
}

export interface BatchShootResult {
  leadId: string;
  businessName: string;
  channel: Channel;
  success: boolean;
  status: 'sent' | 'queued' | 'skipped' | 'failed';
  reason?: string;
  deepLink?: string;
  messagePreview?: string;
}

export interface BatchShootResponse {
  success: boolean;
  channel: Channel;
  totalProcessed: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  results: BatchShootResult[];
}

export interface ChannelSegregationData {
  email: {
    total: number;
    leads: Lead[];
  };
  whatsapp: {
    total: number;
    eligibleCount: number;
    ineligibleCount: number;
    leads: Lead[];
    eligibleLeads: Lead[];
    ineligibleLeads: Lead[];
  };
  facebook: {
    total: number;
    leads: Lead[];
  };
  instagram: {
    total: number;
    leads: Lead[];
  };
}

export interface WhatsAppSessionStatus {
  success: boolean;
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  phoneNumber: string | null;
  name: string | null;
  qrCodeDataUrl: string | null;
  rawQr: string | null;
  pairingCode: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  isConnected: boolean;
  hasSavedSession: boolean;
}

export interface ConnectedInbox {
  id: string;
  name: string;
  email: string;
  sender_name: string;
  provider: 'google_workspace' | 'office_365' | 'smtp';
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass?: string;
  daily_limit: number;
  sent_today: number;
  health_score: number;
  status: 'active' | 'paused' | 'exhausted' | 'error';
  is_default: boolean;
  last_error?: string | null;
  last_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxPoolSummary {
  totalInboxes: number;
  activeInboxes: number;
  exhaustedInboxes: number;
  pausedInboxes: number;
  totalDailyCapacity: number;
  totalSentToday: number;
  remainingCapacityToday: number;
  averageHealthScore: number;
}

export interface LinkedInAccountStatus {
  id: string;
  accountName: string;
  headline: string;
  profileUrl: string;
  authMethod: 'cookie' | 'oauth';
  isConnected: boolean;
  hasSessionCookie?: boolean;
  hasAccessToken?: boolean;
  dailyCommentsUsed: number;
  dailyPostsUsed: number;
  dailySafeCommentLimit: number;
  dailySafePostLimit: number;
  quotaResetAt: string;
}

export interface LinkedInPost {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'scheduled' | 'published' | 'ready_to_share' | 'failed';
  scheduledFor: string | null;
  publishedAt: string | null;
  tags: string[];
  aiGenerated: boolean;
  likesCount: number;
  commentsCount: number;
  liveDelivery?: boolean;
  directShareUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ProspectCommentTask {
  id: string;
  leadId: string | null;
  prospectName: string;
  prospectHeadline: string;
  prospectProfileUrl: string;
  postUrl: string;
  postSnippet: string;
  generatedComment: string;
  status: 'pending_approval' | 'approved' | 'posted' | 'skipped';
  postedAt: string | null;
  createdAt: string;
}

export interface BusinessSuggestion {
  id: string;
  category: 'urgent' | 'growth' | 'optimization' | 'system';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
  actionTitle: string;
  actionType:
    | 'shoot_all_outreach'
    | 'shoot_due_followups'
    | 'scan_website_forms'
    | 'sync_gmb_data'
    | 'target_ecom_leads'
    | 'view_inbound_replies'
    | 'run_lead_diagnostic';
  actionPayload?: Record<string, unknown>;
  badgeText: string;
  badgeVariant: 'red' | 'amber' | 'emerald' | 'indigo';
}

export interface CommandExecutionResult {
  actionExecuted: string;
  success: boolean;
  summary: string;
  details?: Record<string, unknown>;
  itemsProcessed: number;
  aiAdvice?: string;
  timestamp: string;
}

export interface AiCommandHistoryItem {
  id: string;
  commandText: string;
  actionType: string;
  itemsProcessed: number;
  success: boolean;
  summary: string;
  aiAdvice?: string;
  details?: Record<string, unknown>;
  executionTimeMs: number;
  createdAt: string;
}

export interface AiCommandHistoryResponse {
  success: boolean;
  lastCommand: AiCommandHistoryItem | null;
  history: AiCommandHistoryItem[];
}



