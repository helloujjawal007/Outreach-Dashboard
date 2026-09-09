import { Router, type Request, type Response } from 'express';
import { emailSchedulerService } from '../services/emailSchedulerService';

export const schedulerRouter = Router();

// POST /api/scheduler/preview - Generate live sample humanized email
schedulerRouter.post('/preview', async (req: Request, res: Response) => {
  try {
    const { listId, leadId, style, stage, customInstructions } = req.body;
    const result = await emailSchedulerService.previewHumanizedEmail({
      listId,
      leadId,
      style,
      stage,
      customInstructions,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[schedulerRouter.preview]', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate preview',
    });
  }
});

// POST /api/scheduler/schedule-list - Shoot now or schedule dispatch for a list
schedulerRouter.post('/schedule-list', async (req: Request, res: Response) => {
  try {
    const { listId, scheduledFor, style, stage, customInstructions } = req.body;

    if (!listId) {
      return res.status(400).json({ success: false, error: 'listId is required' });
    }

    const result = await emailSchedulerService.scheduleListDispatch({
      listId,
      scheduledFor,
      style,
      stage,
      customInstructions,
    });

    res.json(result);
  } catch (error) {
    console.error('[schedulerRouter.scheduleList]', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule list dispatch',
    });
  }
});

// GET /api/scheduler/dispatches - Fetch recent scheduled dispatches
schedulerRouter.get('/dispatches', async (req: Request, res: Response) => {
  try {
    const { status, listId, limit } = req.query;
    const dispatches = await emailSchedulerService.getDispatches({
      status: typeof status === 'string' ? status : undefined,
      listId: typeof listId === 'string' ? listId : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({ success: true, dispatches });
  } catch (error) {
    console.error('[schedulerRouter.getDispatches]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch scheduled dispatches' });
  }
});

// POST /api/scheduler/dispatches/:id/cancel - Cancel pending dispatch
schedulerRouter.post('/dispatches/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = await emailSchedulerService.cancelDispatch(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Dispatch not found or already processed' });
    }
    res.json({ success: true, message: 'Dispatch cancelled successfully' });
  } catch (error) {
    console.error('[schedulerRouter.cancel]', error);
    res.status(500).json({ success: false, error: 'Failed to cancel dispatch' });
  }
});

// POST /api/scheduler/dispatches/:id/retry - Retry failed or cancelled dispatch
schedulerRouter.post('/dispatches/:id/retry', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = await emailSchedulerService.retryDispatch(id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Dispatch not eligible for retry' });
    }
    res.json({ success: true, message: 'Dispatch requeued for sending' });
  } catch (error) {
    console.error('[schedulerRouter.retry]', error);
    res.status(500).json({ success: false, error: 'Failed to retry dispatch' });
  }
});
