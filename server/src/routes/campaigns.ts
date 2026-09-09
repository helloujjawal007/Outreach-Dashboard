import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const campaignsRouter = Router();

// GET /api/campaigns
campaignsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const campaignsRes = await query(`SELECT * FROM campaigns ORDER BY created_at DESC`);
    const stepsRes = await query(`SELECT * FROM campaign_steps ORDER BY campaign_id, step_order ASC`);

    const stepsByCampaign = new Map<string, unknown[]>();
    for (const step of stepsRes.rows) {
      const list = stepsByCampaign.get(step.campaign_id) || [];
      list.push({
        id: step.id,
        name: step.name,
        channel: step.channel,
        delayDays: step.delay_days,
        body: step.body,
        stepOrder: step.step_order,
      });
      stepsByCampaign.set(step.campaign_id, list);
    }

    const campaigns = campaignsRes.rows.map((camp) => ({
      id: camp.id,
      name: camp.name,
      targetCategory: camp.target_category,
      targetChannel: camp.target_channel,
      status: camp.status,
      createdAt: camp.created_at,
      steps: stepsByCampaign.get(camp.id) || [],
    }));

    res.json({ success: true, count: campaigns.length, campaigns });
  } catch (error) {
    console.error('[campaignsRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
  }
});

// POST /api/campaigns
campaignsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, targetCategory, targetChannel, steps } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Campaign name is required' });
    }

    const campRes = await query<{ id: string }>(
      `INSERT INTO campaigns (name, target_category, target_channel, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [name.trim(), targetCategory || 'all', targetChannel || 'all']
    );

    const campaignId = campRes.rows[0].id;
    const insertedSteps: unknown[] = [];

    if (Array.isArray(steps) && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const stepRes = await query(
          `INSERT INTO campaign_steps (campaign_id, step_order, name, channel, delay_days, body)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [campaignId, i + 1, s.name || `Step ${i + 1}`, s.channel || 'email', s.delayDays ?? 0, s.body || '']
        );
        insertedSteps.push(stepRes.rows[0]);
      }
    }

    res.status(201).json({
      success: true,
      campaign: {
        ...campRes.rows[0],
        steps: insertedSteps,
      },
    });
  } catch (error) {
    console.error('[campaignsRouter.post]', error);
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
});
