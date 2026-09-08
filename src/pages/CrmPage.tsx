import { useState, useMemo, useCallback } from 'react';
import { Mail, MessageCircle, Instagram, UserCheck, Search, ArrowLeft, Send, Filter } from 'lucide-react';
import { PageHeader } from '@/components/Sidebar';
import { Badge } from '@/components/Badge';
import { ChannelIcon } from '@/components/ChannelIcon';
import { Modal } from '@/components/Modal';
import type { Store } from '@/store';
import type { Lead, ConsentStatus, Channel } from '@/types';
import { channelLabels, consentLabels } from '@/types';
import { uid } from '@/mockData';

interface Props {
  store: Store;
}

type EntityTypeFilter = 'all' | 'lead' | 'client';
type ChannelFilter = 'all' | Channel;

export function CrmPage({ store }: Props) {
  const [entityFilter, setEntityFilter] = useState<EntityTypeFilter>('all');
  const [consentFilter, setConsentFilter] = useState<ConsentStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyChannel, setReplyChannel] = useState<Channel>('email');
  const [converted, setConverted] = useState(false);

  const filtered = useMemo(() => {
    return store.leads.filter((l) => {
      if (entityFilter !== 'all' && l.entityType !== entityFilter) return false;
      if (consentFilter !== 'all' && l.consentStatus !== consentFilter) return false;
      if (channelFilter !== 'all') {
        if (channelFilter === 'email' && !l.email) return false;
        if (channelFilter === 'whatsapp' && !l.whatsapp) return false;
        if (channelFilter === 'instagram' && !l.instagram && !l.facebook) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.businessName.toLowerCase().includes(q) &&
          !l.category.toLowerCase().includes(q) &&
          !l.email.toLowerCase().includes(q) &&
          !l.phone.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [store.leads, entityFilter, consentFilter, channelFilter, search]);

  const leadConversations = useMemo(() => {
    if (!selectedLead) return [];
    return store.conversationsByLead(selectedLead.id);
  }, [selectedLead, store]);

  const handleOpenLead = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setConverted(false);
    setReplyText('');
    setReplyChannel(lead.email ? 'email' : lead.whatsapp ? 'whatsapp' : 'instagram');
  }, []);

  const handleSendReply = useCallback(() => {
    if (!selectedLead || !replyText.trim()) return;
    store.addConversation({
      id: uid('msg'),
      leadId: selectedLead.id,
      channel: replyChannel,
      direction: 'outbound',
      text: replyText,
      timestamp: new Date().toISOString(),
      status: replyChannel === 'instagram' ? 'draft' : 'sent',
    });
    setReplyText('');
  }, [selectedLead, replyText, replyChannel, store]);

  const handleConvert = useCallback(() => {
    if (!selectedLead) return;
    store.convertToClient(selectedLead.id);
    setConverted(true);
    setSelectedLead((prev) => prev ? { ...prev, entityType: 'client', consentStatus: 'replied' } : null);
  }, [selectedLead, store]);

  const consentBadge = (status: ConsentStatus) => {
    if (status === 'replied') return <Badge variant="green">{consentLabels[status]}</Badge>;
    if (status === 'opted_out') return <Badge variant="red">{consentLabels[status]}</Badge>;
    return <Badge variant="gray">{consentLabels[status]}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Leads & Clients"
        subtitle="Browse your full pipeline. Leads and clients are visually separated."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['all', 'lead', 'client'] as EntityTypeFilter[]).map((type) => (
            <button
              key={type}
              onClick={() => setEntityFilter(type)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                entityFilter === type ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-slate-100'
              }`}
            >
              {type === 'all' ? 'All' : type + 's'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-ink-300" />
          <select value={consentFilter} onChange={(e) => setConsentFilter(e.target.value as ConsentStatus | 'all')} className="input py-1.5 text-xs w-auto">
            <option value="all">All Consent</option>
            <option value="none">No response</option>
            <option value="replied">Replied</option>
            <option value="opted_out">Opted out</option>
          </select>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)} className="input py-1.5 text-xs w-auto">
            <option value="all">All Channels</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram / FB</option>
          </select>
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Type</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Business Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Category</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Channels</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Consent</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Last Contacted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink-300">No leads or clients match your filters.</td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleOpenLead(lead)}
                    className="cursor-pointer transition-colors hover:bg-brand-50/50"
                  >
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
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-ink-900">{lead.businessName}</p>
                        <p className="text-xs text-ink-300">{lead.email || lead.phone || 'No contact info'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{lead.category}</td>
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
                    <td className="px-4 py-3">{consentBadge(lead.consentStatus)}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {lead.lastContactedAt
                        ? new Date(lead.lastContactedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : <span className="text-ink-300">Never</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.businessName || ''}
        width="xl"
        footer={
          selectedLead && (
            <div className="flex items-center justify-between">
              {converted ? (
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <UserCheck size={18} /> Converted to client successfully.
                </span>
              ) : selectedLead.entityType === 'client' ? (
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <UserCheck size={18} /> Already a client.
                </span>
              ) : (
                <button onClick={handleConvert} className="btn-primary">
                  <UserCheck size={16} /> Convert to Client
                </button>
              )}
              <button onClick={() => setSelectedLead(null)} className="btn-secondary">
                <ArrowLeft size={16} /> Close
              </button>
            </div>
          )
        }
      >
        {selectedLead && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Type</p>
                <p className="mt-1 text-sm font-semibold capitalize text-ink-700">{selectedLead.entityType}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Category</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.category}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Consent</p>
                <div className="mt-1">{consentBadge(selectedLead.consentStatus)}</div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Phone</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Email</p>
                <p className="mt-1 text-sm text-ink-700">{selectedLead.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">Social</p>
                <p className="mt-1 text-sm text-ink-700">
                  {selectedLead.instagram || selectedLead.facebook || '—'}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-bold text-ink-900">Conversation History</h4>
              {leadConversations.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-300">No conversation history yet.</p>
              ) : (
                <div className="space-y-3">
                  {leadConversations.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-md rounded-lg px-4 py-2.5 ${
                        msg.direction === 'outbound'
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-ink-700'
                      }`}>
                        <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
                          <ChannelIcon channel={msg.channel} size={12} className={msg.direction === 'outbound' ? 'text-white' : ''} />
                          <span>{channelLabels[msg.channel]}</span>
                          {msg.status === 'draft' && <Badge variant="yellow">Draft</Badge>}
                        </div>
                        <p className="text-sm">{msg.text}</p>
                        <p className={`mt-1.5 text-xs ${msg.direction === 'outbound' ? 'text-brand-100' : 'text-ink-300'}`}>
                          {new Date(msg.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h4 className="mb-2 text-sm font-bold text-ink-900">Send a Reply (Mock)</h4>
              <div className="flex gap-2 mb-2">
                {(['email', 'whatsapp', 'instagram'] as Channel[]).map((ch) => {
                  const Icon = ch === 'email' ? Mail : ch === 'whatsapp' ? MessageCircle : Instagram;
                  const hasContact = ch === 'email' ? !!selectedLead.email : ch === 'whatsapp' ? !!selectedLead.whatsapp : !!selectedLead.instagram || !!selectedLead.facebook;
                  return (
                    <button
                      key={ch}
                      onClick={() => setReplyChannel(ch)}
                      disabled={!hasContact}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-30 ${
                        replyChannel === ch
                          ? 'border-brand-300 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-white text-ink-500 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={12} />
                      {channelLabels[ch]}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a message..."
                  rows={2}
                  className="textarea flex-1 text-sm"
                />
                <button onClick={handleSendReply} disabled={!replyText.trim()} className="btn-primary self-end">
                  <Send size={16} />
                </button>
              </div>
              {replyChannel === 'instagram' && (
                <p className="mt-2 text-xs text-amber-600">Instagram / FB messages are drafted for manual sending — they won't auto-send.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
