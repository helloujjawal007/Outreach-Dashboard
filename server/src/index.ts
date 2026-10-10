import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { testConnection, query } from './config/db';
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
import { linkedinRouter } from './routes/linkedin';
import { autopilotRouter } from './routes/autopilot';
import { scraperRouter } from './routes/scraper';
import { emailInboundService } from './services/emailInboundService';
import { emailSchedulerService } from './services/emailSchedulerService';
import { autonomousDripEngine } from './services/autonomousDripEngine';
import { addExtremeAutomation } from './db/add_extreme_automation';
import { addAutomatedCadenceAndChannelLists } from './db/add_automated_cadence_and_channel_lists';
import { addInboundEmailSyncTable } from './db/add_inbound_email_sync';
import { addScheduledDispatchesTable } from './db/add_scheduled_dispatches';
import { addMultiChannelScheduling } from './db/add_multichannel_scheduling';
import { addSeenRepliedToMessages } from './db/add_seen_replied_to_messages';
import { addInboxRotationAndTrigramIndexes } from './db/add_inbox_rotation_and_trigram_indexes';
import { addLinkedInTables } from './db/add_linkedin_tables';
import { addLinkedInPublishingColumns } from './db/add_linkedin_publishing_columns';
import { addAiCommandHistoryTable } from './db/add_ai_command_history';
import { addManualReviewStatus } from './db/add_manual_review_status';
import { migrateLocationAndCleanWebsites } from './db/add_location_and_clean_websites';
import { googleEnrichmentService } from './services/googleEnrichmentService';
import { linkedinService } from './services/linkedinService';
// Prevent unhandled errors or socket drops from crashing the Express API server
process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException Handled]', err?.message || err);
});

// Inside startServer() in server/src/index.ts:

// Example A: Simple Interval (e.g., Every 10 minutes)
setInterval(async () => {
  try {
    console.log('[Custom Cron] Running 10-minute task...');
    // Add your code or database queries here
  } catch (err) {
    console.error('[Custom Cron Error]', err);
  }
}, 13 * 60 * 1000);


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

  // Block source code, build configs, system scripts, and credentials
  const forbiddenPatterns = [
    '/server',
    '/src',
    '/node_modules',
    'package.json',
    'package-lock.json',
    'tsconfig',
    'dockerfile',
    'render.yaml',
    'vite.config',
    'tailwind.config',
    'render-build',
    '.env',
    '.git',
    '.ts',
    '.tsx',
    '.sh',
    '.log',
  ];

  for (const pattern of forbiddenPatterns) {
    if (lower.includes(pattern)) {
      return res.status(403).json({ success: false, error: 'Access forbidden: restricted resource' });
    }
  }

  next();
});

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

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
    service: 'Online Digital Solution API',
    version: '2.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
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
app.use('/api/linkedin', linkedinRouter);
app.use('/api/autopilot', autopilotRouter);
app.use('/api/scraper', scraperRouter);

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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
});

// Start Server & Check Infrastructure
async function startServer() {
  console.log('--- Initializing Online Digital Solution Omni-Channel Engine ---');

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
  setInterval(run28DayRetentionCleanup, 24 * 60 * 60 * 1000);

  // Initialize inbound email sync table & automated Gmail IMAP polling (every 30s)
  try {
    await addInboundEmailSyncTable();
  } catch (err) {
    console.error('[Migration Warning] Inbound email sync table error:', err);
  }
  emailInboundService.startPolling(30000);

  // Initialize scheduled dispatches table & multi-channel scheduling
  try {
    await addScheduledDispatchesTable();
    await addMultiChannelScheduling();
  } catch (err) {
    console.error('[Migration Warning] Scheduled dispatches table error:', err);
  }
  emailSchedulerService.startScheduler(20000);

  // Initialize seen & replied message tracking
  try {
    await addSeenRepliedToMessages();
  } catch (err) {
    console.error('[Migration Warning] Seen/replied messages migration error:', err);
  }

  // Initialize multi-inbox rotation & trigram indexing
  try {
    await addInboxRotationAndTrigramIndexes();
  } catch (err) {
    console.error('[Migration Warning] Inbox rotation table error:', err);
  }

  // Initialize LinkedIn tables & default account
  try {
    await addLinkedInTables();
    await addLinkedInPublishingColumns();
    linkedinService.startScheduler(30000);
  } catch (err) {
    console.error('[Migration Warning] LinkedIn tables error:', err);
  }

  // Initialize AI Command History table
  try {
    await addAiCommandHistoryTable();
  } catch (err) {
    console.error('[Migration Warning] AI Command History table error:', err);
  }

  // Initialize Manual Review Status & Columns
  try {
    await addManualReviewStatus();
  } catch (err) {
    console.error('[Migration Warning] Manual review migration error:', err);
  }

  try {
    await migrateLocationAndCleanWebsites();
  } catch (err) {
    console.error('[Migration Warning] Location and website clean migration error:', err);
  }

  // Check and auto-restore saved WhatsApp session if credentials exist
  try {
    const { whatsappSessionService } = await import('./services/whatsappSessionService');
    await whatsappSessionService.autoRestoreSession();
  } catch (err) {
    console.error('[WhatsApp Warning] Failed to auto-restore WhatsApp session:', err);
  }

  // Initialize 12-hour automated Google Business Profile (GMB) sync engine
  try {
    googleEnrichmentService.start12HourGmbSync();
  } catch (err) {
    console.error('[GMB Sync Warning] Failed to initialize 12-hour GMB sync engine:', err);
  }

  // Initialize Extreme Automation & Autopilot Infrastructure
  try {
    await addExtremeAutomation();
    await addAutomatedCadenceAndChannelLists();
    autonomousDripEngine.startScheduler(30000);
  } catch (err) {
    console.error('[Autopilot Warning] Failed to initialize Extreme Automation & Cadence:', err);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Express Backend running on http://localhost:${env.PORT}`);
    console.log(`📡 API Endpoints available at http://localhost:${env.PORT}/api`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Server] Gracefully shutting down...');
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
