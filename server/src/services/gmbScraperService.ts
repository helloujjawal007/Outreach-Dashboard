import { spawn, execSync, type ChildProcess } from 'child_process';
import http from 'http';
import net from 'net';
import dns from 'dns/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { query } from '../config/db';
import { whatsappValidator } from './whatsappValidator';
import { automatedIntakeEngine } from './automatedIntakeEngine';
import { emailValidatorService } from './emailValidatorService';
import { workflowRoutingService } from './workflowRoutingService';
import { logPipeline } from '../utils/pipelineLogger';
import { ensurePhoneWithCountryCode } from '../utils/phoneCountryCode';

export interface ScrapedLeadSocials {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
}

export interface ScrapedLeadItem {
  id?: string;
  businessName: string;
  category: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city?: string;
  state?: string;
  country: string;
  rating: number;
  reviewsCount: number;
  googleMapsUrl: string;
  placeId?: string;
  emailDiscovered: boolean;
  emailSource?: string;
  socials?: ScrapedLeadSocials;
}

export interface GmbLocationTarget {
  country: string;
  state?: string;
  city?: string;
  display?: string;
}

export interface GmbSearchParams {
  category?: string;
  categories?: string[];
  continent?: string;
  country?: string;
  state?: string;
  city?: string;
  locations?: Array<GmbLocationTarget | string>;
  limit: number;
  leadsPerLocation?: number;
  requireWebsite?: boolean;
  requireEmail?: boolean;
}


export interface GmbImportParams {
  leads: ScrapedLeadItem[];
  listId?: string;
  batchName?: string;
  scheduledStartTime?: string | Date;
}

export interface GmbImportResult {
  success: boolean;
  importedCount: number;
  duplicateCount: number;
  batchId?: string;
  batchName?: string;
  leads: any[];
  automatedIntake?: any;
}

export class GmbScraperService {
  private portCounter = 9500;
  private dnsCache = new Map<string, { resolved: boolean; expires: number }>();
  public lastExcludedDuplicatesCount = 0;

  /**
   * Resolves the Google Chrome or Chromium executable path across macOS, Linux (Render/Docker/Ubuntu), and Windows.
   */
  public getChromeExecutable(): string | null {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    // Check project-local downloaded chrome or puppeteer cache
    const searchDirs = [
      path.resolve(process.cwd(), 'chrome-bin'),
      path.resolve(process.cwd(), '.cache', 'chrome'),
      path.join(os.homedir(), '.cache', 'puppeteer'),
      '/opt/render/.cache/puppeteer',
      '/opt/render/project/src/chrome-bin',
      '/opt/render/project/src/server/chrome-bin',
    ];

    // 1. High Priority: Look specifically for chrome-headless-shell (optimized for headless server containers, zero D-Bus overhead)
    for (const d of searchDirs) {
      if (fs.existsSync(d)) {
        try {
          const findShell = (dir: string, depth = 0): string | null => {
            if (depth > 6) return null;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isFile() && entry.name === 'chrome-headless-shell') {
                return full;
              }
              if (entry.isDirectory()) {
                const sub = findShell(full, depth + 1);
                if (sub) return sub;
              }
            }
            return null;
          };
          const found = findShell(d);
          if (found) {
            console.log(`[GmbScraperService] Found preferred chrome-headless-shell at ${found}`);
            return found;
          }
        } catch (_) {}
      }
    }

    // 2. Fallback: Search for standard local chrome/chromium binaries
    for (const d of searchDirs) {
      if (fs.existsSync(d)) {
        try {
          const findBin = (dir: string, depth = 0): string | null => {
            if (depth > 5) return null;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isFile() && (entry.name === 'chrome' || entry.name === 'google-chrome' || entry.name === 'chromium')) {
                return full;
              }
              if (entry.isDirectory()) {
                const sub = findBin(full, depth + 1);
                if (sub) return sub;
              }
            }
            return null;
          };
          const found = findBin(d);
          if (found) return found;
        } catch (_) {}
      }
    }

    const platform = process.platform;
    const candidates: string[] = [];

    if (platform === 'darwin') {
      candidates.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
      );
    } else if (platform === 'linux') {
      candidates.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/opt/google/chrome/chrome',
        '/snap/bin/chromium',
        '/usr/lib/chromium/chromium',
        '/usr/lib/chromium-browser/chromium-browser'
      );
    } else if (platform === 'win32') {
      candidates.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Chromium\\Application\\chrome.exe'
      );
    }

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }

    return null;
  }

  /**
   * Ensures Chrome or Chromium is available. On Linux (Render/Docker), if not found,
   * attempts auto-installation into ./chrome-bin using @puppeteer/browsers.
   */
  public async ensureChromeInstalled(): Promise<string | null> {
    let executable = this.getChromeExecutable();
    if (executable) return executable;

    if (process.platform === 'linux') {
      try {
        console.log('[GmbScraperService] Headless Chrome not found on Linux. Attempting auto-installation via @puppeteer/browsers...');
        const targetDir = path.resolve(process.cwd(), 'chrome-bin');
        execSync(`npx -y @puppeteer/browsers install chrome-headless-shell@stable --path "${targetDir}" || npx -y @puppeteer/browsers install chrome@stable --path "${targetDir}"`, {
          stdio: 'inherit',
          timeout: 90000,
        });
        executable = this.getChromeExecutable();
        if (executable) {
          console.log(`[GmbScraperService] Successfully installed Chrome at ${executable}`);
          return executable;
        }
      } catch (installErr: any) {
        console.error('[GmbScraperService] Auto-install of Chrome failed:', installErr?.message);
      }
    }

    return null;
  }

  /**
   * Finds an available free ephemeral TCP port for Chrome remote debugging
   */
  public async getFreePort(startPort = 9500): Promise<number> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => {
        resolve(this.getFreePort(startPort + 1));
      });
      server.listen(startPort, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
    });
  }

  /**
   * Polls Chrome CDP endpoint with retries until it is ready to accept WebSocket connections
   */
  public async waitForCdpReady(port: number, timeoutMs = 30000, proc?: ChildProcess | null): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (proc && proc.exitCode !== null) {
        return null;
      }
      try {
        const page = await new Promise<any>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                const list = JSON.parse(data);
                if (Array.isArray(list) && list.length > 0) {
                  const targetPage =
                    list.find((item: any) => item.type === 'page' && item.webSocketDebuggerUrl) ||
                    list.find((item: any) => item.webSocketDebuggerUrl);
                  if (targetPage) {
                    return resolve(targetPage);
                  }
                }
              } catch (_) {}
              resolve(null);
            });
          });
          req.on('error', () => resolve(null));
          req.setTimeout(1000, () => req.destroy());
        });
        if (page) return page;

        // Fallback: check /json/version
        const ver = await new Promise<any>((resolve) => {
          const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                const j = JSON.parse(data);
                if (j.webSocketDebuggerUrl) return resolve(j);
              } catch (_) {}
              resolve(null);
            });
          });
          req.on('error', () => resolve(null));
          req.setTimeout(1000, () => req.destroy());
        });
        if (ver) {
          const newPage = await new Promise<any>((resolve) => {
            const req = http.request(
              {
                hostname: '127.0.0.1',
                port,
                path: '/json/new',
                method: 'PUT',
                timeout: 1200,
              },
              (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                  try {
                    const p = JSON.parse(data);
                    if (p.webSocketDebuggerUrl) return resolve(p);
                  } catch (_) {}
                  resolve(null);
                });
              }
            );
            req.on('error', () => resolve(null));
            req.on('timeout', () => {
              req.destroy();
              resolve(null);
            });
            req.end();
          });
          if (newPage) return newPage;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  /**
   * Unwraps Google Maps redirect wrappers (/url?q=...), ensures protocol,
   * strips GMB tracking parameters, and validates business domain rules.
   */
  public normalizeGmbWebsiteUrl(rawUrl?: string | null): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '';

    let candidate = rawUrl.trim();
    if (!candidate) return '';

    if (candidate.startsWith('/url?') || candidate.startsWith('url?')) {
      candidate = `https://www.google.com/${candidate.replace(/^\/+/, '')}`;
    }

    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      if (
        (parsed.hostname === 'google.com' || parsed.hostname.endsWith('.google.com')) &&
        parsed.pathname === '/url'
      ) {
        const unwrapped = parsed.searchParams.get('q') || parsed.searchParams.get('url');
        if (unwrapped) {
          candidate = unwrapped.trim();
          if (!/^https?:\/\//i.test(candidate)) {
            candidate = `https://${candidate}`;
          }
        }
      }

      const finalUrl = new URL(candidate);
      if (!['http:', 'https:'].includes(finalUrl.protocol)) return '';
      if (!workflowRoutingService.hasValidWebsite(finalUrl.toString())) return '';

      for (const param of [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        'utm_id',
        'gclid',
        'fbclid',
        'rwg_token',
        'rclk',
      ]) {
        finalUrl.searchParams.delete(param);
      }

      const cleaned = finalUrl.toString();
      return finalUrl.pathname === '/' && !finalUrl.search ? cleaned.replace(/\/$/, '') : cleaned;
    } catch {
      return '';
    }
  }

  /**
   * Actively opens and verifies whether a website URL is genuinely live, resolving, and opening in the backend.
   * - Performs live DNS resolution to ensure hostname exists.
   * - Sends an HTTP request with browser headers (8500ms timeout) + HEAD fallback on origin.
   */
  public async verifyWebsiteLive(
    rawUrl: string
  ): Promise<{ isLive: boolean; verifiedUrl: string; status?: number; error?: string; dnsResolved?: boolean }> {
    const targetUrl = this.normalizeGmbWebsiteUrl(rawUrl);
    if (!targetUrl) {
      return { isLive: false, verifiedUrl: '', error: 'Empty, malformed, or non-business URL', dnsResolved: false };
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return { isLive: false, verifiedUrl: '', error: 'Malformed URL', dnsResolved: false };
    }

    // 1. Live DNS Verification: check that the domain exists and resolves to an IP address (with 10-min cache)
    const now = Date.now();
    const cachedDns = this.dnsCache.get(parsed.hostname);
    if (!cachedDns || cachedDns.expires < now) {
      try {
        await dns.lookup(parsed.hostname);
        this.dnsCache.set(parsed.hostname, { resolved: true, expires: now + 600000 });
      } catch (dnsErr: any) {
        const code = dnsErr?.code || '';
        const isHardMissing = code === 'ENOTFOUND' || code === 'EAI_NONAME';
        if (isHardMissing) {
          this.dnsCache.set(parsed.hostname, { resolved: false, expires: now + 600000 });
        }
        return {
          isLive: false,
          verifiedUrl: '',
          dnsResolved: isHardMissing ? false : undefined,
          error: `DNS resolution failed: ${code || dnsErr.message}`,
        };
      }
    } else if (!cachedDns.resolved) {
      return { isLive: false, verifiedUrl: '', dnsResolved: false, error: 'DNS resolution failed (cached)' };
    }

    // 2. HTTP connection check (8500ms allows cross-region redirects & WordPress/CMS TTFB)
    const browserHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1',
    };

    const isAcceptableStatus = (status: number) =>
      (status >= 200 && status < 400) || [401, 403, 405, 406, 429].includes(status);

    let lastStatus: number | undefined;
    let lastError = 'Connection failed';

    for (const attempt of [
      { url: targetUrl, method: 'GET' as const, timeoutMs: 3500 },
      { url: parsed.origin, method: 'HEAD' as const, timeoutMs: 2500 },
    ]) {
      try {
        const res = await fetch(attempt.url, {
          method: attempt.method,
          headers: browserHeaders,
          redirect: 'follow',
          signal: AbortSignal.timeout(attempt.timeoutMs),
        });
        // Cancel body download immediately when checking reachability
        res.body?.cancel().catch(() => {});
        lastStatus = res.status;

        if (res.ok || isAcceptableStatus(res.status)) {
          const finalUrl = this.normalizeGmbWebsiteUrl(res.url || attempt.url) || targetUrl;
          return { isLive: true, verifiedUrl: finalUrl, status: res.status, dnsResolved: true };
        }
        lastError = `HTTP ${res.status}`;
      } catch (err: any) {
        lastError = err?.message || 'Connection failed';
      }
    }

    return { isLive: false, verifiedUrl: '', status: lastStatus, error: lastError, dnsResolved: true };
  }

  /**
   * Searches Google Maps & Google Business Profiles for matching businesses
   */
  public async searchGmb(params: GmbSearchParams): Promise<ScrapedLeadItem[]> {
    const START_TIME = Date.now();
    // Respect Render 100s gateway ceiling (~78s safe budget) while granting full ~115s budget on local/self-hosted hosts
    const defaultBudgetMs = process.env.RENDER ? 78000 : 115000;
    const configuredBudgetMs = parseInt(process.env.SCRAPER_TIMEOUT_MS || String(defaultBudgetMs), 10);
    const totalBudgetMs = Math.max(48000, Number.isFinite(configuredBudgetMs) ? configuredBudgetMs : defaultBudgetMs);
    const HARD_DEADLINE = START_TIME + totalBudgetMs;
    const CDP_DEADLINE = START_TIME + Math.round(totalBudgetMs * 0.55);

    const { category, categories, country, state, city = '', limit = 10, leadsPerLocation } = params;
    const cleanCity = (city || '').trim();
    const cleanState = (state || '').trim();
    const cleanCountry = (country || 'USA').trim();

    let targetCategories: string[] = [];
    if (Array.isArray(categories) && categories.length > 0) {
      targetCategories = categories.map((c) => String(c).trim()).filter(Boolean);
    } else if (category && typeof category === 'string' && category.trim()) {
      targetCategories = category.split(',').map((c) => c.trim()).filter(Boolean);
    }
    if (targetCategories.length === 0) {
      targetCategories = ['Business'];
    }

    const locationQueries: string[] = [];
    if (Array.isArray(params.locations) && params.locations.length > 0) {
      for (const loc of params.locations) {
        if (typeof loc === 'string') {
          const s = loc.trim();
          if (s && !locationQueries.includes(s)) locationQueries.push(s);
        } else if (loc && typeof loc === 'object') {
          const parts = [loc.city, loc.state, loc.country].filter(Boolean).map((p) => String(p).trim()).filter(Boolean);
          const full = parts.join(', ');
          if (full && !locationQueries.includes(full)) {
            locationQueries.push(full);
          } else if (loc.display && !locationQueries.includes(loc.display.trim())) {
            locationQueries.push(loc.display.trim());
          }
        }
      }
    }
    if (locationQueries.length === 0) {
      const defaultLoc = [cleanCity, cleanState, cleanCountry].filter(Boolean).join(', ');
      if (defaultLoc) locationQueries.push(defaultLoc);
    }

    const effectiveLimit = Math.max(1, limit);
    const candidateMultiplier = params.requireEmail ? 2 : 1;
    const targetCandidateLimit = Math.min(500, effectiveLimit * candidateMultiplier);
    const perLocationQuota = leadsPerLocation && leadsPerLocation > 0 ? leadsPerLocation : effectiveLimit;

    console.log(
      `[GmbScraperService] Initiating search for [${targetCategories.join(', ')}] across ${locationQueries.length} location(s): [${locationQueries.join('; ')}] (Target limit: ${effectiveLimit}, Leads/location quota: ${perLocationQuota}, RequireEmail: ${Boolean(params.requireEmail)})`
    );

    // Pre-flight check: ensure Chrome/Chromium is installed or can be downloaded
    const chromeBin = await this.ensureChromeInstalled();
    if (!chromeBin) {
      throw new Error(
        `Headless Chrome/Chromium is not installed on this server (${process.platform}). ` +
        `To enable lead scraping on Render, set Build Command to: 'npm run render:build' (or deploy via Docker).`
      );
    }

    const rawList: ScrapedLeadItem[] = [];
    const existingNames = new Set<string>();
    const existingPhones = new Set<string>();
    let lastCdpError: string | null = null;

    this.lastExcludedDuplicatesCount = 0;
    let excludedDbDuplicatesCount = 0;

    // Load existing leads & clients from CRM database to automatically exclude known leads
    const dbRes = await query<{ business_name: string; phone: string | null; email: string | null; website: string | null }>(
      `SELECT business_name, phone, email, website FROM leads WHERE deleted_at IS NULL
       UNION
       SELECT business_name, phone, email, website FROM clients WHERE deleted_at IS NULL`
    ).catch(() => ({ rows: [] }));

    const dbNames = new Set<string>();
    const dbPhones = new Set<string>();
    const dbEmails = new Set<string>();
    const dbDomains = new Set<string>();

    for (const row of dbRes.rows) {
      const cName = this.cleanBizName(row.business_name || '');
      if (cName.length >= 3) dbNames.add(cName);
      const p = (row.phone || '').replace(/\D/g, '');
      if (p.length >= 7) dbPhones.add(p.slice(-10));
      const em = (row.email || '').trim().toLowerCase();
      if (em) dbEmails.add(em);
      if (row.website) {
        try {
          const u = new URL(row.website.startsWith('http') ? row.website : `https://${row.website}`);
          const host = u.hostname.replace(/^www\./, '').toLowerCase();
          if (host.length > 3) dbDomains.add(host);
        } catch {}
      }
    }

    // Build batch tasks for a single persistent headless Chrome session
    const primaryTasks: Array<{ queryStr: string; category: string; locationKey: string; targetCountry?: string; limit: number }> = [];
    const cdpFetchLimit = Math.min(500, Math.max(perLocationQuota, effectiveLimit) + 20);
    for (const locQuery of locationQueries) {
      for (const cat of targetCategories) {
        const cleanCat = cat.trim();
        primaryTasks.push({
          queryStr: `${cleanCat} in ${locQuery}`,
          category: cleanCat,
          locationKey: locQuery,
          targetCountry: cleanCountry,
          limit: cdpFetchLimit,
        });
      }
    }

    // Execute tasks over single persistent Chrome session (passing DB exclude sets so dedup happens before cutoff)
    const locationCounts = new Map<string, number>();
    const addResults = (batchResults: ScrapedLeadItem[], locationKey: string) => {
      for (const r of batchResults) {
        if (rawList.length >= targetCandidateLimit) break;
        const currentLocCount = locationCounts.get(locationKey) || 0;
        if (currentLocCount >= perLocationQuota) break;

        const cleanWeb = this.normalizeGmbWebsiteUrl(r.website);
        if (params.requireWebsite !== false && !cleanWeb) {
          continue; // Scraped leads MUST have a website
        }

        const formattedPhone = ensurePhoneWithCountryCode(r.phone, {
          country: r.country || cleanCountry,
          state: r.state || cleanState,
          address: r.address,
        });

        const normName = this.cleanBizName(r.businessName);
        const pDigits = formattedPhone.replace(/\D/g, '');
        const pLast10 = pDigits.length >= 7 ? pDigits.slice(-10) : '';

        // Check if lead already exists in CRM database
        let isDbMatch = false;
        if (normName && dbNames.has(normName)) isDbMatch = true;
        else if (pLast10 && dbPhones.has(pLast10)) isDbMatch = true;
        else if (cleanWeb) {
          try {
            const u = new URL(cleanWeb);
            const host = u.hostname.replace(/^www\./, '').toLowerCase();
            if (host.length > 3 && dbDomains.has(host)) isDbMatch = true;
          } catch {}
        }

        if (isDbMatch) {
          excludedDbDuplicatesCount++;
          this.lastExcludedDuplicatesCount = excludedDbDuplicatesCount;
          continue;
        }

        if (!existingNames.has(normName) && (!pLast10 || !existingPhones.has(pLast10))) {
          existingNames.add(normName);
          if (pLast10) existingPhones.add(pLast10);
          rawList.push({
            ...r,
            phone: formattedPhone,
            website: cleanWeb,
          });
          locationCounts.set(locationKey, currentLocCount + 1);
        }
      }
    };

    try {
      const batchOutputs = await this.scrapeBatchWithCdp(
        primaryTasks.map((t) => ({
          queryStr: t.queryStr,
          category: t.category,
          targetCountry: t.targetCountry,
          limit: t.limit,
          locationKey: t.locationKey,
        })),
        CDP_DEADLINE,
        targetCandidateLimit,
        params.requireWebsite !== false,
        { dbNames, dbDomains, dbPhones }
      );

      for (const item of batchOutputs) {
        addResults([item], locationQueries.length === 1 ? locationQueries[0] : (item.address || locationQueries[0] || ''));
      }
    } catch (err: any) {
      lastCdpError = err?.message || 'CDP batch error';
      console.warn(`[GmbScraperService] Batch CDP scraping error:`, err?.message);
    }

    // If primary queries returned 0 and we still have >= 20s before deadline, try fallback variations
    if (rawList.length === 0 && Date.now() < HARD_DEADLINE - 20000) {
      console.log(`[GmbScraperService] Primary queries returned 0 results. Running fallback variations...`);
      const fallbackTasks: Array<{ queryStr: string; category: string; locationKey: string; targetCountry?: string; limit: number }> = [];
      for (const locQuery of locationQueries) {
        for (const cat of targetCategories) {
          fallbackTasks.push({
            queryStr: `${cat.trim()} services in ${locQuery}`,
            category: cat.trim(),
            locationKey: locQuery,
            targetCountry: cleanCountry,
            limit: Math.min(perLocationQuota, effectiveLimit),
          });
        }
      }
      try {
        const fallbackOutputs = await this.scrapeBatchWithCdp(
          fallbackTasks.map((t) => ({
            queryStr: t.queryStr,
            category: t.category,
            targetCountry: t.targetCountry,
            limit: t.limit,
            locationKey: t.locationKey,
          })),
          HARD_DEADLINE - 10000,
          targetCandidateLimit,
          params.requireWebsite !== false,
          { dbNames, dbDomains, dbPhones }
        );
        for (const item of fallbackOutputs) {
          addResults([item], locationQueries.length === 1 ? locationQueries[0] : (item.address || locationQueries[0] || ''));
        }
      } catch (err: any) {
        lastCdpError = err?.message || 'CDP fallback error';
      }
    }

    if (rawList.length === 0 && lastCdpError) {
      throw new Error(`Google Maps Scraper failed: ${lastCdpError}`);
    }

    // Limit to requested count (strictly authentic leads from Google Maps)
    const selected = rawList.slice(0, targetCandidateLimit);

    // High-speed parallel verification of websites & genuine contact discovery
    console.log(`[GmbScraperService] ⚡ High-speed parallel verification & contact discovery for ${selected.length} listings (Elapsed: ${Date.now() - START_TIME}ms)...`);
    const enriched: ScrapedLeadItem[] = [];
    const chunkSize = 20; // High-throughput parallel crawl while bounding open TLS sockets

    for (let i = 0; i < selected.length; i += chunkSize) {
      if (enriched.length >= effectiveLimit) break;

      // Check if approaching deadline: preserve remaining leads immediately without further deep crawl
      if (Date.now() >= HARD_DEADLINE - 4000) {
        console.log(`[GmbScraperService] Approaching deadline (${Date.now() - START_TIME}ms elapsed). Preserving remaining ${selected.length - i} leads without deep crawl.`);
        for (let j = i; j < selected.length; j++) {
          if (enriched.length >= effectiveLimit) break;
          const item = selected[j];
          const cleanWeb = this.normalizeGmbWebsiteUrl(item.website);
          if (params.requireWebsite !== false && !cleanWeb) continue;
          if (params.requireEmail === true && !item.email) continue;
          enriched.push({
            ...item,
            website: cleanWeb,
            email: item.email && this.isValidBusinessEmail(item.email) ? item.email : '',
            emailDiscovered: Boolean(item.email),
          });
        }
        break;
      }

      const chunk = selected.slice(i, i + chunkSize);
      const processedChunk = await Promise.all(
        chunk.map(async (item) => {
          const normalizedGmbUrl = this.normalizeGmbWebsiteUrl(item.website);
          let verifiedWebsite = '';
          let crawlTargetUrl = '';

          // Only test URL if one was genuinely provided by GMB
          if (normalizedGmbUrl) {
            try {
              const liveCheck = await this.verifyWebsiteLive(normalizedGmbUrl);
              if (liveCheck.isLive && liveCheck.verifiedUrl) {
                verifiedWebsite = liveCheck.verifiedUrl;
                crawlTargetUrl = liveCheck.verifiedUrl;
              } else if (liveCheck.dnsResolved !== false) {
                // Keep valid GMB website link when HTTP check fails due to slow TTFB, timeout, or WAF/bot check
                verifiedWebsite = normalizedGmbUrl;
                crawlTargetUrl = normalizedGmbUrl;
              }
            } catch (err: any) {
              verifiedWebsite = normalizedGmbUrl;
            }
          }

          // If website is required and absent/invalid, skip lead
          if (params.requireWebsite !== false && !verifiedWebsite) {
            return null;
          }

          let discoveredEmail = '';
          let emailDiscovered = false;
          let emailSource: string | undefined = undefined;
          let discoveredSocials: ScrapedLeadSocials = {};

          // Only crawl website if we still have >= 6 seconds before deadline
          if (crawlTargetUrl && Date.now() < HARD_DEADLINE - 6000) {
            try {
              const { email, socials } = await this.crawlWebsiteForContact(crawlTargetUrl);
              if (email) {
                const emailValidation = await emailValidatorService.validateEmail(email);
                if (emailValidation.isValid) {
                  discoveredEmail = email;
                  emailDiscovered = true;
                  emailSource = 'website_crawl';
                }
              }
              if (socials && Object.keys(socials).length > 0) {
                discoveredSocials = socials;
              }
            } catch (_) {}
          }

          const finalEmail = discoveredEmail || (item.email && this.isValidBusinessEmail(item.email) ? item.email : '');

          // If email is required and absent/invalid, skip lead
          if (params.requireEmail === true && !finalEmail) {
            return null;
          }

          return {
            ...item,
            website: verifiedWebsite,
            email: finalEmail,
            emailDiscovered: Boolean(discoveredEmail),
            emailSource,
            socials: Object.keys(discoveredSocials).length > 0 ? discoveredSocials : undefined,
          };
        })
      );

      const validProcessed = processedChunk.filter(Boolean) as ScrapedLeadItem[];
      enriched.push(...validProcessed);
      if (enriched.length >= effectiveLimit) {
        break;
      }
    }

    const finalEnriched = enriched.slice(0, effectiveLimit);

    console.log(`[GmbScraperService] Completed GMB scrape: ${finalEnriched.length} genuine businesses ready in ${Date.now() - START_TIME}ms.`);
    const withEmailCount = finalEnriched.filter((l) => Boolean(l.email)).length;
    const withSiteCount = finalEnriched.filter((l) => Boolean(l.website)).length;
    logPipeline(
      'LEAD_SCRAPED',
      `Scraped ${finalEnriched.length} lead(s) for "${params.categories?.join(', ') || params.category}" (${params.country || 'USA'}) [Email: ${withEmailCount}, Website: ${withSiteCount}]`
    );
    return finalEnriched;
  }

  /**
   * Parses Google Maps internal tbm=map response into structured lead items
   */
  public parseTbmMapResponse(
    raw: string,
    fallbackCategory: string,
    queryStr: string,
    targetCountry?: string,
    limit: number = 50,
    requireWebsite: boolean = true
  ): ScrapedLeadItem[] {
    const results: ScrapedLeadItem[] = [];
    const jsonStr = (raw || '').replace(/^[^{[]+/, '');
    if (!jsonStr) return results;

    let json: any;
    try {
      json = JSON.parse(jsonStr);
    } catch {
      return results;
    }

    const rawList = Array.isArray(json[64]) ? json[64] : [];

    for (const entry of rawList) {
      if (results.length >= limit) break;
      const b = Array.isArray(entry?.[1]) ? entry[1] : (Array.isArray(entry) ? entry : null);
      if (!b) continue;

      let name = '';
      if (typeof b[11] === 'string' && b[11].trim()) {
        name = b[11].trim();
      } else if (b[90]?.[0]?.[0]?.[1]?.[0]?.[0]) {
        name = b[90][0][0][1][0][0];
      }

      if (!name || name === 'undefined' || name.toLowerCase() === 'results') continue;

      // Address
      let address = b[39] || '';
      let cityVal = '';
      let stateVal = '';
      let countryVal = '';

      if (!address && Array.isArray(b[2])) {
        address = b[2].join(', ');
      }
      if (!address && b[90]?.[0]) {
        const parts = b[90][0].map((p: any) => p?.[1]?.[0]?.[0]).filter(Boolean);
        address = parts.slice(1).join(', ');
      }

      // Structured location tokens
      if (Array.isArray(b[90]?.[1])) {
        cityVal = b[90][1][3] || '';
        stateVal = b[90][1][5] || '';
        countryVal = b[90][1][6] || '';
      }

      // Phone
      let phone = '';
      const phoneRegex = /^(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
      const findPhone = (node: any): string | null => {
        if (!node) return null;
        if (typeof node === 'string') {
          const clean = node.replace('tel:', '').trim();
          if (phoneRegex.test(clean)) return clean;
        }
        if (Array.isArray(node)) {
          for (const c of node) {
            const p = findPhone(c);
            if (p) return p;
          }
        }
        return null;
      };

      if (b[178]?.[0]?.[0] && typeof b[178][0][0] === 'string') {
        phone = b[178][0][0];
      } else if (b[178]?.[0]?.[1]?.[0]?.[0] && typeof b[178][0][1][0][0] === 'string') {
        phone = b[178][0][1][0][0];
      } else {
        phone = findPhone(b[87]) || findPhone(b) || '';
      }

      // Website
      let website = '';
      const findWebsite = (node: any): string | null => {
        if (!node) return null;
        if (typeof node === 'string' && (node.startsWith('http://') || node.startsWith('https://'))) {
          if (workflowRoutingService.hasValidWebsite(node)) {
            return node;
          }
        }
        if (Array.isArray(node)) {
          for (const c of node) {
            const w = findWebsite(c);
            if (w) return w;
          }
        }
        return null;
      };

      if (b[7]?.[0] && typeof b[7][0] === 'string') {
        website = b[7][0];
      } else if (b[7]?.[1] && typeof b[7][1] === 'string') {
        website = `https://${b[7][1]}`;
      } else {
        website = findWebsite(b[8]) || findWebsite(b) || '';
      }

      const cleanWeb = this.normalizeGmbWebsiteUrl(website);
      // STRICT REQUIREMENT: Only businesses with a valid website are eligible
      if (requireWebsite && !cleanWeb) continue;

      // Rating & Reviews
      let rating = 4.8;
      let reviewsCount = 0;
      if (typeof b[4]?.[7] === 'number') rating = b[4][7];
      if (typeof b[4]?.[8] === 'number') reviewsCount = b[4][8];

      const findReviewCount = (node: any): number | null => {
        if (!node) return null;
        if (Array.isArray(node)) {
          for (let idx = 0; idx < node.length; idx++) {
            const item = node[idx];
            if (typeof item === 'number' && item >= 1 && item <= 5 && typeof node[idx + 1] === 'number' && node[idx + 1] > 5) {
              return node[idx + 1];
            }
            if (typeof item === 'number' && item >= 1 && item <= 5 && Array.isArray(node[idx + 1])) {
              const innerNum = node[idx + 1].find((x: any) => typeof x === 'number');
              if (innerNum) return innerNum;
            }
            const found = findReviewCount(item);
            if (found) return found;
          }
        }
        return null;
      };

      if (!reviewsCount && b[4]) {
        const foundRev = findReviewCount(b[4]);
        if (foundRev) reviewsCount = foundRev;
      }

      const placeId = typeof b[78] === 'string' ? b[78] : '';
      const mapsUrl = placeId
        ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}`;

      const itemCategory = Array.isArray(b[13]) && typeof b[13][0] === 'string'
        ? b[13][0]
        : (fallbackCategory || queryStr.split(' in ')[0] || 'Local Services');

      const formattedPhone = ensurePhoneWithCountryCode(phone, {
        country: countryVal || targetCountry || 'USA',
        state: stateVal,
        address: address || queryStr.split(' in ')[1] || '',
      });

      results.push({
        businessName: name,
        category: itemCategory,
        phone: formattedPhone,
        email: '',
        website: cleanWeb,
        address: address || queryStr.split(' in ')[1] || '',
        city: cityVal || undefined,
        state: stateVal || undefined,
        country: countryVal || targetCountry || 'USA',
        rating: Number(rating.toFixed(1)),
        reviewsCount,
        googleMapsUrl: mapsUrl,
        placeId: placeId || undefined,
        emailDiscovered: false,
      });
    }

    return results;
  }

  /**
   * Scrapes Google Maps across multiple queries within a single persistent Chrome CDP session.
   * Eliminates the heavy process-spawn overhead across batch categories and locations.
   */
  public async scrapeBatchWithCdp(
    tasks: Array<{ queryStr: string; category: string; targetCountry?: string; limit: number; locationKey?: string }>,
    deadlineMs: number,
    maxTotalResults: number = 300,
    requireWebsite: boolean = true,
    excludeKeys?: { dbNames: Set<string>; dbDomains: Set<string>; dbPhones: Set<string> }
  ): Promise<ScrapedLeadItem[]> {
    if (!tasks || tasks.length === 0) return [];

    const executable = this.getChromeExecutable();
    if (!executable) {
      throw new Error(
        `Headless Chrome executable not found on ${process.platform}. Please install Google Chrome / Chromium or set CHROME_PATH environment variable.`
      );
    }

    const port = await this.getFreePort();
    let chromeProc: ChildProcess | null = null;
    let ws: WebSocket | null = null;
    const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-batch-cdp-'));
    let stderrOutput = '';
    const allResults: ScrapedLeadItem[] = [];

    try {
      const isHeadlessShell = executable.includes('chrome-headless-shell');
      const chromeArgs = [
        isHeadlessShell ? '--headless' : '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dbus',
        '--no-zygote',
        '--single-process',
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
        `--user-data-dir=${tempProfileDir}`,
        '--window-size=1280,800',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-crash-reporter',
        '--disable-breakpad',
        '--no-crashpad',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-notifications',
        '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process,CrashReporting,Translate,OptimizationHints',
        '--mute-audio',
        '--hide-scrollbars',
        '--metrics-recording-only',
        'about:blank',
      ];

      chromeProc = spawn(executable, chromeArgs, {
        env: {
          ...process.env,
          DBUS_SESSION_BUS_ADDRESS: 'disabled:',
          DBUS_SYSTEM_BUS_ADDRESS: 'disabled:',
        },
      });

      chromeProc.stderr?.on('data', (c) => {
        stderrOutput += c.toString();
      });

      chromeProc.on('error', (err) => {
        console.error(`[GmbScraperService] Chrome batch process spawn error:`, err);
      });

      const page = await this.waitForCdpReady(port, 25000, chromeProc);
      if (!page || !page.webSocketDebuggerUrl) {
        const exitMsg =
          chromeProc.exitCode !== null
            ? `Chrome exited with code ${chromeProc.exitCode}.`
            : `Connection to Chrome remote debugger on 127.0.0.1:${port} timed out.`;
        const errDetail = stderrOutput.trim() ? ` Stderr: ${stderrOutput.slice(0, 400)}` : '';
        throw new Error(`${exitMsg}${errDetail}`);
      }

      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        if (!ws) return reject(new Error('No WebSocket instance'));
        ws.onopen = () => resolve();
        ws.onerror = (_e) => reject(new Error('WebSocket connection error'));
      });

      let msgId = 1;
      const send = (method: string, p = {}) =>
        new Promise<any>((resolve, reject) => {
          const curId = msgId++;
          const timer = setTimeout(() => reject(new Error(`Timeout ${method}`)), 12000);
          const handler = (e: any) => {
            try {
              const data = JSON.parse(e.data.toString());
              if (data.id === curId) {
                clearTimeout(timer);
                ws?.removeEventListener('message', handler);
                resolve(data.result);
              }
            } catch (_) {}
          };
          ws?.addEventListener('message', handler);
          ws?.send(JSON.stringify({ id: curId, method, params: p }));
        });

      let activeTbmReqId = '';
      const orderedTbmReqIds: string[] = [];
      const finishedTbmReqIds = new Set<string>();
      const failedTbmReqIds = new Set<string>();
      const candidateTbmReqIds = new Set<string>();
      const seenCdpNames = new Set<string>();
      const seenCdpPhones = new Set<string>();
      const seenCdpDomains = new Set<string>();

      ws.addEventListener('message', (e: any) => {
        try {
          const data = JSON.parse(e.data.toString());
          if (data.method === 'Network.responseReceived') {
            const u = data.params?.response?.url || '';
            if (u.includes('tbm=map')) {
              const reqId = data.params.requestId;
              activeTbmReqId = reqId;
              candidateTbmReqIds.add(reqId);
              orderedTbmReqIds.push(reqId);
            }
          } else if (data.method === 'Network.loadingFinished') {
            const reqId = data.params?.requestId;
            if (reqId && candidateTbmReqIds.has(reqId)) {
              finishedTbmReqIds.add(reqId);
            }
          } else if (data.method === 'Network.loadingFailed') {
            const reqId = data.params?.requestId;
            if (reqId && candidateTbmReqIds.has(reqId)) {
              failedTbmReqIds.add(reqId);
            }
          }
        } catch (_) {}
      });

      await send('Network.enable');
      await send('Page.enable');

      for (let taskIdx = 0; taskIdx < tasks.length; taskIdx++) {
        // Enforce CDP phase deadline with buffer for teardown and HTTP contact crawl
        if (Date.now() >= deadlineMs - 2500) {
          console.log(`[GmbScraperService] Reached CDP phase deadline (${tasks.length - taskIdx} tasks remaining). Wrapping up.`);
          break;
        }

        if (allResults.length >= maxTotalResults) {
          console.log(`[GmbScraperService] Reached maximum unique target results (${allResults.length}/${maxTotalResults}). Stopping query loop.`);
          break;
        }

        const task = tasks[taskIdx];
        const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(task.queryStr)}?hl=en`;

        try {
          // Reset state cleanly before navigating so fast back-to-back searches never pick up stale packets
          activeTbmReqId = '';
          orderedTbmReqIds.length = 0;
          candidateTbmReqIds.clear();
          finishedTbmReqIds.clear();
          failedTbmReqIds.clear();

          await send('Page.navigate', { url: targetUrl });

          // Wait for BOTH tbm=map responseReceived AND loadingFinished (up to 6500ms)
          const navWaitDeadline = Math.min(deadlineMs - 2000, Date.now() + 6500);
          while (Date.now() < navWaitDeadline) {
            if (activeTbmReqId && (finishedTbmReqIds.has(activeTbmReqId) || failedTbmReqIds.has(activeTbmReqId))) {
              break;
            }
            await new Promise((r) => setTimeout(r, 60));
          }

          let taskResults: ScrapedLeadItem[] = [];
          const readFinishedTbmPackets = async (): Promise<ScrapedLeadItem[]> => {
            const collected: ScrapedLeadItem[] = [];
            for (const reqId of orderedTbmReqIds) {
              if (!finishedTbmReqIds.has(reqId) || failedTbmReqIds.has(reqId)) continue;
              try {
                const res = await send('Network.getResponseBody', { requestId: reqId });
                if (res?.body) {
                  collected.push(
                    ...this.parseTbmMapResponse(
                      res.body,
                      task.category,
                      task.queryStr,
                      task.targetCountry,
                      task.limit,
                      requireWebsite
                    )
                  );
                }
              } catch {}
            }
            return collected;
          };

          taskResults = await readFinishedTbmPackets();

          // Optional Maps feed scroll pagination when fewer tasks remain and we still need > 20 leads
          if (taskResults.length > 0 && taskResults.length < task.limit && tasks.length <= 4 && Date.now() < deadlineMs - 5000) {
            for (let scrollTry = 0; scrollTry < 2; scrollTry++) {
              if (taskResults.length >= task.limit || Date.now() >= deadlineMs - 3000) break;
              const prevPacketCount = orderedTbmReqIds.length;
              await send('Runtime.evaluate', {
                expression: `(() => {
                  const feed = document.querySelector('div[role="feed"]');
                  if (feed) { feed.scrollTop = feed.scrollHeight; return true; }
                  return false;
                })()`,
                returnByValue: true,
              }).catch(() => {});
              const scrollWaitEnd = Math.min(deadlineMs - 2000, Date.now() + 2000);
              while (Date.now() < scrollWaitEnd) {
                if (orderedTbmReqIds.length > prevPacketCount && finishedTbmReqIds.has(orderedTbmReqIds[orderedTbmReqIds.length - 1])) {
                  break;
                }
                await new Promise((r) => setTimeout(r, 100));
              }
              if (orderedTbmReqIds.length > prevPacketCount) {
                const more = await readFinishedTbmPackets();
                if (more.length > taskResults.length) taskResults = more;
              } else {
                break;
              }
            }
          }

          // Fallback to DOM extraction if network packet was not captured or empty (allow up to 2500ms for feed cards to mount)
          if (taskResults.length === 0) {
            try {
              const domWaitDeadline = Math.min(deadlineMs - 2000, Date.now() + 2500);
              while (Date.now() < domWaitDeadline) {
                const probe = await send('Runtime.evaluate', {
                  expression: `document.querySelectorAll('div.Nv2PK, div[role="feed"] > div, div[role="article"]').length`,
                  returnByValue: true,
                });
                if ((probe?.result?.value || 0) > 0) break;
                await new Promise((r) => setTimeout(r, 200));
              }
              const domCards = await send('Runtime.evaluate', {
                expression: `(() => {
                  const cards = document.querySelectorAll('div.Nv2PK, div[role="feed"] > div, div[role="article"]');
                  const items = [];
                  cards.forEach(card => {
                    const nameEl = card.querySelector('div.qBF1Pd, div.fontHeadlineSmall, [aria-label]');
                    const name = nameEl ? (nameEl.innerText || nameEl.getAttribute('aria-label') || '').trim() : '';
                    if (!name || name.toLowerCase() === 'results' || name === 'undefined' || name.length < 2) return;
                    
                    const webEl = card.querySelector('a[data-value="Website"], a[aria-label*="website" i], a.lcr4fd, a[data-item-id="authority"]');
                    const website = webEl ? webEl.href : '';
                    
                    const phoneEl = card.querySelector('button[data-item-id*="phone"], span.UsdlK');
                    const phone = phoneEl ? phoneEl.innerText.trim() : '';
                    
                    const addressEl = card.querySelector('button[data-item-id="address"], div.W4Efsb');
                    const address = addressEl ? addressEl.innerText.trim() : '';

                    const ratingEl = card.querySelector('span.MW4etd, span.ceNzKf');
                    const rating = ratingEl ? parseFloat(ratingEl.innerText.trim()) : 4.8;

                    const reviewsEl = card.querySelector('span.UY7F9');
                    const reviewsCount = reviewsEl ? parseInt(reviewsEl.innerText.replace(/[^0-9]/g, ''), 10) : 0;

                    const placeLink = card.querySelector('a.hfpxzc');
                    const mapsUrl = placeLink ? placeLink.href : '';

                    items.push({
                      businessName: name,
                      phone,
                      website,
                      address,
                      rating: isNaN(rating) ? 4.8 : rating,
                      reviewsCount: isNaN(reviewsCount) ? 0 : reviewsCount,
                      googleMapsUrl: mapsUrl,
                    });
                  });
                  return items;
                })()`,
                returnByValue: true,
              });

              const extracted = domCards?.result?.value;
              if (Array.isArray(extracted)) {
                for (const item of extracted) {
                  if (taskResults.length >= task.limit) break;
                  if (!item.businessName) continue;
                  const cleanWeb = this.normalizeGmbWebsiteUrl(item.website);
                  if (requireWebsite && !cleanWeb) continue;
                  const formattedPhone = ensurePhoneWithCountryCode(item.phone, {
                    country: task.targetCountry || 'USA',
                    address: item.address || task.queryStr.split(' in ')[1] || '',
                  });
                  taskResults.push({
                    businessName: item.businessName,
                    category: task.category || task.queryStr.split(' in ')[0] || 'Local Services',
                    phone: formattedPhone,
                    email: '',
                    website: cleanWeb,
                    address: item.address || task.queryStr.split(' in ')[1] || '',
                    country: task.targetCountry || 'USA',
                    rating: item.rating || 4.8,
                    reviewsCount: item.reviewsCount || 0,
                    googleMapsUrl: item.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.businessName)}`,
                    emailDiscovered: false,
                  });
                }
              }
            } catch (domErr: any) {
              console.warn(`[GmbScraperService] DOM fallback evaluation error:`, domErr.message);
            }
          }

          // Deduplicate net-new leads inside CDP so maxTotalResults reflects unique non-DB-duplicate leads
          let netNewCount = 0;
          for (const item of taskResults) {
            const normName = this.cleanBizName(item.businessName);
            const pDigits = (item.phone || '').replace(/\D/g, '');
            const pLast10 = pDigits.length >= 7 ? pDigits.slice(-10) : '';
            let host = '';
            try {
              if (item.website) host = new URL(item.website).hostname.replace(/^www\./, '').toLowerCase();
            } catch {}

            const inDb =
              Boolean(normName && excludeKeys?.dbNames.has(normName)) ||
              Boolean(pLast10 && excludeKeys?.dbPhones.has(pLast10)) ||
              Boolean(host && host.length > 3 && excludeKeys?.dbDomains.has(host));
            if (inDb) continue;

            const alreadySeen =
              Boolean(normName && seenCdpNames.has(normName)) ||
              Boolean(pLast10 && seenCdpPhones.has(pLast10)) ||
              Boolean(host && host.length > 3 && seenCdpDomains.has(host));
            if (alreadySeen) continue;

            if (normName) seenCdpNames.add(normName);
            if (pLast10) seenCdpPhones.add(pLast10);
            if (host && host.length > 3) seenCdpDomains.add(host);
            allResults.push(item);
            netNewCount++;
          }

          console.log(`[GmbScraperService] Query "${task.queryStr}" returned ${taskResults.length} listings (${netNewCount} net-new unique; total unique=${allResults.length}/${maxTotalResults})`);
        } catch (taskErr: any) {
          console.warn(`[GmbScraperService] Query "${task.queryStr}" error:`, taskErr.message);
        }
      }

      return allResults;
    } finally {
      if (ws) {
        try {
          ws.close();
        } catch (_) {}
      }
      if (chromeProc) {
        try {
          chromeProc.kill('SIGKILL');
        } catch (_) {}
      }
      try {
        fs.rmSync(tempProfileDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  /**
   * Spawns headless Chrome and captures Google Maps tbm=map response for a single query.
   * Delegates to scrapeBatchWithCdp for unified session lifecycle.
   */
  public async scrapeWithCdp(queryStr: string, limit: number, targetCountry?: string, requireWebsite: boolean = true): Promise<ScrapedLeadItem[]> {
    const category = queryStr.split(' in ')[0] || 'Local Services';
    return this.scrapeBatchWithCdp(
      [{ queryStr, category, targetCountry, limit }],
      Date.now() + 30000,
      limit,
      requireWebsite
    );
  }

  /**
   * Intelligently crawls a business website and discovers genuine contact emails
   * from Homepage, About pages, Contact pages, JSON-LD schemas, and Cloudflare protected tags.
   * Email extraction is first priority, followed by social account discovery (IG, FB, LinkedIn, X, YT).
   */
  public async crawlWebsiteForContact(siteUrl: string): Promise<{ email: string; socials: ScrapedLeadSocials }> {
    const emptyResult = { email: '', socials: {} };
    if (!siteUrl) return emptyResult;

    let parsedOrigin = '';
    let parsedHostname = '';
    try {
      const parsed = new URL(siteUrl);
      parsedOrigin = parsed.origin;
      parsedHostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return emptyResult;
    }

    const emailsFound = new Set<string>();
    const socials: ScrapedLeadSocials = {};

    const browserHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    const fetchPageHtml = async (targetUrl: string): Promise<string> => {
      try {
        const res = await fetch(targetUrl, {
          headers: browserHeaders,
          redirect: 'follow',
          signal: AbortSignal.timeout(2800),
        });
        if (!res.ok) return '';
        return await res.text();
      } catch {
        return '';
      }
    };

    const extractSocialsFromHtml = (html: string) => {
      if (!html) return;

      // 1. Instagram
      if (!socials.instagram) {
        const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.-]+)\/?/i);
        if (igMatch && igMatch[1]) {
          const handle = igMatch[1].toLowerCase().replace(/\/$/, '');
          const ignored = ['p', 'reel', 'reels', 'explore', 'stories', 'direct', 'accounts', 'developer', 'about', 'legal', 'tags', 'tv', 'sharer'];
          if (!ignored.includes(handle) && handle.length > 1) {
            socials.instagram = `https://instagram.com/${handle}`;
          }
        }
      }

      // 2. Facebook
      if (!socials.facebook) {
        const fbMatch = html.match(/https?:\/\/(?:www\.)?(?:facebook\.com|fb\.me)\/([a-zA-Z0-9_.-]+)\/?/i);
        if (fbMatch && fbMatch[1]) {
          const handle = fbMatch[1].toLowerCase().replace(/\/$/, '');
          const ignored = ['sharer', 'share', 'share.php', 'plugins', 'dialog', 'login', 'groups', 'pages', 'events', 'help', 'policies', 'privacy', 'tr', 'home', 'r.php'];
          if (!ignored.includes(handle) && handle.length > 1) {
            socials.facebook = `https://facebook.com/${handle}`;
          }
        }
      }

      // 3. LinkedIn
      if (!socials.linkedin) {
        const liMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in|school)\/([a-zA-Z0-9_-]+)\/?/i);
        if (liMatch && liMatch[0]) {
          const cleanUrl = liMatch[0].replace(/\/$/, '');
          if (!cleanUrl.includes('/shareArticle') && !cleanUrl.includes('/sharing')) {
            socials.linkedin = cleanUrl;
          }
        }
      }

      // 4. Twitter / X
      if (!socials.twitter) {
        const twMatch = html.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/?/i);
        if (twMatch && twMatch[1]) {
          const handle = twMatch[1].toLowerCase();
          const ignored = ['intent', 'share', 'home', 'explore', 'search', 'hashtag', 'i', 'privacy', 'tos', 'personalization'];
          if (!ignored.includes(handle) && handle.length > 1) {
            socials.twitter = `https://x.com/${handle}`;
          }
        }
      }

      // 5. YouTube
      if (!socials.youtube) {
        const ytMatch = html.match(/https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)?([a-zA-Z0-9_.-]+)\/?/i);
        if (ytMatch && ytMatch[0]) {
          const fullMatch = ytMatch[0].replace(/\/$/, '');
          const ignored = ['watch', 'embed', 'results', 'shorts', 'feed', 'playlist', 'live', 'premium'];
          const segment = ytMatch[1]?.toLowerCase() || '';
          if (!ignored.includes(segment)) {
            socials.youtube = fullMatch;
          }
        }
      }
    };

    const extractEmailsFromHtml = (html: string) => {
      if (!html) return;

      // 1. Mailto links (standard, URL-encoded, entity-encoded)
      const mailtoMatches = Array.from(
        html.matchAll(/mailto:([a-zA-Z0-9._%+-]+(?:%40|@)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)
      ).map((m) => decodeURIComponent(m[1]).split('?')[0].trim());

      for (const m of mailtoMatches) {
        if (this.isValidBusinessEmail(m)) {
          emailsFound.add(m.toLowerCase());
        }
      }

      // 2. Cloudflare email protection de-obfuscation: data-cfemail="hex"
      const cfMatches = Array.from(html.matchAll(/data-cfemail=["']([0-9a-fA-F]+)["']/gi));
      for (const match of cfMatches) {
        const hex = match[1];
        try {
          const key = parseInt(hex.slice(0, 2), 16);
          let decoded = '';
          for (let n = 2; n < hex.length; n += 2) {
            decoded += String.fromCharCode(parseInt(hex.slice(n, n + 2), 16) ^ key);
          }
          if (this.isValidBusinessEmail(decoded)) {
            emailsFound.add(decoded.toLowerCase().trim());
          }
        } catch (_) {}
      }

      // 3. JSON-LD structured metadata (<script type="application/ld+json">)
      const jsonLdBlocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
      for (const block of jsonLdBlocks) {
        try {
          const json = JSON.parse(block[1]);
          const walkJson = (node: any) => {
            if (!node) return;
            if (typeof node === 'string') {
              if (node.includes('@') && this.isValidBusinessEmail(node)) {
                emailsFound.add(node.toLowerCase().trim());
              }
            } else if (Array.isArray(node)) {
              node.forEach(walkJson);
            } else if (typeof node === 'object') {
              Object.values(node).forEach(walkJson);
            }
          };
          walkJson(json);
        } catch (_) {}
      }

      // 4. Regex email matches across text
      const textMatches = Array.from(
        html.matchAll(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g)
      ).map((m) => m[1]);

      for (const em of textMatches) {
        if (this.isValidBusinessEmail(em)) {
          emailsFound.add(em.toLowerCase().trim());
        }
      }
    };

    // Step 1: Fetch Homepage first
    const homeHtml = await fetchPageHtml(siteUrl);
    extractEmailsFromHtml(homeHtml);
    extractSocialsFromHtml(homeHtml);

    // Helper to select the highest-quality business email
    const selectBestEmail = (): string => {
      if (emailsFound.size === 0) return '';
      const list = Array.from(emailsFound);

      // Priority 1: Email matching the exact domain of the website (e.g. info@ketteringroofing.com)
      const domainMatches = list.filter((em) => em.endsWith(`@${parsedHostname}`) || em.endsWith(`.${parsedHostname}`));
      if (domainMatches.length > 0) {
        const roleEmail = domainMatches.find((e) => /^(info|contact|office|hello|admin|sales|team|support)@/i.test(e));
        return roleEmail || domainMatches[0];
      }

      // Priority 2: Common business role prefix on any domain
      const rolePrefix = list.find((e) => /^(info|contact|office|hello|admin|sales|team|support)@/i.test(e));
      if (rolePrefix) return rolePrefix;

      return list[0];
    };

    // If both domain email AND major socials are already found, return early
    const bestHomeEmail = selectBestEmail();
    const hasDomainEmail = bestHomeEmail && (bestHomeEmail.endsWith(`@${parsedHostname}`) || bestHomeEmail.endsWith(`.${parsedHostname}`));
    const hasSocials = Object.keys(socials).length > 0;

    // If we have domain-matched email and at least one social, or if homeHtml was empty, return early
    if (hasDomainEmail && hasSocials) {
      return { email: bestHomeEmail, socials };
    }

    // Step 2: Discover internal Contact and About links from Homepage navigation/footer
    const discoveredPages: string[] = [];
    if (homeHtml) {
      const linkMatches = Array.from(homeHtml.matchAll(/<a[^>]+href=["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi));
      for (const [, href, anchorText] of linkMatches) {
        if (discoveredPages.length >= 2) break;
        const lowerHref = href.toLowerCase();
        const lowerText = anchorText.replace(/<[^>]+>/g, '').toLowerCase();
        const isContactLink =
          lowerHref.includes('contact') ||
          lowerText.includes('contact') ||
          lowerHref.includes('reach') ||
          lowerText.includes('get in touch');
        const isAboutLink =
          lowerHref.includes('about') ||
          lowerText.includes('about') ||
          lowerHref.includes('team') ||
          lowerText.includes('who-we-are');

        if (isContactLink || isAboutLink) {
          try {
            const resolved = new URL(href, siteUrl);
            if (
              resolved.origin === parsedOrigin &&
              resolved.pathname !== '/' &&
              !discoveredPages.includes(resolved.toString())
            ) {
              discoveredPages.push(resolved.toString());
            }
          } catch (_) {}
        }
      }
    }

    // Fallback: If no explicit internal links were found on homepage, try standard paths
    if (discoveredPages.length === 0) {
      discoveredPages.push(`${parsedOrigin}/contact`, `${parsedOrigin}/about`);
    }

    // Step 3: Concurrently fetch discovered Contact and About pages
    const targetSubpages = discoveredPages.slice(0, 2);
    const subpageResults = await Promise.allSettled(targetSubpages.map(fetchPageHtml));
    for (const settled of subpageResults) {
      if (settled.status === 'fulfilled' && settled.value) {
        extractEmailsFromHtml(settled.value);
        extractSocialsFromHtml(settled.value);
      }
    }

    const finalEmail = selectBestEmail();
    return { email: finalEmail, socials };
  }

  /**
   * Filters out static asset filenames, dummy emails, and invalid formats
   */
  private isValidBusinessEmail(email: string): boolean {
    if (!email || !email.includes('@')) return false;
    const lower = email.toLowerCase();

    // Reject image and asset extensions matched by regex
    if (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp') ||
      lower.endsWith('.svg') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.css') ||
      lower.endsWith('.js') ||
      lower.endsWith('.woff') ||
      lower.endsWith('.woff2')
    ) {
      return false;
    }

    // Reject dummy/placeholder emails
    if (
      lower.includes('sentry') ||
      lower.includes('wixpress') ||
      lower.includes('wordpress') ||
      lower.includes('domain.com') ||
      lower.includes('example.com') ||
      lower.includes('test.com') ||
      lower.startsWith('user@') ||
      lower.startsWith('name@')
    ) {
      return false;
    }

    // Standard RFC-compatible regex check
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(lower);
  }

  /**
   * Clean business name for matching
   */
  private cleanBizName(name: string): string {
    return (name || '')
      .toLowerCase()
      .replace(/\b(llc|inc|corp|corporation|ltd|limited|co|company)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }


  /**
   * Imports selected scraped leads into the Outreach Dashboard database
   */
  public async importScrapedLeads(params: GmbImportParams): Promise<GmbImportResult> {
    const { leads: rawLeads, listId, batchName } = params;

    if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
      throw new Error('No leads provided for import');
    }

    // 1. Create upload_batch record (expires in 28 days)
    const formattedBatchName =
      (batchName && typeof batchName === 'string' && batchName.trim()) ||
      `GMB Scrape — ${rawLeads[0]?.category || 'Local'} in ${rawLeads[0]?.city || rawLeads[0]?.state || 'Area'} (${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })})`;

    const batchRes = await query<{ id: string }>(
      `INSERT INTO upload_batches (batch_name, source, total_rows, imported_count, duplicate_count, incomplete_count, expires_at)
       VALUES ($1, 'gmb_scraper', $2, 0, 0, 0, NOW() + INTERVAL '28 days')
       RETURNING *`,
      [formattedBatchName, rawLeads.length]
    );
    const batchId = batchRes.rows[0].id;

    // 2. Fetch existing leads & clients across all CRM lists for deduplication
    const existingRes = await query<{ business_name: string; email: string; phone: string; list_names: string }>(
      `SELECT l.business_name, l.email, l.phone,
              COALESCE(string_agg(lst.name, ', '), '') as list_names
       FROM leads l
       LEFT JOIN lead_list_memberships lm ON lm.lead_id = l.id
       LEFT JOIN lists lst ON lst.id = lm.list_id
       WHERE l.deleted_at IS NULL AND l.status != 'duplicate'
       GROUP BY l.id, l.business_name, l.email, l.phone
       UNION
       SELECT cl.business_name, cl.email, cl.phone, 'Clients' as list_names
       FROM clients cl WHERE cl.deleted_at IS NULL
       GROUP BY cl.id, cl.business_name, cl.email, cl.phone`
    );

    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();
    const emailMatchMap = new Map<string, { biz: string; lists: string }>();
    const phoneMatchMap = new Map<string, { biz: string; lists: string }>();
    const nameMatchMap = new Map<string, { biz: string; lists: string }>();

    for (const r of existingRes.rows) {
      const email = (r.email || '').trim().toLowerCase();
      if (email) {
        existingEmails.add(email);
        emailMatchMap.set(email, { biz: r.business_name, lists: r.list_names });
      }
      const pDigits = (r.phone || '').replace(/\D/g, '');
      if (pDigits.length >= 7) {
        const last10 = pDigits.slice(-10);
        existingPhones.add(last10);
        phoneMatchMap.set(last10, { biz: r.business_name, lists: r.list_names });
      }
      const cName = this.cleanBizName(r.business_name);
      if (cName.length >= 3) {
        existingNames.add(cName);
        nameMatchMap.set(cName, { biz: r.business_name, lists: r.list_names });
      }
    }

    let importedCount = 0;
    let duplicateCount = 0;
    let customListAddedCount = 0;
    const insertedLeads: any[] = [];

    for (const item of rawLeads) {
      const email = (item.email || '').trim().toLowerCase();
      const phone = ensurePhoneWithCountryCode(item.phone, {
        country: item.country || 'USA',
        state: item.state,
        address: item.address,
      });
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneLast10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';
      const bName = (item.businessName || '').trim();
      const cleanName = this.cleanBizName(bName);

      // Check duplicates against CRM leads/clients across all lists
      const isDuplicate =
        (email && existingEmails.has(email)) ||
        (phoneLast10 && existingPhones.has(phoneLast10)) ||
        (cleanName && existingNames.has(cleanName));

      if (isDuplicate) {
        duplicateCount++;

        let matchedReason = '';
        if (email && existingEmails.has(email)) {
          const match = emailMatchMap.get(email);
          matchedReason = `Email (${email}) already exists in CRM${match?.lists ? ` [List: ${match.lists}]` : ''}`;
        } else if (phoneLast10 && existingPhones.has(phoneLast10)) {
          const match = phoneMatchMap.get(phoneLast10);
          matchedReason = `Phone number (${phone}) already exists in CRM${match?.lists ? ` [List: ${match.lists}]` : ''}`;
        } else if (cleanName && existingNames.has(cleanName)) {
          const match = nameMatchMap.get(cleanName);
          matchedReason = `Business name "${bName}" already exists in CRM${match?.lists ? ` [List: ${match.lists}]` : ''}`;
        }

        console.log(`[GmbScraperService] Skipped duplicate lead from import: "${bName}" (${matchedReason})`);
        continue;
      }

      // Check WhatsApp eligibility
      let waEligible = false;
      let waReason = 'No valid phone number';
      if (phone) {
        const val = whatsappValidator.evaluate({ phone });
        waEligible = val.isEligible;
        waReason = val.reason;
      }

      const hasContactChannel = (Boolean(email) && email.includes('@')) || phoneDigits.length >= 8;
      const validWebsiteUrl = this.normalizeGmbWebsiteUrl(item.website) || null;

      const googleProfile = {
        placeName: bName,
        rating: item.rating || 4.8,
        reviewsCount: item.reviewsCount || 0,
        formattedAddress: item.address || '',
        category: item.category || 'Local Business',
        status: 'OPERATIONAL',
        website: validWebsiteUrl || undefined,
        phone: item.phone || undefined,
        email: email || undefined,
        googleMapsUrl: item.googleMapsUrl || undefined,
        socials: item.socials || {},
        hasGbpClaimed: true,
        userVerified: true,
        lastEnrichedAt: new Date().toISOString(),
      };

      const metadata = {
        source: 'gmb_scraper',
        google_profile: googleProfile,
        socials: item.socials || {},
      };

      const location = [item.city, item.state, item.country].filter(Boolean).join(', ') || item.address;

      const insertRes = await query<any>(
        `INSERT INTO leads (
          business_name, category, phone, email, website, location, country,
          whatsapp,
          status, consent_status, batch_id, whatsapp_eligible, whatsapp_decision_reason,
          metadata, discovered_emails, discovered_socials, last_enriched_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8,
          $9, 'none', $10, $11, $12,
          $13, $14, $15, NOW()
        ) RETURNING *`,
        [
          bName,
          item.category || 'Local Business',
          phone || null,
          email || null,
          validWebsiteUrl,
          location,
          item.country || 'USA',
          phone || null,
          hasContactChannel ? 'active' : 'inactive',
          batchId,
          waEligible,
          waReason,
          JSON.stringify(metadata),
          email ? JSON.stringify([email]) : JSON.stringify([]),
          JSON.stringify(item.socials || {}),
        ]
      );

      const createdLead = insertRes.rows[0];
      importedCount++;
      insertedLeads.push(createdLead);

      // Register in deduplication sets
      if (email) existingEmails.add(email);
      if (phoneLast10) existingPhones.add(phoneLast10);
      if (cleanName) existingNames.add(cleanName);

      // If user selected a specific list, assign lead to list
      if (listId && listId !== 'none' && listId !== 'all') {
        try {
          const memberRes = await query(
            `INSERT INTO lead_list_memberships (lead_id, list_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING
             RETURNING lead_id`,
            [createdLead.id, listId]
          );
          if (memberRes.rows.length > 0) customListAddedCount++;
        } catch (_) {}
      }
    }

    // Update upload_batches record
    await query(
      `UPDATE upload_batches
       SET imported_count = $1, duplicate_count = $2
       WHERE id = $3`,
      [importedCount, duplicateCount, batchId]
    );

    if (importedCount > 0) {
      logPipeline(
        'LEAD_SCRAPED',
        `Imported ${importedCount} scraped lead(s) into CRM (skipped ${duplicateCount} duplicates, batch: "${formattedBatchName}")`
      );
      if (customListAddedCount > 0 && listId) {
        logPipeline('ADDED_TO_LIST', `Added ${customListAddedCount} scraped lead(s) to selected list (${listId})`);
      }
    }

    // Auto-assign to platform channel lists (Email, WhatsApp, Website) and execute automated intake & outreach
    let intakeResult = null;
    if (insertedLeads.length > 0) {
      try {
        intakeResult = await automatedIntakeEngine.processImportedLeads(insertedLeads as any[], {
          customListId: listId,
          autoSend: true,
          scheduledStartTime: params.scheduledStartTime,
        });
      } catch (intakeErr) {
        console.error('[gmbScraperService.importScrapedLeads] Automated intake error:', intakeErr);
      }
    }

    return {
      success: true,
      importedCount,
      duplicateCount,
      batchId,
      batchName: formattedBatchName,
      leads: insertedLeads,
      automatedIntake: intakeResult,
    };
  }
}

export const gmbScraperService = new GmbScraperService();
