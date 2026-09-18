import nodemailer, { type Transporter } from 'nodemailer';
import { query } from '../config/db';

export interface ConnectedInboxRecord {
  id: string;
  name: string;
  email: string;
  sender_name: string;
  provider: 'google_workspace' | 'office_365' | 'smtp';
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  daily_limit: number;
  sent_today: number;
  last_reset_date: string;
  health_score: number;
  status: 'active' | 'paused' | 'exhausted' | 'error';
  is_default: boolean;
  last_error?: string | null;
  last_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxPoolSummary {
  totalInboxes: number;
  activeInboxes: number;
  exhaustedInboxes: number;
  pausedInboxes: number;
  totalDailyCapacity: number;
  totalSentToday: number;
  remainingCapacityToday: number;
  averageHealthScore: number;
}

export class InboxRotationService {
  private transporterCache = new Map<string, Transporter>();

  /**
   * Automatically resets daily counters if a new calendar day has started
   */
  async checkDailyReset(): Promise<void> {
    try {
      await query(`
        UPDATE connected_inboxes
        SET sent_today = 0,
            last_reset_date = CURRENT_DATE,
            status = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END,
            updated_at = NOW()
        WHERE last_reset_date < CURRENT_DATE;
      `);
    } catch (err) {
      console.error('[InboxRotationService] Daily reset check failed:', err);
    }
  }

  /**
   * Retrieves all connected inboxes with real-time stats
   */
  async getAllInboxes(): Promise<ConnectedInboxRecord[]> {
    await this.checkDailyReset();
    const res = await query<ConnectedInboxRecord>(`
      SELECT id, name, email, sender_name, provider, smtp_host, smtp_port, smtp_secure,
             smtp_user, smtp_pass, daily_limit, sent_today, last_reset_date, health_score,
             status, is_default, last_error, last_sent_at, created_at, updated_at
      FROM connected_inboxes
      ORDER BY is_default DESC, created_at ASC;
    `);
    return res.rows;
  }

  /**
   * Retrieves pool summary metrics for headers and deliverability dashboards
   */
  async getPoolSummary(): Promise<InboxPoolSummary> {
    await this.checkDailyReset();
    const res = await query<{
      total_inboxes: string;
      active_inboxes: string;
      exhausted_inboxes: string;
      paused_inboxes: string;
      total_daily_capacity: string;
      total_sent_today: string;
      avg_health_score: string;
    }>(`
      SELECT 
        COUNT(*)::text AS total_inboxes,
        COUNT(*) FILTER (WHERE status = 'active')::text AS active_inboxes,
        COUNT(*) FILTER (WHERE status = 'exhausted')::text AS exhausted_inboxes,
        COUNT(*) FILTER (WHERE status = 'paused')::text AS paused_inboxes,
        COALESCE(SUM(daily_limit), 0)::text AS total_daily_capacity,
        COALESCE(SUM(sent_today), 0)::text AS total_sent_today,
        COALESCE(AVG(health_score), 100)::text AS avg_health_score
      FROM connected_inboxes;
    `);

    const row = res.rows[0];
    const totalCap = parseInt(row?.total_daily_capacity || '0', 10);
    const totalSent = parseInt(row?.total_sent_today || '0', 10);

    return {
      totalInboxes: parseInt(row?.total_inboxes || '0', 10),
      activeInboxes: parseInt(row?.active_inboxes || '0', 10),
      exhaustedInboxes: parseInt(row?.exhausted_inboxes || '0', 10),
      pausedInboxes: parseInt(row?.paused_inboxes || '0', 10),
      totalDailyCapacity: totalCap,
      totalSentToday: totalSent,
      remainingCapacityToday: Math.max(0, totalCap - totalSent),
      averageHealthScore: Math.round(parseFloat(row?.avg_health_score || '100')),
    };
  }

  /**
   * Selects the next available healthy inbox using weighted least-sent round-robin
   */
  async getNextAvailableInbox(): Promise<ConnectedInboxRecord | null> {
    await this.checkDailyReset();

    const res = await query<ConnectedInboxRecord>(`
      SELECT *
      FROM connected_inboxes
      WHERE status = 'active'
        AND sent_today < daily_limit
      ORDER BY 
        (sent_today::float / NULLIF(daily_limit, 0)) ASC,
        last_sent_at ASC NULLS FIRST
      LIMIT 1;
    `);

    if (res.rows.length === 0) {
      return null;
    }

    return res.rows[0];
  }

  /**
   * Retrieves a specific inbox by ID
   */
  async getInboxById(id: string): Promise<ConnectedInboxRecord | null> {
    const res = await query<ConnectedInboxRecord>(`SELECT * FROM connected_inboxes WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }

  /**
   * Returns a cached reusable Nodemailer transporter for an inbox
   */
  getTransporter(inbox: ConnectedInboxRecord): Transporter {
    const cached = this.transporterCache.get(inbox.id);
    if (cached) return cached;

    const isGmail = inbox.provider === 'google_workspace' || 
                    inbox.smtp_host.toLowerCase().includes('gmail') || 
                    inbox.email.toLowerCase().endsWith('@gmail.com');

    const cleanPass = inbox.smtp_pass.replace(/\s+/g, '');

    const transporter = nodemailer.createTransport(
      isGmail
        ? {
            service: 'gmail',
            auth: {
              user: inbox.smtp_user,
              pass: cleanPass,
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
          }
        : {
            host: inbox.smtp_host,
            port: inbox.smtp_port,
            secure: inbox.smtp_secure || inbox.smtp_port === 465,
            auth: {
              user: inbox.smtp_user,
              pass: cleanPass,
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
          }
    );

    this.transporterCache.set(inbox.id, transporter);
    return transporter;
  }

  /**
   * Records a dispatch attempt, updates counters, and checks for daily capacity exhaustion
   */
  async recordDispatch(inboxId: string, success: boolean, errorMessage?: string): Promise<void> {
    try {
      if (success) {
        await query(`
          UPDATE connected_inboxes
          SET sent_today = sent_today + 1,
              last_sent_at = NOW(),
              status = CASE WHEN sent_today + 1 >= daily_limit THEN 'exhausted' ELSE status END,
              last_error = NULL,
              health_score = LEAST(100, health_score + 1),
              updated_at = NOW()
          WHERE id = $1;
        `, [inboxId]);
      } else {
        await query(`
          UPDATE connected_inboxes
          SET last_error = $2,
              health_score = GREATEST(10, health_score - 5),
              updated_at = NOW()
          WHERE id = $1;
        `, [inboxId, errorMessage || 'Delivery failed']);
      }
    } catch (err) {
      console.error('[InboxRotationService] Failed to record dispatch metrics:', err);
    }
  }

  /**
   * Tests an inbox connection before saving or during health checks
   */
  async testConnection(config: {
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_user: string;
    smtp_pass: string;
    provider?: string;
  }): Promise<{ success: boolean; message: string }> {
    const isGmail = config.provider === 'google_workspace' || 
                    config.smtp_host.toLowerCase().includes('gmail') || 
                    config.smtp_user.toLowerCase().endsWith('@gmail.com');

    const cleanPass = config.smtp_pass.replace(/\s+/g, '');

    const tempTransporter = nodemailer.createTransport(
      isGmail
        ? {
            service: 'gmail',
            auth: {
              user: config.smtp_user,
              pass: cleanPass,
            },
          }
        : {
            host: config.smtp_host,
            port: config.smtp_port,
            secure: config.smtp_secure || config.smtp_port === 465,
            auth: {
              user: config.smtp_user,
              pass: cleanPass,
            },
          }
    );

    try {
      await tempTransporter.verify();
      return { success: true, message: 'SMTP credentials verified successfully.' };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown connection error';
      return { success: false, message: `SMTP verification failed: ${errorMsg}` };
    }
  }

  /**
   * Adds a new inbox to the rotation pool
   */
  async addInbox(data: {
    name: string;
    email: string;
    sender_name: string;
    provider: 'google_workspace' | 'office_365' | 'smtp';
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_user: string;
    smtp_pass: string;
    daily_limit?: number;
  }): Promise<{ success: boolean; inbox?: ConnectedInboxRecord; error?: string }> {
    // 1. Validate connection
    const test = await this.testConnection(data);
    if (!test.success) {
      return { success: false, error: test.message };
    }

    try {
      const cleanPass = data.smtp_pass.replace(/\s+/g, '');
      const limit = data.daily_limit && data.daily_limit > 0 ? data.daily_limit : 40;

      const res = await query<ConnectedInboxRecord>(`
        INSERT INTO connected_inboxes (
          name, email, sender_name, provider, smtp_host, smtp_port, smtp_secure,
          smtp_user, smtp_pass, daily_limit, sent_today, health_score, status, is_default
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 100, 'active', false
        )
        RETURNING *;
      `, [
        data.name.trim(),
        data.email.trim().toLowerCase(),
        data.sender_name.trim(),
        data.provider,
        data.smtp_host.trim(),
        data.smtp_port,
        data.smtp_secure,
        data.smtp_user.trim(),
        cleanPass,
        limit,
      ]);

      return { success: true, inbox: res.rows[0] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save inbox';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return { success: false, error: `An inbox with email "${data.email}" is already connected.` };
      }
      return { success: false, error: msg };
    }
  }

  /**
   * Updates an existing inbox
   */
  async updateInbox(id: string, data: Partial<{
    name: string;
    sender_name: string;
    daily_limit: number;
    status: 'active' | 'paused';
    smtp_pass?: string;
  }>): Promise<ConnectedInboxRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [id];

    if (data.name !== undefined) {
      values.push(data.name.trim());
      fields.push(`name = $${values.length}`);
    }
    if (data.sender_name !== undefined) {
      values.push(data.sender_name.trim());
      fields.push(`sender_name = $${values.length}`);
    }
    if (data.daily_limit !== undefined) {
      values.push(Math.max(5, data.daily_limit));
      fields.push(`daily_limit = $${values.length}`);
    }
    if (data.status !== undefined) {
      values.push(data.status);
      fields.push(`status = $${values.length}`);
    }
    if (data.smtp_pass !== undefined && data.smtp_pass.trim()) {
      values.push(data.smtp_pass.replace(/\s+/g, ''));
      fields.push(`smtp_pass = $${values.length}`);
      this.transporterCache.delete(id); // invalidate cached connection
    }

    if (fields.length === 0) {
      return this.getInboxById(id);
    }

    fields.push(`updated_at = NOW()`);

    const sql = `
      UPDATE connected_inboxes
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;

    const res = await query<ConnectedInboxRecord>(sql, values);
    return res.rows[0] || null;
  }

  /**
   * Removes an inbox from the rotation pool
   */
  async deleteInbox(id: string): Promise<boolean> {
    this.transporterCache.delete(id);
    const res = await query(`DELETE FROM connected_inboxes WHERE id = $1 RETURNING id;`, [id]);
    return res.rows.length > 0;
  }
}

export const inboxRotationService = new InboxRotationService();
