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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-audit-secret, x-td-secret');

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
        req.on('end', () => {
          try {
            const body = bodyStr ? JSON.parse(bodyStr) : {};
            const secret = req.headers['x-audit-secret'] || req.headers['x-td-secret'] || '';

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

            // Acknowledge audit request
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ok: true,
              success: true,
              status: 'queued',
              message: 'Audit request accepted by TD',
              leadId: body.leadId,
            }));

            // If callbackUrl provided, asynchronously send realistic audit findings
            if (body.callbackUrl && body.leadId) {
              setTimeout(async () => {
                try {
                  const auditPayload = {
                    leadId: body.leadId,
                    website: body.website || 'example.com',
                    status: 'completed',
                    auditReport: {
                      score: 42,
                      performanceScore: 48,
                      seoScore: 55,
                      criticalIssues: [
                        'High-Performance Website Development & Core Web Vitals Optimization: LCP is 4.8s (exceeds recommended 2.5s)',
                        'Missing SSL/TLS HSTS security header configuration',
                        'Mobile layout viewport shift on navigation menu',
                      ],
                    },
                  };

                  await fetch(body.callbackUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-audit-secret': (secret as string) || 'td-secret-key-2026',
                      'x-td-secret': (secret as string) || 'td-secret-key-2026',
                    },
                    body: JSON.stringify(auditPayload),
                  });
                } catch (cbErr: any) {
                  console.warn('[TD Dev Daemon] Callback dispatch notice:', cbErr?.message);
                }
              }, 400);
            }
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid JSON' }));
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

