import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  Linkedin,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Phone,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Info,
  QrCode,
  Smartphone,
  Unlink,
  Pencil,
  Trash2,
  ListPlus,
  X,
  CalendarClock,
  Maximize2,
  Minus,
  Globe,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ScheduleOutreachModal } from '@/components/ScheduleOutreachModal';
import { LinkedInOutreachHub } from '@/components/LinkedInOutreachHub';
import { getCountryFlag } from '@/utils/countryFlag';
import { api, cleanSiteUrl } from '@/services/api';
import type {
  Lead,
  CustomList,
  Channel,
  GeneratedOutreachMessage,
  BatchShootResponse,
  WhatsAppSessionStatus,
  InboxPoolSummary,
} from '@/types';
import { channelLabels } from '@/types';

interface Props {
  leads: Lead[];
  lists?: CustomList[];
  onRefreshLeads?: () => Promise<void>;
  onDeleteLead?: (leadId: string) => Promise<void>;
  onBulkDeleteLeads?: (leadIds: string[]) => Promise<void>;
  onAddLeadsToList?: (listId: string, leadIds: string[]) => Promise<void>;
  onCreateList?: (name: string, description?: string) => Promise<CustomList>;
  onOpenConversation?: (leadId: string) => void;
  onOpenInboundInbox?: () => void;
  inboundRepliesCount?: number;
}

type ActiveChannelTab = 'email' | 'whatsapp' | 'website_form' | 'instagram' | 'linkedin';
type WhatsAppFilter = 'all' | 'eligible' | 'ineligible';

export function ChannelOutreachHub({
  leads,
  lists = [],
  onRefreshLeads,
  onDeleteLead,
  onBulkDeleteLeads,
  onAddLeadsToList,
  onCreateList,
  onOpenConversation: _onOpenConversation,
  onOpenInboundInbox: _onOpenInboundInbox,
  inboundRepliesCount: _inboundRepliesCount,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveChannelTab>('whatsapp');
  const [search, setSearch] = useState('');
  const [waFilter, setWaFilter] = useState<WhatsAppFilter>('all');
  const [channelCountryFilter, setChannelCountryFilter] = useState<string>('all');
  const [channelCityFilter, setChannelCityFilter] = useState<string>('all');
  const [channelCategoryFilter, setChannelCategoryFilter] = useState<string>('all');
  const [channelListFilter, setChannelListFilter] = useState<string>('all');
  const [channelStatusFilter, setChannelStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [channelConsentFilter, setChannelConsentFilter] = useState<'all' | 'none' | 'replied' | 'opted_out'>('all');
  const alsoSubmitWebsiteForm = true;

  // Edit Lead Modal state
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editFormData, setEditFormData] = useState<{
    businessName: string;
    category: string;
    phone: string;
    whatsapp: string;
    email: string;
    facebook: string;
    instagram: string;
    website: string;
    country: string;
    notes: string;
    status: 'active' | 'inactive' | 'paused';
    consentStatus: 'none' | 'opted_out' | 'replied';
  }>({
    businessName: '',
    category: '',
    phone: '',
    whatsapp: '',
    email: '',
    facebook: '',
    instagram: '',
    website: '',
    country: '',
    notes: '',
    status: 'active',
    consentStatus: 'none',
  });
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [editLeadError, setEditLeadError] = useState<string | null>(null);

  // Delete Lead Modal state
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const [deleteLeadError, setDeleteLeadError] = useState<string | null>(null);

  // Multi-Selection State
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Bulk Delete Modal State
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Add to List Modal State
  const [isAddToListModalOpen, setIsAddToListModalOpen] = useState(false);
  const [addToListMode, setAddToListMode] = useState<'existing' | 'new'>('existing');
  const [selectedTargetListId, setSelectedTargetListId] = useState<string>('');
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [isAddingToList, setIsAddingToList] = useState(false);
  const [addToListError, setAddToListError] = useState<string | null>(null);

  // Multi-Channel Scheduling Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleTargetLead, setScheduleTargetLead] = useState<Lead | null>(null);
  const [scheduleTargetLeads, setScheduleTargetLeads] = useState<Lead[]>([]);
  const [scheduleInitialSubject, setScheduleInitialSubject] = useState<string>('');
  const [scheduleInitialBody, setScheduleInitialBody] = useState<string>('');

  // Direct WhatsApp shoot states
  const [directShootingLeadId, setDirectShootingLeadId] = useState<string | null>(null);
  const [isShootingFromAiModal, setIsShootingFromAiModal] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // WhatsApp Linking via QR / Pairing Code (Option 1)
  const [isWaLinkModalOpen, setIsWaLinkModalOpen] = useState(false);
  const [waSessionStatus, setWaSessionStatus] = useState<WhatsAppSessionStatus | null>(null);
  const [waLinkMode, setWaLinkMode] = useState<'qr' | 'pairing'>('qr');
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [isRefreshingWaSession, setIsRefreshingWaSession] = useState(false);
  const [isDisconnectingWa, setIsDisconnectingWa] = useState(false);
  const [waLinkError, setWaLinkError] = useState<string | null>(null);
  const [isPairingCodeCopied, setIsPairingCodeCopied] = useState(false);

  // AI Research & Copywriter Modal state
  const [selectedLeadForAi, setSelectedLeadForAi] = useState<Lead | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<GeneratedOutreachMessage | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Batch Shoot Modal state
  const [isBatchShootModalOpen, setIsBatchShootModalOpen] = useState(false);
  const [isBatchShootMinimized, setIsBatchShootMinimized] = useState(false);
  const [isCompletionPopupOpen, setIsCompletionPopupOpen] = useState(false);
  const [batchLimit, setBatchLimit] = useState<number>(100);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(3);
  const [isShooting, setIsShooting] = useState(false);
  const cancelBatchRef = useRef(false);
  const [batchShootProgress, setBatchShootProgress] = useState<{
    current: number;
    total: number;
    currentLeadName?: string;
    channel?: string;
  }>({ current: 0, total: 0 });
  const [batchShootResult, setBatchShootResult] = useState<BatchShootResponse | null>(null);
  const [shootError, setShootError] = useState<string | null>(null);
  const [isDeletingFailedOutreach, setIsDeletingFailedOutreach] = useState(false);

  // 1. Segregate leads into channels (exclude soft-deleted leads)
  const segregated = useMemo(() => {
    const activeLeads = leads.filter((l) => !l.deletedAt);
    const email = activeLeads.filter((l) => l.email && l.email.includes('@'));
    const whatsapp = activeLeads.filter(
      (l) => (l.whatsapp && l.whatsapp.trim().length > 0) || (l.phone && l.phone.trim().length > 0)
    );
    const whatsappEligible = whatsapp.filter((l) => l.whatsappEligible === true);
    const whatsappIneligible = whatsapp.filter((l) => l.whatsappEligible !== true);
    const website_form = activeLeads.filter(
      (l) => Boolean(cleanSiteUrl(l.website || l.googleProfile?.website))
    );
    const instagram = activeLeads.filter((l) => (l.instagram || '').trim().length > 0);
    const linkedin = activeLeads.filter((l) => (l.linkedin || '').trim().length > 0);

    return {
      email,
      whatsapp,
      whatsappEligible,
      whatsappIneligible,
      website_form,
      instagram,
      linkedin,
    };
  }, [leads]);

  // Active Channel Base Leads
  const activeTabBaseLeads = useMemo(() => {
    if (activeTab === 'email') return segregated.email;
    if (activeTab === 'whatsapp') {
      if (waFilter === 'eligible') return segregated.whatsappEligible;
      if (waFilter === 'ineligible') return segregated.whatsappIneligible;
      return segregated.whatsapp;
    }
    if (activeTab === 'website_form') return segregated.website_form;
    if (activeTab === 'instagram') return segregated.instagram;
    return segregated.linkedin;
  }, [activeTab, segregated, waFilter]);

  // Unique countries for the current active channel whose leads are listed
  const activeChannelCountries = useMemo(() => {
    const countryMap = new Map<string, number>();
    activeTabBaseLeads.forEach((l) => {
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
  }, [activeTabBaseLeads]);

  // Unique cities for the current active channel & selected country
  const activeChannelCities = useMemo(() => {
    const cityMap = new Map<string, number>();
    activeTabBaseLeads.forEach((l) => {
      if (channelCountryFilter !== 'all') {
        const leadCountry = (l.country || '').trim() || 'Other';
        if (channelCountryFilter === '(Not identified)') {
          if (leadCountry !== '(Not identified)' && !(l.location && l.location.toLowerCase().includes('not identified'))) {
            return;
          }
        } else if (leadCountry.toLowerCase() !== channelCountryFilter.toLowerCase()) {
          return;
        }
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
  }, [activeTabBaseLeads, channelCountryFilter]);

  // Unique categories for the current active channel with counts
  const activeChannelCategories = useMemo(() => {
    const catMap = new Map<string, number>();
    activeTabBaseLeads.forEach((l) => {
      if (l.category && l.category.trim()) {
        const c = l.category.trim();
        catMap.set(c, (catMap.get(c) || 0) + 1);
      }
    });
    return Array.from(catMap.entries())
      .filter(([_, count]) => count > 0)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  }, [activeTabBaseLeads]);

  // Status counts for active tab
  const channelStatusCounts = useMemo(() => {
    const active = activeTabBaseLeads.filter((l) => (l.status || 'active') === 'active').length;
    const inactive = activeTabBaseLeads.filter((l) => (l.status || 'active') === 'inactive' || l.status === 'paused').length;
    return { all: activeTabBaseLeads.length, active, inactive };
  }, [activeTabBaseLeads]);

  // Consent counts for active tab
  const channelConsentCounts = useMemo(() => {
    const none = activeTabBaseLeads.filter((l) => !l.consentStatus || l.consentStatus === 'none').length;
    const replied = activeTabBaseLeads.filter((l) => l.consentStatus === 'replied').length;
    const opted_out = activeTabBaseLeads.filter((l) => l.consentStatus === 'opted_out').length;
    return { all: activeTabBaseLeads.length, none, replied, opted_out };
  }, [activeTabBaseLeads]);

  // List counts for active tab
  const channelListCounts = useMemo(() => {
    const unassigned = activeTabBaseLeads.filter((l) => !l.lists || l.lists.length === 0).length;
    const map = new Map<string, number>();
    activeTabBaseLeads.forEach((l) => {
      l.lists?.forEach((lst) => {
        map.set(lst.id, (map.get(lst.id) || 0) + 1);
      });
    });
    return { all: activeTabBaseLeads.length, unassigned, map };
  }, [activeTabBaseLeads]);

  const hasActiveChannelFilters = useMemo(() => {
    return (
      channelCountryFilter !== 'all' ||
      channelCityFilter !== 'all' ||
      channelCategoryFilter !== 'all' ||
      channelListFilter !== 'all' ||
      channelStatusFilter !== 'all' ||
      channelConsentFilter !== 'all' ||
      search.trim().length > 0
    );
  }, [channelCountryFilter, channelCityFilter, channelCategoryFilter, channelListFilter, channelStatusFilter, channelConsentFilter, search]);

  const handleResetChannelFilters = useCallback(() => {
    setChannelCountryFilter('all');
    setChannelCityFilter('all');
    setChannelCategoryFilter('all');
    setChannelListFilter('all');
    setChannelStatusFilter('all');
    setChannelConsentFilter('all');
    setSearch('');
  }, []);

  // 2. Active Channel's Leads
  const currentChannelLeads = useMemo(() => {
    let list: Lead[] = activeTabBaseLeads;

    // Filter by country
    if (channelCountryFilter !== 'all') {
      list = list.filter((l) => {
        const leadCountry = (l.country || '').trim() || 'Other';
        if (channelCountryFilter === '(Not identified)') {
          return leadCountry === '(Not identified)' || (l.location && l.location.toLowerCase().includes('not identified'));
        }
        return leadCountry.toLowerCase() === channelCountryFilter.toLowerCase();
      });
    }

    // Filter by city
    if (channelCityFilter !== 'all') {
      list = list.filter((l) => {
        const loc = (l.location || '').toLowerCase();
        return loc.includes(channelCityFilter.toLowerCase());
      });
    }

    // Filter by category
    if (channelCategoryFilter !== 'all') {
      list = list.filter((l) => l.category === channelCategoryFilter);
    }

    // Filter by list
    if (channelListFilter !== 'all') {
      if (channelListFilter === 'unassigned') {
        list = list.filter((l) => !l.lists || l.lists.length === 0);
      } else {
        list = list.filter((l) => l.lists && l.lists.some((lst) => lst.id === channelListFilter));
      }
    }

    // Filter by status
    if (channelStatusFilter !== 'all') {
      list = list.filter((l) => (l.status || 'active') === channelStatusFilter);
    }

    // Filter by consent
    if (channelConsentFilter !== 'all') {
      list = list.filter((l) => (l.consentStatus || 'none') === channelConsentFilter);
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (l) =>
        l.businessName.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.country && l.country.toLowerCase().includes(q)) ||
        (l.website && l.website.toLowerCase().includes(q)) ||
        l.phone.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.facebook && l.facebook.toLowerCase().includes(q)) ||
        (l.instagram && l.instagram.toLowerCase().includes(q)) ||
        (l.linkedin && l.linkedin.toLowerCase().includes(q))
    );
  }, [activeTabBaseLeads, channelCountryFilter, channelCityFilter, channelCategoryFilter, channelListFilter, channelStatusFilter, channelConsentFilter, search]);

  // Multi-Inbox Pool Summary for Email Tab
  const [inboxSummary, setInboxSummary] = useState<InboxPoolSummary | null>(null);

  useEffect(() => {
    api.getInboxSummary()
      .then(setInboxSummary)
      .catch((err) => console.error('Failed to load inbox summary in Hub:', err));
  }, []);

  // Pagination for Apollo-grade Scalability
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page to 1 whenever channel tab, search, or WhatsApp filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search, waFilter]);

  const totalPages = Math.max(1, Math.ceil(currentChannelLeads.length / Math.max(1, pageSize)));

  const paginatedLeads = useMemo(() => {
    if (pageSize >= 999999) return currentChannelLeads;
    const start = (currentPage - 1) * pageSize;
    return currentChannelLeads.slice(start, start + pageSize);
  }, [currentChannelLeads, currentPage, pageSize]);

  // Fetch initial WhatsApp session status
  useEffect(() => {
    api.getWhatsAppSessionStatus()
      .then(setWaSessionStatus)
      .catch((err) => console.error('Failed to get WhatsApp status:', err));
  }, []);

  // Poll WhatsApp session status while modal is open
  useEffect(() => {
    if (!isWaLinkModalOpen) return;

    api.getWhatsAppSessionStatus()
      .then((status) => {
        setWaSessionStatus(status);
        if (status.status === 'disconnected') {
          api.startWhatsAppSession().then(setWaSessionStatus).catch(() => { });
        }
      })
      .catch(() => { });

    const interval = setInterval(() => {
      api.getWhatsAppSessionStatus()
        .then((status) => {
          setWaSessionStatus(status);
          if (status.pairingCode) {
            setWaPairingCode(status.pairingCode);
          }
        })
        .catch(() => { });
    }, 2500);

    return () => clearInterval(interval);
  }, [isWaLinkModalOpen]);

  // Restart / Refresh QR code
  const handleRefreshWaSession = useCallback(async () => {
    setIsRefreshingWaSession(true);
    setWaLinkError(null);
    try {
      const status = await api.startWhatsAppSession();
      setWaSessionStatus(status);
    } catch (err: any) {
      setWaLinkError(err.message || 'Failed to refresh WhatsApp session');
    } finally {
      setIsRefreshingWaSession(false);
    }
  }, []);

  // Request 8-Digit Pairing Code
  const handleRequestPairingCode = useCallback(async () => {
    if (!waPhoneInput.trim()) {
      setWaLinkError('Please enter your WhatsApp phone number with country code (e.g. +61 412 345 678)');
      return;
    }
    setIsRequestingPairing(true);
    setWaLinkError(null);
    try {
      const res = await api.requestWhatsAppPairing(waPhoneInput.trim());
      setWaPairingCode(res.pairingCode);
    } catch (err: any) {
      setWaLinkError(err.message || 'Failed to request pairing code');
    } finally {
      setIsRequestingPairing(false);
    }
  }, [waPhoneInput]);

  // Disconnect WhatsApp session
  const handleDisconnectWa = useCallback(async () => {
    if (!confirm('Are you sure you want to disconnect this WhatsApp device?')) return;
    setIsDisconnectingWa(true);
    try {
      await api.disconnectWhatsAppSession();
      setWaSessionStatus((prev) =>
        prev
          ? {
            ...prev,
            status: 'disconnected',
            isConnected: false,
            phoneNumber: null,
            name: null,
            qrCodeDataUrl: null,
            pairingCode: null,
          }
          : null
      );
      setWaPairingCode(null);
    } catch (err: any) {
      setWaLinkError(err.message || 'Failed to disconnect WhatsApp');
    } finally {
      setIsDisconnectingWa(false);
    }
  }, []);

  // Copy pairing code
  const handleCopyPairingCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code.replace('-', ''));
    setIsPairingCodeCopied(true);
    setTimeout(() => setIsPairingCodeCopied(false), 2000);
  }, []);

  // Open Edit Modal
  const handleOpenEdit = useCallback((lead: Lead) => {
    setEditingLead(lead);
    setEditFormData({
      businessName: lead.businessName || '',
      category: lead.category || '',
      phone: lead.phone || '',
      whatsapp: lead.whatsapp || '',
      email: lead.email || '',
      facebook: lead.facebook || '',
      instagram: lead.instagram || '',
      website: cleanSiteUrl(lead.website || lead.googleProfile?.website),
      country: lead.country || '',
      notes: lead.notes || '',
      status: (lead.status as any) || 'active',
      consentStatus: (lead.consentStatus as any) || 'none',
    });
    setEditLeadError(null);
  }, []);

  // Save Lead Updates
  const handleSaveEdit = useCallback(async () => {
    if (!editingLead) return;
    if (!editFormData.businessName.trim()) {
      setEditLeadError('Business name is required');
      return;
    }

    setIsSavingLead(true);
    setEditLeadError(null);
    try {
      await api.updateLead(editingLead.id, {
        businessName: editFormData.businessName.trim(),
        category: editFormData.category.trim() || 'Uncategorized',
        phone: editFormData.phone.trim(),
        whatsapp: editFormData.whatsapp.trim(),
        email: editFormData.email.trim(),
        facebook: editFormData.facebook.trim(),
        instagram: editFormData.instagram.trim(),
        website: editFormData.website.trim(),
        country: editFormData.country.trim(),
        notes: editFormData.notes.trim(),
        status: editFormData.status,
        consentStatus: editFormData.consentStatus,
      });

      setEditingLead(null);
      if (onRefreshLeads) {
        await onRefreshLeads();
      }
    } catch (err: any) {
      console.error('Failed to update lead:', err);
      setEditLeadError(err?.message || 'Failed to save lead updates');
    } finally {
      setIsSavingLead(false);
    }
  }, [editingLead, editFormData, onRefreshLeads]);

  // Toast notification helper
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToastNotification({ message, type });
    setTimeout(() => {
      setToastNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  // Confirm and Execute Delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingLead) return;
    setIsDeletingLead(true);
    setDeleteLeadError(null);
    try {
      if (onDeleteLead) {
        await onDeleteLead(deletingLead.id);
      } else {
        await api.deleteLead(deletingLead.id);
        if (onRefreshLeads) {
          await onRefreshLeads();
        }
      }
      setDeletingLead(null);
      showToast(`Successfully moved "${deletingLead.businessName}" to Trash (preserved for 28 days).`, 'success');
    } catch (err: any) {
      console.error('Failed to delete lead:', err);
      setDeleteLeadError(err?.message || 'Failed to delete lead');
    } finally {
      setIsDeletingLead(false);
    }
  }, [deletingLead, onDeleteLead, onRefreshLeads, showToast]);

  // Handle opening AI Research & Copywriter
  const handleOpenAiResearch = useCallback(
    async (lead: Lead) => {
      setSelectedLeadForAi(lead);
      setIsAiLoading(true);
      setAiResult(null);
      setCustomPrompt('');
      try {
        const result = await api.researchAndWrite({
          leadId: lead.id,
          channel: activeTab,
        });
        setAiResult(result);
      } catch (err) {
        console.error('Failed to generate AI research:', err);
      } finally {
        setIsAiLoading(false);
      }
    },
    [activeTab]
  );

  // Handle regenerating copy with custom prompt / improvisation
  const handleRegenerateCopy = useCallback(async (promptOverride?: string) => {
    if (!selectedLeadForAi) return;
    const activePrompt = (promptOverride !== undefined ? promptOverride : customPrompt).trim();
    setIsAiLoading(true);
    try {
      const result = await api.researchAndWrite({
        leadId: selectedLeadForAi.id,
        channel: activeTab,
        customPrompt: activePrompt || undefined,
      });
      setAiResult(result);
    } catch (err) {
      console.error('Failed to regenerate copy:', err);
    } finally {
      setIsAiLoading(false);
    }
  }, [selectedLeadForAi, activeTab, customPrompt]);

  // Copy to clipboard helper
  const handleCopyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, []);



  // Multi-selection computed properties (Apollo/Gmail paginated style)
  const allOnPageSelected = useMemo(() => {
    if (paginatedLeads.length === 0) return false;
    return paginatedLeads.every((l) => selectedLeadIds.has(l.id));
  }, [paginatedLeads, selectedLeadIds]);

  const someOnPageSelected = useMemo(() => {
    return paginatedLeads.some((l) => selectedLeadIds.has(l.id));
  }, [paginatedLeads, selectedLeadIds]);

  const allInFilteredSelected = useMemo(() => {
    if (currentChannelLeads.length === 0) return false;
    return currentChannelLeads.every((l) => selectedLeadIds.has(l.id));
  }, [currentChannelLeads, selectedLeadIds]);

  // Backward compatibility aliases
  const allInCurrentViewSelected = allOnPageSelected;
  const someInCurrentViewSelected = someOnPageSelected;

  const handleToggleSelectAll = useCallback(() => {
    if (allOnPageSelected) {
      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        paginatedLeads.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        paginatedLeads.forEach((l) => next.add(l.id));
        return next;
      });
    }
  }, [allOnPageSelected, paginatedLeads]);

  const handleSelectAllInFiltered = useCallback(() => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      currentChannelLeads.forEach((l) => next.add(l.id));
      return next;
    });
  }, [currentChannelLeads]);

  const handleClearSelection = useCallback(() => {
    setSelectedLeadIds(new Set());
  }, []);

  const handleToggleSelectOne = useCallback((id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Bulk Delete Action
  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedLeadIds.size === 0) return;
    const targetIds = Array.from(selectedLeadIds);
    setIsDeletingBulk(true);
    setBulkDeleteError(null);

    try {
      if (onBulkDeleteLeads) {
        await onBulkDeleteLeads(targetIds);
      } else {
        await api.bulkDeleteLeads(targetIds);
        if (onRefreshLeads) await onRefreshLeads();
      }
      setSelectedLeadIds(new Set());
      setIsBulkDeleteModalOpen(false);
      showToast(`Successfully moved ${targetIds.length} leads to Trash (preserved for 28 days).`, 'success');
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      setBulkDeleteError(err?.message || 'Failed to delete selected leads.');
    } finally {
      setIsDeletingBulk(false);
    }
  }, [selectedLeadIds, onBulkDeleteLeads, onRefreshLeads, showToast]);

  // Bulk Add to List Action
  const handleConfirmAddToList = useCallback(async () => {
    if (selectedLeadIds.size === 0) return;
    const targetIds = Array.from(selectedLeadIds);
    setIsAddingToList(true);
    setAddToListError(null);

    try {
      let targetListId = selectedTargetListId;
      let targetListName = '';

      if (addToListMode === 'new') {
        if (!newListName.trim()) {
          setAddToListError('Please enter a name for the new list.');
          setIsAddingToList(false);
          return;
        }

        if (onCreateList) {
          const created = await onCreateList(newListName.trim(), newListDesc.trim());
          targetListId = created.id;
          targetListName = created.name;
        } else {
          const created = await api.createList(newListName.trim(), newListDesc.trim());
          targetListId = created.id;
          targetListName = created.name;
        }
      } else {
        if (!targetListId && lists.length > 0) {
          targetListId = lists[0].id;
        }
        const found = lists.find((l) => l.id === targetListId);
        targetListName = found?.name || 'Selected List';
      }

      if (!targetListId) {
        setAddToListError('No list selected. Please create a new list or select an existing one.');
        setIsAddingToList(false);
        return;
      }

      if (onAddLeadsToList) {
        await onAddLeadsToList(targetListId, targetIds);
      } else {
        await api.addLeadsToList(targetListId, targetIds);
      }

      if (onRefreshLeads) {
        await onRefreshLeads();
      }

      setSelectedLeadIds(new Set());
      setIsAddToListModalOpen(false);
      setNewListName('');
      setNewListDesc('');
      showToast(`Successfully added ${targetIds.length} lead(s) to "${targetListName}".`, 'success');
    } catch (err: any) {
      console.error('Add to list failed:', err);
      setAddToListError(err?.message || 'Failed to add leads to list.');
    } finally {
      setIsAddingToList(false);
    }
  }, [
    selectedLeadIds,
    addToListMode,
    newListName,
    newListDesc,
    selectedTargetListId,
    lists,
    onCreateList,
    onAddLeadsToList,
    onRefreshLeads,
    showToast,
  ]);

  // Single Direct WhatsApp Shoot
  const handleSingleDirectWhatsAppShoot = useCallback(
    async (lead: Lead) => {
      if (!waSessionStatus?.isConnected) {
        setIsWaLinkModalOpen(true);
        if (waSessionStatus?.status === 'disconnected') {
          api.startWhatsAppSession().then(setWaSessionStatus).catch(() => { });
        }
        return;
      }

      const rawPhone = (lead.whatsapp || lead.phone || '').trim();
      const cleanDigits = rawPhone.replace(/\D/g, '');
      if (!cleanDigits) {
        showToast(`No valid phone number for ${lead.businessName}.`, 'error');
        return;
      }

      setDirectShootingLeadId(lead.id);

      try {
        const generated = await api.researchAndWrite({
          leadId: lead.id,
          channel: 'whatsapp',
        });
        const messageText = generated.body;

        const sendRes = await api.sendDirectWhatsApp({
          recipientPhone: cleanDigits,
          text: messageText,
          leadId: lead.id,
        });

        if (sendRes.success) {
          showToast(
            `🚀 Message shot directly to ${lead.businessName} (+${cleanDigits}) from your WhatsApp (${waSessionStatus.phoneNumber})!`,
            'success'
          );
          if (onRefreshLeads) {
            await onRefreshLeads();
          }
        } else {
          showToast(`WhatsApp direct send failed: ${(sendRes as any).error || 'Unknown error'}`, 'error');
        }
      } catch (err: any) {
        console.error('Direct WhatsApp shoot failed:', err);
        showToast(err?.message || 'Failed to shoot WhatsApp message.', 'error');
      } finally {
        setDirectShootingLeadId(null);
      }
    },
    [waSessionStatus, onRefreshLeads, showToast]
  );

  // Direct Shoot from inside AI Research Modal
  const handleDirectShootFromAiModal = useCallback(async () => {
    if (!selectedLeadForAi || !aiResult?.body) return;

    if (!waSessionStatus?.isConnected) {
      setIsWaLinkModalOpen(true);
      return;
    }

    const rawPhone = (selectedLeadForAi.whatsapp || selectedLeadForAi.phone || '').trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');
    if (!cleanDigits) {
      showToast('No valid recipient phone number found.', 'error');
      return;
    }

    setIsShootingFromAiModal(true);

    try {
      const sendRes = await api.sendDirectWhatsApp({
        recipientPhone: cleanDigits,
        text: aiResult.body,
        leadId: selectedLeadForAi.id,
      });

      if (sendRes.success) {
        showToast(
          `🚀 Message shot directly to ${selectedLeadForAi.businessName} from your WhatsApp (${waSessionStatus.phoneNumber})!`,
          'success'
        );
        setSelectedLeadForAi(null);
        if (onRefreshLeads) {
          await onRefreshLeads();
        }
      } else {
        showToast(`Shoot failed: ${(sendRes as any).error || 'Delivery failed'}`, 'error');
      }
    } catch (err: any) {
      console.error('AI modal direct shoot failed:', err);
      showToast(err?.message || 'Failed to shoot message.', 'error');
    } finally {
      setIsShootingFromAiModal(false);
    }
  }, [selectedLeadForAi, aiResult, waSessionStatus, onRefreshLeads, showToast]);

  const handleOpenScheduleForLead = useCallback((targetLead: Lead) => {
    setScheduleTargetLead(targetLead);
    setScheduleTargetLeads([targetLead]);
    setScheduleInitialSubject('');
    setScheduleInitialBody('');
    setIsScheduleModalOpen(true);
  }, []);

  const handleOpenScheduleForSelected = useCallback(() => {
    const selectedList = currentChannelLeads.filter((l) => selectedLeadIds.has(l.id));
    setScheduleTargetLead(null);
    setScheduleTargetLeads(selectedList);
    setScheduleInitialSubject('');
    setScheduleInitialBody('');
    setIsScheduleModalOpen(true);
  }, [currentChannelLeads, selectedLeadIds]);

  // Handle Batch Shooting (up to 100 leads or selected leads)
  const handleExecuteBatchShoot = useCallback(async () => {
    let targets = currentChannelLeads;
    if (selectedLeadIds.size > 0) {
      targets = currentChannelLeads.filter((l) => selectedLeadIds.has(l.id));
    }
    if (activeTab === 'whatsapp') {
      targets = targets.filter((l) => l.whatsappEligible === true);
    }
    const targetLeadsToShoot = targets.slice(0, batchLimit);
    const leadIdsToShoot = targetLeadsToShoot.map((l) => l.id);

    if (leadIdsToShoot.length === 0) return;

    setIsShooting(true);
    setShootError(null);
    setBatchShootResult(null);
    cancelBatchRef.current = false;
    setBatchShootProgress({
      current: 0,
      total: leadIdsToShoot.length,
      currentLeadName: targetLeadsToShoot[0]?.businessName,
      channel: activeTab,
    });

    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const combinedResults: BatchShootResponse['results'] = [];

    try {
      for (let i = 0; i < leadIdsToShoot.length; i++) {
        if (cancelBatchRef.current) {
          console.log('[Batch Shoot] Cancelled by user.');
          break;
        }

        const leadId = leadIdsToShoot[i];
        const lead = targetLeadsToShoot[i];

        setBatchShootProgress({
          current: i + 1,
          total: leadIdsToShoot.length,
          currentLeadName: lead?.businessName,
          channel: activeTab,
        });

        try {
          const res = await api.batchShoot({
            channel: activeTab as any,
            leadIds: [leadId],
            intervalSeconds: 0, // delay handled between iterations
            alsoSubmitWebsiteForm,
          });

          totalSent += res.sentCount;
          totalSkipped += res.skippedCount;
          totalFailed += res.failedCount;
          combinedResults.push(...res.results);
        } catch (itemErr: any) {
          totalFailed++;
          combinedResults.push({
            leadId,
            businessName: lead?.businessName || 'Lead',
            channel: activeTab,
            success: false,
            status: 'failed',
            reason: itemErr?.message || 'Dispatch failed',
          });
        }

        // Anti-ban dispatch delay countdown if not the last item
        if (i < leadIdsToShoot.length - 1 && intervalSeconds > 0) {
          for (let sec = 0; sec < intervalSeconds; sec++) {
            if (cancelBatchRef.current) break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      const finalSummary: BatchShootResponse = {
        success: true,
        channel: activeTab,
        totalProcessed: combinedResults.length,
        sentCount: totalSent,
        skippedCount: totalSkipped,
        failedCount: totalFailed,
        results: combinedResults,
      };

      setBatchShootResult(finalSummary);

      if (onRefreshLeads) {
        await onRefreshLeads();
      }

      // Automatically unminimize and trigger the Completion Alert Popup!
      setIsBatchShootMinimized(false);
      setIsBatchShootModalOpen(false);
      setIsCompletionPopupOpen(true);
    } catch (err) {
      console.error('Batch shoot failed:', err);
      setShootError(err instanceof Error ? err.message : 'Batch shoot encountered an error.');
    } finally {
      setIsShooting(false);
    }
  }, [currentChannelLeads, selectedLeadIds, activeTab, batchLimit, intervalSeconds, onRefreshLeads, alsoSubmitWebsiteForm]);

  // Bulk delete failed messages & scheduled dispatches
  const handleBulkDeleteFailedOutreach = useCallback(async () => {
    if (isDeletingFailedOutreach) return;
    const confirmed = window.confirm(
      'Are you sure you want to delete all failed outreach messages and dispatches in bulk? This permanently clears failed records.'
    );
    if (!confirmed) return;

    setIsDeletingFailedOutreach(true);
    try {
      const res = await api.bulkDeleteAllFailedOutreach();
      const totalDeleted = (res.dispatchesCount || 0) + (res.messagesCount || 0);
      showToast(
        totalDeleted > 0
          ? `Successfully cleared ${totalDeleted} failed outreach records (${res.dispatchesCount} scheduled, ${res.messagesCount} sent/failed).`
          : 'No failed outreach messages or dispatches found to delete.',
        'success'
      );
      if (onRefreshLeads) {
        await onRefreshLeads();
      }
    } catch (err) {
      console.error('Failed to delete failed outreach:', err);
      showToast(err instanceof Error ? err.message : 'Failed to delete failed outreach records.', 'error');
    } finally {
      setIsDeletingFailedOutreach(false);
    }
  }, [isDeletingFailedOutreach, showToast, onRefreshLeads]);

  return (
    <div className="space-y-6">
      {/* CHANNEL NAVIGATION TABS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {/* 1. WhatsApp Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('whatsapp');
              setSearch('');
            }}
            className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all ${activeTab === 'whatsapp'
              ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50/50 shadow-sm ring-2 ring-emerald-200/60'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80'
              }`}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
                <MessageCircle size={18} />
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {segregated.whatsapp.length}
              </span>
            </div>
            <div>
              <div className="text-sm font-bold text-ink-900">WhatsApp Leads</div>
              <div className="text-[11px] font-medium text-emerald-700">
                {segregated.whatsappEligible.length} Mobile Ready • {segregated.whatsappIneligible.length} Landline
              </div>
            </div>
          </button>

          {/* 2. Email Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('email');
              setSearch('');
            }}
            className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all ${activeTab === 'email'
              ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50/50 shadow-sm ring-2 ring-blue-200/60'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80'
              }`}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <Mail size={18} />
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                {segregated.email.length}
              </span>
            </div>
            <div>
              <div className="text-sm font-bold text-ink-900">Email Leads</div>
              <div className="text-[11px] font-medium text-blue-700">Verified Email Addresses</div>
            </div>
          </button>

          {/* 3. Website Form Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('website_form');
              setSearch('');
            }}
            className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all ${activeTab === 'website_form'
              ? 'border-teal-400 bg-gradient-to-br from-teal-50 to-emerald-50/60 shadow-sm ring-2 ring-teal-300/60'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80'
              }`}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                <Globe size={18} />
              </div>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                {segregated.website_form?.length || 0}
              </span>
            </div>
            <div>
              <div className="text-sm font-bold text-ink-900">Website Forms</div>
              <div className="text-[11px] font-medium text-teal-700">Site Contact Form Delivery</div>
            </div>
          </button>

          {/* 4. Instagram Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('instagram');
              setSearch('');
            }}
            className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all ${activeTab === 'instagram'
              ? 'border-pink-300 bg-gradient-to-br from-pink-50 to-rose-50/50 shadow-sm ring-2 ring-pink-200/60'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80'
              }`}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shadow-sm">
                <Instagram size={18} />
              </div>
              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-800">
                {segregated.instagram.length}
              </span>
            </div>
            <div>
              <div className="text-sm font-bold text-ink-900">Instagram Leads</div>
              <div className="text-[11px] font-medium text-pink-700">Direct DM Deep-Link Ready</div>
            </div>
          </button>

          {/* 6. LinkedIn Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('linkedin');
              setSearch('');
            }}
            className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all ${activeTab === 'linkedin'
              ? 'border-sky-400 bg-gradient-to-br from-sky-50 to-blue-50/60 shadow-sm ring-2 ring-sky-300/60'
              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80'
              }`}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0a66c2] text-white shadow-sm">
                <Linkedin size={18} />
              </div>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                {segregated.linkedin.length}
              </span>
            </div>
            <div>
              <div className="text-sm font-bold text-ink-900">LinkedIn Engine</div>
              <div className="text-[11px] font-medium text-sky-700">Auto-Reply & Post Creator</div>
            </div>
          </button>
        </div>
      </div>

      {activeTab === 'linkedin' ? (
        <LinkedInOutreachHub leads={leads} />
      ) : (
        <>

          {/* OPTION 1: WHATSAPP DIRECT PHONE LINK STATUS BANNER (shown only in WhatsApp tab) */}
          {activeTab === 'whatsapp' && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 p-4 shadow-sm animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shrink-0 mt-0.5">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-emerald-950">
                      Direct WhatsApp Dispatching Engine (Option 1)
                    </h4>
                    {waSessionStatus?.isConnected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Connected: {waSessionStatus.phoneNumber || 'Active Account'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        Phone Not Linked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-800 mt-1">
                    {waSessionStatus?.isConnected
                      ? `Your WhatsApp account (${waSessionStatus.phoneNumber || 'Active Device'}) is connected. Automated messages and 100/batch shoots will be dispatched directly from your phone in headless mode.`
                      : 'Link your WhatsApp account via QR Code or 8-digit Pairing Code. Once linked, the system shoots personalized outreach directly from your phone number without any manual web clicks.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {waSessionStatus?.isConnected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsWaLinkModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-900 text-xs font-semibold hover:bg-emerald-50 transition-all shadow-2xs flex items-center gap-1.5"
                    >
                      <Smartphone size={14} className="text-emerald-600" />
                      <span>Device Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectWa}
                      disabled={isDisconnectingWa}
                      className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-all shadow-2xs flex items-center gap-1.5"
                    >
                      <Unlink size={14} />
                      <span>{isDisconnectingWa ? 'Disconnecting...' : 'Disconnect'}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsWaLinkModalOpen(true);
                      if (waSessionStatus?.status === 'disconnected') {
                        api.startWhatsAppSession().then(setWaSessionStatus).catch(() => { });
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 group"
                  >
                    <QrCode size={16} className="group-hover:scale-110 transition-transform" />
                    <span>Link WhatsApp Phone</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* WHATSAPP ELIGIBILITY DECISION BANNER (shown only in WhatsApp tab) */}
          {activeTab === 'whatsapp' && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0 mt-0.5">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">
                    WhatsApp Automated Number &amp; Landline Decision Engine
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    The engine checks whether phone numbers are mobile-ready. Australian landlines (02, 03, 07, 08)
                    cannot receive WhatsApp messages and are filtered automatically to protect deliverability.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-emerald-200 shadow-xs">
                <button
                  type="button"
                  onClick={() => setWaFilter('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${waFilter === 'all'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-900 hover:bg-emerald-50'
                    }`}
                >
                  All ({segregated.whatsapp.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWaFilter('eligible')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${waFilter === 'eligible'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-900 hover:bg-emerald-50'
                    }`}
                >
                  ✓ Mobile Ready ({segregated.whatsappEligible.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWaFilter('ineligible')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${waFilter === 'ineligible'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50'
                    }`}
                >
                  Landlines ({segregated.whatsappIneligible.length})
                </button>
              </div>
            </div>
          )}

          {/* EMAIL MULTI-INBOX ROTATION ENGINE BANNER (shown only in Email tab) */}
          {activeTab === 'email' && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-sky-50/80 p-4 shadow-sm animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shrink-0 mt-0.5">
                  <Zap size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-blue-950">
                      Apollo-Grade Multi-Inbox Cold Email Rotation Engine
                    </h4>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      Multi-Inbox Pool Active
                    </span>
                    {inboxSummary && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-white text-ink-700 border border-blue-200 shadow-2xs">
                        {inboxSummary.activeInboxes} Active Mailboxes • {inboxSummary.totalDailyCapacity}/day Safe Capacity
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-900 mt-1 max-w-3xl">
                    Cold email dispatches and batch shoots automatically rotate across connected Google Workspace and Microsoft 365 accounts in weighted round-robin. Each inbox is capped at a safe daily limit (30–50/day) to guarantee 99%+ inbox placement and protect your domains.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-blue-800 bg-white/80 border border-blue-200 px-3 py-1.5 rounded-lg shadow-2xs">
                  ⚡ Safe Cap: 30–50/day/inbox
                </span>
              </div>
            </div>
          )}

          {/* INSTAGRAM SENDER PROFILE BANNER (shown only in Instagram tab) */}
          {activeTab === 'instagram' && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-pink-300 bg-gradient-to-r from-pink-50 via-rose-50/60 to-purple-50/60 p-4 shadow-sm animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shadow-sm shrink-0 mt-0.5">
                  <Instagram size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-pink-950">
                      Instagram Direct Outreach Engine
                    </h4>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pink-100 text-pink-800 border border-pink-300">
                      <span className="h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
                      Sender: @anupam_kumar_seo
                    </span>
                  </div>
                  <p className="text-xs text-pink-900 mt-1">
                    Direct Instagram DMs and social touchpoints are initiated from{' '}
                    <a
                      href="https://www.instagram.com/anupam_kumar_seo/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline hover:text-pink-950"
                    >
                      @anupam_kumar_seo (Anupam Kumar)
                    </a>
                    . All outreach drafts are pre-screened to avoid automated shadowbans.
                  </p>
                </div>
              </div>

              <a
                href="https://www.instagram.com/anupam_kumar_seo/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs flex items-center gap-1.5 border-pink-300 text-pink-800 bg-white hover:bg-pink-50 shadow-2xs"
                title="Open Instagram profile"
              >
                <Instagram size={14} className="text-pink-600" />
                <span>View Instagram Profile</span>
                <ExternalLink size={12} />
              </a>
            </div>
          )}

          {/* CHANNEL ACTION HEADER & SEARCH + MULTI-FACTOR FILTERS */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <div className="relative min-w-44 max-w-xs flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  placeholder={`Search ${channelLabels[activeTab]} leads...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-9 pr-3 py-1.5 text-xs w-full bg-slate-50 border-slate-200"
                />
              </div>

              <div className="flex items-center gap-1.5 text-ink-400 text-xs font-semibold pl-1">
                <Filter size={13} />
              </div>

              {/* Country Filter */}
              <select
                value={channelCountryFilter}
                onChange={(e) => {
                  setChannelCountryFilter(e.target.value);
                  setChannelCityFilter('all');
                }}
                className={`input py-1.5 text-xs w-auto font-medium transition-all ${channelCountryFilter !== 'all'
                  ? 'ring-2 ring-brand-500 bg-brand-50/50 text-brand-900 font-bold border-brand-300'
                  : 'bg-slate-50 border-slate-200'
                  }`}
                title="Filter channel leads by country"
              >
                <option value="all">🌍 All Countries ({activeChannelCountries.length})</option>
                {activeChannelCountries.map(({ country, count, flag }) => (
                  <option key={country} value={country}>
                    {flag} {country} ({count})
                  </option>
                ))}
              </select>

              {/* City / Location Sub-Filter */}
              {channelCountryFilter !== 'all' && activeChannelCities.length > 0 && (
                <select
                  value={channelCityFilter}
                  onChange={(e) => setChannelCityFilter(e.target.value)}
                  className={`input py-1.5 text-xs w-auto font-medium transition-all animate-fadeIn ${channelCityFilter !== 'all'
                    ? 'ring-2 ring-indigo-500 bg-indigo-50/50 text-indigo-900 font-bold border-indigo-300'
                    : 'bg-slate-50 border-slate-200'
                    }`}
                  title={`Sub-filter by city/region in ${channelCountryFilter}`}
                >
                  <option value="all">📍 All Cities ({channelCountryFilter} - {activeChannelCities.length})</option>
                  {activeChannelCities.map(({ city, count }) => (
                    <option key={city} value={city}>
                      {city} ({count})
                    </option>
                  ))}
                </select>
              )}

              {/* Category Filter */}
              <select
                value={channelCategoryFilter}
                onChange={(e) => setChannelCategoryFilter(e.target.value)}
                className={`input py-1.5 text-xs w-auto font-medium transition-all ${channelCategoryFilter !== 'all'
                  ? 'ring-2 ring-purple-500 bg-purple-50/50 text-purple-900 font-bold border-purple-300'
                  : 'bg-slate-50 border-slate-200'
                  }`}
                title="Filter channel leads by category"
              >
                <option value="all">All Categories ({activeChannelCategories.length})</option>
                {activeChannelCategories.map(({ category, count }) => (
                  <option key={category} value={category}>
                    {category} ({count})
                  </option>
                ))}
              </select>

              {/* List Filter */}
              <select
                value={channelListFilter}
                onChange={(e) => setChannelListFilter(e.target.value)}
                className="input py-1.5 text-xs w-auto font-medium bg-slate-50 border-slate-200"
                title="Filter channel leads by list"
              >
                <option value="all">All Lists ({channelListCounts.all})</option>
                <option value="unassigned">📥 Main List (Unassigned) ({channelListCounts.unassigned})</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    🏷️ {l.name} ({channelListCounts.map.get(l.id) || 0})
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={channelStatusFilter}
                onChange={(e) => setChannelStatusFilter(e.target.value as any)}
                className="input py-1.5 text-xs w-auto font-medium bg-slate-50 border-slate-200"
              >
                <option value="all">All Status ({channelStatusCounts.all})</option>
                <option value="active">Active Only ({channelStatusCounts.active})</option>
                <option value="inactive">Inactive Only ({channelStatusCounts.inactive})</option>
              </select>

              {/* Consent Filter */}
              <select
                value={channelConsentFilter}
                onChange={(e) => setChannelConsentFilter(e.target.value as any)}
                className="input py-1.5 text-xs w-auto font-medium bg-slate-50 border-slate-200"
              >
                <option value="all">All Responses ({channelConsentCounts.all})</option>
                <option value="none">No Response ({channelConsentCounts.none})</option>
                <option value="replied">Replied ({channelConsentCounts.replied})</option>
                <option value="opted_out">Opted Out ({channelConsentCounts.opted_out})</option>
              </select>

              {/* Clear Filter Button */}
              {hasActiveChannelFilters && (
                <button
                  type="button"
                  onClick={handleResetChannelFilters}
                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-rose-600 hover:bg-rose-50 border-rose-200 font-semibold"
                  title="Reset all channel filters"
                >
                  <X size={12} />
                  <span>Reset</span>
                </button>
              )}

              <span className="text-xs text-ink-500 font-medium ml-1">
                <strong className="text-ink-900 font-bold">{currentChannelLeads.length}</strong> leads
              </span>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'whatsapp' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWaLinkModalOpen(true);
                    if (waSessionStatus?.status === 'disconnected') {
                      api.startWhatsAppSession().then(setWaSessionStatus).catch(() => { });
                    }
                  }}
                  className={`py-2 px-3.5 rounded-lg border text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${waSessionStatus?.isConnected
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                >
                  {waSessionStatus?.isConnected ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>WA Linked: {waSessionStatus.phoneNumber || 'Active'}</span>
                    </>
                  ) : (
                    <>
                      <Smartphone size={15} />
                      <span>Link WhatsApp Phone</span>
                    </>
                  )}
                </button>
              )}

              {/* Schedule Outreach Button */}
              <button
                type="button"
                onClick={() => {
                  if (selectedLeadIds.size > 0) {
                    handleOpenScheduleForSelected();
                  } else {
                    setScheduleTargetLead(null);
                    setScheduleTargetLeads(currentChannelLeads);
                    setIsScheduleModalOpen(true);
                  }
                }}
                disabled={currentChannelLeads.length === 0}
                className="btn-secondary py-2 px-3.5 flex items-center gap-1.5 shadow-xs font-bold text-xs text-indigo-700 bg-indigo-50/70 border-indigo-200 hover:bg-indigo-100/70"
                title="Schedule outreach for later with automated background delivery"
              >
                <CalendarClock size={15} className="text-indigo-600" />
                <span>
                  {selectedLeadIds.size > 0
                    ? `Schedule (${selectedLeadIds.size})`
                    : 'Schedule Outreach'}
                </span>
              </button>

              {/* Bulk Delete Failed Outreach Button */}
              <button
                type="button"
                onClick={handleBulkDeleteFailedOutreach}
                disabled={isDeletingFailedOutreach}
                className="btn-secondary py-2 px-3.5 flex items-center gap-1.5 shadow-xs font-bold text-xs text-rose-700 bg-rose-50/70 border-rose-200 hover:bg-rose-100/70 transition-colors"
                title="Bulk delete failed outreach emails and messages"
              >
                {isDeletingFailedOutreach ? (
                  <Loader2 size={15} className="animate-spin text-rose-600" />
                ) : (
                  <Trash2 size={15} className="text-rose-600" />
                )}
                <span>{isDeletingFailedOutreach ? 'Deleting Failed...' : 'Delete Failed'}</span>
              </button>

              {/* Shoot Messages Button (supports selected batch or default batch) */}
              <button
                type="button"
                onClick={() => {
                  if (selectedLeadIds.size > 0) {
                    setBatchLimit(selectedLeadIds.size);
                  }
                  setIsBatchShootModalOpen(true);
                  setBatchShootResult(null);
                  setShootError(null);
                }}
                disabled={currentChannelLeads.length === 0}
                className="btn-primary py-2 px-4 flex items-center gap-2 shadow-sm font-bold text-xs"
              >
                <Zap size={16} className="text-amber-300" />
                <span>
                  {selectedLeadIds.size > 0
                    ? `Shoot Selected (${selectedLeadIds.size}) Messages`
                    : `Shoot ${channelLabels[activeTab]} Messages (Up to 100)`}
                </span>
              </button>
            </div>
          </div>

          {/* TOAST FEEDBACK NOTIFICATION */}
          {toastNotification && (
            <div
              className={`flex items-center justify-between p-3.5 rounded-xl text-xs font-semibold shadow-sm animate-fade-in border ${toastNotification.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                : 'bg-rose-50 text-rose-950 border-rose-300'
                }`}
            >
              <div className="flex items-center gap-2.5">
                {toastNotification.type === 'success' ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                )}
                <span>{toastNotification.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastNotification(null)}
                className="text-ink-400 hover:text-ink-700 p-1"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* FLOATING BULK ACTIONS BAR (WHEN 1 OR MORE LEADS ARE CHECKED) */}
          {selectedLeadIds.size > 0 && (
            <div className="sticky top-3 z-30 flex items-center justify-between gap-3 rounded-2xl border-2 border-brand-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-3.5 text-white shadow-xl animate-fade-in">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white font-black text-xs shadow-sm">
                  {selectedLeadIds.size}
                </span>
                <div>
                  <span className="font-bold text-sm text-white">
                    {selectedLeadIds.size} {selectedLeadIds.size === 1 ? 'Lead' : 'Leads'} Selected
                  </span>
                  <span className="text-[11px] text-slate-300 block">
                    Bulk actions ready for {channelLabels[activeTab]} leads
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. Shoot Selected */}
                <button
                  type="button"
                  onClick={() => {
                    setBatchLimit(selectedLeadIds.size);
                    setIsBatchShootModalOpen(true);
                    setBatchShootResult(null);
                    setShootError(null);
                  }}
                  className="btn-primary py-1.5 px-3.5 text-xs font-bold flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-sm"
                  title="Shoot outreach messages to all selected leads"
                >
                  <Zap size={14} className="text-amber-300" />
                  <span>Shoot Selected ({selectedLeadIds.size})</span>
                </button>

                {/* 2. Schedule Selected */}
                <button
                  type="button"
                  onClick={handleOpenScheduleForSelected}
                  className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 bg-indigo-500/25 hover:bg-indigo-500/40 text-indigo-200 border-indigo-400/30 shadow-sm"
                  title="Schedule automated outreach for all selected leads"
                >
                  <CalendarClock size={14} className="text-indigo-300" />
                  <span>Schedule Selected ({selectedLeadIds.size})</span>
                </button>

                {/* 3. Add to List */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTargetListId(lists?.[0]?.id || '');
                    setIsAddToListModalOpen(true);
                    setAddToListError(null);
                  }}
                  className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-sm"
                  title="Assign selected leads to any list"
                >
                  <ListPlus size={14} />
                  <span>Add to List</span>
                </button>

                {/* 3. Delete Selected */}
                <button
                  type="button"
                  onClick={() => {
                    setIsBulkDeleteModalOpen(true);
                    setBulkDeleteError(null);
                  }}
                  className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-rose-400/30 shadow-sm"
                  title="Delete all selected leads (preserved in 28-day trash)"
                >
                  <Trash2 size={14} />
                  <span>Delete Selected</span>
                </button>

                {/* 4. Deselect All */}
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds(new Set())}
                  className="btn-secondary py-1.5 px-2.5 text-xs text-slate-300 hover:text-white bg-transparent border-transparent hover:bg-white/10"
                  title="Clear selection"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* LEADS TABLE / LIST */}
          <div className="card overflow-hidden border border-slate-200 shadow-sm">
            {/* Apollo/Gmail Multi-Page Select Alert */}
            {allOnPageSelected && paginatedLeads.length < currentChannelLeads.length && (
              <div className="bg-brand-50 border-b border-brand-200 px-4 py-2 text-center text-xs text-brand-900 flex items-center justify-center gap-2 flex-wrap animate-fade-in">
                <span>
                  All <strong>{paginatedLeads.length}</strong> leads on this page are selected.
                </span>
                {!allInFilteredSelected ? (
                  <button
                    type="button"
                    onClick={handleSelectAllInFiltered}
                    className="font-bold underline text-brand-700 hover:text-brand-900 cursor-pointer"
                  >
                    Select all {currentChannelLeads.length} leads in this view
                  </button>
                ) : (
                  <span className="font-semibold text-emerald-700">
                    ✓ All {currentChannelLeads.length} leads in this view are selected.
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs text-ink-500 hover:text-ink-800 ml-2"
                >
                  Clear selection
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-ink-500">
                  <tr>
                    {/* Checkbox column */}
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allInCurrentViewSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someInCurrentViewSelected && !allInCurrentViewSelected;
                        }}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        title="Select / Deselect all leads in current page"
                      />
                    </th>
                    <th className="py-3 px-4">Business &amp; Category</th>
                    <th className="py-3 px-4">Contact &amp; Channel Status</th>
                    <th className="py-3 px-4">Eligibility Decision</th>
                    <th className="py-3 px-4">Consent / Stage</th>
                    <th className="py-3 px-4 text-right">Outreach Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {currentChannelLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-ink-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Info size={28} className="text-ink-300" />
                          <p className="font-semibold text-sm text-ink-700">No leads found in this channel section</p>
                          <p className="text-xs text-ink-400">
                            {search ? 'Try clearing your search query.' : 'Import leads with this channel to populate.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedLeads.map((lead) => {
                      const isEligible =
                        activeTab === 'whatsapp' ? lead.whatsappEligible === true : true;
                      const isSelected = selectedLeadIds.has(lead.id);

                      return (
                        <tr
                          key={lead.id}
                          className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-brand-50/40' : ''
                            }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3.5 px-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(lead.id)}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            />
                          </td>

                          {/* 1. Business & Category */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-ink-900 text-sm">{lead.businessName}</div>
                            <div className="text-[11px] text-ink-500">{lead.category}</div>
                          </td>

                          {/* 2. Contact info */}
                          <td className="py-3.5 px-4">
                            {activeTab === 'email' && (
                              <div className="font-medium text-ink-800">{lead.email}</div>
                            )}
                            {activeTab === 'whatsapp' && (
                              <div className="space-y-0.5">
                                <div className="font-medium text-ink-800 flex items-center gap-1.5">
                                  <Phone size={13} className="text-emerald-600" />
                                  <span>{lead.whatsapp || lead.phone || 'No phone'}</span>
                                </div>
                              </div>
                            )}
                            {activeTab === 'instagram' && (
                              <div className="font-medium text-pink-700 flex items-center gap-1">
                                <Instagram size={13} />
                                <span>@{lead.instagram.replace(/^@/, '')}</span>
                              </div>
                            )}
                          </td>

                          {/* 3. Eligibility Decision */}
                          <td className="py-3.5 px-4">
                            {activeTab === 'whatsapp' ? (
                              lead.whatsappEligible === true ? (
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                  <span>Mobile (WhatsApp Ready)</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-amber-700 font-medium">
                                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                  <span className="text-[11px]">
                                    {lead.whatsappDecisionReason || 'Landline / Ineligible'}
                                  </span>
                                </div>
                              )
                            ) : activeTab === 'email' ? (
                              <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                                <CheckCircle2 size={14} className="text-blue-600" />
                                <span>Valid Email Address</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span>Profile Verified</span>
                              </div>
                            )}
                          </td>

                          {/* 4. Consent / Stage */}
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${lead.consentStatus === 'replied'
                                ? 'bg-emerald-100 text-emerald-800'
                                : lead.consentStatus === 'opted_out'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-slate-100 text-slate-700'
                                }`}
                            >
                              {lead.consentStatus === 'replied'
                                ? 'Replied'
                                : lead.consentStatus === 'opted_out'
                                  ? 'Opted Out'
                                  : lead.lastContactedAt
                                    ? 'Contacted'
                                    : 'Cold / Uncontacted'}
                            </span>
                          </td>

                          {/* 5. Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Edit Lead button */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(lead)}
                                className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1 text-ink-700 hover:text-ink-950 hover:bg-slate-100 border-slate-200 shadow-2xs"
                                title="Edit and update lead information across channels"
                              >
                                <Pencil size={12} className="text-slate-500" />
                                <span>Edit</span>
                              </button>

                              {/* Delete Lead button */}
                              <button
                                type="button"
                                onClick={() => setDeletingLead(lead)}
                                className="btn-secondary py-1 px-2 text-xs font-semibold flex items-center gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 shadow-2xs"
                                title="Delete lead (moves to trash with 28-day recovery)"
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </button>

                              {/* AI Research & Draft button */}
                              <button
                                type="button"
                                onClick={() => handleOpenAiResearch(lead)}
                                className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1 text-brand-700 border-brand-200 hover:bg-brand-50 shadow-2xs"
                                title="Perform AI business research and draft personalized copy"
                              >
                                <Sparkles size={13} className="text-brand-600" />
                                <span>AI Research &amp; Write</span>
                              </button>

                              {/* Schedule Outreach button */}
                              <button
                                type="button"
                                onClick={() => handleOpenScheduleForLead(lead)}
                                className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1 text-indigo-700 hover:bg-indigo-50 border-indigo-200 shadow-2xs"
                                title={`Schedule ${channelLabels[activeTab]} outreach message for ${lead.businessName}`}
                              >
                                <CalendarClock size={13} className="text-indigo-600" />
                                <span>Schedule</span>
                              </button>

                              {/* Direct WhatsApp Shoot button */}
                              {activeTab === 'whatsapp' && isEligible && (
                                <button
                                  type="button"
                                  onClick={() => handleSingleDirectWhatsAppShoot(lead)}
                                  disabled={directShootingLeadId === lead.id}
                                  className="btn-primary py-1 px-2.5 text-xs font-bold flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-2xs"
                                  title={
                                    waSessionStatus?.isConnected
                                      ? `Shoot WhatsApp message directly from your linked phone (${waSessionStatus.phoneNumber})`
                                      : 'Link your WhatsApp phone to shoot messages directly'
                                  }
                                >
                                  {directShootingLeadId === lead.id ? (
                                    <>
                                      <Loader2 size={12} className="animate-spin" />
                                      <span>Shooting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Zap size={12} className="text-amber-300" />
                                      <span>Shoot WA</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {/* Direct deep-link or chat opener */}
                              {activeTab === 'whatsapp' && isEligible && (
                                <a
                                  href={`https://wa.me/${(lead.whatsapp || lead.phone).replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-200 shadow-2xs"
                                  title="Open in WhatsApp Web"
                                >
                                  <ExternalLink size={12} />
                                  <span>wa.me</span>
                                </a>
                              )}

                              {activeTab === 'email' && lead.email && (
                                <a
                                  href={`mailto:${lead.email}`}
                                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-blue-700 hover:bg-blue-50 border-blue-200 shadow-2xs"
                                  title="Open in Email Client"
                                >
                                  <Mail size={13} />
                                  <span>Mail</span>
                                </a>
                              )}

                              {activeTab === 'instagram' && lead.instagram && (
                                <a
                                  href={`https://instagram.com/${lead.instagram.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-pink-700 hover:bg-pink-50 border-pink-200 shadow-2xs"
                                  title="Open Instagram Profile"
                                >
                                  <ExternalLink size={13} />
                                  <span>IG</span>
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* APOLLO-GRADE PAGINATION TOOLBAR */}
            {currentChannelLeads.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/70 text-xs">
                {/* Left: Range and Count */}
                <div className="flex items-center gap-2 text-ink-600">
                  <span>
                    Showing <strong>{Math.min((currentPage - 1) * pageSize + 1, currentChannelLeads.length)}</strong>–
                    <strong>{Math.min(currentPage * pageSize, currentChannelLeads.length)}</strong> of{' '}
                    <strong>{currentChannelLeads.length}</strong> leads
                  </span>
                  {selectedLeadIds.size > 0 && (
                    <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md ml-1">
                      {selectedLeadIds.size} selected
                    </span>
                  )}
                </div>

                {/* Right: Page Size Selector & Navigation Buttons */}
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Page size selector */}
                  <div className="flex items-center gap-1.5 text-ink-500">
                    <span>Per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="input py-1 px-2 text-xs bg-white cursor-pointer"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={999999}>All</option>
                    </select>
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage <= 1}
                      className="p-1 rounded border border-slate-200 bg-white text-ink-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="First page"
                    >
                      <ChevronsLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1 rounded border border-slate-200 bg-white text-ink-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span className="px-2 font-medium text-ink-700">
                      Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1 rounded border border-slate-200 bg-white text-ink-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage >= totalPages}
                      className="p-1 rounded border border-slate-200 bg-white text-ink-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Last page"
                    >
                      <ChevronsRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* AI RESEARCH & PERSONALIZED COPYWRITER MODAL */}
      {selectedLeadForAi && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLeadForAi(null)}
          title={`AI Business Research & Copywriter: ${selectedLeadForAi.businessName}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            {isAiLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <Loader2 size={36} className="animate-spin text-brand-600" />
                <p className="font-bold text-sm text-ink-800">
                  Researching {selectedLeadForAi.businessName}&apos;s business profile...
                </p>
                <p className="text-xs text-ink-400 max-w-sm">
                  Analyzing category ({selectedLeadForAi.category}), synthesizing core pain points, and
                  crafting hyper-tailored {channelLabels[activeTab]} outreach copy.
                </p>
              </div>
            ) : aiResult ? (
              <div className="space-y-4">
                {/* Synthesized Research Dossier */}
                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-800 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-brand-600" />
                      Synthesized Business Research Dossier
                    </span>
                    <span className="text-[10px] font-semibold bg-brand-100 text-brand-900 px-2 py-0.5 rounded-full">
                      {aiResult.researchBrief.industry}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-ink-700 block mb-1">Detected Pain Points:</span>
                      <ul className="list-disc list-inside text-ink-600 space-y-0.5">
                        {aiResult.researchBrief.detectedPainPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="font-semibold text-ink-700 block mb-1">Target Value Proposition:</span>
                      <p className="text-ink-600">{aiResult.researchBrief.recommendedValueProp}</p>
                    </div>
                  </div>
                </div>

                {/* Generated Message Copy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink-600 flex items-center gap-1.5">
                      <span>Tailored {channelLabels[activeTab]} Message Copy</span>
                      <span className="text-[10px] font-normal text-ink-400">
                        ({aiResult.wordCount} words • {aiResult.modelUsed})
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopyText(aiResult.body)}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1"
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{isCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
                    </button>
                  </div>

                  {aiResult.subject && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-bold text-ink-700 mr-2">Subject:</span>
                      <span className="font-medium text-ink-900">{aiResult.subject}</span>
                    </div>
                  )}

                  <textarea
                    rows={6}
                    value={aiResult.body}
                    onChange={(e) => setAiResult({ ...aiResult, body: e.target.value })}
                    className="textarea font-sans text-xs w-full bg-white border-slate-300"
                  />
                </div>

                {/* Human-in-the-Loop Improvisation: Your Rough Words & Notes */}
                <div className="space-y-2 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-brand-600" />
                      <span>Your Words &amp; Rough Notes to Improvise</span>
                    </label>
                    <span className="text-[11px] text-ink-400">
                      Grounded &amp; realistic — no false promises
                    </span>
                  </div>

                  {/* Quick-Idea Prompt Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-ink-400 mr-1">
                      Quick ideas:
                    </span>
                    {[
                      { label: '🔍 Free Local SEO Audit', text: 'free audit of website, checking local ranking, quick chat' },
                      { label: '🌐 No Website -> Web Dev + SEO', text: 'noticed no active website, losing 70% of local customers, offering website development + local SEO + monthly maintenance from Online Digital Solution' },
                      { label: '⚡ Bolt.host Audit Issues', text: 'audited site via https://bolt-project-access-lb76.bolt.host/, found speed, schema and meta issues to fix, signature Online Digital Solution' },
                      { label: '📍 Google Maps Gap', text: 'noticed Google Business Profile ranking gap in local map pack, 3 min review' },
                      { label: '⚡ Mobile & Speed Check', text: 'checked mobile page speed, quick recommendations to fix ranking loss' },
                      { label: '💬 Inquiry Follow-up', text: 'following up on local search visibility, checking if you had time to review' },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setCustomPrompt(chip.text);
                          handleRegenerateCopy(chip.text);
                        }}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition-colors shadow-2xs"
                        title={`Click to populate and improvise: "${chip.text}"`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type rough words or bullet points (e.g. 'free audit of website, checking local ranking, quick chat')..."
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      className="input text-xs flex-1 bg-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRegenerateCopy();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRegenerateCopy()}
                      disabled={isAiLoading}
                      className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 font-semibold"
                    >
                      {isAiLoading ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      <span>✨ Improvise with AI</span>
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSelectedLeadForAi(null)}
                    className="btn-secondary py-1.5 px-4 text-xs font-semibold"
                  >
                    Close
                  </button>

                  {/* Schedule for Later */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedLeadForAi) return;
                      setScheduleTargetLead(selectedLeadForAi);
                      setScheduleTargetLeads([selectedLeadForAi]);
                      setScheduleInitialSubject(aiResult.subject || '');
                      setScheduleInitialBody(aiResult.body || '');
                      setSelectedLeadForAi(null);
                      setIsScheduleModalOpen(true);
                    }}
                    className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 text-indigo-700 hover:bg-indigo-50 border-indigo-200 shadow-2xs"
                    title="Schedule this customized outreach message for automated background sending"
                  >
                    <CalendarClock size={14} className="text-indigo-600" />
                    <span>Schedule for Later</span>
                  </button>

                  {activeTab === 'whatsapp' && selectedLeadForAi.whatsappEligible && (
                    <>
                      {waSessionStatus?.isConnected ? (
                        <button
                          type="button"
                          onClick={handleDirectShootFromAiModal}
                          disabled={isShootingFromAiModal}
                          className="btn-primary py-1.5 px-4 text-xs font-bold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
                        >
                          {isShootingFromAiModal ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Shooting via {waSessionStatus.phoneNumber}...</span>
                            </>
                          ) : (
                            <>
                              <Zap size={14} className="text-amber-300" />
                              <span>Shoot Directly to WhatsApp ({waSessionStatus.phoneNumber})</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsWaLinkModalOpen(true)}
                          className="btn-primary py-1.5 px-4 text-xs font-bold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
                        >
                          <Smartphone size={14} />
                          <span>Link WhatsApp to Shoot Directly</span>
                        </button>
                      )}

                      <a
                        href={`https://wa.me/${(selectedLeadForAi.whatsapp || selectedLeadForAi.phone).replace(/\D/g, '')}?text=${encodeURIComponent(aiResult.body)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-300"
                        title="Or open in WhatsApp Web"
                      >
                        <ExternalLink size={13} />
                        <span>Web Draft</span>
                      </a>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      )}

      {/* BATCH SHOOT 100 MESSAGES MODAL */}
      {isBatchShootModalOpen && !isBatchShootMinimized && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (isShooting) {
              cancelBatchRef.current = true;
            }
            setIsBatchShootModalOpen(false);
          }}
          onMinimize={() => {
            setIsBatchShootMinimized(true);
          }}
          title={
            selectedLeadIds.size > 0
              ? `⚡ Shoot ${selectedLeadIds.size} Selected Messages (${channelLabels[activeTab]})`
              : `⚡ Shoot ${channelLabels[activeTab]} Messages (Up to 100)`
          }
          maxWidth="max-w-xl"
        >
          <div className="space-y-5">
            {!batchShootResult ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink-900 uppercase tracking-wider">
                      Batch Queue Summary
                    </span>
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                      Channel: {channelLabels[activeTab]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-ink-500">
                        {selectedLeadIds.size > 0 ? 'Selected Leads:' : 'Available Leads in Channel:'}
                      </span>
                      <p className="text-base font-bold text-ink-900">
                        {selectedLeadIds.size > 0 ? selectedLeadIds.size : currentChannelLeads.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-ink-500">To Shoot in This Batch:</span>
                      <p className="text-base font-bold text-brand-700">
                        {selectedLeadIds.size > 0
                          ? selectedLeadIds.size
                          : Math.min(batchLimit, currentChannelLeads.length)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Engine Status Callout in Batch Shoot */}
                {activeTab === 'whatsapp' && (
                  <div className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-3 ${waSessionStatus?.isConnected
                    ? 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
                    : 'border-blue-200 bg-blue-50/80 text-blue-950'
                    }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-white shrink-0 ${waSessionStatus?.isConnected ? 'bg-emerald-600' : 'bg-blue-600'
                        }`}>
                        <Smartphone size={15} />
                      </div>
                      <div>
                        <span className="font-bold block">
                          {waSessionStatus?.isConnected
                            ? `WhatsApp Automated Sender: Active (${waSessionStatus.phoneNumber})`
                            : 'WhatsApp Socket Disconnected (Deep Link Mode)'}
                        </span>
                        <span className="text-[11px] opacity-80">
                          {waSessionStatus?.isConnected
                            ? 'All batch messages will be dispatched automatically and directly through this phone.'
                            : 'Link your WhatsApp account for 100% automated direct batch dispatching.'}
                        </span>
                      </div>
                    </div>
                    {!waSessionStatus?.isConnected && (
                      <button
                        type="button"
                        onClick={() => setIsWaLinkModalOpen(true)}
                        className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shrink-0 shadow-2xs"
                      >
                        Link Phone
                      </button>
                    )}
                  </div>
                )}

                {/* Batch Limit & Interval Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Batch Limit (Leads)</label>
                    <select
                      value={batchLimit}
                      onChange={(e) => setBatchLimit(Number(e.target.value))}
                      disabled={isShooting}
                      className="input text-xs bg-white"
                    >
                      <option value={25}>25 leads</option>
                      <option value={50}>50 leads</option>
                      <option value={100}>100 leads (Recommended)</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Anti-Ban Dispatch Delay</label>
                    <select
                      value={intervalSeconds}
                      onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                      disabled={isShooting}
                      className="input text-xs bg-white"
                    >
                      <option value={0}>Instant (No Delay)</option>
                      <option value={3}>3 seconds (Safe)</option>
                      <option value={5}>5 seconds (Recommended for WhatsApp/Meta)</option>
                      <option value={10}>10 seconds (Maximum Anti-Ban Shield)</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    Each message will be automatically researched and personalized per business with
                    automated anti-fingerprinting. Leads marked opted-out or ineligible landlines will be
                    safely skipped.
                  </p>
                </div>

                {shootError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    {shootError}
                  </div>
                )}

                {/* Progress bar if shooting */}
                {isShooting && (
                  <div className="space-y-2 pt-2 animate-fade-in bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex justify-between text-xs font-bold text-ink-800">
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={13} className="animate-spin text-brand-600" />
                        <span>Shooting messages...</span>
                      </span>
                      <span className="font-mono text-brand-700">
                        {batchShootProgress.current} / {batchShootProgress.total}
                      </span>
                    </div>
                    {batchShootProgress.currentLeadName && (
                      <p className="text-[11px] text-ink-600 truncate">
                        Sending to: <span className="font-semibold text-ink-900">{batchShootProgress.currentLeadName}</span>
                      </p>
                    )}
                    <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-600 to-emerald-500 transition-all duration-300 rounded-full"
                        style={{
                          width: `${(batchShootProgress.current / (batchShootProgress.total || 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink-500 pt-1">
                      <span>Anti-ban delay: {intervalSeconds}s</span>
                      <button
                        type="button"
                        onClick={() => setIsBatchShootMinimized(true)}
                        className="text-brand-600 hover:text-brand-800 font-bold hover:underline flex items-center gap-1"
                      >
                        <Minus size={13} />
                        <span>Minimize to background</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      if (isShooting) {
                        cancelBatchRef.current = true;
                      }
                      setIsBatchShootModalOpen(false);
                    }}
                    className="btn-secondary py-1.5 px-4 text-xs font-semibold"
                  >
                    {isShooting ? 'Stop & Cancel' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteBatchShoot}
                    disabled={isShooting || currentChannelLeads.length === 0}
                    className="btn-primary py-1.5 px-5 text-xs font-bold flex items-center gap-2"
                  >
                    {isShooting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Shooting Batch...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={15} className="text-amber-300" />
                        <span>
                          Shoot {selectedLeadIds.size > 0 ? selectedLeadIds.size : Math.min(batchLimit, currentChannelLeads.length)} Messages Now
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* RESULT SUMMARY */
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center space-y-1">
                  <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
                  <h4 className="text-base font-bold text-emerald-950">
                    Batch Message Shoot Completed!
                  </h4>
                  <p className="text-xs text-emerald-800">
                    Successfully processed {batchShootResult.totalProcessed} {channelLabels[activeTab]} leads.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5">
                    <span className="text-emerald-800 font-semibold block">Dispatched</span>
                    <span className="text-lg font-bold text-emerald-950">
                      {batchShootResult.sentCount}
                    </span>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                    <span className="text-amber-800 font-semibold block">Skipped / Landline</span>
                    <span className="text-lg font-bold text-amber-950">
                      {batchShootResult.skippedCount}
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <span className="text-ink-600 font-semibold block">Failed</span>
                    <span className="text-lg font-bold text-ink-900">
                      {batchShootResult.failedCount}
                    </span>
                  </div>
                </div>

                {/* Individual results list */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50/50 text-xs">
                  {batchShootResult.results.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-slate-200 bg-white p-2"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-ink-900 block truncate">{r.businessName}</span>
                        {r.reason && <span className="text-[10px] text-ink-400">{r.reason}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${r.status === 'sent' || r.status === 'queued'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'skipped'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                            }`}
                        >
                          {r.status}
                        </span>
                        {r.deepLink && (
                          <a
                            href={r.deepLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 hover:text-brand-800 p-1"
                            title="Open direct chat thread"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  {batchShootResult.failedCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleBulkDeleteFailedOutreach}
                      disabled={isDeletingFailedOutreach}
                      className="btn-secondary py-1.5 px-3 text-xs font-bold text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 transition-colors"
                      title="Purge failed message records"
                    >
                      <Trash2 size={13} className="text-rose-600" />
                      <span>Delete {batchShootResult.failedCount} Failed</span>
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={() => setIsBatchShootModalOpen(false)}
                    className="btn-primary py-1.5 px-5 text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* FLOATING MINIMIZED BATCH DISPATCH WIDGET */}
      {isBatchShootMinimized && (
        <div className="fixed bottom-5 right-5 z-50 w-80 sm:w-96 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl p-4 transition-all duration-300 animate-slide-up border-l-4 border-l-brand-600">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-white shrink-0 ${activeTab === 'whatsapp' ? 'bg-emerald-600' : activeTab === 'email' ? 'bg-blue-600' : 'bg-brand-600'
                }`}>
                {activeTab === 'whatsapp' ? <Smartphone size={15} /> : <Mail size={15} />}
              </div>
              <div className="truncate">
                <span className="text-xs font-bold text-ink-900 block truncate leading-tight">
                  {isShooting ? `Shooting ${channelLabels[activeTab]} Messages` : 'Batch Dispatched'}
                </span>
                <span className="text-[10px] text-ink-500 font-medium">
                  {batchShootProgress.current} / {batchShootProgress.total} processed ({Math.round((batchShootProgress.current / (batchShootProgress.total || 1)) * 100)}%)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsBatchShootMinimized(false);
                  setIsBatchShootModalOpen(true);
                }}
                className="rounded-lg p-1.5 text-ink-500 hover:bg-slate-100 hover:text-ink-900 transition-colors"
                title="Expand to Full View"
              >
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isShooting) {
                    cancelBatchRef.current = true;
                  }
                  setIsBatchShootMinimized(false);
                  setIsBatchShootModalOpen(false);
                }}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Cancel Batch"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="pt-2.5 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-ink-600 truncate font-medium max-w-[210px]">
                {batchShootProgress.currentLeadName ? `Target: ${batchShootProgress.currentLeadName}` : 'Dispatching...'}
              </span>
              <span className="font-bold text-brand-700">
                {Math.round((batchShootProgress.current / (batchShootProgress.total || 1)) * 100)}%
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-emerald-500 transition-all duration-300 rounded-full"
                style={{
                  width: `${(batchShootProgress.current / (batchShootProgress.total || 1)) * 100}%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-ink-400 pt-0.5">
              <span>Anti-ban shield: {intervalSeconds}s delay</span>
              <button
                type="button"
                onClick={() => {
                  setIsBatchShootMinimized(false);
                  setIsBatchShootModalOpen(true);
                }}
                className="text-brand-600 font-bold hover:underline"
              >
                Open Details ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CELEBRATORY BATCH COMPLETION POPUP MODAL */}
      {isCompletionPopupOpen && batchShootResult && (
        <Modal
          isOpen={true}
          onClose={() => setIsCompletionPopupOpen(false)}
          title={`🎉 All ${batchShootResult.totalProcessed} ${channelLabels[batchShootResult.channel as Channel || activeTab]} Messages Processed!`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-white p-5 text-center space-y-2 shadow-xs">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-emerald-950">
                All {batchShootResult.totalProcessed} Messages Have Been Processed!
              </h3>
              <p className="text-xs text-ink-600 max-w-md mx-auto">
                Batch outreach completed for {channelLabels[batchShootResult.channel as Channel || activeTab]}. Here is the complete delivery status breakdown:
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                  Delivered / Sent
                </span>
                <span className="text-2xl font-black text-emerald-700">
                  {batchShootResult.sentCount}
                </span>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">
                  Skipped / Landline
                </span>
                <span className="text-2xl font-black text-amber-700">
                  {batchShootResult.skippedCount}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-[11px] font-semibold text-ink-600 uppercase tracking-wider block">
                  Failed
                </span>
                <span className="text-2xl font-black text-ink-900">
                  {batchShootResult.failedCount}
                </span>
              </div>
            </div>

            {/* Individual Delivery Breakdown */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-ink-900 block">Lead Dispatch Breakdown</span>
              <div className="max-h-64 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 text-xs">
                {batchShootResult.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs"
                  >
                    <div className="truncate mr-3">
                      <span className="font-bold text-ink-900 block truncate">{r.businessName}</span>
                      {r.reason && (
                        <span className="text-[10px] text-ink-500 block truncate">{r.reason}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${r.status === 'sent' || r.status === 'queued'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : r.status === 'skipped'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                          }`}
                      >
                        {r.status === 'sent' ? 'Delivered' : r.status}
                      </span>
                      {r.deepLink && (
                        <a
                          href={r.deepLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 hover:text-brand-800 p-1"
                          title="Open direct chat"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
              {batchShootResult.failedCount > 0 ? (
                <button
                  type="button"
                  onClick={handleBulkDeleteFailedOutreach}
                  disabled={isDeletingFailedOutreach}
                  className="btn-secondary py-2 px-3 text-xs font-bold text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 transition-colors"
                  title="Purge failed dispatch and message records"
                >
                  <Trash2 size={13} className="text-rose-600" />
                  <span>Delete {batchShootResult.failedCount} Failed</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setIsCompletionPopupOpen(false)}
                className="btn-primary py-2 px-6 text-xs font-bold"
              >
                Done & Return
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* WHATSAPP DIRECT PHONE LINK MODAL (OPTION 1) */}
      {isWaLinkModalOpen && (
        <Modal
          isOpen={isWaLinkModalOpen}
          onClose={() => setIsWaLinkModalOpen(false)}
          title="Link WhatsApp Phone (Option 1: Direct Headless Automation)"
        >
          <div className="space-y-5 p-1">
            {waSessionStatus?.isConnected ? (
              /* CONNECTED STATE */
              <div className="space-y-4 animate-fade-in text-center">
                <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-50 to-teal-50/40 p-6 space-y-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white mx-auto shadow-md">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 mb-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Session Active &amp; Connected
                    </span>
                    <h3 className="text-xl font-black text-emerald-950">
                      {waSessionStatus.phoneNumber || 'Your WhatsApp Phone'}
                    </h3>
                    {waSessionStatus.name && (
                      <p className="text-xs font-medium text-emerald-700 mt-0.5">
                        Device / Account: {waSessionStatus.name}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-emerald-900/80 max-w-md mx-auto leading-relaxed pt-1">
                    Your WhatsApp account is successfully linked! All outbound single messages and 100/batch shoots
                    will be dispatched 100% automatically straight from this phone in headless background mode.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-left text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="font-bold text-ink-900 block mb-1">Inbound Reply Sync</span>
                    <p className="text-ink-500 text-[11px]">
                      Customer responses on WhatsApp are automatically recorded into message threads and client stages.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="font-bold text-ink-900 block mb-1">Anti-Ban Protection</span>
                    <p className="text-ink-500 text-[11px]">
                      Enforces human-like dispatch intervals (3-10s) and automatically skips landlines to safeguard phone reputation.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleDisconnectWa}
                    disabled={isDisconnectingWa}
                    className="btn-danger py-1.5 px-4 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Unlink size={14} />
                    <span>{isDisconnectingWa ? 'Disconnecting...' : 'Disconnect Phone'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsWaLinkModalOpen(false)}
                    className="btn-primary py-1.5 px-5 text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* PAIRING / CONNECTION FLOW */
              <div className="space-y-4">
                {/* Method Switcher Tabs */}
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setWaLinkMode('qr')}
                    className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${waLinkMode === 'qr'
                      ? 'bg-white text-ink-900 shadow-xs'
                      : 'text-ink-600 hover:text-ink-900'
                      }`}
                  >
                    <QrCode size={15} />
                    <span>Scan QR Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaLinkMode('pairing')}
                    className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${waLinkMode === 'pairing'
                      ? 'bg-white text-ink-900 shadow-xs'
                      : 'text-ink-600 hover:text-ink-900'
                      }`}
                  >
                    <Smartphone size={15} />
                    <span>8-Digit Pairing Code</span>
                  </button>
                </div>

                {/* Error Banner */}
                {waLinkError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2 animate-fade-in">
                    <AlertTriangle size={15} className="shrink-0 text-red-600 mt-0.5" />
                    <span>{waLinkError}</span>
                  </div>
                )}

                {waLinkMode === 'qr' ? (
                  /* TAB 1: SCAN QR CODE */
                  <div className="space-y-4 text-center">
                    <div className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-200 bg-white shadow-xs">
                      {waSessionStatus?.qrCodeDataUrl ? (
                        <div className="relative group">
                          <img
                            src={waSessionStatus.qrCodeDataUrl}
                            alt="Scan WhatsApp QR Code"
                            className="w-56 h-56 rounded-xl border border-slate-200 shadow-sm"
                          />
                          <div className="mt-2 text-[11px] font-semibold text-emerald-700 flex items-center justify-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Live QR Ready to Scan
                          </div>
                        </div>
                      ) : (
                        <div className="w-56 h-56 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl border border-slate-200 text-ink-400">
                          <Loader2 size={32} className="animate-spin text-brand-600" />
                          <span className="text-xs font-semibold text-ink-700">
                            {waSessionStatus?.status === 'connecting'
                              ? 'Initializing WhatsApp socket...'
                              : 'Generating secure QR code...'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Step by step QR instructions */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs space-y-1.5">
                      <span className="font-bold text-ink-900 block">How to Link with QR Code:</span>
                      <ol className="list-decimal list-inside space-y-1 text-ink-600 text-[11px]">
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap <strong>Settings</strong> (iOS) or <strong>⋮ Menu</strong> (Android) &gt; <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Point your phone camera at this QR code to complete pairing</li>
                      </ol>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={handleRefreshWaSession}
                        disabled={isRefreshingWaSession}
                        className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <RefreshCw size={13} className={isRefreshingWaSession ? 'animate-spin' : ''} />
                        <span>Refresh QR</span>
                      </button>

                      <span className="text-[11px] text-ink-400 font-medium">
                        Auto-detects scan in real time
                      </span>
                    </div>
                  </div>
                ) : (
                  /* TAB 2: PAIRING CODE WITH PHONE NUMBER */
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="label">Your WhatsApp Phone Number (with Country Code)</label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          placeholder="e.g. +61 412 345 678 or +91 98765 43210"
                          value={waPhoneInput}
                          onChange={(e) => setWaPhoneInput(e.target.value)}
                          className="input text-xs flex-1 bg-white font-mono"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRequestPairingCode();
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleRequestPairingCode}
                          disabled={isRequestingPairing || !waPhoneInput.trim()}
                          className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shrink-0"
                        >
                          {isRequestingPairing ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Requesting...</span>
                            </>
                          ) : (
                            <>
                              <Smartphone size={13} />
                              <span>Get Code</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-ink-400">
                        Include your international country code (e.g. 61 for Australia, 91 for India, 1 for US).
                      </p>
                    </div>

                    {/* Display Pairing Code if available */}
                    {waPairingCode && (
                      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 p-4 text-center space-y-2 animate-fade-in">
                        <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider block">
                          Your 8-Digit Pairing Code:
                        </span>
                        <div className="flex items-center justify-center gap-3">
                          <div className="text-3xl font-mono font-black tracking-widest text-emerald-950 bg-white border border-emerald-300 rounded-xl px-4 py-2 shadow-xs select-all">
                            {waPairingCode}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyPairingCode(waPairingCode)}
                            className="btn-secondary py-2 px-3 text-xs font-bold flex items-center gap-1 shrink-0"
                          >
                            {isPairingCodeCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            <span>{isPairingCodeCopied ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-emerald-800">
                          Enter this code on your phone when prompted.
                        </p>
                      </div>
                    )}

                    {/* Step by step Pairing instructions */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs space-y-1.5">
                      <span className="font-bold text-ink-900 block">How to Link with Pairing Code:</span>
                      <ol className="list-decimal list-inside space-y-1 text-ink-600 text-[11px]">
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap <strong>Settings</strong> (iOS) or <strong>⋮ Menu</strong> (Android) &gt; <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Tap <strong>"Link with phone number instead"</strong> at the bottom</li>
                        <li>Enter the 8-character code shown above to connect immediately!</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* EDIT LEAD MODAL */}
      {editingLead && (
        <Modal
          isOpen={!!editingLead}
          onClose={() => setEditingLead(null)}
          title={`Edit Lead: ${editingLead.businessName}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4 p-1">
            {editLeadError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 text-red-600 mt-0.5" />
                <span>{editLeadError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Business Name */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold">Business Name *</label>
                <input
                  type="text"
                  value={editFormData.businessName}
                  onChange={(e) => setEditFormData({ ...editFormData, businessName: e.target.value })}
                  placeholder="e.g. Acme Dental"
                  className="input text-xs w-full bg-white"
                  required
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold">Category / Industry</label>
                <input
                  type="text"
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                  placeholder="e.g. Healthcare, Dental Clinic"
                  className="input text-xs w-full bg-white"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold flex items-center justify-between">
                  <span>Phone / Mobile</span>
                  <span className="text-[10px] text-ink-400 font-normal">Australian 04xx = WA Mobile</span>
                </label>
                <input
                  type="text"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  placeholder="e.g. 0412 345 678 or +61 412 345 678"
                  className="input text-xs w-full bg-white font-mono"
                />
              </div>

              {/* WhatsApp override */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold">WhatsApp Number (Optional override)</label>
                <input
                  type="text"
                  value={editFormData.whatsapp}
                  onChange={(e) => setEditFormData({ ...editFormData, whatsapp: e.target.value })}
                  placeholder="e.g. +61 412 345 678"
                  className="input text-xs w-full bg-white font-mono"
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold">Email Address</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="e.g. contact@business.com"
                  className="input text-xs w-full bg-white"
                />
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold">Lead Status</label>
                <select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                  className="input text-xs w-full bg-white"
                >
                  <option value="active">Active (Eligible for outreach)</option>
                  <option value="inactive">Inactive</option>
                  <option value="paused">Paused</option>
                </select>
              </div>

              {/* Facebook Profile / Page */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold flex items-center gap-1">
                  <Facebook size={12} className="text-indigo-600" />
                  <span>Facebook Profile or Page</span>
                </label>
                <input
                  type="text"
                  value={editFormData.facebook}
                  onChange={(e) => setEditFormData({ ...editFormData, facebook: e.target.value })}
                  placeholder="e.g. https://facebook.com/acmedental or acmedental"
                  className="input text-xs w-full bg-white"
                />
              </div>

              {/* Instagram Handle */}
              <div className="space-y-1">
                <label className="label text-xs font-semibold flex items-center gap-1">
                  <Instagram size={12} className="text-pink-600" />
                  <span>Instagram Handle</span>
                </label>
                <input
                  type="text"
                  value={editFormData.instagram}
                  onChange={(e) => setEditFormData({ ...editFormData, instagram: e.target.value })}
                  placeholder="e.g. @acmedental"
                  className="input text-xs w-full bg-white font-mono"
                />
              </div>

              {/* Consent / Stage */}
              <div className="space-y-1 md:col-span-2">
                <label className="label text-xs font-semibold">Consent &amp; Outreach Stage</label>
                <select
                  value={editFormData.consentStatus}
                  onChange={(e) => setEditFormData({ ...editFormData, consentStatus: e.target.value as any })}
                  className="input text-xs w-full bg-white"
                >
                  <option value="none">Cold / Uncontacted (none)</option>
                  <option value="replied">Replied / Engaged</option>
                  <option value="opted_out">Opted Out (Do Not Contact)</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1 md:col-span-2">
                <label className="label text-xs font-semibold">Business Notes &amp; Background</label>
                <textarea
                  rows={3}
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  placeholder="Add custom notes, pricing references, pain points, or previous communication history..."
                  className="textarea text-xs w-full bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingLead(null)}
                disabled={isSavingLead}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingLead || !editFormData.businessName.trim()}
                className="btn-primary py-1.5 px-5 text-xs font-bold flex items-center gap-1.5"
              >
                {isSavingLead ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save &amp; Update Lead</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingLead && (
        <Modal
          isOpen={!!deletingLead}
          onClose={() => setDeletingLead(null)}
          title={`Delete Lead: ${deletingLead.businessName}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4 p-1">
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-950 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shrink-0 mt-0.5 shadow-xs">
                <Trash2 size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold">Are you sure you want to delete this lead?</h4>
                <p className="text-xs text-rose-900/90 leading-relaxed">
                  <strong>{deletingLead.businessName}</strong> will be removed from all channels (WhatsApp, Email, Instagram)
                  and safely preserved in Trash for 28 days with restore capability.
                </p>
              </div>
            </div>

            {deleteLeadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                {deleteLeadError}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 text-ink-600">
              <div className="flex justify-between">
                <span className="font-semibold text-ink-700">Category:</span>
                <span>{deletingLead.category || 'Uncategorized'}</span>
              </div>
              {deletingLead.email && (
                <div className="flex justify-between">
                  <span className="font-semibold text-ink-700">Email:</span>
                  <span>{deletingLead.email}</span>
                </div>
              )}
              {deletingLead.phone && (
                <div className="flex justify-between">
                  <span className="font-semibold text-ink-700">Phone:</span>
                  <span>{deletingLead.phone}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingLead(null)}
                disabled={isDeletingLead}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingLead}
                className="btn-danger py-1.5 px-4 text-xs font-bold flex items-center gap-1.5"
              >
                {isDeletingLead ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Delete Lead</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {isBulkDeleteModalOpen && (
        <Modal
          isOpen={isBulkDeleteModalOpen}
          onClose={() => {
            if (!isDeletingBulk) setIsBulkDeleteModalOpen(false);
          }}
          title={`Delete ${selectedLeadIds.size} Selected Leads`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4 p-1">
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-950 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shrink-0 mt-0.5 shadow-xs">
                <Trash2 size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold">
                  Delete {selectedLeadIds.size} leads simultaneously?
                </h4>
                <p className="text-xs text-rose-900/90 leading-relaxed">
                  These {selectedLeadIds.size} leads will be removed from all channel lists and safely preserved in Trash for 28 days with full restore capability.
                </p>
              </div>
            </div>

            {bulkDeleteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                {bulkDeleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isDeletingBulk}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                disabled={isDeletingBulk}
                className="btn-danger py-1.5 px-4 text-xs font-bold flex items-center gap-1.5"
              >
                {isDeletingBulk ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Deleting {selectedLeadIds.size} Leads...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Delete {selectedLeadIds.size} Leads</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ADD TO LIST MODAL */}
      {isAddToListModalOpen && (
        <Modal
          isOpen={isAddToListModalOpen}
          onClose={() => {
            if (!isAddingToList) setIsAddToListModalOpen(false);
          }}
          title={`Add ${selectedLeadIds.size} Leads to List`}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 p-1">
            <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 text-brand-950">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shrink-0 shadow-xs">
                <ListPlus size={18} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold">Assign to a Custom Lead List</h4>
                <p className="text-[11px] text-brand-800">
                  Select an existing list or create a new campaign list for your {selectedLeadIds.size} selected leads.
                </p>
              </div>
            </div>

            {addToListError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                {addToListError}
              </div>
            )}

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAddToListMode('existing')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${addToListMode === 'existing'
                  ? 'bg-white text-ink-900 shadow-2xs'
                  : 'text-ink-500 hover:text-ink-800'
                  }`}
              >
                Choose Existing List ({lists.length})
              </button>
              <button
                type="button"
                onClick={() => setAddToListMode('new')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${addToListMode === 'new'
                  ? 'bg-white text-ink-900 shadow-2xs'
                  : 'text-ink-500 hover:text-ink-800'
                  }`}
              >
                + Create New List
              </button>
            </div>

            {addToListMode === 'existing' ? (
              <div className="space-y-2 pt-1">
                <label className="label text-xs font-semibold">Select Target List</label>
                {lists.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-ink-500">
                    No custom lists created yet. Switch to &quot;Create New List&quot; above to create one.
                  </div>
                ) : (
                  <select
                    value={selectedTargetListId || lists[0]?.id || ''}
                    onChange={(e) => setSelectedTargetListId(e.target.value)}
                    className="input text-xs w-full bg-white"
                  >
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.lead_count ?? 0} members)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="label text-xs font-semibold">New List Name *</label>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. 11 Sep Morning Outreach"
                    className="input text-xs w-full bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="label text-xs font-semibold">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={newListDesc}
                    onChange={(e) => setNewListDesc(e.target.value)}
                    placeholder="e.g. Targeted medical clinics in Sydney"
                    className="textarea text-xs w-full bg-white"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAddToListModalOpen(false)}
                disabled={isAddingToList}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToList}
                disabled={isAddingToList || (addToListMode === 'existing' && lists.length === 0)}
                className="btn-primary py-1.5 px-5 text-xs font-bold flex items-center gap-1.5"
              >
                {isAddingToList ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <ListPlus size={14} />
                    <span>Add {selectedLeadIds.size} Leads to List</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MULTI-CHANNEL SCHEDULE OUTREACH MODAL */}
      <ScheduleOutreachModal
        open={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        lead={scheduleTargetLead}
        leads={scheduleTargetLeads}
        defaultChannel={activeTab}
        initialSubject={scheduleInitialSubject}
        initialBody={scheduleInitialBody}
        onScheduledSuccess={() => {
          showToast('Outreach successfully scheduled! Dispatcher active in background.', 'success');
          if (onRefreshLeads) onRefreshLeads();
        }}
      />
    </div>
  );
}
