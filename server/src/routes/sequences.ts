import { Router, Request, Response } from 'express';
import { sequenceEnrollmentService } from '../services/sequenceEnrollmentService';

export const sequencesRouter = Router();

// GET /api/sequences/enrollments/:leadId - Fetch sequence history for a lead
sequencesRouter.get('/enrollments/:leadId', async (req: Request, res: Response): Promise<void> => {
  try {
    const leadId = String(Array.isArray(req.params.leadId) ? req.params.leadId[0] : req.params.leadId);
    const enrollments = await sequenceEnrollmentService.getLeadEnrollments(leadId);
    res.json({ success: true, enrollments });
  } catch (err: any) {
    console.error('[API /api/sequences/enrollments/:leadId Error]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch sequence enrollments' });
  }
});

// POST /api/sequences/enroll - Enroll a lead
sequencesRouter.post('/enroll', async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId, sequenceName, totalSteps } = req.body;
    if (!leadId) {
      res.status(400).json({ success: false, error: 'leadId is required' });
      return;
    }

    const enrollment = await sequenceEnrollmentService.enrollLead(
      leadId,
      sequenceName || 'Cold Outreach 4-Step',
      totalSteps || 4
    );

    res.status(201).json({ success: true, enrollment });
  } catch (err: any) {
    console.error('[API /api/sequences/enroll Error]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to enroll lead' });
  }
});

// POST /api/sequences/delay-ooo - Postpone sequence for Out-of-Office
sequencesRouter.post('/delay-ooo', async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadId, delayDays } = req.body;
    if (!leadId) {
      res.status(400).json({ success: false, error: 'leadId is required' });
      return;
    }

    await sequenceEnrollmentService.delayForOoo(leadId, delayDays || 7);
    res.json({ success: true, message: `Sequence postponed by ${delayDays || 7} days for Out-of-Office` });
  } catch (err: any) {
    console.error('[API /api/sequences/delay-ooo Error]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to delay sequence' });
  }
});
