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
} from 'lucide-react';
import { api } from '@/services/api';
import type { Deal, DealStage, PipelineSummary, CrmTask, LeadActivity } from '@/types';
import { useStore } from '@/store';

const STAGES: Array<{ id: DealStage; label: string; color: string; bg: string; borderColor: string }> = [
  { id: 'interested', label: 'Interested', color: 'text-blue-700', bg: 'bg-blue-50/70', borderColor: 'border-blue-200' },
  { id: 'audit_sent', label: 'Audit Sent', color: 'text-indigo-700', bg: 'bg-indigo-50/70', borderColor: 'border-indigo-200' },
  { id: 'meeting_booked', label: 'Meeting Booked', color: 'text-purple-700', bg: 'bg-purple-50/70', borderColor: 'border-purple-200' },
  { id: 'proposal_sent', label: 'Proposal Sent', color: 'text-amber-700', bg: 'bg-amber-50/70', borderColor: 'border-amber-200' },
  { id: 'negotiation', label: 'Negotiation', color: 'text-emerald-700', bg: 'bg-emerald-50/70', borderColor: 'border-emerald-200' },
  { id: 'won', label: 'Won (Closed)', color: 'text-emerald-800', bg: 'bg-emerald-100/60', borderColor: 'border-emerald-300' },
  { id: 'lost', label: 'Lost', color: 'text-rose-700', bg: 'bg-rose-50/70', borderColor: 'border-rose-200' },
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
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

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
    try {
      // Optimistic UI update
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage: targetStage } : d))
      );
      await api.updateDeal(dealId, { stage: targetStage });
      loadPipeline();
    } catch (err) {
      console.error('Stage update failed:', err);
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
        due_date: new Date(newTaskDue).toISOString(),
        priority: newTaskPriority,
      });
      setNewTaskTitle('');
      const tasksRes = await api.getTasks('all');
      setTasks(tasksRes.tasks);
    } catch (err) {
      console.error('Create task failed:', err);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await api.toggleTask(taskId);
      const tasksRes = await api.getTasks('all');
      setTasks(tasksRes.tasks);
    } catch (err) {
      console.error('Toggle task failed:', err);
    }
  };

  const openActivityFeed = async (leadId: string, businessName: string) => {
    setActiveActivityLead({ leadId, businessName });
    try {
      setLoadingActivities(true);
      const res = await api.getLeadActivities(leadId);
      setActivities(res.activities);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !activeActivityLead) return;

    try {
      await api.logActivity({
        leadId: activeActivityLead.leadId,
        title: 'Sales Note Added',
        description: newNoteText.trim(),
        activityType: 'note_added',
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
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deals &amp; Sales Pipeline</h1>
              <p className="text-xs text-slate-500 mt-1">
                Track interested replies through discovery audits, strategy calls, proposals, and closed deals.
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
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Active Pipeline
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-slate-900">
                    ${summary.totalPipelineValue.toLocaleString()}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {summary.activeDeals} deals in progress
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Weighted Pipeline
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-blue-600">
                    ${summary.weightedPipelineValue.toLocaleString()}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Adjusted by probability
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Won Revenue
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-emerald-600">
                    ${summary.wonValue.toLocaleString()}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {summary.wonCount} deals closed won
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Win Rate
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-purple-600">
                    {summary.winRate}%
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {summary.wonCount} won / {summary.wonCount + summary.lostCount} closed
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Total Deals
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold text-slate-900">
                    {summary.totalDeals}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Across all stages
                </span>
              </div>
            </div>
          )}

          {/* Filter / Search Bar */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <Search size={16} className="text-slate-400 ml-1.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter deals by title, business name, or contact person..."
              className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-xs text-slate-400 hover:text-slate-600 mr-2">
                Clear
              </button>
            )}
          </div>
        </>
      )}

      {/* Kanban Board Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3.5 overflow-x-auto pb-4">
        {STAGES.map((col) => {
          const colDeals = filteredDeals.filter((d) => d.stage === col.id);
          const colValue = colDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

          return (
            <div
              key={col.id}
              className={`flex flex-col rounded-2xl border ${col.borderColor} ${col.bg} p-3 min-w-[240px] shadow-2xs`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold ${col.color}`}>{col.label}</span>
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-slate-600 shadow-2xs">
                    {colDeals.length}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-600">
                  ${colValue.toLocaleString()}
                </span>
              </div>

              {/* Deal Cards Container */}
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[620px] pr-0.5">
                {colDeals.length === 0 ? (
                  <div className="h-28 border border-dashed border-slate-300/80 rounded-xl flex items-center justify-center text-[11px] text-slate-400 italic">
                    No deals in {col.label}
                  </div>
                ) : (
                  colDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="group bg-white rounded-xl border border-slate-200/90 p-3 shadow-xs hover:shadow-md hover:border-blue-300 transition-all duration-150 relative"
                    >
                      {/* Deal Header */}
                      <div className="flex items-start justify-between gap-1.5 mb-1.5">
                        <h4 className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">
                          {deal.title}
                        </h4>
                        <button
                          onClick={() => handleDeleteDeal(deal.id)}
                          title="Delete deal"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Business Association */}
                      {deal.business_name && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-600 mb-1.5 truncate">
                          <Building2 size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">{deal.business_name}</span>
                        </div>
                      )}

                      {/* Value & Probability Badge */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                        <span className="font-extrabold text-emerald-600">
                          ${Number(deal.value).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {deal.probability}% win prob
                        </span>
                      </div>

                      {/* Contact & Lost Reason if any */}
                      {deal.lost_reason && deal.stage === 'lost' && (
                        <div className="mt-1.5 p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-700">
                          <strong>Lost:</strong> {deal.lost_reason}
                        </div>
                      )}

                      {/* Actions Toolbar */}
                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                        {deal.lead_id && (
                          <button
                            onClick={() => openActivityFeed(deal.lead_id!, deal.business_name || deal.title)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-[10px] cursor-pointer"
                            title="View lead communication timeline & notes"
                          >
                            <Activity size={12} />
                            <span>Timeline</span>
                          </button>
                        )}

                        <div className="flex items-center gap-1 ml-auto">
                          {col.id !== 'interested' && col.id !== 'lost' && (
                            <button
                              onClick={() => handleStageMove(deal.id, deal.stage, 'backward')}
                              title="Move stage back"
                              className="p-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer"
                            >
                              <ArrowLeft size={11} />
                            </button>
                          )}

                          {col.id !== 'won' && col.id !== 'lost' && (
                            <>
                              <button
                                onClick={() => handleStageMove(deal.id, deal.stage, 'forward')}
                                title="Advance to next stage"
                                className="p-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer font-bold"
                              >
                                <ArrowRight size={11} />
                              </button>
                              <button
                                onClick={() => handleMarkLost(deal.id)}
                                title="Mark deal as lost"
                                className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                              >
                                <XCircle size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Slideout Tasks Drawer */}
      {showTasksDrawer && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-50 p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">Sales Tasks &amp; Today View</h2>
            </div>
            <button
              onClick={() => setShowTasksDrawer(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
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
                className="px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </form>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto space-y-2.5">
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

      {/* Activity Timeline Slideout Drawer */}
      {activeActivityLead && (
        <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-slate-200 shadow-2xl z-50 p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Unified Activity Timeline</h2>
              <p className="text-xs text-slate-500 truncate max-w-[320px]">{activeActivityLead.businessName}</p>
            </div>
            <button
              onClick={() => setActiveActivityLead(null)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>

          {/* Add Note Form */}
          <form onSubmit={handleAddNote} className="my-4 space-y-2">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Add call notes, meeting takeaways, or follow-up insights..."
              rows={2}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Log Note
              </button>
            </div>
          </form>

          {/* Timeline Stream */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {loadingActivities ? (
              <div className="text-center py-8 text-xs text-slate-400">Loading timeline...</div>
            ) : activities.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8">No activities logged yet.</p>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="relative pl-6 pb-2 border-l border-slate-200 last:border-0">
                  <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white" />
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-800">{act.title}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(act.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {act.description && (
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {act.description}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* New Deal Modal */}
      {showNewDealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Create New Sales Deal</h3>
              <button onClick={() => setShowNewDealModal(false)} className="text-slate-400 hover:text-slate-600">
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
                    value={newValue}
                    onChange={(e) => setNewValue(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Initial Stage</label>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person Name</label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="e.g. Dr. John Doe"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Deal Notes</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Notes about specific client needs, budget, or timeline..."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewDealModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
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
