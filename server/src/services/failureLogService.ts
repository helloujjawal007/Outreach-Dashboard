import { query } from '../config/db';
import { workflowRoutingService } from './workflowRoutingService';

export type FailureType =
  | 'SEND_FAILED'
  | 'AUDIT_FAILED'
  | 'AUDIT_TIMEOUT'
  | 'PDF_MISSING'
  | 'REPORT_DELIVERY_FAILED';

export interface FailureLogEntry {
  id: string;
  lead_id: string | null;
  company: string;
  website: string;
  email: string;
  slot_id: string;
  stage: string;
  type: FailureType;
  error_message: string;
  attempts: number;
  created_at: string;
  resolved: boolean;
}

export interface FailureFilter {
  type?: string;
  slotId?: string;
  resolved?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class FailureLogService {
  /**
   * Records a failure event into failure_log
   */
  async logFailure(params: {
    leadId?: string | null;
    company: string;
    website?: string;
    email?: string;
    slotId?: string;
    stage?: string;
    type: FailureType;
    errorMessage: string;
    attempts?: number;
  }): Promise<FailureLogEntry> {
    // Deduplicate unresolved failures of the same type for the same lead so one broken lead never floods the log
    if (params.leadId) {
      const existingRes = await query<FailureLogEntry>(
        `SELECT * FROM failure_log
         WHERE lead_id = $1 AND type = $2 AND resolved = false
         ORDER BY created_at DESC LIMIT 1`,
        [params.leadId, params.type]
      );
      if (existingRes.rows.length > 0) {
        const updatedRes = await query<FailureLogEntry>(
          `UPDATE failure_log
           SET attempts = GREATEST(attempts + 1, $1),
               error_message = $2,
               slot_id = COALESCE(NULLIF($3, ''), slot_id),
               website = COALESCE(NULLIF($4, ''), website),
               email = COALESCE(NULLIF($5, ''), email),
               created_at = NOW()
           WHERE id = $6
           RETURNING *`,
          [
            params.attempts || 1,
            params.errorMessage || existingRes.rows[0].error_message,
            params.slotId || '',
            params.website || '',
            params.email || '',
            existingRes.rows[0].id,
          ]
        );
        return updatedRes.rows[0];
      }
    }

    const res = await query<FailureLogEntry>(
      `INSERT INTO failure_log (
        lead_id, company, website, email, slot_id, stage, type, error_message, attempts, created_at, resolved
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), false)
      RETURNING *`,
      [
        params.leadId || null,
        params.company || 'Unknown Company',
        params.website || '',
        params.email || '',
        params.slotId || '',
        params.stage || 'initial',
        params.type,
        params.errorMessage || 'Unknown error',
        params.attempts || 1,
      ]
    );

    console.warn(
      `[FailureLogService] ⚠️ Failure logged [${params.type}] for "${params.company}" (Slot: ${params.slotId || 'None'}): ${params.errorMessage}`
    );

    return res.rows[0];
  }

  /**
   * Retrieves failure records with optional filtering
   */
  async getFailures(filter: FailureFilter = {}): Promise<{
    failures: FailureLogEntry[];
    records: FailureLogEntry[];
    total: number;
    summary: Record<string, number>;
    stats: { total: number; unresolved: number; byType: Record<string, number> };
  }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (filter.type && filter.type !== 'all') {
      conditions.push(`type = $${idx++}`);
      values.push(filter.type);
    }

    if (filter.slotId && filter.slotId !== 'all') {
      conditions.push(`slot_id = $${idx++}`);
      values.push(filter.slotId.toUpperCase());
    }

    if (filter.resolved !== undefined) {
      conditions.push(`resolved = $${idx++}`);
      values.push(filter.resolved);
    }

    if (filter.startDate) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(filter.endDate);
    }

    if (filter.search && filter.search.trim()) {
      const q = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(`(LOWER(company) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(website) LIKE $${idx} OR LOWER(error_message) LIKE $${idx})`);
      values.push(q);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM failure_log ${whereClause}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const limit = Math.min(200, Math.max(1, filter.limit || 50));
    const offset = Math.max(0, filter.offset || 0);

    const listSql = `
      SELECT * FROM failure_log 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    const listRes = await query<FailureLogEntry>(listSql, [...values, limit, offset]);

    // Breakdown counts
    const summaryRes = await query<{ type: string; count: string }>(
      `SELECT type, COUNT(*) as count FROM failure_log WHERE resolved = false GROUP BY type`
    );
    const summary: Record<string, number> = {};
    for (const r of summaryRes.rows) {
      summary[r.type] = parseInt(r.count, 10);
    }

    const unresolvedCount = Object.values(summary).reduce((a, b) => a + b, 0);

    return {
      failures: listRes.rows,
      records: listRes.rows,
      total,
      summary,
      stats: {
        total,
        unresolved: unresolvedCount,
        byType: summary,
      },
    };
  }

  /**
   * Resolves a failure log item
   */
  async resolveFailure(id: string): Promise<boolean> {
    const res = await query(
      `UPDATE failure_log SET resolved = true WHERE id = $1 RETURNING id`,
      [id]
    );
    return (res.rowCount || 0) > 0;
  }

  /**
   * Retries an item: clears failure resolution, resets lead audit & outreach status to retry queue
   */
  async retryFailure(id: string): Promise<{ success: boolean; message: string; leadId?: string }> {
    const res = await query<FailureLogEntry>(
      `SELECT * FROM failure_log WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      return { success: false, message: 'Failure log entry not found' };
    }

    const failure = res.rows[0];

    if (!failure.lead_id) {
      return { success: true, message: 'Failure marked resolved (no associated lead ID)' };
    }

    // Validate before re-queuing so unrecoverable leads don't immediately fail again
    const leadRes = await query<{ website: string | null; email: string | null; phone: string | null; whatsapp: string | null }>(
      `SELECT website, email, phone, whatsapp FROM leads WHERE id = $1 AND deleted_at IS NULL`,
      [failure.lead_id]
    );
    if (leadRes.rows.length === 0) {
      await query(`UPDATE failure_log SET resolved = true WHERE id = $1`, [id]);
      return { success: false, message: 'Associated lead no longer exists in CRM (failure closed).' };
    }

    const leadRow = leadRes.rows[0];
    const hasEmail = Boolean(leadRow.email && leadRow.email.includes('@'));
    const rawDigits = (leadRow.whatsapp || leadRow.phone || '').replace(/\D/g, '');
    if (!hasEmail && rawDigits.length < 8) {
      return {
        success: false,
        message: 'Cannot retry: lead has no email address or WhatsApp/phone number. Add contact info in CRM or delete this failed lead.',
        leadId: failure.lead_id,
      };
    }

    const isAuditError = ['AUDIT_FAILED', 'AUDIT_TIMEOUT', 'PDF_MISSING'].includes(failure.type);
    if (isAuditError && !workflowRoutingService.hasValidWebsite(leadRow.website)) {
      return {
        success: false,
        message: 'Cannot retry audit: lead has no valid website URL. Add a valid website URL in CRM or delete this failed lead.',
        leadId: failure.lead_id,
      };
    }

    // Mark log resolved only after passing retry validation
    await query(`UPDATE failure_log SET resolved = true WHERE id = $1`, [id]);

    // Reset lead so that it can be audited and scheduled again
    await query(
      `UPDATE leads 
       SET status = 'active', 
           audit_status = 'pending', 
           audit_retry_count = 0,
           audit_requested_at = NULL,
           manual_review_reason = NULL,
           updated_at = NOW() 
       WHERE id = $1`,
      [failure.lead_id]
    );

    // Actively re-trigger audit for the retried lead
    try {
      const { fiveSlotSenderService } = await import('./fiveSlotSenderService');
      fiveSlotSenderService.triggerAuditForLead(failure.lead_id).catch((err: any) => {
        console.warn(`[FailureLogService] Re-audit trigger note for lead ${failure.lead_id}:`, err?.message);
      });
    } catch (auditErr: any) {
      console.warn('[FailureLogService] Failed to import fiveSlotSenderService:', auditErr?.message);
    }

    return {
      success: true,
      message: `Reset lead "${failure.company}" to active queue. Audit actively re-requested for slot ${failure.slot_id || 'A'}.`,
      leadId: failure.lead_id,
    };
  }

  /**
   * Soft-deletes a failed lead from CRM & slots and clears its failure log entries
   */
  async deleteFailedLead(id: string): Promise<{
    success: boolean;
    deletedLead: boolean;
    leadId: string | null;
    company: string;
    message: string;
  }> {
    const res = await query<FailureLogEntry>(`SELECT * FROM failure_log WHERE id = $1`, [id]);
    if (res.rows.length === 0) {
      return {
        success: false,
        deletedLead: false,
        leadId: null,
        company: '',
        message: 'Failure log entry not found',
      };
    }

    const failure = res.rows[0];
    let deletedLead = false;

    if (failure.lead_id) {
      const leadId = failure.lead_id;
      await query(
        `DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE lead_id = $1 OR client_id = $1)`,
        [leadId]
      );
      await query(
        `DELETE FROM conversations WHERE lead_id = $1 OR client_id = $1 OR (entity_type = 'lead' AND lead_id = $1) OR (entity_type = 'client' AND client_id = $1)`,
        [leadId]
      );
      await query(`DELETE FROM scheduled_dispatches WHERE lead_id = $1 OR client_id = $1`, [leadId]);
      await query(`DELETE FROM send_queue WHERE lead_id = $1 OR client_id = $1`, [leadId]);
      await query(`DELETE FROM follow_up_logs WHERE lead_id = $1 OR client_id = $1`, [leadId]);
      await query(`DELETE FROM linkedin_prospect_comments WHERE lead_id = $1`, [leadId]);
      await query(`DELETE FROM lead_list_memberships WHERE lead_id = $1`, [leadId]);

      const softDel = await query(
        `UPDATE leads
         SET deleted_at = NOW(),
             deleted_expires_at = NOW() + INTERVAL '28 days',
             slot_id = NULL,
             status = 'inactive',
             updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [leadId]
      );
      deletedLead = (softDel.rowCount || 0) > 0;

      await query(
        `UPDATE clients
         SET deleted_at = NOW(),
             deleted_expires_at = NOW() + INTERVAL '28 days'
         WHERE id = $1 OR original_lead_id = $1`,
        [leadId]
      );

      await query(`DELETE FROM failure_log WHERE lead_id = $1 OR id = $2`, [leadId, id]);
    } else {
      await query(`DELETE FROM failure_log WHERE id = $1`, [id]);
    }

    return {
      success: true,
      deletedLead,
      leadId: failure.lead_id,
      company: failure.company,
      message: deletedLead
        ? `Deleted failed lead "${failure.company}" from CRM & cleared failure logs.`
        : `Removed orphaned failure log entry for "${failure.company}".`,
    };
  }

  /**
   * Generates CSV export content with formula injection sanitization
   */
  async exportCsv(filter: FailureFilter = {}): Promise<string> {
    const { failures } = await this.getFailures({ ...filter, limit: 10000, offset: 0 });

    const sanitizeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).trim();
      // Excel/Calc CSV Formula Injection defense: escape =, +, -, @, tab, CR
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'` + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['ID', 'Date', 'Company', 'Website', 'Email', 'Slot', 'Stage', 'Failure Type', 'Attempts', 'Resolved', 'Error Message'];
    const rows = failures.map((f) => [
      sanitizeCell(f.id),
      sanitizeCell(new Date(f.created_at).toISOString()),
      sanitizeCell(f.company || ''),
      sanitizeCell(f.website || ''),
      sanitizeCell(f.email || ''),
      sanitizeCell(f.slot_id || ''),
      sanitizeCell(f.stage || ''),
      sanitizeCell(f.type),
      sanitizeCell(f.attempts),
      sanitizeCell(f.resolved ? 'YES' : 'NO'),
      sanitizeCell(f.error_message || ''),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

export const failureLogService = new FailureLogService();
