import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const dealsRouter = Router();

export interface DealRecord {
  id: string;
  lead_id: string | null;
  title: string;
  value: number;
  stage: 'interested' | 'audit_sent' | 'meeting_booked' | 'proposal_sent' | 'negotiation' | 'won' | 'lost';
  probability: number;
  lost_reason: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from leads
  business_name?: string;
  category?: string;
  website?: string;
  location?: string;
}

/**
 * GET /api/deals
 * List all deals with joined lead business info and summary metrics
 */
dealsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const dealsResult = await query<DealRecord>(`
      SELECT 
        d.*,
        l.business_name,
        l.category,
        l.website,
        l.location
      FROM deals d
      LEFT JOIN leads l ON l.id = d.lead_id
      ORDER BY 
        CASE 
          WHEN d.stage = 'won' THEN 7
          WHEN d.stage = 'lost' THEN 8
          ELSE 1 
        END,
        d.updated_at DESC;
    `);

    const deals = dealsResult.rows;

    // Calculate pipeline metrics
    let totalPipelineValue = 0;
    let weightedPipelineValue = 0;
    let wonValue = 0;
    let wonCount = 0;
    let lostCount = 0;
    let activeCount = 0;

    const stageCounts: Record<string, number> = {
      interested: 0,
      audit_sent: 0,
      meeting_booked: 0,
      proposal_sent: 0,
      negotiation: 0,
      won: 0,
      lost: 0,
    };

    for (const deal of deals) {
      const val = Number(deal.value) || 0;
      const prob = Number(deal.probability) || 0;
      const stage = deal.stage;

      if (stageCounts[stage] !== undefined) {
        stageCounts[stage]++;
      }

      if (stage === 'won') {
        wonValue += val;
        wonCount++;
      } else if (stage === 'lost') {
        lostCount++;
      } else {
        totalPipelineValue += val;
        weightedPipelineValue += (val * prob) / 100;
        activeCount++;
      }
    }

    const closedTotal = wonCount + lostCount;
    const winRate = closedTotal > 0 ? Math.round((wonCount / closedTotal) * 100) : 0;

    res.json({
      success: true,
      deals,
      summary: {
        totalPipelineValue,
        weightedPipelineValue: Math.round(weightedPipelineValue),
        wonValue,
        totalDeals: deals.length,
        activeDeals: activeCount,
        wonCount,
        lostCount,
        winRate,
        stageCounts,
      },
    });
  } catch (err: any) {
    console.error('[dealsRouter.get]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch deals' });
  }
});

/**
 * POST /api/deals
 * Create a new deal for a lead
 */
dealsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      leadId,
      title,
      value = 0,
      stage = 'interested',
      probability = 25,
      contactName,
      contactEmail,
      contactPhone,
      notes,
      expectedCloseDate,
    } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ success: false, error: 'Deal title is required' });
    }

    // Default contact details from lead if not explicitly provided
    let finalContactName = contactName || null;
    let finalContactEmail = contactEmail || null;
    let finalContactPhone = contactPhone || null;

    if (leadId) {
      const leadRes = await query<{ business_name: string; email: string; phone: string }>(
        `SELECT business_name, email, phone FROM leads WHERE id = $1`,
        [leadId]
      );
      if (leadRes.rows.length > 0) {
        const lead = leadRes.rows[0];
        if (!finalContactName) finalContactName = lead.business_name;
        if (!finalContactEmail) finalContactEmail = lead.email;
        if (!finalContactPhone) finalContactPhone = lead.phone;
      }
    }

    const insertRes = await query<DealRecord>(
      `INSERT INTO deals (
        lead_id, title, value, stage, probability, contact_name, contact_email, contact_phone, notes, expected_close_date, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *;`,
      [
        leadId || null,
        title.trim(),
        Number(value) || 0,
        stage,
        Number(probability) || 25,
        finalContactName,
        finalContactEmail,
        finalContactPhone,
        notes || null,
        expectedCloseDate || null,
      ]
    );

    const deal = insertRes.rows[0];

    // Log in unified activity timeline
    if (leadId) {
      await query(
        `INSERT INTO activity_logs (lead_id, deal_id, actor_type, activity_type, title, description, metadata)
         VALUES ($1, $2, 'user', 'deal_created', $3, $4, $5);`,
        [
          leadId,
          deal.id,
          `Deal created: ${deal.title}`,
          `Value: $${deal.value} | Initial Stage: ${deal.stage}`,
          JSON.stringify({ dealId: deal.id, value: deal.value, stage: deal.stage }),
        ]
      );
    }

    res.json({ success: true, deal, message: 'Deal created successfully' });
  } catch (err: any) {
    console.error('[dealsRouter.post]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to create deal' });
  }
});

/**
 * PATCH /api/deals/:id
 * Update deal stage, value, probability, notes, lost reason
 */
dealsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stage, value, probability, notes, lostReason, title, expectedCloseDate } = req.body;

    const currentDealRes = await query<DealRecord>(`SELECT * FROM deals WHERE id = $1`, [id]);
    if (currentDealRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    const currentDeal = currentDealRes.rows[0];
    const newStage = stage !== undefined ? stage : currentDeal.stage;
    const isStageChanging = stage !== undefined && stage !== currentDeal.stage;

    let closedAt = currentDeal.closed_at;
    if (newStage === 'won' || newStage === 'lost') {
      closedAt = new Date().toISOString();
    } else if (isStageChanging) {
      closedAt = null;
    }

    const updateRes = await query<DealRecord>(
      `UPDATE deals
       SET 
         title = COALESCE($1, title),
         value = COALESCE($2, value),
         stage = COALESCE($3, stage),
         probability = COALESCE($4, probability),
         notes = COALESCE($5, notes),
         lost_reason = COALESCE($6, lost_reason),
         expected_close_date = COALESCE($7, expected_close_date),
         closed_at = $8,
         updated_at = NOW()
       WHERE id = $9
       RETURNING *;`,
      [
        title !== undefined ? title : null,
        value !== undefined ? Number(value) : null,
        stage !== undefined ? stage : null,
        probability !== undefined ? Number(probability) : null,
        notes !== undefined ? notes : null,
        lostReason !== undefined ? lostReason : null,
        expectedCloseDate !== undefined ? expectedCloseDate : null,
        closedAt,
        id,
      ]
    );

    const updatedDeal = updateRes.rows[0];

    // Stage change side-effects & activity logging
    if (isStageChanging && updatedDeal.lead_id) {
      const stageDescriptions: Record<string, string> = {
        interested: 'Client expressed initial interest in services',
        audit_sent: 'Technical SEO / Website Audit pitch sent to client',
        meeting_booked: 'Discovery call or strategy meeting scheduled',
        proposal_sent: 'Formal project proposal & pricing submitted',
        negotiation: 'Contract terms and deliverables in negotiation',
        won: `Deal won! Value: $${updatedDeal.value}`,
        lost: `Deal closed lost: ${updatedDeal.lost_reason || 'No reason specified'}`,
      };

      await query(
        `INSERT INTO activity_logs (lead_id, deal_id, actor_type, activity_type, title, description, metadata)
         VALUES ($1, $2, 'user', 'stage_change', $3, $4, $5);`,
        [
          updatedDeal.lead_id,
          updatedDeal.id,
          `Deal stage changed to ${newStage.toUpperCase().replace('_', ' ')}`,
          stageDescriptions[newStage] || '',
          JSON.stringify({ previousStage: currentDeal.stage, newStage, value: updatedDeal.value }),
        ]
      );

      // Auto-convert to active Client when deal reaches 'won'
      if (newStage === 'won') {
        const clientCheck = await query(`SELECT id FROM clients WHERE original_lead_id = $1`, [updatedDeal.lead_id]);
        if (clientCheck.rows.length === 0) {
          const leadInfo = await query<{ business_name: string; email: string; phone: string }>(
            `SELECT business_name, email, phone FROM leads WHERE id = $1`,
            [updatedDeal.lead_id]
          );
          if (leadInfo.rows.length > 0) {
            const lead = leadInfo.rows[0];
            await query(
              `INSERT INTO clients (original_lead_id, client_name, email, phone, mrr, status, onboarded_at)
               VALUES ($1, $2, $3, $4, $5, 'active', NOW());`,
              [updatedDeal.lead_id, lead.business_name, lead.email, lead.phone, updatedDeal.value || 0]
            );
            console.log(`[Deals Pipeline] 🏆 Lead ${updatedDeal.lead_id} auto-converted to Client upon Deal Won!`);
          }
        }
      }
    }

    res.json({ success: true, deal: updatedDeal, message: 'Deal updated successfully' });
  } catch (err: any) {
    console.error('[dealsRouter.patch]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update deal' });
  }
});

/**
 * DELETE /api/deals/:id
 * Delete deal
 */
dealsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM deals WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Deal deleted successfully' });
  } catch (err: any) {
    console.error('[dealsRouter.delete]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete deal' });
  }
});
