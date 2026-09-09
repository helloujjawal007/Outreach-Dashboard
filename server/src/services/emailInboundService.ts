import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { query } from '../config/db';

export interface InboundEmailResult {
  syncedCount: number;
  newReplies: Array<{
    senderEmail: string;
    businessName: string;
    text: string;
    subject: string;
    entityType: 'lead' | 'client';
    entityId: string;
  }>;
  bouncesRecorded: number;
  message: string;
}

export class EmailInboundService {
  private isSyncing = false;
  private pollIntervalTimer: NodeJS.Timeout | null = null;

  private readonly STOP_KEYWORDS = [
    'unsubscribe',
    'stop',
    'remove',
    'opt out',
    'opt-out',
    'cancel',
    'quit',
    'dont message',
    "don't message",
    'do not contact',
    'leave me alone',
    'not interested',
    'wrong person',
    'take me off',
  ];

  /**
   * Cleans quoted text from reply body to extract only the recipient's new message
   */
  private extractCleanReply(text: string): string {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    const cleanLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Stop at reply quote indicators
      if (
        trimmed.startsWith('>') ||
        /^on\s.+wrote:?/i.test(trimmed) ||
        /^on\s.+at\s.+/i.test(trimmed) ||
        trimmed.startsWith('-----Original Message-----') ||
        trimmed.startsWith('From: ') ||
        /^wrote:$/i.test(trimmed) ||
        /<.+@.+\..+>\s*wrote:?/i.test(trimmed)
      ) {
        break;
      }
      cleanLines.push(line);
    }

    const result = cleanLines.join('\n').trim();
    return result || text.trim();
  }

  /**
   * Connects to Gmail IMAP and synchronizes new inbound emails
   */
  async syncInboundEmails(): Promise<InboundEmailResult> {
    if (this.isSyncing) {
      return {
        syncedCount: 0,
        newReplies: [],
        bouncesRecorded: 0,
        message: 'Sync is already in progress',
      };
    }

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';
    const host = process.env.IMAP_HOST || 'imap.gmail.com';
    const port = parseInt(process.env.IMAP_PORT || '993', 10);

    if (!user || !pass) {
      return {
        syncedCount: 0,
        newReplies: [],
        bouncesRecorded: 0,
        message: 'SMTP_USER or SMTP_PASS not configured for IMAP synchronization',
      };
    }

    this.isSyncing = true;
    const newReplies: InboundEmailResult['newReplies'] = [];
    let bouncesRecorded = 0;

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const totalExists = client.mailbox?.exists || 0;
        if (totalExists === 0) {
          return {
            syncedCount: 0,
            newReplies: [],
            bouncesRecorded: 0,
            message: 'INBOX is empty',
          };
        }

        // Fetch up to the last 40 messages to catch recent replies
        const startSeq = Math.max(1, totalExists - 40);
        const fetchRange = `${startSeq}:*`;

        for await (const message of client.fetch(fetchRange, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          try {
            const parsed = await simpleParser(message.source);
            const messageId =
              parsed.messageId ||
              message.envelope?.messageId ||
              `${message.uid}_${message.envelope?.date?.getTime() || Date.now()}@imap.gmail.com`;

            // Check if already processed
            const checkRes = await query(
              `SELECT id FROM processed_inbound_emails WHERE message_id = $1 LIMIT 1`,
              [messageId]
            );
            if (checkRes.rows.length > 0) {
              continue;
            }

            const senderAddress =
              parsed.from?.value?.[0]?.address?.toLowerCase().trim() ||
              message.envelope?.from?.[0]?.address?.toLowerCase().trim() ||
              '';

            // Ignore messages sent by ourselves
            if (senderAddress === user.toLowerCase().trim()) {
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, processed_at)
                 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || '']
              );
              continue;
            }

            // Check for delivery failure / bounce notifications
            const isBounce =
              senderAddress.includes('mailer-daemon') ||
              senderAddress.includes('postmaster') ||
              (parsed.subject && parsed.subject.toLowerCase().includes('delivery status notification'));

            if (isBounce) {
              // Track bounce in daily_send_metrics
              await query(
                `INSERT INTO daily_send_metrics (metric_date, channel, bounced_count, updated_at)
                 VALUES (CURRENT_DATE, 'email', 1, NOW())
                 ON CONFLICT (metric_date, channel)
                 DO UPDATE SET bounced_count = daily_send_metrics.bounced_count + 1, updated_at = NOW()`
              );
              await query(
                `INSERT INTO daily_send_metrics (metric_date, channel, bounced_count, updated_at)
                 VALUES (CURRENT_DATE, 'total', 1, NOW())
                 ON CONFLICT (metric_date, channel)
                 DO UPDATE SET bounced_count = daily_send_metrics.bounced_count + 1, updated_at = NOW()`
              );
              bouncesRecorded++;

              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, processed_at)
                 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || 'Delivery Status Notification']
              );
              continue;
            }

            // Look up matching Lead in PostgreSQL
            const leadRes = await query<{
              id: string;
              business_name: string;
              email: string;
              consent_status: string;
              status: string;
            }>(
              `SELECT id, business_name, email, consent_status, status
               FROM leads
               WHERE deleted_at IS NULL AND LOWER(email) = LOWER($1)
               ORDER BY last_contacted_at DESC NULLS LAST, created_at DESC
               LIMIT 1`,
              [senderAddress]
            );

            // Look up matching Client in PostgreSQL
            const clientRes = await query<{
              id: string;
              business_name: string;
              email: string;
              status: string;
            }>(
              `SELECT id, business_name, email, status
               FROM clients
               WHERE deleted_at IS NULL AND LOWER(email) = LOWER($1)
               ORDER BY updated_at DESC
               LIMIT 1`,
              [senderAddress]
            );

            const rawText = parsed.text || '';
            const cleanText = this.extractCleanReply(rawText);
            const finalReplyText = cleanText || rawText || '(Empty email reply)';
            const emailDate = parsed.date || new Date();

            if (leadRes.rows.length > 0) {
              const matchedLead = leadRes.rows[0];

              // Check for opt-out keywords
              const lowerText = finalReplyText.toLowerCase();
              const isOptOut = this.STOP_KEYWORDS.some((kw) => lowerText.includes(kw));

              if (isOptOut) {
                await query(
                  `UPDATE leads SET consent_status = 'opted_out', updated_at = NOW() WHERE id = $1`,
                  [matchedLead.id]
                );
                await query(
                  `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
                  [matchedLead.id]
                );
                console.log(`[EmailInboundService] Lead ${matchedLead.id} marked opted_out from inbound email.`);
              } else {
                await query(
                  `UPDATE leads SET consent_status = 'replied', last_contacted_at = $2, updated_at = NOW() WHERE id = $1`,
                  [matchedLead.id, emailDate]
                );
                await query(
                  `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
                  [matchedLead.id]
                );
              }

              // Locate or create conversation thread for this lead
              let convId: string;
              const convQuery = await query<{ id: string }>(
                `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'email' LIMIT 1`,
                [matchedLead.id]
              );

              if (convQuery.rows.length > 0) {
                convId = convQuery.rows[0].id;
              } else {
                const newConv = await query<{ id: string }>(
                  `INSERT INTO conversations (entity_type, lead_id, channel, status, subject, last_message_at)
                   VALUES ('lead', $1, 'email', 'open', $2, $3)
                   RETURNING id`,
                  [matchedLead.id, parsed.subject || 'Email Outreach Reply', emailDate]
                );
                convId = newConv.rows[0].id;
              }

              // Insert inbound message into messages table
              await query(
                `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, created_at)
                 VALUES ($1, 'email', 'inbound', $2, 'delivered', $3, $3)`,
                [convId, finalReplyText, emailDate]
              );

              // Update conversation thread timestamp
              await query(
                `UPDATE conversations SET last_message_at = $1, status = 'open' WHERE id = $2`,
                [emailDate, convId]
              );

              newReplies.push({
                senderEmail: senderAddress,
                businessName: matchedLead.business_name,
                text: finalReplyText,
                subject: parsed.subject || 'Email Reply',
                entityType: 'lead',
                entityId: matchedLead.id,
              });

              // Mark email as processed
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, matched_entity_type, matched_entity_id, processed_at)
                 VALUES ($1, $2, $3, $4, 'lead', $5, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || '', matchedLead.id]
              );

              console.log(`[EmailInboundService] Recorded email reply from ${senderAddress} to Lead "${matchedLead.business_name}".`);
            } else if (clientRes.rows.length > 0) {
              const matchedClient = clientRes.rows[0];

              // Locate or create conversation thread for this client
              let convId: string;
              const convQuery = await query<{ id: string }>(
                `SELECT id FROM conversations WHERE entity_type = 'client' AND client_id = $1 AND channel = 'email' LIMIT 1`,
                [matchedClient.id]
              );

              if (convQuery.rows.length > 0) {
                convId = convQuery.rows[0].id;
              } else {
                const newConv = await query<{ id: string }>(
                  `INSERT INTO conversations (entity_type, client_id, channel, status, subject, last_message_at)
                   VALUES ('client', $1, 'email', 'open', $2, $3)
                   RETURNING id`,
                  [matchedClient.id, parsed.subject || 'Client Email Reply', emailDate]
                );
                convId = newConv.rows[0].id;
              }

              // Insert inbound message
              await query(
                `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, created_at)
                 VALUES ($1, 'email', 'inbound', $2, 'delivered', $3, $3)`,
                [convId, finalReplyText, emailDate]
              );

              await query(
                `UPDATE conversations SET last_message_at = $1, status = 'open' WHERE id = $2`,
                [emailDate, convId]
              );
              await query(
                `UPDATE clients SET updated_at = NOW() WHERE id = $1`,
                [matchedClient.id]
              );

              newReplies.push({
                senderEmail: senderAddress,
                businessName: matchedClient.business_name,
                text: finalReplyText,
                subject: parsed.subject || 'Email Reply',
                entityType: 'client',
                entityId: matchedClient.id,
              });

              // Mark email as processed
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, matched_entity_type, matched_entity_id, processed_at)
                 VALUES ($1, $2, $3, $4, 'client', $5, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || '', matchedClient.id]
              );

              console.log(`[EmailInboundService] Recorded email reply from ${senderAddress} to Client "${matchedClient.business_name}".`);
            } else {
              // Unknown sender — mark as processed so we don't re-examine
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, processed_at)
                 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || '']
              );
            }
          } catch (itemErr) {
            console.error('[EmailInboundService] Error processing message item:', itemErr);
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (connErr) {
      console.error('[EmailInboundService] IMAP connection or sync error:', connErr);
      return {
        syncedCount: 0,
        newReplies: [],
        bouncesRecorded: 0,
        message: connErr instanceof Error ? connErr.message : 'IMAP connection failed',
      };
    } finally {
      this.isSyncing = false;
    }

    const count = newReplies.length;
    const msg =
      count > 0
        ? `Synced ${count} new email ${count === 1 ? 'reply' : 'replies'} from Gmail inbox.`
        : 'Gmail inbox checked — up to date (0 new replies).';

    return {
      syncedCount: count,
      newReplies,
      bouncesRecorded,
      message: msg,
    };
  }

  /**
   * Starts background polling for new incoming email replies
   */
  startPolling(intervalMs: number = 30000) {
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
    }

    console.log(`[EmailInboundService] Starting automated Gmail inbox sync (polling every ${intervalMs / 1000}s)...`);
    // Run an initial sync on start
    setTimeout(() => {
      this.syncInboundEmails().catch((err) =>
        console.error('[EmailInboundService] Initial sync error:', err)
      );
    }, 3000);

    this.pollIntervalTimer = setInterval(() => {
      this.syncInboundEmails().catch((err) =>
        console.error('[EmailInboundService] Background sync error:', err)
      );
    }, intervalMs);
  }

  /**
   * Stops background polling
   */
  stopPolling() {
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
    }
  }
}

export const emailInboundService = new EmailInboundService();
