import http from 'http';

/**
 * DevMockDaemons
 * 
 * Provides lightweight fallback daemons for local development and automated QA testing
 * when external services (Technical Dashboard on :5055, Ollama on :11434) are not running
 * as external processes. If live daemons are running, EADDRINUSE is safely caught and ignored.
 */

let tdServer: http.Server | null = null;
let ollamaServer: http.Server | null = null;

export function startDevMockDaemons(): void {
  // 1. Technical Dashboard (TD) Dev Daemon (:5055)
  if (!tdServer) {
    const server = http.createServer((req, res) => {
      const url = req.url?.split('?')[0] || '';

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-audit-secret, x-td-secret');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url === '/' || url === '/api' || url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, status: 'online', service: 'Technical Dashboard (TD) Engine' }));
        return;
      }

      if (url === '/api/od/audit-request' || url === '/api/audit/request') {
        let bodyStr = '';
        req.on('data', (chunk) => { bodyStr += chunk; });
        req.on('end', async () => {
          try {
            const body = bodyStr ? JSON.parse(bodyStr) : {};
            const authHeader = req.headers['authorization'] || '';
            const secret = req.headers['x-audit-secret'] || req.headers['x-td-secret'] || req.headers['x-od-secret'] || '';
            const expectedKey = process.env.OD_INTERNAL_API_KEY || 'od-secret-key-2026';

            // Verify bearer token if provided
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.slice(7).trim();
              if (token !== expectedKey && token !== 'td-secret-key-2026') {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Unauthorized: Invalid bearer token' }));
                return;
              }
            }

            // Handle ping/probe check
            if (body.ping || body.testProbe) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                success: true,
                status: 'pong',
                message: 'Technical Dashboard (TD) Audit Engine Online',
                timestamp: new Date().toISOString(),
              }));
              return;
            }

            const targetUrl = body.websiteUrl || body.website || 'example.com';
            const companyName = body.companyName || body.company || 'Your Business';
            const cleanDomain = targetUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            const leadIdPart = body.leadId ? String(body.leadId).slice(0, 8) : Math.random().toString(36).substring(2, 8);
            const auditId = `td_audit_${leadIdPart}_${Date.now().toString(36)}`;

            let completedPayload: any;
            if (process.env.MOCK_TD === 'true') {
              const score = 84;
              completedPayload = {
                ok: true,
                success: true,
                status: 'completed',
                source: 'technical-audit-dashboard',
                auditId,
                cached: false,
                score,
                metrics: {
                  lcpEstimateMs: 1850,
                  clsScore: 0.03,
                  inpEstimateMs: 110,
                  responseTimeMs: 160,
                  imagesTotal: 22,
                  imagesMissingAlt: 3,
                  hasLocalBusinessSchema: true,
                  hasViewport: true,
                  hasSsl: true,
                  pageWeightKb: 1140,
                },
                keyTakeaways: `Desktop Speed (LCP: 1.8s); Core Web Vitals Passing; 3 images missing alt tags; HTTPS enforced`,
                criticalIssues: [
                  `Desktop Speed Performance Score: ${score}/100 (LCP 1.8s)`,
                  `3 images missing descriptive alt tags for accessibility and image search`,
                  `HSTS Security Header recommended to prevent protocol downgrade attacks`,
                ],
                recommendations: [
                  {
                    priority: 'high',
                    title: 'Add descriptive alt attributes to high-traffic images',
                    detail: 'Adding keyword-relevant alt attributes improves image search discoverability.',
                    odsSolution: 'Automatic image optimization & accessibility tagging',
                  },
                ],
                summary: `Technical SEO & Speed Audit for ${companyName} (${cleanDomain})`,
                auditedAt: new Date().toISOString(),
              };
            } else {
              // Run real audit engine (TD Supabase seo-audit + local fallback) instead of hardcoded fake score 84
              const { clientAuditService } = await import('./clientAuditIntelligenceService');
              const report = await clientAuditService.auditWebsite(targetUrl);
              completedPayload = {
                ok: true,
                success: true,
                status: 'completed',
                source: report.source || 'technical-audit-dashboard',
                auditId: report.auditId || auditId,
                cached: false,
                score: report.overallScore,
                metrics: report.metrics,
                checks: report.checks,
                keyTakeaways: report.auditKeyTakeaways || (report.criticalIssues || []).slice(0, 3).join('; '),
                criticalIssues: report.criticalIssues,
                recommendations: report.recommendations,
                summary: report.summary || `Technical SEO & Speed Audit for ${companyName} (${cleanDomain})`,
                auditedAt: report.auditedAt || new Date().toISOString(),
              };
            }

            // Respond synchronously with completed payload
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(completedPayload));

            // If callbackUrl provided, also dispatch asynchronously for webhook subscribers
            if (body.callbackUrl && body.leadId) {
              setTimeout(async () => {
                try {
                  await fetch(body.callbackUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-audit-secret': (secret as string) || 'td-secret-key-2026',
                      'x-td-secret': (secret as string) || 'td-secret-key-2026',
                    },
                    body: JSON.stringify({
                      leadId: body.leadId,
                      website: targetUrl,
                      status: 'completed',
                      source: completedPayload.source || 'technical-audit-dashboard',
                      auditReport: completedPayload,
                    }),
                  });
                } catch {
                  // Ignore
                }
              }, 200);
            }
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Audit request error' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log('[DevMockDaemons] External Technical Dashboard process already active on port 5055.');
      } else {
        console.warn('[DevMockDaemons] TD mock server error:', err.message);
      }
    });

    try {
      server.listen(5055, '127.0.0.1', () => {
        console.log('[DevMockDaemons] 🔌 Technical Dashboard (TD) Dev Daemon active on http://127.0.0.1:5055');
      });
      tdServer = server;
    } catch {
      // Ignore
    }
  }

  // 2. Ollama Local LLM Dev Daemon (:11434)
  if (!ollamaServer) {
    const server = http.createServer((req, res) => {
      const url = req.url?.split('?')[0] || '';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url === '/' || url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Ollama is running');
        return;
      }

      if (url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          models: [
            { name: 'llama3.1:8b', size: 4661224676, modified_at: new Date().toISOString() },
            { name: 'mistral:7b', size: 4109865184, modified_at: new Date().toISOString() },
          ],
        }));
        return;
      }

      if (url === '/api/generate') {
        let bodyStr = '';
        req.on('data', (chunk) => { bodyStr += chunk; });
        req.on('end', () => {
          try {
            const body = bodyStr ? JSON.parse(bodyStr) : {};
            const responseText = `Hi there,\n\nFollowing up regarding how we help similar businesses review their local search visibility and streamline client inquiry follow-ups. Would you be open to a quick 3-minute walkthrough this week to see if this could be helpful?\n\nBest regards,\nCloud Consultancy\ncloudconsultancy.ad@gmail.com`;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              model: body.model || 'llama3.1:8b',
              created_at: new Date().toISOString(),
              response: responseText,
              done: true,
              total_duration: 120000000,
            }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err?.message || 'Invalid JSON' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log('[DevMockDaemons] External Ollama process already active on port 11434.');
      } else {
        console.warn('[DevMockDaemons] Ollama mock server error:', err.message);
      }
    });

    try {
      server.listen(11434, '127.0.0.1', () => {
        console.log('[DevMockDaemons] 🦙 Local Ollama Dev Daemon active on http://127.0.0.1:11434');
      });
      ollamaServer = server;
    } catch {
      // Ignore
    }
  }
}

export function stopDevMockDaemons(): void {
  if (tdServer) {
    try { tdServer.close(); } catch {}
    tdServer = null;
  }
  if (ollamaServer) {
    try { ollamaServer.close(); } catch {}
    ollamaServer = null;
  }
}

