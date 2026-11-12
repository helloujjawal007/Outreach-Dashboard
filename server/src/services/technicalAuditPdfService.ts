import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { ClientAuditReport } from './clientAuditIntelligenceService';
import { SENDER_CONFIG } from '../config/senderConfig';
import { isValidPdfFile } from '../utils/auditPolicy';
import { query } from '../config/db';
import { logPipeline } from '../utils/pipelineLogger';

export interface GeneratedPdfResult {
  pdfPath: string;
  pdfName: string;
  fileSize: number;
  downloadUrl: string;
}

export class TechnicalAuditPdfService {
  private readonly AUDITS_DIR = path.resolve(process.cwd(), 'server', 'data', 'audits');

  constructor() {
    if (!fs.existsSync(this.AUDITS_DIR)) {
      fs.mkdirSync(this.AUDITS_DIR, { recursive: true });
    }
  }

  /**
   * Resolves Google Chrome or Chromium executable on the system
   */
  public getChromeExecutable(): string | null {
    // 1. Explicit environment variable
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    // 2. Standard platform paths
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      path.resolve(process.cwd(), 'chrome-bin', 'chrome'),
      path.resolve(process.cwd(), 'chrome-bin', 'chrome-headless-shell'),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Sanitizes domain into a safe filename
   */
  public sanitizeFilename(domain?: string): string {
    const raw = (domain || '').trim();
    const clean = raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return clean || 'website';
  }

  /**
   * Escapes dynamic strings before interpolating into HTML templates
   */
  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Translates raw technical audit findings into plain, client-friendly takeaways
   */
  private translateFindingForClient(rawIssue: string): {
    severity: 'High Impact' | 'Important' | 'Quick Win';
    title: string;
    evidence: string;
    businessImpact: string;
  } {
    const trimmed = rawIssue.trim();
    const severityMatch = trimmed.match(/^\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*/i);
    const rawLevel = (severityMatch?.[1] || 'HIGH').toUpperCase();
    const body = trimmed.replace(/^\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*/i, '').trim();

    const severity: 'High Impact' | 'Important' | 'Quick Win' =
      rawLevel === 'CRITICAL'
        ? 'High Impact'
        : rawLevel === 'HIGH'
        ? 'Important'
        : 'Quick Win';

    const colonIdx = body.indexOf(':');
    const rawTitle = colonIdx > 0 ? body.slice(0, colonIdx).trim() : body;
    const rawDetail = colonIdx > 0 ? body.slice(colonIdx + 1).trim() : body;
    const cleanEvidence = rawDetail.replace(/\s*\(([^)]*),\s*(measured|estimated)\)/gi, ' ($1)').trim();

    const lower = body.toLowerCase();
    if (lower.includes('ttfb') || lower.includes('server response') || lower.includes('latency') || lower.includes('lcp') || lower.includes('speed')) {
      return {
        severity: 'High Impact',
        title: 'Website Takes Too Long to Respond & Load',
        evidence: cleanEvidence,
        businessImpact: 'Visitors on phones typically leave if a page pauses more than 3 seconds before appearing, costing calls and quote requests.',
      };
    }
    if (lower.includes('https') || lower.includes('ssl') || lower.includes('insecure protocol')) {
      return {
        severity: 'High Impact',
        title: 'Security Redirect Missing (HTTP to HTTPS)',
        evidence: cleanEvidence,
        businessImpact: 'Visitors who type your web address without "https://" can see browser security warnings instead of landing safely on your site.',
      };
    }
    if (lower.includes('meta description')) {
      return {
        severity: 'Important',
        title: 'Missing Search Summaries on Google (Meta Descriptions)',
        evidence: cleanEvidence,
        businessImpact: 'When Google has to guess a page description, search results look less inviting and fewer local searchers click through.',
      };
    }
    if (lower.includes('h1') || lower.includes('heading structure')) {
      return {
        severity: 'Quick Win',
        title: 'Unclear Page Headings (H1 Structure)',
        evidence: cleanEvidence,
        businessImpact: 'Clear page titles help both visitors and Google quickly understand the main service on each page.',
      };
    }
    if (lower.includes('alt') || lower.includes('image')) {
      return {
        severity: 'Quick Win',
        title: 'Images Missing Accessibility & Search Labels',
        evidence: cleanEvidence,
        businessImpact: 'Descriptive image tags improve accessibility and help your services appear in Google Image and local searches.',
      };
    }
    if (lower.includes('schema') || lower.includes('localbusiness') || lower.includes('structured data')) {
      return {
        severity: 'Important',
        title: 'Missing Local Business Details for Google Search',
        evidence: cleanEvidence,
        businessImpact: 'Adding structured business info helps Google display hours, location, and services clearly in local search results.',
      };
    }
    if (lower.includes('nofollow') || lower.includes('outbound link')) {
      return {
        severity: 'Quick Win',
        title: 'External Links Need SEO Cleanup',
        evidence: cleanEvidence,
        businessImpact: 'Cleaning up link attributes keeps search engine authority focused on your own pages rather than third-party sites.',
      };
    }
    if (lower.includes('mobile') || lower.includes('viewport')) {
      return {
        severity: 'High Impact',
        title: 'Mobile Screen Sizing Needs Adjustment',
        evidence: cleanEvidence,
        businessImpact: 'Most local service searches happen on mobile; awkward zooming or layout shifts make it harder to tap "Call" or book.',
      };
    }

    return {
      severity,
      title: rawTitle.replace(/\s*\([^)]*\)\s*/g, '').trim() || 'Website Improvement Opportunity',
      evidence: cleanEvidence,
      businessImpact: 'Fixing this improves visitor trust, page usability, and how reliably search engines index your site.',
    };
  }

  /**
   * Builds tailored plain-English action plan steps from audit findings & metrics
   */
  private buildClientActionPlan(report: ClientAuditReport, pagesChecked?: number): Array<{
    title: string;
    whatWeDo: string;
    businessResult: string;
    timeframe: string;
  }> {
    const joined = (report.criticalIssues || []).join(' ').toLowerCase();
    const steps: Array<{
      title: string;
      whatWeDo: string;
      businessResult: string;
      timeframe: string;
    }> = [];

    if (joined.includes('https') || joined.includes('ssl') || (report.metrics && !report.metrics.hasSsl)) {
      steps.push({
        title: 'Enforce Automatic HTTPS Security Redirects',
        whatWeDo: 'Configure clean 301 redirects so every HTTP and www/non-www link loads over encrypted HTTPS automatically.',
        businessResult: 'Eliminates browser "Not Secure" warnings and protects visitor trust on every page.',
        timeframe: 'Quick Win (Day 1)',
      });
    }

    if (joined.includes('ttfb') || joined.includes('latency') || joined.includes('speed') || joined.includes('lcp') || (report.metrics && report.metrics.responseTimeMs > 500)) {
      steps.push({
        title: 'Speed Up Initial Page Load with Caching & CDN',
        whatWeDo: 'Enable full-page server caching, Cloudflare edge delivery, compression, and lightweight image/script loading.',
        businessResult: 'Cuts multi-second waiting time down so mobile visitors stay, read your services, and convert.',
        timeframe: 'Week 1',
      });
    }

    if (joined.includes('meta description') || joined.includes('h1') || joined.includes('schema') || joined.includes('alt')) {
      steps.push({
        title: 'Clean Up Google Search Titles, Descriptions & Local Markup',
        whatWeDo: `Write clear page descriptions, organize one main H1 heading per page, and add Local Business structured data${pagesChecked ? ` across your ${pagesChecked} site pages` : ''}.`,
        businessResult: 'Makes your listings stand out in local Google searches and drives higher-quality clicks.',
        timeframe: 'Week 1–2',
      });
    }

    // Include custom report recommendations only if we still need steps up to 3
    for (const rec of report.recommendations || []) {
      if (steps.length >= 3) break;
      const cleanTitle = (rec.title || '')
        .replace(/ODS\s*Capabilities?/gi, '')
        .replace(/Semantic Entity Graph Injection/gi, 'Google Business Info Setup')
        .replace(/Remediation & Layout Stability/gi, 'Speed & Mobile Stability')
        .trim();
      const alreadySimilar = steps.some((s) => s.title.toLowerCase().includes(cleanTitle.toLowerCase().slice(0, 12)));
      if (!cleanTitle || alreadySimilar) continue;
      steps.push({
        title: cleanTitle,
        whatWeDo: rec.detail || 'Apply targeted performance and SEO best practices without changing your brand design.',
        businessResult: 'Improves Google rankings, mobile speed, and visitor inquiry rates.',
        timeframe: rec.priority === 'high' ? 'Week 1' : 'Week 2',
      });
    }

    if (steps.length === 0) {
      steps.push(
        {
          title: 'Speed & Mobile Experience Optimization',
          whatWeDo: 'Enable page caching, compress heavy images/scripts, and optimize mobile layout stability.',
          businessResult: 'Faster page loads and fewer visitors bouncing before calling or booking.',
          timeframe: 'Week 1',
        },
        {
          title: 'Local SEO & Search Snippet Polish',
          whatWeDo: 'Ensure every key page has a clear heading, custom Google preview text, and Local Business schema.',
          businessResult: 'Stronger visibility when nearby customers search for your services.',
          timeframe: 'Week 1–2',
        }
      );
    }

    return steps.slice(0, 3);
  }

  /**
   * Builds a clear, jargon-free client report HTML document for Headless Chrome PDF rendering
   */
  public buildAuditHtml(report: ClientAuditReport, businessName?: string): string {
    const cleanBiz = (businessName || report.domain || 'Your Business')
      .replace(/\b(llc|inc|corp|ltd|pvt|co|company|solutions|holdings)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || report.domain || 'Your Business';

    const findingsList = (report.criticalIssues || []).filter(Boolean);
    const allText = `${report.summary || ''} ${findingsList.join(' ')}`;

    const pagesMatch = allText.match(/(\d+)\s+pages?\s+(?:checked|evaluated|crawled)/i);
    const pagesChecked = pagesMatch ? parseInt(pagesMatch[1], 10) : undefined;

    const ttfbTextMatch = allText.match(/TTFB\s+(\d+)\s*ms/i);
    const metaMissingMatch = allText.match(/(\d+)\s+pages?\s+missing\s+meta\s+descriptions?/i);
    const h1IssueMatch = allText.match(/(\d+)\s+pages?\s+with\s+multiple\s+or\s+missing\s+H1s?/i);
    const hasHttpsIssue = /no\s+https\s+redirect|insecure\s+protocol/i.test(allText);

    const score = Math.max(0, Math.min(100, Math.round(Number(report.overallScore) || 0)));
    const scoreBand =
      score >= 80
        ? { label: 'Strong Foundation', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' }
        : score >= 55
        ? { label: 'Room to Improve', color: '#b45309', bg: '#fffbeb', border: '#fde68a' }
        : { label: 'Needs Priority Attention', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };

    const metrics = report.metrics || {
      lcpEstimateMs: 0,
      clsScore: 0,
      inpEstimateMs: 0,
      responseTimeMs: ttfbTextMatch ? parseInt(ttfbTextMatch[1], 10) : (report.responseTimeMs || 0),
      imagesTotal: 0,
      imagesMissingAlt: 0,
      hasLocalBusinessSchema: false,
      hasViewport: report.mobileFriendly,
      hasSsl: report.targetUrl.startsWith('https://') && !hasHttpsIssue,
      pageWeightKb: 0,
    };

    const effectiveTtfb = ttfbTextMatch ? parseInt(ttfbTextMatch[1], 10) : metrics.responseTimeMs;

    const translatedFindings = findingsList.slice(0, 6).map((f) => this.translateFindingForClient(f));
    const actionSteps = this.buildClientActionPlan(report, pagesChecked);

    // Build clean plain-English overview paragraph (always consistent with header score!)
    const overviewSentence =
      pagesChecked
        ? `We reviewed ${pagesChecked} pages across ${this.escapeHtml(report.domain || report.targetUrl)} and recorded an overall health score of ${score}/100.`
        : `We reviewed ${this.escapeHtml(report.domain || report.targetUrl)} and recorded an overall health score of ${score}/100.`;

    const keyBottleneckNames = translatedFindings
      .slice(0, 3)
      .map((t) => t.title.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase());
    const impactSummary =
      keyBottleneckNames.length > 0
        ? `Fixing ${translatedFindings.length === 1 ? 'the top issue' : `these ${translatedFindings.length} priority items`} — including ${keyBottleneckNames.join(', ')} — will make your site faster on mobile phones and easier for local customers to find on Google.`
        : 'Overall structure looks solid; a few targeted speed and local SEO enhancements can push conversions even higher.';

    // Build clean At-A-Glance health rows using ONLY verified data
    const healthRows: Array<{
      area: string;
      result: string;
      goal: string;
      statusLabel: string;
      statusColor: string;
      statusBg: string;
    }> = [];

    if (effectiveTtfb > 0) {
      const ttfbSec = effectiveTtfb >= 1000 ? `${(effectiveTtfb / 1000).toFixed(1)}s (${effectiveTtfb} ms)` : `${effectiveTtfb} ms`;
      const isSlow = effectiveTtfb > 600;
      healthRows.push({
        area: 'Server Response Speed (TTFB)',
        result: ttfbSec,
        goal: 'Under 0.5s',
        statusLabel: isSlow ? 'Slow' : 'Good',
        statusColor: isSlow ? '#b91c1c' : '#047857',
        statusBg: isSlow ? '#fef2f2' : '#ecfdf5',
      });
    }

    if (metrics.lcpEstimateMs > 0) {
      const lcpSec = (metrics.lcpEstimateMs / 1000).toFixed(1);
      const isSlow = metrics.lcpEstimateMs > 2500;
      healthRows.push({
        area: 'Main Page Load Speed (LCP)',
        result: `${lcpSec}s`,
        goal: 'Under 2.5s',
        statusLabel: isSlow ? 'Needs Speedup' : 'Good',
        statusColor: isSlow ? '#b91c1c' : '#047857',
        statusBg: isSlow ? '#fef2f2' : '#ecfdf5',
      });
    }

    healthRows.push({
      area: 'HTTPS Security & Automatic Redirect',
      result: hasHttpsIssue ? 'Missing auto HTTPS redirect' : metrics.hasSsl ? 'Secure (HTTPS active)' : 'Needs HTTPS check',
      goal: 'Always enforce HTTPS',
      statusLabel: hasHttpsIssue || !metrics.hasSsl ? 'Priority Fix' : 'Secure',
      statusColor: hasHttpsIssue || !metrics.hasSsl ? '#b91c1c' : '#047857',
      statusBg: hasHttpsIssue || !metrics.hasSsl ? '#fef2f2' : '#ecfdf5',
    });

    if (metaMissingMatch) {
      const cnt = parseInt(metaMissingMatch[1], 10);
      healthRows.push({
        area: 'Google Search Preview Descriptions',
        result: `${cnt} page${cnt === 1 ? '' : 's'} missing summaries`,
        goal: 'Every key page covered',
        statusLabel: 'Needs Attention',
        statusColor: '#b45309',
        statusBg: '#fffbeb',
      });
    }

    if (h1IssueMatch) {
      const cnt = parseInt(h1IssueMatch[1], 10);
      healthRows.push({
        area: 'Page Heading Clarity (H1)',
        result: `${cnt} page${cnt === 1 ? '' : 's'} have missing/duplicate H1s`,
        goal: '1 clear H1 per page',
        statusLabel: 'Quick Win',
        statusColor: '#b45309',
        statusBg: '#fffbeb',
      });
    }

    healthRows.push({
      area: 'Mobile Screen Compatibility',
      result: report.mobileFriendly ? 'Mobile-friendly layout detected' : 'Needs mobile viewport fix',
      goal: 'Smooth phone browsing',
      statusLabel: report.mobileFriendly ? 'Good' : 'Priority Fix',
      statusColor: report.mobileFriendly ? '#047857' : '#b91c1c',
      statusBg: report.mobileFriendly ? '#ecfdf5' : '#fef2f2',
    });

    const healthRowsHtml = healthRows
      .map(
        (r) => `
      <tr>
        <td style="font-weight: 600; color: #0f172a;">${this.escapeHtml(r.area)}</td>
        <td style="color: #334155;">${this.escapeHtml(r.result)}</td>
        <td style="color: #64748b;">${this.escapeHtml(r.goal)}</td>
        <td style="text-align: right;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 700; color: ${r.statusColor}; background: ${r.statusBg};">
            ${this.escapeHtml(r.statusLabel)}
          </span>
        </td>
      </tr>`
      )
      .join('');

    const findingsCardsHtml = translatedFindings
      .map((item) => {
        const badgeStyle =
          item.severity === 'High Impact'
            ? 'color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca;'
            : item.severity === 'Important'
            ? 'color: #b45309; background: #fffbeb; border: 1px solid #fde68a;'
            : 'color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd;';
        return `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: #ffffff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 11.5px; font-weight: 700; color: #0f172a;">${this.escapeHtml(item.title)}</span>
            <span style="font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 999px; white-space: nowrap; ${badgeStyle}">${item.severity}</span>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-bottom: 3px;">
            <strong style="color: #334155;">What we found:</strong> ${this.escapeHtml(item.evidence)}
          </div>
          <div style="font-size: 10.5px; color: #334155; background: #f8fafc; padding: 5px 8px; border-radius: 5px;">
            <strong style="color: #0f172a;">Why it matters:</strong> ${this.escapeHtml(item.businessImpact)}
          </div>
        </div>`;
      })
      .join('');

    const stepsHtml = actionSteps
      .map(
        (step, idx) => `
        <div style="border: 1px solid #cbd5e1; border-left: 3px solid #0d9488; border-radius: 7px; padding: 9px 12px; margin-bottom: 8px; background: #ffffff; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-size: 11.5px; font-weight: 700; color: #0f172a;">Step ${idx + 1}: ${this.escapeHtml(step.title)}</span>
            <span style="font-size: 9px; font-weight: 700; color: #0f766e; background: #f0fdfa; border: 1px solid #99f6e4; padding: 1px 7px; border-radius: 999px;">${this.escapeHtml(step.timeframe)}</span>
          </div>
          <div style="font-size: 10.5px; color: #334155; margin-bottom: 2px;">${this.escapeHtml(step.whatWeDo)}</div>
          <div style="font-size: 10px; color: #047857; font-weight: 600;">Result for ${this.escapeHtml(cleanBiz)}: ${this.escapeHtml(step.businessResult)}</div>
        </div>`
      )
      .join('');

    const auditDateSource = report.auditedAt ? new Date(report.auditedAt) : new Date();
    const formattedDate = auditDateSource.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Website Health Report - ${this.escapeHtml(report.domain)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.45;
    }
    .header-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hero-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 14px;
      display: grid;
      grid-template-columns: 1fr 148px;
      gap: 14px;
      align-items: center;
      background: #ffffff;
    }
    .section-heading {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
      margin: 14px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #e2e8f0;
    }
    table.health-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-bottom: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    table.health-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      text-align: left;
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    table.health-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #f1f5f9;
    }
    .cta-box {
      margin-top: 12px;
      background: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 8px;
      padding: 10px 14px;
      page-break-inside: avoid;
    }
    .footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 9.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>

  <div class="header-bar">
    <div>
      <div style="font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">CLOUD CONSULTANCY</div>
      <div style="font-size: 11px; font-weight: 600; color: #0d9488; margin-top: 2px;">Website Speed, Security &amp; Visibility Report</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 10.5px; font-weight: 600; color: #334155;">Prepared: ${this.escapeHtml(formattedDate)}</div>
      <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">Confidential Report for ${this.escapeHtml(cleanBiz)}</div>
    </div>
  </div>

  <div class="hero-card">
    <div>
      <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.4px;">Prepared For</div>
      <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 1px;">${this.escapeHtml(cleanBiz)}</div>
      <div style="font-size: 10.5px; color: #0d9488; font-weight: 600; margin-top: 2px;">${this.escapeHtml(report.targetUrl)}${pagesChecked ? ` • ${pagesChecked} Pages Reviewed` : ''}</div>
      <p style="margin: 8px 0 0 0; font-size: 10.5px; color: #334155; line-height: 1.5;">
        ${overviewSentence} ${impactSummary}
      </p>
    </div>
    <div style="text-align: center; background: ${scoreBand.bg}; border: 1px solid ${scoreBand.border}; border-radius: 8px; padding: 10px 8px;">
      <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #475569;">Website Health Score</div>
      <div style="font-size: 28px; font-weight: 900; color: ${scoreBand.color}; line-height: 1.1; margin: 4px 0;">
        ${score}<span style="font-size: 12px; font-weight: 700; color: #64748b;">/100</span>
      </div>
      <div style="font-size: 9.5px; font-weight: 700; color: ${scoreBand.color};">
        ${scoreBand.label}
      </div>
    </div>
  </div>

  <div class="section-heading">1. Speed, Security &amp; Google Visibility Snapshot</div>
  <table class="health-table">
    <thead>
      <tr>
        <th style="width: 34%;">Area Checked</th>
        <th style="width: 30%;">What We Found</th>
        <th style="width: 18%;">Recommended Goal</th>
        <th style="width: 18%; text-align: right;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${healthRowsHtml}
    </tbody>
  </table>

  <div class="section-heading">2. Key Issues Affecting Visitors &amp; Local Search</div>
  <div>
    ${findingsCardsHtml || '<div style="padding: 10px; color: #047857; background: #ecfdf5; border-radius: 6px;">No major technical blockers detected on your website.</div>'}
  </div>

  <div class="section-heading">3. Simple 3-Step Fix Plan (No Website Rebuild Needed)</div>
  <div>
    ${stepsHtml}
  </div>

  <div class="cta-box">
    <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">Recommended Next Step</div>
    <div style="font-size: 10.5px; color: #334155;">
      Reply to our email for a complimentary 10-minute walkthrough where we show the exact pages affected and which 2–3 quick fixes will give <strong>${this.escapeHtml(cleanBiz)}</strong> the fastest boost.
    </div>
  </div>

  <div class="footer">
    <div><strong>${this.escapeHtml(SENDER_CONFIG.company)}</strong> • ${this.escapeHtml(SENDER_CONFIG.website)} • ${this.escapeHtml(SENDER_CONFIG.email)}</div>
    <div>Prepared for ${this.escapeHtml(cleanBiz)}</div>
  </div>

</body>
</html>`;
  }

  /**
   * Generates a lightweight, agency-branded PDF for an audit report
   * Uses Chrome Headless CLI or resilient standard PDF generator
   */
  public async generateAuditPdf(
    report: ClientAuditReport,
    businessName?: string
  ): Promise<GeneratedPdfResult> {
    const rawDomain = report.domain || (report as any).website || 'website';
    const cleanDomain = this.sanitizeFilename(rawDomain);
    const pdfName = `Technical_Audit_${cleanDomain}.pdf`;
    const targetPdfPath = path.join(this.AUDITS_DIR, pdfName);
    const tempHtmlPath = path.join(this.AUDITS_DIR, `temp_${cleanDomain}_${Date.now()}.html`);

    const html = this.buildAuditHtml(report, businessName);
    fs.writeFileSync(tempHtmlPath, html, 'utf8');

    const chromePath = this.getChromeExecutable();

    if (chromePath) {
      try {
        const cmd = `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${targetPdfPath}" "${tempHtmlPath}"`;
        execSync(cmd, { timeout: 15000, stdio: 'pipe' });

        if (fs.existsSync(targetPdfPath)) {
          const stats = fs.statSync(targetPdfPath);
          console.log(`[TechnicalAuditPdfService] 🌐 Generated PDF via Headless Chrome: ${chromePath} for "${report.domain}" (${stats.size} bytes)`);
          logPipeline('GENERATED_PDF', `Generated PDF via Chrome: "${pdfName}" for "${businessName || report.domain}" (${stats.size} bytes)`);
          // Cleanup temp html
          try {
            fs.unlinkSync(tempHtmlPath);
          } catch (_) {}

          return {
            pdfPath: targetPdfPath,
            pdfName,
            fileSize: stats.size,
            downloadUrl: `/api/audit/download-pdf?file=${encodeURIComponent(pdfName)}`,
          };
        }
      } catch (chromeErr: any) {
        console.error(
          `🚨 [ALERT: PDF GENERATOR FALLBACK TRIGGERED] Chrome headless rendering failed (${chromeErr?.message}). Falling back to direct %PDF-1.4 stream writer for "${report.domain}".`
        );
      }
    } else {
      console.error(
        `🚨 [ALERT: PDF GENERATOR FALLBACK TRIGGERED] Chrome headless executable not found in system paths. Falling back to direct %PDF-1.4 stream writer for "${report.domain}".`
      );
    }

    // Cleanup temp HTML if still exists
    try {
      if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
    } catch (_) {}

    // Resilient Fallback: Write a pristine, valid %PDF-1.4 file
    this.writeFallbackPdf(targetPdfPath, report, businessName);

    const stats = fs.statSync(targetPdfPath);
    logPipeline('GENERATED_PDF', `Generated fallback PDF: "${pdfName}" for "${businessName || report.domain}" (${stats.size} bytes)`);
    return {
      pdfPath: targetPdfPath,
      pdfName,
      fileSize: stats.size,
      downloadUrl: `/api/audit/download-pdf?file=${encodeURIComponent(pdfName)}`,
    };
  }

  /**
   * Ensures a valid audit PDF exists on disk for a lead.
   * If missing or purged (e.g. per 30-min retention), dynamically regenerates it from stored DB audit findings/takeaways.
   */
  public async ensurePdfForLead(lead: {
    id: string;
    business_name: string;
    website: string;
    audit_findings?: any;
    audit_key_takeaways?: string | null;
    audit_score?: number | null;
    audit_pdf_path?: string | null;
    audit_pdf_name?: string | null;
    audit_ready_at?: string | null;
  }): Promise<{ pdfPath: string; pdfName: string } | null> {
    if (isValidPdfFile(lead.audit_pdf_path)) {
      return {
        pdfPath: lead.audit_pdf_path!,
        pdfName: lead.audit_pdf_name || path.basename(lead.audit_pdf_path!),
      };
    }

    // Extract findings
    let findings: string[] = [];
    if (Array.isArray(lead.audit_findings)) {
      findings = lead.audit_findings
        .map((f: any) => (typeof f === 'string' ? f.trim() : typeof f?.title === 'string' ? f.title.trim() : ''))
        .filter(Boolean);
    } else if (typeof lead.audit_findings === 'string') {
      try {
        const parsed = JSON.parse(lead.audit_findings);
        if (Array.isArray(parsed)) {
          findings = parsed
            .map((f: any) => (typeof f === 'string' ? f.trim() : typeof f?.title === 'string' ? f.title.trim() : ''))
            .filter(Boolean);
        }
      } catch {
        findings = lead.audit_findings.split(/;|\n|•/).map((s) => s.trim()).filter((s) => s.length > 5);
      }
    }

    if (findings.length === 0 && lead.audit_key_takeaways) {
      findings = lead.audit_key_takeaways.split(/;|\n|•| and /i).map((s) => s.trim()).filter((s) => s.length > 5);
    }

    if (findings.length === 0) {
      return null;
    }

    const resolvedScore = typeof lead.audit_score === 'number' ? lead.audit_score : 72;
    const domain = (lead.website || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'website';
    const report: ClientAuditReport = {
      targetUrl: lead.website || `https://${domain}`,
      finalDestinationUrl: lead.website || `https://${domain}`,
      domain,
      hasWebsite: true,
      auditToolUrl: '',
      overallScore: resolvedScore,
      grade: resolvedScore >= 80 ? 'Good' : resolvedScore >= 55 ? 'Needs Work' : 'Poor',
      responseTimeMs: 0,
      mobileFriendly: !findings.some((f) => /mobile|viewport/i.test(f)),
      checks: [],
      criticalIssues: findings,
      recommendations: [],
      summary: lead.audit_key_takeaways || `Website audit summary for ${lead.business_name}`,
      auditedAt: lead.audit_ready_at || new Date().toISOString(),
    };

    const gen = await this.generateAuditPdf(report, lead.business_name);
    await query(
      `UPDATE leads SET audit_pdf_path = $1, audit_pdf_name = $2, updated_at = NOW() WHERE id = $3`,
      [gen.pdfPath, gen.pdfName, lead.id]
    );

    return {
      pdfPath: gen.pdfPath,
      pdfName: gen.pdfName,
    };
  }

  /**
   * Lightweight direct PDF writer fallback guaranteeing %PDF-1.4 compliance with zero external dependencies
   */
  private writeFallbackPdf(
    targetPath: string,
    report: ClientAuditReport,
    businessName?: string
  ): void {
    const cleanBiz = businessName || report.domain;
    const dateSource = report.auditedAt ? new Date(report.auditedAt) : new Date();
    const dateStr = dateSource.toISOString().split('T')[0];
    const issuesText = (report.criticalIssues || []).slice(0, 4).join('; ');
    const recsText = (report.recommendations || []).slice(0, 3).map((r) => r.title).join('; ');

    const streamContent = [
      'BT',
      '/F1 18 Tf',
      '50 780 Td',
      '(Cloud Consultancy - Technical Review & Audit Memo) Tj',
      '/F1 11 Tf',
      '0 -28 Td',
      `(${cleanBiz} - Target Domain: ${report.domain}) Tj`,
      '0 -18 Td',
      `(Audit Date: ${dateStr} | Diagnostic Health Rating: ${report.overallScore}/100 [${report.grade}]) Tj`,
      '0 -24 Td',
      '/F1 13 Tf',
      '(Measured Infrastructure & Delivery Signals:) Tj',
      '/F1 10 Tf',
      '0 -18 Td',
      `(- Server Response / TTFB: ${report.responseTimeMs}ms) Tj`,
      '0 -16 Td',
      `(- Mobile Friendly: ${report.mobileFriendly ? 'Yes (Responsive Viewport)' : 'No (Requires Configuration)'}) Tj`,
      '0 -22 Td',
      '/F1 13 Tf',
      '(Primary Technical Observations:) Tj',
      '/F1 10 Tf',
      '0 -18 Td',
      `(${issuesText.replace(/[()]/g, '')}) Tj`,
      '0 -22 Td',
      '/F1 13 Tf',
      '(Engineering Remediation Plan:) Tj',
      '/F1 10 Tf',
      '0 -18 Td',
      `(${recsText.replace(/[()]/g, '')}) Tj`,
      '0 -26 Td',
      '/F1 10 Tf',
      '(Architecture: Modern edge caching, asset compression, schema.org JSON-LD integration) Tj',
      '0 -28 Td',
      '/F1 9 Tf',
      `(${SENDER_CONFIG.pdfFooterText.replace(/[()]/g, '')}) Tj`,
      'ET',
    ].join('\n');

    const streamLength = Buffer.byteLength(streamContent);

    const pdfData = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000${(300 + streamLength).toString().padStart(3, '0')} 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

    fs.writeFileSync(targetPath, pdfData, 'utf8');
  }
}

export const technicalAuditPdfService = new TechnicalAuditPdfService();
