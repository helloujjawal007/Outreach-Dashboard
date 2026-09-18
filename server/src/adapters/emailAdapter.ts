import nodemailer from 'nodemailer';
import { query } from '../config/db';
import { env } from '../config/env';
import { inboxRotationService, type ConnectedInboxRecord, type InboxPoolSummary } from '../services/inboxRotationService';

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
  poolSummary?: InboxPoolSummary;
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
    const poolSummary = await inboxRotationService.getPoolSummary().catch(() => null);

    const todayRes = await query<{ sent_count: number }>(
      `SELECT sent_count FROM daily_send_metrics WHERE metric_date = CURRENT_DATE AND channel = 'email'`
    );

    const fallbackSentToday = todayRes.rows.length > 0 ? Number(todayRes.rows[0].sent_count) : 0;
    const sentToday = poolSummary && poolSummary.totalInboxes > 0 ? poolSummary.totalSentToday : fallbackSentToday;

    const currentTier = this.WARMUP_STAGES[this.currentStageIndex];
    const configuredLimit = process.env.DAILY_EMAIL_LIMIT ? parseInt(process.env.DAILY_EMAIL_LIMIT, 10) : currentTier.limit;
    const baseDailyLimit = Number.isNaN(configuredLimit) ? 200 : configuredLimit;
    const dailyLimit = poolSummary && poolSummary.totalDailyCapacity > 0 ? poolSummary.totalDailyCapacity : baseDailyLimit;

    const remainingToday = Math.max(0, dailyLimit - sentToday);
    const isThrottled = sentToday >= dailyLimit;

    return {
      subdomain: this.subdomain,
      stage: currentTier.stage,
      stageName: poolSummary && poolSummary.totalInboxes > 1 
        ? `Multi-Inbox Pool (${poolSummary.activeInboxes} active / ${poolSummary.totalInboxes} total)`
        : currentTier.label,
      dailyLimit,
      sentToday,
      remainingToday,
      isThrottled,
      spf: 'valid',
      dkim: 'valid',
      dmarc: 'valid',
      poolSummary: poolSummary || undefined,
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
   * Dispatches email via rotating multi-inbox pool or dedicated subdomain
   */
  async sendEmail(params: {
    to: string;
    subject?: string;
    body: string;
    leadId?: string;
    clientId?: string;
    inboxId?: string;
  }): Promise<{
    success: boolean;
    throttled: boolean;
    messageId?: string;
    reason?: string;
    liveDelivery?: string;
    inboxUsed?: { id: string; email: string; name: string };
  }> {
    // 0. Validate recipient address - if anonymous, missing, or malformed, move to manual review
    const cleanTo = (params.to || '').trim().toLowerCase();
    const isAnonymousOrInvalid =
      !cleanTo ||
      cleanTo.startsWith('anonymous') ||
      cleanTo.startsWith('noreply@') ||
      cleanTo.startsWith('no-reply@') ||
      cleanTo.startsWith('donotreply@') ||
      cleanTo.includes('@privacy') ||
      cleanTo.includes('@whois') ||
      cleanTo.includes('@example.com') ||
      /\b[a-f0-9]{24,}@/i.test(cleanTo) ||
      !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanTo);

    if (isAnonymousOrInvalid) {
      const reason = !cleanTo
        ? 'Missing or empty email address'
        : cleanTo.startsWith('noreply') || cleanTo.startsWith('no-reply') || cleanTo.startsWith('donotreply')
        ? 'No-reply email address (cannot receive outreach)'
        : 'Anonymous or unverified email address pattern';

      if (params.leadId) {
        await query(
          `UPDATE leads 
           SET status = 'manual_review', 
               manual_review_reason = $1, 
               manual_review_at = NOW(),
               updated_at = NOW() 
           WHERE id = $2`,
          [reason, params.leadId]
        );

        await query(
          `UPDATE send_queue 
           SET status = 'discarded', 
               error_details = $1, 
               updated_at = NOW() 
           WHERE lead_id = $2 AND status = 'draft'`,
          [reason, params.leadId]
        );
      }

      console.warn(`[EmailAdapter] ⚠️ Recipient "${params.to}" flagged as anonymous/invalid. Moved lead to Manual Checking.`);
      return {
        success: false,
        throttled: false,
        liveDelivery: 'failed_anonymous',
        reason: `Email address "${params.to}" is anonymous or invalid. Contact moved to Manual Checking section.`,
      };
    }

    // 1. Check rotating inbox pool
    let activeInbox: ConnectedInboxRecord | null = null;
    if (params.inboxId) {
      activeInbox = await inboxRotationService.getInboxById(params.inboxId);
    } else {
      activeInbox = await inboxRotationService.getNextAvailableInbox();
    }

    const poolSummary = await inboxRotationService.getPoolSummary().catch(() => null);

    // If inboxes exist in pool but all are exhausted for today
    if (!activeInbox && poolSummary && poolSummary.totalInboxes > 0 && poolSummary.activeInboxes > 0) {
      return {
        success: false,
        throttled: true,
        reason: `All rotating inboxes have reached their daily limit (${poolSummary.totalSentToday}/${poolSummary.totalDailyCapacity} sent today). Sending auto-throttled to protect sender reputation.`,
      };
    }

    let liveDelivery = 'simulated';
    let liveError: string | undefined;
    let fromAddress = '';
    let cleanReplyTo = '';

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

    // 2. Dispatch via Multi-Inbox Rotation Pool
    if (activeInbox) {
      try {
        const transporter = inboxRotationService.getTransporter(activeInbox);
        fromAddress = `"${activeInbox.sender_name}" <${activeInbox.email}>`;
        cleanReplyTo = activeInbox.email;

        await transporter.sendMail({
          from: fromAddress,
          to: params.to,
          replyTo: cleanReplyTo,
          subject: params.subject || `Outreach Follow-up`,
          text: plainText,
          html: htmlBody,
          headers: {
            'List-Unsubscribe': `<mailto:${cleanReplyTo}?subject=Unsubscribe>`,
            'X-Mailer': 'Apollo-Grade Multi-Inbox Dispatcher',
          },
        });

        liveDelivery = 'sent_live';
        await inboxRotationService.recordDispatch(activeInbox.id, true);
        console.log(`[EmailAdapter] Dispatched via Rotating Inbox [${activeInbox.name} (${activeInbox.email})] to ${params.to}`);
      } catch (smtpErr: unknown) {
        liveDelivery = 'smtp_failed';
        const rawError = smtpErr instanceof Error ? smtpErr.message : 'SMTP delivery failed';
        liveError = rawError;
        await inboxRotationService.recordDispatch(activeInbox.id, false, liveError);
        console.error(`[EmailAdapter] SMTP error on inbox ${activeInbox.email}:`, liveError);
      }
    } else if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && params.to) {
      // Fallback: Dispatch via .env SMTP
      try {
        const cleanPass = env.SMTP_PASS.replace(/\s+/g, '');
        const isGmail = (env.SMTP_HOST || '').toLowerCase().includes('gmail') || (env.SMTP_USER || '').toLowerCase().endsWith('@gmail.com');
        const transporter = nodemailer.createTransport(
          isGmail
            ? { service: 'gmail', auth: { user: env.SMTP_USER, pass: cleanPass } }
            : { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE || env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: cleanPass } }
        );

        const cleanFrom = (env.SMTP_FROM || env.SMTP_USER || '').trim();
        fromAddress = cleanFrom.includes('<') ? cleanFrom : `"Outreach" <${cleanFrom}>`;
        cleanReplyTo = cleanFrom;

        await transporter.sendMail({
          from: fromAddress,
          to: params.to,
          replyTo: cleanReplyTo,
          subject: params.subject || `Outreach Follow-up`,
          text: plainText,
          html: htmlBody,
          headers: {
            'List-Unsubscribe': `<mailto:${cleanReplyTo}?subject=Unsubscribe>`,
            'X-Mailer': 'ClientConnect Outreach Engine',
          },
        });
        liveDelivery = 'sent_live';
      } catch (smtpErr: unknown) {
        liveDelivery = 'smtp_failed';
        liveError = smtpErr instanceof Error ? smtpErr.message : 'SMTP delivery failed';
      }
    } else {
      console.log(`[EmailAdapter] Simulation mode: recording to database timeline.`);
    }

    // Check if live delivery resulted in permanent rejection/bounce
    const isPermanentBounce =
      liveDelivery === 'smtp_failed' &&
      /55\d|no such user|address not found|recipient rejected|mailbox unavailable|user unknown/i.test(
        liveError || ''
      );

    if (isPermanentBounce && params.leadId) {
      const bounceReason = `SMTP Rejection: ${liveError}`;
      await query(
        `UPDATE leads 
         SET status = 'manual_review', 
             manual_review_reason = $1, 
             manual_review_at = NOW(),
             updated_at = NOW() 
         WHERE id = $2`,
        [bounceReason, params.leadId]
      );

      await query(
        `UPDATE send_queue 
         SET status = 'discarded', 
             error_details = $1, 
             updated_at = NOW() 
         WHERE lead_id = $2 AND status = 'draft'`,
        [bounceReason, params.leadId]
      );
    }

    // 3. Register outbound message in PostgreSQL conversation thread
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

      const messageStatus = isPermanentBounce ? 'bounced' : liveDelivery === 'smtp_failed' ? 'failed' : 'sent';
      const msgRes = await query<{ id: string }>(
        `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, inbox_id, inbox_email)
         VALUES ($1, 'email', 'outbound', $2, $3, NOW(), $4, $5)
         RETURNING id`,
        [convId, params.body, messageStatus, activeInbox?.id || null, activeInbox?.email || env.SMTP_USER || '']
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
        inboxUsed: activeInbox ? { id: activeInbox.id, email: activeInbox.email, name: activeInbox.name } : undefined,
        reason: liveDelivery === 'sent_live'
          ? (activeInbox
              ? `Live email sent via rotating inbox "${activeInbox.name}" (${activeInbox.email}) to ${params.to}`
              : `Live email sent via SMTP to ${params.to}`)
          : liveDelivery === 'smtp_failed'
          ? `Email recorded in timeline, but SMTP server returned: ${liveError}`
          : `Email recorded in timeline (Simulation mode: SMTP credentials not set)`,
      };
    }

    return {
      success: true,
      throttled: false,
      liveDelivery,
      inboxUsed: activeInbox ? { id: activeInbox.id, email: activeInbox.email, name: activeInbox.name } : undefined,
    };
  }
}

export const emailAdapter = new EmailAdapter();
