import { Router, Request, Response } from 'express';
import { failureLogService } from '../services/failureLogService';

export const failuresRouter = Router();

/**
 * GET /api/failures
 * List failure log entries with filtering & pagination
 */
failuresRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { type, slotId, resolved, startDate, endDate, search, limit, offset } = req.query;

    const result = await failureLogService.getFailures({
      type: type as string,
      slotId: slotId as string,
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      startDate: startDate as string,
      endDate: endDate as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[failuresRouter.get] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch failure logs' });
  }
});

/**
 * POST /api/failures/:id/resolve
 * Mark failure log entry resolved
 */
failuresRouter.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const success = await failureLogService.resolveFailure(id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Failure record not found' });
    }
    res.json({ success: true, message: 'Failure record resolved' });
  } catch (err: any) {
    console.error('[failuresRouter.resolve] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to resolve failure' });
  }
});

/**
 * POST /api/failures/:id/retry
 * Reset lead to active queue and re-trigger audit / slot dispatch
 */
failuresRouter.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await failureLogService.retryFailure(id);
    res.json(result);
  } catch (err: any) {
    console.error('[failuresRouter.retry] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to retry failure item' });
  }
});

/**
 * GET /api/failures/export
 * Download CSV export of failure logs
 */
failuresRouter.get('/export', async (req: Request, res: Response) => {
  try {
    const { type, slotId, resolved, startDate, endDate, search } = req.query;

    const csvData = await failureLogService.exportCsv({
      type: type as string,
      slotId: slotId as string,
      resolved: resolved !== undefined ? resolved === 'true' : undefined,
      startDate: startDate as string,
      endDate: endDate as string,
      search: search as string,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="outreach_failures_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvData);
  } catch (err: any) {
    console.error('[failuresRouter.export] Error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to export failure logs CSV' });
  }
});

