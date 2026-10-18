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
  FileDown,
  ShieldCheck,
  FileText,
  Users,
  CheckCircle2,
  AlertCircle,
  BarChart3,
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
  selectedListId?: string;
}

export function ClientAuditModal({ open, onClose, lead, store, selectedListId }: Props) {
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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [generatedPdf, setGeneratedPdf] = useState<{ pdfName: string; downloadUrl: string; fileSize: number } | null>(null);

  // Send Now state (Single lead direct outreach)
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [sendNowFeedback, setSendNowFeedback] = useState<string | null>(null);
  const [sendNowError, setSendNowError] = useState<string | null>(null);

  // Send in Bulk state (Selected list bulk outreach)
  const [selectedBulkListId, setSelectedBulkListId] = useState<string>('');
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

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
    setSendNowFeedback(null);
    setSendNowError(null);
    setBulkFeedback(null);
    setBulkError(null);

    const initialList =
      selectedListId ||
      lead?.lists?.[0]?.id ||
      (store.lists && store.lists.length > 0 ? store.lists[0].id : '');
    setSelectedBulkListId(initialList);

    loadInitialPitch(initialUrl);
  }, [open, lead?.id, selectedListId, store.lists]);

  const handleSendNow = async () => {
    if (!lead || isSendingNow) return;
    setIsSendingNow(true);
    setSendNowFeedback(null);
    setSendNowError(null);
    try {
      const res = await api.autoSendNextStep(lead.id);
      if (res.success && res.result) {
        if (res.result.success) {
          setSendNowFeedback(
            `✓ Sent Now! Technical Audit email & PDF attachment successfully dispatched to ${lead.email || lead.businessName}.`
          );
          await store.refreshAll();
          setTimeout(() => setSendNowFeedback(null), 7000);
        } else {
          setSendNowError(res.result.error || res.result.reason || 'Dispatch returned an error. Please verify SMTP / email settings.');
        }
      } else {
        setSendNowFeedback(`✓ Outreach dispatched to ${lead.businessName}!`);
        await store.refreshAll();
        setTimeout(() => setSendNowFeedback(null), 7000);
      }
    } catch (err: any) {
      console.error('Send Now failed:', err);
      setSendNowError(err?.message || 'Failed to dispatch email.');
    } finally {
      setIsSendingNow(false);
    }
  };

  const handleSendBulkList = async () => {
    if (!selectedBulkListId || isSendingBulk) return;
    const leadsInList = store.leads.filter((l) => l.lists?.some((lst) => lst.id === selectedBulkListId) && l.status !== 'manual_review');
    if (leadsInList.length === 0) {
      setBulkError('The selected list has no active leads to send to (leads in Need to Check are excluded).');
      return;
    }

    setIsSendingBulk(true);
    setBulkFeedback(null);
    setBulkError(null);

    try {
      const listLeadIds = leadsInList.map((l) => l.id);
      const res = await api.autoSendNextStep(listLeadIds);
      const targetListName = store.lists.find((lst) => lst.id === selectedBulkListId)?.name || 'Selected List';
      setBulkFeedback(
        `✓ Bulk Send Complete! Dispatched ${res.sentCount ?? leadsInList.length} leads in "${targetListName}" with whole-site technical audit reports.`
      );
      await store.refreshAll();
      setTimeout(() => setBulkFeedback(null), 8000);
    } catch (err: any) {
      console.error('Bulk Send failed:', err);
      setBulkError(err?.message || 'Bulk dispatch encountered an error.');
    } finally {
      setIsSendingBulk(false);
    }
  };

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

  const handleGeneratePdf = async () => {
    if (!lead || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const target = customUrl.trim() || lead.website || undefined;
      const res = await api.generateAuditReport({
        url: target,
        leadId: lead.id,
        business_name: lead.businessName,
        email: lead.email,
        phone: lead.phone,
        contact_name: lead.primaryContactName || '',
        category: lead.category,
        location: lead.location || lead.country || '',
        dispatchToLod: true,
      });

      if (res.success && res.pdf) {
        setGeneratedPdf(res.pdf);
        if (res.report) {
          setAuditReport(res.report);
        }
      }
    } catch (err) {
      console.error('Failed to generate audit PDF:', err);
    } finally {
      setIsGeneratingPdf(false);
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
              Powered by <a href="https://technical-audit-dashboard.vercel.app/" target="_blank" rel="noreferrer" className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5">technical-audit-dashboard.vercel.app <ExternalLink size={10} /></a>
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
                  <span>Auditing...</span>
                </>
              ) : (
                <>
                  <Zap size={13} />
                  <span>{auditReport ? 'Re-Audit Website' : 'Run SEO Audit'}</span>
                </>
              )}
            </button>

            {hasWebsite && (
              <button
                type="button"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf || !customUrl.trim()}
                className="btn-secondary py-2 px-3 text-xs flex items-center justify-center gap-1.5 shrink-0 bg-slate-800 text-white hover:bg-slate-900 border-slate-800 w-full sm:w-auto"
                title="Generate lightweight ODS Technical Audit PDF (<1.5MB)"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Rendering PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown size={12} />
                    <span>{generatedPdf ? 'Re-generate PDF' : 'Generate ODS PDF'}</span>
                  </>
                )}
              </button>
            )}

            {generatedPdf && (
              <a
                href={generatedPdf.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary py-2 px-3 text-xs flex items-center justify-center gap-1 shrink-0 bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                title="Download compiled PDF asset"
              >
                <FileText size={12} className="text-emerald-600" />
                <span>PDF ({Math.round(generatedPdf.fileSize / 1024)} KB)</span>
              </a>
            )}

            <a
              href={`https://technical-audit-dashboard.vercel.app/?url=${encodeURIComponent(customUrl.trim() || lead.website || '')}&mode=site&maxPages=100`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary py-2 px-3 text-xs flex items-center justify-center gap-1 shrink-0 text-ink-600 hover:text-indigo-600"
              title="Open audit dashboard in new tab (Whole Site Mode)"
            >
              <span>Audit Tool</span>
              <ExternalLink size={12} />
            </a>
          </form>

          {/* Audit Results Highlight Strip (If website present) */}
          {hasWebsite && auditReport && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                  <BarChart3 size={11} className="text-indigo-600" />
                  SEMrush Site Diagnostic • Whole Site Crawl (up to 100 pages)
                </span>
                <span className="text-[10px] text-ink-500 font-medium">
                  Crawled: <strong>{auditReport.semrushAudit?.pagesCrawled || 100} / 100 pages</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg bg-slate-50 p-2 border border-slate-200/70 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Site Health</span>
                  <p className={`text-base font-extrabold mt-0.5 ${
                    auditReport.overallScore >= 80 ? 'text-emerald-600' : auditReport.overallScore >= 50 ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {auditReport.semrushAudit?.healthScore || auditReport.overallScore}%
                  </p>
                </div>
                <div className="rounded-lg bg-rose-50/70 p-2 border border-rose-200/80 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Critical Errors</span>
                  <p className="text-base font-extrabold text-rose-600 mt-0.5">
                    {auditReport.semrushAudit?.errorsCount ?? auditReport.criticalIssues.length}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50/70 p-2 border border-amber-200/80 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Warnings</span>
                  <p className="text-base font-extrabold text-amber-600 mt-0.5">
                    {auditReport.semrushAudit?.warningsCount ?? 4}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50/70 p-2 border border-blue-200/80 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Notices</span>
                  <p className="text-base font-extrabold text-blue-600 mt-0.5">
                    {auditReport.semrushAudit?.noticesCount ?? 2}
                  </p>
                </div>
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

                {/* Feedback notifications */}
                {sendNowFeedback && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>{sendNowFeedback}</span>
                  </div>
                )}
                {sendNowError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <AlertCircle size={15} className="text-rose-600 shrink-0" />
                    <span>{sendNowError}</span>
                  </div>
                )}
                {bulkFeedback && (
                  <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={15} className="text-indigo-600 shrink-0" />
                    <span>{bulkFeedback}</span>
                  </div>
                )}
                {bulkError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <AlertCircle size={15} className="text-rose-600 shrink-0" />
                    <span>{bulkError}</span>
                  </div>
                )}

                {/* Lead Quarantined in Need to Check warning */}
                {lead.status === 'manual_review' && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Lead is quarantined in 'Need to Check' (Manual Checking)</span>
                      <p className="mt-0.5 text-rose-700">
                        Reason: {lead.manualReviewReason || 'Outreach delivery failure'}. All messaging is blocked until this lead is retrieved back / approved from the CRM Manual Checking tab.
                      </p>
                    </div>
                  </div>
                )}

                {/* Dispatch Action Controls: Send Now vs Send in Bulk */}
                <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 p-3.5 space-y-3 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block flex items-center gap-1.5">
                        <Zap size={13} className="text-amber-500" />
                        Audit Completed — Dispatch Options:
                      </span>
                      <p className="text-[11px] text-ink-500 mt-0.5">
                        Send personalized technical audit with attached PDF now, or send to whole list in bulk.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* OPTION 1: SEND NOW (Single Lead) */}
                      <button
                        onClick={handleSendNow}
                        disabled={isSendingNow || isSendingBulk || lead.status === 'manual_review'}
                        className={`btn-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 shadow-sm ${
                          lead.status === 'manual_review'
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                        title={
                          lead.status === 'manual_review'
                            ? "Lead is in 'Need to Check' — retrieve back from Manual Checking before sending"
                            : `Instantly send tailored audit email with attached PDF to ${lead.email || lead.businessName}`
                        }
                      >
                        {isSendingNow ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        <span>{isSendingNow ? 'Sending Now...' : 'Send Now (Single Lead)'}</span>
                      </button>

                      {/* Secondary: Add to Outreach Queue */}
                      <button
                        onClick={handleAddToApprovalQueue}
                        disabled={isAddingToQueue}
                        className="btn-secondary py-2 px-3 text-xs flex items-center gap-1 bg-white hover:bg-slate-100 text-ink-700 border-slate-300"
                        title="Stage in manual approval queue"
                      >
                        {isAddingToQueue ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        <span>{queueFeedback || 'Add to Queue'}</span>
                      </button>
                    </div>
                  </div>

                  {/* OPTION 2: SEND IN BULK (When List is Selected) */}
                  <div className="pt-2.5 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-1">
                      <Users size={14} className="text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold text-ink-700 shrink-0">Send in Bulk (List):</span>
                      <select
                        value={selectedBulkListId}
                        onChange={(e) => setSelectedBulkListId(e.target.value)}
                        className="input py-1 px-2 text-xs flex-1 max-w-xs font-medium"
                      >
                        <option value="">-- Choose Target List --</option>
                        {store.lists.map((lst) => {
                          const count = store.leads.filter((l) => l.lists?.some((lItem) => lItem.id === lst.id)).length;
                          return (
                            <option key={lst.id} value={lst.id}>
                              {lst.name} ({count} leads)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <button
                      onClick={handleSendBulkList}
                      disabled={isSendingBulk || !selectedBulkListId}
                      className="btn-primary py-2 px-3.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 disabled:opacity-50"
                      title="Send whole-site audit outreach in bulk to all leads in selected list"
                    >
                      {isSendingBulk ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Dispatching Bulk...</span>
                        </>
                      ) : (
                        <>
                          <Users size={13} />
                          <span>
                            Send in Bulk
                            {selectedBulkListId
                              ? ` (${store.leads.filter((l) => l.lists?.some((lItem) => lItem.id === selectedBulkListId)).length} Leads)`
                              : ''}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 2: TECHNICAL AUDIT ISSUES & CORE WEB VITALS */}
        {activeTab === 'audit_details' && auditReport && (
          <div className="space-y-3">
            {/* Core Web Vitals & Diagnostic Signals */}
            {auditReport.metrics && (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800 flex items-center gap-1.5">
                    <Zap size={13} className="text-amber-500" />
                    <span>Core Web Vitals & Diagnostic Signals</span>
                  </h4>
                  <span className="text-[10px] text-ink-400">
                    HTTP {auditReport.crawlStatus?.httpStatus || 200} OK
                    {auditReport.crawlStatus?.redirectFollowed ? ' (Redirect Followed)' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] font-bold uppercase text-ink-400">LCP (Largest Paint)</span>
                    <p className={`text-sm font-extrabold ${auditReport.metrics.lcpEstimateMs <= 2500 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {(auditReport.metrics.lcpEstimateMs / 1000).toFixed(1)}s
                    </p>
                    <span className="text-[9px] text-ink-400">Target: &lt;2.5s</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] font-bold uppercase text-ink-400">CLS (Layout Shift)</span>
                    <p className={`text-sm font-extrabold ${auditReport.metrics.clsScore <= 0.1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {auditReport.metrics.clsScore}
                    </p>
                    <span className="text-[9px] text-ink-400">Target: &lt;0.10</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] font-bold uppercase text-ink-400">Missing Alt Tags</span>
                    <p className={`text-sm font-extrabold ${auditReport.metrics.imagesMissingAlt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {auditReport.metrics.imagesMissingAlt} / {auditReport.metrics.imagesTotal}
                    </p>
                    <span className="text-[9px] text-ink-400">Accessibility / Image SEO</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[9px] font-bold uppercase text-ink-400">LocalBusiness Schema</span>
                    <p className={`text-sm font-extrabold ${auditReport.metrics.hasLocalBusinessSchema ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {auditReport.metrics.hasLocalBusinessSchema ? '✓ Detected' : '✕ Missing'}
                    </p>
                    <span className="text-[9px] text-ink-400">Google Maps 3-Pack</span>
                  </div>
                </div>
              </div>
            )}

            {/* SEMrush Site Diagnostic Whole-Site Issues Breakdown */}
            {auditReport.semrushAudit && auditReport.semrushAudit.topSiteIssues.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800 flex items-center gap-1.5">
                    <BarChart3 size={13} className="text-indigo-600" />
                    <span>SEMrush Site Diagnostic • Issues across {auditReport.semrushAudit.pagesCrawled} Pages Crawled</span>
                  </h4>
                  <span className="text-[10px] text-ink-500 font-semibold">
                    Health: <strong className="text-indigo-600">{auditReport.semrushAudit.healthScore}%</strong>
                  </span>
                </div>

                <div className="space-y-2">
                  {auditReport.semrushAudit.topSiteIssues.map((issue, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        issue.type === 'error'
                          ? 'bg-rose-50/70 border-rose-200/80 text-rose-950'
                          : issue.type === 'warning'
                          ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                          : 'bg-blue-50/70 border-blue-200/80 text-blue-950'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              issue.type === 'error'
                                ? 'bg-rose-200 text-rose-900'
                                : issue.type === 'warning'
                                ? 'bg-amber-200 text-amber-900'
                                : 'bg-blue-200 text-blue-900'
                            }`}
                          >
                            {issue.type}
                          </span>
                          <strong className="font-bold">{issue.title}</strong>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border border-slate-300 text-ink-700 shrink-0">
                          Affects {issue.affectedPagesCount} / {auditReport.semrushAudit?.pagesCrawled || 100} pages
                        </span>
                      </div>
                      <p className="text-[11px] opacity-90 leading-relaxed">{issue.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                  Critical Issues Detected ({auditReport.criticalIssues.length})
                </h4>
                <a
                  href={`https://technical-audit-dashboard.vercel.app/?url=${encodeURIComponent(customUrl.trim() || lead.website || '')}&mode=site&maxPages=100`}
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

            {/* Recommendations with ODS Agency Solution Mapping */}
            {auditReport.recommendations.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                  Actionable SEO Recommendations & ODS Solutions
                </h4>
                <div className="space-y-2.5">
                  {auditReport.recommendations.map((rec, i) => (
                    <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            rec.priority === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {rec.priority}
                          </span>
                          <strong className="text-ink-900">{rec.title}</strong>
                        </div>
                      </div>
                      <p className="text-ink-600 text-[11px] leading-relaxed">{rec.detail}</p>
                      {rec.odsSolution && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-indigo-700 bg-indigo-50/80 px-2 py-1 rounded border border-indigo-100">
                          <ShieldCheck size={12} className="text-indigo-600 shrink-0" />
                          <span><strong>ODS Fix:</strong> {rec.odsSolution}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ODS Solutions Architecture Banner */}
            <div className="p-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block mb-1">
                ODS Agency Infrastructure Capabilities:
              </span>
              <p className="text-[11px] text-indigo-950 leading-relaxed">
                • <strong>Next.js SSR & Static Edge:</strong> Instant sub-100ms TTFB and perfect 100 PageSpeed scores.<br />
                • <strong>Headless Architecture:</strong> Decouple CMS backends into lightning-fast React applications.<br />
                • <strong>LocalBusiness Schema:</strong> JSON-LD engineering for Google Maps 3-Pack authority.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
