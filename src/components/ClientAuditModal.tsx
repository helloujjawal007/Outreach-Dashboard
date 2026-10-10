import React, { useState, useEffect } from 'react';
import {
  Globe,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Copy,
  Check,
  Send,
  MessageCircle,
  Mail,
  Zap,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { api } from '@/services/api';
import type { Lead, ClientAuditReport, AuditPitchResult } from '@/types';
import type { Store } from '@/store';

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
  store: Store;
}

export function ClientAuditModal({ open, onClose, lead, store }: Props) {
  const [activeTab, setActiveTab] = useState<'pitch' | 'audit_details'>('pitch');
  const [channelTab, setChannelTab] = useState<'email' | 'whatsapp'>('email');
  const [customUrl, setCustomUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<ClientAuditReport | null>(null);
  const [pitchResult, setPitchResult] = useState<AuditPitchResult | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'subject' | 'whatsapp' | null>(null);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null);

  // Determine if lead has a website
  const rawLeadWeb = (lead?.website || '').trim();
  const isMapsUrl = /google\.com\/maps|maps\.google\.com/i.test(rawLeadWeb);
  const initialHasWeb = Boolean(rawLeadWeb && !isMapsUrl && rawLeadWeb.toLowerCase() !== 'n/a' && rawLeadWeb.toLowerCase() !== 'none');

  useEffect(() => {
    if (!open || !lead) return;
    const initialUrl = initialHasWeb ? rawLeadWeb : '';
    setCustomUrl(initialUrl);
    setAuditReport(null);
    setPitchResult(null);
    setQueueFeedback(null);
    loadInitialPitch(initialUrl);
  }, [open, lead?.id]);

  const loadInitialPitch = async (targetWeb: string) => {
    if (!lead) return;
    setIsLoading(true);
    try {
      const city = lead.location || lead.country || '';
      const res = await api.generateAuditPitch({
        leadId: lead.id,
        customWebsite: targetWeb,
        businessName: lead.businessName,
        category: lead.category,
        city,
        contactName: lead.primaryContactName || '',
      });
      if (res.success && res.pitch) {
        setPitchResult(res.pitch);
        if (res.pitch.auditReport) {
          setAuditReport(res.pitch.auditReport);
        }
      }
    } catch (err) {
      console.error('Failed to load audit pitch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAudit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!lead || isAuditing) return;
    setIsAuditing(true);
    try {
      const auditRes = await api.runAudit({
        url: customUrl.trim() || undefined,
        leadId: lead.id,
      });
      if (auditRes.success && auditRes.report) {
        setAuditReport(auditRes.report);
      }

      // Refresh the tailored pitch with newly audited data
      const city = lead.location || lead.country || '';
      const pitchRes = await api.generateAuditPitch({
        leadId: lead.id,
        customWebsite: customUrl.trim() || undefined,
        businessName: lead.businessName,
        category: lead.category,
        city,
        contactName: lead.primaryContactName || '',
      });
      if (pitchRes.success && pitchRes.pitch) {
        setPitchResult(pitchRes.pitch);
      }
    } catch (err) {
      console.error('Failed to run audit:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCopy = (text: string, field: 'email' | 'subject' | 'whatsapp') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleAddToApprovalQueue = async () => {
    if (!lead || !pitchResult || isAddingToQueue) return;
    setIsAddingToQueue(true);
    try {
      await store.addQueueItem({
        leadId: lead.id,
        leadName: lead.businessName,
        channel: channelTab === 'email' ? 'email' : 'whatsapp',
        campaignName: pitchResult.hasWebsite ? 'SEO Audit Outreach' : 'Website Development & Local SEO',
        messagePreview: channelTab === 'email' ? pitchResult.emailBody : pitchResult.whatsappMessage,
      });
      setQueueFeedback('Added to Approval Queue!');
      setTimeout(() => setQueueFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to add to queue:', err);
      setQueueFeedback('Failed to queue message');
    } finally {
      setIsAddingToQueue(false);
    }
  };

  if (!lead) return null;

  const hasWebsite = Boolean(pitchResult?.hasWebsite ?? initialHasWeb);
  const city = lead.location || lead.country || '';

  return (
    <Modal open={open} onClose={onClose} title="Client Intelligence & Website Audit" maxWidth="max-w-3xl">
      <div className="space-y-4 text-xs">
        {/* Header Summary Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-slate-50">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-ink-900">{lead.businessName}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                Online Digital Solution
              </span>
              {lead.category && (
                <span className="text-[10px] text-ink-500 font-medium">
                  {lead.category} {city ? `• ${city}` : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-500 mt-0.5">
              Powered by <a href="https://bolt-project-access-lb76.bolt.host/" target="_blank" rel="noreferrer" className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5">bolt-project-access-lb76.bolt.host <ExternalLink size={10} /></a>
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
              hasWebsite ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {hasWebsite ? <Globe size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-amber-600" />}
              {hasWebsite ? 'Website Active' : 'No Website Detected'}
            </span>
          </div>
        </div>

        {/* Website Audit Status / Input Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <form onSubmit={handleRunAudit} className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="relative flex-1 w-full">
              <Globe className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="Enter or verify website URL (leave empty if no website)..."
                className="input pl-9 py-2 text-xs w-full font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isAuditing || !customUrl.trim()}
              className="btn-primary py-2 px-3.5 text-xs flex items-center justify-center gap-1.5 shrink-0 bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
            >
              {isAuditing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Auditing via bolt.host...</span>
                </>
              ) : (
                <>
                  <Zap size={13} />
                  <span>{auditReport ? 'Re-Audit Website' : 'Run SEO Audit'}</span>
                </>
              )}
            </button>
            <a
              href="https://bolt-project-access-lb76.bolt.host/"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary py-2 px-3 text-xs flex items-center justify-center gap-1 shrink-0 text-ink-600 hover:text-indigo-600"
              title="Open audit dashboard in new tab"
            >
              <span>Audit Tool</span>
              <ExternalLink size={12} />
            </a>
          </form>

          {/* Audit Results Highlight Strip (If website present) */}
          {hasWebsite && auditReport && (
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/70 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Overall Score</span>
                <p className={`text-base font-extrabold mt-0.5 ${
                  auditReport.overallScore >= 80 ? 'text-emerald-600' : auditReport.overallScore >= 50 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  {auditReport.overallScore}/100
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/70 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Health Grade</span>
                <p className="text-xs font-bold text-ink-800 mt-1">{auditReport.grade}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/70 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Server Latency</span>
                <p className="text-xs font-bold text-ink-800 mt-1">{auditReport.responseTimeMs}ms TTFB</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/70 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Mobile Ready</span>
                <p className="text-xs font-bold text-emerald-600 mt-1">
                  {auditReport.mobileFriendly ? 'Optimized' : 'Needs Work'}
                </p>
              </div>
            </div>
          )}

          {/* No Website Explanatory Strip */}
          {!hasWebsite && (
            <div className="mt-3 pt-3 border-t border-amber-100 flex items-start gap-2.5 text-amber-900 bg-amber-50/70 p-3 rounded-lg">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">No active website linked to this Google listing.</p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  Local clients are searching daily on Google Maps. Without a website, they cannot view services, pricing, or reviews, giving nearby competitors an unfair advantage. Online Digital Solution pitches <strong>Website Development + Local SEO + Maintenance</strong> to capture these missed inquiries.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* View Selection Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('pitch')}
              className={`pb-2 px-2 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'pitch'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} /> Tailored Outreach Pitch
              </span>
            </button>
            {hasWebsite && (
              <button
                onClick={() => setActiveTab('audit_details')}
                className={`pb-2 px-2 text-xs font-bold border-b-2 transition-all ${
                  activeTab === 'audit_details'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Sliders size={13} /> Technical Issues ({auditReport?.criticalIssues.length || 0})
                </span>
              </button>
            )}
          </div>

          {activeTab === 'pitch' && (
            <div className="flex items-center gap-1 pb-1">
              <button
                onClick={() => setChannelTab('email')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                  channelTab === 'email' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-ink-600 hover:bg-slate-200'
                }`}
              >
                <Mail size={12} /> Email
              </button>
              <button
                onClick={() => setChannelTab('whatsapp')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                  channelTab === 'whatsapp' ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-ink-600 hover:bg-slate-200'
                }`}
              >
                <MessageCircle size={12} /> WhatsApp
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: PITCH DISPLAY */}
        {activeTab === 'pitch' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="p-8 text-center text-ink-400">
                <Loader2 size={24} className="animate-spin mx-auto text-indigo-600 mb-2" />
                <p className="font-semibold">Synthesizing tailored client pitch...</p>
              </div>
            ) : pitchResult ? (
              <div className="space-y-3">
                {/* Email Tab */}
                {channelTab === 'email' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Subject Line</span>
                        <button
                          onClick={() => handleCopy(pitchResult.emailSubject, 'subject')}
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {copiedField === 'subject' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          <span>{copiedField === 'subject' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 font-semibold text-ink-800 text-xs">
                        {pitchResult.emailSubject}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Email Body</span>
                        <button
                          onClick={() => handleCopy(pitchResult.emailBody, 'email')}
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {copiedField === 'email' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          <span>{copiedField === 'email' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        readOnly
                        rows={12}
                        value={pitchResult.emailBody}
                        className="input w-full font-mono text-[11px] leading-relaxed p-3 bg-slate-50/60"
                      />
                    </div>
                  </div>
                )}

                {/* WhatsApp Tab */}
                {channelTab === 'whatsapp' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                        WhatsApp Direct Message
                      </span>
                      <div className="flex items-center gap-2">
                        {lead.phone && (
                          <a
                            href={`https://web.whatsapp.com/send?phone=${encodeURIComponent(
                              lead.phone.replace(/[^0-9+]/g, '')
                            )}&text=${encodeURIComponent(pitchResult.whatsappMessage)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors"
                          >
                            <MessageCircle size={12} />
                            <span>Launch WhatsApp Web</span>
                          </a>
                        )}
                        <button
                          onClick={() => handleCopy(pitchResult.whatsappMessage, 'whatsapp')}
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {copiedField === 'whatsapp' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          <span>{copiedField === 'whatsapp' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      readOnly
                      rows={8}
                      value={pitchResult.whatsappMessage}
                      className="input w-full font-mono text-[11px] leading-relaxed p-3 bg-emerald-50/30 border-emerald-200 text-ink-800"
                    />
                  </div>
                )}

                {/* Recommended Services Pill Strip */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Recommended Agency Services:
                  </span>
                  {pitchResult.recommendedServices.map((service, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-ink-700 shadow-2xs"
                    >
                      {service}
                    </span>
                  ))}
                </div>

                {/* Queue / Dispatch Actions */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-ink-400">
                    Signature: <strong>Online Digital Solution</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    {queueFeedback && (
                      <span className="text-[11px] font-semibold text-emerald-600 animate-fade-in">
                        {queueFeedback}
                      </span>
                    )}
                    <button
                      onClick={handleAddToApprovalQueue}
                      disabled={isAddingToQueue}
                      className="btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1.5 shadow-xs bg-indigo-600 hover:bg-indigo-700"
                    >
                      {isAddingToQueue ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      <span>Add to Outreach Queue</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 2: TECHNICAL AUDIT ISSUES */}
        {activeTab === 'audit_details' && auditReport && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                  Critical Issues Detected ({auditReport.criticalIssues.length})
                </h4>
                <a
                  href="https://bolt-project-access-lb76.bolt.host/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                >
                  <span>Open Full Dashboard</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <div className="space-y-2">
                {auditReport.criticalIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50/60 border border-rose-200/80 text-rose-950">
                    <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5" />
                    <span className="text-xs font-medium leading-relaxed">{issue}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {auditReport.recommendations.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                  Actionable SEO Recommendations
                </h4>
                <div className="space-y-2">
                  {auditReport.recommendations.map((rec, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          rec.priority === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rec.priority}
                        </span>
                        <strong className="text-ink-900">{rec.title}</strong>
                      </div>
                      <p className="text-ink-500 text-[11px] leading-relaxed">{rec.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
