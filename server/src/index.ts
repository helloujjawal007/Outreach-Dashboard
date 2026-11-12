import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { testConnection, query, pool } from './config/db';
import { ollamaService } from './services/ollamaService';
import { leadsRouter } from './routes/leads';
import { clientsRouter } from './routes/clients';
import { conversationsRouter } from './routes/conversations';
import { campaignsRouter } from './routes/campaigns';
import { queueRouter } from './routes/queue';
import { healthRouter } from './routes/health';
import { aiRouter } from './routes/ai';
import { adaptersRouter } from './routes/adapters';
import { listsRouter } from './routes/lists';
import { batchesRouter } from './routes/batches';
import { schedulerRouter } from './routes/scheduler';
import { inboxesRouter } from './routes/inboxes';
import { autopilotRouter } from './routes/autopilot';
import { scraperRouter } from './routes/scraper';
import { auditRouter } from './routes/audit';
import { authRouter } from './routes/auth';
import { dealsRouter } from './routes/deals';
import { activitiesRouter } from './routes/activities';
import { tasksRouter } from './routes/tasks';
import { suppressionRouter } from './routes/suppression';
import { sequencesRouter } from './routes/sequences';
import { unsubscribeRouter } from './routes/unsubscribe';
import { auditCallbackRouter, auditCallbackAuthMiddleware } from './routes/auditCallback';
import { failuresRouter } from './routes/failures';
import { slotsRouter } from './routes/slots';
import { requireAuth } from './middleware/auth';
import { emailInboundService } from './services/emailInboundService';
import { emailSchedulerService } from './services/emailSchedulerService';
import { fiveSlotSenderService } from './services/fiveSlotSenderService';
import { startDevMockDaemons, stopDevMockDaemons } from './services/devMockDaemons';
// Prevent unhandled errors or socket drops from crashing the Express API server
process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException Handled]', err?.message || err);
});

// 12-Minute Render Keep-Alive Heartbeat (prevents Render 15-minute inactivity spin-down)
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL 
  ? `${process.env.RENDER_EXTERNAL_URL}/api`
  : (process.env.KEEP_ALIVE_URL || 'https://outreach-dashboard-22t5.onrender.com/api');

let keepAliveTimer: NodeJS.Timeout | null = null;
if (process.env.NODE_ENV === 'production' || process.env.KEEP_ALIVE_URL) {
  keepAliveTimer = setInterval(async () => {
    try {
      const res = await fetch(keepAliveUrl);
      console.log(`[Keep-Alive Heartbeat] 12-min ping to ${keepAliveUrl} -> HTTP ${res.status}`);
    } catch (err: any) {
      console.warn('[Keep-Alive Heartbeat Warning]', err?.message || err);
    }
  }, 12 * 60 * 1000);
}


process.on('unhandledRejection', (reason) => {
  console.error('[Server UnhandledRejection Handled]', reason);
});

const app = express();

// Security Hardening: Disable server fingerprints & enforce security headers
app.disable('x-powered-by');

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Security Barrier: Block path traversal, null bytes, and unauthorized access to source/config files
app.use((req: Request, res: Response, next: NextFunction) => {
  let decoded = req.path;
  try {
    decoded = decodeURIComponent(req.path);
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }
  } catch (_) {
    return res.status(400).json({ success: false, error: 'Malformed request path' });
  }

  const lower = decoded.toLowerCase();

  // Null byte or path traversal injection
  if (lower.includes('\0') || lower.includes('..') || lower.includes('\\')) {
    return res.status(403).json({ success: false, error: 'Access forbidden: invalid path tokens' });
  }

  // Block hidden files or directories (.env, .git, etc.)
  if (/(^|\/)\./.test(lower)) {
    return res.status(403).json({ success: false, error: 'Access forbidden: hidden resources restricted' });
  }

  // Block source code, build configs, system scripts, and credentials with boundary checks
  const restrictedSegmentRegex = /(?:^|\/)(?:server|src|node_modules|\.git|\.env[^/]*)(?:\/|$)/i;
  const restrictedFileRegex = /(?:package\.json|package-lock\.json|tsconfig[^/]*|dockerfile|render\.yaml|vite\.config[^/]*|tailwind\.config[^/]*|render-build[^/]*)$/i;
  const restrictedExtRegex = /\.(?:ts|tsx|sh|log|env)$/i;

  if (
    restrictedSegmentRegex.test(lower) ||
    restrictedFileRegex.test(lower) ||
    restrictedExtRegex.test(lower)
  ) {
    return res.status(403).json({ success: false, error: 'Access forbidden: restricted resource' });
  }

  next();
});

// Allowed origins whitelist for CORS and CSRF protection
const allowedOrigins = new Set<string>([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5001',
  'http://127.0.0.1:5001',
]);
if (process.env.APP_URL) {
  try {
    allowedOrigins.add(new URL(process.env.APP_URL).origin);
  } catch {}
}
if (process.env.RENDER_EXTERNAL_URL) {
  try {
    allowedOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
  } catch {}
}
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
    const trimmed = o.trim();
    if (trimmed) allowedOrigins.add(trimmed);
  });
}

const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.onrender.com')) return true;
  } catch {}
  return false;
};

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

// Dedicated Audit Callback Endpoint:
// 1. Checks x-audit-secret header BEFORE reading/parsing body
// 2. Body limit strictly capped at 10 MB (reduced from 50MB)
app.use(
  '/api/audit-callback',
  auditCallbackAuthMiddleware,
  express.json({ limit: '10mb' }),
  auditCallbackRouter
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging in development
if (env.NODE_ENV !== 'production') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[API ${req.method}] ${req.path}`);
    next();
  });
}

// API Health / Status endpoint
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    service: 'Cloud Consultancy API',
    version: '2.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// Public Authentication Routes (login, logout, session check)
app.use('/api/auth', authRouter);

// Public Unsubscribe Routes (whitelisted from authentication)
app.use('/api/unsubscribe', unsubscribeRouter);
app.use('/unsubscribe', unsubscribeRouter);

// Global Authentication Gate (protects all /api routes except public endpoints)
app.use('/api', requireAuth);

// Mount Protected API Routes
app.use('/api/leads', leadsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/health', healthRouter);
app.use('/api/ai', aiRouter);
app.use('/api/adapters', adaptersRouter);
app.use('/api/lists', listsRouter);
app.use('/api/batches', batchesRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/inboxes', inboxesRouter);
app.use('/api/autopilot', autopilotRouter);
app.use('/api/scraper', scraperRouter);
app.use('/api/audit', auditRouter);
app.use('/api/deals', dealsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/suppression', suppressionRouter);
app.use('/api/sequences', sequencesRouter);
app.use('/api/failures', failuresRouter);
app.use('/api/slots', slotsRouter);

// Forward /api/settings/test-td-connection to fiveSlotSenderService
app.post('/api/settings/test-td-connection', async (req, res) => {
  try {
    const { url, secret } = req.body || {};
    const result = await fiveSlotSenderService.testTdConnection(url, secret);
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, ok: false, message: err?.message || 'TD probe failure' });
  }
});

// Automatic 28-Day Retention Cleanup Routine
async function run28DayRetentionCleanup() {
  try {
    const purgedLeads = await query(`
      DELETE FROM leads 
      WHERE deleted_at IS NOT NULL AND deleted_expires_at < NOW()
      RETURNING id
    `);
    const purgedBatches = await query(`
      DELETE FROM upload_batches 
      WHERE expires_at < NOW()
      RETURNING id
    `);
    const purgedHistory = await query(`
      DELETE FROM deletion_history 
      WHERE expires_at < NOW()
      RETURNING id
    `);

    if (purgedLeads.rows.length > 0 || purgedBatches.rows.length > 0 || purgedHistory.rows.length > 0) {
      console.log(`[Retention Cleanup] Purged ${purgedLeads.rows.length} expired trash leads, ${purgedBatches.rows.length} expired batches, ${purgedHistory.rows.length} audit logs (>28 days old).`);
    }
  } catch (err) {
    console.error('[Retention Cleanup Error]', err);
  }
}

// Automatic 30-Minute Post-Send PDF Storage Purge Routine
function run30MinAuditPdfCleanup() {
  try {
    const auditsDir = path.resolve(process.cwd(), 'server', 'data', 'audits');
    if (!fs.existsSync(auditsDir)) return;
    const now = Date.now();
    const maxAgeMs = 30 * 60 * 1000; // 30 minutes
    const files = fs.readdirSync(auditsDir);
    let purgedCount = 0;
    for (const file of files) {
      if (file.endsWith('.pdf')) {
        const filePath = path.join(auditsDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            purgedCount++;
          }
        } catch (_) {}
      }
    }
    if (purgedCount > 0) {
      console.log(`[Storage Cleanup] 🗑️ Purged ${purgedCount} sent audit PDF(s) older than 30 minutes.`);
    }
  } catch (err: any) {
    console.warn('[Storage Cleanup] 30-minute PDF cleanup notice:', err?.message);
  }
}


// Serve static client bundle in deployment
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { dotfiles: 'deny', index: false }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Global 404 handler for unmatched API routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  const status = typeof err.status === 'number' ? err.status : (typeof err.statusCode === 'number' ? err.statusCode : 500);
  res.status(status).json({ success: false, error: err.message || 'Internal server error', details: err.message });
});

// Start Server & Check Infrastructure
async function startServer() {
  console.log('--- Initializing Cloud Consultancy Omni-Channel Engine ---');

  // Start internal mock daemons for TD (:5055) and Ollama (:11434) if external services are not running
  startDevMockDaemons();

  // Test PostgreSQL Connection & Auto-Run Schema Migrations
  const dbConnected = await testConnection();
  if (dbConnected) {
    try {
      const { runMigrations } = await import('./db/migrate');
      await runMigrations();
    } catch (migErr) {
      console.error('[Startup Migration Error]', migErr);
    }
  } else {
    console.warn('[PostgreSQL Warning] Database connection failed. Verify PostgreSQL is running and DATABASE_URL is correct.');
  }

  // Check Local Ollama Daemon
  const ollamaStatus = await ollamaService.checkHealth();
  if (ollamaStatus.online) {
    console.log(`[Ollama] Local Ollama is online with models: ${ollamaStatus.models.join(', ') || 'none'}`);
  } else {
    console.log(`[Ollama] Local Ollama is offline (${ollamaStatus.error}). Fallback generation active.`);
  }

  // Run 28-day retention cleanup on startup and schedule daily check
  await run28DayRetentionCleanup();
  const retentionTimer = setInterval(run28DayRetentionCleanup, 24 * 60 * 60 * 1000);

  // Run 30-minute PDF disk storage purge on startup and every 10 minutes
  run30MinAuditPdfCleanup();
  const pdfCleanupTimer = setInterval(run30MinAuditPdfCleanup, 10 * 60 * 1000);

  // 1. Email Channel: Automated Gmail IMAP polling for inbound replies (every 30s)
  emailInboundService.startPolling(30000);

  // 2. WhatsApp Channel: Auto-restore persistent WhatsApp session from PostgreSQL
  try {
    const { whatsappSessionService } = await import('./services/whatsappSessionService');
    await whatsappSessionService.autoRestoreSession();
  } catch (err) {
    console.warn('[WhatsApp Warning] Failed to auto-restore WhatsApp session:', err);
  }

  // 3. 5-Slot Staggered Sender: Deterministic Grid Scheduler (every 10s tick) - Unified Outbound Scheduler
  try {
    fiveSlotSenderService.startScheduler(10000);
  } catch (err) {
    console.warn('[5-Slot Sender Warning] Failed to start 5-slot scheduler:', err);
  }

  // 4. Scheduled Dispatches & Stale Recovery Scheduler (runs recovery on boot + every 20s dispatch tick)
  try {
    emailSchedulerService.startScheduler(20000);
  } catch (err) {
    console.warn('[Email Scheduler Warning] Failed to start scheduled dispatch scheduler:', err);
  }

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`🚀 Express Backend running on http://localhost:${env.PORT}`);
    console.log(`📡 API Endpoints available at http://localhost:${env.PORT}/api`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server FATAL] Port ${env.PORT} is already in use. Exiting.`);
    } else {
      console.error('[Server FATAL] HTTP server error:', err);
    }
    process.exit(1);
  });

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal?: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Server] Gracefully shutting down (${signal || 'signal'})...`);

    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    clearInterval(retentionTimer);
    clearInterval(pdfCleanupTimer);

    emailSchedulerService.stopScheduler();
    fiveSlotSenderService.stopScheduler();
    emailInboundService.stopPolling();
    stopDevMockDaemons();

    await new Promise<void>((resolve) => {
      const forceTimeout = setTimeout(resolve, 3000);
      server.close(() => {
        clearTimeout(forceTimeout);
        resolve();
      });
      if (typeof (server as any).closeIdleConnections === 'function') {
        (server as any).closeIdleConnections();
      }
    });

    try {
      await pool.end();
    } catch (err) {
      console.warn('[Server] Error closing PostgreSQL pool:', err);
    }

    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
