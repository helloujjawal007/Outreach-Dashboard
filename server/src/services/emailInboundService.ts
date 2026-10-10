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
   * Extracts the failed recipient email address from delivery failure notification text and headers
   */
  private extractBouncedRecipient(
    rawBody: string,
    parsed: any,
    myEmail: string
  ): { email: string | null; reason: string } {
    const text = rawBody || '';
    let reason = 'Delivery Bounced: Address could not be found or rejected by recipient server.';

    // 1. Try X-Failed-Recipients header if present
    const failedHeader = parsed?.headers?.get('x-failed-recipients');
    if (failedHeader && typeof failedHeader === 'string') {
      const match = failedHeader.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (match) {
        return { email: match[0].toLowerCase().trim(), reason };
      }
    }

    // 2. Extract error response code/message if present
    const responseMatch =
      text.match(/(55\d\s+[0-9.]+\s+[^\r\n]+)/i) ||
      text.match(/The response was:\s*[\r\n]+(55\d[^\r\n]+)/i) ||
      text.match(/(address not found[^\r\n]*)/i);
    if (responseMatch) {
      reason = `Delivery Bounced: ${responseMatch[1].trim()}`;
    }

    // 3. Search for common delivery failure patterns in body
    const pattern1 = text.match(
      /(?:wasn't delivered to|not delivered to|failed to deliver to|could not be delivered to)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
    );
    if (pattern1 && pattern1[1]) {
      return { email: pattern1[1].toLowerCase().trim(), reason };
    }

    const pattern2 = text.match(
      /final-recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
    );
    if (pattern2 && pattern2[1]) {
      return { email: pattern2[1].toLowerCase().trim(), reason };
    }

    const pattern3 = text.match(/(?:to\s+<)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i);
    if (pattern3 && pattern3[1]) {
      return { email: pattern3[1].toLowerCase().trim(), reason };
    }

    // 4. Scan all emails in text, excluding sender daemon, own email, and Google internal domains
    const allEmails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const filtered = allEmails
      .map((e) => e.toLowerCase().trim())
      .filter((e) => {
        if (e === myEmail.toLowerCase().trim()) return false;
        if (e.includes('mailer-daemon')) return false;
        if (e.includes('postmaster')) return false;
        if (e.includes('@google.com') || e.includes('@googlemail.com')) return false;
        if (e.endsWith('@mx.google.com')) return false;
        if (e.includes('support.google.com')) return false;
        return true;
      });

    if (filtered.length > 0) {
      return { email: filtered[0], reason };
    }

    return { email: null, reason };
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

    // Prevent unhandled EventEmitter errors from crashing Node process on network drops / idle resets
    client.on('error', (err) => {
      console.warn('[EmailInboundService] IMAP socket event warning (handled):', err?.message || err);
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const totalExists = (client.mailbox && typeof client.mailbox === 'object') ? client.mailbox.exists : 0;
        if (totalExists === 0) {
          return {
            syncedCount: 0,
            newReplies: [],
            bouncesRecorded: 0,
            message: 'INBOX is empty',
          };
        }

        // Fetch up to the last 40 messages to catch recent replies and bounces
        const startSeq = Math.max(1, totalExists - 40);
        const fetchRange = `${startSeq}:*`;

        for await (const message of client.fetch(fetchRange, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          try {
            if (!message.source) continue;
            const parsed = await simpleParser(message.source);
            const messageId =
              parsed.messageId ||
              message.envelope?.messageId ||
              `${message.uid}_${new Date(message.envelope?.date || Date.now()).getTime()}@imap.gmail.com`;

            // Check if already processed
            const checkRes = await query<{
              id: string;
              matched_entity_id: string | null;
            }>(
              `SELECT id, matched_entity_id FROM processed_inbound_emails WHERE message_id = $1 LIMIT 1`,
              [messageId]
            );

            const senderAddress =
              parsed.from?.value?.[0]?.address?.toLowerCase().trim() ||
              message.envelope?.from?.[0]?.address?.toLowerCase().trim() ||
              '';

            const lowerSubject = (parsed.subject || '').toLowerCase();
            const rawBody = parsed.text || '';
            const lowerBody = rawBody.toLowerCase();

            // Check for delivery failure / bounce notifications
            const isBounce =
              senderAddress.includes('mailer-daemon') ||
              senderAddress.includes('postmaster') ||
              lowerSubject.includes('delivery status notification') ||
              lowerSubject.includes('address not found') ||
              lowerSubject.includes('undelivered mail') ||
              lowerSubject.includes('failure notice') ||
              lowerSubject.includes('returned mail') ||
              lowerBody.includes('address not found') ||
              lowerBody.includes('message wasn\'t delivered') ||
              lowerBody.includes('the email account that you tried to reach does not exist');

            // If already processed AND already matched to a lead, skip
            if (checkRes.rows.length > 0 && (checkRes.rows[0].matched_entity_id || !isBounce)) {
              continue;
            }

            // Ignore messages sent by ourselves
            if (senderAddress === user.toLowerCase().trim()) {
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, processed_at)
                 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || '']
              );
              continue;
            }

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

              // Extract which recipient bounced from the body/headers
              const { email: bouncedRecipient, reason: bounceReason } = this.extractBouncedRecipient(
                rawBody,
                parsed,
                user
              );
              let matchedLeadId: string | null = null;
              let matchedClientId: string | null = null;

              if (bouncedRecipient) {
                // Find matching lead in PostgreSQL
                const leadMatch = await query<{ id: string; business_name: string; email: string }>(
                  `SELECT id, business_name, email 
                   FROM leads 
                   WHERE deleted_at IS NULL AND LOWER(email) = LOWER($1) 
                   LIMIT 1`,
                  [bouncedRecipient]
                );

                if (leadMatch.rows.length > 0) {
                  matchedLeadId = leadMatch.rows[0].id;

                  // Move lead to manual_review status with explicit reason
                  await query(
                    `UPDATE leads 
                     SET status = 'manual_review', 
                         manual_review_reason = $1, 
                         manual_review_at = NOW(),
                         updated_at = NOW() 
                     WHERE id = $2`,
                    [bounceReason, matchedLeadId]
                  );

                  // Cancel/discard pending queue items so cold sender stops retrying
                  await query(
                    `UPDATE send_queue 
                     SET status = 'discarded', 
                         error_details = $1, 
                         updated_at = NOW() 
                     WHERE lead_id = $2 AND status = 'draft'`,
                    [bounceReason, matchedLeadId]
                  );

                  // Add delivery failure record to conversation thread
                  let convId: string;
                  const convRes = await query<{ id: string }>(
                    `SELECT id FROM conversations WHERE entity_type = 'lead' AND lead_id = $1 AND channel = 'email' LIMIT 1`,
                    [matchedLeadId]
                  );

                  if (convRes.rows.length > 0) {
                    convId = convRes.rows[0].id;
                  } else {
                    const newConv = await query<{ id: string }>(
                      `INSERT INTO conversations (entity_type, lead_id, channel, status, subject, last_message_at)
                       VALUES ('lead', $1, 'email', 'open', 'Delivery Status Notification (Failure)', NOW()) RETURNING id`,
                      [matchedLeadId]
                    );
                    convId = newConv.rows[0].id;
                  }

                  await query(
                    `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, created_at)
                     VALUES ($1, 'email', 'inbound', $2, 'bounced', NOW(), NOW())`,
                    [
                      convId,
                      `[DELIVERY FAILURE / BOUNCED] ${bounceReason}\nRecipient: ${bouncedRecipient}\nSubject: ${parsed.subject || 'Delivery Status Notification'}`
                    ]
                  );

                  console.log(
                    `[EmailInboundService] ⚠️ MOVED LEAD "${leadMatch.rows[0].business_name}" (${bouncedRecipient}) to Manual Checking. Reason: ${bounceReason}`
                  );
                } else {
                  // Check if it matches a client
                  const clientMatch = await query<{ id: string; business_name: string }>(
                    `SELECT id, business_name FROM clients WHERE deleted_at IS NULL AND LOWER(email) = LOWER($1) LIMIT 1`,
                    [bouncedRecipient]
                  );
                  if (clientMatch.rows.length > 0) {
                    matchedClientId = clientMatch.rows[0].id;
                    await query(
                      `UPDATE clients SET status = 'paused', notes = COALESCE(notes || ' | ', '') || $1, updated_at = NOW() WHERE id = $2`,
                      [bounceReason, matchedClientId]
                    );
                    console.log(`[EmailInboundService] ⚠️ Client "${clientMatch.rows[0].business_name}" paused due to delivery bounce.`);
                  }
                }
              }

              // Update processed_inbound_emails with matched lead/client
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, matched_entity_type, matched_entity_id, is_unmatched, raw_snippet, processed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) 
                 ON CONFLICT (message_id) 
                 DO UPDATE SET matched_entity_type = EXCLUDED.matched_entity_type, 
                               matched_entity_id = EXCLUDED.matched_entity_id, 
                               is_unmatched = EXCLUDED.is_unmatched, 
                               raw_snippet = EXCLUDED.raw_snippet`,
                [
                  messageId,
                  message.uid,
                  senderAddress,
                  parsed.subject || 'Delivery Status Notification',
                  matchedLeadId ? 'lead' : matchedClientId ? 'client' : null,
                  matchedLeadId || matchedClientId || null,
                  !matchedLeadId && !matchedClientId,
                  rawBody.slice(0, 400),
                ]
              );
              continue;
            }

            // Check for automated robot auto-responders, out-of-office, and unmonitored inboxes
            const autoSubmittedHeader = String(parsed.headers.get('auto-submitted') || '').toLowerCase();
            const xAutoReplyHeader = String(parsed.headers.get('x-autoreply') || '').toLowerCase();
            const isAutoResponder =
              autoSubmittedHeader.includes('auto-replied') ||
              autoSubmittedHeader.includes('auto-generated') ||
              xAutoReplyHeader === 'yes' ||
              lowerSubject.includes('automatic reply') ||
              lowerSubject.includes('auto reply') ||
              lowerSubject.includes('auto-reply') ||
              lowerSubject.includes('autoreply') ||
              lowerSubject.includes('out of office') ||
              lowerSubject.includes('not monitored') ||
              lowerSubject.includes('no longer monitored') ||
              lowerSubject.includes('vacation response') ||
              lowerSubject.includes('automated response') ||
              lowerBody.includes('no longer monitored') ||
              lowerBody.includes('not monitored') ||
              lowerBody.includes('this is an automated response') ||
              lowerBody.includes('i am currently out of the office') ||
              lowerBody.includes('i am away from the office') ||
              senderAddress.startsWith('noreply') ||
              senderAddress.startsWith('no-reply') ||
              senderAddress.startsWith('donotreply');

            if (isAutoResponder) {
              console.log(`[EmailInboundService] Ignored automated auto-reply from ${senderAddress}: "${parsed.subject}"`);
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, processed_at)
                 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (message_id) DO NOTHING`,
                [messageId, message.uid, senderAddress, parsed.subject || 'Automated Reply']
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
                await query(
                  `UPDATE scheduled_dispatches
                   SET status = 'cancelled', error_message = 'Cancelled: Prospect opted out via inbound email', updated_at = NOW()
                   WHERE (lead_id = $1 OR LOWER(recipient_email) = LOWER($2)) AND status IN ('scheduled', 'processing')`,
                  [matchedLead.id, senderAddress]
                );
                console.log(`[EmailInboundService] Lead ${matchedLead.id} marked opted_out. Cancelled all pending scheduled dispatches.`);
              } else {
                await query(
                  `UPDATE leads SET consent_status = 'replied', last_contacted_at = $2, updated_at = NOW() WHERE id = $1`,
                  [matchedLead.id, emailDate]
                );
                await query(
                  `UPDATE send_queue SET status = 'discarded', updated_at = NOW() WHERE lead_id = $1 AND status = 'draft'`,
                  [matchedLead.id]
                );
                await query(
                  `UPDATE scheduled_dispatches
                   SET status = 'cancelled', error_message = 'Cancelled: Prospect replied to outreach email', updated_at = NOW()
                   WHERE (lead_id = $1 OR LOWER(recipient_email) = LOWER($2)) AND status IN ('scheduled', 'processing')`,
                  [matchedLead.id, senderAddress]
                );
                console.log(`[EmailInboundService] Lead ${matchedLead.id} replied. Cancelled all pending follow-up scheduled dispatches.`);
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
              const msgInsertRes = await query<{ id: string }>(
                `INSERT INTO messages (conversation_id, channel, direction, text, status, sent_at, created_at)
                 VALUES ($1, 'email', 'inbound', $2, 'delivered', $3, $3) RETURNING id`,
                [convId, finalReplyText, emailDate]
              );
              const insertedMsgId = msgInsertRes.rows[0]?.id;

              // Update conversation thread timestamp
              await query(
                `UPDATE conversations SET last_message_at = $1, status = 'open' WHERE id = $2`,
                [emailDate, convId]
              );

              // Extreme Automation: Trigger Autonomous Inbound Agent (Sentiment, Auto-Draft & Hot Lead Auto-Conversion)
              try {
                const { autonomousInboundAgent } = await import('./autonomousInboundAgent');
                await autonomousInboundAgent.processInboundMessage({
                  messageId: insertedMsgId,
                  conversationId: convId,
                  entityType: 'lead',
                  entityId: matchedLead.id,
                  senderEmail: senderAddress,
                  subject: parsed.subject || 'Email Reply',
                  replyText: finalReplyText,
                });
              } catch (agentErr) {
                console.error('[EmailInboundService] Inbound agent processing warning:', agentErr);
              }

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
              // Unknown sender — mark as unmatched so it appears in the Manual Review queue
              await query(
                `INSERT INTO processed_inbound_emails (message_id, uid, sender_email, subject, is_unmatched, raw_snippet, processed_at)
                 VALUES ($1, $2, $3, $4, true, $5, NOW()) 
                 ON CONFLICT (message_id) 
                 DO UPDATE SET is_unmatched = true, raw_snippet = EXCLUDED.raw_snippet`,
                [messageId, message.uid, senderAddress, parsed.subject || '', (parsed.text || '').slice(0, 400)]
              );
              console.log(`[EmailInboundService] Inbound email from unmatched sender ${senderAddress} logged for Manual Review.`);
            }
          } catch (itemErr) {
            console.error('[EmailInboundService] Error processing message item:', itemErr);
          }
        }
      } finally {
        try {
          lock.release();
        } catch (_lockErr) {
          // Ignore lock release error if connection already dropped
        }
      }

      try {
        if (client.usable) {
          await client.logout();
        } else {
          client.close();
        }
      } catch (_logoutErr) {
        // Ignore logout error if socket was closed/reset
      }
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
      try {
        if (client.usable) {
          client.close();
        }
      } catch (_closeErr) {
        // Safe closure
      }
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
   * Retrieves all unmatched or bounced emails for manual checking / review
   */
  async getUnmatchedInboundEmails(): Promise<
    Array<{
      id: string;
      messageId: string;
      senderEmail: string;
      subject: string;
      snippet: string;
      processedAt: string;
      isBounce: boolean;
    }>
  > {
    const res = await query<{
      id: string;
      message_id: string;
      sender_email: string;
      subject: string;
      raw_snippet: string;
      processed_at: string;
    }>(`
      SELECT id, message_id, sender_email, subject, raw_snippet, processed_at
      FROM processed_inbound_emails
      WHERE is_unmatched = true OR (matched_entity_id IS NULL AND sender_email != '')
      ORDER BY processed_at DESC
      LIMIT 100
    `);

    return res.rows.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      senderEmail: row.sender_email,
      subject: row.subject,
      snippet: row.raw_snippet || '',
      processedAt: row.processed_at,
      isBounce:
        (row.sender_email || '').includes('mailer-daemon') ||
        (row.subject || '').toLowerCase().includes('failure') ||
        (row.subject || '').toLowerCase().includes('delivery status notification'),
    }));
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
