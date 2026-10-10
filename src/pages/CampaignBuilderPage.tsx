import { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Mail,
  MessageCircle,
  Instagram,
  Linkedin,
  Clock,
  Save,
  Layers,
  Sparkles,
  Loader2,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { ChannelIcon } from '@/components/ChannelIcon';
import type { Store } from '@/store';
import type { Campaign, SequenceStep, Channel } from '@/types';
import { uid } from '@/mockData';
import { api } from '@/services/api';

const channelOptions: {
  value: Channel;
  label: string;
  icon: any;
  activeColor: string;
  badgeColor: string;
  hint: string;
}[] = [
  {
    value: 'email',
    label: 'Email',
    icon: Mail,
    activeColor: 'border-blue-500 bg-blue-50/90 text-blue-800 ring-2 ring-blue-200 shadow-xs',
    badgeColor: 'bg-blue-100 text-blue-800',
    hint: 'Rotated Google Workspace & SMTP inboxes (ideal for long-form context)',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    activeColor: 'border-emerald-500 bg-emerald-50/90 text-emerald-800 ring-2 ring-emerald-200 shadow-xs',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    hint: 'Instant mobile messaging for verified numbers (68% 15-min open rate)',
  },
  {
    value: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    activeColor: 'border-pink-500 bg-pink-50/90 text-pink-800 ring-2 ring-pink-200 shadow-xs',
    badgeColor: 'bg-pink-100 text-pink-800',
    hint: 'Direct visual DM hook to active Instagram profiles',
  },
  {
    value: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    activeColor: 'border-sky-500 bg-sky-50/90 text-sky-800 ring-2 ring-sky-200 shadow-xs',
    badgeColor: 'bg-sky-100 text-sky-800',
    hint: 'Executive profile touchpoint with prospect engagement',
  },
];

const categoryOptions = [
  'Food & Beverage',
  'Fitness & Wellness',
  'Retail',
  'Home Services',
  'Healthcare',
  'Real Estate',
  'Marketing & Design',
  'Auto Services',
  'Software & SaaS',
  'Consulting & Legal',
];

const mergeVariables = [
  { tag: '{{business_name}}', label: 'Business Name', example: 'Nova Meridian Health' },
  { tag: '{{category}}', label: 'Category', example: 'Healthcare' },
  { tag: '{{first_name}}', label: 'First Name', example: 'Elena' },
  { tag: '{{phone}}', label: 'Phone', example: '+61412345678' },
  { tag: '{{city}}', label: 'City', example: 'Sydney' },
];

interface Props {
  store: Store;
}

export function CampaignBuilderPage({ store }: Props) {
  const [campaignName, setCampaignName] = useState('');
  const [targetCategory, setTargetCategory] = useState<string>('all');
  const [targetChannel, setTargetChannel] = useState<Channel | 'all'>('all');
  const [steps, setSteps] = useState<SequenceStep[]>([
    { id: uid('step'), name: 'Intro Outreach', channel: 'email', delayDays: 0, body: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedNotification, setLoadedNotification] = useState<string | null>(null);
  const [aiGeneratingId, setAiGeneratingId] = useState<string | null>(null);

  // Database Campaigns Filter State
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignChannelFilter, setCampaignChannelFilter] = useState<string>('all');
  const [campaignCategoryFilter, setCampaignCategoryFilter] = useState<string>('all');

  const filteredCampaigns = useMemo(() => {
    return store.campaigns.filter((c) => {
      if (campaignChannelFilter !== 'all' && c.targetChannel !== campaignChannelFilter) return false;
      if (campaignCategoryFilter !== 'all' && c.targetCategory !== campaignCategoryFilter) return false;
      if (campaignSearch.trim()) {
        const q = campaignSearch.toLowerCase();
        return c.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [store.campaigns, campaignChannelFilter, campaignCategoryFilter, campaignSearch]);

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        id: uid('step'),
        name: `Follow-up Touchpoint ${prev.length + 1}`,
        channel: 'whatsapp',
        delayDays: 3,
        body: '',
      },
    ]);
    setSaved(false);
  }, []);

  const updateStep = useCallback((id: string, patch: Partial<SequenceStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSaved(false);
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
    setSaved(false);
  }, []);

  const moveStep = useCallback((index: number, direction: 'up' | 'down') => {
    setSteps((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
    setSaved(false);
  }, []);

  const insertVariableIntoStep = useCallback((stepId: string, tag: string) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s;
        const currentBody = s.body || '';
        return {
          ...s,
          body: currentBody ? `${currentBody} ${tag}` : tag,
        };
      })
    );
    setSaved(false);
  }, []);

  const matchedLeads = useMemo(() => {
    return store.leads.filter((l) => {
      if (l.deletedAt) return false;
      if (l.entityType !== 'lead') return false;
      if (targetCategory !== 'all' && l.category !== targetCategory) return false;
      if (targetChannel !== 'all') {
        if (targetChannel === 'email' && !l.email) return false;
        if (targetChannel === 'whatsapp' && !l.whatsapp && !l.phone) return false;
        if (targetChannel === 'instagram' && (!l.instagram || !l.instagram.trim())) return false;
        if (targetChannel === 'linkedin' && (!l.linkedin || !l.linkedin.trim())) return false;
      }
      return true;
    });
  }, [store.leads, targetCategory, targetChannel]);

  const handleSave = useCallback(async () => {
    if (!campaignName.trim()) return;

    try {
      setIsSaving(true);
      const campaign: Campaign = {
        id: uid('camp'),
        name: campaignName.trim(),
        targetCategory,
        targetChannel,
        steps,
        createdAt: new Date().toISOString(),
      };

      await store.addCampaign(campaign);
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      console.error('Failed to save campaign:', err);
      alert('Failed to save campaign. Check console logs.');
    } finally {
      setIsSaving(false);
    }
  }, [campaignName, targetCategory, targetChannel, steps, store]);

  // Load existing campaign into editor
  const handleLoadCampaign = useCallback((camp: Campaign) => {
    setCampaignName(camp.name);
    setTargetCategory(camp.targetCategory || 'all');
    setTargetChannel(camp.targetChannel || 'all');
    if (Array.isArray(camp.steps) && camp.steps.length > 0) {
      setSteps(
        camp.steps.map((s, idx) => ({
          id: s.id || uid('step'),
          name: s.name || `Step ${idx + 1}`,
          channel: s.channel || 'email',
          delayDays: s.delayDays ?? (idx === 0 ? 0 : 3),
          body: s.body || '',
        }))
      );
    }
    setSaved(false);
    setLoadedNotification(`Loaded "${camp.name}" into campaign sequence editor.`);
    setTimeout(() => setLoadedNotification(null), 4000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Delete saved campaign
  const handleDeleteCampaign = useCallback(
    async (e: React.MouseEvent, id: string, name: string) => {
      e.stopPropagation();
      if (!window.confirm(`Are you sure you want to delete campaign template "${name}" from PostgreSQL?`)) {
        return;
      }
      try {
        await store.deleteCampaign(id);
      } catch (err) {
        console.error('Failed to delete campaign:', err);
      }
    },
    [store]
  );

  // AI draft / improvise generator for sequence steps
  const handleGenerateAi = useCallback(
    async (stepId: string, channel: Channel, currentBody?: string) => {
      try {
        setAiGeneratingId(stepId);
        const trimmed = (currentBody || '').trim();
        if (trimmed) {
          // User provided rough thoughts/words -> ask AI to improvise!
          const res = await api.improvise({
            text: trimmed,
            channel,
            category: targetCategory === 'all' ? 'Local Business' : targetCategory,
            businessName: '{{business_name}}',
          });
          updateStep(stepId, { body: res.improvedText });
        } else {
          // Empty step -> generate realistic initial draft
          const res = await api.generateAiDraft({
            businessName: '{{business_name}}',
            category: targetCategory === 'all' ? 'Local Business' : targetCategory,
            channel,
            intent: 'Complimentary local SEO & Google Business Profile visibility audit',
          });
          updateStep(stepId, { body: res.draft });
        }
      } catch (err) {
        console.error('AI draft generation failed:', err);
      } finally {
        setAiGeneratingId(null);
      }
    },
    [targetCategory, updateStep]
  );

  const totalDays = steps.reduce((sum, s) => sum + s.delayDays, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Multi-Channel Campaign Builder"
        subtitle="Design high-converting omni-channel drip sequences (Email, WhatsApp, FB, IG, LinkedIn) saved directly to PostgreSQL."
        actions={
          <div className="flex items-center gap-3">
            {steps.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-ink-600 border border-slate-200">
                <Layers size={14} className="text-brand-600" />
                <span>{steps.length} Steps · {totalDays}d Duration</span>
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!campaignName.trim() || isSaving}
              className="btn-primary shadow-sm flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving to DB...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Campaign</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Notifications */}
      {saved && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 shadow-xs animate-fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-900">
            Campaign successfully saved to PostgreSQL database — sequence registered and ready for dispatch.
          </p>
        </div>
      )}

      {loadedNotification && (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50/90 px-4 py-3 shadow-xs animate-fade-in">
          <ArrowUpRight size={18} className="text-brand-600 shrink-0" />
          <p className="text-sm font-semibold text-brand-900">{loadedNotification}</p>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 items-start">
        {/* Left Column: Form & Steps Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Campaign Details */}
          <div className="card p-6 shadow-xs border-slate-200">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800">
                  1. Sequence Target &amp; Segmentation
                </h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Define your campaign name and audience segmentation rules.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600">
                Step 1 of 2
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Sequence / Campaign Name</label>
                <input
                  value={campaignName}
                  onChange={(e) => {
                    setCampaignName(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="e.g. Q4 Healthcare Clinic Patient Growth Sequence"
                  className="input font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Target Segment — Category</label>
                  <select
                    value={targetCategory}
                    onChange={(e) => {
                      setTargetCategory(e.target.value);
                      setSaved(false);
                    }}
                    className="input font-medium bg-white"
                  >
                    <option value="all">All Categories (Universal)</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Primary Preferred Channel</label>
                  <select
                    value={targetChannel}
                    onChange={(e) => {
                      setTargetChannel(e.target.value as Channel | 'all');
                      setSaved(false);
                    }}
                    className="input font-medium bg-white"
                  >
                    <option value="all">Any Channel (Omni-Channel Fallback)</option>
                    {channelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Sequence Steps Builder */}
          <div className="card p-6 shadow-xs border-slate-200">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink-800">
                  2. Sequence Drip Steps ({steps.length})
                </h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  Configure the touchpoint channel, delay timing, and personalized copy template.
                </p>
              </div>
              <button
                type="button"
                onClick={addStep}
                className="btn-secondary text-xs flex items-center gap-1.5 border-brand-300 text-brand-700 hover:bg-brand-50"
              >
                <Plus size={15} />
                <span>Add Next Step</span>
              </button>
            </div>

            <div className="space-y-6">
              {steps.map((step, idx) => {
                const activeChannelMeta = channelOptions.find((c) => c.value === step.channel);
                const isFirstStep = idx === 0;

                return (
                  <div
                    key={step.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition-all hover:border-slate-300 hover:shadow-sm space-y-4"
                  >
                    {/* Step Top Bar: Number, Name, Reorder, AI, Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-600 text-xs font-black text-white shadow-2xs">
                          {idx + 1}
                        </span>
                        <input
                          value={step.name}
                          onChange={(e) => updateStep(step.id, { name: e.target.value })}
                          placeholder="Step Name (e.g. Value Prop Email)"
                          className="rounded-lg border border-transparent bg-transparent px-2.5 py-1 text-sm font-bold text-ink-900 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 flex-1 transition-all"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Step Reordering */}
                        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveStep(idx, 'up')}
                            className="p-1 text-ink-400 hover:text-ink-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move step up"
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === steps.length - 1}
                            onClick={() => moveStep(idx, 'down')}
                            className="p-1 text-ink-400 hover:text-ink-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move step down"
                          >
                            <ChevronDown size={15} />
                          </button>
                        </div>

                        {/* AI Draft / Improvise Generator */}
                        <button
                          type="button"
                          onClick={() => handleGenerateAi(step.id, step.channel, step.body)}
                          disabled={aiGeneratingId === step.id}
                          className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/70 px-2.5 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer"
                          title={step.body.trim() ? "Improvise and polish your rough thoughts with AI" : "Generate tailored outreach pitch with AI engine"}
                        >
                          {aiGeneratingId === step.id ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-brand-600" />
                              <span>{step.body.trim() ? 'Improvising...' : 'Drafting...'}</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={13} className="text-brand-600" />
                              <span>{step.body.trim() ? '✨ Improvise with AI' : '✨ AI Draft'}</span>
                            </>
                          )}
                        </button>

                        {/* Remove Step */}
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStep(step.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                            title="Delete this step"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Channel Selection (Full Width — No More Cramped 50% Grid!) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="label mb-0">Outreach Channel for Step {idx + 1}</label>
                        <span className="text-[11px] font-medium text-ink-500">
                          {activeChannelMeta?.hint}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {channelOptions.map((opt) => {
                          const Icon = opt.icon;
                          const active = step.channel === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateStep(step.id, { channel: opt.value })}
                              className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition-all ${
                                active
                                  ? opt.activeColor
                                  : 'border-slate-200 bg-white text-ink-600 hover:bg-slate-100/80 hover:text-ink-800'
                              }`}
                            >
                              <Icon size={16} />
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dispatch Timing Bar */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-ink-900">
                            <Clock size={14} className="text-brand-600" />
                            <span>Step Timing &amp; Pacing</span>
                          </div>
                          <p className="text-[11px] text-ink-400 mt-0.5">
                            {isFirstStep
                              ? 'Initial Step: Launches immediately upon lead enrollment (Day 0)'
                              : `Scheduled to send ${step.delayDays} day(s) after Step ${idx}`}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Quick Presets */}
                          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                            {[
                              { label: 'Immediate', days: 0 },
                              { label: '+1d', days: 1 },
                              { label: '+2d', days: 2 },
                              { label: '+4d', days: 4 },
                              { label: '+7d', days: 7 },
                            ].map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => updateStep(step.id, { delayDays: preset.days })}
                                className={`rounded-md px-2 py-1 text-xs font-semibold transition-all ${
                                  step.delayDays === preset.days
                                    ? 'bg-white text-brand-700 shadow-xs'
                                    : 'text-ink-500 hover:text-ink-800'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>

                          {/* Custom Days Input */}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={step.delayDays}
                              onChange={(e) =>
                                updateStep(step.id, {
                                  delayDays: Math.max(0, parseInt(e.target.value) || 0),
                                })
                              }
                              className="input w-16 py-1 px-2 text-center text-xs font-bold"
                            />
                            <span className="text-xs text-ink-500 font-medium">days</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Message Body Template & Variable Chips */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <label className="label mb-0">Message Body Template</label>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] uppercase font-bold text-ink-400 mr-1">
                            Insert Merge Tag:
                          </span>
                          {mergeVariables.map((v) => (
                            <button
                              key={v.tag}
                              type="button"
                              onClick={() => insertVariableIntoStep(step.id, v.tag)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-mono font-medium text-ink-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition-colors shadow-2xs"
                              title={`Click to insert ${v.label} (e.g. ${v.example})`}
                            >
                              {v.tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Realistic Starter Ideas for Improvisation */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <span className="text-[10px] uppercase font-bold text-ink-400 mr-1">
                          Rough ideas to improvise:
                        </span>
                        {[
                          { label: '🔍 Free SEO Audit', text: 'free audit of website, checking local ranking, quick chat' },
                          { label: '📍 Google Maps Gap', text: 'noticed Google Business Profile ranking gap in local map pack, 3 min review' },
                          { label: '⚡ Mobile & Speed Check', text: 'checked mobile page speed, quick recommendations to fix ranking loss' },
                          { label: '💬 Inquiry Follow-up', text: 'following up on local search visibility, checking if you had time to review' },
                        ].map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => {
                              updateStep(step.id, { body: chip.text });
                              handleGenerateAi(step.id, step.channel, chip.text);
                            }}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition-colors shadow-2xs"
                            title={`Click to populate and improvise: "${chip.text}"`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={step.body}
                        onChange={(e) => updateStep(step.id, { body: e.target.value })}
                        placeholder="Write rough bullet points or thoughts here (e.g. 'free audit of website, checking local ranking, quick chat') and click '✨ Improvise with AI' above..."
                        rows={4}
                        className="textarea font-normal text-sm"
                      />

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
                        <span>
                          Word count:{' '}
                          <strong className="text-ink-700">
                            {step.body.split(/\s+/).filter(Boolean).length}
                          </strong>{' '}
                          words
                        </span>
                        <span>
                          {step.channel === 'whatsapp' &&
                            '💡 Tip: Keep WhatsApp under 45 words for highest response rates'}
                          {step.channel === 'email' &&
                            '💡 Tip: Keep Cold Email under 90 words with a clear, low-friction question'}
                          {step.channel === 'instagram' &&
                            '💡 Tip: Casual, complimentary profile DM under 50 words'}
                          {step.channel === 'linkedin' &&
                            '💡 Tip: Thought-leadership observation + brief conversational invite'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Add Step Action */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-center">
              <button
                type="button"
                onClick={addStep}
                className="btn-secondary w-full sm:w-auto text-xs flex items-center justify-center gap-2 py-2 px-6 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/50"
              >
                <Plus size={15} />
                <span>Add Step {steps.length + 1} to Sequence</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Sticky Sequence Timeline & Audience Preview */}
        <div className="lg:sticky lg:top-6 self-start space-y-6">
          {/* Card 1: Sequence Timeline */}
          <div className="card p-5 shadow-xs border-slate-200">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <Layers size={16} className="text-brand-600" />
                <span>Sequence Timeline</span>
              </h3>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800">
                {steps.length} {steps.length === 1 ? 'Step' : 'Steps'}
              </span>
            </div>

            <div className="space-y-0">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex gap-3">
                  {/* Icon Node & Dynamic Connector Line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-white shrink-0 shadow-2xs ${
                        step.channel === 'email'
                          ? 'bg-blue-600'
                          : step.channel === 'whatsapp'
                          ? 'bg-emerald-600'
                          : step.channel === 'instagram'
                          ? 'bg-pink-600'
                          : 'bg-sky-600'
                      }`}
                    >
                      <ChannelIcon channel={step.channel} size={15} className="text-white" />
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="flex-1 w-0.5 bg-slate-200 min-h-7 my-1" />
                    )}
                  </div>

                  {/* Step Description */}
                  <div className="pb-5 min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900 truncate">
                      {step.name || `Step ${idx + 1}`}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-1 font-medium">
                      <Clock size={11} className="text-ink-400" />
                      <span>
                        {step.delayDays === 0
                          ? 'Day 0 (Immediately)'
                          : `+${step.delayDays} day${step.delayDays > 1 ? 's' : ''}`}
                      </span>
                    </p>
                    <span className="inline-block mt-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      {step.channel}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
              <span className="text-ink-500">Total Duration:</span>
              <span className="font-extrabold text-ink-800 text-sm">{totalDays} days</span>
            </div>
          </div>

          {/* Card 2: Target Audience Preview */}
          <div className="card p-5 shadow-xs border-slate-200">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-ink-900">Target Audience Preview</h3>
              <Badge variant="blue">{matchedLeads.length} leads</Badge>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {targetCategory !== 'all' ? (
                <Badge variant="gray">{targetCategory}</Badge>
              ) : (
                <Badge variant="gray">All Categories</Badge>
              )}
              {targetChannel !== 'all' && <Badge variant="blue">{targetChannel}</Badge>}
            </div>

            {matchedLeads.length === 0 ? (
              <p className="text-xs text-ink-400 py-6 text-center bg-slate-50 rounded-xl border border-slate-100">
                No active CRM leads match this category / channel segment.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {matchedLeads.slice(0, 10).map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-50/80 px-3 py-2 border border-slate-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-ink-600 shrink-0">
                        {lead.businessName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-800 truncate">
                          {lead.businessName}
                        </p>
                        <p className="text-[11px] text-ink-400 truncate">{lead.category}</p>
                      </div>
                    </div>

                    {/* All 5 Channel Indicators */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {lead.email && (
                        <span title="Email Ready" className="inline-flex">
                          <Mail size={12} className="text-blue-500" />
                        </span>
                      )}
                      {lead.whatsapp && (
                        <span title="WhatsApp Ready" className="inline-flex">
                          <MessageCircle size={12} className="text-emerald-500" />
                        </span>
                      )}
                      {lead.instagram && (
                        <span title="Instagram Ready" className="inline-flex">
                          <Instagram size={12} className="text-pink-500" />
                        </span>
                      )}
                      {lead.linkedin && (
                        <span title="LinkedIn Ready" className="inline-flex">
                          <Linkedin size={12} className="text-sky-500" />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {matchedLeads.length > 10 && (
                  <p className="text-xs text-ink-400 text-center pt-2 font-medium">
                    + {matchedLeads.length - 10} more leads enrolled
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card 3: Database Campaigns Section */}
      <div className="card p-6 shadow-xs border-slate-200 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-ink-900">
              Database Campaigns ({filteredCampaigns.length} of {store.campaigns.length})
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Reusable multi-channel sequences stored permanently in PostgreSQL. Click any campaign to load into editor.
            </p>
          </div>

          {/* Filters Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search sequences..."
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className="input pl-7 pr-3 py-1.5 text-xs w-44 bg-white border-slate-200"
              />
            </div>

            <select
              value={campaignChannelFilter}
              onChange={(e) => setCampaignChannelFilter(e.target.value)}
              className="input py-1.5 px-2.5 text-xs w-auto bg-white border-slate-200 font-medium"
            >
              <option value="all">All Channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
            </select>

            <select
              value={campaignCategoryFilter}
              onChange={(e) => setCampaignCategoryFilter(e.target.value)}
              className="input py-1.5 px-2.5 text-xs w-auto bg-white border-slate-200 font-medium"
            >
              <option value="all">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="py-10 text-center bg-slate-50/70 rounded-2xl border border-slate-200/70">
            <Layers size={24} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-ink-700">No campaigns match your filters</p>
            <p className="text-xs text-ink-400 mt-0.5">
              Adjust search query or save your current sequence above as a new campaign template.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCampaigns.map((camp) => (
              <div
                key={camp.id}
                onClick={() => handleLoadCampaign(camp)}
                className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-brand-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-ink-900 group-hover:text-brand-600 transition-colors">
                      {camp.name}
                    </h4>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCampaign(e, camp.id, camp.name)}
                      className="text-slate-300 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                      title="Delete saved campaign"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <p className="text-xs text-ink-500 mt-1 font-medium">
                    {camp.steps.length} steps ·{' '}
                    {camp.targetCategory === 'all' ? 'All categories' : camp.targetCategory}
                    {camp.targetChannel !== 'all' && ` · ${camp.targetChannel}`}
                  </p>

                  {/* Step Flow Nodes */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    {camp.steps.map((s, i) => (
                      <span key={s.id || i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-slate-300 text-xs">→</span>}
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-white shadow-2xs ${
                            s.channel === 'email'
                              ? 'bg-blue-600'
                              : s.channel === 'whatsapp'
                              ? 'bg-emerald-600'
                              : s.channel === 'instagram'
                              ? 'bg-pink-600'
                              : 'bg-sky-600'
                          }`}
                        >
                          <ChannelIcon channel={s.channel} size={11} className="text-white" />
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-brand-600 font-semibold group-hover:text-brand-700">
                  <span>Load into Editor</span>
                  <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
