import { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, Mail, MessageCircle, Instagram, Clock, Send, Save, Layers } from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { ChannelIcon } from '@/components/ChannelIcon';
import type { Store } from '@/store';
import type { Campaign, SequenceStep, Channel } from '@/types';
import { uid } from '@/mockData';

const channelOptions: { value: Channel; label: string; icon: typeof Mail }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'instagram', label: 'Instagram / FB', icon: Instagram },
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
];

interface Props {
  store: Store;
}

export function CampaignBuilderPage({ store }: Props) {
  const [campaignName, setCampaignName] = useState('');
  const [targetCategory, setTargetCategory] = useState<string>('all');
  const [targetChannel, setTargetChannel] = useState<Channel | 'all'>('all');
  const [steps, setSteps] = useState<SequenceStep[]>([
    { id: uid('step'), name: 'Intro', channel: 'email', delayDays: 0, body: '' },
  ]);
  const [saved, setSaved] = useState(false);

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      { id: uid('step'), name: `Step ${prev.length + 1}`, channel: 'email', delayDays: 4, body: '' },
    ]);
    setSaved(false);
  }, []);

  const updateStep = useCallback((id: string, patch: Partial<SequenceStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSaved(false);
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setSaved(false);
  }, []);

  const matchedLeads = useMemo(() => {
    return store.leads.filter((l) => {
      if (l.entityType !== 'lead') return false;
      if (targetCategory !== 'all' && l.category !== targetCategory) return false;
      if (targetChannel !== 'all') {
        if (targetChannel === 'email' && !l.email) return false;
        if (targetChannel === 'whatsapp' && !l.whatsapp) return false;
        if (targetChannel === 'instagram' && !l.instagram && !l.facebook) return false;
      }
      return true;
    });
  }, [store.leads, targetCategory, targetChannel]);

  const handleSave = useCallback(() => {
    if (!campaignName.trim()) return;
    const campaign: Campaign = {
      id: uid('camp'),
      name: campaignName,
      targetCategory,
      targetChannel,
      steps,
      createdAt: new Date().toISOString(),
    };
    store.addCampaign(campaign);
    setSaved(true);
  }, [campaignName, targetCategory, targetChannel, steps, store]);

  const totalDays = steps.reduce((sum, s) => sum + s.delayDays, 0);

  return (
    <div>
      <PageHeader
        title="Campaign Builder"
        subtitle="Design outreach sequences with multi-channel steps and segment targeting."
        actions={
          <button onClick={handleSave} disabled={!campaignName.trim()} className="btn-primary">
            <Save size={16} /> Save Campaign
          </button>
        }
      />

      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 animate-fade-in">
          <Send size={18} className="text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800">Campaign saved — it's now visible in your campaigns list.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h3 className="mb-4 text-sm font-bold text-ink-900">Campaign Details</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Campaign Name</label>
                <input
                  value={campaignName}
                  onChange={(e) => { setCampaignName(e.target.value); setSaved(false); }}
                  placeholder="e.g. Q4 Holiday Outreach"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Target Segment — Category</label>
                  <select value={targetCategory} onChange={(e) => { setTargetCategory(e.target.value); setSaved(false); }} className="input">
                    <option value="all">All Categories</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Target Segment — Channel</label>
                  <select value={targetChannel} onChange={(e) => { setTargetChannel(e.target.value as Channel | 'all'); setSaved(false); }} className="input">
                    <option value="all">Any Channel</option>
                    {channelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-900">Sequence Steps</h3>
              <button onClick={addStep} className="btn-secondary text-xs">
                <Plus size={14} /> Add Step
              </button>
            </div>

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={step.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      <input
                        value={step.name}
                        onChange={(e) => updateStep(step.id, { name: e.target.value })}
                        placeholder="Step name (e.g. Intro Email)"
                        className="rounded border border-transparent bg-transparent px-2 py-0.5 text-sm font-semibold text-ink-900 hover:border-slate-200 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
                      />
                    </div>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(step.id)} className="text-ink-300 hover:text-red-600 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">Channel</label>
                      <div className="flex gap-1.5">
                        {channelOptions.map((opt) => {
                          const Icon = opt.icon;
                          const active = step.channel === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => updateStep(step.id, { channel: opt.value })}
                              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-all ${
                                active
                                  ? opt.value === 'email'
                                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                                    : opt.value === 'whatsapp'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : 'border-violet-300 bg-violet-50 text-violet-700'
                                  : 'border-slate-200 bg-white text-ink-500 hover:bg-slate-50'
                              }`}
                            >
                              <Icon size={14} />
                              {opt.label.split(' ')[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="label">Delay (days after previous step)</label>
                      <div className="relative">
                        <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
                        <input
                          type="number"
                          min={0}
                          value={step.delayDays}
                          onChange={(e) => updateStep(step.id, { delayDays: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="input pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="label">Message Body</label>
                    <textarea
                      value={step.body}
                      onChange={(e) => updateStep(step.id, { body: e.target.value })}
                      placeholder="Write your message here. Use {businessName} or {category} as placeholders..."
                      rows={4}
                      className="textarea"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-ink-900">
              <Layers size={16} className="text-brand-600" />
              Sequence Timeline
            </h3>
            <div className="space-y-0">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-white shrink-0 ${
                      step.channel === 'email' ? 'bg-brand-500' : step.channel === 'whatsapp' ? 'bg-emerald-500' : 'bg-violet-500'
                    }`}>
                      <ChannelIcon channel={step.channel} size={14} className="text-white" />
                    </div>
                    {idx < steps.length - 1 && <div className="w-px h-12 bg-slate-200" />}
                  </div>
                  <div className="pb-6">
                    <p className="text-sm font-semibold text-ink-900">{step.name}</p>
                    <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-1">
                      <Clock size={11} />
                      {step.delayDays === 0 ? 'Day 0 (immediately)' : `+${step.delayDays} days`}
                    </p>
                    <p className="text-xs text-ink-300 mt-0.5 capitalize">{step.channel}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-slate-100 pt-3 text-xs text-ink-500">
              Total sequence duration: <span className="font-bold text-ink-700">{totalDays} days</span>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold text-ink-900">Target Audience Preview</h3>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="blue">{matchedLeads.length} matched leads</Badge>
              {targetCategory !== 'all' && <Badge variant="gray">{targetCategory}</Badge>}
              {targetChannel !== 'all' && <Badge variant="gray">{targetChannel}</Badge>}
            </div>
            {matchedLeads.length === 0 ? (
              <p className="text-sm text-ink-300 py-4 text-center">No leads match this segment.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {matchedLeads.slice(0, 8).map((lead) => (
                  <div key={lead.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-200 text-xs font-bold text-ink-500">
                      {lead.businessName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink-700 truncate">{lead.businessName}</p>
                      <p className="text-xs text-ink-300 truncate">{lead.category}</p>
                    </div>
                    <div className="flex gap-1">
                      {lead.email && <Mail size={12} className="text-brand-500" />}
                      {lead.whatsapp && <MessageCircle size={12} className="text-emerald-500" />}
                      {(lead.instagram || lead.facebook) && <Instagram size={12} className="text-violet-500" />}
                    </div>
                  </div>
                ))}
                {matchedLeads.length > 8 && (
                  <p className="text-xs text-ink-300 text-center pt-1">+ {matchedLeads.length - 8} more</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {store.campaigns.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Saved Campaigns</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {store.campaigns.map((camp) => (
              <div key={camp.id} className="card p-4">
                <p className="text-sm font-bold text-ink-900">{camp.name}</p>
                <p className="text-xs text-ink-500 mt-1">
                  {camp.steps.length} steps · {camp.targetCategory === 'all' ? 'All categories' : camp.targetCategory}
                  {camp.targetChannel !== 'all' && ` · ${camp.targetChannel}`}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  {camp.steps.map((s, i) => (
                    <span key={s.id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-ink-300 text-xs">→</span>}
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${
                        s.channel === 'email' ? 'bg-brand-500' : s.channel === 'whatsapp' ? 'bg-emerald-500' : 'bg-violet-500'
                      }`}>
                        <ChannelIcon channel={s.channel} size={11} className="text-white" />
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
