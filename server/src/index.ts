import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { testConnection } from './config/db';
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
import { emailInboundService } from './services/emailInboundService';
import { addInboundEmailSyncTable } from './db/add_inbound_email_sync';
import { query } from './config/db';

const app = express();

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
    service: 'AI Client Follow-Up & Lead Outreach System API',
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


// Global 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handling middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
});

// Start Server & Check Infrastructure
async function startServer() {
  console.log('--- Initializing AI Client Follow-Up & Lead Outreach System ---');
  
  // Test PostgreSQL Connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('[PostgreSQL Warning] Database connection failed. Verify PostgreSQL is running.');
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

  app.listen(env.PORT, () => {
    console.log(`🚀 Express Backend running on http://localhost:${env.PORT}`);
    console.log(`📡 API Endpoints available at http://localhost:${env.PORT}/api`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
