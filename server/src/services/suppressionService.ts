import { query } from '../config/db';

export interface SuppressionCheckResult {
  suppressed: boolean;
  reason?: string;
  source?: string;
  suppressedAt?: Date;
}

export interface SuppressedRecord {
  id: string;
  email: string | null;
  phone: string | null;
  domain: string | null;
  reason: string;
  source: string;
  created_at: string;
}

export interface SuppressionStats {
  total: number;
  unsubscribed: number;
  hardBounce: number;
  complaint: number;
  manual: number;
  invalidMx: number;
}

export class SuppressionService {
  /**
   * Fast pre-send check to verify if an email, phone, or domain is globally suppressed
   */
  async isSuppressed(params: {
    email?: string | null;
    phone?: string | null;
    domain?: string | null;
  }): Promise<SuppressionCheckResult> {
    const email = params.email ? params.email.toLowerCase().trim() : null;
    const phone = params.phone ? params.phone.replace(/\D/g, '') : null;
    let domain = params.domain ? params.domain.toLowerCase().trim() : null;

    if (!domain && email && email.includes('@')) {
      domain = email.split('@')[1];
    }

    if (!email && !phone && !domain) {
      return { suppressed: false };
    }

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (email) {
      conditions.push(`LOWER(email) = $${idx++}`);
      values.push(email);
    }
    if (phone && phone.length >= 7) {
      conditions.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (domain) {
      conditions.push(`LOWER(domain) = $${idx++}`);
      values.push(domain);
    }

    if (conditions.length === 0) {
      return { suppressed: false };
    }

    const sql = `
      SELECT reason, source, created_at 
      FROM global_suppression_list 
      WHERE ${conditions.join(' OR ')} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    const res = await query<{ reason: string; source: string; created_at: Date }>(sql, values);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        suppressed: true,
        reason: row.reason,
        source: row.source,
        suppressedAt: row.created_at,
      };
    }

    return { suppressed: false };
  }

  /**
   * Adds an email, phone, or domain to the global suppression list.
   * Automatically updates any matching lead's consent_status, cancels queued messages, and logs activity.
   */
  async suppress(params: {
    email?: string | null;
    phone?: string | null;
    domain?: string | null;
    reason: string;
    source?: string;
  }): Promise<{ added: boolean; recordId: string }> {
    const email = params.email ? params.email.toLowerCase().trim() : null;
    const phone = params.phone ? params.phone.replace(/\D/g, '') : null;
    let domain = params.domain ? params.domain.toLowerCase().trim() : null;

    if (!domain && email && email.includes('@')) {
      domain = email.split('@')[1];
    }

    const reason = params.reason || 'unsubscribed';
    const source = params.source || 'system';

    // 1. Prevent duplicate suppression rows
    const existing = await this.isSuppressed({ email, phone, domain });
    if (existing.suppressed) {
      const res = await query<{ id: string }>(
        `SELECT id FROM global_suppression_list WHERE (LOWER(email) = $1 AND $1 IS NOT NULL) OR (phone = $2 AND $2 IS NOT NULL) LIMIT 1`,
        [email, phone]
      );
      return { added: false, recordId: res.rows[0]?.id || '' };
    }

    // 2. Insert into global_suppression_list
    const insertRes = await query<{ id: string }>(
      `INSERT INTO global_suppression_list (email, phone, domain, reason, source, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [email, phone, domain, reason, source]
    );
    const recordId = insertRes.rows[0]?.id;

    console.log(`[SuppressionService] 🚫 Suppressed target: email="${email}", phone="${phone}", reason="${reason}" [${source}]`);

    // 3. Find matching leads to cascade updates
    if (email || phone) {
      try {
        const leadRes = await query<{ id: string; business_name: string }>(
          `SELECT id, business_name FROM leads 
           WHERE (LOWER(email) = $1 AND $1 IS NOT NULL) 
              OR (phone LIKE '%' || $2 || '%' AND $2 IS NOT NULL)
           LIMIT 10`,
          [email, phone]
        );

        for (const lead of leadRes.rows) {
          const consentStatus = reason.includes('bounce') ? 'bounced' : 'unsubscribed';
          const leadStatus = reason.includes('bounce') ? 'bounced' : 'inactive';

          // Update lead status
          await query(
            `UPDATE leads 
             SET consent_status = $1, 
                 status = CASE WHEN status = 'active' THEN $2 ELSE status END,
                 updated_at = NOW() 
             WHERE id = $3`,
            [consentStatus, leadStatus, lead.id]
          );

          // Discard pending queue
          await query(
            `UPDATE send_queue 
             SET status = 'discarded', 
                 error_details = 'Recipient globally suppressed: ' || $1, 
                 updated_at = NOW() 
             WHERE lead_id = $2 AND status = 'draft'`,
            [reason, lead.id]
          );

          // Cancel scheduled dispatches
          await query(
            `UPDATE scheduled_dispatches 
             SET status = 'cancelled', 
                 error_message = 'Recipient globally suppressed: ' || $1, 
                 updated_at = NOW() 
             WHERE lead_id = $2 AND status IN ('scheduled', 'processing')`,
            [reason, lead.id]
          );

          // Log to unified activity_logs
          await query(
            `INSERT INTO activity_logs (lead_id, actor_type, activity_type, title, description, metadata)
             VALUES ($1, 'system', 'suppression_added', $2, $3, $4)`,
            [
              lead.id,
              `Suppressed: ${reason}`,
              `Recipient added to global suppression list via ${source}. All outbound campaigns stopped.`,
              JSON.stringify({ email, phone, reason, source }),
            ]
          );
        }
      } catch (cascadeErr) {
        console.error('[SuppressionService] Error cascading suppression to leads:', cascadeErr);
      }
    }

    return { added: true, recordId };
  }

  /**
   * Removes an entry from the suppression list
   */
  async unsuppress(id: string): Promise<boolean> {
    const res = await query(`DELETE FROM global_suppression_list WHERE id = $1 RETURNING id`, [id]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Fetches paginated suppression records with optional filtering
   */
  async getSuppressedList(options?: {
    search?: string;
    reason?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ records: SuppressedRecord[]; total: number }> {
    const limit = Math.min(options?.limit || 50, 200);
    const offset = options?.offset || 0;
    const search = options?.search ? `%${options.search.toLowerCase().trim()}%` : null;
    const reason = options?.reason || null;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(LOWER(email) LIKE $${idx} OR phone LIKE $${idx} OR LOWER(domain) LIKE $${idx} OR LOWER(reason) LIKE $${idx})`);
      values.push(search);
      idx++;
    }

    if (reason && reason !== 'all') {
      conditions.push(`reason = $${idx++}`);
      values.push(reason);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM global_suppression_list ${whereClause}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const listRes = await query<SuppressedRecord>(
      `SELECT id, email, phone, domain, reason, source, created_at 
       FROM global_suppression_list 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return {
      records: listRes.rows,
      total,
    };
  }

  /**
   * Summary stats for suppression dashboard
   */
  async getSuppressionStats(): Promise<SuppressionStats> {
    const res = await query<{
      total: string;
      unsubscribed: string;
      hard_bounce: string;
      complaint: string;
      manual: string;
      invalid_mx: string;
    }>(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE reason ILIKE '%unsub%') AS unsubscribed,
        COUNT(*) FILTER (WHERE reason ILIKE '%bounce%') AS hard_bounce,
        COUNT(*) FILTER (WHERE reason ILIKE '%complaint%' OR reason ILIKE '%spam%') AS complaint,
        COUNT(*) FILTER (WHERE source = 'manual_user') AS manual,
        COUNT(*) FILTER (WHERE reason ILIKE '%mx%' OR reason ILIKE '%domain%') AS invalid_mx
      FROM global_suppression_list
    `);

    const row = res.rows[0];
    return {
      total: parseInt(row?.total || '0', 10),
      unsubscribed: parseInt(row?.unsubscribed || '0', 10),
      hardBounce: parseInt(row?.hard_bounce || '0', 10),
      complaint: parseInt(row?.complaint || '0', 10),
      manual: parseInt(row?.manual || '0', 10),
      invalidMx: parseInt(row?.invalid_mx || '0', 10),
    };
  }
}

export const suppressionService = new SuppressionService();
