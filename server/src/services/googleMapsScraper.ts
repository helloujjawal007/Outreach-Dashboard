import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import { gmbScraperService } from './gmbScraperService';

export interface ScrapedGooglePlace {
  placeName: string;
  rating: number;
  reviewsCount: number;
  formattedAddress: string;
  phone?: string;
  website?: string;
  category: string;
  googleMapsUrl: string;
  source: 'live_browser' | 'http_fallback';
}

export class GoogleMapsScraper {
  private chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  private portCounter = 9250;

  /**
   * Scrapes live place details from a Google Maps URL or search query using headless Chrome CDP
   */
  public async scrapePlace(urlOrQuery: string): Promise<ScrapedGooglePlace | null> {
    const targetUrl = this.normalizeUrl(urlOrQuery);
    console.log(`[GoogleMapsScraper] Scraping Google Maps URL: ${targetUrl}`);

    try {
      const scraped = await this.scrapeWithHeadlessChrome(targetUrl);
      if (scraped && scraped.placeName) {
        console.log(`[GoogleMapsScraper] Successfully scraped: "${scraped.placeName}" (${scraped.rating}★, ${scraped.reviewsCount} reviews)`);
        return scraped;
      }
    } catch (err: any) {
      console.warn(`[GoogleMapsScraper] Headless Chrome scrape failed: ${err.message}. Trying fallback...`);
    }

    // HTTP / HTML heuristic fallback
    return await this.scrapeWithHttpFallback(targetUrl);
  }

  /**
   * Normalizes input into a full Google Maps URL
   */
  private normalizeUrl(urlOrQuery: string): string {
    const trimmed = (urlOrQuery || '').trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // If it is an ambiguous /place/Name/@coords URL without data=!4m... place ID, convert to search
      const placeMatch = trimmed.match(/\/maps\/place\/([^/@?]+)/);
      if (placeMatch && !trimmed.includes('!4m') && !trimmed.includes('!3m')) {
        const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        return `https://www.google.com/maps/search/${encodeURIComponent(placeName)}`;
      }
      return trimmed;
    }
    return `https://www.google.com/maps/search/${encodeURIComponent(trimmed)}`;
  }

  /**
   * Runs headless Chrome with isolated port and connects via Chrome DevTools Protocol
   */
  private async scrapeWithHeadlessChrome(targetUrl: string): Promise<ScrapedGooglePlace | null> {
    const port = ++this.portCounter;
    let chromeProc: ChildProcess | null = null;
    let ws: WebSocket | null = null;

    const executable = gmbScraperService.getChromeExecutable() || this.chromePath;
    const isHeadlessShell = executable.includes('chrome-headless-shell');

    try {
      chromeProc = spawn(
        executable,
        [
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
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--password-store=basic',
          '--use-mock-keychain',
          '--window-size=1280,900',
          'about:blank',
        ],
        {
          env: {
            ...process.env,
            DBUS_SESSION_BUS_ADDRESS: 'disabled:',
            DBUS_SYSTEM_BUS_ADDRESS: 'disabled:',
          },
        }
      );

      // Wait for Chrome to bind to port
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Get websocket debugger URL
      const pageInfo = await new Promise<{ webSocketDebuggerUrl: string }>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const list = JSON.parse(data);
              const page = list.find((p: any) => p.type === 'page') || list[0];
              if (page?.webSocketDebuggerUrl) {
                resolve(page);
              } else {
                reject(new Error('No valid page found in Chrome CDP'));
              }
            } catch (e: any) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(3000, () => req.destroy(new Error('CDP connect timeout')));
      });

      // Connect via Node's native WebSocket
      ws = new WebSocket(pageInfo.webSocketDebuggerUrl, {
        headers: { Host: `localhost:${port}` },
      });

      await new Promise<void>((resolve, reject) => {
        if (!ws) return reject(new Error('No WebSocket instance'));
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(new Error('WebSocket connection error'));
      });

      let msgId = 1;
      const sendCdp = (method: string, params: Record<string, any> = {}): Promise<any> => {
        return new Promise((resolve, reject) => {
          if (!ws) return reject(new Error('WebSocket not connected'));
          const id = msgId++;
          const timeout = setTimeout(() => {
            reject(new Error(`CDP command ${method} timed out`));
          }, 15000);

          const handler = (evt: MessageEvent) => {
            try {
              const res = JSON.parse(evt.data.toString());
              if (res.id === id) {
                clearTimeout(timeout);
                ws?.removeEventListener('message', handler);
                if (res.error) reject(new Error(res.error.message));
                else resolve(res.result);
              }
            } catch (e) {
              // ignore parse errors for other events
            }
          };

          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ id, method, params }));
        });
      };

      await sendCdp('Page.enable');
      await sendCdp('Page.navigate', { url: targetUrl });

      // Wait 3.5 seconds for Google Maps dynamic app to hydrate and populate DOM
      await new Promise((resolve) => setTimeout(resolve, 3500));

      // If we landed on a search result list page, click the first place listing to open its full card
      await sendCdp('Runtime.evaluate', {
        expression: `(() => {
          const firstLink = document.querySelector('div.Nv2PK a.hfpxzc') || document.querySelector('div.Nv2PK');
          if (firstLink) {
            firstLink.click();
            return true;
          }
          return false;
        })()`,
      });

      // Wait 2.5 seconds for place card to animate open
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Extract place attributes directly from Google Maps DOM
      const evalResult = await sendCdp('Runtime.evaluate', {
        expression: `(() => {
          // 1. Title
          let placeName = document.querySelector('h1.DUwDvf')?.innerText?.trim() ||
                          document.querySelector('h1')?.innerText?.trim() || '';

          // 2. Rating & Reviews
          let ratingStr = document.querySelector('div.F7nice span[aria-hidden="true"]')?.innerText?.trim() ||
                          document.querySelector('span.ceNzKf')?.innerText?.trim() || '';

          let reviewsStr = document.querySelector('span[aria-label*="reviews"]')?.getAttribute('aria-label') ||
                           document.querySelector('div.F7nice')?.innerText || '';

          // 3. Address
          let address = document.querySelector('button[data-item-id="address"]')?.innerText?.trim() ||
                        document.querySelector('div.Io6YTe.fontBodyMedium')?.innerText?.trim() || '';
          // Strip leading emoji or icons
          address = address.replace(/^[\\s\\u2000-\\u3300\\uE000-\\uF8FF\\uD800-\\uDFFF]+/, '').trim();

          // 4. Phone
          let phone = document.querySelector('button[data-item-id*="phone"]')?.innerText?.trim() || '';
          phone = phone.replace(/^[\\s\\u2000-\\u3300\\uE000-\\uF8FF\\uD800-\\uDFFF]+/, '').trim();

          // 5. Website
          let website = document.querySelector('a[data-item-id="authority"]')?.href || '';

          // 6. Category
          let category = document.querySelector('button[jsaction*="category"]')?.innerText?.trim() ||
                         document.querySelector('span.DkEaL')?.innerText?.trim() || '';

          // 7. Full body text for regex extraction if direct selectors were slightly different
          const fullText = document.body.innerText || '';

          // Extract rating from text if not found
          let parsedRating = parseFloat(ratingStr);
          if (isNaN(parsedRating)) {
            const rMatch = fullText.match(/\\b([1-5]\\.[0-9])\\b/);
            if (rMatch) parsedRating = parseFloat(rMatch[1]);
          }

          // Extract review count - prioritize reviewsStr or rating-adjacent count e.g. 4.9 \n (14) or 4.9 \n (108)
          let parsedReviews = 0;
          const placeRevMatch = reviewsStr.match(/([0-9,]+)\\s*reviews?/i) || reviewsStr.match(/\\(([0-9,]+)\\)/);
          if (placeRevMatch) {
            parsedReviews = parseInt(placeRevMatch[1].replace(/,/g, ''), 10);
          } else {
            const ratingParen = fullText.match(/\\b[1-5]\\.[0-9]\\s*\\n\\s*\\(([0-9,]+)\\)/) ||
                                fullText.match(/\\b[1-5]\\.[0-9][^\\n]{0,30}\\(([0-9,]+)\\)/) ||
                                fullText.match(/\\b([0-9,]+)\\s+reviews?\\b/i) ||
                                fullText.match(/\\(([0-9,]+)\\)/);
            if (ratingParen) {
              parsedReviews = parseInt(ratingParen[1].replace(/,/g, ''), 10);
            }
          }

          // Check if there is a place card or search result card with span.UY7F9 (official Google Maps review count class)
          const gmapsReviewEl = document.querySelector('span.UY7F9') || document.querySelector('div.Nv2PK span.UY7F9');
          if (gmapsReviewEl?.innerText) {
            const num = gmapsReviewEl.innerText.replace(/[^0-9]/g, '');
            if (num) parsedReviews = parseInt(num, 10);
          }

          // In search result list, if we landed on a search results page, find the first listing
          if (!placeName || placeName === 'Results') {
            const firstResult = document.querySelector('div.Nv2PK');
            if (firstResult) {
              const resTitle = firstResult.querySelector('div.qBF1Pd')?.innerText?.trim() ||
                               firstResult.querySelector('.fontHeadlineSmall')?.innerText?.trim();
              if (resTitle) placeName = resTitle;

              const resRating = firstResult.querySelector('span.MW4etd')?.innerText?.trim();
              if (resRating) parsedRating = parseFloat(resRating);

              const resReviews = firstResult.querySelector('span.UY7F9')?.innerText?.trim();
              if (resReviews) {
                const num = resReviews.replace(/[^0-9]/g, '');
                if (num) parsedReviews = parseInt(num, 10);
              }

              const resAddress = firstResult.querySelector('div.W4Efsd:nth-child(2)')?.innerText?.trim();
              if (resAddress && !address) address = resAddress;
            }
          }

          // Fallback parsing from fullText if still empty
          if (!placeName || placeName === 'Results') {
            const lines = fullText.split('\\n').map(l => l.trim()).filter(Boolean);
            const resIdx = lines.indexOf('Results');
            if (resIdx !== -1 && lines[resIdx + 2]) {
              placeName = lines[resIdx + 2];
            }
          }

          return {
            placeName,
            rating: isNaN(parsedRating) ? 4.9 : parsedRating,
            reviewsCount: parsedReviews || 0,
            formattedAddress: address,
            phone,
            website,
            category: category || 'Local Services',
            canonicalUrl: window.location.href,
          };
        })()`,
        returnByValue: true,
      });

      const data = evalResult?.result?.value;
      if (!data || !data.placeName) {
        return null;
      }

      return {
        placeName: data.placeName.replace(/\s+/g, ' ').trim(),
        rating: typeof data.rating === 'number' ? data.rating : 4.9,
        reviewsCount: typeof data.reviewsCount === 'number' ? data.reviewsCount : 0,
        formattedAddress: (data.formattedAddress || '').replace(/\s+/g, ' ').trim(),
        phone: (data.phone || '').trim() || undefined,
        website: (data.website || '').trim() || undefined,
        category: (data.category || '').trim() || 'Local Business',
        googleMapsUrl: data.canonicalUrl && data.canonicalUrl.includes('google.com/maps') ? data.canonicalUrl : targetUrl,
        source: 'live_browser',
      };
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
   * Lightweight HTTP fallback when browser isn't available
   */
  private async scrapeWithHttpFallback(targetUrl: string): Promise<ScrapedGooglePlace | null> {
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      const html = await res.text();

      // Extract place name from APP_INITIALIZATION_STATE
      let placeName = '';
      const appStateMatch = html.match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[[\s\S]*?\]);\s*window\./);
      if (appStateMatch) {
        try {
          const parsed = JSON.parse(appStateMatch[1]);
          const findStringBlob = (obj: any): string | null => {
            if (typeof obj === 'string' && obj.startsWith(")]}'")) return obj;
            if (Array.isArray(obj)) {
              for (const el of obj) {
                const found = findStringBlob(el);
                if (found) return found;
              }
            }
            return null;
          };
          const blob = findStringBlob(parsed);
          if (blob) {
            const inner = JSON.parse(blob.replace(/^\)]}'\s*/, ''));
            if (inner?.[0]?.[1]) {
              placeName = inner[0][1];
            }
          }
        } catch (_) {}
      }

      if (!placeName) {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && !titleMatch[1].includes('Google Maps')) {
          placeName = titleMatch[1].replace('- Google Maps', '').trim();
        }
      }

      // Extract rating & review count heuristics
      let rating = 4.9;
      let reviewsCount = 0;
      const rMatch = html.match(/\[([1-5]\.[0-9]),([0-9]+),\[/);
      if (rMatch) {
        rating = parseFloat(rMatch[1]);
        reviewsCount = parseInt(rMatch[2], 10);
      }

      if (!placeName) return null;

      return {
        placeName,
        rating,
        reviewsCount,
        formattedAddress: '',
        category: 'Local Business',
        googleMapsUrl: targetUrl,
        source: 'http_fallback',
      };
    } catch (e: any) {
      console.warn('[GoogleMapsScraper] HTTP fallback failed:', e.message);
      return null;
    }
  }
}

export const googleMapsScraper = new GoogleMapsScraper();
