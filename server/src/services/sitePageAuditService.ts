/**
 * Multi-Page Service, Duplicate H1 & On-Page Keyword Alignment Audit Service
 * - Crawls Homepage + up to ~11 key internal/service pages (zero paid SERP APIs)
 * - Detects exact cross-page Duplicate H1s, Multiple H1s per page, Missing H1s, and Duplicate Titles
 * - Extracts Home + Main Service Pages and up to 10 core services offered + target SEO keywords
 */

export type MajorPageType = 'home' | 'service' | 'location' | 'about' | 'contact' | 'other';

export interface AuditedMajorPage {
  url: string;
  path: string;
  pageType: MajorPageType;
  serviceName: string;
  httpStatus: number;
  title: string;
  titleLength: number;
  metaDescriptionPresent: boolean;
  h1s: string[];
  primaryH1: string;
  h1Count: number;
  h2s: string[];
  targetKeywords: string[];
  keywordSignals: {
    inTitle: boolean;
    inH1: boolean;
    inUrl: boolean;
    inMetaDesc: boolean;
  };
  duplicateH1Group?: string;
  duplicateH1PagesCount?: number;
  duplicateTitle?: boolean;
  issues: string[];
}

export interface DuplicateH1Cluster {
  h1Text: string;
  pagesCount: number;
  paths: string[];
}

export interface OfferedServiceSummary {
  name: string;
  pagePath: string;
  pageUrl: string;
  targetKeywords: string[];
  h1: string;
  title: string;
  issues: string[];
}

export interface MultiPageSeoAuditSummary {
  pagesAudited: number;
  majorPages: AuditedMajorPage[];
  offeredServices: OfferedServiceSummary[];
  duplicateH1AcrossPagesCount: number;
  duplicateH1Clusters: DuplicateH1Cluster[];
  multipleH1PagesCount: number;
  missingH1PagesCount: number;
  duplicateTitlePagesCount: number;
  missingMetaDescPagesCount: number;
}

interface CandidateLink {
  url: string;
  path: string;
  label: string;
  inNav: boolean;
  fromSitemap: boolean;
  score: number;
}

const EXCLUDED_PATH_REGEX =
  /\/(privacy|terms|legal|cookie|cookies|disclaimer|accessibility|wp-admin|wp-login|wp-json|wp-content|feed|cart|checkout|my-account|account|login|register|signup|search|tag|category|author|page\/\d+|comments|xmlrpc|cdn-cgi)\b/i;

const ASSET_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|ico|pdf|css|js|xml|txt|zip|mp4|mp3|woff2?)$/i;

const SERVICE_PATH_REGEX =
  /(service|solution|treatment|procedure|therapy|repair|install|maintenance|specialty|specialties|practice-area|offering|what-we-do|package|program|clean|whiten|crown|implant|ortho|hvac|plumb|roof|remodel|consult|audit|seo|web|market|insur|tax|care|class|training|membership)/i;

const NON_SERVICE_HEADINGS =
  /^(home|welcome|about|about us|contact|contact us|get in touch|get a quote|request a quote|book now|schedule|testimonials|reviews|client reviews|our team|meet the team|faq|frequently asked questions|blog|news|gallery|portfolio|careers|hours|location|locations|directions|quick links|follow us|newsletter|subscribe|privacy policy|terms|menu|navigation|why choose us|our mission|our story)$/i;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'into', 'is',
  'it', 'near', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'this', 'to', 'us', 'we',
  'with', 'your', 'best', 'top', 'page', 'home', 'welcome', 'official', 'website', 'site',
  'inc', 'llc', 'ltd', 'corp', 'co', 'company',
]);

export class SitePageAuditService {
  private readonly MAX_PAGES_TO_CRAWL = 12; // Home + up to 11 key/service pages

  private decodeEntities(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;|&rsquo;|&lsquo;/gi, "'")
      .replace(/&ndash;|&mdash;/gi, '-')
      .replace(/&nbsp;/gi, ' ');
  }

  private stripHtmlText(rawHtml: string): string {
    if (!rawHtml) return '';
    const cleaned = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    return this.decodeEntities(cleaned).replace(/\s+/g, ' ').trim();
  }

  private normalizeTextKey(raw: string): string {
    return (raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private toTitleCase(raw: string): string {
    return raw
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private extractPageElements(html: string) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this.stripHtmlText(titleMatch[1]) : '';

    const descMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
      html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    const metaDesc = descMatch ? this.decodeEntities(descMatch[1]).trim() : '';

    // Extract ALL <h1> elements (if <h1> wraps an image logo, preserve its alt text so duplicate logo H1s are still caught)
    const h1s: string[] = [];
    const h1Regex = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
    let m: RegExpExecArray | null;
    while ((m = h1Regex.exec(html)) !== null) {
      let text = this.stripHtmlText(m[1]);
      if (!text) {
        const imgAlt = m[1].match(/<img[^>]*alt=["']([^"']+)["']/i);
        if (imgAlt && imgAlt[1].trim()) {
          text = `[Logo: ${this.decodeEntities(imgAlt[1]).trim()}]`;
        }
      }
      if (text) h1s.push(text.slice(0, 180));
    }

    const h2s: string[] = [];
    const h2Regex = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
    while ((m = h2Regex.exec(html)) !== null && h2s.length < 16) {
      const text = this.stripHtmlText(m[1]);
      if (text && text.length >= 3 && text.length <= 120) {
        h2s.push(text);
      }
    }

    return {
      title,
      metaDesc,
      h1s,
      h2s,
    };
  }

  private classifyPageType(urlPath: string, navLabel?: string): MajorPageType {
    const p = (urlPath || '/').toLowerCase();
    if (p === '/' || p === '/home' || p === '/index.html' || p === '/index.php') return 'home';
    if (/\/(contact|book|appointment|quote|estimate|schedule)/i.test(p)) return 'contact';
    if (/\/(about|team|our-story|our-team|company|who-we-are|doctors|staff)/i.test(p)) return 'about';
    if (/\/(location|locations|areas-served|service-area|service-areas|cities)/i.test(p)) return 'location';

    const combined = `${p} ${navLabel || ''}`;
    if (SERVICE_PATH_REGEX.test(combined)) return 'service';

    // Single-segment non-utility slugs (e.g. /plumbing, /teeth-whitening, /roof-repair)
    const segments = p.split('/').filter(Boolean);
    if (segments.length >= 1 && segments.length <= 3 && !/blog|news|events|faq|gallery|testimonials|reviews|pricing/i.test(p)) {
      return 'service';
    }
    return 'other';
  }

  private deriveServiceName(
    pageType: MajorPageType,
    urlPath: string,
    navLabel: string,
    title: string,
    primaryH1: string
  ): string {
    if (pageType === 'home') return 'Homepage';
    if (navLabel && navLabel.length >= 3 && navLabel.length <= 65 && !NON_SERVICE_HEADINGS.test(navLabel)) {
      return navLabel;
    }

    const slug = urlPath.split('/').filter(Boolean).pop() || '';
    const cleanSlug = slug.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ').trim();
    if (cleanSlug && cleanSlug.length >= 3 && !/^(services?|solutions?|products?|treatments?|pages?)$/i.test(cleanSlug)) {
      return this.toTitleCase(cleanSlug);
    }

    const cleanH1 = primaryH1.replace(/^\[Logo:\s*([^\]]+)\]$/i, '$1').trim();
    if (cleanH1 && cleanH1.length <= 65 && !NON_SERVICE_HEADINGS.test(cleanH1)) {
      return cleanH1;
    }

    if (title) {
      const firstSeg = title.split(/\s*[|\-–•:]\s*/)[0]?.trim();
      if (firstSeg && firstSeg.length >= 3 && firstSeg.length <= 65) return firstSeg;
    }

    return this.toTitleCase(cleanSlug || 'Service Page');
  }

  private deriveTargetKeywords(params: {
    pageType: MajorPageType;
    serviceName: string;
    urlPath: string;
    title: string;
    primaryH1: string;
    domain: string;
  }): string[] {
    const keywords: string[] = [];
    const seen = new Set<string>();
    const domainBase = (params.domain || '').split('.')[0].toLowerCase();

    const addKw = (raw: string) => {
      const cleaned = raw
        .replace(/\[Logo:\s*([^\]]+)\]/gi, '$1')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!cleaned || cleaned.length < 4 || cleaned.length > 60) return;
      const words = cleaned.split(/\s+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
      if (words.length === 0) return;
      const candidate = words.slice(0, 5).join(' ');
      if (candidate === domainBase || NON_SERVICE_HEADINGS.test(candidate)) return;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        keywords.push(candidate);
      }
    };

    if (params.pageType !== 'home') {
      addKw(params.serviceName);
    }

    // URL slug tokens often reveal cleanest intended primary keyword
    const segments = params.urlPath.split('/').filter(Boolean);
    const lastSlug = segments[segments.length - 1] || '';
    if (lastSlug) {
      addKw(lastSlug.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' '));
    }

    if (params.title) {
      const segmentsTitle = params.title.split(/\s*[|\-–•:]\s*/);
      segmentsTitle.slice(0, 2).forEach((seg) => addKw(seg));
    }

    if (params.primaryH1) {
      addKw(params.primaryH1);
    }

    return keywords.slice(0, 4);
  }

  private extractCandidates(baseUrl: string, domain: string, html: string): CandidateLink[] {
    const map = new Map<string, CandidateLink>();
    const navMatch = html.match(/<(header|nav)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
    const navHtmlCombined = navMatch.join('\n');

    const scanLinks = (sourceHtml: string, isNavSection: boolean) => {
      const aRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = aRegex.exec(sourceHtml)) !== null) {
        const rawHref = (m[1] || '').trim();
        if (
          !rawHref ||
          rawHref.startsWith('#') ||
          /^(javascript:|mailto:|tel:|sms:)/i.test(rawHref)
        ) {
          continue;
        }

        let resolved: URL;
        try {
          resolved = new URL(rawHref, baseUrl);
        } catch {
          continue;
        }

        const host = resolved.hostname.replace(/^www\./i, '').toLowerCase();
        if (host !== domain.toLowerCase()) continue;

        const cleanPath = resolved.pathname.replace(/\/+$/, '') || '/';
        if (cleanPath === '/' || ASSET_EXT_REGEX.test(cleanPath) || EXCLUDED_PATH_REGEX.test(cleanPath)) {
          continue;
        }
        if (resolved.search && /\?(s=|replytocom=|add-to-cart=|filter|sort|utm_)/i.test(resolved.search)) {
          continue;
        }

        const fullUrl = `${resolved.origin}${cleanPath}`;
        const label = this.stripHtmlText(m[2]).slice(0, 70);
        const pageType = this.classifyPageType(cleanPath, label);

        let score = isNavSection ? 30 : 10;
        if (pageType === 'service') score += 40;
        else if (pageType === 'location') score += 20;
        else if (pageType === 'about') score += 12;
        else if (pageType === 'contact') score += 8;
        if (SERVICE_PATH_REGEX.test(cleanPath)) score += 20;
        if (label && label.length >= 3 && label.length <= 45) score += 10;
        if (cleanPath.split('/').filter(Boolean).length <= 2) score += 10;

        const existing = map.get(cleanPath);
        if (!existing || score > existing.score) {
          map.set(cleanPath, {
            url: fullUrl,
            path: cleanPath,
            label: existing?.label && existing.label.length >= label.length ? existing.label : label,
            inNav: Boolean(existing?.inNav || isNavSection),
            fromSitemap: false,
            score,
          });
        }
      }
    };

    if (navHtmlCombined) scanLinks(navHtmlCombined, true);
    scanLinks(html, false);

    return Array.from(map.values());
  }

  private async fetchSitemapCandidates(baseUrl: string, domain: string): Promise<CandidateLink[]> {
    const out: CandidateLink[] = [];
    try {
      const origin = new URL(baseUrl).origin;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2200);
      const resp = await fetch(`${origin}/sitemap.xml`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloudConsultancyAuditBot/1.0)' },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!resp.ok) return out;

      const xml = await resp.text();
      const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
      let m: RegExpExecArray | null;
      while ((m = locRegex.exec(xml)) !== null && out.length < 40) {
        try {
          const parsed = new URL(m[1].trim());
          const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
          if (host !== domain.toLowerCase()) continue;
          const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
          if (cleanPath === '/' || ASSET_EXT_REGEX.test(cleanPath) || EXCLUDED_PATH_REGEX.test(cleanPath)) {
            continue;
          }
          const pageType = this.classifyPageType(cleanPath);
          let score = pageType === 'service' ? 35 : pageType === 'location' ? 20 : 10;
          if (SERVICE_PATH_REGEX.test(cleanPath)) score += 20;
          if (cleanPath.split('/').filter(Boolean).length <= 2) score += 8;
          out.push({
            url: `${parsed.origin}${cleanPath}`,
            path: cleanPath,
            label: '',
            inNav: false,
            fromSitemap: true,
            score,
          });
        } catch {}
      }
    } catch {}
    return out;
  }

  private async fetchPageHtml(url: string): Promise<{ httpStatus: number; html: string } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const resp = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('html') && contentType !== '') {
        return null;
      }
      const html = await resp.text();
      return { httpStatus: resp.status, html };
    } catch {
      return null;
    }
  }

  /**
   * Executes real multi-page crawl for Home + main service/key pages,
   * detecting cross-page Duplicate H1s, Multiple H1s, Duplicate Titles, Offered Services (up to 10),
   * and On-Page Target Keywords.
   */
  public async analyzeSitePages(
    homeUrl: string,
    domain: string,
    existingHomeHtml?: string,
    existingHomeStatus = 200
  ): Promise<MultiPageSeoAuditSummary | null> {
    let homeHtml = existingHomeHtml || '';
    let homeStatus = existingHomeStatus;

    if (!homeHtml) {
      const fetched = await this.fetchPageHtml(homeUrl);
      if (!fetched || !fetched.html) return null;
      homeHtml = fetched.html;
      homeStatus = fetched.httpStatus;
    }

    const htmlCandidates = this.extractCandidates(homeUrl, domain, homeHtml);
    const sitemapCandidates = htmlCandidates.length < 8 ? await this.fetchSitemapCandidates(homeUrl, domain) : [];

    const mergedMap = new Map<string, CandidateLink>();
    for (const c of [...htmlCandidates, ...sitemapCandidates]) {
      const prev = mergedMap.get(c.path);
      if (!prev) {
        mergedMap.set(c.path, c);
      } else {
        mergedMap.set(c.path, {
          ...prev,
          label: prev.label || c.label,
          inNav: prev.inNav || c.inNav,
          score: Math.max(prev.score, c.score),
        });
      }
    }

    const topSubpages = Array.from(mergedMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.MAX_PAGES_TO_CRAWL - 1);

    const auditedPages: AuditedMajorPage[] = [];

    const buildPageRecord = (
      url: string,
      urlPath: string,
      navLabel: string,
      httpStatus: number,
      html: string
    ): AuditedMajorPage => {
      const pageType = this.classifyPageType(urlPath, navLabel);
      const parsed = this.extractPageElements(html);
      const primaryH1 = parsed.h1s[0] || '';
      const serviceName = this.deriveServiceName(pageType, urlPath, navLabel, parsed.title, primaryH1);
      const targetKeywords = this.deriveTargetKeywords({
        pageType,
        serviceName,
        urlPath,
        title: parsed.title,
        primaryH1,
        domain,
      });

      const primaryKw = targetKeywords[0] || '';
      const coreTerms = primaryKw.split(/\s+/).filter((w) => w.length >= 3);
      const containsCore = (haystack: string) => {
        if (!haystack || coreTerms.length === 0) return false;
        const lower = haystack.toLowerCase();
        const matches = coreTerms.filter((t) => lower.includes(t)).length;
        return matches >= Math.min(2, coreTerms.length);
      };

      const issues: string[] = [];
      if (parsed.h1s.length === 0) {
        issues.push('Missing H1 tag');
      } else if (parsed.h1s.length > 1) {
        issues.push(`Multiple H1 tags on page (${parsed.h1s.length})`);
      }
      if (!parsed.title) {
        issues.push('Missing <title> tag');
      } else if (primaryKw && pageType === 'service' && !containsCore(parsed.title)) {
        issues.push(`Primary keyword "${primaryKw}" missing from <title>`);
      }
      if (!parsed.metaDesc) {
        issues.push('Missing meta description');
      }

      return {
        url,
        path: urlPath,
        pageType,
        serviceName,
        httpStatus,
        title: parsed.title,
        titleLength: parsed.title.length,
        metaDescriptionPresent: Boolean(parsed.metaDesc),
        h1s: parsed.h1s,
        primaryH1,
        h1Count: parsed.h1s.length,
        h2s: parsed.h2s,
        targetKeywords,
        keywordSignals: {
          inTitle: containsCore(parsed.title),
          inH1: containsCore(primaryH1),
          inUrl: containsCore(urlPath.replace(/[-_/]+/g, ' ')),
          inMetaDesc: containsCore(parsed.metaDesc),
        },
        issues,
      };
    };

    const homeParsedUrl = (() => {
      try {
        const u = new URL(homeUrl);
        return `${u.origin}${u.pathname.replace(/\/+$/, '') || '/'}`;
      } catch {
        return homeUrl;
      }
    })();

    const homeRecord = buildPageRecord(homeParsedUrl, '/', 'Homepage', homeStatus, homeHtml);
    auditedPages.push(homeRecord);

    // Controlled concurrency batches (4 pages at a time)
    const batchSize = 4;
    for (let i = 0; i < topSubpages.length; i += batchSize) {
      const batch = topSubpages.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        batch.map(async (c) => {
          const res = await this.fetchPageHtml(c.url);
          if (!res || !res.html) return null;
          return buildPageRecord(c.url, c.path, c.label, res.httpStatus, res.html);
        })
      );
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) {
          auditedPages.push(s.value);
        }
      }
    }

    // Cross-Page Duplicate H1 Detection
    const h1Groups = new Map<string, { display: string; pages: AuditedMajorPage[] }>();
    const titleGroups = new Map<string, AuditedMajorPage[]>();

    for (const p of auditedPages) {
      const h1Key = this.normalizeTextKey(p.primaryH1);
      if (h1Key && h1Key.length >= 2) {
        const group = h1Groups.get(h1Key) || { display: p.primaryH1, pages: [] };
        group.pages.push(p);
        h1Groups.set(h1Key, group);
      }

      const titleKey = this.normalizeTextKey(p.title);
      if (titleKey && titleKey.length >= 3) {
        const group = titleGroups.get(titleKey) || [];
        group.push(p);
        titleGroups.set(titleKey, group);
      }
    }

    const duplicateH1Clusters: DuplicateH1Cluster[] = [];
    let duplicateH1AcrossPagesCount = 0;

    h1Groups.forEach((group) => {
      if (group.pages.length >= 2) {
        duplicateH1AcrossPagesCount += group.pages.length;
        duplicateH1Clusters.push({
          h1Text: group.display,
          pagesCount: group.pages.length,
          paths: group.pages.map((p) => p.path),
        });
        for (const p of group.pages) {
          p.duplicateH1Group = group.display;
          p.duplicateH1PagesCount = group.pages.length;
          p.issues.unshift(`Duplicate H1 shared across ${group.pages.length} pages ("${group.display.slice(0, 60)}")`);
        }
      }
    });

    duplicateH1Clusters.sort((a, b) => b.pagesCount - a.pagesCount);

    let duplicateTitlePagesCount = 0;
    titleGroups.forEach((pages) => {
      if (pages.length >= 2) {
        duplicateTitlePagesCount += pages.length;
        for (const p of pages) {
          p.duplicateTitle = true;
          p.issues.push(`Identical <title> shared across ${pages.length} pages`);
        }
      }
    });

    // Extract Offered Services (up to 10 core services) from Service pages + fallback Home service headings
    const offeredServices: OfferedServiceSummary[] = [];
    const seenServices = new Set<string>();

    const servicePages = auditedPages.filter((p) => p.pageType === 'service');
    for (const sp of servicePages) {
      const key = this.normalizeTextKey(sp.serviceName);
      if (!key || seenServices.has(key) || NON_SERVICE_HEADINGS.test(sp.serviceName)) continue;
      seenServices.add(key);
      offeredServices.push({
        name: sp.serviceName,
        pagePath: sp.path,
        pageUrl: sp.url,
        targetKeywords: sp.targetKeywords,
        h1: sp.primaryH1 || '(Missing H1)',
        title: sp.title || '(Missing Title)',
        issues: sp.issues,
      });
      if (offeredServices.length >= 10) break;
    }

    // If single-page or minimal-nav website exposes services via H2 headings on Homepage, fill up to 10
    if (offeredServices.length < 10) {
      for (const h2 of homeRecord.h2s) {
        if (offeredServices.length >= 10) break;
        const cleanH2 = h2.trim();
        if (cleanH2.length < 4 || cleanH2.length > 60 || NON_SERVICE_HEADINGS.test(cleanH2)) continue;
        // Skip full marketing sentences that aren't concise service names
        if (cleanH2.split(/\s+/).length > 6) continue;
        const key = this.normalizeTextKey(cleanH2);
        if (!key || seenServices.has(key)) continue;
        seenServices.add(key);
        offeredServices.push({
          name: cleanH2,
          pagePath: '/',
          pageUrl: homeRecord.url,
          targetKeywords: [cleanH2.toLowerCase()],
          h1: homeRecord.primaryH1 || '(Missing H1)',
          title: homeRecord.title || '(Missing Title)',
          issues: ['Listed on homepage without dedicated SEO service page/H1'],
        });
      }
    }

    return {
      pagesAudited: auditedPages.length,
      majorPages: auditedPages,
      offeredServices,
      duplicateH1AcrossPagesCount,
      duplicateH1Clusters,
      multipleH1PagesCount: auditedPages.filter((p) => p.h1Count > 1).length,
      missingH1PagesCount: auditedPages.filter((p) => p.h1Count === 0).length,
      duplicateTitlePagesCount,
      missingMetaDescPagesCount: auditedPages.filter((p) => !p.metaDescriptionPresent).length,
    };
  }
}

export const sitePageAuditService = new SitePageAuditService();
