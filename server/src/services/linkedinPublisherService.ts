import { spawn, type ChildProcess } from 'child_process';
import http from 'http';

export interface LinkedInPublishResult {
  success: boolean;
  liveDelivery: boolean;
  requiresManualShare?: boolean;
  directShareUrl?: string;
  postUrl?: string;
  errorMessage?: string;
  message: string;
}

export class LinkedInPublisherService {
  private chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  private portCounter = 9450;

  /**
   * Main publishing dispatcher:
   * 1. If OAuth accessToken is provided, attempts official LinkedIn REST API
   * 2. If li_at sessionCookie is provided, attempts Headless Chrome CDP session
   * 3. Otherwise, returns direct-share launch payload so user can post in 1-click
   */
  public async publishPost(params: {
    content: string;
    sessionCookie?: string;
    accessToken?: string;
  }): Promise<LinkedInPublishResult> {
    const { content, sessionCookie, accessToken } = params;
    const directShareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(content)}`;

    // 1. Try OAuth REST API if accessToken is provided
    if (accessToken && accessToken.trim()) {
      try {
        const oauthResult = await this.publishViaOAuth(accessToken.trim(), content);
        if (oauthResult.success) {
          return oauthResult;
        }
      } catch (err: any) {
        console.warn('[LinkedInPublisher] OAuth API post failed:', err.message);
      }
    }

    // 2. Try Headless Chrome CDP if li_at cookie is provided
    if (sessionCookie && sessionCookie.trim()) {
      try {
        console.log('[LinkedInPublisher] Attempting headless Chrome publishing with li_at cookie...');
        const cdpResult = await this.publishViaHeadlessChrome(sessionCookie.trim(), content);
        if (cdpResult.success) {
          return cdpResult;
        }
        console.warn('[LinkedInPublisher] Headless CDP publish returned error:', cdpResult.errorMessage);
        return {
          ...cdpResult,
          requiresManualShare: true,
          directShareUrl,
        };
      } catch (err: any) {
        console.warn('[LinkedInPublisher] Headless CDP exception:', err.message);
        return {
          success: false,
          liveDelivery: false,
          requiresManualShare: true,
          directShareUrl,
          errorMessage: err.message,
          message: `Automated posting paused: ${err.message}. Use 1-Click Share to post directly in your active browser.`,
        };
      }
    }

    // 3. No session cookie or token configured: provide 1-Click Direct Share
    return {
      success: true, // Saved as ready-to-share
      liveDelivery: false,
      requiresManualShare: true,
      directShareUrl,
      message: 'Post saved and prepared! Click "Share to LinkedIn" to post immediately in your active LinkedIn browser tab.',
    };
  }

  /**
   * Publishes via Official LinkedIn REST API
   */
  private async publishViaOAuth(accessToken: string, content: string): Promise<LinkedInPublishResult> {
    // First, fetch the authenticated user profile URN
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!profileRes.ok) {
      throw new Error(`LinkedIn OAuth userinfo failed: ${profileRes.status} ${profileRes.statusText}`);
    }

    const profileData = (await profileRes.json()) as { sub?: string; [key: string]: any };
    const sub = profileData.sub;
    if (!sub) {
      throw new Error('Could not determine LinkedIn user URN sub from token');
    }

    const postPayload = {
      author: `urn:li:person:${sub}`,
      commentary: content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const postRes = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postPayload),
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      throw new Error(`LinkedIn REST API error: ${postRes.status} - ${errText}`);
    }

    const postUrn = postRes.headers.get('x-restli-id') || '';
    return {
      success: true,
      liveDelivery: true,
      postUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : 'https://www.linkedin.com/feed/',
      message: 'Published directly to LinkedIn feed via official LinkedIn API!',
    };
  }

  /**
   * Publishes via Headless Chrome using CDP and li_at session cookie
   */
  private async publishViaHeadlessChrome(sessionCookie: string, content: string): Promise<LinkedInPublishResult> {
    const port = ++this.portCounter;
    let chromeProc: ChildProcess | null = null;
    let ws: WebSocket | null = null;

    try {
      chromeProc = spawn(this.chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--window-size=1280,900',
        'about:blank',
      ]);

      await new Promise((res) => setTimeout(res, 1200));
      const wsUrl = await this.getWsUrl(port);
      ws = new WebSocket(wsUrl);
      await new Promise((res) => { ws!.onopen = res as any; });

      const cdp = new CDPClient(ws);
      await cdp.send('Network.enable');
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');

      // Set user agent
      await cdp.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      });

      // Inject li_at cookie
      await cdp.send('Network.setCookie', {
        name: 'li_at',
        value: sessionCookie,
        domain: '.linkedin.com',
        path: '/',
        secure: true,
        httpOnly: true,
      });

      console.log('[LinkedInPublisher] Navigating to LinkedIn Feed...');
      await cdp.send('Page.navigate', { url: 'https://www.linkedin.com/feed/' });
      await new Promise((res) => setTimeout(res, 4500));

      // Check current page URL & title to detect login wall / checkpoints
      const pageInfo = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({ url: window.location.href, title: document.title, bodyTextLength: document.body.innerText.length })`,
      });
      const parsedInfo = JSON.parse(pageInfo?.result?.value || '{}');
      console.log('[LinkedInPublisher] Page state:', parsedInfo);

      if (parsedInfo.url && (parsedInfo.url.includes('/login') || parsedInfo.url.includes('/authwall') || parsedInfo.url.includes('/checkpoint'))) {
        return {
          success: false,
          liveDelivery: false,
          errorMessage: 'LinkedIn session cookie (li_at) is expired or required security verification. Please update your cookie or use 1-Click Share.',
          message: 'LinkedIn session cookie expired. Please use 1-Click Direct Share.',
        };
      }

      // Check for share trigger button
      const clickTrigger = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.querySelector('button.share-box-feed-entry__trigger, button[id*="share-box-feed-entry"], .share-box-feed-entry button, [data-view-name="share-box-feed-entry__trigger"]');
            if (btn) {
              btn.click();
              return 'clicked trigger';
            }
            return 'trigger not found';
          })()
        `,
      });
      console.log('[LinkedInPublisher] Trigger click:', clickTrigger?.result?.value);

      if (clickTrigger?.result?.value !== 'clicked trigger') {
        // Fallback: direct navigation with shareActive
        await cdp.send('Page.navigate', { url: 'https://www.linkedin.com/feed/?shareActive=true' });
        await new Promise((res) => setTimeout(res, 3500));
      } else {
        await new Promise((res) => setTimeout(res, 2000));
      }

      // Insert content into the post modal editor
      const insertResult = await cdp.send('Runtime.evaluate', {
        expression: `
          ((postText) => {
            const editor = document.querySelector('div.ql-editor[contenteditable="true"], div[role="textbox"], div[aria-label*="What do you want to talk about"], div[data-placeholder*="What do you want to talk about"]');
            if (!editor) {
              return { success: false, error: 'Editor modal not found' };
            }

            editor.focus();
            // Clear placeholder paragraphs
            editor.innerHTML = '';
            
            // Format paragraphs
            const lines = postText.split('\\n');
            lines.forEach((line) => {
              const p = document.createElement('p');
              p.textContent = line || ' ';
              editor.appendChild(p);
            });

            // Dispatch input events
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            return { success: true };
          })(${JSON.stringify(content)})
        `,
      });

      console.log('[LinkedInPublisher] Editor insert result:', insertResult?.result?.value);
      const editorStatus = insertResult?.result?.value;

      if (!editorStatus || !editorStatus.success) {
        return {
          success: false,
          liveDelivery: false,
          errorMessage: 'Could not open post composer in LinkedIn browser session.',
          message: 'Could not open post composer. Use 1-Click Share to publish directly.',
        };
      }

      await new Promise((res) => setTimeout(res, 1500));

      // Click the "Post" button
      const postClickResult = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const postBtn = buttons.find(b => {
              const txt = (b.innerText || '').trim().toLowerCase();
              return txt === 'post' && !b.disabled;
            });

            if (postBtn) {
              postBtn.click();
              return 'clicked post button';
            }
            return 'post button not found or disabled';
          })()
        `,
      });
      console.log('[LinkedInPublisher] Post click result:', postClickResult?.result?.value);

      if (postClickResult?.result?.value === 'clicked post button') {
        await new Promise((res) => setTimeout(res, 3000));
        return {
          success: true,
          liveDelivery: true,
          message: 'Post successfully published directly to your LinkedIn feed!',
        };
      }

      return {
        success: false,
        liveDelivery: false,
        errorMessage: 'Post button was disabled or not found.',
        message: 'Could not click Post button. Use 1-Click Share to complete.',
      };
    } finally {
      if (ws) {
        try { ws.close(); } catch {}
      }
      if (chromeProc) {
        try { chromeProc.kill(); } catch {}
      }
    }
  }

  /**
   * Verifies if a given li_at session cookie logs in cleanly to LinkedIn
   */
  public async verifyCookie(cookie: string): Promise<{ valid: boolean; accountName?: string; headline?: string; error?: string }> {
    if (!cookie || !cookie.trim()) {
      return { valid: false, error: 'Session cookie is empty.' };
    }

    const port = ++this.portCounter;
    let chromeProc: ChildProcess | null = null;
    let ws: WebSocket | null = null;

    try {
      chromeProc = spawn(this.chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--window-size=1280,900',
        'about:blank',
      ]);

      await new Promise((res) => setTimeout(res, 1200));
      const wsUrl = await this.getWsUrl(port);
      ws = new WebSocket(wsUrl);
      await new Promise((res) => { ws!.onopen = res as any; });

      const cdp = new CDPClient(ws);
      await cdp.send('Network.enable');
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');

      await cdp.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      });

      await cdp.send('Network.setCookie', {
        name: 'li_at',
        value: cookie.trim(),
        domain: '.linkedin.com',
        path: '/',
        secure: true,
        httpOnly: true,
      });

      await cdp.send('Page.navigate', { url: 'https://www.linkedin.com/feed/' });
      await new Promise((res) => setTimeout(res, 4000));

      const res = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const url = window.location.href;
            if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
              return { valid: false, error: 'Redirected to login/checkpoint' };
            }
            // Check identity card
            const nameEl = document.querySelector('.feed-identity-module__actor-meta a, [data-view-name="feed-identity-module"] h3, .identity-headline, h3[class*="identity"]');
            const headlineEl = document.querySelector('.feed-identity-module__actor-meta p, .identity-headline');
            return {
              valid: true,
              name: nameEl ? nameEl.innerText.trim() : 'LinkedIn Member',
              headline: headlineEl ? headlineEl.innerText.trim() : 'Active Member',
            };
          })()
        `,
      });

      const val = res?.result?.value;
      if (val && val.valid) {
        return { valid: true, accountName: val.name, headline: val.headline };
      }
      return { valid: false, error: val?.error || 'Could not verify LinkedIn session cookie' };
    } catch (err: any) {
      return { valid: false, error: err.message };
    } finally {
      if (ws) {
        try { ws.close(); } catch {}
      }
      if (chromeProc) {
        try { chromeProc.kill(); } catch {}
      }
    }
  }

  private async getWsUrl(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const list = JSON.parse(data);
            const page = list.find((t: any) => t.type === 'page') || list[0];
            resolve(page.webSocketDebuggerUrl);
          } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }
}

class CDPClient {
  private id = 1;
  private callbacks = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

  constructor(private ws: WebSocket) {
    this.ws.onmessage = (event: any) => {
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id)!;
          this.callbacks.delete(data.id);
          if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
          else resolve(data.result);
        }
      } catch {}
    };
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
}

export const linkedinPublisherService = new LinkedInPublisherService();
