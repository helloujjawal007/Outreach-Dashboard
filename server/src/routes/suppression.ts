import { Router, Request, Response } from 'express';
import { suppressionService } from '../services/suppressionService';

export const suppressionRouter = Router();

// GET /api/suppression - List suppressed records and aggregate statistics
suppressionRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const reason = typeof req.query.reason === 'string' ? req.query.reason : undefined;
    const limit = parseInt(String(req.query.limit || '50'), 10);
    const offset = parseInt(String(req.query.offset || '0'), 10);

    const [listData, stats] = await Promise.all([
      suppressionService.getSuppressedList({ search, reason, limit, offset }),
      suppressionService.getSuppressionStats(),
    ]);

    res.json({
      success: true,
      records: listData.records,
      total: listData.total,
      stats,
    });
  } catch (err: any) {
    console.error('[API /api/suppression GET Error]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch suppression list' });
  }
});

// GET /api/suppression/check - Check if a single email or phone is suppressed
suppressionRouter.get('/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = typeof req.query.email === 'string' ? req.query.email : undefined;
    const phone = typeof req.query.phone === 'string' ? req.query.phone : undefined;
    const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;

    const result = await suppressionService.isSuppressed({ email, phone, domain });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to check suppression' });
  }
});

// POST /api/suppression - Manually add to suppression list
suppressionRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phone, domain, reason } = req.body;
    if (!email && !phone && !domain) {
      res.status(400).json({ success: false, error: 'At least one of email, phone, or domain is required' });
      return;
    }

    const result = await suppressionService.suppress({
      email,
      phone,
      domain,
      reason: reason || 'manual_entry',
      source: 'manual_user',
    });

    res.status(201).json({
      success: true,
      message: result.added ? 'Successfully added to global suppression list' : 'Target already suppressed',
      recordId: result.recordId,
    });
  } catch (err: any) {
    console.error('[API /api/suppression POST Error]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to add to suppression list' });
  }
});

// DELETE /api/suppression/:id - Remove record from suppression list
suppressionRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const deleted = await suppressionService.unsuppress(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Suppression record not found' });
      return;
    }
    res.json({ success: true, message: 'Removed from suppression list' });
  } catch (err: any) {
    console.error('[API /api/suppression DELETE Error]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to remove suppression record' });
  }
});
