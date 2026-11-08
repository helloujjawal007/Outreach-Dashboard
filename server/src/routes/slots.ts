import { Router, Request, Response } from 'express';
import { fiveSlotSenderService } from '../services/fiveSlotSenderService';

export const slotsRouter = Router();

/**
 * GET /api/slots/status
 * Returns current status of all 5 slots A-E, next send times, queued leads, assigned mailboxes
 */
slotsRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await fiveSlotSenderService.getSlotsStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    console.error('[slotsRouter.status] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch slots status' });
  }
});

/**
 * POST /api/slots/settings
 * Update slot cycle duration, offset, or TD webhook credentials
 */
slotsRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const updated = await fiveSlotSenderService.updateSettings(req.body);
    const safeSettings = {
      ...updated,
      td_shared_secret: undefined as any,
      td_shared_secret_masked: updated.td_shared_secret ? '••••••••' : '',
    };
    res.json({ success: true, settings: safeSettings });
  } catch (err: any) {
    console.error('[slotsRouter.settings] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update slots settings' });
  }
});

/**
 * POST /api/slots/trigger-tick
 * Manually fire a global scheduler tick for testing / verification
 */
slotsRouter.post('/trigger-tick', async (_req: Request, res: Response) => {
  try {
    const result = await fiveSlotSenderService.processGlobalTick();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[slotsRouter.trigger-tick] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to trigger slot tick' });
  }
});

/**
 * POST /api/slots/reset-circuit-breaker
 * Resets the circuit breaker and resumes slot sender
 */
slotsRouter.post('/reset-circuit-breaker', async (_req: Request, res: Response) => {
  try {
    fiveSlotSenderService.resetCircuitBreaker();
    await fiveSlotSenderService.updateSettings({ is_active: true });
    res.json({ success: true, message: 'Circuit breaker reset. 5-slot sender resumed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to reset circuit breaker' });
  }
});

/**
 * POST /api/slots/assign-lead
 * Assign a lead to a sticky round-robin slot and trigger audit
 */
slotsRouter.post('/assign-lead', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required' });
    }
    const slotId = await fiveSlotSenderService.assignLeadToSlot(leadId);
    res.json({ success: true, leadId, slotId });
  } catch (err: any) {
    console.error('[slotsRouter.assign-lead] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to assign slot' });
  }
});

/**
 * POST /api/slots/test-td-connection
 * Tests connectivity and secret verification with Technical Dashboard (TD)
 */
slotsRouter.post('/test-td-connection', async (req: Request, res: Response) => {
  try {
    const { url, secret } = req.body || {};
    const result = await fiveSlotSenderService.testTdConnection(url, secret);
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    console.error('[slotsRouter.test-td-connection] Error:', err);
    res.status(500).json({ success: false, ok: false, message: err?.message || 'TD probe failure' });
  }
});

