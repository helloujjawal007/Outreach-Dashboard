import { query } from '../config/db';
import { emailAdapter } from '../adapters/emailAdapter';
import { humanizerService, type HumanizerOptions } from './humanizerService';

export interface ScheduleListParams {
  listId: string;
  scheduledFor?: string | Date; // If 'now' or undefined, shoots immediately
  style?: 'conversational' | 'direct' | 'curious';
  stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
  customInstructions?: string;
}

export interface ScheduledDispatchRecord {
  id: string;
  list_id?: string;
  list_name: string;
  entity_type: 'lead' | 'client';
  lead_id?: string;
  client_id?: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  stage: string;
  style: string;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string;
  sent_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export class EmailSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Helper sleep for anti-spam pacing jitter (2-3.5 seconds)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Enqueues an entire list of contacts for automated shoot or scheduled dispatch
   */
  async scheduleListDispatch(params: ScheduleListParams): Promise<{
    success: boolean;
    scheduledCount: number;
    listName: string;
    scheduledFor: Date;
    message: string;
  }> {
    const { listId, style = 'conversational', stage = 'auto', customInstructions } = params;

    // 1. Fetch list metadata
    const listRes = await query<{ id: string; name: string }>(
      `SELECT id, name FROM lists WHERE id = $1`,
      [listId]
    );

    if (listRes.rows.length === 0) {
      throw new Error(`List with ID "${listId}" not found`);
    }

    const list = listRes.rows[0];

    // 2. Fetch all leads associated with this list that have valid emails
    const leadsRes = await query<{
      id: string;
      business_name: string;
      primary_contact_name: string;
      email: string;
      category: string;
      notes: string;
      outreach_stage: string;
    }>(
      `SELECT l.id,
              l.business_name,
              COALESCE(l.metadata->>'primary_contact_name', l.metadata->>'contact_name', '') AS primary_contact_name,
              l.email,
              l.category,
              l.notes,
              l.outreach_stage
       FROM lead_list_memberships m
       JOIN leads l ON l.id = m.lead_id
       WHERE m.list_id = $1
         AND l.deleted_at IS NULL
         AND l.email IS NOT NULL
         AND TRIM(l.email) != ''
       ORDER BY l.created_at ASC`,
      [listId]
    );

    if (leadsRes.rows.length === 0) {
      return {
        success: false,
        scheduledCount: 0,
        listName: list.name,
        scheduledFor: new Date(),
        message: `No active leads with valid email addresses were found in "${list.name}".`,
      };
    }

    // Determine target schedule time
    let targetTime = new Date();
    if (params.scheduledFor && params.scheduledFor !== 'now') {
      const parsed = new Date(params.scheduledFor);
      if (!isNaN(parsed.getTime())) {
        targetTime = parsed;
      }
    }

    console.log(
      `[EmailScheduler] Generating humanized emails for ${leadsRes.rows.length} leads in "${list.name}" (Scheduled for: ${targetTime.toISOString()})...`
    );

    let insertedCount = 0;

    for (const lead of leadsRes.rows) {
      try {
        // Auto-write personalized, humanized email for this lead
        const generated = await humanizerService.generateEmail(
          {
            id: lead.id,
            business_name: lead.business_name,
            primary_contact_name: lead.primary_contact_name,
            category: lead.category,
            notes: lead.notes,
            entity_type: 'lead',
          },
          {
            stage: stage === 'auto' ? undefined : stage,
            style,
            customInstructions,
          }
        );

        const recipientName = (lead.primary_contact_name || lead.business_name || '').trim();

        await query(
          `INSERT INTO scheduled_dispatches (
            list_id, list_name, entity_type, lead_id, recipient_email, recipient_name,
            subject, body, stage, style, status, scheduled_for, created_at, updated_at
          ) VALUES ($1, $2, 'lead', $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10, NOW(), NOW())`,
          [
            list.id,
            list.name,
            lead.id,
            lead.email.trim(),
            recipientName,
            generated.subject,
            generated.body,
            generated.stage,
            style,
            targetTime,
          ]
        );

        insertedCount++;
      } catch (genErr) {
        console.error(`[EmailScheduler] Error generating email for lead ${lead.id}:`, genErr);
      }
    }

    console.log(
      `[EmailScheduler] Successfully scheduled ${insertedCount} personalized emails for list "${list.name}".`
    );

    // If target time is in the past or now, immediately trigger a cycle
    if (targetTime.getTime() <= Date.now() + 5000) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
    }

    return {
      success: true,
      scheduledCount: insertedCount,
      listName: list.name,
      scheduledFor: targetTime,
      message: `Successfully scheduled ${insertedCount} humanized email(s) for "${list.name}".`,
    };
  }

  /**
   * Generates a sample humanized email preview for a contact or list
   */
  async previewHumanizedEmail(params: {
    listId?: string;
    leadId?: string;
    style?: 'conversational' | 'direct' | 'curious';
    stage?: 'auto' | 'initial' | 'followup_1' | 'followup_2' | 'client_checkin';
    customInstructions?: string;
  }) {
    let sampleContact: {
      id: string;
      business_name: string;
      primary_contact_name?: string;
      category?: string;
      notes?: string;
      email?: string;
      entity_type?: 'lead' | 'client';
    } | null = null;

    if (params.leadId) {
      const res = await query(
        `SELECT id, business_name, COALESCE(metadata->>'primary_contact_name', metadata->>'contact_name', '') AS primary_contact_name, email, category, notes FROM leads WHERE id = $1`,
        [params.leadId]
      );
      if (res.rows.length > 0) {
        sampleContact = { ...res.rows[0], entity_type: 'lead' };
      }
    } else if (params.listId) {
      const res = await query(
        `SELECT l.id, l.business_name, COALESCE(l.metadata->>'primary_contact_name', l.metadata->>'contact_name', '') AS primary_contact_name, l.email, l.category, l.notes
         FROM lead_list_memberships m
         JOIN leads l ON l.id = m.lead_id
         WHERE m.list_id = $1 AND l.deleted_at IS NULL AND l.email IS NOT NULL AND TRIM(l.email) != ''
         LIMIT 1`,
        [params.listId]
      );
      if (res.rows.length > 0) {
        sampleContact = { ...res.rows[0], entity_type: 'lead' };
      }
    }

    // Default fallback sample if no lead exists
    if (!sampleContact) {
      sampleContact = {
        id: 'sample-001',
        business_name: 'Apex Heating & Air Conditioning LLC',
        primary_contact_name: 'Marcus Vance',
        category: 'HVAC & Plumbing',
        notes: 'Requested digital audit for local emergency calls',
        email: 'marcus@apexheating.com',
        entity_type: 'lead',
      };
    }

    const generated = await humanizerService.generateEmail(sampleContact, {
      style: params.style || 'conversational',
      stage: params.stage === 'auto' ? undefined : params.stage,
      customInstructions: params.customInstructions,
    });

    return {
      sampleContact,
      preview: generated,
    };
  }

  /**
   * Background processor: dispatches emails due for delivery with anti-burst pacing
   */
  async processPendingDispatches(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Find dispatches that are due
      const pendingRes = await query<ScheduledDispatchRecord>(
        `SELECT * FROM scheduled_dispatches
         WHERE status = 'scheduled' AND scheduled_for <= NOW()
         ORDER BY scheduled_for ASC
         LIMIT 15`
      );

      if (pendingRes.rows.length === 0) {
        return;
      }

      console.log(`[EmailScheduler] Processing ${pendingRes.rows.length} due email dispatches...`);

      for (const dispatch of pendingRes.rows) {
        // Mark as processing
        await query(`UPDATE scheduled_dispatches SET status = 'processing', updated_at = NOW() WHERE id = $1`, [
          dispatch.id,
        ]);

        // Anti-spam jitter: Google SMTP algorithms penalize machine bursts.
        // Wait 2000ms - 3200ms between sends to simulate natural human transmission.
        const jitterMs = 2000 + Math.floor(Math.random() * 1200);
        await this.sleep(jitterMs);

        try {
          const sendRes = await emailAdapter.sendEmail({
            to: dispatch.recipient_email,
            subject: dispatch.subject,
            body: dispatch.body,
            leadId: dispatch.lead_id || undefined,
            clientId: dispatch.client_id || undefined,
          });

          if (sendRes.throttled) {
            console.warn(`[EmailScheduler] Daily sending capacity reached. Pausing remaining dispatches: ${sendRes.reason}`);
            // Return item to scheduled status for next window
            await query(
              `UPDATE scheduled_dispatches
               SET status = 'scheduled',
                   scheduled_for = NOW() + INTERVAL '4 hours',
                   updated_at = NOW()
               WHERE id = $1`,
              [dispatch.id]
            );
            // Break loop to honor Google SMTP limits
            break;
          }

          if (sendRes.success) {
            await query(
              `UPDATE scheduled_dispatches
               SET status = 'sent', sent_at = NOW(), error_message = NULL, updated_at = NOW()
               WHERE id = $1`,
              [dispatch.id]
            );

            // Advance lead outreach stage
            if (dispatch.lead_id) {
              const nextStage =
                dispatch.stage === 'initial'
                  ? 'followup_1'
                  : dispatch.stage === 'followup_1'
                  ? 'followup_2'
                  : 'completed';

              await query(
                `UPDATE leads
                 SET last_contacted_at = NOW(),
                     outreach_stage = $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [nextStage, dispatch.lead_id]
              );
            }

            console.log(
              `[EmailScheduler] Dispatched email to ${dispatch.recipient_email} (${sendRes.liveDelivery})`
            );
          } else {
            await query(
              `UPDATE scheduled_dispatches
               SET status = 'failed', error_message = $1, updated_at = NOW()
               WHERE id = $2`,
              [sendRes.reason || 'Send failed', dispatch.id]
            );
          }
        } catch (dispatchErr: unknown) {
          const errStr = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
          console.error(`[EmailScheduler] Failed sending to ${dispatch.recipient_email}:`, errStr);
          await query(
            `UPDATE scheduled_dispatches
             SET status = 'failed', error_message = $1, updated_at = NOW()
             WHERE id = $2`,
            [errStr, dispatch.id]
          );
        }
      }
    } catch (loopErr) {
      console.error('[EmailScheduler] Error in processPendingDispatches loop:', loopErr);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Retrieves recent scheduled dispatches with optional filtering
   */
  async getDispatches(filter?: { status?: string; listId?: string; limit?: number }) {
    let sql = `SELECT * FROM scheduled_dispatches WHERE 1=1`;
    const params: unknown[] = [];

    if (filter?.status && filter.status !== 'all') {
      params.push(filter.status);
      sql += ` AND status = $${params.length}`;
    }

    if (filter?.listId && filter.listId !== 'all') {
      params.push(filter.listId);
      sql += ` AND list_id = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(filter?.limit || 100);

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * Cancels a pending scheduled dispatch
   */
  async cancelDispatch(id: string): Promise<boolean> {
    const res = await query(
      `UPDATE scheduled_dispatches
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'scheduled'
       RETURNING id`,
      [id]
    );
    return res.rows.length > 0;
  }

  /**
   * Retries a failed or cancelled dispatch
   */
  async retryDispatch(id: string): Promise<boolean> {
    const res = await query(
      `UPDATE scheduled_dispatches
       SET status = 'scheduled', scheduled_for = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('failed', 'cancelled')
       RETURNING id`,
      [id]
    );
    if (res.rows.length > 0) {
      setTimeout(() => this.processPendingDispatches().catch(console.error), 200);
      return true;
    }
    return false;
  }

  /**
   * Starts background scheduler polling loop
   */
  startScheduler(pollIntervalMs = 20000) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    console.log(`[EmailScheduler] Background scheduler loop started (interval: ${pollIntervalMs / 1000}s).`);
    // Run immediately once
    this.processPendingDispatches().catch(console.error);

    this.timer = setInterval(() => {
      this.processPendingDispatches().catch(console.error);
    }, pollIntervalMs);
  }

  /**
   * Stops scheduler
   */
  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const emailSchedulerService = new EmailSchedulerService();
