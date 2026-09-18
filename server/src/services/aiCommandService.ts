import { query } from '../config/db';
import { stageOutreachService } from './stageOutreachService';
import { websiteFormService } from './websiteFormService';
import { googleEnrichmentService } from './googleEnrichmentService';
import { inboxRotationService } from './inboxRotationService';
import { ollamaService } from './ollamaService';
import { humanizerService } from './humanizerService';
import { leadScraperService } from './leadScraperService';

export interface BusinessSuggestion {
  id: string;
  category: 'urgent' | 'growth' | 'optimization' | 'system';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
  actionTitle: string;
  actionType:
    | 'shoot_all_outreach'
    | 'shoot_due_followups'
    | 'scan_website_forms'
    | 'sync_gmb_data'
    | 'target_ecom_leads'
    | 'view_inbound_replies'
    | 'run_lead_diagnostic'
    | 'scrape_lead_locations';
  actionPayload?: Record<string, unknown>;
  badgeText: string;
  badgeVariant: 'red' | 'amber' | 'emerald' | 'indigo';
}

export interface CommandExecutionResult {
  actionExecuted: string;
  success: boolean;
  summary: string;
  details?: Record<string, unknown>;
  itemsProcessed: number;
  aiAdvice?: string;
  timestamp: string;
}

export interface CommandHistoryItem {
  id: string;
  commandText: string;
  actionType: string;
  itemsProcessed: number;
  success: boolean;
  summary: string;
  aiAdvice?: string;
  details?: Record<string, unknown>;
  executionTimeMs: number;
  createdAt: string;
}

export class AiCommandService {
  /**
   * Scans current PostgreSQL database state and synthesizes live, high-ROI business suggestions
   */
  async getBusinessSuggestions(): Promise<BusinessSuggestion[]> {
    const suggestions: BusinessSuggestion[] = [];

    try {
      // 0. Check All Eligible Leads Ready for Outreach (across Email, Form, and WhatsApp)
      const allEligibleRes = await query<{ count: string }>(`
        SELECT COUNT(DISTINCT l.id)::int as count
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.consent_status != 'unsubscribed'
          AND l.consent_status != 'opted_out'
          AND l.consent_status != 'replied'
          AND (l.outreach_stage IS NULL OR l.outreach_stage != 'completed')
          AND (
            (l.email ILIKE '%@%')
            OR (l.phone IS NOT NULL AND l.phone != '')
            OR (l.whatsapp IS NOT NULL AND l.whatsapp != '')
            OR (l.website IS NOT NULL AND l.website != '')
            OR (l.metadata->'website_form'->>'hasForm' = 'true')
          )
      `);
      const allEligibleCount = Number(allEligibleRes.rows[0]?.count || 0);

      // Check Completed Leads that can be re-engaged
      const completedRes = await query<{ count: string }>(`
        SELECT COUNT(DISTINCT l.id)::int as count
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.consent_status NOT IN ('unsubscribed', 'opted_out')
          AND l.outreach_stage = 'completed'
      `);
      const completedCount = Number(completedRes.rows[0]?.count || 0);

      // 0.A: Master 1-Click Growth Autopilot (Combines forms scan, GMB sync & omni-channel outreach)
      if (allEligibleCount > 0) {
        suggestions.push({
          id: 'sugg_master_autopilot',
          category: 'urgent',
          priority: 'high',
          title: '1-Click Master Growth Autopilot',
          description: `Execute your complete pipeline in a single click: scan website forms, sync GMB ratings, and dispatch Omni-Channel outreach across ${allEligibleCount} ready prospects (Email, Website Form & WhatsApp).`,
          metric: `${allEligibleCount}`,
          metricLabel: 'Leads Ready',
          actionTitle: '⚡ 1-Click Master Autopilot',
          actionType: 'run_full_autopilot',
          badgeText: 'All-In-One',
          badgeVariant: 'amber',
        });

        suggestions.push({
          id: 'sugg_shoot_all_outreach',
          category: 'urgent',
          priority: 'high',
          title: 'Mass Outreach Ready for All Eligible Leads',
          description: `${allEligibleCount} prospects across your database are eligible for outreach touches (new initial pitches + stage-aware follow-ups) via Omni-Channel Dual-Trigger (Email + Website Form + WhatsApp).`,
          metric: `${allEligibleCount}`,
          metricLabel: 'Leads Ready',
          actionTitle: '⚡ Shoot Outreach to All Leads',
          actionType: 'shoot_all_outreach',
          badgeText: 'Mass Shoot',
          badgeVariant: 'amber',
        });
      } else if (completedCount > 0) {
        suggestions.push({
          id: 'sugg_reset_sequences',
          category: 'growth',
          priority: 'high',
          title: 'Re-engage Completed Leads (Restart Sequences)',
          description: `All ${completedCount} leads have completed their initial sequence touches. In 1 click, reset their sequence state back to Initial to launch a fresh outreach wave.`,
          metric: `${completedCount}`,
          metricLabel: 'Leads Completed',
          actionTitle: '🔄 Reset Sequences & Re-engage',
          actionType: 'reset_completed_sequences',
          badgeText: 'Re-engagement',
          badgeVariant: 'indigo',
        });
      }

      // 1. Check Overdue Follow-ups
      const followupsRes = await query<{ count: string }>(`
        SELECT COUNT(DISTINCT l.id)::int as count
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.consent_status != 'unsubscribed'
          AND l.consent_status != 'opted_out'
          AND l.consent_status != 'replied'
          AND l.outreach_stage IN ('followup_1', 'followup_2')
      `);
      const overdueFollowups = Number(followupsRes.rows[0]?.count || 0);

      if (overdueFollowups > 0) {
        suggestions.push({
          id: 'sugg_followups_due',
          category: 'urgent',
          priority: 'high',
          title: 'Overdue Follow-ups Ready to Shoot',
          description: `${overdueFollowups} prospects received initial touch and are awaiting stage-aware Follow-up 1 or 2. Follow-ups typically account for 60% of all client responses.`,
          metric: `${overdueFollowups}`,
          metricLabel: 'Leads Waiting',
          actionTitle: '⚡ Shoot All Due Follow-ups',
          actionType: 'shoot_due_followups',
          badgeText: 'Urgent Action',
          badgeVariant: 'red',
        });
      }

      // 2. Check Website Form Detection Opportunities
      const unScannedWebsitesRes = await query<{ count: string }>(`
        SELECT COUNT(*)::int as count
        FROM leads
        WHERE deleted_at IS NULL
          AND website IS NOT NULL 
          AND website != ''
          AND website NOT LIKE '%google.com/maps%'
          AND website NOT LIKE '%maps.google.com%'
          AND (metadata->'website_form') IS NULL
      `);
      const unScannedCount = Number(unScannedWebsitesRes.rows[0]?.count || 0);

      if (unScannedCount > 0) {
        suggestions.push({
          id: 'sugg_unscanned_forms',
          category: 'growth',
          priority: 'high',
          title: 'Unscanned Website Contact Forms',
          description: `${unScannedCount} corporate websites have not been scanned for contact forms yet. Detecting forms unlocks parallel Dual-Trigger outreach (Email + Website Form).`,
          metric: `${unScannedCount}`,
          metricLabel: 'Websites Ready',
          actionTitle: '🌐 Scan & Auto-Detect Forms',
          actionType: 'scan_website_forms',
          badgeText: 'Dual-Trigger Ready',
          badgeVariant: 'indigo',
        });
      }

      // 3. Check Google Business Profile (GMB) Verification
      const unverifiedGmbRes = await query<{ count: string }>(`
        SELECT COUNT(*)::int as count
        FROM leads
        WHERE deleted_at IS NULL
          AND (
            notes NOT LIKE '%Rating:%' 
            OR metadata->'google_profile' IS NULL
            OR (metadata->'google_profile'->>'userVerified') IS NULL
          )
      `);
      const unverifiedGmbCount = Number(unverifiedGmbRes.rows[0]?.count || 0);

      if (unverifiedGmbCount > 0) {
        suggestions.push({
          id: 'sugg_unverified_gmb',
          category: 'optimization',
          priority: 'medium',
          title: 'Sync Live Google Maps & GMB Ratings',
          description: `${unverifiedGmbCount} leads are missing verified star ratings, review counts, or Maps categories. Live sync gives you exact audit ammunition for cold pitches.`,
          metric: `${unverifiedGmbCount}`,
          metricLabel: 'Needs Maps Sync',
          actionTitle: '📍 Sync Google Maps Data',
          actionType: 'sync_gmb_data',
          badgeText: 'SEO Audit Ammo',
          badgeVariant: 'amber',
        });
      }

      // 4. Check E-Commerce / Shopify Prospects
      const ecomRes = await query<{ count: string }>(`
        SELECT COUNT(*)::int as count
        FROM leads
        WHERE deleted_at IS NULL
          AND (
            category ILIKE '%ecommerce%' 
            OR category ILIKE '%retail%' 
            OR category ILIKE '%shop%' 
            OR category ILIKE '%store%'
            OR category ILIKE '%apparel%'
          )
      `);
      const ecomCount = Number(ecomRes.rows[0]?.count || 0);

      if (ecomCount > 0) {
        suggestions.push({
          id: 'sugg_ecom_pitch',
          category: 'growth',
          priority: 'medium',
          title: 'High-Ticket E-Commerce Pipeline',
          description: `${ecomCount} retail/store prospects identified. Offer Shopify & BigCommerce mobile speed audits, conversion optimization, and product SEO/GEO.`,
          metric: `${ecomCount}`,
          metricLabel: 'Store Prospects',
          actionTitle: '🛒 Pitch Store Speed & GEO',
          actionType: 'target_ecom_leads',
          badgeText: 'Shopify / BigCommerce',
          badgeVariant: 'emerald',
        });
      }

      // 5. Check Inbound Unread Replies
      const inboundUnreadRes = await query<{ count: string }>(`
        SELECT COUNT(*)::int as count
        FROM messages
        WHERE direction = 'inbound' AND is_read = false
      `);
      const unreadReplies = Number(inboundUnreadRes.rows[0]?.count || 0);

      if (unreadReplies > 0) {
        suggestions.push({
          id: 'sugg_unread_replies',
          category: 'urgent',
          priority: 'high',
          title: 'Unread Inbound Prospect Replies',
          description: `You have ${unreadReplies} unread prospect responses waiting in your inbox. Responding within 15 minutes yields a 7x higher booking rate.`,
          metric: `${unreadReplies}`,
          metricLabel: 'Unread Messages',
          actionTitle: '💬 Review & Reply Now',
          actionType: 'view_inbound_replies',
          badgeText: 'Immediate Action',
          badgeVariant: 'red',
        });
      }

      // 6. Check Unlocated Leads (Lead Scraper)
      const unlocatedRes = await query<{ count: string }>(`
        SELECT COUNT(*)::int as count
        FROM leads
        WHERE deleted_at IS NULL
          AND (location IS NULL OR location = '')
      `);
      const unlocatedCount = Number(unlocatedRes.rows[0]?.count || 0);

      if (unlocatedCount > 0) {
        suggestions.push({
          id: 'sugg_scrape_locations',
          category: 'optimization',
          priority: 'medium',
          title: 'Scrape & Identify Lead Locations',
          description: `${unlocatedCount} prospect(s) have unverified locations. Automatically scrape corporate email domains, website addresses, and area codes gradually (or assign '(Not identified)').`,
          metric: `${unlocatedCount}`,
          metricLabel: 'Unlocated Leads',
          actionTitle: '📍 Scrape Lead Locations',
          actionType: 'scrape_lead_locations',
          badgeText: 'Gradual Scraper',
          badgeVariant: 'indigo',
        });
      }

      // 7. Executive Diagnostic / Capacity Health
      const inboxes = await inboxRotationService.getAllInboxes();
      const activeInboxes = inboxes.filter((i) => i.status === 'active');
      const totalSentToday = activeInboxes.reduce((sum, i) => sum + i.sent_today, 0);
      const totalDailyLimit = activeInboxes.reduce((sum, i) => sum + i.daily_limit, 0);

      suggestions.push({
        id: 'sugg_sending_capacity',
        category: 'system',
        priority: 'low',
        title: 'Daily Outbound Capacity Available',
        description: `${activeInboxes.length} warm inboxes active. Sent ${totalSentToday} / ${totalDailyLimit} emails today. Capacity is healthy for automated batch outreach.`,
        metric: `${Math.max(0, totalDailyLimit - totalSentToday)}`,
        metricLabel: 'Emails Left Today',
        actionTitle: '📊 Run Executive Diagnostic',
        actionType: 'run_lead_diagnostic',
        badgeText: 'Sending Health',
        badgeVariant: 'emerald',
      });
    } catch (err) {
      console.error('[AiCommandService.getBusinessSuggestions]', err);
    }

    return suggestions;
  }

  /**
   * Save a command execution to PostgreSQL history
   */
  async saveCommandHistory(item: {
    commandText: string;
    actionType: string;
    itemsProcessed: number;
    success: boolean;
    summary: string;
    aiAdvice?: string;
    details?: Record<string, unknown>;
    executionTimeMs: number;
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO ai_command_history 
         (command_text, action_type, items_processed, success, summary, ai_advice, details, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          item.commandText,
          item.actionType,
          item.itemsProcessed,
          item.success,
          item.summary,
          item.aiAdvice || null,
          JSON.stringify(item.details || {}),
          item.executionTimeMs,
        ]
      );
    } catch (err) {
      console.error('[AiCommandService] Failed to save command history:', err);
    }
  }

  /**
   * Fetch recent command history from PostgreSQL
   */
  async getCommandHistory(limit: number = 50): Promise<{
    lastCommand: CommandHistoryItem | null;
    history: CommandHistoryItem[];
  }> {
    try {
      const res = await query<{
        id: string;
        command_text: string;
        action_type: string;
        items_processed: number;
        success: boolean;
        summary: string;
        ai_advice: string | null;
        details: Record<string, unknown>;
        execution_time_ms: number;
        created_at: string;
      }>(
        `SELECT id, command_text, action_type, items_processed, success, summary, ai_advice, details, execution_time_ms, created_at
         FROM ai_command_history
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      const history: CommandHistoryItem[] = res.rows.map((row) => ({
        id: row.id,
        commandText: row.command_text,
        actionType: row.action_type,
        itemsProcessed: Number(row.items_processed || 0),
        success: Boolean(row.success),
        summary: row.summary,
        aiAdvice: row.ai_advice || undefined,
        details: row.details,
        executionTimeMs: Number(row.execution_time_ms || 0),
        createdAt: row.created_at,
      }));

      return {
        lastCommand: history.length > 0 ? history[0] : null,
        history,
      };
    } catch (err) {
      console.error('[AiCommandService] Failed to get command history:', err);
      return { lastCommand: null, history: [] };
    }
  }

  /**
   * Clear command history
   */
  async clearCommandHistory(): Promise<void> {
    try {
      await query(`DELETE FROM ai_command_history`);
    } catch (err) {
      console.error('[AiCommandService] Failed to clear command history:', err);
    }
  }

  /**
   * Dispatches and executes an action or natural language instruction from the chatbox
   */
  async executeCommand(params: {
    commandText: string;
    actionType?: string;
    payload?: Record<string, unknown>;
  }): Promise<CommandExecutionResult> {
    const startTime = performance.now();
    const text = (params.commandText || '').trim().toLowerCase();
    const explicitAction = params.actionType;
    const timestamp = new Date().toISOString();

    let result: CommandExecutionResult;

    // -1. ACTION: 1-Click Master Growth Autopilot (Scan forms + Sync GMB + Omni-Channel Mass Outreach)
    if (
      explicitAction === 'run_full_autopilot' ||
      text.includes('autopilot') ||
      text.includes('single click') ||
      text.includes('1-click all') ||
      text.includes('all works') ||
      text.includes('execute all') ||
      text.includes('full run') ||
      text.includes('full growth') ||
      text.includes('master autopilot') ||
      text.includes('run all')
    ) {
      // Step 1: Scan any unscanned websites for forms (fast concurrency with 4s timeout)
      let formsFound = 0;
      let websitesScanned = 0;
      try {
        const unscannedRes = await query<{ id: string; business_name: string; website: string }>(`
          SELECT id, business_name, website
          FROM leads
          WHERE deleted_at IS NULL
            AND website IS NOT NULL 
            AND website != ''
            AND website NOT LIKE '%google.com/maps%'
            AND website NOT LIKE '%maps.google.com%'
            AND (metadata->'website_form') IS NULL
          LIMIT 10
        `);
        if (unscannedRes.rows.length > 0) {
          websitesScanned = unscannedRes.rows.length;
          const scanPromises = unscannedRes.rows.map(async (l) => {
            return Promise.race([
              websiteFormService.detectAndSaveFormForLead(l.id),
              new Promise<null>((r) => setTimeout(() => r(null), 4000)),
            ]);
          });
          const settledScans = await Promise.allSettled(scanPromises);
          formsFound = settledScans.filter((s: any) => s.value?.detection?.hasForm).length;
        }
      } catch (fErr) {
        console.warn('[AiCommandService] Autopilot website form scan warning:', fErr);
      }

      // Step 2: Sync missing GMB ratings (up to 5 leads with fast fallback)
      let gmbSynced = 0;
      try {
        const gmbRes = await query<{ id: string }>(`
          SELECT id FROM leads
          WHERE deleted_at IS NULL
            AND (notes NOT LIKE '%Rating:%' OR metadata->'google_profile' IS NULL OR (metadata->'google_profile'->>'userVerified') IS NULL)
          LIMIT 5
        `);
        for (const gl of gmbRes.rows) {
          try {
            await Promise.race([
              googleEnrichmentService.syncFromGoogleMaps(gl.id),
              new Promise((r) => setTimeout(r, 4000)),
            ]);
            gmbSynced++;
          } catch {}
        }
      } catch (gErr) {
        console.warn('[AiCommandService] Autopilot GMB sync warning:', gErr);
      }

      // Step 3: Dispatch Omni-Channel Outreach across ALL eligible leads
      const eligibleLeads = await query<{ id: string }>(`
        SELECT l.id
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.consent_status != 'unsubscribed'
          AND l.consent_status != 'opted_out'
          AND l.consent_status != 'replied'
          AND (l.outreach_stage IS NULL OR l.outreach_stage != 'completed')
          AND (
            (l.email ILIKE '%@%')
            OR (l.phone IS NOT NULL AND l.phone != '')
            OR (l.whatsapp IS NOT NULL AND l.whatsapp != '')
            OR (l.website IS NOT NULL AND l.website != '')
            OR (l.metadata->'website_form'->>'hasForm' = 'true')
          )
        ORDER BY l.created_at DESC
      `);

      const leadIds = eligibleLeads.rows.map((r) => r.id);
      const bulkRes = await stageOutreachService.sendBulkNextStage(leadIds);

      result = {
        actionExecuted: 'run_full_autopilot',
        success: true,
        summary: `🚀 1-Click Master Growth Autopilot executed! Contacted ${bulkRes.sentCount} lead(s) across all active channels (${bulkRes.channelsSummary.emailsSent} Emails, ${bulkRes.channelsSummary.formsSubmitted} Website Forms, ${bulkRes.channelsSummary.whatsappDispatched} WhatsApp touches). Scanned ${websitesScanned} website(s) (${formsFound} forms detected) and verified ${gmbSynced} Google Maps profile(s).`,
        itemsProcessed: bulkRes.sentCount,
        details: {
          totalEligible: leadIds.length,
          emailsSent: bulkRes.channelsSummary.emailsSent,
          formsSubmitted: bulkRes.channelsSummary.formsSubmitted,
          whatsappDispatched: bulkRes.channelsSummary.whatsappDispatched,
          websitesScanned,
          formsFound,
          gmbSynced,
          initialSent: bulkRes.breakdown.initial,
          followup1Sent: bulkRes.breakdown.followup_1,
          followup2Sent: bulkRes.breakdown.followup_2,
          skipped: bulkRes.skippedCount,
          dispatchedLeads: bulkRes.results.slice(0, 50),
        },
        timestamp,
      };
    }

    // 0. ACTION: Shoot Outreach to ALL Eligible Leads (Omni-Channel Multi-Trigger)
    else if (
      explicitAction === 'shoot_all_outreach' ||
      text.includes('shoot to all') ||
      text.includes('shoot all') ||
      text.includes('send to all') ||
      text.includes('send all') ||
      text.includes('msg to all') ||
      text.includes('message to all') ||
      text.includes('email to all') ||
      text.includes('all msg') ||
      text.includes('all message') ||
      text.includes('shoot msg') ||
      text.includes('shoot message') ||
      text.includes('outreach to all') ||
      text.includes('mass shoot') ||
      text.includes('blast all') ||
      (text.includes('all') && (text.includes('msg') || text.includes('message') || text.includes('lead') || text.includes('shoot') || text.includes('send') || text.includes('email')))
    ) {
      // Find ALL eligible leads in entire database across Email, Form, and WhatsApp
      const allLeadsRes = await query<{
        id: string;
        business_name: string;
        email: string;
        phone: string;
        outreach_stage: string;
      }>(`
        SELECT l.id, l.business_name, l.email, l.phone, l.outreach_stage
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.consent_status != 'unsubscribed'
          AND l.consent_status != 'opted_out'
          AND l.consent_status != 'replied'
          AND (l.outreach_stage IS NULL OR l.outreach_stage != 'completed')
          AND (
            (l.email ILIKE '%@%')
            OR (l.phone IS NOT NULL AND l.phone != '')
            OR (l.whatsapp IS NOT NULL AND l.whatsapp != '')
            OR (l.website IS NOT NULL AND l.website != '')
            OR (l.metadata->'website_form'->>'hasForm' = 'true')
          )
        ORDER BY l.created_at DESC
      `);

      if (allLeadsRes.rows.length === 0) {
        result = {
          actionExecuted: 'shoot_all_outreach',
          success: true,
          summary: 'All leads in your CRM have either completed their sequences, are suppressed, or are already up to date. No pending outreach touches needed.',
          itemsProcessed: 0,
          timestamp,
        };
      } else {
        const leadIds = allLeadsRes.rows.map((r) => r.id);
        const bulkRes = await stageOutreachService.sendBulkNextStage(leadIds);

        result = {
          actionExecuted: 'shoot_all_outreach',
          success: true,
          summary: `Successfully executed 1-Click Omni-Channel Outreach to ${bulkRes.sentCount} eligible lead(s) (${bulkRes.breakdown.initial} Initial, ${bulkRes.breakdown.followup_1} Follow-up 1, ${bulkRes.breakdown.followup_2} Follow-up 2). Dispatched ${bulkRes.channelsSummary.emailsSent} email(s) via Gmail SMTP, submitted to ${bulkRes.channelsSummary.formsSubmitted} website form(s), and processed ${bulkRes.channelsSummary.whatsappDispatched} WhatsApp touch(es).${bulkRes.skippedCount > 0 ? ` (${bulkRes.skippedCount} completed/skipped)` : ''}`,
          itemsProcessed: bulkRes.sentCount,
          details: {
            totalEligible: allLeadsRes.rows.length,
            initialSent: bulkRes.breakdown.initial,
            followup1Sent: bulkRes.breakdown.followup_1,
            followup2Sent: bulkRes.breakdown.followup_2,
            websiteFormsSubmitted: bulkRes.channelsSummary.formsSubmitted,
            emailsSent: bulkRes.channelsSummary.emailsSent,
            whatsappDispatched: bulkRes.channelsSummary.whatsappDispatched,
            skipped: bulkRes.skippedCount,
            dispatchedLeads: bulkRes.results.slice(0, 50),
          },
          timestamp,
        };
      }
    }

    // 1. ACTION: Shoot Due Follow-ups (Stage Outreach Dual-Trigger)
    else if (
      explicitAction === 'shoot_due_followups' ||
      text.includes('shoot follow') ||
      text.includes('send follow') ||
      text.includes('due follow') ||
      text.includes('follow-up') ||
      text.includes('follow up')
    ) {
      const eligibleLeadsRes = await query<{ id: string; business_name: string; email: string }>(`
        SELECT l.id, l.business_name, l.email
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.consent_status != 'unsubscribed'
          AND l.consent_status != 'opted_out'
          AND l.consent_status != 'replied'
          AND l.outreach_stage IN ('followup_1', 'followup_2')
      `);

      if (eligibleLeadsRes.rows.length === 0) {
        result = {
          actionExecuted: 'shoot_due_followups',
          success: true,
          summary: 'All follow-up sequences are currently up to date. No overdue follow-up 1 or 2 stages found.',
          itemsProcessed: 0,
          timestamp,
        };
      } else {
        const leadIds = eligibleLeadsRes.rows.map((r) => r.id);
        const bulkRes = await stageOutreachService.sendBulkNextStage(leadIds);

        result = {
          actionExecuted: 'shoot_due_followups',
          success: true,
          summary: `Successfully dispatched stage-aware follow-ups to ALL ${bulkRes.sentCount} lead(s) (${bulkRes.channelsSummary.emailsSent} Emails, ${bulkRes.channelsSummary.formsSubmitted} Website Forms, ${bulkRes.channelsSummary.whatsappDispatched} WhatsApp touches).`,
          itemsProcessed: bulkRes.sentCount,
          details: {
            totalEligible: eligibleLeadsRes.rows.length,
            emailsSent: bulkRes.channelsSummary.emailsSent,
            formsSubmitted: bulkRes.channelsSummary.formsSubmitted,
            whatsappDispatched: bulkRes.channelsSummary.whatsappDispatched,
            dispatchedLeads: bulkRes.results,
          },
          timestamp,
        };
      }
    }

    // 1.B ACTION: Reset Completed Sequences for Re-engagement
    else if (
      explicitAction === 'reset_completed_sequences' ||
      text.includes('reset sequence') ||
      text.includes('restart sequence') ||
      text.includes('re-engage completed') ||
      text.includes('reset leads')
    ) {
      const resetRes = await query<{ id: string }>(`
        UPDATE leads
        SET outreach_stage = 'initial',
            updated_at = NOW()
        WHERE deleted_at IS NULL
          AND consent_status NOT IN ('unsubscribed', 'opted_out')
          AND outreach_stage = 'completed'
        RETURNING id
      `);

      result = {
        actionExecuted: 'reset_completed_sequences',
        success: true,
        summary: `Successfully reset outreach sequences for ${resetRes.rows.length} lead(s) back to Initial stage. They are now eligible for fresh 1-Click outreach across Email, Contact Form, and WhatsApp!`,
        itemsProcessed: resetRes.rows.length,
        timestamp,
      };
    }

    // 2. ACTION: Scan Website Contact Forms
    else if (
      explicitAction === 'scan_website_forms' ||
      text.includes('scan form') ||
      text.includes('detect form') ||
      text.includes('website form') ||
      text.includes('crawl form')
    ) {
      const unscannedRes = await query<{ id: string; business_name: string; website: string }>(`
        SELECT id, business_name, website
        FROM leads
        WHERE deleted_at IS NULL
          AND website IS NOT NULL 
          AND website != ''
          AND website NOT LIKE '%google.com/maps%'
          AND website NOT LIKE '%maps.google.com%'
          AND (metadata->'website_form') IS NULL
      `);

      if (unscannedRes.rows.length === 0) {
        result = {
          actionExecuted: 'scan_website_forms',
          success: true,
          summary: 'All corporate websites have already been crawled and contact forms recorded in PostgreSQL.',
          itemsProcessed: 0,
          timestamp,
        };
      } else {
        const scanPromises = unscannedRes.rows.map(async (lead) => {
          try {
            const scan = await Promise.race([
              websiteFormService.detectAndSaveFormForLead(lead.id),
              new Promise<any>((r) => setTimeout(() => r(null), 5000)),
            ]);
            return {
              businessName: lead.business_name,
              website: lead.website,
              hasForm: scan?.detection?.hasForm ?? false,
              formUrl: scan?.detection?.formUrl,
            };
          } catch {
            return {
              businessName: lead.business_name,
              website: lead.website,
              hasForm: false,
            };
          }
        });

        const scanResults = await Promise.all(scanPromises);
        const detected = scanResults.filter((r) => r.hasForm).length;

        result = {
          actionExecuted: 'scan_website_forms',
          success: true,
          summary: `Scanned ${scanResults.length} business website(s) in parallel. Found and recorded ${detected} ready contact form(s) for Dual-Trigger outreach.`,
          itemsProcessed: scanResults.length,
          details: { scans: scanResults },
          timestamp,
        };
      }
    }

    // 3. ACTION: Sync GMB Google Maps Data
    else if (
      explicitAction === 'sync_gmb_data' ||
      text.includes('sync maps') ||
      text.includes('sync gmb') ||
      text.includes('google maps') ||
      text.includes('rating') ||
      text.includes('reviews')
    ) {
      const gmbLeads = await query<{ id: string; business_name: string }>(`
        SELECT id, business_name
        FROM leads
        WHERE deleted_at IS NULL
          AND (
            notes NOT LIKE '%Rating:%' 
            OR metadata->'google_profile' IS NULL
            OR (metadata->'google_profile'->>'userVerified') IS NULL
          )
        LIMIT 10
      `);

      if (gmbLeads.rows.length === 0) {
        result = {
          actionExecuted: 'sync_gmb_data',
          success: true,
          summary: 'All leads in your CRM currently have verified Google Maps data and ratings.',
          itemsProcessed: 0,
          timestamp,
        };
      } else {
        const syncPromises = gmbLeads.rows.map(async (lead) => {
          try {
            const synced = await Promise.race([
              googleEnrichmentService.syncFromGoogleMaps(lead.id),
              new Promise<any>((r) => setTimeout(() => r(null), 4000)),
            ]);
            if (synced) {
              return {
                businessName: lead.business_name,
                rating: synced.metadata?.google_profile?.rating,
                reviewsCount: synced.metadata?.google_profile?.reviewsCount,
                address: synced.metadata?.google_profile?.address,
              };
            }
          } catch (err) {
            console.error(`[AiCommandService] GMB sync error for ${lead.id}:`, err);
          }
          return null;
        });

        const syncResultsRaw = await Promise.all(syncPromises);
        const syncResults = syncResultsRaw.filter(Boolean);

        result = {
          actionExecuted: 'sync_gmb_data',
          success: true,
          summary: `Synchronized ${syncResults.length} Google Business Profile(s) directly from Google Maps in parallel. Star ratings and review counts saved.`,
          itemsProcessed: syncResults.length,
          details: { syncs: syncResults },
          timestamp,
        };
      }
    }

    // 4. ACTION: E-Commerce / Shopify Prospect Targeting
    else if (
      explicitAction === 'target_ecom_leads' ||
      text.includes('shopify') ||
      text.includes('bigcommerce') ||
      text.includes('ecom') ||
      text.includes('store speed')
    ) {
      const ecomLeads = await query<{ id: string; business_name: string; category: string }>(`
        SELECT id, business_name, category
        FROM leads
        WHERE deleted_at IS NULL
          AND (
            category ILIKE '%ecommerce%' 
            OR category ILIKE '%retail%' 
            OR category ILIKE '%shop%' 
            OR category ILIKE '%store%'
          )
        LIMIT 10
      `);

      const drafts = [];
      for (const lead of ecomLeads.rows) {
        const emailDraft = await humanizerService.generateEmail({
          id: lead.id,
          business_name: lead.business_name,
          category: lead.category,
        }, { stage: 'initial' });
        drafts.push({
          businessName: lead.business_name,
          subject: emailDraft.subject,
          snippet: emailDraft.body.slice(0, 180) + '...',
        });
      }

      result = {
        actionExecuted: 'target_ecom_leads',
        success: true,
        summary: `Identified ${ecomLeads.rows.length} high-potential E-Commerce / Retail prospect(s). Generated tailored pitches offering Shopify/BigCommerce store speed, mobile optimization, and product SEO/GEO.`,
        itemsProcessed: ecomLeads.rows.length,
        details: { drafts },
        timestamp,
      };
    }

    // 5. ACTION: Executive Diagnostic / What should I do now?
    else if (
      explicitAction === 'run_lead_diagnostic' ||
      text.includes('diagnostic') ||
      text.includes('what should i do') ||
      text.includes('suggestion') ||
      text.includes('status') ||
      text.includes('overview')
    ) {
      const totalLeads = await query<{ count: string }>(`SELECT COUNT(*)::int as count FROM leads WHERE deleted_at IS NULL`);
      const addedLeads = await query<{ count: string }>(`SELECT COUNT(DISTINCT lead_id)::int as count FROM lead_list_memberships`);
      const completedSequences = await query<{ count: string }>(`SELECT COUNT(*)::int as count FROM leads WHERE outreach_stage = 'completed' AND deleted_at IS NULL`);
      const inboxes = await inboxRotationService.getAllInboxes();

      const activeInboxes = inboxes.filter((i) => i.status === 'active');
      const totalDailyQuota = activeInboxes.reduce((sum, i) => sum + i.daily_limit, 0);
      const totalSentToday = activeInboxes.reduce((sum, i) => sum + i.sent_today, 0);

      const advice = `
Here is your Executive Growth Blueprint right now:
1. Pipeline Status: ${totalLeads.rows[0].count} total leads in database (${addedLeads.rows[0].count} assigned to lists).
2. Outbound Capacity: ${activeInboxes.length} warm inboxes ready. Sent ${totalSentToday}/${totalDailyQuota} emails today.
3. Top Recommendations:
   • Click 'Shoot Outreach to All Leads' to launch mass outreach across all ready prospects.
   • Click 'Shoot All Due Follow-ups' to re-engage active leads.
   • Click 'Scan & Auto-Detect Forms' to equip leads with Dual-Trigger website contact form submission.
   • Reach out to local clinics and Shopify stores with quick 2-minute video audits of their GMB Maps ranking and mobile page speed.
      `.trim();

      result = {
        actionExecuted: 'run_lead_diagnostic',
        success: true,
        summary: 'Executive pipeline diagnostic completed successfully.',
        itemsProcessed: Number(totalLeads.rows[0].count),
        aiAdvice: advice,
        details: {
          totalLeads: Number(totalLeads.rows[0].count),
          addedLeads: Number(addedLeads.rows[0].count),
          completedSequences: Number(completedSequences.rows[0].count),
          inboxesCount: activeInboxes.length,
          sentToday: totalSentToday,
          dailyLimit: totalDailyQuota,
        },
        timestamp,
      };
    }

    // 6. ACTION: Scrape Lead Locations (Gradual Lead Scraper)
    else if (
      explicitAction === 'scrape_lead_locations' ||
      text.includes('scrape location') ||
      text.includes('find location') ||
      text.includes('identify location') ||
      text.includes('lead scrapper') ||
      text.includes('lead scraper') ||
      (text.includes('location') && (text.includes('scrape') || text.includes('find') || text.includes('check') || text.includes('update') || text.includes('where')))
    ) {
      const startResult = await leadScraperService.startGradualLocationScrape({
        overwriteIdentified: false,
        delayMs: 1200,
      });

      result = {
        actionExecuted: 'scrape_lead_locations',
        success: true,
        summary: `Lead Scraper initiated: Running gradual location scraper in background for ${startResult.total} lead(s). Inspecting email domains, website addresses, and area codes. Leads not found will be set to '(Not identified)'.`,
        itemsProcessed: startResult.total,
        details: {
          totalQueued: startResult.total,
          status: leadScraperService.getStatus(),
        },
        timestamp,
      };
    }

    // 7. Conversational / Custom Query using Ollama
    else {
      try {
        const prompt = `
You are the AI Executive Copilot for Online Digital Solution, a premier digital growth agency.
The agency founder provides:
- Google Business Profile (GMB) Optimization & Top 3 Google Maps Rankings
- Modern Website Development & Redesigns (built on ultra-fast modern frameworks)
- SEO, GEO (Generative Engine Optimization) & AEO (Google AI Overviews, ChatGPT, Perplexity)
- E-Commerce Store Development (Shopify & BigCommerce store speed, optimization, and SEO)
- Business Workflow Automations & Done-For-You Cold Outbound Lead Systems

The user asked: "${params.commandText}"

Instructions:
1. Answer clearly, crisply, and consultatively under 120 words.
2. Recommend concrete next actions they can take in this platform (e.g. shooting follow-ups, scanning website contact forms, or syncing GMB data).
3. Sound sharp, encouraging, professional, and actionable.
        `.trim();

        const aiRes = await ollamaService.generateCompletion({
          prompt,
          system: 'You are an executive digital agency growth advisor. You give sharp, practical, high-ROI business advice.',
          temperature: 0.7,
        });

        result = {
          actionExecuted: 'general_consultation',
          success: true,
          summary: aiRes.response || 'Here are practical next steps for your agency outreach.',
          itemsProcessed: 1,
          aiAdvice: aiRes.response,
          timestamp,
        };
      } catch {
        result = {
          actionExecuted: 'general_consultation',
          success: true,
          summary: `To generate maximum leads right now, trigger your pending follow-ups with the dual-trigger button, auto-detect website forms for your unscanned leads, and offer a 2-minute GMB audit or Shopify speed check to your prospects.`,
          itemsProcessed: 1,
          timestamp,
        };
      }
    }

    // Save executed command to persistent database history
    const executionTimeMs = Math.round(performance.now() - startTime);
    await this.saveCommandHistory({
      commandText: params.commandText || params.actionType || result.actionExecuted,
      actionType: result.actionExecuted,
      itemsProcessed: result.itemsProcessed,
      success: result.success,
      summary: result.summary,
      aiAdvice: result.aiAdvice,
      details: result.details,
      executionTimeMs,
    });

    return result;
  }
}

export const aiCommandService = new AiCommandService();
