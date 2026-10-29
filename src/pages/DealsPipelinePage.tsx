import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  Trash2,
  RefreshCw,
  Search,
  CheckSquare,
  Activity,
  X,
  TrendingUp,
  Trophy,
  PieChart,
  Briefcase,
  Scale,
  User,
  GripVertical,
  Check,
} from 'lucide-react';
import { api } from '@/services/api';
import type { Deal, DealStage, PipelineSummary, CrmTask, LeadActivity, Lead } from '@/types';
import { LeadActivityDrawer } from '@/components/LeadActivityDrawer';
import { useStore } from '@/store';

const STAGES: Array<{
  id: DealStage;
  label: string;
  color: string;
  barColor: string;
  dotColor: string;
  badgeBg: string;
}> = [
  { id: 'interested', label: 'Interested', color: 'text-blue-700', barColor: 'bg-blue-500', dotColor: '#3b82f6', badgeBg: 'bg-blue-100 text-blue-800' },
  { id: 'audit_sent', label: 'Audit Sent', color: 'text-indigo-700', barColor: 'bg-indigo-500', dotColor: '#6366f1', badgeBg: 'bg-indigo-100 text-indigo-800' },
  { id: 'meeting_booked', label: 'Meeting Booked', color: 'text-purple-700', barColor: 'bg-purple-500', dotColor: '#a855f7', badgeBg: 'bg-purple-100 text-purple-800' },
  { id: 'proposal_sent', label: 'Proposal Sent', color: 'text-amber-700', barColor: 'bg-amber-500', dotColor: '#f59e0b', badgeBg: 'bg-amber-100 text-amber-900' },
  { id: 'negotiation', label: 'Negotiation', color: 'text-emerald-700', barColor: 'bg-emerald-500', dotColor: '#10b981', badgeBg: 'bg-emerald-100 text-emerald-900' },
  { id: 'won', label: 'Won (Closed)', color: 'text-emerald-900', barColor: 'bg-emerald-600', dotColor: '#059669', badgeBg: 'bg-emerald-200 text-emerald-950' },
  { id: 'lost', label: 'Lost', color: 'text-rose-700', barColor: 'bg-rose-500', dotColor: '#ef4444', badgeBg: 'bg-rose-100 text-rose-800' },
];

interface DealsPipelinePageProps {
  hideHeader?: boolean;
}

export const DealsPipelinePage: React.FC<DealsPipelinePageProps> = ({ hideHeader = false }) => {
  const store = useStore();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [showTasksDrawer, setShowTasksDrawer] = useState(false);
  const [activeActivityLead, setActiveActivityLead] = useState<{ leadId: string; businessName: string } | null>(null);
  const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<Lead | null>(null);
  const [isLeadDrawerOpen, setIsLeadDrawerOpen] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  // Drag and Drop state
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);

  // Form State for New Deal
  const [newTitle, setNewTitle] = useState('');
  const [newLeadId, setNewLeadId] = useState('');
  const [newValue, setNewValue] = useState(1500);
  const [newStage, setNewStage] = useState<DealStage>('interested');
  const [newContactName, setNewContactName] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Form State for New Task
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState(new Date().toISOString().split('T')[0]);
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low'>('medium');

  const loadPipeline = async () => {
    try {
      setLoading(true);
      const [dealsRes, tasksRes] = await Promise.all([
        api.getDeals(),
        api.getTasks('all'),
      ]);
      setDeals(dealsRes.deals);
      setSummary(dealsRes.summary);
      setTasks(tasksRes.tasks);
    } catch (err) {
      console.error('Failed to load pipeline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipeline();
  }, []);

  const filteredDeals = useMemo(() => {
    if (!searchQuery.trim()) return deals;
    const q = searchQuery.toLowerCase();
    return deals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.business_name && d.business_name.toLowerCase().includes(q)) ||
        (d.contact_name && d.contact_name.toLowerCase().includes(q))
    );
  }, [deals, searchQuery]);

  const handleStageMove = async (dealId: string, currentStage: DealStage, direction: 'forward' | 'backward') => {
    const currentIndex = STAGES.findIndex((s) => s.id === currentStage);
    const targetIndex = direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= STAGES.length) return;

    const targetStage = STAGES[targetIndex].id;
    await handleMoveToStage(dealId, targetStage);
  };

  const handleMoveToStage = async (dealId: string, targetStage: DealStage) => {
    try {
      // Optimistic UI update
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage: targetStage } : d))
      );
      await api.updateDeal(dealId, { stage: targetStage });
      loadPipeline();
    } catch (err) {
      console.error('Stage move failed:', err);
      loadPipeline();
    }
  };

  const handleMarkLost = async (dealId: string) => {
    const reason = prompt('Specify reason for lost deal (optional):', 'No budget / timing not right');
    if (reason === null) return;
    try {
      await api.updateDeal(dealId, { stage: 'lost', lostReason: reason });
      loadPipeline();
    } catch (err) {
      console.error('Lost deal update failed:', err);
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!confirm('Are you sure you want to delete this deal?')) return;
    try {
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
      await api.deleteDeal(dealId);
      loadPipeline();
    } catch (err) {
      console.error('Delete deal failed:', err);
      loadPipeline();
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await api.createDeal({
        title: newTitle.trim(),
        leadId: newLeadId || undefined,
        value: Number(newValue) || 0,
        stage: newStage,
        contact_name: newContactName || undefined,
        notes: newNotes || undefined,
      });
      setShowNewDealModal(false);
      setNewTitle('');
      setNewLeadId('');
      setNewValue(1500);
      setNewContactName('');
      setNewNotes('');
      loadPipeline();
    } catch (err) {
      console.error('Create deal failed:', err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      await api.createTask({
        title: newTaskTitle.trim(),
        dueDate: newTaskDue,
        priority: newTaskPriority,
      });
      setNewTaskTitle('');
      const res = await api.getTasks('all');
      setTasks(res.tasks);
    } catch (err) {
      console.error('Create task failed:', err);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await api.toggleTask(taskId);
      const res = await api.getTasks('all');
      setTasks(res.tasks);
    } catch (err) {
      console.error('Toggle task failed:', err);
    }
  };

  const handleDealClick = async (deal: Deal) => {
    if (deal.lead_id) {
      try {
        const fullLead = await api.getLeadById(deal.lead_id);
        if (fullLead) {
          setSelectedLeadForDrawer(fullLead);
          setIsLeadDrawerOpen(true);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch lead by id, building fallback Lead object:', err);
      }
    }

    const fallbackLead: Lead = {
      id: deal.lead_id || deal.id,
      businessName: deal.business_name || deal.title || 'Untitled Business',
      primaryContactName: deal.contact_name,
      email: deal.contact_email,
      phone: deal.contact_phone,
      category: 'Sales Deal',
      status: 'active',
      consentStatus: 'replied',
      outreachStage: deal.stage as any,
      metadata: {
        deal_value: deal.value,
        dealValue: deal.value,
        deal_id: deal.id,
        notes: deal.notes,
        probability: deal.probability,
      },
      createdAt: deal.created_at || new Date().toISOString(),
      updatedAt: deal.updated_at || new Date().toISOString(),
    };

    setSelectedLeadForDrawer(fallbackLead);
    setIsLeadDrawerOpen(true);
  };

  const openActivityFeed = async (leadId: string, businessName: string) => {
    // Find matching deal
    const deal = deals.find((d) => d.lead_id === leadId || d.business_name === businessName);
    if (deal) {
      await handleDealClick(deal);
      return;
    }
    try {
      const fullLead = await api.getLeadById(leadId);
      if (fullLead) {
        setSelectedLeadForDrawer(fullLead);
        setIsLeadDrawerOpen(true);
        return;
      }
    } catch (_) {}
    setActiveActivityLead({ leadId, businessName });
    setLoadingActivities(true);
    try {
      const res = await api.getLeadActivities(leadId);
      setActivities(res.activities);
    } catch (err) {
      console.error('Load activities failed:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !activeActivityLead) return;

    try {
      await api.logLeadActivity({
        leadId: activeActivityLead.leadId,
        activityType: 'note',
        title: 'Sales Consultation Note',
        description: newNoteText.trim(),
      });
      setNewNoteText('');
      const res = await api.getLeadActivities(activeActivityLead.leadId);
      setActivities(res.activities);
    } catch (err) {
      console.error('Add note failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      {hideHeader ? (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2 flex-1">
            <Search size={16} className="text-slate-400 ml-1.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals by company, title, or executive contact..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-xs text-slate-400 hover:text-slate-600 mr-2">
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowTasksDrawer(!showTasksDrawer)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <CheckSquare size={14} className="text-blue-600" />
              <span>Today's Tasks</span>
              {tasks.filter((t) => t.status === 'pending').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                  {tasks.filter((t) => t.status === 'pending').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowNewDealModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>New Deal</span>
            </button>

            <button
              onClick={loadPipeline}
              title="Refresh pipeline"
              className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Page Title & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deals &amp; Sales Pipeline</h1>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/80">
                  Kanban Board
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Visual pipeline management — drag and drop deals across stages from initial audit to closed won.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowTasksDrawer(!showTasksDrawer)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 shadow-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                <CheckSquare size={15} className="text-blue-600" />
                <span>Today's Tasks</span>
                {tasks.filter((t) => t.status === 'pending').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                    {tasks.filter((t) => t.status === 'pending').length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowNewDealModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>New Deal</span>
              </button>

              <button
                onClick={loadPipeline}
                title="Refresh pipeline"
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Metrics Banner */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Active Pipeline
                  </span>
                  <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <TrendingUp size={15} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  ${summary.totalPipelineValue.toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {summary.activeDeals} deals in progress
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Weighted Pipeline
                  </span>
                  <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Scale size={15} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-indigo-600 tracking-tight">
                  ${summary.weightedPipelineValue.toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Adjusted by probability
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Won Revenue
                  </span>
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Trophy size={15} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-emerald-600 tracking-tight">
                  ${summary.wonValue.toLocaleString()}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {summary.wonCount} deals closed won
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Win Rate
                  </span>
                  <div className="h-7 w-7 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                    <PieChart size={15} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-purple-600 tracking-tight">
                  {summary.winRate}%
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {summary.wonCount} won / {summary.wonCount + summary.lostCount} closed
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total Deals
                  </span>
                  <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                    <Briefcase size={15} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {summary.totalDeals}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Across all 7 pipeline stages
                </span>
              </div>
            </div>
          )}

          {/* Filter / Search Bar */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <Search size={16} className="text-slate-400 ml-1.5 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter deals by company, title, or contact person (or drag cards between columns below)..."
              className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-xs text-slate-400 hover:text-slate-600 mr-2">
                Clear
              </button>
            )}
            <span className="text-xs font-semibold text-slate-400 px-2 border-l border-slate-200">
              {filteredDeals.length} deals
            </span>
          </div>
        </>
      )}

      {/* Kanban Board Horizontal Track (Fixed 295px Columns, Zero Text Collision) */}
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start min-h-[640px] scrollbar-thin scrollbar-thumb-slate-300">
        {STAGES.map((col) => {
          const colDeals = filteredDeals.filter((d) => d.stage === col.id);
          const colValue = colDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
          const isDragOver = dragOverStage === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(col.id);
              }}
              onDragLeave={() => {
                if (dragOverStage === col.id) setDragOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const dealId = e.dataTransfer.getData('text/dealId') || draggedDealId;
                if (dealId) {
                  handleMoveToStage(dealId, col.id);
                }
                setDraggedDealId(null);
              }}
              className={`flex flex-col w-[295px] shrink-0 rounded-2xl border transition-all duration-150 ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-300 shadow-md'
                  : 'border-slate-200/90 bg-slate-100/70 shadow-2xs'
              }`}
            >
              {/* Column Top Accent Line */}
              <div className={`h-1.5 w-full rounded-t-2xl ${col.barColor}`} />

              {/* Column Header */}
              <div className="p-3.5 pb-2.5 border-b border-slate-200/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: col.dotColor }}
                    />
                    <h3 className="text-xs font-extrabold text-slate-800 tracking-tight truncate">
                      {col.label}
                    </h3>
                  </div>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white border border-slate-200/90 px-1.5 text-[11px] font-bold text-slate-700 shadow-3xs shrink-0">
                    {colDeals.length}
                  </span>
                </div>

                {/* Stage Total Value */}
                <div className="mt-2 flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-400 font-medium">Stage Value</span>
                  <span className="font-extrabold text-slate-700 font-mono">
                    ${colValue.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Deal Cards Container */}
              <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[640px]">
                {colDeals.length === 0 ? (
                  <div className="h-32 border-2 border-dashed border-slate-200/90 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                    <div className="h-8 w-8 rounded-full bg-slate-200/60 flex items-center justify-center text-slate-400 mb-1.5">
                      <Plus size={14} />
                    </div>
                    <span className="text-xs font-semibold text-slate-500">No deals in {col.label}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Drag card here to advance</span>
                  </div>
                ) : (
                  colDeals.map((deal) => {
                    const isBeingDragged = draggedDealId === deal.id;

                    return (
                      <div
                        key={deal.id}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/dealId', deal.id);
                          setDraggedDealId(deal.id);
                        }}
                        onDragEnd={() => {
                          setDraggedDealId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => handleDealClick(deal)}
                        className={`group bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs hover:shadow-md hover:border-blue-400 hover:ring-2 hover:ring-blue-100 transition-all duration-150 relative cursor-pointer ${
                          isBeingDragged ? 'opacity-40 ring-2 ring-blue-400 shadow-lg' : ''
                        }`}
                        title="Click to view full lead details, activities, and communication"
                      >
                        {/* Drag Handle & Delete */}
                        <div className="flex items-start justify-between gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <GripVertical size={13} className="text-slate-300 group-hover:text-slate-500 shrink-0 cursor-grab active:cursor-grabbing" />
                            {deal.business_name ? (
                              <h4 className="text-xs font-bold text-slate-900 truncate" title={deal.business_name}>
                                {deal.business_name}
                              </h4>
                            ) : (
                              <h4 className="text-xs font-bold text-slate-900 truncate" title={deal.title}>
                                {deal.title}
                              </h4>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDeal(deal.id);
                            }}
                            title="Delete deal"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity rounded cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {/* Title Subtext if distinct from business name */}
                        {deal.business_name && deal.title !== deal.business_name && (
                          <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed mb-2 pl-4">
                            {deal.title}
                          </p>
                        )}

                        {/* Value & Probability Display */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-emerald-600 font-mono tracking-tight">
                            ${Number(deal.value).toLocaleString()}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {deal.probability}% win prob
                          </span>
                        </div>

                        {/* Probability Progress Bar */}
                        <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              deal.probability >= 80
                                ? 'bg-emerald-500'
                                : deal.probability >= 50
                                ? 'bg-blue-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(5, deal.probability))}%` }}
                          />
                        </div>

                        {/* Contact Name & Lost Reason if any */}
                        {deal.contact_name && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-2 truncate">
                            <User size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{deal.contact_name}</span>
                          </div>
                        )}

                        {deal.lost_reason && deal.stage === 'lost' && (
                          <div className="mt-2 p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-700">
                            <strong>Reason:</strong> {deal.lost_reason}
                          </div>
                        )}

                        {/* Actions Toolbar */}
                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDealClick(deal);
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-[10px] cursor-pointer"
                            title="View full lead info, communication timeline & notes"
                          >
                            <Activity size={12} />
                            <span>Lead Info</span>
                          </button>

                          <div className="flex items-center gap-1 ml-auto">
                            {/* Move Backward */}
                            {col.id !== 'interested' && col.id !== 'lost' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStageMove(deal.id, deal.stage, 'backward');
                                }}
                                title="Move stage back"
                                className="p-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer transition-colors"
                              >
                                <ArrowLeft size={11} />
                              </button>
                            )}

                            {/* Move Forward */}
                            {col.id !== 'won' && col.id !== 'lost' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStageMove(deal.id, deal.stage, 'forward');
                                  }}
                                  title="Advance to next stage"
                                  className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer font-bold transition-colors"
                                >
                                  <span>Advance</span>
                                  <ArrowRight size={11} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkLost(deal.id);
                                  }}
                                  title="Mark deal as lost"
                                  className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors"
                                >
                                  <XCircle size={11} />
                                </button>
                              </>
                            )}

                            {/* 1-Click Close Won for Proposal/Negotiation */}
                            {(col.id === 'proposal_sent' || col.id === 'negotiation') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveToStage(deal.id, 'won');
                                }}
                                title="Close deal as Won"
                                className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer transition-colors"
                              >
                                <Check size={11} strokeWidth={3} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slideout Tasks Drawer */}
      {showTasksDrawer && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-50 p-6 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">Sales Tasks &amp; Today View</h2>
            </div>
            <button
              onClick={() => setShowTasksDrawer(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Add Task */}
          <form onSubmit={handleCreateTask} className="my-4 space-y-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add follow-up call, audit review, or reminder..."
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-200 flex-1 bg-white"
              />
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as any)}
                className="text-xs p-2 rounded-lg border border-slate-200 bg-white"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button
                type="submit"
                className="px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Add
              </button>
            </div>
          </form>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {tasks.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8">No tasks scheduled.</p>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-xl border transition-all ${
                    task.status === 'completed'
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={() => handleToggleTask(task.id)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : (
                        <div className="w-4 h-4 rounded border border-slate-300 hover:border-slate-500" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold leading-snug ${
                          task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                            task.priority === 'high'
                              ? 'bg-rose-100 text-rose-700'
                              : task.priority === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 360° Lead Activity & Details Slideout Drawer */}
      <LeadActivityDrawer
        isOpen={isLeadDrawerOpen}
        lead={selectedLeadForDrawer}
        onClose={() => {
          setIsLeadDrawerOpen(false);
          setSelectedLeadForDrawer(null);
        }}
        onDealCreated={fetchPipeline}
        onStageChanged={fetchPipeline}
      />

      {/* New Deal Modal */}
      {showNewDealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Create New Sales Deal</h3>
              <button onClick={() => setShowNewDealModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Deal Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Austin Dental - SEO & Next.js Revamp"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Associate Lead (Optional)</label>
                <select
                  value={newLeadId}
                  onChange={(e) => {
                    setNewLeadId(e.target.value);
                    const sel = store.leads.find((l) => l.id === e.target.value);
                    if (sel) {
                      if (!newTitle) setNewTitle(`${sel.businessName} - Website & Growth Pitch`);
                      if (!newContactName) setNewContactName(sel.businessName);
                    }
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">-- No associated lead --</option>
                  {store.leads.slice(0, 100).map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.businessName} ({lead.category || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Deal Value ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={newValue}
                    onChange={(e) => setNewValue(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Starting Stage</label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value as DealStage)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contact Name (Optional)</label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="e.g. Dr. Robert Chen"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Deal Notes</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Key observations, proposed deliverables, timeline..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewDealModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                >
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
