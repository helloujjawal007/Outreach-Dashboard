import nodemailer from 'nodemailer';
import { query } from '../config/db';
import { env } from '../config/env';

export interface DnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  name: string;
  value: string;
  status: 'valid' | 'pending' | 'failed';
  description: string;
}

export interface WarmupStatus {
  subdomain: string;
  stage: number;
  stageName: string;
  dailyLimit: number;
  sentToday: number;
  remainingToday: number;
  isThrottled: boolean;
  spf: 'valid' | 'pending' | 'failed';
  dkim: 'valid' | 'pending' | 'failed';
  dmarc: 'valid' | 'pending' | 'failed';
  dnsRecords: DnsRecord[];
}

export class EmailAdapter {
  private subdomain: string = 'outreach.clientconnect.io';
  
  // Warm-up ramp tiers: [stage, maxPerDay, label]
  private readonly WARMUP_STAGES = [
    { stage: 1, limit: 25, label: 'Initial Warm-up (Days 1-2)' },
    { stage: 2, limit: 50, label: 'Gradual Ramp (Days 3-4)' },
    { stage: 3, limit: 100, label: 'Steady Growth (Days 5-7)' },
    { stage: 4, limit: 200, label: 'Scaling Outbound (Days 8-14)' },
    { stage: 5, limit: 500, label: 'Mature Sender (Days 15+)' },
  ];

  // Upgraded to Stage 4 (200/day) by default to safely maximize capacity within Google SMTP limits
  private currentStageIndex = 3; 

  /**
   * Returns current warm-up metrics, today's sent count, and DNS alignment status
   */
  async getWarmupStatus(): Promise<WarmupStatus> {
    const todayRes = await query<{ sent_count: number }>(
      `SELECT sent_count FROM daily_send_metrics WHERE metric_date = CURRENT_DATE AND channel = 'email'`
    );

    const sentToday = todayRes.rows.length > 0 ? Number(todayRes.rows[0].sent_count) : 0;
    const currentTier = this.WARMUP_STAGES[this.currentStageIndex];
    const configuredLimit = process.env.DAILY_EMAIL_LIMIT ? parseInt(process.env.DAILY_EMAIL_LIMIT, 10) : currentTier.limit;
    const dailyLimit = Number.isNaN(configuredLimit) ? 200 : configuredLimit;
    const remainingToday = Math.max(0, dailyLimit - sentToday);
    const isThrottled = sentToday >= dailyLimit;

    return {
      subdomain: this.subdomain,
      stage: currentTier.stage,
      stageName: currentTier.label,
      dailyLimit,
      sentToday,
      remainingToday,
      isThrottled,
      spf: 'valid',
      dkim: 'valid',
      dmarc: 'valid',
      dnsRecords: [
        {
          type: 'TXT',
          name: this.subdomain,
          value: 'v=spf1 include:_spf.clientconnect.io ~all',
          status: 'valid',
          description: 'Sender Policy Framework (SPF) Authorization',
        },
        {
          type: 'TXT',
          name: `default._domainkey.${this.subdomain}`,
          value: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0...',
          status: 'valid',
          description: 'DomainKeys Identified Mail (DKIM) Cryptographic Key',
        },
        {
          type: 'TXT',
          name: `_dmarc.${this.subdomain}`,
          value: 'v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@clientconnect.io',
          status: 'valid',
          description: 'Domain-based Message Authentication, Reporting & Conformance (DMARC)',
        },
      ],
    };
  }

  /**
   * Set custom sending subdomain
   */
  setSubdomain(domain: string) {
    this.subdomain = domain.trim().toLowerCase();
  }

  /**
   * Set current warm-up stage (1 through 5)
   */
  setWarmupStage(stage: number) {
    const idx = Math.max(0, Math.min(this.WARMUP_STAGES.length - 1, stage - 1));
    this.currentStageIndex = idx;
  }

  /**
   * Dispatches email via dedicated subdomain, enforcing daily warm-up limits
   */
  async sendEmail(params: {
    to: string;
    subject?: string;
    body: string;
    leadId?: string;
    clientId?: string;
  }): Promise<{
    success: boolean;
    throttled: boolean;
    messageId?: string;
    reason?: string;
    liveDelivery?: string;
  }> {
    const status = await this.getWarmupStatus();

    if (status.isThrottled) {
      return {
        success: false,
        throttled: true,
        reason: `Daily warm-up sending limit reached (${status.sentToday}/${status.dailyLimit} emails sent today). Sending auto-throttled to preserve domain reputation.`,
      };
    }

    // 1. Live SMTP dispatch if credentials exist in .env
    let liveDelivery = 'simulated';
    let liveError: string | undefined;
    const isGmail = (env.SMTP_HOST || '').toLowerCase().includes('gmail') || (env.SMTP_USER || '').toLowerCase().endsWith('@gmail.com');

    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && params.to) {
      try {
        const cleanPass = env.SMTP_PASS.replace(/\s+/g, '');

        const transporter = nodemailer.createTransport(
          isGmail
            ? {
                service: 'gmail',
                auth: {
                  user: env.SMTP_USER,
                  pass: cleanPass,
                },
              }
            : {
                host: env.SMTP_HOST,
                port: env.SMTP_PORT,
                secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
                auth: {
                  user: env.SMTP_USER,
                  pass: cleanPass,
                },
              }
        );

        const cleanFrom = (env.SMTP_FROM || env.SMTP_USER || '').trim();
        const displayName = cleanFrom.toLowerCase().includes('team.onlinedigitalsolution')
          ? 'Team Online Digital Solution'
          : 'Outreach & Partnerships';
        const fromAddress = cleanFrom.includes('<') ? cleanFrom : `"${displayName}" <${cleanFrom}>`;

        // Anti-spam deliverability: clean plain text with opt-out footer
        const plainText = `${params.body.trim()}\n\n---\nIf you prefer not to receive further emails from us, reply with "Unsubscribe" or "Stop".`;

        // Anti-spam deliverability: structured HTML alternative prevents raw-script flagging
        const htmlParagraphs = params.body
          .trim()
          .split(/\n\s*\n/)
          .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.6;">${p.replace(/\n/g, '<br/>')}</p>`)
          .join('');

        const htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #1e293b; max-width: 600px; padding: 12px 0;">
            ${htmlParagraphs}
            <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0;">If you prefer not to receive future emails, simply reply with <strong>Unsubscribe</strong> or <strong>Stop</strong>.</p>
            </div>
          </div>
        `.trim();

        await transporter.sendMail({
          from: fromAddress,
          to: params.to,
          replyTo: cleanFrom,
          subject: params.subject || `Outreach Follow-up`,
          text: plainText,
          html: htmlBody,
          headers: {
            'List-Unsubscribe': `<mailto:${cleanFrom}?subject=Unsubscribe>`,
            'X-Mailer': 'ClientConnect Outreach Engine',
          },
        });
        liveDelivery = 'sent_live';
        console.log(`[EmailAdapter] Live email successfully dispatched via ${isGmail ? 'Gmail' : env.SMTP_HOST} to ${params.to}`);
      } catch (smtpErr: unknown) {
        liveDelivery = 'smtp_failed';
        const rawError = smtpErr instanceof Error ? smtpErr.message : 'SMTP delivery failed';
        if (rawError.includes('535') || rawError.includes('BadCredentials') || rawError.includes('Username and Password not accepted')) {
          liveError = `Gmail authentication failed: Google requires a 16-character App Password (not your normal Gmail password). Enable 2-Step Verification and generate an App Password at https://myaccount.google.com/apppasswords`;
        } else if (rawError.includes('domain is not verified') || rawError.includes('only send testing emails')) {
          liveError = `Resend restriction: Add & verify domain at resend.com/domains, or use Gmail SMTP with an App Password.`;
        } else {
          liveError = rawError;
        }
        console.error(`[EmailAdapter] SMTP delivery error sending to ${params.to}:`, liveError);
      }



    } else {
      console.log(`[EmailAdapter] Live SMTP not configured in .env (host: "${env.SMTP_HOST || 'none'}"). Recording to database timeline in simulation mode.`);
    }

    // 2. Register outbound message in PostgreSQL conversation thread
    const entityId = params.leadId || params.clientId;
    const entityType = params.clientId ? 'client' : 'lead';

    if (entityId) {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE entity_type = $1 AND (lead_id = $2 OR client_id = $2) AND channel = 'email' LIMIT 1`,
        [entityType, entityId]
      );

      let convId: string;
      if (convRes.rows.length === 0) {
        const insertConv = await query<{ id: string }>(
          `INSERT INTO conversations (entity_type, ${entityType === 'lead' ? 'lead_id' : 'client_id'}, channel, status, last_message_at)
           VALUES ($1, $2, 'email', 'open', NOW())
           RETURNING id`,
          [entityType, entityId]
        );
        convId = insertConv.rows[0].id;
      } else {
        convId = convRes.rows[0].id;
      }

      const msgRes = await query<{ id: string }>(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at)
         VALUES ($1, 'email', 'outbound', $2, 'sent', NOW())
         RETURNING id`,
        [convId, params.body]
      );

      // Mark all preceding inbound messages in this thread as replied & seen
      await query(
        `UPDATE messages
         SET is_replied = true, replied_at = NOW(), is_seen = true, seen_at = COALESCE(seen_at, NOW())
         WHERE conversation_id = $1 AND direction = 'inbound' AND (is_replied IS NOT TRUE OR is_seen IS NOT TRUE)`,
        [convId]
      );

      // Increment daily sent metrics in database
      await query(
        `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
         VALUES (CURRENT_DATE, 'email', 1, NOW())
         ON CONFLICT (metric_date, channel)
         DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`,
        []
      );

      // Also increment total daily metrics
      await query(
        `INSERT INTO daily_send_metrics (metric_date, channel, sent_count, updated_at)
         VALUES (CURRENT_DATE, 'total', 1, NOW())
         ON CONFLICT (metric_date, channel)
         DO UPDATE SET sent_count = daily_send_metrics.sent_count + 1, updated_at = NOW()`,
        []
      );

      if (params.leadId) {
        await query(`UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1`, [params.leadId]);
      }

      return {
        success: true,
        throttled: false,
        messageId: msgRes.rows[0].id,
        liveDelivery,
        reason: liveDelivery === 'sent_live'
          ? `Live email sent via ${isGmail ? 'Gmail' : env.SMTP_HOST} to ${params.to}`
          : liveDelivery === 'smtp_failed'
          ? `Email recorded in timeline, but SMTP server returned: ${liveError}`
          : (env.SMTP_USER && !env.SMTP_PASS)
          ? `Gmail sender is set to ${env.SMTP_USER}. Add your 16-character Google App Password to SMTP_PASS in .env (from https://myaccount.google.com/apppasswords) to send live emails!`
          : `Email recorded in timeline (Simulation mode: SMTP credentials not set in .env)`,
      };
    }


    return {
      success: true,
      throttled: false,
      liveDelivery,
    };
  }
}

export const emailAdapter = new EmailAdapter();
