import { Router, type Request, type Response } from 'express';
import { autonomousDripEngine } from '../services/autonomousDripEngine';
import { autonomousLeadEnricher } from '../services/autonomousLeadEnricher';
import { query } from '../config/db';

export const autopilotRouter = Router();

// GET /api/autopilot/status - Retrieve full real-time status of 24/7 Autopilot, Drip Engine, Inbound Agent & Enricher
autopilotRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await autonomousDripEngine.getFullStatus();
    res.json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error('[autopilotRouter.status]', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve autopilot status', details: error?.message });
  }
});

// POST /api/autopilot/toggle - 1-Click Toggle for 24/7 Autopilot Drip Outreach
autopilotRouter.post('/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled, target = 'drip_engine' } = req.body;

    if (target === 'drip_engine') {
      const current = await autonomousDripEngine.getSettings();
      const newEnabled = typeof enabled === 'boolean' ? enabled : !current.enabled;
      const updated = await autonomousDripEngine.updateSettings({ enabled: newEnabled });

      console.log(`[Autopilot] Drip Engine ${newEnabled ? 'ACTIVATED' : 'PAUSED'} by user.`);
      return res.json({
        success: true,
        target: 'drip_engine',
        enabled: updated.enabled,
        message: updated.enabled
          ? 'Autonomous 24/7 Drip Engine is now ACTIVE.'
          : 'Autonomous 24/7 Drip Engine has been PAUSED.',
      });
    }

    if (target === 'inbound_agent') {
      const currentRes = await query<{ value: any }>(
        `SELECT value FROM autopilot_settings WHERE key = 'inbound_agent'`
      );
      const current = currentRes.rows[0]?.value || { enabled: true };
      const newEnabled = typeof enabled === 'boolean' ? enabled : !current.enabled;
      const updated = { ...current, enabled: newEnabled };
      await query(
        `UPDATE autopilot_settings SET value = $1, updated_at = NOW() WHERE key = 'inbound_agent'`,
        [JSON.stringify(updated)]
      );

      return res.json({
        success: true,
        target: 'inbound_agent',
        enabled: newEnabled,
        message: newEnabled
          ? 'Autonomous Inbound Agent is now ACTIVE.'
          : 'Autonomous Inbound Agent has been PAUSED.',
      });
    }

    res.status(400).json({ success: false, error: 'Invalid target specified' });
  } catch (error: any) {
    console.error('[autopilotRouter.toggle]', error);
    res.status(500).json({ success: false, error: 'Failed to toggle autopilot' });
  }
});

// POST /api/autopilot/settings - Update Autopilot operational parameters
autopilotRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const { dripSettings, inboundSettings } = req.body;

    if (dripSettings && typeof dripSettings === 'object') {
      await autonomousDripEngine.updateSettings(dripSettings);
    }

    if (inboundSettings && typeof inboundSettings === 'object') {
      const currentRes = await query<{ value: any }>(
        `SELECT value FROM autopilot_settings WHERE key = 'inbound_agent'`
      );
      const current = currentRes.rows[0]?.value || {};
      const updated = { ...current, ...inboundSettings };
      await query(
        `UPDATE autopilot_settings SET value = $1, updated_at = NOW() WHERE key = 'inbound_agent'`,
        [JSON.stringify(updated)]
      );
    }

    const fullStatus = await autonomousDripEngine.getFullStatus();
    res.json({
      success: true,
      message: 'Autopilot settings updated successfully',
      status: fullStatus,
    });
  } catch (error: any) {
    console.error('[autopilotRouter.settings]', error);
    res.status(500).json({ success: false, error: 'Failed to update autopilot settings' });
  }
});

// POST /api/autopilot/trigger-cycle - 1-Click trigger an immediate drip cycle
autopilotRouter.post('/trigger-cycle', async (_req: Request, res: Response) => {
  try {
    console.log('[autopilotRouter] Manual trigger requested for Drip Cycle...');
    const result = await autonomousDripEngine.runDripCycle();
    const fullStatus = await autonomousDripEngine.getFullStatus();

    res.json({
      success: true,
      message: `Cycle executed: ${result.dispatchedCount} leads dispatched, ${result.skippedCount} skipped.`,
      dispatchedCount: result.dispatchedCount,
      skippedCount: result.skippedCount,
      results: result.results,
      status: fullStatus,
    });
  } catch (error: any) {
    console.error('[autopilotRouter.triggerCycle]', error);
    res.status(500).json({ success: false, error: 'Failed to trigger drip cycle', details: error?.message });
  }
});

// POST /api/autopilot/enrich-now - 1-Click trigger autonomous email and contact discovery
autopilotRouter.post('/enrich-now', async (req: Request, res: Response) => {
  try {
    const limit = req.body.limit ? parseInt(String(req.body.limit), 10) : 30;
    console.log(`[autopilotRouter] Manual trigger requested for Lead Enrichment (limit: ${limit})...`);
    const result = await autonomousLeadEnricher.runEnrichmentCycle(limit);

    res.json({
      success: true,
      message: `Enrichment completed: ${result.emailsDiscoveredCount} emails discovered, ${result.locationsResolvedCount} locations resolved, ${result.socialsDiscoveredCount} socials found.`,
      result,
    });
  } catch (error: any) {
    console.error('[autopilotRouter.enrichNow]', error);
    res.status(500).json({ success: false, error: 'Failed to run enrichment cycle', details: error?.message });
  }
});
