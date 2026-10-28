import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Clock,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Loader2,
  RefreshCw,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  Globe,
  Linkedin,
  Plus,
  CheckSquare,
  Square,
  Trash2,
  User,
  MapPin,
  Flame,
  DollarSign,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/services/api';
import type { Lead, LeadActivity, SequenceEnrollment, Deal, CrmTask } from '@/types';
import { getCountryFlag } from '@/utils/countryFlag';

interface Props {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onDealCreated?: () => void;
  onStageChanged?: (newStage: string) => void;
}

type DrawerTab = 'timeline' | 'deals' | 'tasks' | 'cadence';

function getCompanyInitials(name: string): string {
  if (!name) return 'CO';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-blue-600 to-indigo-700',
  'from-purple-600 to-pink-600',
  'from-emerald-600 to-teal-700',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-cyan-600',
  'from-rose-500 to-red-600',
  'from-indigo-600 to-violet-700',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

export function LeadActivityDrawer({ isOpen, lead, onClose, onDealCreated, onStageChanged }: Props) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('timeline');
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [leadDeals, setLeadDeals] = useState<Deal[]>([]);
  const [leadTasks, setLeadTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('initial');

  // Note / Call log state
  const [noteText, setNoteText] = useState('');
  const [activityType, setActivityType] = useState<'note_added' | 'call_logged' | 'meeting_scheduled'>('note_added');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Deal conversion state
  const [showDealModal, setShowDealModal] = useState(false);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('24000');
  const [dealStage, setDealStage] = useState('interested');
  const [isCreatingDeal, setIsCreatingDeal] = useState(false);

  // Quick Task creation state
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState(new Date().toISOString().split('T')[0]);
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!lead) return;
    try {
      setLoading(true);
      const [actRes, seqRes, dealsRes, tasksRes] = await Promise.all([
        api.getLeadActivities(lead.id).catch(() => ({ success: false, activities: [] })),
        api.getLeadSequenceEnrollments(lead.id).catch(() => ({ enrollments: [] })),
        api.getDeals().catch(() => ({ success: false, deals: [] })),
        api.getTasks('all').catch(() => ({ success: false, tasks: [] })),
      ]);

      if (actRes.activities) {
        setActivities(actRes.activities || []);
      }
      if (seqRes.enrollments) {
        setEnrollments(seqRes.enrollments);
      }
      if (dealsRes.deals) {
        setLeadDeals(dealsRes.deals.filter((d: Deal) => d.lead_id === lead.id || d.title.toLowerCase().includes(lead.businessName.toLowerCase())));
      }
      if (tasksRes.tasks) {
        setLeadTasks(tasksRes.tasks.filter((t: CrmTask) => t.lead_id === lead.id));
      }
    } catch (err) {
      console.error('Failed to load lead timeline:', err);
    } finally {
      setLoading(false);
    }
  }, [lead]);

  useEffect(() => {
    if (isOpen && lead) {
      setDealTitle(`${lead.businessName} - Omnichannel Growth Retainer`);
      const estimatedValue = Number(lead.metadata?.deal_value || lead.metadata?.dealValue || 24000);
      setDealValue(String(estimatedValue));
      setCurrentStage(lead.outreachStage || lead.stage || 'initial');
      fetchHistory();
    }
  }, [isOpen, lead, fetchHistory]);

  const handleStageChange = async (newStage: string) => {
    if (!lead) return;
    try {
      setCurrentStage(newStage);
      await api.updateLead(lead.id, { outreachStage: newStage as any, stage: newStage });
      setSuccessFeedback(`Updated stage to ${newStage.replace(/_/g, ' ').toUpperCase()}`);
      setTimeout(() => setSuccessFeedback(null), 3000);
      if (onStageChanged) onStageChanged(newStage);
    } catch (err: any) {
      alert(`Failed to update stage: ${err?.message || 'Error'}`);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !noteText.trim()) return;

    try {
      setIsSubmitting(true);
      const title =
        activityType === 'call_logged'
          ? `Call Logged: ${noteText.slice(0, 50)}`
          : activityType === 'meeting_scheduled'
          ? `Meeting Scheduled: ${noteText.slice(0, 50)}`
          : 'Manual Note Added';

      const res = await api.logActivity({
        leadId: lead.id,
        activityType,
        title,
        description: noteText.trim(),
      });

      if (res.success) {
        setNoteText('');
        fetchHistory();
        setSuccessFeedback('Activity recorded to CRM timeline.');
        setTimeout(() => setSuccessFeedback(null), 3000);
      }
    } catch (err: any) {
      alert(`Failed to save note: ${err?.message || 'Error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !dealTitle.trim()) return;

    try {
      setIsCreatingDeal(true);
      const res = await api.createDeal({
        lead_id: lead.id,
        title: dealTitle.trim(),
        value: parseFloat(dealValue) || 0,
        stage: dealStage as any,
        contact_name: lead.primaryContactName || lead.businessName,
        contact_email: lead.email || undefined,
        contact_phone: lead.phone || undefined,
      });

      if (res.success) {
        setShowDealModal(false);
        setSuccessFeedback(`Deal "${dealTitle}" added to Pipeline!`);
        fetchHistory();
        if (onDealCreated) onDealCreated();
        setTimeout(() => setSuccessFeedback(null), 3500);
      }
    } catch (err: any) {
      alert(`Failed to create deal: ${err?.message || 'Error'}`);
    } finally {
      setIsCreatingDeal(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !newTaskTitle.trim()) return;

    try {
      setIsCreatingTask(true);
      const res = await api.createTask({
        lead_id: lead.id,
        title: newTaskTitle.trim(),
        due_date: newTaskDue ? new Date(newTaskDue).toISOString() : undefined,
        priority: newTaskPriority,
        task_type: 'follow_up',
      });

      if (res.success) {
        setNewTaskTitle('');
        setShowTaskInput(false);
        setSuccessFeedback('Follow-up task scheduled.');
        fetchHistory();
        setTimeout(() => setSuccessFeedback(null), 3000);
      }
    } catch (err: any) {
      alert(`Failed to schedule task: ${err?.message || 'Error'}`);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await api.toggleTask(taskId);
      fetchHistory();
    } catch (err: any) {
      console.error('Failed to toggle task:', err);
    }
  };

  if (!isOpen || !lead) return null;

  const leadScore = Number(lead.metadata?.lead_score || lead.metadata?.leadScore || 85);
  const dealVal = Number(lead.metadata?.deal_value || lead.metadata?.dealValue || 24000);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Slideout Drawer */}
      <div className="relative w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200 text-slate-900">
        {/* Top Header Card */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              {/* Company Logo Avatar */}
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarGradient(
                  lead.businessName
                )} text-white font-extrabold text-base flex items-center justify-center shadow-sm shrink-0`}
              >
                {getCompanyInitials(lead.businessName)}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">{lead.businessName}</h2>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {lead.category || 'Prospect'}
                  </span>
                </div>

                {/* Primary Contact Person */}
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-700 font-medium">
                  <User size={13} className="text-brand-600" />
                  <span>{lead.primaryContactName || 'Decision Maker / Principal'}</span>
                </div>

                {/* Location & Country */}
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  <MapPin size={13} className="text-slate-400" />
                  <span>
                    {lead.location || 'Location Not Specified'}
                    {lead.country ? ` • ${getCountryFlag(lead.country)} ${lead.country}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDealModal(true)}
                className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold shadow-xs bg-emerald-600 hover:bg-emerald-700"
                title="Create a Deal Opportunity in Pipeline"
              >
                <TrendingUp size={13} />
                <span>Add Deal</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Quick Metrics & Interactive Stage Dropdown */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pipeline Stage:</span>
              <select
                value={currentStage}
                onChange={(e) => handleStageChange(e.target.value)}
                className={`text-xs font-bold rounded-lg px-2.5 py-1 border transition-all cursor-pointer shadow-2xs ${
                  currentStage === 'won'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : currentStage === 'negotiation'
                    ? 'bg-teal-50 text-teal-800 border-teal-300'
                    : currentStage === 'proposal_sent'
                    ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                    : currentStage === 'meeting_scheduled'
                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                    : currentStage === 'replied'
                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                    : currentStage === 'contacted'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                <option value="initial">📥 New Lead</option>
                <option value="contacted">📤 Contacted</option>
                <option value="replied">💬 Replied / Interested</option>
                <option value="meeting_scheduled">📅 Meeting Scheduled</option>
                <option value="proposal_sent">💼 Proposal Sent</option>
                <option value="negotiation">🤝 Negotiation</option>
                <option value="won">🎉 Closed Won</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              {/* Intent Score */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-xs">
                <Flame size={13} className="text-amber-500 fill-amber-500" />
                <span>Score: {leadScore}/100</span>
              </div>

              {/* Deal Value */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                <DollarSign size={13} className="text-emerald-600" />
                <span>Est: ${dealVal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Quick Omni-Channel Action Bar */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-semibold flex items-center gap-1.5 transition"
                title={`Send direct email to ${lead.email}`}
              >
                <Mail size={12} />
                <span>Email ({lead.email})</span>
              </a>
            )}

            {lead.phone && (
              <a
                href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition"
                title={`Start WhatsApp chat with ${lead.phone}`}
              >
                <MessageCircle size={12} />
                <span>WhatsApp</span>
              </a>
            )}

            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                title={`Call ${lead.phone}`}
              >
                <Phone size={12} />
                <span>Call</span>
              </a>
            )}

            {lead.linkedin && (
              <a
                href={lead.linkedin}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 text-xs font-semibold flex items-center gap-1.5 transition"
                title="Open LinkedIn profile"
              >
                <Linkedin size={12} />
                <span>LinkedIn</span>
              </a>
            )}

            {lead.website && (
              <a
                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 text-xs font-semibold flex items-center gap-1.5 transition"
                title="Visit company website"
              >
                <Globe size={12} />
                <span>Website</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {successFeedback && (
          <div className="mx-5 mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successFeedback}</span>
          </div>
        )}

        {/* Create Deal Modal Popup */}
        {showDealModal && (
          <div className="m-4 p-4 rounded-xl bg-slate-900 border border-emerald-500/40 text-white shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Spawn Sales Opportunity
              </h3>
              <button onClick={() => setShowDealModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Deal Title</label>
                <input
                  type="text"
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Deal Value ($)</label>
                  <input
                    type="number"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Pipeline Stage</label>
                  <select
                    value={dealStage}
                    onChange={(e) => setDealStage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="interested">Replied / Interested</option>
                    <option value="audit_sent">Audit Sent</option>
                    <option value="meeting_booked">Meeting Booked</option>
                    <option value="proposal_sent">Proposal Sent</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="won">Closed Won</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDealModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDeal}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isCreatingDeal ? 'Creating...' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Drawer Tabs Bar */}
        <div className="flex items-center border-b border-slate-200 px-5 bg-white">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'timeline'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={13} />
            <span>Activity Timeline ({activities.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('deals')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'deals'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp size={13} />
            <span>Deals &amp; Revenue ({leadDeals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'tasks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckSquare size={13} />
            <span>Tasks ({leadTasks.length})</span>
          </button>

          {enrollments.length > 0 && (
            <button
              onClick={() => setActiveTab('cadence')}
              className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'cadence'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calendar size={13} />
              <span>Cadence</span>
            </button>
          )}
        </div>

        {/* Tab 1: Timeline & Log Activity */}
        {activeTab === 'timeline' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Quick Note & Call Outcome Logger */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <form onSubmit={handleAddNote} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                    <button
                      type="button"
                      onClick={() => setActivityType('note_added')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                        activityType === 'note_added' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📝 Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityType('call_logged')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                        activityType === 'call_logged' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📞 Log Call
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityType('meeting_scheduled')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                        activityType === 'meeting_scheduled' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📅 Meeting
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-500 font-medium">Record activity for team</span>
                </div>

                <div className="relative">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={
                      activityType === 'call_logged'
                        ? 'e.g. Spoke to Marcus Vance (CTO), interested in technical audit demo next week...'
                        : activityType === 'meeting_scheduled'
                        ? 'e.g. Confirmed Zoom meeting Thursday 2 PM PST to review proposal...'
                        : 'Add observations, internal comments, or next steps...'
                    }
                    rows={2}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none shadow-2xs"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !noteText.trim()}
                    className="absolute right-2.5 bottom-2.5 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                  >
                    {isSubmitting ? 'Saving...' : 'Post'}
                  </button>
                </div>
              </form>
            </div>

            {/* Timeline Feed */}
            <div className="flex-1 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Activity History
                </h3>
                <button onClick={fetchHistory} className="text-slate-400 hover:text-slate-700 transition" title="Refresh history">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {activities.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                      <span className="text-xs">Loading timeline...</span>
                    </div>
                  ) : (
                    <p className="text-xs">No activity recorded yet for this lead.</p>
                  )}
                </div>
              ) : (
                <div className="relative border-l border-slate-200 ml-3 space-y-4 pb-6">
                  {activities.map((act) => {
                    const isSent = act.activity_type.includes('sent') || act.activity_type === 'outreach_sent';
                    const isReply = act.activity_type.includes('reply') || act.activity_type === 'inbound_received';
                    const isBounce = act.activity_type === 'email_bounced';
                    const isDeal = act.activity_type === 'deal_created';
                    const isStage = act.activity_type === 'stage_changed';

                    return (
                      <div key={act.id} className="relative pl-6">
                        {/* Timeline Node Dot */}
                        <div
                          className={`absolute -left-2 top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center shadow-xs ${
                            isBounce
                              ? 'bg-rose-500'
                              : isReply
                              ? 'bg-emerald-500'
                              : isDeal
                              ? 'bg-purple-500'
                              : isStage
                              ? 'bg-amber-500'
                              : isSent
                              ? 'bg-blue-500'
                              : 'bg-slate-500'
                          }`}
                        />

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors shadow-2xs">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span className="font-bold text-slate-900">{act.title}</span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {new Date(act.created_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {act.description && (
                            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {act.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Deals & Revenue */}
        {activeTab === 'deals' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Briefcase size={14} className="text-emerald-600" />
                <span>Associated Sales Opportunities</span>
              </h3>
              <button
                onClick={() => setShowDealModal(true)}
                className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus size={12} />
                <span>New Deal</span>
              </button>
            </div>

            {leadDeals.length === 0 ? (
              <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="text-xs font-medium">No deals currently linked to this lead.</p>
                <button
                  onClick={() => setShowDealModal(true)}
                  className="mt-2 text-xs font-bold text-emerald-600 hover:underline"
                >
                  + Add First Deal Opportunity
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {leadDeals.map((deal) => (
                  <div key={deal.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 shadow-2xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{deal.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <span className="font-bold text-emerald-700 text-sm">${deal.value.toLocaleString()}</span>
                          <span>•</span>
                          <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {deal.stage.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-mono font-bold text-slate-600">
                        {deal.probability}% Win Probability
                      </span>
                    </div>

                    {deal.notes && (
                      <p className="text-xs text-slate-600 mt-2 p-2 bg-white rounded border border-slate-200">
                        {deal.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Actionable Tasks */}
        {activeTab === 'tasks' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <CheckSquare size={14} className="text-indigo-600" />
                <span>Follow-Up Tasks &amp; Reminders</span>
              </h3>
              <button
                onClick={() => setShowTaskInput(!showTaskInput)}
                className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
              >
                <Plus size={12} />
                <span>Add Task</span>
              </button>
            </div>

            {showTaskInput && (
              <form onSubmit={handleCreateTask} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <input
                  type="text"
                  placeholder="Task description (e.g. Follow up on contract, send demo video)..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="input text-xs py-1.5"
                  required
                />
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                    className="input text-xs py-1 w-auto"
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="input text-xs py-1 w-auto font-medium"
                  >
                    <option value="high">🔥 High Priority</option>
                    <option value="medium">⚡ Medium Priority</option>
                    <option value="low">☕ Low Priority</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isCreatingTask}
                    className="btn-primary py-1 px-3 text-xs ml-auto"
                  >
                    {isCreatingTask ? 'Saving...' : 'Save Task'}
                  </button>
                </div>
              </form>
            )}

            {leadTasks.length === 0 ? (
              <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="text-xs font-medium">No pending tasks for this lead.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leadTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleToggleTask(t.id)}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {t.status === 'completed' ? (
                        <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                      ) : (
                        <Square size={16} className="text-slate-400 hover:text-brand-600 shrink-0" />
                      )}
                      <span className={`text-xs ${t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900 font-medium'}`}>
                        {t.title}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.priority === 'high'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {t.priority}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Cadence & Automation */}
        {activeTab === 'cadence' && enrollments.length > 0 && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar size={14} className="text-purple-600" />
              <span>Automated Outreach Cadence</span>
            </h3>

            {enrollments.map((enr) => (
              <div key={enr.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{enr.sequence_name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Step {enr.current_step} of {enr.total_steps}
                    </p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      enr.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {enr.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
