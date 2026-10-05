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
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FolderPlus,
  Bookmark,
  BookmarkPlus,
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
  Users,
  Facebook,
  Eye,
  Check,
  Phone,
  Globe,
  Linkedin,
  Loader2,
  Star,
  MapPin,
  ExternalLink,
  Compass,
  MailX,
} from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { ChannelIcon } from '@/components/ChannelIcon';
import { Modal } from '@/components/Modal';
import { InboundRepliesModal } from '@/components/InboundRepliesModal';
import { ScheduleListModal } from '@/components/ScheduleListModal';
import { ChannelOutreachHub } from '@/components/ChannelOutreachHub';
import type { Store } from '@/store';
import type { Lead, ConsentStatus, Channel, AutoSendNextResult, CrmSubFilter, ScraperProgressStatus } from '@/types';
import { channelLabels, consentLabels } from '@/types';
import { api, cleanSiteUrl } from '@/services/api';
import { getCountryFlag } from '@/utils/countryFlag';
import { AutopilotControlModal } from '@/components/AutopilotControlModal';

interface Props {
  store: Store;
  autoOpenContact?: { id: string; entityType: 'lead' | 'client' } | null;
  onClearAutoOpenContact?: () => void;
  subFilter?: CrmSubFilter;
  onSubFilterChange?: (subFilter: CrmSubFilter) => void;
  countryFilter?: string;
  onCountryFilterChange?: (country: string) => void;
  channelFilter?: ChannelFilter;
  onChannelFilterChange?: (channel: ChannelFilter) => void;
  onOpenGlobalMessages?: () => void;
}

type EntityTypeFilter = 'all' | 'lead' | 'lead_added' | 'lead_not_added' | 'client' | 'inbound' | 'manual_review' | 'invalid_list' | 'trash';
type ChannelFilter = 'all' | 'email' | 'whatsapp' | 'whatsapp_mobile' | 'website_form' | 'facebook' | 'instagram' | 'linkedin';
type StatusFilter = 'all' | 'active' | 'inactive';

export function CrmPage({
  store,
  autoOpenContact,
  onClearAutoOpenContact,
  subFilter,
  onSubFilterChange,
  countryFilter: countryFilterProp,
  onCountryFilterChange,
  channelFilter: channelFilterProp,
  onChannelFilterChange,
  onOpenGlobalMessages: _onOpenGlobalMessages,
}: Props) {
  const [crmViewMode, setCrmViewMode] = useState<'channels' | 'table'>('channels');
  const [entityFilter, setEntityFilter] = useState<EntityTypeFilter>('all');
  const [internalCountryFilter, setInternalCountryFilter] = useState<string>('all');
  const countryFilter = countryFilterProp !== undefined ? countryFilterProp : internalCountryFilter;
  const setCountryFilter = useCallback((c: string) => {
    setInternalCountryFilter(c);
    if (onCountryFilterChange) {
      onCountryFilterChange(c);
    }
  }, [onCountryFilterChange]);
  const [cityFilter, setCityFilter] = useState<string>('all');

  const [internalChannelFilter, setInternalChannelFilter] = useState<ChannelFilter>('all');
  const channelFilter = channelFilterProp !== undefined ? channelFilterProp : internalChannelFilter;
  const setChannelFilter = useCallback((ch: ChannelFilter) => {
    setInternalChannelFilter(ch);
    if (onChannelFilterChange) {
      onChannelFilterChange(ch);
    }
  }, [onChannelFilterChange]);
  const [channelSubFilter, setChannelSubFilter] = useState<string>('all');

  // Synchronize subFilter prop from Sidebar or App
  useEffect(() => {
    if (subFilter) {
      setEntityFilter(subFilter as EntityTypeFilter);
      if (
        subFilter === 'lead_added' ||
        subFilter === 'lead_not_added' ||
        subFilter === 'client' ||
        subFilter === 'manual_review' ||
        subFilter === 'invalid_list'
      ) {
        setCrmViewMode('table');
      }
    }
  }, [subFilter]);

  // Synchronize countryFilter prop from Sidebar or App
  useEffect(() => {
    if (countryFilterProp && countryFilterProp !== 'all') {
      setCrmViewMode('table');
      setCityFilter('all');
    }
  }, [countryFilterProp]);

  // Synchronize channelFilter prop from Sidebar or App
  useEffect(() => {
    if (channelFilterProp && channelFilterProp !== 'all') {
      setCrmViewMode('table');
      setChannelSubFilter('all');
    }
  }, [channelFilterProp]);

  const [isInboundInboxOpen, setIsInboundInboxOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [consentFilter, setConsentFilter] = useState<ConsentStatus | 'all'>('all');
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyChannel, setReplyChannel] = useState<Channel>('email');
  const [isSending, setIsSending] = useState(false);
  const [alsoSubmitWebsiteForm, setAlsoSubmitWebsiteForm] = useState(true);
  const [detectingFormLeadId, setDetectingFormLeadId] = useState<string | null>(null);
  const [detectedFormInfo, setDetectedFormInfo] = useState<any>(null);

  const handleDetectWebsiteForm = useCallback(async (leadId: string, websiteUrl?: string) => {
    try {
      setDetectingFormLeadId(leadId);
      const res = await api.detectWebsiteForm(leadId, websiteUrl);
      if (res.detection) {
        setDetectedFormInfo(res.detection);
      }
      if (res.lead) {
        setSelectedLead((prev) => (prev && prev.id === leadId ? { ...prev, ...res.lead } : prev));
        await store.fetchLeads();
      }
    } catch (err: any) {
      setDetectedFormInfo({
        hasForm: false,
        reason: err?.message || 'Form detection failed',
      });
    } finally {
      setDetectingFormLeadId(null);
    }
  }, [store]);
  const [sendFeedback, setSendFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);
  const [isImprovisingReply, setIsImprovisingReply] = useState(false);
  const [improviseBadge, setImproviseBadge] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lists & Batches management state
  const [isManageListsOpen, setIsManageListsOpen] = useState(false);
  const [isAddToListOpen, setIsAddToListOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [leadsToAddToList, setLeadsToAddToList] = useState<string[]>([]);
  const [isUnmarkingClient, setIsUnmarkingClient] = useState(false);
  const [bulkActionSuccess, setBulkActionSuccess] = useState<string | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // 28-day Deletion History / Trash state
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // Google Profile Enrichment & Direct Edit state
  const [isSyncingMaps, setIsSyncingMaps] = useState(false);
  const [mapsUrlInput, setMapsUrlInput] = useState('');
  const [googleFeedback, setGoogleFeedback] = useState<string | null>(null);
  const [isEditingGoogle, setIsEditingGoogle] = useState(false);
  const [isSavingGoogle, setIsSavingGoogle] = useState(false);
  const [editGoogleForm, setEditGoogleForm] = useState<{
    rating: number | string;
    reviewsCount: number | string;
    formattedAddress: string;
    category: string;
    website: string;
    googleMapsUrl: string;
  }>({
    rating: 4.9,
    reviewsCount: 1353,
    formattedAddress: '',
    category: '',
    website: '',
    googleMapsUrl: '',
  });

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
  const [isSyncingGmb, setIsSyncingGmb] = useState(false);

  const handleSyncGmbAll = useCallback(async () => {
    try {
      setIsSyncingGmb(true);
      const res = await store.syncGmb();
      setBulkActionSuccess(`Google Business Profile Sync completed! Matched and updated ${res.totalSynced} leads.`);
      setTimeout(() => setBulkActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('GMB sync failed:', err);
      setBulkActionSuccess(err?.message || 'Failed to sync with Google Business Profiles');
      setTimeout(() => setBulkActionSuccess(null), 5000);
    } finally {
      setIsSyncingGmb(false);
    }
  }, [store]);

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

  // Lead Location Scraper state & handlers
  const [isScrapingLocations, setIsScrapingLocations] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<ScraperProgressStatus | null>(null);
  const [isScrapingSingle, setIsScrapingSingle] = useState(false);
  const [isAutopilotModalOpen, setIsAutopilotModalOpen] = useState(false);

  // Polling for gradual location scrape status
  useEffect(() => {
    let interval: any = null;

    if (isScrapingLocations) {
      interval = setInterval(async () => {
        try {
          const res = await store.getScrapeLocationsStatus();
          if (res?.status) {
            setScraperStatus(res.status);
            if (!res.status.isRunning) {
              setIsScrapingLocations(false);
              await store.fetchLeads();
              setBulkActionSuccess(
                `Lead Scraper finished: ${res.status.identifiedCount} identified, ${res.status.unidentifiedCount} marked as (Not identified).`
              );
              setTimeout(() => setBulkActionSuccess(null), 6000);
            }
          }
        } catch (err) {
          console.error('Error fetching scrape status:', err);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScrapingLocations, store]);

  // Initial check if scraper is already running in background
  useEffect(() => {
    store
      .getScrapeLocationsStatus()
      .then((res) => {
        if (res?.status?.isRunning) {
          setIsScrapingLocations(true);
          setScraperStatus(res.status);
        }
      })
      .catch(() => {});
  }, [store]);

  const handleStartLocationScrape = useCallback(async () => {
    try {
      setIsScrapingLocations(true);
      const res = await store.scrapeLeadLocations({ overwriteIdentified: false, delayMs: 1200 });
      setBulkActionSuccess(res.message || `Started gradual location scraper for ${res.total} leads.`);
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err: any) {
      setIsScrapingLocations(false);
      setBulkActionSuccess(err?.message || 'Failed to start location scraper');
      setTimeout(() => setBulkActionSuccess(null), 5000);
    }
  }, [store]);

  const handleStopLocationScrape = useCallback(async () => {
    try {
      await store.stopScrapeLocations();
      setIsScrapingLocations(false);
      setBulkActionSuccess('Stopped location scraping.');
      await store.fetchLeads();
      setTimeout(() => setBulkActionSuccess(null), 4000);
    } catch (err: any) {
      setBulkActionSuccess(err?.message || 'Failed to stop location scraper');
      setTimeout(() => setBulkActionSuccess(null), 4000);
    }
  }, [store]);

  const handleScrapeSingleLocation = useCallback(
    async (leadId: string) => {
      try {
        setIsScrapingSingle(true);
        const res = await store.scrapeSingleLeadLocation(leadId);
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead((prev) => (prev ? { ...prev, location: res.scraped.location } : prev));
        }
        setBulkActionSuccess(
          res.scraped.identified
            ? `Identified location for ${res.lead.businessName}: ${res.scraped.location}`
            : `Could not identify location for ${res.lead.businessName}. Marked as (Not identified).`
        );
        setTimeout(() => setBulkActionSuccess(null), 5000);
      } catch (err: any) {
        setBulkActionSuccess(err?.message || 'Failed to scrape location');
        setTimeout(() => setBulkActionSuccess(null), 5000);
      } finally {
        setIsScrapingSingle(false);
      }
    },
    [selectedLead, store]
  );

  const manualReviewLeads = useMemo(
    () => store.leads.filter((l) => l.status === 'manual_review'),
    [store.leads]
  );
  const manualReviewCount = manualReviewLeads.length;

  const invalidLeads = useMemo(
    () =>
      store.leads.filter(
        (l) =>
          !l.deletedAt &&
          (l.lists?.some((m) => m.name.toLowerCase() === 'invalid list' || m.name.toLowerCase() === 'invalid leads') ||
            (l.emailVerificationStatus && l.emailVerificationStatus !== 'verified' && l.emailVerificationStatus !== 'unverified') ||
            (l.status === 'manual_review' && l.manualReviewReason?.toLowerCase().includes('invalid')))
      ),
    [store.leads]
  );
  const invalidLeadsCount = invalidLeads.length;

  const leadEntities = useMemo(
    () => store.leads.filter((l) => !l.deletedAt && l.entityType === 'lead' && l.status !== 'manual_review'),
    [store.leads]
  );
  const clientEntities = useMemo(
    () => store.leads.filter((l) => !l.deletedAt && l.entityType === 'client' && l.status !== 'manual_review'),
    [store.leads]
  );
  const addedLeadsCount = useMemo(
    () => leadEntities.filter((l) => Boolean(l.lists && l.lists.length > 0)).length,
    [leadEntities]
  );
  const notAddedLeadsCount = useMemo(
    () => leadEntities.filter((l) => !l.lists || l.lists.length === 0).length,
    [leadEntities]
  );

  const inboundContactCount = useMemo(() => {
    const replyEntityIds = new Set(
      store.inboundReplies.map((r) => r.client_id || r.lead_id).filter(Boolean)
    );
    return store.leads.filter((l) => replyEntityIds.has(l.id)).length;
  }, [store.inboundReplies, store.leads]);

  // Unique categories derived dynamically from database with counts
  const uniqueCategories = useMemo(() => {
    const catMap = new Map<string, number>();
    store.leads.forEach((l) => {
      if (l.deletedAt) return;
      if (l.category && l.category.trim()) {
        const cat = l.category.trim();
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      }
    });
    return Array.from(catMap.entries())
      .filter(([_, count]) => count > 0)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  }, [store.leads]);

  // Unique countries derived dynamically from database whose leads are listed
  const uniqueCountries = useMemo(() => {
    const countryMap = new Map<string, number>();
    store.leads.forEach((l) => {
      if (l.deletedAt) return;
      const c =
        (l.country || '').trim() ||
        (l.location && l.location.toLowerCase().includes('not identified')
          ? '(Not identified)'
          : 'Other');
      countryMap.set(c, (countryMap.get(c) || 0) + 1);
    });
    return Array.from(countryMap.entries())
      .filter(([_, count]) => count > 0)
      .map(([country, count]) => ({
        country,
        count,
        flag: getCountryFlag(country),
      }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  }, [store.leads]);

  // Unique cities / regions derived dynamically for the selected country whose leads are listed
  const uniqueCitiesInCountry = useMemo(() => {
    const cityMap = new Map<string, number>();
    store.leads.forEach((l) => {
      if (l.deletedAt) return;
      if (countryFilter !== 'all') {
        const leadCountry = (l.country || '').trim() || 'Other';
        if (leadCountry.toLowerCase() !== countryFilter.toLowerCase()) return;
      }
      if (l.location && l.location.trim() && !l.location.toLowerCase().includes('not identified')) {
        const loc = l.location.trim();
        cityMap.set(loc, (cityMap.get(loc) || 0) + 1);
      }
    });
    return Array.from(cityMap.entries())
      .filter(([_, count]) => count > 0)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  }, [store.leads, countryFilter]);

  // Dynamic channel counts for active leads
  const channelCounts = useMemo(() => {
    const active = store.leads.filter((l) => !l.deletedAt);
    const whatsapp = active.filter(
      (l) => (l.whatsapp && l.whatsapp.trim().length > 0) || (l.phone && l.phone.trim().length > 0)
    ).length;
    const whatsappMobile = active.filter((l) => l.whatsappEligible === true).length;
    const websiteForm = active.filter(
      (l) => Boolean(l.website || l.googleProfile?.website)
    ).length;
    const email = active.filter((l) => Boolean(l.email && l.email.includes('@'))).length;
    const instagram = active.filter((l) => Boolean(l.instagram && l.instagram.trim())).length;
    const facebook = active.filter((l) => Boolean(l.facebook && l.facebook.trim())).length;
    const linkedin = active.filter((l) => Boolean(l.linkedin && l.linkedin.trim())).length;

    return {
      all: active.length,
      whatsapp,
      whatsappMobile,
      websiteForm,
      email,
      instagram,
      facebook,
      linkedin,
    };
  }, [store.leads]);

  // Dynamic counts for status filter options
  const statusCounts = useMemo(() => {
    const activeLeads = store.leads.filter((l) => !l.deletedAt);
    const active = activeLeads.filter((l) => (l.status || 'active') === 'active').length;
    const inactive = activeLeads.filter((l) => (l.status || 'active') === 'inactive' || l.status === 'paused').length;
    return {
      all: activeLeads.length,
      active,
      inactive,
    };
  }, [store.leads]);

  // Dynamic counts for stage filter options
  const stageCounts = useMemo(() => {
    const activeLeads = store.leads.filter((l) => !l.deletedAt);
    const cold = activeLeads.filter((l) => !l.stage || l.stage === 'cold').length;
    const initial = activeLeads.filter((l) => l.stage === 'initial').length;
    const followup_1 = activeLeads.filter((l) => l.stage === 'followup_1').length;
    const followup_2 = activeLeads.filter((l) => l.stage === 'followup_2').length;
    const followup_3 = activeLeads.filter((l) => l.stage === 'followup_3').length;
    const replied = activeLeads.filter((l) => l.consentStatus === 'replied').length;
    return {
      all: activeLeads.length,
      cold,
      initial,
      followup_1,
      followup_2,
      followup_3,
      replied,
    };
  }, [store.leads]);

  // Dynamic counts for consent filter options
  const consentCounts = useMemo(() => {
    const activeLeads = store.leads.filter((l) => !l.deletedAt);
    const none = activeLeads.filter((l) => !l.consentStatus || l.consentStatus === 'none').length;
    const replied = activeLeads.filter((l) => l.consentStatus === 'replied').length;
    const opted_out = activeLeads.filter((l) => l.consentStatus === 'opted_out').length;
    return {
      all: activeLeads.length,
      none,
      replied,
      opted_out,
    };
  }, [store.leads]);

  // Dynamic counts for lists filter options
  const listCounts = useMemo(() => {
    const activeLeads = store.leads.filter((l) => !l.deletedAt);
    const unassigned = activeLeads.filter((l) => !l.lists || l.lists.length === 0).length;
    const map = new Map<string, number>();
    activeLeads.forEach((l) => {
      l.lists?.forEach((lst) => {
        map.set(lst.id, (map.get(lst.id) || 0) + 1);
      });
    });
    return { unassigned, map, all: activeLeads.length };
  }, [store.leads]);

  const hasActiveFilters = useMemo(() => {
    return (
      countryFilter !== 'all' ||
      cityFilter !== 'all' ||
      categoryFilter !== 'all' ||
      stageFilter !== 'all' ||
      statusFilter !== 'all' ||
      consentFilter !== 'all' ||
      channelFilter !== 'all' ||
      channelSubFilter !== 'all' ||
      selectedListFilter !== 'all' ||
      selectedBatchFilter !== 'all' ||
      search.trim().length > 0
    );
  }, [countryFilter, cityFilter, categoryFilter, stageFilter, statusFilter, consentFilter, channelFilter, channelSubFilter, selectedListFilter, selectedBatchFilter, search]);

  const handleClearAllFilters = useCallback(() => {
    setCountryFilter('all');
    setCityFilter('all');
    setCategoryFilter('all');
    setStageFilter('all');
    setStatusFilter('all');
    setConsentFilter('all');
    setChannelFilter('all');
    setChannelSubFilter('all');
    setSelectedListFilter('all');
    setSelectedBatchFilter('all');
    setSearch('');
  }, [setCountryFilter, setChannelFilter]);

  const matchesLeadChannel = useCallback(
    (l: Lead, channel: ChannelFilter, subFilter: string = 'all'): boolean => {
      if (channel === 'all') return true;
      if (channel === 'email') return Boolean(l.email && l.email.includes('@'));
      if (channel === 'whatsapp') {
        const hasWa = Boolean((l.whatsapp && l.whatsapp.trim().length > 0) || (l.phone && l.phone.trim().length > 0));
        if (!hasWa) return false;
        if (subFilter === 'mobile_ready') return l.whatsappEligible === true;
        if (subFilter === 'ineligible') return l.whatsappEligible !== true;
        return true;
      }
      if (channel === 'whatsapp_mobile') return l.whatsappEligible === true;
      if (channel === 'website_form') return Boolean(l.website || l.googleProfile?.website);
      if (channel === 'facebook') return Boolean(l.facebook && l.facebook.trim());
      if (channel === 'instagram') return Boolean(l.instagram && l.instagram.trim());
      if (channel === 'linkedin') return Boolean(l.linkedin && l.linkedin.trim());
      return true;
    },
    []
  );

  const filtered = useMemo(() => {
    if (entityFilter === 'trash') {
      return store.trashLeads.filter((l) => {
        if (countryFilter !== 'all') {
          const leadCountry = (l.country || '').trim() || 'Other';
          if (countryFilter === '(Not identified)') {
            if (leadCountry !== '(Not identified)' && !(l.location && l.location.toLowerCase().includes('not identified'))) {
              return false;
            }
          } else if (leadCountry.toLowerCase() !== countryFilter.toLowerCase()) {
            return false;
          }
        }
        if (cityFilter !== 'all') {
          const leadLoc = (l.location || '').toLowerCase();
          if (!leadLoc.includes(cityFilter.toLowerCase())) return false;
        }
        if (channelFilter !== 'all' && !matchesLeadChannel(l, channelFilter, channelSubFilter)) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          if (
            !l.businessName.toLowerCase().includes(q) &&
            !l.category.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.phone.toLowerCase().includes(q) &&
            !(l.location && l.location.toLowerCase().includes(q)) &&
            !(l.country && l.country.toLowerCase().includes(q))
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
        if (l.deletedAt) return false;
        const hasReply = replyEntityIds.has(l.id);
        if (!hasReply) return false;
        if (countryFilter !== 'all') {
          const leadCountry = (l.country || '').trim() || 'Other';
          if (countryFilter === '(Not identified)') {
            if (leadCountry !== '(Not identified)' && !(l.location && l.location.toLowerCase().includes('not identified'))) {
              return false;
            }
          } else if (leadCountry.toLowerCase() !== countryFilter.toLowerCase()) {
            return false;
          }
        }
        if (cityFilter !== 'all') {
          const leadLoc = (l.location || '').toLowerCase();
          if (!leadLoc.includes(cityFilter.toLowerCase())) return false;
        }
        if (statusFilter !== 'all') {
          const s = l.status || 'active';
          if (statusFilter === 'active' && s !== 'active') return false;
          if (statusFilter === 'inactive' && s !== 'inactive' && s !== 'paused') return false;
        }
        if (channelFilter !== 'all' && !matchesLeadChannel(l, channelFilter, channelSubFilter)) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          if (
            !l.businessName.toLowerCase().includes(q) &&
            !l.category.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.phone.toLowerCase().includes(q) &&
            !(l.location && l.location.toLowerCase().includes(q)) &&
            !(l.country && l.country.toLowerCase().includes(q))
          )
            return false;
        }
        return true;
      });
    }

    if (entityFilter === 'manual_review') {
      return store.leads.filter((l) => {
        if (l.deletedAt) return false;
        if (l.status !== 'manual_review') return false;
        if (countryFilter !== 'all') {
          const leadCountry = (l.country || '').trim() || 'Other';
          if (countryFilter === '(Not identified)') {
            if (leadCountry !== '(Not identified)' && !(l.location && l.location.toLowerCase().includes('not identified'))) {
              return false;
            }
          } else if (leadCountry.toLowerCase() !== countryFilter.toLowerCase()) {
            return false;
          }
        }
        if (cityFilter !== 'all') {
          const leadLoc = (l.location || '').toLowerCase();
          if (!leadLoc.includes(cityFilter.toLowerCase())) return false;
        }
        if (channelFilter !== 'all' && !matchesLeadChannel(l, channelFilter, channelSubFilter)) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          if (
            !l.businessName.toLowerCase().includes(q) &&
            !l.category.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.phone.toLowerCase().includes(q) &&
            !(l.location && l.location.toLowerCase().includes(q)) &&
            !(l.country && l.country.toLowerCase().includes(q)) &&
            !(l.manualReviewReason && l.manualReviewReason.toLowerCase().includes(q))
          )
            return false;
        }
        return true;
      });
    }

    if (entityFilter === 'invalid_list') {
      return store.leads.filter((l) => {
        if (l.deletedAt) return false;
        const isInvalid =
          l.lists?.some((m) => m.name.toLowerCase() === 'invalid list' || m.name.toLowerCase() === 'invalid leads') ||
          (l.emailVerificationStatus && l.emailVerificationStatus !== 'verified' && l.emailVerificationStatus !== 'unverified') ||
          (l.status === 'manual_review' && l.manualReviewReason?.toLowerCase().includes('invalid'));
        if (!isInvalid) return false;

        if (countryFilter !== 'all') {
          const leadCountry = (l.country || '').trim() || 'Other';
          if (countryFilter === '(Not identified)') {
            if (leadCountry !== '(Not identified)' && !(l.location && l.location.toLowerCase().includes('not identified'))) {
              return false;
            }
          } else if (leadCountry.toLowerCase() !== countryFilter.toLowerCase()) {
            return false;
          }
        }
        if (cityFilter !== 'all') {
          const leadLoc = (l.location || '').toLowerCase();
          if (!leadLoc.includes(cityFilter.toLowerCase())) return false;
        }
        if (channelFilter !== 'all' && !matchesLeadChannel(l, channelFilter, channelSubFilter)) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          if (
            !l.businessName.toLowerCase().includes(q) &&
            !l.category.toLowerCase().includes(q) &&
            !l.email.toLowerCase().includes(q) &&
            !l.phone.toLowerCase().includes(q) &&
            !(l.location && l.location.toLowerCase().includes(q)) &&
            !(l.country && l.country.toLowerCase().includes(q)) &&
            !(l.manualReviewReason && l.manualReviewReason.toLowerCase().includes(q))
          )
            return false;
        }
        return true;
      });
    }

    return store.leads.filter((l) => {
      // Exclude soft-deleted leads from active CRM views
      if (l.deletedAt) return false;
      // Exclude contacts quarantined in manual review from regular CRM views
      if (l.status === 'manual_review') return false;

      if (entityFilter === 'lead_added') {
        if (l.entityType !== 'lead') return false;
        if (!l.lists || l.lists.length === 0) return false;
      } else if (entityFilter === 'lead_not_added') {
        if (l.entityType !== 'lead') return false;
        if (l.lists && l.lists.length > 0) return false;
      } else if (entityFilter !== 'all' && l.entityType !== entityFilter) {
        return false;
      }

      // Country & City/Region Filters
      if (countryFilter !== 'all') {
        const leadCountry = (l.country || '').trim() || 'Other';
        if (countryFilter === '(Not identified)') {
          if (leadCountry !== '(Not identified)' && !(l.location && l.location.toLowerCase().includes('not identified'))) {
            return false;
          }
        } else if (leadCountry.toLowerCase() !== countryFilter.toLowerCase()) {
          return false;
        }
      }
      if (cityFilter !== 'all') {
        const leadLoc = (l.location || '').toLowerCase();
        if (!leadLoc.includes(cityFilter.toLowerCase())) return false;
      }

      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      if (statusFilter !== 'all') {
        const s = l.status || 'active';
        if (statusFilter === 'active' && s !== 'active') return false;
        if (statusFilter === 'inactive' && s !== 'inactive' && s !== 'paused') return false;
      }
      if (stageFilter !== 'all') {
        if (stageFilter === 'cold' && (l.stage || 'cold') !== 'cold') return false;
        if (stageFilter === 'initial' && l.stage !== 'initial') return false;
        if (stageFilter === 'followup_1' && l.stage !== 'followup_1') return false;
        if (stageFilter === 'followup_2' && l.stage !== 'followup_2') return false;
        if (stageFilter === 'followup_3' && l.stage !== 'followup_3') return false;
        if (stageFilter === 'replied' && l.consentStatus !== 'replied') return false;
      }
      if (consentFilter !== 'all' && l.consentStatus !== consentFilter) return false;
      if (selectedBatchFilter !== 'all' && l.batchId !== selectedBatchFilter) return false;
      if (selectedListFilter !== 'all') {
        if (selectedListFilter === 'unassigned') {
          if (l.lists && l.lists.length > 0) return false;
        } else {
          if (!l.lists || !l.lists.some((lst) => lst.id === selectedListFilter)) return false;
        }
      }
      if (channelFilter !== 'all' && !matchesLeadChannel(l, channelFilter, channelSubFilter)) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.businessName.toLowerCase().includes(q) &&
          !l.category.toLowerCase().includes(q) &&
          !l.email.toLowerCase().includes(q) &&
          !l.phone.toLowerCase().includes(q) &&
          !(l.location && l.location.toLowerCase().includes(q)) &&
          !(l.website && l.website.toLowerCase().includes(q)) &&
          !(l.country && l.country.toLowerCase().includes(q)) &&
          !(l.facebook && l.facebook.toLowerCase().includes(q)) &&
          !(l.instagram && l.instagram.toLowerCase().includes(q)) &&
          !(l.linkedin && l.linkedin.toLowerCase().includes(q))
        )
          return false;
      }
      return true;
    });
  }, [store.leads, store.trashLeads, store.inboundReplies, entityFilter, countryFilter, cityFilter, categoryFilter, stageFilter, statusFilter, consentFilter, selectedBatchFilter, selectedListFilter, channelFilter, channelSubFilter, search, matchesLeadChannel]);

  const leadConversations = useMemo(() => {
    if (!selectedLead) return [];
    return store.conversationsByLead(selectedLead.id);
  }, [selectedLead, store]);

  // Dynamically load conversation messages and stage info when modal opens
  const handleOpenLead = useCallback(
    async (lead: Lead) => {
      setSelectedLead(lead);
      setMapsUrlInput(lead.googleProfile?.googleMapsUrl || '');
      setReplyText('');
      setSendFeedback(null);
      setConversionMessage(null);
      const existingForm = lead.metadata?.website_form || null;
      setDetectedFormInfo(existingForm);
      setReplyChannel(lead.email ? 'email' : lead.whatsapp ? 'whatsapp' : (lead.website || lead.googleProfile?.website) ? 'website_form' : 'instagram');
      await store.fetchConversationsForEntity(lead.id, lead.entityType === 'client');
      // NOTE: Received messages remain UNREAD until user explicitly clicks "Mark as Read" or sends a reply back!

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

  const handleSyncGoogleMaps = useCallback(
    async (leadId: string, customUrl?: string) => {
      try {
        setIsSyncingMaps(true);
        setGoogleFeedback(null);
        const updated = await store.syncLeadFromGoogleMaps(leadId, customUrl);
        setSelectedLead(updated);
        setMapsUrlInput(updated.googleProfile?.googleMapsUrl || '');
        const gp = updated.googleProfile;
        const msg = gp
          ? `Synced live with Google Maps! ${gp.placeName} (${gp.rating}★, ${gp.reviewsCount} reviews) matches 100%.`
          : 'Lead synchronized with Google Maps successfully!';
        setGoogleFeedback(msg);
        setTimeout(() => setGoogleFeedback(null), 6000);
      } catch (err: any) {
        console.error('Failed to sync lead with Google Maps:', err);
        setGoogleFeedback(err?.message || 'Failed to sync with Google Maps');
        setTimeout(() => setGoogleFeedback(null), 6000);
      } finally {
        setIsSyncingMaps(false);
      }
    },
    [store]
  );

  const handleEnrichLeadFromGoogle = useCallback(
    async (leadId: string) => {
      return handleSyncGoogleMaps(leadId);
    },
    [handleSyncGoogleMaps]
  );

  const handleStartEditGoogle = useCallback(() => {
    if (!selectedLead) return;
    setEditGoogleForm({
      rating: selectedLead.googleProfile?.rating ?? 4.9,
      reviewsCount: selectedLead.googleProfile?.reviewsCount ?? 0,
      formattedAddress: selectedLead.googleProfile?.formattedAddress ?? '',
      category: selectedLead.googleProfile?.category || selectedLead.category || '',
      website: selectedLead.googleProfile?.website ?? '',
      googleMapsUrl: selectedLead.googleProfile?.googleMapsUrl ?? '',
    });
    setIsEditingGoogle(true);
  }, [selectedLead]);

  const handleSaveGoogleEdit = useCallback(async () => {
    if (!selectedLead) return;
    try {
      setIsSavingGoogle(true);
      const updatedProfile = {
        ...(selectedLead.googleProfile || {}),
        placeName: selectedLead.businessName,
        rating: Number(editGoogleForm.rating),
        reviewsCount: Number(editGoogleForm.reviewsCount),
        formattedAddress: editGoogleForm.formattedAddress.trim(),
        category: editGoogleForm.category.trim() || selectedLead.category,
        website: editGoogleForm.website.trim(),
        googleMapsUrl: editGoogleForm.googleMapsUrl.trim(),
        status: (selectedLead.googleProfile?.status || 'OPERATIONAL') as 'OPERATIONAL' | 'VERIFIED' | 'CLAIMED',
        hasGbpClaimed: selectedLead.googleProfile?.hasGbpClaimed ?? true,
        userVerified: true,
        lastEnrichedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      };

      let updatedNotes = selectedLead.notes || '';
      if (updatedNotes.includes('Rating:')) {
        updatedNotes = updatedNotes.replace(
          /Rating:\s*[0-9.]+★\s*\([0-9,]+\s*reviews?\)/i,
          `Rating: ${editGoogleForm.rating}★ (${Number(editGoogleForm.reviewsCount).toLocaleString()} reviews)`
        );
      }

      const updatedLead = await store.updateLead(selectedLead.id, {
        category: editGoogleForm.category.trim() || selectedLead.category,
        notes: updatedNotes,
        googleProfile: updatedProfile,
      });

      setSelectedLead(updatedLead);
      setIsEditingGoogle(false);
      setGoogleFeedback('Google Business Profile details saved and verified successfully!');
      setTimeout(() => setGoogleFeedback(null), 4000);
    } catch (err: any) {
      console.error('Failed to save Google Profile edits:', err);
      setGoogleFeedback(err?.message || 'Failed to save Google Profile details');
      setTimeout(() => setGoogleFeedback(null), 4000);
    } finally {
      setIsSavingGoogle(false);
    }
  }, [selectedLead, editGoogleForm, store]);

  // Auto-enrich lead if Google profile is missing or contains placeholder data
  useEffect(() => {
    if (!selectedLead?.id || selectedLead.entityType !== 'lead') return;
    const gp = selectedLead.googleProfile;
    const hasPlaceholder =
      !gp ||
      !gp.rating ||
      gp.formattedAddress?.includes('Suite, Commercial District') ||
      (selectedLead.businessName.toLowerCase().includes('rooter') && gp.rating === 4.8 && gp.reviewsCount === 40);

    if (hasPlaceholder && !isSyncingMaps) {
      handleEnrichLeadFromGoogle(selectedLead.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id]);

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
      const targetIds = leadsToAddToList.length > 0 ? leadsToAddToList : Array.from(selectedIds);
      if (targetIds.length === 0) return;
      try {
        await store.addLeadsToList(listId, targetIds);
        const targetList = store.lists.find((l) => l.id === listId);
        setIsAddToListOpen(false);
        setLeadsToAddToList([]);
        setSelectedIds(new Set());
        setBulkActionSuccess(
          `Added ${targetIds.length} lead(s) to "${targetList?.name || 'List'}" (marked as added and removed from Main List).`
        );
        setTimeout(() => setBulkActionSuccess(null), 4500);
      } catch (err) {
        console.error('Add to list failed:', err);
      }
    },
    [leadsToAddToList, selectedIds, store]
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

      const targetIds = leadsToAddToList.length > 0 ? leadsToAddToList : Array.from(selectedIds);
      if (isAddToListOpen && targetIds.length > 0) {
        await store.addLeadsToList(created.id, targetIds);
        setIsAddToListOpen(false);
        setLeadsToAddToList([]);
        setSelectedIds(new Set());
        setBulkActionSuccess(`Created "${createdName}" and added ${targetIds.length} lead(s)!`);
        setTimeout(() => setBulkActionSuccess(null), 4500);
      }
    } catch (err) {
      console.error('Create list failed:', err);
      setIsCreatingList(false);
    }
  }, [newListName, newListDesc, isAddToListOpen, leadsToAddToList, selectedIds, store]);

  // Remove lead from list (from inside lead modal)
  const handleRemoveLeadFromList = useCallback(
    async (listId: string, leadId: string) => {
      try {
        await store.removeLeadFromList(listId, leadId);
        setSelectedLead((prev) =>
          prev && prev.id === leadId
            ? { ...prev, lists: (prev.lists || []).filter((l) => l.id !== listId) }
            : prev
        );
        const targetList = store.lists.find((l) => l.id === listId);
        setBulkActionSuccess(`Removed lead from "${targetList?.name || 'List'}".`);
        setTimeout(() => setBulkActionSuccess(null), 3000);
      } catch (err) {
        console.error('Failed to remove lead from list:', err);
      }
    },
    [store]
  );

  // Add lead to single list (from inside lead modal)
  const handleAddLeadToSingleList = useCallback(
    async (listId: string, leadId: string) => {
      try {
        await store.addLeadsToList(listId, [leadId]);
        const targetList = store.lists.find((l) => l.id === listId);
        if (targetList) {
          setSelectedLead((prev) =>
            prev && prev.id === leadId
              ? {
                  ...prev,
                  lists: [
                    ...(prev.lists || []).filter((l) => l.id !== listId),
                    { id: targetList.id, name: targetList.name },
                  ],
                }
              : prev
          );
        }
        setBulkActionSuccess(`Added to "${targetList?.name || 'List'}"!`);
        setTimeout(() => setBulkActionSuccess(null), 3000);
      } catch (err) {
        console.error('Failed to add lead to list:', err);
      }
    },
    [store]
  );

  // Unmark client and revert back to active lead
  const handleUnmarkClient = useCallback(
    async (client: Lead) => {
      const confirmRevert = window.confirm(
        `Are you sure you want to unmark "${client.businessName}" as a client? This will move them from Clients back to active Outreach Leads.`
      );
      if (!confirmRevert) return;

      try {
        setIsUnmarkingClient(true);
        const res = await store.unmarkClient(client.id);
        setSelectedLead(res.lead);
        setBulkActionSuccess(res.message || `Reverted "${client.businessName}" back to active leads.`);
        setTimeout(() => setBulkActionSuccess(null), 4500);
      } catch (err) {
        console.error('Failed to unmark client:', err);
        alert('Failed to unmark client. Check server logs.');
      } finally {
        setIsUnmarkingClient(false);
      }
    },
    [store]
  );

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
            const formSubmission = (res.result as any).websiteFormSubmission;
            const formNote = formSubmission && !formSubmission.skipped
              ? ' + Website Contact Form Submitted! 🌐'
              : '';
            setSendFeedback({
              type: 'success',
              message: `Dispatched ${res.result.stageLabel} ("${res.result.subject}") via Gmail SMTP${formNote}!`,
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

  // Auto-poll leads silently every 20 seconds so background 12h GMB updates stream into UI without user refresh
  useEffect(() => {
    const timer = setInterval(() => {
      store.fetchLeads();
    }, 20000);
    return () => clearInterval(timer);
  }, [store]);

  // Reactively sync selectedLead whenever store.leads changes (e.g. background GMB update or edit)
  useEffect(() => {
    if (!selectedLead) return;
    const currentInStore = store.leads.find((l) => l.id === selectedLead.id);
    if (currentInStore && JSON.stringify(currentInStore) !== JSON.stringify(selectedLead)) {
      setSelectedLead(currentInStore);
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
        alsoSubmitWebsiteForm,
      });

      let feedbackMsg = '';
      if (res.result) {
        if (res.result.actionTaken === 'blocked_consent') {
          setSendFeedback({
            type: 'error',
            message: res.result.reason || 'Blocked: Contact has opted out of communications.',
          });
          return;
        } else if (res.result.actionTaken === 'blocked_channel_rule') {
          setSendFeedback({
            type: 'warning',
            message: res.result.reason || 'Cold WhatsApp sends are disabled by policy (24-hour inbound window only).',
          });
          return;
        } else if (res.result.actionTaken === 'queued_draft') {
          feedbackMsg = 'Instagram DM drafted and added to the Human Send Approval Queue.';
        } else if (res.result.actionTaken === 'throttled_warmup') {
          setSendFeedback({
            type: 'warning',
            message: res.result.reason || 'Sending throttled: Daily email warm-up limit reached.',
          });
          return;
        } else if (res.result.actionTaken === 'sent_direct') {
          feedbackMsg =
            res.result.channel === 'whatsapp'
              ? 'WhatsApp message dispatched within active customer care window.'
              : res.result.channel === 'website_form'
              ? 'Website contact form filled and submitted successfully!'
              : res.result.reason || 'Email dispatched directly through Gmail SMTP.';
        }
      } else {
        feedbackMsg = 'Client message dispatched directly via Conversation Orchestrator.';
      }

      // Check if website form parallel submission had a status
      if (res.websiteFormResult) {
        if (res.websiteFormResult.success) {
          feedbackMsg += ' 🌐 Also submitted via Website Contact Form!';
        } else if (res.websiteFormResult.skipped) {
          feedbackMsg += ` (Website form: ${res.websiteFormResult.reason})`;
        } else if (res.websiteFormResult.error) {
          feedbackMsg += ` (Website form: ${res.websiteFormResult.error})`;
        }
      }

      setSendFeedback({
        type: 'success',
        message: feedbackMsg || 'Outreach dispatched successfully.',
      });
      setReplyText('');

      await store.fetchConversationsForEntity(selectedLead.id, selectedLead.entityType === 'client');
    } catch (err) {
      console.error('Send reply failed:', err);
      setSendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send message',
      });
    } finally {
      setIsSending(false);
    }
  }, [selectedLead, replyText, replyChannel, alsoSubmitWebsiteForm, store]);

  const handleImproviseReply = useCallback(
    async (roughTextOverride?: string) => {
      if (!selectedLead) return;
      const textToImprovise = (roughTextOverride || replyText).trim() || 'free audit of website, checking local ranking, quick chat';
      try {
        setIsImprovisingReply(true);
        const res = await api.improvise({
          text: textToImprovise,
          channel: replyChannel,
          businessName: selectedLead.businessName,
          category: selectedLead.category,
        });
        setReplyText(res.improvedText);
        setImproviseBadge(`✨ Improvised for ${channelLabels[replyChannel]} (Realistic & Consultative)`);
        setTimeout(() => setImproviseBadge(null), 6000);
      } catch (err) {
        console.error('Failed to improvise reply:', err);
      } finally {
        setIsImprovisingReply(false);
      }
    },
    [selectedLead, replyText, replyChannel]
  );

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
            {/* 24/7 Autopilot Master Button */}
            <button
              type="button"
              onClick={() => setIsAutopilotModalOpen(true)}
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-sm border-indigo-300 text-indigo-950 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 hover:from-indigo-100 hover:to-purple-100 transition cursor-pointer"
              title="Autonomous 24/7 Drip Engine, Inbound AI & Contact Enricher"
            >
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${store.autopilotStatus?.dripEngine.enabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${store.autopilotStatus?.dripEngine.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
              </span>
              <Zap size={14} className="text-amber-500 fill-amber-500" />
              <span className="font-bold">⚡ Autopilot ({store.autopilotStatus?.dripEngine.leadsDueTotal ?? 0} Due)</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5">
                {store.autopilotStatus?.dripEngine.enabled ? '24/7 Active' : 'Paused'}
              </span>
            </button>

            {/* 12-Hour GMB Auto-Sync Status & Trigger */}
            <button
              type="button"
              onClick={handleSyncGmbAll}
              disabled={isSyncingGmb}
              className="btn-secondary text-xs flex items-center gap-1.5 shadow-sm border-amber-300 text-amber-900 bg-amber-50/80 hover:bg-amber-100 transition"
              title="12-Hour Automated Sync is active. Click to trigger instant Google My Business matching on all leads."
            >
              <RefreshCw size={13} className={isSyncingGmb ? 'animate-spin text-amber-600' : 'text-amber-600'} />
              <span className="font-semibold">{isSyncingGmb ? 'Matching GMB...' : 'Sync GMB Now 🔄'}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                12h Auto
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

            {/* Lead Scraper (Gradual Location Identification) */}
            <button
              type="button"
              onClick={isScrapingLocations ? handleStopLocationScrape : handleStartLocationScrape}
              disabled={isScrapingSingle}
              className={`btn-secondary text-xs flex items-center gap-1.5 shadow-sm transition border-indigo-300 ${
                isScrapingLocations
                  ? 'text-indigo-900 bg-indigo-100 hover:bg-indigo-200 ring-2 ring-indigo-400'
                  : 'text-indigo-800 bg-indigo-50/90 hover:bg-indigo-100'
              }`}
              title="Inspects lead email domains, website addresses and phone area codes to find city/region or mark as (Not identified)."
            >
              <Compass
                size={14}
                className={isScrapingLocations ? 'animate-spin text-indigo-600' : 'text-indigo-600'}
              />
              <span className="font-semibold">
                {isScrapingLocations
                  ? `Scraping Locations (${scraperStatus?.processed ?? 0}/${scraperStatus?.total ?? '...'})`
                  : '📍 Scrape Locations'}
              </span>
              {isScrapingLocations && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded bg-rose-200 text-rose-800 hover:bg-rose-300">
                  Stop
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* 4-CHANNEL OUTREACH HUB vs FULL CRM TABLE VIEW MODE TOGGLE */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => setCrmViewMode('channels')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              crmViewMode === 'channels'
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                : 'text-ink-600 hover:text-ink-900 hover:bg-slate-200/50'
            }`}
          >
            <Zap size={15} className="text-amber-500 fill-amber-500" />
            <span>⚡ Multi-Channel Outreach Hub (Email, WhatsApp, FB, IG, LinkedIn)</span>
          </button>

          <button
            type="button"
            onClick={() => setCrmViewMode('table')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              crmViewMode === 'table'
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                : 'text-ink-600 hover:text-ink-900 hover:bg-slate-200/50'
            }`}
          >
            <Users size={15} className="text-ink-600" />
            <span>Classic Leads &amp; Clients Table</span>
          </button>
        </div>
      </div>

      {crmViewMode === 'channels' ? (
        <ChannelOutreachHub
          leads={store.leads.filter((l) => !l.deletedAt)}
          lists={store.lists}
          onRefreshLeads={store.refreshAll}
          onDeleteLead={store.deleteLead}
          onBulkDeleteLeads={store.bulkDeleteLeads}
          onAddLeadsToList={store.addLeadsToList}
          onCreateList={store.createList}
          onOpenConversation={(id) => handleOpenEntityById(id, 'lead')}
          onOpenInboundInbox={() => setIsInboundInboxOpen(true)}
          inboundRepliesCount={store.inboundReplies.length}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm flex-wrap">
          {[
            { key: 'all', label: `All Records (${store.leads.filter((l) => !l.deletedAt && l.status !== 'manual_review').length})` },
            {
              key: 'lead_added',
              label: `Added Leads (${addedLeadsCount})`,
              icon: CheckCircle2,
            },
            {
              key: 'lead_not_added',
              label: `Not Added (${notAddedLeadsCount})`,
              icon: Clock,
            },
            { key: 'client', label: `Clients (${clientEntities.length})`, icon: UserCheck },
            {
              key: 'inbound',
              label: `Email Replies (${inboundContactCount})`,
              icon: Mail,
            },
            {
              key: 'manual_review',
              label: `Manual Checking (${manualReviewCount})`,
              icon: AlertTriangle,
            },
            {
              key: 'invalid_list',
              label: `Invalid List (${invalidLeadsCount})`,
              icon: MailX,
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
                if (onSubFilterChange) {
                  onSubFilterChange(key as CrmSubFilter);
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                entityFilter === key
                  ? key === 'lead_added'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : key === 'lead_not_added'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : key === 'trash'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : key === 'inbound'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : key === 'manual_review'
                    ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400'
                    : key === 'invalid_list'
                    ? 'bg-rose-700 text-white shadow-sm ring-1 ring-rose-500'
                    : 'bg-brand-600 text-white shadow-sm'
                  : key === 'lead_added'
                  ? 'text-emerald-700 hover:bg-emerald-50 font-bold'
                  : key === 'lead_not_added'
                  ? 'text-amber-700 hover:bg-amber-50 font-bold'
                  : key === 'trash'
                  ? 'text-rose-700 hover:bg-rose-50 font-bold'
                  : key === 'inbound'
                  ? 'text-blue-700 hover:bg-blue-50 font-bold'
                  : key === 'manual_review'
                  ? 'text-rose-700 bg-rose-50/80 hover:bg-rose-100 font-bold'
                  : key === 'invalid_list'
                  ? 'text-rose-800 bg-rose-50 hover:bg-rose-100 font-bold'
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

          {/* Country Filter - Shows only countries whose leads are listed */}
          <select
            value={countryFilter}
            onChange={(e) => {
              setCountryFilter(e.target.value);
              setCityFilter('all');
            }}
            className={`input py-1.5 text-xs w-auto font-medium transition-all ${
              countryFilter !== 'all'
                ? 'ring-2 ring-brand-500 bg-brand-50/50 text-brand-900 font-bold border-brand-300'
                : ''
            }`}
            title="Filter leads by country (showing only countries with leads)"
          >
            <option value="all">🌍 All Countries ({uniqueCountries.length})</option>
            {uniqueCountries.map(({ country, count, flag }) => (
              <option key={country} value={country}>
                {flag} {country} ({count})
              </option>
            ))}
          </select>

          {/* City / Location Sub-Filter - Populated with cities in selected country whose leads are listed */}
          {countryFilter !== 'all' && uniqueCitiesInCountry.length > 0 && (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className={`input py-1.5 text-xs w-auto font-medium transition-all animate-fadeIn ${
                cityFilter !== 'all'
                  ? 'ring-2 ring-indigo-500 bg-indigo-50/50 text-indigo-900 font-bold border-indigo-300'
                  : ''
              }`}
              title={`Sub-filter by city/region in ${countryFilter}`}
            >
              <option value="all">📍 All Cities ({countryFilter} - {uniqueCitiesInCountry.length})</option>
              {uniqueCitiesInCountry.map(({ city, count }) => (
                <option key={city} value={city}>
                  {city} ({count})
                </option>
              ))}
            </select>
          )}

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`input py-1.5 text-xs w-auto font-medium transition-all ${
              categoryFilter !== 'all'
                ? 'ring-2 ring-purple-500 bg-purple-50/50 text-purple-900 font-bold border-purple-300'
                : ''
            }`}
            title="Filter by business industry or category"
          >
            <option value="all">All Categories ({uniqueCategories.length})</option>
            {uniqueCategories.map(({ category, count }) => (
              <option key={category} value={category}>
                {category} ({count})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={`input py-1.5 text-xs w-auto font-medium transition-all ${
              statusFilter !== 'all'
                ? 'ring-2 ring-slate-500 bg-slate-50/50 text-slate-900 font-bold border-slate-300'
                : ''
            }`}
          >
            <option value="all">All Status ({statusCounts.all})</option>
            <option value="active">Active Only ({statusCounts.active})</option>
            <option value="inactive">Inactive Only ({statusCounts.inactive})</option>
          </select>

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className={`input py-1.5 text-xs w-auto font-medium transition-all ${
              stageFilter !== 'all'
                ? 'ring-2 ring-amber-500 bg-amber-50/50 text-amber-900 font-bold border-amber-300'
                : ''
            }`}
            title="Filter by outreach sequence stage"
          >
            <option value="all">All Stages ({stageCounts.all})</option>
            <option value="cold">❄️ Cold (Uncontacted) ({stageCounts.cold})</option>
            <option value="initial">📤 Initial Outreach ({stageCounts.initial})</option>
            <option value="followup_1">🔄 Follow-up 1 (Day 2.5) ({stageCounts.followup_1})</option>
            <option value="followup_2">⚡ Follow-up 2 (Day 5.5) ({stageCounts.followup_2})</option>
            <option value="followup_3">🎯 Final Follow-up (Day 10) ({stageCounts.followup_3})</option>
            <option value="replied">💬 Replied ({stageCounts.replied})</option>
          </select>

          {/* Consent / Response Filter */}
          <select
            value={consentFilter}
            onChange={(e) => setConsentFilter(e.target.value as ConsentStatus | 'all')}
            className={`input py-1.5 text-xs w-auto font-medium transition-all ${
              consentFilter !== 'all'
                ? 'ring-2 ring-emerald-500 bg-emerald-50/50 text-emerald-900 font-bold border-emerald-300'
                : ''
            }`}
          >
            <option value="all">All Consent ({consentCounts.all})</option>
            <option value="none">No response ({consentCounts.none})</option>
            <option value="replied">Replied ({consentCounts.replied})</option>
            <option value="opted_out">Opted out ({consentCounts.opted_out})</option>
          </select>

          {/* Expanded Channels Filter */}
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value as ChannelFilter);
              setChannelSubFilter('all');
            }}
            className={`input py-1.5 text-xs w-auto font-medium transition-all ${
              channelFilter !== 'all'
                ? 'ring-2 ring-brand-500 bg-brand-50/50 text-brand-900 font-bold border-brand-300'
                : ''
            }`}
            title="Filter by available contact channel"
          >
            <option value="all">⚡ All Channels ({channelCounts.all})</option>
            <option value="whatsapp">💬 WhatsApp ({channelCounts.whatsapp})</option>
            <option value="whatsapp_mobile">📱 WhatsApp (Mobile Ready) ({channelCounts.whatsappMobile})</option>
            <option value="website_form">🌐 Website Form ({channelCounts.websiteForm})</option>
            <option value="email">✉️ Email ({channelCounts.email})</option>
            <option value="instagram">📸 Instagram ({channelCounts.instagram})</option>
            <option value="facebook">👥 Facebook ({channelCounts.facebook})</option>
            <option value="linkedin">💼 LinkedIn ({channelCounts.linkedin})</option>
          </select>

          {/* Channel Sub-Filter for WhatsApp */}
          {(channelFilter === 'whatsapp' || channelFilter === 'whatsapp_mobile') && (
            <select
              value={channelSubFilter}
              onChange={(e) => setChannelSubFilter(e.target.value)}
              className={`input py-1.5 text-xs w-auto font-medium transition-all animate-fadeIn ${
                channelSubFilter !== 'all'
                  ? 'ring-2 ring-emerald-500 bg-emerald-50/50 text-emerald-900 font-bold border-emerald-300'
                  : ''
              }`}
              title="Sub-filter WhatsApp leads"
            >
              <option value="all">💬 All WhatsApp ({channelCounts.whatsapp})</option>
              <option value="mobile_ready">📱 Mobile Ready Only ({channelCounts.whatsappMobile})</option>
              {channelCounts.whatsapp - channelCounts.whatsappMobile > 0 && (
                <option value="ineligible">☎️ Other / Landline ({channelCounts.whatsapp - channelCounts.whatsappMobile})</option>
              )}
            </select>
          )}

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 text-rose-600 hover:bg-rose-50 border-rose-200 font-semibold"
              title="Reset all filters back to default"
            >
              <X size={12} />
              <span>Reset Filters</span>
            </button>
          )}

          {/* Lists Filter */}
          <div className="flex items-center gap-1.5 ml-1 border-l border-slate-200 pl-2">
            <Bookmark size={13} className="text-brand-500" />
            <select
              value={selectedListFilter}
              onChange={(e) => handleListFilterChange(e.target.value)}
              className="input py-1.5 text-xs w-auto font-medium"
            >
              <option value="all">📁 All Contacts ({listCounts.all})</option>
              <option value="unassigned">📥 Main List (Unassigned) ({listCounts.unassigned})</option>
              {store.lists.length > 0 && <option disabled>──────────</option>}
              {store.lists.map((lst) => (
                <option key={lst.id} value={lst.id}>
                  🏷️ {lst.name} ({listCounts.map.get(lst.id) || lst.lead_count || 0})
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
            {entityFilter !== 'trash' && (
              <button
                onClick={() => {
                  setLeadsToAddToList(filtered.map((l) => l.id));
                  setIsAddToListOpen(true);
                }}
                disabled={filtered.length === 0}
                className="btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-200 font-medium transition"
                title={`Add all ${filtered.length} filtered leads to a custom list`}
              >
                <BookmarkPlus size={13} className="text-brand-600" />
                <span>Add Filtered ({filtered.length})</span>
              </button>
            )}
            {selectedListFilter !== 'all' && selectedListFilter !== 'unassigned' && (
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="btn-primary py-1.5 px-2.5 text-xs flex items-center gap-1 font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs"
                title="Shoot or schedule automated humanized outreach for this selected list"
              >
                <Zap size={13} className="fill-white" />
                <span>Auto-Shoot List</span>
              </button>
            )}
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
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-bold">
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

      {/* Dynamic Country Sub-Filter Bar - Shows only countries whose leads are listed */}
      {uniqueCountries.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-2xs mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400 mr-1 flex items-center gap-1">
              <Globe size={13} className="text-brand-600" />
              <span>Country:</span>
            </span>

            <button
              onClick={() => {
                setCountryFilter('all');
                setCityFilter('all');
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                countryFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'bg-slate-50 text-ink-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>🌍</span>
              <span>All Countries</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  countryFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-ink-700'
                }`}
              >
                {store.leads.length}
              </span>
            </button>

            {uniqueCountries.map(({ country, count, flag }) => {
              const isSelected = countryFilter.toLowerCase() === country.toLowerCase();
              return (
                <button
                  key={country}
                  onClick={() => {
                    if (isSelected) {
                      setCountryFilter('all');
                      setCityFilter('all');
                    } else {
                      setCountryFilter(country);
                      setCityFilter('all');
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-brand-600 text-white shadow-2xs ring-1 ring-brand-400 font-bold'
                      : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-brand-50/70 hover:border-brand-300'
                  }`}
                  title={`Filter leads in ${country} (${count} leads)`}
                >
                  <span className="text-xs">{flag}</span>
                  <span>{country}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-ink-700'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sub-Filter: Cities / Regions inside Selected Country */}
          {countryFilter !== 'all' && uniqueCitiesInCountry.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 ml-auto border-l border-slate-200 pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
                <MapPin size={11} />
                <span>Cities:</span>
              </span>
              <button
                onClick={() => setCityFilter('all')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                  cityFilter === 'all'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/60'
                }`}
              >
                All ({uniqueCitiesInCountry.reduce((sum, c) => sum + c.count, 0)})
              </button>
              {uniqueCitiesInCountry.map(({ city, count }) => {
                const isCitySelected = cityFilter.toLowerCase() === city.toLowerCase();
                return (
                  <button
                    key={city}
                    onClick={() => setCityFilter(isCitySelected ? 'all' : city)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                      isCitySelected
                        ? 'bg-indigo-600 text-white font-bold ring-1 ring-indigo-400 shadow-2xs'
                        : 'bg-slate-100 text-ink-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {city} <span className="text-[10px] opacity-75 font-semibold">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dynamic Channel Quick-Filter Bar with Sub-Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-2xs mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400 mr-1 flex items-center gap-1">
            <Zap size={13} className="text-amber-500" />
            <span>Channel:</span>
          </span>

          <button
            onClick={() => {
              setChannelFilter('all');
              setChannelSubFilter('all');
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
              channelFilter === 'all'
                ? 'bg-slate-800 text-white shadow-2xs'
                : 'bg-slate-50 text-ink-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>⚡</span>
            <span>All Channels</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                channelFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-ink-700'
              }`}
            >
              {channelCounts.all}
            </span>
          </button>

          {/* WhatsApp */}
          <button
            onClick={() => {
              if (channelFilter === 'whatsapp') {
                setChannelFilter('all');
                setChannelSubFilter('all');
              } else {
                setChannelFilter('whatsapp');
                setChannelSubFilter('all');
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
              channelFilter === 'whatsapp' || channelFilter === 'whatsapp_mobile'
                ? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-400 font-bold'
                : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-emerald-50/70 hover:border-emerald-300'
            }`}
            title={`Filter leads with WhatsApp (${channelCounts.whatsapp} leads)`}
          >
            <span className="text-xs">💬</span>
            <span>WhatsApp</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                channelFilter === 'whatsapp' || channelFilter === 'whatsapp_mobile'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-ink-700'
              }`}
            >
              {channelCounts.whatsapp}
            </span>
          </button>

          {/* Website Form */}
          <button
            onClick={() => {
              if (channelFilter === 'website_form') {
                setChannelFilter('all');
                setChannelSubFilter('all');
              } else {
                setChannelFilter('website_form');
                setChannelSubFilter('all');
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
              channelFilter === 'website_form'
                ? 'bg-blue-600 text-white shadow-2xs ring-1 ring-blue-400 font-bold'
                : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-blue-50/70 hover:border-blue-300'
            }`}
            title={`Filter leads with Website Form (${channelCounts.websiteForm} leads)`}
          >
            <span className="text-xs">🌐</span>
            <span>Website Form</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                channelFilter === 'website_form'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-ink-700'
              }`}
            >
              {channelCounts.websiteForm}
            </span>
          </button>

          {/* Email */}
          <button
            onClick={() => {
              if (channelFilter === 'email') {
                setChannelFilter('all');
                setChannelSubFilter('all');
              } else {
                setChannelFilter('email');
                setChannelSubFilter('all');
              }
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
              channelFilter === 'email'
                ? 'bg-brand-600 text-white shadow-2xs ring-1 ring-brand-400 font-bold'
                : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-brand-50/70 hover:border-brand-300'
            }`}
            title={`Filter leads with Email (${channelCounts.email} leads)`}
          >
            <span className="text-xs">✉️</span>
            <span>Email</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                channelFilter === 'email'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-ink-700'
              }`}
            >
              {channelCounts.email}
            </span>
          </button>

          {/* Instagram */}
          {channelCounts.instagram > 0 && (
            <button
              onClick={() => {
                if (channelFilter === 'instagram') {
                  setChannelFilter('all');
                  setChannelSubFilter('all');
                } else {
                  setChannelFilter('instagram');
                  setChannelSubFilter('all');
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                channelFilter === 'instagram'
                  ? 'bg-pink-600 text-white shadow-2xs ring-1 ring-pink-400 font-bold'
                  : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-pink-50/70 hover:border-pink-300'
              }`}
              title={`Filter leads with Instagram (${channelCounts.instagram} leads)`}
            >
              <span className="text-xs">📸</span>
              <span>Instagram</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  channelFilter === 'instagram'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-ink-700'
                }`}
              >
                {channelCounts.instagram}
              </span>
            </button>
          )}

          {/* Facebook */}
          {channelCounts.facebook > 0 && (
            <button
              onClick={() => {
                if (channelFilter === 'facebook') {
                  setChannelFilter('all');
                  setChannelSubFilter('all');
                } else {
                  setChannelFilter('facebook');
                  setChannelSubFilter('all');
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                channelFilter === 'facebook'
                  ? 'bg-indigo-600 text-white shadow-2xs ring-1 ring-indigo-400 font-bold'
                  : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-indigo-50/70 hover:border-indigo-300'
              }`}
              title={`Filter leads with Facebook (${channelCounts.facebook} leads)`}
            >
              <span className="text-xs">👥</span>
              <span>Facebook</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  channelFilter === 'facebook'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-ink-700'
                }`}
              >
                {channelCounts.facebook}
              </span>
            </button>
          )}

          {/* LinkedIn */}
          {channelCounts.linkedin > 0 && (
            <button
              onClick={() => {
                if (channelFilter === 'linkedin') {
                  setChannelFilter('all');
                  setChannelSubFilter('all');
                } else {
                  setChannelFilter('linkedin');
                  setChannelSubFilter('all');
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                channelFilter === 'linkedin'
                  ? 'bg-sky-700 text-white shadow-2xs ring-1 ring-sky-500 font-bold'
                  : 'bg-slate-50 text-ink-700 border border-slate-200 hover:bg-sky-50/70 hover:border-sky-300'
              }`}
              title={`Filter leads with LinkedIn (${channelCounts.linkedin} leads)`}
            >
              <span className="text-xs">💼</span>
              <span>LinkedIn</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  channelFilter === 'linkedin'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-ink-700'
                }`}
              >
                {channelCounts.linkedin}
              </span>
            </button>
          )}
        </div>

        {/* WhatsApp Sub-Filter Pills */}
        {(channelFilter === 'whatsapp' || channelFilter === 'whatsapp_mobile') && (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto border-l border-slate-200 pl-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
              <Filter size={11} />
              <span>Sub-filter:</span>
            </span>
            <button
              onClick={() => {
                setChannelFilter('whatsapp');
                setChannelSubFilter('all');
              }}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                channelFilter === 'whatsapp' && channelSubFilter === 'all'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              All WhatsApp ({channelCounts.whatsapp})
            </button>
            <button
              onClick={() => {
                setChannelFilter('whatsapp');
                setChannelSubFilter('mobile_ready');
              }}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                channelSubFilter === 'mobile_ready' || channelFilter === 'whatsapp_mobile'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              📱 Mobile Ready ({channelCounts.whatsappMobile})
            </button>
            {channelCounts.whatsapp - channelCounts.whatsappMobile > 0 && (
              <button
                onClick={() => {
                  setChannelFilter('whatsapp');
                  setChannelSubFilter('ineligible');
                }}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
                  channelSubFilter === 'ineligible'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                }`}
              >
                ☎️ Other ({channelCounts.whatsapp - channelCounts.whatsappMobile})
              </button>
            )}
          </div>
        )}
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

      {/* Dedicated Manual Checking Quarantine Banner */}
      {entityFilter === 'manual_review' && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 via-white to-amber-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-rose-500/20">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink-900">
                  Manual Checking Quarantine ({filtered.length} contacts)
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                  Anonymous / Delivery Failures
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                Contacts whose emails or messages bounced, failed delivery (e.g. Mailer-Daemon 550), or targeted anonymous addresses are quarantined here to prevent repeated failures and safeguard sender reputation.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    const ids = filtered.map((l) => l.id);
                    await store.bulkApproveLeadReviews(ids);
                    setBulkActionSuccess(`Re-activated and approved ${ids.length} contacts.`);
                  }}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm"
                  title="Approve all quarantined contacts back to active lead status"
                >
                  <CheckCircle2 size={14} />
                  <span>Approve & Re-activate All ({filtered.length})</span>
                </button>
                <button
                  onClick={async () => {
                    if (confirm(`Move all ${filtered.length} quarantined contacts to Trash?`)) {
                      await store.bulkDeleteLeads(filtered.map((l) => l.id));
                      setBulkActionSuccess(`Moved ${filtered.length} contacts to Trash.`);
                    }
                  }}
                  className="btn-secondary text-rose-700 hover:bg-rose-50 border-rose-300 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm font-semibold transition"
                  title="Move all quarantined contacts to Trash"
                >
                  <Trash2 size={14} className="text-rose-600" />
                  <span>Delete All</span>
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

      {/* Dedicated Invalid List Banner */}
      {entityFilter === 'invalid_list' && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 via-white to-orange-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-rose-500/20">
              <MailX size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink-900">
                  Invalid Email List ({filtered.length} contacts)
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
                  Pre-Send Verification Guard
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                These contacts have invalid syntax, disposable domains, unresolvable mail exchange (MX) servers, or prior hard bounces. Outbound email is blocked before dispatch to prevent domain penalties.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    const ids = filtered.map((l) => l.id);
                    await store.bulkApproveLeadReviews(ids);
                    setBulkActionSuccess(`Re-activated and restored ${ids.length} contacts.`);
                  }}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm"
                  title="Restore all invalid contacts back to active lead status"
                >
                  <CheckCircle2 size={14} />
                  <span>Restore All ({filtered.length})</span>
                </button>
                <button
                  onClick={async () => {
                    if (confirm(`Move all ${filtered.length} invalid contacts to Trash?`)) {
                      await store.bulkDeleteLeads(filtered.map((l) => l.id));
                      setBulkActionSuccess(`Moved ${filtered.length} contacts to Trash.`);
                    }
                  }}
                  className="btn-secondary text-rose-700 hover:bg-rose-50 border-rose-300 flex items-center gap-1.5 text-xs py-2 px-3.5 shadow-sm font-semibold transition"
                  title="Move all invalid contacts to Trash"
                >
                  <Trash2 size={14} className="text-rose-600" />
                  <span>Delete All</span>
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

      {entityFilter === 'lead_not_added' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Clock size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-amber-900">
                  Not Added Leads ({filtered.length} unassigned leads)
                </h4>
                <p className="text-xs text-amber-700 mt-0.5">
                  These leads are saved in your database but haven't been added to any custom list or outreach campaign yet.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setLeadsToAddToList(filtered.map((l) => l.id));
                  setIsAddToListOpen(true);
                }}
                disabled={filtered.length === 0}
                className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-0 shadow-2xs"
              >
                <FolderPlus size={13} />
                <span>Add All ({filtered.length}) to Custom List</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {entityFilter === 'lead_added' && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-emerald-900">
                Added Leads ({filtered.length} active leads)
              </h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                Showing leads enrolled in custom lists or actively assigned to outreach sequences.
              </p>
            </div>
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
              ) : entityFilter === 'manual_review' || entityFilter === 'invalid_list' ? (
                <tr className="border-b border-rose-200 bg-rose-50/70 text-left">
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all"
                      className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-rose-900">Contact / Business</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-rose-900">Email & Phone</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-rose-900">
                    {entityFilter === 'invalid_list' ? 'Validation Status / Reason' : 'Quarantine Reason'}
                  </th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-rose-900">Date Quarantined</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-rose-900 text-right">Actions</th>
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
                    colSpan={entityFilter === 'trash' ? 7 : (entityFilter === 'manual_review' || entityFilter === 'invalid_list') ? 6 : 10}
                    className="px-4 py-12 text-center text-ink-300"
                  >
                    {entityFilter === 'trash'
                      ? 'Trash is empty. No deleted records found.'
                      : entityFilter === 'invalid_list'
                      ? 'Invalid List is empty. All recipient emails are verified and healthy!'
                      : entityFilter === 'manual_review'
                      ? 'No records in manual checking. All emails and messages are healthy!'
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
              ) : entityFilter === 'manual_review' || entityFilter === 'invalid_list' ? (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleOpenLead(lead)}
                    className="cursor-pointer transition-colors hover:bg-rose-50/60"
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
                        className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-ink-900 flex items-center gap-1.5">
                          <span>{lead.businessName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                            entityFilter === 'invalid_list'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-rose-100 text-rose-800 border-rose-200'
                          }`}>
                            {entityFilter === 'invalid_list' ? 'Invalid Email' : 'Quarantined'}
                          </span>
                        </p>
                        <p className="text-xs text-ink-400">{lead.category || 'General'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <div className="font-medium text-ink-800">{lead.email || 'No email'}</div>
                        {lead.phone && <div className="text-ink-400">{lead.phone}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 max-w-md truncate"
                        title={lead.manualReviewReason || lead.emailVerificationStatus || 'Invalid email format or domain'}
                      >
                        {entityFilter === 'invalid_list' ? (
                          <MailX size={12} className="shrink-0 text-rose-500" />
                        ) : (
                          <AlertTriangle size={12} className="shrink-0 text-rose-500" />
                        )}
                        <span className="truncate">{lead.manualReviewReason || lead.emailVerificationStatus || 'Invalid email format or domain'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {lead.manualReviewAt
                        ? new Date(lead.manualReviewAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Recent'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={async () => {
                            await store.approveLeadReview(lead.id);
                            setBulkActionSuccess(`Re-activated ${lead.businessName}.`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-sm transition"
                          title="Approve contact and move back to active lead status"
                        >
                          <Check size={12} />
                          <span>Approve & Re-activate</span>
                        </button>
                        <button
                          onClick={() => {
                            handleOpenLead(lead);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-ink-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition"
                          title="View contact thread and details"
                        >
                          <Eye size={12} />
                          <span>Inspect</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSingleLead(lead)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                          title="Trash this contact"
                        >
                          <Trash2 size={13} />
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
                          <div className={`font-semibold ${isInactive ? 'text-ink-600' : 'text-ink-900'} flex items-center gap-1.5 flex-wrap`}>
                            <span>{lead.businessName}</span>
                            {/* Location Badge: Shows resolved location or (Not identified) */}
                            {lead.location && lead.location !== '(Not identified)' ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                                title={`Identified Location: ${lead.location}`}
                              >
                                <MapPin size={9} className="text-indigo-500 shrink-0" />
                                <span>{lead.location}</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200"
                                title="Location: (Not identified)"
                              >
                                <MapPin size={9} className="text-slate-400 shrink-0" />
                                <span>(Not identified)</span>
                              </span>
                            )}
                            {lead.country && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                title={`Country: ${lead.country}`}
                              >
                                <span>{getCountryFlag(lead.country)}</span>
                                <span>{lead.country}</span>
                              </span>
                            )}
                            {lead.lists && lead.lists.length > 0 && (
                              <span className="flex flex-wrap gap-1">
                                {lead.lists.map((lst) => (
                                  <span
                                    key={lst.id}
                                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-brand-50 text-brand-700 border border-brand-200"
                                    title={`In list: ${lst.name}`}
                                  >
                                    <Bookmark size={9} />
                                    <span>{lst.name}</span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-400 flex items-center gap-2 flex-wrap mt-0.5">
                            {(() => {
                              const cleanWeb = cleanSiteUrl(lead.website || lead.googleProfile?.website);
                              if (!cleanWeb) return null;
                              return (
                                <a
                                  href={cleanWeb}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline max-w-[170px] truncate bg-blue-50/60 px-1.5 py-0.5 rounded border border-blue-200/80 transition"
                                  title={`Visit Website: ${cleanWeb}`}
                                >
                                  <Globe size={11} className="shrink-0 text-blue-500" />
                                  <span className="truncate">{cleanWeb.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                  <ExternalLink size={9} className="shrink-0 opacity-70" />
                                </a>
                              );
                            })()}
                            {lead.email && <span className="truncate max-w-[180px] text-ink-500">{lead.email}</span>}
                            {lead.phone && (
                              <span className="font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px] font-semibold">
                                {lead.phone}
                              </span>
                            )}
                            {!lead.email && !lead.phone && !cleanSiteUrl(lead.website || lead.googleProfile?.website) && (
                              <span className="text-ink-300 italic">No contact info</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-500">{lead.category}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {lead.email && (
                            <span title={`Email: ${lead.email}`}>
                              <Mail size={14} className="text-brand-500" />
                            </span>
                          )}
                          {lead.whatsapp && (
                            <span title={`WhatsApp: ${lead.whatsapp}`}>
                              <MessageCircle size={14} className="text-emerald-500" />
                            </span>
                          )}
                          {cleanSiteUrl(lead.website || lead.googleProfile?.website) && (
                            <span title={`Website & Form: ${cleanSiteUrl(lead.website || lead.googleProfile?.website)}`}>
                              <Globe size={14} className="text-teal-600" />
                            </span>
                          )}
                          {(lead.instagram || lead.facebook) && (
                            <span title="Social profile">
                              <Instagram size={14} className="text-violet-500" />
                            </span>
                          )}
                          {!lead.email && !lead.whatsapp && !lead.instagram && !lead.facebook && !cleanSiteUrl(lead.website || lead.googleProfile?.website) && (
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
                          {lead.entityType === 'client' && (
                            <button
                              onClick={() => handleUnmarkClient(lead)}
                              disabled={isUnmarkingClient}
                              className="p-1.5 rounded-lg transition text-xs font-semibold flex items-center gap-1 text-amber-700 hover:bg-amber-50 border border-amber-200 hover:border-amber-300"
                              title="Unmark as Client (Revert to Lead)"
                            >
                              <RotateCcw size={12} />
                              <span className="text-[10px]">Unmark</span>
                            </button>
                          )}
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
        </>
      )}

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
                      onClick={() => handleUnmarkClient(selectedLead)}
                      disabled={isUnmarkingClient}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-300 shadow-xs transition"
                      title="Revert client back to an active outreach lead"
                    >
                      <RotateCcw size={13} />
                      <span>{isUnmarkingClient ? 'Reverting...' : 'Unmark as Client'}</span>
                    </button>
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

            {/* Quarantined for Manual Review or Invalid List Banner */}
            {(selectedLead.status === 'manual_review' ||
              selectedLead.lists?.some((m) => m.name.toLowerCase() === 'invalid list') ||
              (selectedLead.emailVerificationStatus && selectedLead.emailVerificationStatus !== 'verified' && selectedLead.emailVerificationStatus !== 'unverified')) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900 flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  {selectedLead.lists?.some((m) => m.name.toLowerCase() === 'invalid list') || selectedLead.manualReviewReason?.toLowerCase().includes('invalid') ? (
                    <MailX size={18} className="text-rose-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                  )}
                  <div>
                    <p className="font-bold">
                      {selectedLead.lists?.some((m) => m.name.toLowerCase() === 'invalid list') || selectedLead.manualReviewReason?.toLowerCase().includes('invalid')
                        ? 'Flagged in Invalid List'
                        : 'Quarantined for Manual Checking'}
                    </p>
                    <p className="text-rose-700 mt-0.5">
                      <strong>Reason:</strong> {selectedLead.manualReviewReason || selectedLead.emailVerificationStatus || 'Invalid or unresolvable email address'}.
                    </p>
                    <p className="text-[11px] text-rose-600 mt-0.5">
                      Pre-send validation blocked outbound cold emails to protect your domain sending reputation and avoid bounce spikes.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      await store.approveLeadReview(selectedLead.id);
                      setSelectedLead((prev) => (prev ? { ...prev, status: 'active', manualReviewReason: undefined } : null));
                      setBulkActionSuccess(`Re-activated ${selectedLead.businessName}.`);
                    }}
                    className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs py-1.5 px-3 flex items-center gap-1 shadow-sm"
                  >
                    <Check size={13} /> Approve & Re-activate
                  </button>
                </div>
              </div>
            )}

            {/* Condition-Based Smart Outreach Card (For Leads) */}
            {selectedLead.entityType === 'lead' &&
              selectedLead.status !== 'manual_review' &&
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
                            ? 'Follow-up 1 Due (Day 2.5)'
                            : selectedLead.outreachStage === 'followup_2'
                            ? 'Follow-up 2 Due (Day 5.5)'
                            : selectedLead.outreachStage === 'followup_3'
                            ? 'Final Message Due (Day 10)'
                            : 'First Message Needed')}
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-1 flex items-center flex-wrap gap-1.5">
                      <span>Next Step: <strong>{leadStageInfo?.nextStepLabel || 'Shoot Next Message (Stage-Aware via Gmail)'}</strong></span>
                      {(detectedFormInfo?.hasForm || selectedLead.metadata?.website_form?.hasForm) && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-100/90 border border-teal-300 rounded px-1.5 py-0.5 shadow-2xs">
                          <Globe size={10} /> + Website Form Dual-Trigger Active
                        </span>
                      )}
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

            {/* List Memberships Widget: Add to List or Remove from List */}
            <div className="rounded-xl border border-brand-200/80 bg-gradient-to-r from-brand-50/70 via-slate-50 to-indigo-50/50 p-3.5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-700">
                    <Bookmark size={14} className="text-brand-600" />
                    <span>Lists:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedLead.lists && selectedLead.lists.length > 0 ? (
                      selectedLead.lists.map((lst) => (
                        <span
                          key={lst.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white text-brand-800 border border-brand-300 shadow-2xs"
                        >
                          <span>{lst.name}</span>
                          <button
                            onClick={() => handleRemoveLeadFromList(lst.id, selectedLead.id)}
                            title={`Remove from "${lst.name}"`}
                            className="hover:text-rose-600 hover:bg-rose-50 rounded-full p-0.5 transition text-slate-400"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-ink-400 italic">
                        Not in any custom list (visible in Main List)
                      </span>
                    )}
                  </div>
                </div>

                {/* Add to list dropdown selector */}
                <div className="flex items-center gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddLeadToSingleList(e.target.value, selectedLead.id);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    className="input py-1 px-2.5 text-xs font-semibold text-brand-700 bg-white border-brand-300 hover:border-brand-400 cursor-pointer shadow-xs"
                  >
                    <option value="" disabled>
                      + Add to List...
                    </option>
                    {store.lists
                      .filter((l) => !selectedLead.lists?.some((ml) => ml.id === l.id))
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Top Overview: 2 Responsive Cards (Profile Details + Communication Endpoints) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card A: Account & Status Profile */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Record Overview</span>
                  <div className="flex items-center gap-1.5">
                    {selectedLead.country && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-ink-800 shadow-2xs">
                        <span>{getCountryFlag(selectedLead.country)}</span>
                        <span>{selectedLead.country}</span>
                      </span>
                    )}
                    <span className="text-xs font-bold capitalize px-2 py-0.5 rounded-md bg-white border border-slate-200 text-ink-700 shadow-2xs">
                      {selectedLead.entityType}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-ink-400 font-semibold block text-[11px] uppercase">Industry / Category</span>
                    <span className="font-bold text-ink-800 block truncate mt-0.5" title={selectedLead.category}>
                      {selectedLead.category || 'Uncategorized'}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-400 font-semibold block text-[11px] uppercase">Country</span>
                    <span className="font-bold text-ink-800 flex items-center gap-1 mt-0.5">
                      <span>{getCountryFlag(selectedLead.country)}</span>
                      <span>{selectedLead.country || 'Not specified'}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-400 font-semibold block text-[11px] uppercase">Status</span>
                    <div className="mt-0.5">
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
                    <span className="text-ink-400 font-semibold block text-[11px] uppercase">Outreach Stage</span>
                    <span className="font-semibold text-brand-700 block mt-0.5 capitalize">
                      {selectedLead.outreachStage?.replace('_', ' ') || 'Initial Outreach'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-ink-400 font-semibold block text-[11px] uppercase">Consent Status</span>
                    <div className="mt-0.5">{consentBadge(selectedLead.consentStatus)}</div>
                  </div>
                </div>
              </div>

              {/* Card B: Multi-Channel Communication Endpoints (No Column Collision) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Contact &amp; Channels</span>
                  <span className="text-[11px] font-medium text-ink-400">Direct Endpoints</span>
                </div>
                <div className="space-y-2 text-xs">
                  {/* Website URL - Always clean site URL, never Google Maps */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-blue-700 font-semibold shrink-0">
                      <Globe size={13} />
                      <span>Website:</span>
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      {(() => {
                        const realWeb = cleanSiteUrl(selectedLead.website || selectedLead.googleProfile?.website);

                        if (realWeb) {
                          return (
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <a
                                href={realWeb}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-blue-700 hover:text-blue-900 hover:underline font-bold text-[11px] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 transition"
                                title="Open company website in new tab"
                              >
                                <span className="truncate max-w-[190px]">
                                  {realWeb.replace(/^https?:\/\/(www\.)?/, '')}
                                </span>
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          );
                        }

                        return <span className="text-ink-300 italic">No website</span>;
                      })()}
                    </div>
                  </div>

                  {/* Lead Location */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-indigo-700 font-semibold shrink-0">
                      <MapPin size={13} />
                      <span>Location:</span>
                    </div>
                    <div className="text-right min-w-0 flex-1 flex items-center justify-end gap-1.5 flex-wrap">
                      {selectedLead.location && selectedLead.location !== '(Not identified)' ? (
                        <span className="font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[11px]">
                          {selectedLead.location}
                        </span>
                      ) : (
                        <span className="text-ink-400 italic text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                          (Not identified)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleScrapeSingleLocation(selectedLead.id)}
                        disabled={isScrapingSingle}
                        className="inline-flex items-center gap-1 text-[10px] text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition font-medium"
                        title="Scrape corporate email domain, website & area code to find lead location"
                      >
                        <Compass size={10} className={isScrapingSingle ? 'animate-spin' : ''} />
                        <span>{isScrapingSingle ? 'Scraping...' : 'Find Location'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Website Form Capability */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-teal-700 font-semibold shrink-0">
                      <Globe size={13} />
                      <span>Website Form:</span>
                    </div>
                    <div className="text-right min-w-0 flex-1 flex items-center justify-end gap-1.5 flex-wrap">
                      {(() => {
                        const isMapsUrl = (u?: string) => !u || /google\.com\/maps|maps\.google\.com/i.test(u);
                        const rawWeb = selectedLead.website || selectedLead.googleProfile?.website || '';
                        const realWeb = !isMapsUrl(rawWeb) ? rawWeb : '';
                        const activeForm = detectedFormInfo || selectedLead.metadata?.website_form;
                        const hasForm = activeForm?.hasForm === true;
                        const hasNoForm = activeForm?.hasForm === false;

                        if (!realWeb) {
                          return <span className="text-ink-300 italic text-[11px]">No website (skipped)</span>;
                        }

                        if (hasForm) {
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded px-1.5 py-0.5 shadow-2xs"
                                title={activeForm.actionUrl || activeForm.formUrl || 'Contact form detected on website'}
                              >
                                ✅ Form Ready
                              </span>
                              {activeForm.formUrl && (
                                <a
                                  href={activeForm.formUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded px-1.5 py-0.5 transition shadow-2xs"
                                  title="Open contact form page"
                                >
                                  <span>Open Form</span>
                                  <ExternalLink size={9} />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDetectWebsiteForm(selectedLead.id, realWeb)}
                                disabled={detectingFormLeadId === selectedLead.id}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 p-0.5 rounded transition disabled:opacity-50"
                                title="Re-check website form"
                              >
                                <RotateCcw size={10} className={detectingFormLeadId === selectedLead.id ? 'animate-spin text-teal-600' : ''} />
                              </button>
                            </div>
                          );
                        }

                        if (hasNoForm) {
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                                ℹ️ No form found
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDetectWebsiteForm(selectedLead.id, realWeb)}
                                disabled={detectingFormLeadId === selectedLead.id}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded px-1.5 py-0.5 transition shadow-2xs disabled:opacity-50"
                                title="Re-scan website for forms"
                              >
                                {detectingFormLeadId === selectedLead.id ? (
                                  <>
                                    <Loader2 size={9} className="animate-spin text-teal-600" />
                                    <span>Scanning...</span>
                                  </>
                                ) : (
                                  <span>🔍 Check Again</span>
                                )}
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            type="button"
                            onClick={() => handleDetectWebsiteForm(selectedLead.id, realWeb)}
                            disabled={detectingFormLeadId === selectedLead.id}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded px-2 py-0.5 transition shadow-2xs disabled:opacity-50"
                            title="Detect active contact form on website"
                          >
                            {detectingFormLeadId === selectedLead.id ? (
                              <>
                                <Loader2 size={10} className="animate-spin text-teal-600" />
                                <span>Detecting...</span>
                              </>
                            ) : (
                              <span>🔍 Detect Form</span>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  {/* Email */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-blue-700 font-semibold shrink-0">
                      <Mail size={13} />
                      <span>Email:</span>
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      {selectedLead.email ? (
                        <span className="font-mono text-ink-800 break-all select-all font-medium text-[11px]">
                          {selectedLead.email}
                        </span>
                      ) : (
                        <span className="text-ink-300 italic">None</span>
                      )}
                    </div>
                  </div>

                  {/* Phone & WhatsApp */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold shrink-0">
                      <Phone size={13} />
                      <span>Phone:</span>
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      {selectedLead.phone ? (
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <span className="font-mono text-ink-800 font-medium text-[11px]">
                            {selectedLead.phone}
                          </span>
                          {selectedLead.whatsappEligible && (
                            <a
                              href={`https://wa.me/${(selectedLead.whatsapp || selectedLead.phone).replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200 border border-emerald-300 rounded px-1.5 py-0.5 transition shadow-2xs"
                              title="Chat on WhatsApp with verified international country code"
                            >
                              <MessageCircle size={10} className="text-emerald-700 fill-emerald-700" />
                              <span>Chat (+Code) ↗</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-300 italic">None</span>
                      )}
                    </div>
                  </div>

                  {/* Social Handles (Instagram, Facebook, LinkedIn) */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-ink-500 font-semibold shrink-0">
                      <Globe size={13} />
                      <span>Socials:</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {selectedLead.instagram && (
                        <a
                          href={`https://instagram.com/${selectedLead.instagram.replace(/^@/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 transition text-[11px] font-medium"
                          title="View Instagram Profile"
                        >
                          <Instagram size={11} />
                          <span>@{selectedLead.instagram.replace(/^@/, '')}</span>
                        </a>
                      )}
                      {selectedLead.facebook && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium"
                          title="Facebook Page"
                        >
                          <Facebook size={11} />
                          <span className="truncate max-w-[110px]">{selectedLead.facebook}</span>
                        </span>
                      )}
                      {selectedLead.linkedin && (
                        <a
                          href={selectedLead.linkedin.startsWith('http') ? selectedLead.linkedin : `https://${selectedLead.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition text-[11px] font-medium"
                          title="View LinkedIn Profile"
                        >
                          <Linkedin size={11} />
                          <span>LinkedIn</span>
                        </a>
                      )}
                      {!selectedLead.instagram && !selectedLead.facebook && !selectedLead.linkedin && (
                        <span className="text-ink-300 italic text-[11px]">No social links</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card C: Google Business Profile & Online Reputation */}
            <div className="rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/60 via-white to-orange-50/40 p-4 space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-2xs font-bold text-xs">
                    G
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block">
                      Google Business Profile &amp; Maps Presence
                    </span>
                    <span className="text-[11px] text-amber-700">
                      Live local SEO data &amp; verified reputation
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingGoogle) {
                        setIsEditingGoogle(false);
                      } else {
                        handleStartEditGoogle();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50 transition shadow-2xs"
                    title="Manually edit or verify Google Business Profile details"
                  >
                    <Edit3 size={12} className="text-amber-700" />
                    <span>{isEditingGoogle ? 'Cancel Edit' : '✏️ Edit GMB Details'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEnrichLeadFromGoogle(selectedLead.id)}
                    disabled={isSyncingMaps}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50 transition shadow-2xs disabled:opacity-50"
                    title="Update ratings, reviews, and address live from Google"
                  >
                    <RefreshCw size={12} className={isSyncingMaps ? 'animate-spin text-amber-600' : 'text-amber-600'} />
                    <span>{isSyncingMaps ? 'Updating...' : '🔄 Update Info from Google'}</span>
                  </button>
                  {selectedLead.googleProfile?.googleMapsUrl && (
                    <a
                      href={selectedLead.googleProfile.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-2xs"
                      title="Open in Google Maps in new window"
                    >
                      <ExternalLink size={12} />
                      <span>View on Google Maps ↗</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Quick Google Maps URL Live-Sync Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-lg bg-amber-100/50 border border-amber-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950 shrink-0">
                  <MapPin size={13} className="text-amber-700" />
                  <span>Google Maps URL:</span>
                </div>
                <input
                  type="url"
                  value={mapsUrlInput}
                  onChange={(e) => setMapsUrlInput(e.target.value)}
                  placeholder="Paste Google Maps URL or search query to match..."
                  className="flex-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleSyncGoogleMaps(selectedLead.id, mapsUrlInput.trim() || undefined)}
                  disabled={isSyncingMaps}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-semibold shadow-xs disabled:opacity-50 transition shrink-0"
                  title="Sync live from Google Maps to ensure both match 100%"
                >
                  <RefreshCw size={12} className={isSyncingMaps ? 'animate-spin' : ''} />
                  <span>{isSyncingMaps ? 'Syncing...' : '⚡ Sync from Maps'}</span>
                </button>
              </div>

              {googleFeedback && (
                <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>{googleFeedback}</span>
                </div>
              )}

              {isEditingGoogle ? (
                <div className="rounded-lg bg-white p-3 border border-amber-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-amber-100">
                    <span className="text-xs font-bold text-amber-900">Edit Verified Google Business Profile Data</span>
                    <span className="text-[10px] text-slate-500">Changes save directly to database</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Star Rating (e.g. 4.9)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        max="5"
                        value={editGoogleForm.rating}
                        onChange={(e) => setEditGoogleForm((prev) => ({ ...prev, rating: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Total Reviews Count (e.g. 1353)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={editGoogleForm.reviewsCount}
                        onChange={(e) => setEditGoogleForm((prev) => ({ ...prev, reviewsCount: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Primary Category (e.g. Plumber)</label>
                      <input
                        type="text"
                        value={editGoogleForm.category}
                        onChange={(e) => setEditGoogleForm((prev) => ({ ...prev, category: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                        placeholder="e.g. Plumber"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Website URL</label>
                      <input
                        type="url"
                        value={editGoogleForm.website}
                        onChange={(e) => setEditGoogleForm((prev) => ({ ...prev, website: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Verified Street Address</label>
                      <input
                        type="text"
                        value={editGoogleForm.formattedAddress}
                        onChange={(e) => setEditGoogleForm((prev) => ({ ...prev, formattedAddress: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                        placeholder="e.g. 220 Park Ave, Regina, SK S4N 0N4, Canada"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-semibold text-slate-600">Google Maps Direct Link</label>
                        <button
                          type="button"
                          onClick={() => handleSyncGoogleMaps(selectedLead.id, editGoogleForm.googleMapsUrl.trim() || undefined)}
                          disabled={isSyncingMaps}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:text-amber-900 underline disabled:opacity-50"
                        >
                          <RefreshCw size={10} className={isSyncingMaps ? 'animate-spin' : ''} />
                          <span>{isSyncingMaps ? 'Syncing...' : '⚡ Auto-Fill From This Link'}</span>
                        </button>
                      </div>
                      <input
                        type="url"
                        value={editGoogleForm.googleMapsUrl}
                        onChange={(e) => setEditGoogleForm((prev) => ({ ...prev, googleMapsUrl: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:ring-1 focus:ring-amber-500"
                        placeholder="https://www.google.com/maps/place/..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-100">
                    <button
                      type="button"
                      onClick={() => setIsEditingGoogle(false)}
                      className="px-3 py-1 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGoogleEdit}
                      disabled={isSavingGoogle}
                      className="btn-primary bg-amber-600 hover:bg-amber-700 text-xs py-1 px-3 shadow-2xs flex items-center gap-1.5"
                    >
                      {isSavingGoogle ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>💾 Save GMB Details</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : selectedLead.googleProfile ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-white p-2.5 border border-amber-200/80 shadow-2xs">
                    <span className="text-slate-400 font-semibold block text-[11px] uppercase">Rating &amp; Reviews</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Star size={14} className="text-amber-500 fill-amber-500" />
                      <span className="text-base font-extrabold text-slate-900">{selectedLead.googleProfile.rating}</span>
                      <span className="text-slate-500 text-[11px]">({selectedLead.googleProfile.reviewsCount.toLocaleString()} reviews)</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-2.5 border border-amber-200/80 shadow-2xs">
                    <span className="text-slate-400 font-semibold block text-[11px] uppercase">Operational Status</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold text-emerald-800 uppercase text-[11px]">{selectedLead.googleProfile.status}</span>
                      <span className="text-[10px] text-slate-500">(Verified Listing)</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-2.5 border border-amber-200/80 shadow-2xs">
                    <span className="text-slate-400 font-semibold block text-[11px] uppercase">Verified Address</span>
                    <span className="font-medium text-slate-700 block truncate mt-1 text-[11px]" title={selectedLead.googleProfile.formattedAddress}>
                      {selectedLead.googleProfile.formattedAddress}
                    </span>
                  </div>

                  {selectedLead.googleProfile.category && (
                    <div className="rounded-lg bg-amber-50/70 p-2 border border-amber-200/60 text-[11px] text-amber-900 flex items-center justify-between">
                      <span><strong>Category:</strong> {selectedLead.googleProfile.category}</span>
                      {cleanSiteUrl(selectedLead.googleProfile.website) && (
                        <a
                          href={cleanSiteUrl(selectedLead.googleProfile.website)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline inline-flex items-center gap-1"
                        >
                          <Globe size={11} />
                          <span>Visit Website ↗</span>
                        </a>
                      )}
                    </div>
                  )}

                  {selectedLead.googleProfile.searchSummary && (
                    <div className={`${selectedLead.googleProfile.category ? 'sm:col-span-2' : 'sm:col-span-3'} rounded-lg bg-amber-50/50 p-2 border border-amber-100 text-[11px] text-amber-900`}>
                      <strong>Search Presence:</strong> {selectedLead.googleProfile.searchSummary}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 text-xs text-slate-600 bg-white/70 p-3 rounded-lg border border-dashed border-amber-200">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-amber-500" />
                    <span>Google Business Profile has not been fetched yet for this record.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnrichLeadFromGoogle(selectedLead.id)}
                    disabled={isSyncingMaps}
                    className="btn-primary bg-amber-600 hover:bg-amber-700 text-xs py-1 px-3 shadow-2xs"
                  >
                    {isSyncingMaps ? 'Fetching...' : '🔍 Fetch Google Profile'}
                  </button>
                </div>
              )}
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

              <div className="max-h-72 overflow-y-auto space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {leadConversations.length === 0 ? (
                  <p className="text-center text-xs text-ink-300 py-4">No messages recorded yet.</p>
                ) : (
                  leadConversations.map((msg) => {
                    const isInbound = msg.direction === 'inbound';
                    const isRead = Boolean(msg.is_read);

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-md rounded-xl p-3 text-xs shadow-2xs border ${
                            isInbound
                              ? !isRead
                                ? 'bg-rose-50/40 text-slate-800 border-rose-300 ring-1 ring-rose-400/30 rounded-bl-none'
                                : 'bg-white text-slate-800 border-slate-200 rounded-bl-none'
                              : 'bg-brand-600 text-white border-brand-700 rounded-br-none'
                          }`}
                        >
                          <div
                            className={`flex items-center justify-between gap-3 mb-1.5 text-[10px] ${
                              isInbound ? 'text-slate-500' : 'text-brand-100'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                              <span>{msg.channel}</span>
                              <span>•</span>
                              <span>{isInbound ? '📥 Received' : '📤 Sent'}</span>
                            </div>
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {/* PROMINENT SOURCE ATTRIBUTION ON INBOUND MESSAGES */}
                          {isInbound && (
                            <div className="mb-2 rounded-md bg-slate-100/90 px-2 py-1 text-[11px] text-slate-700 border border-slate-200">
                              <div className="flex items-center gap-1 font-bold text-slate-900 mb-0.5">
                                <Layers size={11} className="text-brand-600" />
                                <span>Source Attribution:</span>
                              </div>
                              {msg.channel === 'email' && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold text-blue-700">Email Inbox:</span>{' '}
                                  <span className="font-mono font-bold text-blue-900">
                                    {msg.inbox_email || 'team.onlinedigitalsolution@gmail.com'}
                                  </span>
                                  {selectedLead.email && (
                                    <>
                                      {' '}• sender: <span className="font-mono">{selectedLead.email}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {msg.channel === 'whatsapp' && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold text-emerald-700">WhatsApp:</span>{' '}
                                  from phone{' '}
                                  <span className="font-mono font-bold text-emerald-900">
                                    {selectedLead.whatsapp || selectedLead.phone || 'Direct Chat'}
                                  </span>
                                </div>
                              )}
                              {msg.channel === 'instagram' && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold text-pink-700">Instagram DM:</span>{' '}
                                  handle{' '}
                                  <span className="font-mono font-bold text-pink-900">
                                    @{selectedLead.instagram || 'prospect'}
                                  </span>
                                </div>
                              )}
                              {msg.channel === 'facebook' && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold text-indigo-700">Facebook:</span>{' '}
                                  <span className="font-mono font-bold text-indigo-900">
                                    {selectedLead.facebook || selectedLead.businessName}
                                  </span>
                                </div>
                              )}
                              {msg.channel === 'linkedin' && (
                                <div className="text-[10px] text-slate-600">
                                  <span className="font-semibold text-sky-700">LinkedIn:</span>{' '}
                                  <span className="font-mono font-bold text-sky-900">
                                    {selectedLead.linkedin || 'Anupam Kumar Profile'}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                          {/* Inbound Status & Explicit Mark as Read / Mark as Unread Action */}
                          {isInbound && (
                            <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                {!isRead ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-2xs animate-pulse">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                                    UNREAD
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                    <CheckCircle2 size={10} />
                                    Read
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => store.markMessageRead(msg.id, !isRead)}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                                    !isRead
                                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                  }`}
                                  title={isRead ? 'Mark message as unread' : 'Mark message as read'}
                                >
                                  {isRead ? 'Mark as Unread' : 'Mark as Read'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Move "${selectedLead.businessName}" to Trash? (Address is not present/no use for this lead)`)) {
                                      handleDeleteSingleLead(selectedLead);
                                      setSelectedLead(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                                  title="No use of this lead (address missing or invalid). Move contact to Trash"
                                >
                                  <Trash2 size={10} className="text-rose-600" />
                                  <span>Move to Trash</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Custom Reply Box with AI Improviser */}
            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Send Direct Reply</h4>
                <button
                  type="button"
                  onClick={() => handleImproviseReply()}
                  disabled={isImprovisingReply}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-brand-700 hover:to-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
                  title="Improvises your rough words into a polished, realistic outreach message for the selected channel"
                >
                  {isImprovisingReply ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Improvising...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      <span>{replyText.trim() ? '✨ Improvise with AI' : '✨ Generate Draft with AI'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Channel Switcher — All Channels Supported */}
              <div className="flex flex-wrap gap-2 mb-2">
                {(['email', 'whatsapp', 'website_form', 'facebook', 'instagram', 'linkedin'] as Channel[]).map((ch) => {
                  const isAvailable =
                    ch === 'email'
                      ? !!selectedLead.email
                      : ch === 'whatsapp'
                      ? !!selectedLead.whatsapp || !!selectedLead.phone
                      : ch === 'website_form'
                      ? !!(selectedLead.website || selectedLead.googleProfile?.website)
                      : ch === 'facebook'
                      ? !!selectedLead.facebook
                      : ch === 'instagram'
                      ? !!selectedLead.instagram
                      : !!selectedLead.linkedin;
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setReplyChannel(ch)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        replyChannel === ch
                          ? 'bg-brand-50 text-brand-700 border-2 border-brand-500 shadow-xs'
                          : 'bg-slate-100 text-ink-600 border border-transparent hover:bg-slate-200'
                      } ${!isAvailable ? 'opacity-40' : ''}`}
                    >
                      <ChannelIcon channel={ch} size={14} />
                      <span>{channelLabels[ch]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Live Google Profile Info Bar Visible While Emailing */}
              {selectedLead.googleProfile ? (
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/90 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-900 shadow-2xs">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1 font-bold text-amber-900">
                      <MapPin size={13} className="text-amber-600 shrink-0" />
                      <span>Google Profile:</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-amber-200 font-medium">
                      <Star size={11} className="text-amber-500 fill-amber-500" />
                      <span className="font-bold text-slate-800">{selectedLead.googleProfile.rating}★</span>
                      <span className="text-slate-500 text-[11px]">({selectedLead.googleProfile.reviewsCount} reviews)</span>
                    </div>
                    <span className="text-slate-600 text-[11px] truncate max-w-[280px]" title={selectedLead.googleProfile.formattedAddress}>
                      📍 {selectedLead.googleProfile.formattedAddress}
                    </span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                      {selectedLead.googleProfile.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={selectedLead.googleProfile.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-800 hover:underline text-[11px] bg-white px-2 py-0.5 rounded border border-blue-200 transition"
                      title="Open verified location in Google Maps"
                    >
                      <ExternalLink size={11} />
                      <span>Google Maps ↗</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleEnrichLeadFromGoogle(selectedLead.id)}
                      disabled={isSyncingMaps}
                      className="text-[11px] text-amber-800 hover:text-amber-950 font-semibold p-1 hover:bg-amber-100 rounded transition"
                      title="Update latest info from Google"
                    >
                      <RefreshCw size={11} className={isSyncingMaps ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <span className="text-[11px]">No Google profile data linked to this contact yet.</span>
                  <button
                    type="button"
                    onClick={() => handleEnrichLeadFromGoogle(selectedLead.id)}
                    disabled={isSyncingMaps}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 bg-white px-2.5 py-0.5 rounded border border-brand-200 shadow-2xs transition"
                  >
                    <RefreshCw size={10} className={isSyncingMaps ? 'animate-spin' : ''} />
                    <span>{isSyncingMaps ? 'Syncing...' : 'Fetch Google Info'}</span>
                  </button>
                </div>
              )}

              {/* Realistic Quick-Idea Prompt Chips */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                <span className="text-[10px] uppercase font-bold text-ink-400 mr-1">
                  Rough ideas to improvise:
                </span>
                {[
                  { label: '🔍 Free Local SEO Audit', text: 'free audit of website, checking local ranking, quick chat' },
                  { label: '📍 Google Maps Gap', text: 'noticed Google Business Profile ranking gap in local map pack, 3 min review' },
                  { label: '⚡ Mobile & Speed Check', text: 'checked mobile page speed, quick recommendations to fix ranking loss' },
                  { label: '💬 Inquiry Follow-up', text: 'following up on local search visibility, checking if you had time to review' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      setReplyText(chip.text);
                      handleImproviseReply(chip.text);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition-colors shadow-2xs"
                    title={`Click to populate and improvise: "${chip.text}"`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a few rough words or bullet points (e.g. 'free audit of website, checking local ranking, quick chat') and click '✨ Improvise with AI'..."
                  rows={3}
                  className="textarea flex-1 text-sm font-normal"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || isSending}
                  className="btn-primary self-end flex items-center gap-1.5 px-4 py-2.5"
                  title="Send message directly"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>

              {/* Also Submit via Website Form Checkbox */}
              <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/60 p-2 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alsoSubmitWebsiteForm}
                    onChange={(e) => setAlsoSubmitWebsiteForm(e.target.checked)}
                    className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                  <span className="font-bold text-teal-950 flex items-center gap-1.5">
                    <Globe size={13} className="text-teal-700" />
                    <span>Also submit via Website Contact Form</span>
                  </span>
                </label>
                <span className="text-[11px] text-teal-800">
                  {selectedLead.website || selectedLead.googleProfile?.website
                    ? `🌐 Parallel submission to ${((selectedLead.website || selectedLead.googleProfile?.website || '')).replace(/^https?:\/\/(www\.)?/, '')}`
                    : 'ℹ️ No website found on this lead (will be safely skipped)'}
                </span>
              </div>

              {/* Status & Guidance Bar */}
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
                <span>
                  Words: <strong className="text-ink-700">{replyText.split(/\s+/).filter(Boolean).length}</strong>
                </span>
                <span>
                  {replyChannel === 'whatsapp' && '💡 WhatsApp: Keep under 45 words for highest response rates'}
                  {replyChannel === 'email' && '💡 Email: Keep under 85 words with a clear, low-friction question'}
                  {replyChannel === 'website_form' && '💡 Website Form: Automatically maps and submits into target website contact forms (skipped if no form)'}
                  {replyChannel === 'linkedin' && '💡 LinkedIn: Peer-level, consultative invite under 70 words'}
                  {replyChannel === 'instagram' && '💡 Instagram: Casual, direct profile note under 45 words'}
                  {replyChannel === 'facebook' && '💡 Facebook: Concise local growth angle under 55 words'}
                </span>
              </div>

              {improviseBadge && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                  <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                  <span className="font-medium">{improviseBadge}</span>
                </div>
              )}

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
          ) : entityFilter === 'manual_review' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const ids = Array.from(selectedIds);
                  await store.bulkApproveLeadReviews(ids);
                  setBulkActionSuccess(`Re-activated ${ids.length} contacts.`);
                  setSelectedIds(new Set());
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition"
                title="Approve and return selected contacts back to active lead status"
              >
                <Check size={14} />
                <span>Approve & Re-activate Selected ({selectedIds.size})</span>
              </button>
              <button
                onClick={() => setIsConfirmDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md transition"
                title="Trash selected contacts"
              >
                <Trash2 size={14} />
                <span>Trash Selected ({selectedIds.size})</span>
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
        onClose={() => {
          setIsAddToListOpen(false);
          setLeadsToAddToList([]);
        }}
        title="Add Leads to List"
        width="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Add{' '}
            <strong className="text-brand-700">
              {leadsToAddToList.length > 0 ? leadsToAddToList.length : selectedIds.size}
            </strong>{' '}
            {leadsToAddToList.length > 0 && selectedIds.size === 0 ? 'filtered' : 'selected'} lead(s)
            into an organized list. After saving, these leads will be marked as added with a list badge and removed from the Main List (Unassigned).
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
        onOpenProfile={(entityId, entityType) => handleOpenEntityById(entityId, entityType)}
        onSyncInbox={handleSyncInbox}
        isSyncing={isSyncingInbox}
        onMarkRead={store.markMessageRead}
        onMarkHandled={store.markInboundHandled}
        onDeleteLead={store.deleteLead}
      />

      <ScheduleListModal
        open={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        store={store}
        defaultListId={selectedListFilter}
      />

      {/* Autonomous 24/7 Outreach Autopilot Master Modal */}
      <AutopilotControlModal
        isOpen={isAutopilotModalOpen}
        onClose={() => setIsAutopilotModalOpen(false)}
        store={store}
      />
    </div>
  );
}
