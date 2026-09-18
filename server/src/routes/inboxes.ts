import { Router, type Request, type Response } from 'express';
import { inboxRotationService } from '../services/inboxRotationService';

export const inboxesRouter = Router();

// GET /api/inboxes - List all connected inboxes
inboxesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const inboxes = await inboxRotationService.getAllInboxes();
    const summary = await inboxRotationService.getPoolSummary();
    res.json({
      success: true,
      count: inboxes.length,
      inboxes,
      summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch inboxes';
    console.error('[inboxesRouter.get]', err);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/inboxes/summary - Get rotation pool summary metrics
inboxesRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await inboxRotationService.getPoolSummary();
    res.json({ success: true, summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch summary';
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/inboxes/test-connection - Test SMTP credentials without saving
inboxesRouter.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, provider } = req.body;
    if (!smtp_host || !smtp_user || !smtp_pass) {
      return res.status(400).json({ success: false, error: 'Host, user, and password are required' });
    }

    const test = await inboxRotationService.testConnection({
      smtp_host,
      smtp_port: parseInt(smtp_port, 10) || 587,
      smtp_secure: Boolean(smtp_secure),
      smtp_user,
      smtp_pass,
      provider,
    });

    res.json(test);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Connection test failed';
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/inboxes - Connect a new inbox
inboxesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      sender_name,
      provider = 'smtp',
      smtp_host,
      smtp_port = 587,
      smtp_secure = false,
      smtp_user,
      smtp_pass,
      daily_limit = 40,
    } = req.body;

    if (!email || !smtp_host || !smtp_user || !smtp_pass) {
      return res.status(400).json({
        success: false,
        error: 'Email, host, user, and password are required',
      });
    }

    const result = await inboxRotationService.addInbox({
      name: name || `Inbox (${email})`,
      email,
      sender_name: sender_name || 'Outreach',
      provider,
      smtp_host,
      smtp_port: parseInt(String(smtp_port), 10) || 587,
      smtp_secure: Boolean(smtp_secure),
      smtp_user,
      smtp_pass,
      daily_limit: parseInt(String(daily_limit), 10) || 40,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, inbox: result.inbox });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to connect inbox';
    console.error('[inboxesRouter.post]', err);
    res.status(500).json({ success: false, error: msg });
  }
});

// PUT /api/inboxes/:id - Update inbox settings (name, daily limit, status)
inboxesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, sender_name, daily_limit, status, smtp_pass } = req.body;

    const updated = await inboxRotationService.updateInbox(id, {
      name,
      sender_name,
      daily_limit: daily_limit !== undefined ? parseInt(String(daily_limit), 10) : undefined,
      status,
      smtp_pass,
    });

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Inbox not found' });
    }

    res.json({ success: true, inbox: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update inbox';
    res.status(500).json({ success: false, error: msg });
  }
});

// DELETE /api/inboxes/:id - Remove an inbox from rotation
inboxesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await inboxRotationService.deleteInbox(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Inbox not found' });
    }
    res.json({ success: true, message: 'Inbox removed from rotation pool' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete inbox';
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/inboxes/:id/test-send - Send a verification test email
inboxesRouter.post('/:id/test-send', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { to } = req.body;

    if (!to || !to.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid destination email required' });
    }

    const inbox = await inboxRotationService.getInboxById(id);
    if (!inbox) {
      return res.status(404).json({ success: false, error: 'Inbox not found' });
    }

    const { emailAdapter } = await import('../adapters/emailAdapter');
    const result = await emailAdapter.sendEmail({
      to,
      subject: `[Test] Multi-Inbox Rotation Verified: ${inbox.name}`,
      body: `Hello! This is a test email verifying that your connected inbox "${inbox.name}" (${inbox.email}) is active and healthy in your multi-inbox rotation pool.`,
      inboxId: inbox.id,
    });

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Test send failed';
    res.status(500).json({ success: false, error: msg });
  }
});
