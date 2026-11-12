import { Router, type Request, type Response } from 'express';
import { emailSchedulerService } from '../services/emailSchedulerService';
import { formatDuration, logPipeline, logPipelineError } from '../utils/pipelineLogger';

export const schedulerRouter = Router();

// POST /api/scheduler/preview - Generate live sample humanized message
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

// POST /api/scheduler/schedule-single - Schedule outreach for 1 lead on Email or WhatsApp
schedulerRouter.post('/schedule-single', async (req: Request, res: Response) => {
  try {
    const { leadId, channel = 'email', scheduledFor, subject, body, style, stage, customInstructions } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required' });
    }

    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel. Must be email or whatsapp.' });
    }

    if (scheduledFor && isNaN(new Date(scheduledFor).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format for scheduledFor' });
    }

    const result = await emailSchedulerService.scheduleSingleDispatch({
      leadId,
      channel,
      scheduledFor,
      subject,
      body,
      style,
      stage,
      customInstructions,
    });

    res.json(result);
  } catch (error) {
    console.error('[schedulerRouter.scheduleSingle]', error);
    logPipelineError('Schedule Single', 'Failed to schedule single dispatch', error);
    const msg = error instanceof Error ? error.message : 'Failed to schedule dispatch';
    const isClientError = msg.includes('Invalid date') || msg.includes('Outreach blocked') || msg.includes('not found');
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: msg,
    });
  }
});

// POST /api/scheduler/schedule-batch - Schedule outreach for multiple leads with anti-ban pacing
schedulerRouter.post('/schedule-batch', async (req: Request, res: Response) => {
  try {
    const {
      leadIds,
      channel = 'email',
      inboxIds,
      scheduledFor,
      intervalSeconds,
      style,
      stage,
      customInstructions,
    } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds array is required' });
    }

    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel. Must be email or whatsapp.' });
    }

    const result = await emailSchedulerService.scheduleBatchDispatch({
      leadIds,
      channel,
      inboxIds,
      scheduledFor,
      intervalSeconds: intervalSeconds ? Number(intervalSeconds) : undefined,
      style,
      stage,
      customInstructions,
    });

    res.json(result);
  } catch (error) {
    console.error('[schedulerRouter.scheduleBatch]', error);
    logPipelineError('Schedule Batch', 'Failed to schedule batch dispatches', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule batch dispatches',
    });
  }
});

// POST /api/scheduler/schedule-list - Shoot now or schedule dispatch for a list on any channel
schedulerRouter.post('/schedule-list', async (req: Request, res: Response) => {
  try {
    const {
      listId,
      channel = 'email',
      inboxIds,
      scheduledFor,
      intervalSeconds,
      style,
      stage,
      customInstructions,
    } = req.body;

    if (!listId) {
      return res.status(400).json({ success: false, error: 'listId is required' });
    }

    if (channel === 'email') {
      // Unified scheduling: route directly to the 5-Slot Sender Panel (replacing older list assignments)
      const { fiveSlotSenderService } = await import('../services/fiveSlotSenderService');
      const assignRes = await fiveSlotSenderService.autoAssignUnassignedLeads({
        listId: listId !== 'all' && listId !== 'all-leads' ? listId : undefined,
        rebalanceAll: false,
        replaceExisting: true,
      });

      const slotSummary = Object.entries(assignRes.distribution)
        .map(([slot, count]) => `${slot}:${count}`)
        .join(' ');
      logPipeline(
        'SCHEDULED_EMAIL',
        `List "${listId === 'all' ? 'All Leads' : listId}" scheduled via 5-Slot Sender: ${assignRes.assignedCount} newly assigned (${slotSummary})`
      );

      if (scheduledFor === 'now') {
        logPipeline('EMAIL_COUNTDOWN', 'Immediate dispatch requested — triggering 5-Slot Sender tick now.');
        fiveSlotSenderService.processGlobalTick(undefined, undefined, { forceSend: true }).catch((err) => {
          console.warn('[schedulerRouter.scheduleList] Instant tick error:', err?.message);
          logPipelineError('Scheduler Tick', 'Instant tick failed', err);
        });
      } else {
        const settings = await fiveSlotSenderService.getSettings();
        const grid = fiveSlotSenderService.computeGridState(new Date(), settings);
        const earliestNextSec = Math.min(...Object.values(grid.slotTimes).map((s) => s.nextSec));
        const waitSec = Math.max(0, earliestNextSec - grid.nowSec);
        logPipeline(
          'EMAIL_COUNTDOWN',
          `Email will start in ${formatDuration(waitSec)} (cycle: ${settings.slot_cycle_min}m, offset: ${settings.slot_offset_min}m)`
        );
      }

      return res.json({
        success: true,
        scheduledCount: assignRes.assignedCount,
        listName: listId === 'all' ? 'All Leads' : listId,
        channel: 'email',
        scheduledFor: scheduledFor === 'now' ? new Date() : new Date(scheduledFor),
        message: `Successfully allocated ${assignRes.assignedCount} leads across the 5-Slot Sender (Slots A-E).`,
        distribution: assignRes.distribution,
      });
    }

    const result = await emailSchedulerService.scheduleListDispatch({
      listId,
      channel,
      inboxIds,
      scheduledFor,
      intervalSeconds: intervalSeconds ? Number(intervalSeconds) : undefined,
      style,
      stage,
      customInstructions,
    });

    res.json(result);
  } catch (error) {
    console.error('[schedulerRouter.scheduleList]', error);
    logPipelineError('Schedule List', 'Failed to schedule list dispatch', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to schedule list dispatch',
    });
  }
});

// GET /api/scheduler/dispatches - Fetch recent scheduled dispatches with optional filters
schedulerRouter.get('/dispatches', async (req: Request, res: Response) => {
  try {
    const { status, channel, listId, limit } = req.query;
    const dispatches = await emailSchedulerService.getDispatches({
      status: typeof status === 'string' ? status : undefined,
      channel: typeof channel === 'string' ? channel : undefined,
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

// DELETE /api/scheduler/dispatches/failed - Bulk delete all failed scheduled dispatches
schedulerRouter.delete('/dispatches/failed', async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
    const deletedCount = await emailSchedulerService.deleteFailedDispatches(ids);
    res.json({ success: true, count: deletedCount, message: `Deleted ${deletedCount} failed dispatches` });
  } catch (error) {
    console.error('[schedulerRouter.deleteFailed]', error);
    res.status(500).json({ success: false, error: 'Failed to delete failed dispatches' });
  }
});

// POST /api/scheduler/dispatches/bulk-delete - Bulk delete dispatches by IDs
schedulerRouter.post('/dispatches/bulk-delete', async (req: Request, res: Response) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'IDs array required' });
    }
    const deletedCount = await emailSchedulerService.deleteDispatches(ids);
    res.json({ success: true, count: deletedCount, message: `Deleted ${deletedCount} dispatches` });
  } catch (error) {
    console.error('[schedulerRouter.bulkDelete]', error);
    res.status(500).json({ success: false, error: 'Failed to delete dispatches' });
  }
});

// DELETE /api/scheduler/dispatches/:id - Delete single dispatch
schedulerRouter.delete('/dispatches/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deletedCount = await emailSchedulerService.deleteDispatches([id]);
    if (deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Dispatch not found' });
    }
    res.json({ success: true, message: 'Dispatch deleted successfully' });
  } catch (error) {
    console.error('[schedulerRouter.deleteSingle]', error);
    res.status(500).json({ success: false, error: 'Failed to delete dispatch' });
  }
});
