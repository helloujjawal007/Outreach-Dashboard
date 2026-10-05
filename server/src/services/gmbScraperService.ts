import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import dns from 'dns/promises';
import { query } from '../config/db';
import { whatsappValidator } from './whatsappValidator';
import { automatedIntakeEngine } from './automatedIntakeEngine';
import { emailValidatorService } from './emailValidatorService';

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
  discoveredSocials?: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    whatsapp?: string;
  };
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
}


export interface GmbImportParams {
  leads: ScrapedLeadItem[];
  listId?: string;
  batchName?: string;
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
  private chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  private portCounter = 9500;

  /**
   * Actively opens and verifies whether a website URL is genuinely live, resolving, and opening in the backend.
   * - Performs live DNS resolution to ensure hostname exists.
   * - Sends an HTTP request with full browser headers and follow redirects.
   * - If the website returns 200..399 or valid Cloudflare/WAF anti-bot challenge on live domain:
   *   returns { isLive: true, verifiedUrl: finalUrl }
   * - If the website fails DNS, returns 404, 500, dead link, connection refused, or timeout:
   *   returns { isLive: false, verifiedUrl: '', error }
   */
  public async verifyWebsiteLive(rawUrl: string): Promise<{ isLive: boolean; verifiedUrl: string; status?: number; error?: string }> {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { isLive: false, verifiedUrl: '', error: 'Empty URL' };
    }

    let targetUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { isLive: false, verifiedUrl: '', error: 'Unsupported protocol' };
      }
      if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') || !parsed.hostname.includes('.')) {
        return { isLive: false, verifiedUrl: '', error: 'Invalid hostname' };
      }
    } catch (e: any) {
      return { isLive: false, verifiedUrl: '', error: 'Malformed URL' };
    }

    // 1. Live DNS Verification: check that the domain exists and resolves to an IP address
    try {
      await dns.lookup(parsed.hostname);
    } catch (dnsErr: any) {
      return { isLive: false, verifiedUrl: '', error: `DNS resolution failed: ${dnsErr.code || dnsErr.message}` };
    }

    // 2. Live HTTP connection check (opening the link in the backend)
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

    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: browserHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });

      const isLive = res.ok || (res.status >= 200 && res.status < 400) || res.status === 403;
      if (isLive) {
        let finalUrl = res.url || targetUrl;
        try {
          const u = new URL(finalUrl);
          u.searchParams.delete('utm_source');
          u.searchParams.delete('utm_medium');
          u.searchParams.delete('utm_campaign');
          u.searchParams.delete('utm_content');
          u.searchParams.delete('rclk');
          finalUrl = u.toString().replace(/\/$/, '') || finalUrl;
        } catch (_) {}

        return { isLive: true, verifiedUrl: finalUrl, status: res.status };
      }

      return { isLive: false, verifiedUrl: '', status: res.status, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { isLive: false, verifiedUrl: '', error: err.message || 'Connection failed' };
    }
  }

  /**
   * Searches Google Maps & Google Business Profiles for matching businesses
   */
  public async searchGmb(params: GmbSearchParams): Promise<ScrapedLeadItem[]> {
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
    const perLocationQuota = leadsPerLocation && leadsPerLocation > 0 ? leadsPerLocation : effectiveLimit;

    console.log(
      `[GmbScraperService] Initiating search for [${targetCategories.join(', ')}] across ${locationQueries.length} location(s): [${locationQueries.join('; ')}] (Target limit: ${effectiveLimit}, Leads/location quota: ${perLocationQuota})`
    );

    const rawList: ScrapedLeadItem[] = [];
    const existingNames = new Set<string>();
    const existingPhones = new Set<string>();

    // Attempt Chrome CDP search across all selected locations, categories and query variations
    for (const locQuery of locationQueries) {
      if (rawList.length >= effectiveLimit) break;
      let leadsInCurrentLocation = 0;

      for (const cat of targetCategories) {
        if (rawList.length >= effectiveLimit || leadsInCurrentLocation >= perLocationQuota) break;
        const cleanCat = cat.trim();

        const queryVariations = [
          `${cleanCat} in ${locQuery}`,
          `${cleanCat} services in ${locQuery}`,
          `best ${cleanCat} in ${locQuery}`,
        ];

        for (const q of queryVariations) {
          if (rawList.length >= effectiveLimit || leadsInCurrentLocation >= perLocationQuota) break;
          try {
            const neededForThisLocation = perLocationQuota - leadsInCurrentLocation;
            const neededTotal = effectiveLimit - rawList.length;
            const batchSize = Math.min(neededForThisLocation, neededTotal);

            const batchResults = await this.scrapeWithCdp(q, batchSize, cleanCountry);
            for (const r of batchResults) {
              const normName = this.cleanBizName(r.businessName);
              const pDigits = (r.phone || '').replace(/\D/g, '');
              if (!existingNames.has(normName) && (!pDigits || !existingPhones.has(pDigits))) {
                existingNames.add(normName);
                if (pDigits) existingPhones.add(pDigits);
                rawList.push(r);
                leadsInCurrentLocation++;
                if (rawList.length >= effectiveLimit || leadsInCurrentLocation >= perLocationQuota) break;
              }
            }
          } catch (err: any) {
            console.warn(`[GmbScraperService] CDP query variation "${q}" error:`, err?.message);
          }
        }
      }
    }

    // Limit to requested count (strictly authentic leads from Google Maps)
    const selected = rawList.slice(0, limit);

    // Backend verification of websites & genuine contact discovery
    console.log(`[GmbScraperService] Verifying website reachability & extracting contacts for ${selected.length} listings...`);
    const enriched: ScrapedLeadItem[] = [];
    const chunkSize = 5;

    for (let i = 0; i < selected.length; i += chunkSize) {
      const chunk = selected.slice(i, i + chunkSize);
      const processedChunk = await Promise.all(
        chunk.map(async (item) => {
          let verifiedWebsite = '';

          // Only test URL if one was genuinely provided by GMB
          if (item.website) {
            try {
              const liveCheck = await this.verifyWebsiteLive(item.website);
              if (liveCheck.isLive && liveCheck.verifiedUrl) {
                verifiedWebsite = liveCheck.verifiedUrl;
                console.log(`[GmbScraperService] Verified live website for "${item.businessName}": ${verifiedWebsite} (Status: ${liveCheck.status || 'OK'})`);
              } else {
                console.log(`[GmbScraperService] Website not opening for "${item.businessName}": ${item.website} (${liveCheck.error || 'unreachable'}). Setting website to empty.`);
              }
            } catch (err: any) {
              console.warn(`[GmbScraperService] Website check exception for ${item.website}:`, err.message);
            }
          }

          let discoveredEmail = '';
          let discoveredSocials = { ...item.discoveredSocials };
          let emailDiscovered = false;
          let emailSource: string | undefined = undefined;

          // ONLY crawl website if it was verified live and opening in the backend!
          if (verifiedWebsite) {
            try {
              const { email, socials } = await this.crawlWebsiteForContact(verifiedWebsite);
              if (email) {
                // Check email format & MX record
                const emailValidation = await emailValidatorService.validateEmail(email);
                if (emailValidation.isValid) {
                  discoveredEmail = email;
                  emailDiscovered = true;
                  emailSource = 'website_crawl';
                } else {
                  console.log(`[GmbScraperService] Email ${email} from ${verifiedWebsite} failed validation (${emailValidation.reason}). Discarded.`);
                }
              }
              discoveredSocials = { ...discoveredSocials, ...socials };
            } catch (err: any) {
              console.warn(`[GmbScraperService] Error crawling website ${verifiedWebsite}:`, err.message);
            }
          }

          return {
            ...item,
            website: verifiedWebsite, // Only added if URL is opening in backend!
            email: discoveredEmail || (item.email && this.isValidBusinessEmail(item.email) ? item.email : ''),
            emailDiscovered,
            emailSource,
            discoveredSocials,
          };
        })
      );
      enriched.push(...processedChunk);
    }

    console.log(`[GmbScraperService] Completed GMB scrape: ${enriched.length} genuine businesses ready.`);
    return enriched;
  }

  /**
   * Spawns headless Chrome and captures Google Maps tbm=map response
   */
  private async scrapeWithCdp(queryStr: string, limit: number, targetCountry?: string): Promise<ScrapedLeadItem[]> {
    const port = ++this.portCounter;
    let chromeProc: ChildProcess | null = null;
    let ws: WebSocket | null = null;
    const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(queryStr)}?hl=en`;

    try {
      chromeProc = spawn(this.chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--window-size=1440,900',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ]);

      await new Promise((r) => setTimeout(r, 1200));

      const page = await new Promise<any>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(d)[0]);
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(3000, () => req.destroy(new Error('CDP connect timeout')));
      });

      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        if (!ws) return reject(new Error('No WebSocket instance'));
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(new Error('WebSocket connection error'));
      });

      let msgId = 1;
      const send = (method: string, p = {}) =>
        new Promise<any>((resolve, reject) => {
          const curId = msgId++;
          const timer = setTimeout(() => reject(new Error(`Timeout ${method}`)), 15000);
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

      let tbmReqId = '';
      ws.addEventListener('message', (e: any) => {
        try {
          const data = JSON.parse(e.data.toString());
          if (data.method === 'Network.responseReceived') {
            const u = data.params?.response?.url || '';
            if (u.includes('tbm=map')) {
              tbmReqId = data.params.requestId;
            }
          }
        } catch (_) {}
      });

      await send('Network.enable');
      await send('Page.enable');
      await send('Page.navigate', { url: targetUrl });

      // Wait up to 6 seconds for network response
      for (let wait = 0; wait < 12; wait++) {
        if (tbmReqId) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!tbmReqId) {
        await new Promise((r) => setTimeout(r, 2000));
      }

      const results: ScrapedLeadItem[] = [];

      if (tbmReqId) {
        const res = await send('Network.getResponseBody', { requestId: tbmReqId });
        const raw = (res?.body || '').replace(/^[^{[]+/, '');
        if (raw) {
          const json = JSON.parse(raw);
          const rawList = Array.isArray(json[64]) ? json[64] : [];

          for (const entry of rawList) {
            if (results.length >= limit) break;
            const b = Array.isArray(entry?.[1]) ? entry[1] : (Array.isArray(entry) ? entry : null);
            if (!b) continue;

            let name = '';
            // Business name
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
            function findPhone(node: any): string | null {
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
            }

            if (b[178]?.[0]?.[0] && typeof b[178][0][0] === 'string') {
              phone = b[178][0][0];
            } else if (b[178]?.[0]?.[1]?.[0]?.[0] && typeof b[178][0][1][0][0] === 'string') {
              phone = b[178][0][1][0][0];
            } else {
              phone = findPhone(b[87]) || findPhone(b) || '';
            }

            // Website: directly from b[7][0] (actual URL) or b[7][1] (domain)
            let website = '';
            function findWebsite(node: any): string | null {
              if (!node) return null;
              if (typeof node === 'string' && (node.startsWith('http://') || node.startsWith('https://'))) {
                if (
                  !node.includes('google.com') &&
                  !node.includes('gstatic.com') &&
                  !node.includes('schema.org') &&
                  !node.includes('googleusercontent.com')
                ) {
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
            }

            if (b[7]?.[0] && typeof b[7][0] === 'string') {
              website = b[7][0];
            } else if (b[7]?.[1] && typeof b[7][1] === 'string') {
              website = `https://${b[7][1]}`;
            } else {
              website = findWebsite(b[8]) || findWebsite(b) || '';
            }

            // Clean website URL
            let cleanWeb = website.trim();
            try {
              if (cleanWeb) {
                const u = new URL(cleanWeb);
                if (!['http:', 'https:'].includes(u.protocol) || u.hostname.includes('google.') || u.hostname.includes('gstatic.') || u.hostname.includes('schema.org')) {
                  cleanWeb = '';
                } else {
                  cleanWeb = `${u.protocol}//${u.host}${u.pathname}${u.search}`;
                }
              }
            } catch (_) {
              cleanWeb = '';
            }

            // Rating & Reviews
            let rating = 4.8;
            let reviewsCount = 0;
            if (typeof b[4]?.[7] === 'number') rating = b[4][7];
            if (typeof b[4]?.[8] === 'number') reviewsCount = b[4][8];

            function findReviewCount(node: any): number | null {
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
            }

            if (!reviewsCount && b[4]) {
              const foundRev = findReviewCount(b[4]);
              if (foundRev) reviewsCount = foundRev;
            }

            const placeId = typeof b[78] === 'string' ? b[78] : '';
            const mapsUrl = placeId
              ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}`;

            const category = Array.isArray(b[13]) && typeof b[13][0] === 'string'
              ? b[13][0]
              : (queryStr.split(' in ')[0] || 'Local Services');

            results.push({
              businessName: name,
              category,
              phone,
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
        }
      }

      // Layer 2: DOM fallback if network listener didn't catch tbm=map
      if (results.length === 0) {
        try {
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
              if (results.length >= limit) break;
              if (!item.businessName) continue;
              results.push({
                businessName: item.businessName,
                category: queryStr.split(' in ')[0] || 'Local Services',
                phone: item.phone || '',
                email: '',
                website: item.website || '',
                address: item.address || queryStr.split(' in ')[1] || '',
                country: targetCountry || 'USA',
                rating: item.rating || 4.8,
                reviewsCount: item.reviewsCount || 0,
                googleMapsUrl: item.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.businessName)}`,
                emailDiscovered: false,
              });
            }
          }
        } catch (domErr: any) {
          console.warn(`[GmbScraperService] DOM extraction error:`, domErr?.message);
        }
      }

      return results;
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
    }
  }

  /**
   * Crawls a business website and discovers contact email & socials
   */
  public async crawlWebsiteForContact(siteUrl: string): Promise<{ email: string; socials: Record<string, string> }> {
    const socials: Record<string, string> = {};
    if (!siteUrl) return { email: '', socials };

    const emailsFound = new Set<string>();
    const pagesToTry = [siteUrl];

    try {
      const parsed = new URL(siteUrl);
      const origin = parsed.origin;
      pagesToTry.push(
        `${origin}/contact`,
        `${origin}/contact-us`,
        `${origin}/about`,
        `${origin}/about-us`
      );
    } catch (_) {}

    for (const pageUrl of pagesToTry.slice(0, 3)) {
      try {
        const res = await fetch(pageUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          signal: AbortSignal.timeout(4500),
        });

        if (!res.ok) continue;
        const html = await res.text();

        // 1. Mailto links
        const mailtoMatches = Array.from(
          html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)
        ).map((m) => m[1]);

        // 2. Regex email matches
        const generalMatches = Array.from(
          html.matchAll(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g)
        ).map((m) => m[1]);

        for (const e of [...mailtoMatches, ...generalMatches]) {
          const lower = e.toLowerCase().trim();
          if (this.isValidBusinessEmail(lower)) {
            emailsFound.add(lower);
          }
        }

        // 3. Social media links
        if (!socials.facebook) {
          const fb = html.match(/https?:\/\/(www\.)?(facebook\.com|fb\.com)\/[a-zA-Z0-9._-]+/i);
          if (fb && !fb[0].includes('/sharer')) socials.facebook = fb[0];
        }
        if (!socials.instagram) {
          const ig = html.match(/https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i);
          if (ig) socials.instagram = ig[0];
        }
        if (!socials.linkedin) {
          const li = html.match(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i);
          if (li) socials.linkedin = li[0];
        }

        if (emailsFound.size > 0) break;
      } catch (_) {}
    }

    const email = Array.from(emailsFound)[0] || '';
    return { email, socials };
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

    // 2. Fetch existing leads & clients for deduplication
    const existingRes = await query<{ business_name: string; email: string; phone: string }>(
      `SELECT business_name, email, phone FROM leads WHERE deleted_at IS NULL
       UNION
       SELECT business_name, email, phone FROM clients WHERE deleted_at IS NULL`
    );

    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    const existingNames = new Set<string>();

    for (const r of existingRes.rows) {
      if (r.email) existingEmails.add(r.email.trim().toLowerCase());
      const pDigits = (r.phone || '').replace(/\D/g, '');
      if (pDigits.length >= 7) existingPhones.add(pDigits.slice(-10));
      const cName = this.cleanBizName(r.business_name);
      if (cName.length >= 3) existingNames.add(cName);
    }

    let importedCount = 0;
    let duplicateCount = 0;
    const insertedLeads: any[] = [];

    for (const item of rawLeads) {
      const email = (item.email || '').trim().toLowerCase();
      const phone = (item.phone || '').trim();
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneLast10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';
      const bName = (item.businessName || '').trim();
      const cleanName = this.cleanBizName(bName);

      // Check duplicates
      const isDuplicate =
        (email && existingEmails.has(email)) ||
        (phoneLast10 && existingPhones.has(phoneLast10)) ||
        (cleanName && existingNames.has(cleanName));

      if (isDuplicate) {
        duplicateCount++;
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

      const googleProfile = {
        placeName: bName,
        rating: item.rating || 4.8,
        reviewsCount: item.reviewsCount || 0,
        formattedAddress: item.address || '',
        category: item.category || 'Local Business',
        status: 'OPERATIONAL',
        website: item.website || undefined,
        phone: item.phone || undefined,
        googleMapsUrl: item.googleMapsUrl || undefined,
        hasGbpClaimed: true,
        userVerified: true,
        lastEnrichedAt: new Date().toISOString(),
      };

      const metadata = {
        source: 'gmb_scraper',
        google_profile: googleProfile,
        discovered_socials: item.discoveredSocials || {},
      };

      const location = [item.city, item.state, item.country].filter(Boolean).join(', ') || item.address;

      const insertRes = await query<any>(
        `INSERT INTO leads (
          business_name, category, phone, email, website, location, country,
          whatsapp, instagram, facebook, linkedin,
          status, consent_status, batch_id, whatsapp_eligible, whatsapp_decision_reason,
          metadata, discovered_emails, discovered_socials, last_enriched_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          'active', 'none', $12, $13, $14,
          $15, $16, $17, NOW()
        ) RETURNING *`,
        [
          bName,
          item.category || 'Local Business',
          phone || null,
          email || null,
          item.website || null,
          location,
          item.country || 'USA',
          phone || null,
          item.discoveredSocials?.instagram || null,
          item.discoveredSocials?.facebook || null,
          item.discoveredSocials?.linkedin || null,
          batchId,
          waEligible,
          waReason,
          JSON.stringify(metadata),
          email ? JSON.stringify([email]) : JSON.stringify([]),
          JSON.stringify(item.discoveredSocials || {}),
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
          await query(
            `INSERT INTO lead_list_memberships (lead_id, list_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [createdLead.id, listId]
          );
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

    // Auto-assign to platform channel lists (Email, WhatsApp, LinkedIn, IG, FB) and execute automated intake & outreach
    let intakeResult = null;
    if (insertedLeads.length > 0) {
      try {
        intakeResult = await automatedIntakeEngine.processImportedLeads(insertedLeads as any[], {
          customListId: listId,
          autoSend: true,
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
