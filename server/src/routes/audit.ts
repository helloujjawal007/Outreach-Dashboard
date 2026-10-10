import { Router, Request, Response } from 'express';
import { clientAuditService } from '../services/clientAuditIntelligenceService';
import { query } from '../config/db';

export const auditRouter = Router();

/**
 * POST /api/audit/run
 * Runs a live audit on a URL or on a specific lead's website
 */
auditRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const { url, leadId } = req.body;
    let targetUrl = (url || '').trim();

    if (!targetUrl && leadId) {
      const leadResult = await query('SELECT id, website, metadata, notes FROM leads WHERE id = $1', [leadId]);
      if (leadResult.rows.length > 0) {
        const lead = leadResult.rows[0];
        targetUrl = lead.website || lead.metadata?.google_profile?.website || '';
      }
    }

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'No website URL provided for audit.',
      });
    }

    const report = await clientAuditService.auditWebsite(targetUrl);
    return res.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error('Audit run error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to execute website audit.',
    });
  }
});

/**
 * POST /api/audit/pitch
 * Generates tailored audit / website proposal pitch for a lead
 */
auditRouter.post('/pitch', async (req: Request, res: Response) => {
  try {
    const { leadId, customWebsite, businessName, category, city, contactName } = req.body;

    let leadData = {
      businessName: businessName || '',
      website: customWebsite || '',
      category: category || '',
      city: city || '',
      contactName: contactName || '',
    };

    if (leadId) {
      const leadResult = await query(
        'SELECT id, business_name, website, category, city, primary_contact_name, metadata, notes FROM leads WHERE id = $1',
        [leadId]
      );
      if (leadResult.rows.length > 0) {
        const row = leadResult.rows[0];
        leadData = {
          businessName: row.business_name,
          website: customWebsite || row.website || row.metadata?.google_profile?.website || '',
          category: row.category,
          city: row.city,
          contactName: row.primary_contact_name,
        };
      }
    }

    if (!leadData.businessName) {
      return res.status(400).json({
        success: false,
        error: 'Business name is required to generate outreach pitch.',
      });
    }

    const pitch = await clientAuditService.generatePitchForLead(leadData);
    return res.json({
      success: true,
      pitch,
    });
  } catch (err) {
    console.error('Audit pitch generation error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate audit pitch.',
    });
  }
});
