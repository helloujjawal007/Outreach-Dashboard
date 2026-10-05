import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { env } from '../config/env';
import { inboxRotationService } from './inboxRotationService';

export interface AppendSentEmailParams {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inboxEmail?: string;
  inboxId?: string;
}

export class EmailSentSyncService {
  /**
   * Appends an outbound email directly into the IMAP 'Sent' / '[Gmail]/Sent Mail' folder
   * so it is immediately visible in the user's Gmail web and mobile clients.
   */
  async appendSentEmail(params: AppendSentEmailParams): Promise<boolean> {
    try {
      let host = env.IMAP_HOST || 'imap.gmail.com';
      let port = env.IMAP_PORT || 993;
      let user = (params.inboxEmail || env.SMTP_USER || '').trim();
      let pass = (env.SMTP_PASS || '').replace(/\s+/g, '');

      // Check if an active inbox record with credentials exists in the database
      if (params.inboxId || params.inboxEmail) {
        const inboxes = await inboxRotationService.getAllInboxes().catch(() => []);
        const matched = inboxes.find(
          (ib) => (params.inboxId && ib.id === params.inboxId) || (params.inboxEmail && ib.email.toLowerCase() === params.inboxEmail.toLowerCase())
        );

        if (matched) {
          user = matched.smtp_user || matched.email;
          pass = (matched.smtp_pass || pass).replace(/\s+/g, '');
          if (matched.provider === 'google_workspace' || matched.smtp_host.includes('gmail')) {
            host = 'imap.gmail.com';
            port = 993;
          }
        }
      }

      if (!user || !pass) {
        console.warn('[EmailSentSyncService] No credentials available to sync Sent Mail to IMAP.');
        return false;
      }

      const client = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user, pass },
        logger: false,
      });

      await client.connect();

      // Find the Sent Mail mailbox
      const mailboxes = await client.list();
      const sentMailbox =
        mailboxes.find((m) => m.specialUse === '\\Sent' || m.specialUse === '\\\\Sent') ||
        mailboxes.find((m) => m.path === '[Gmail]/Sent Mail') ||
        mailboxes.find((m) => /sent/i.test(m.path));

      const targetPath = sentMailbox ? sentMailbox.path : '[Gmail]/Sent Mail';

      // Compile RFC 822 MIME message buffer using MailComposer
      const composer = new MailComposer({
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text || '',
        html: params.html || undefined,
        headers: {
          'X-Mailer': 'Online Digital Solution Outreach Engine',
        },
      });

      const rawBuffer = await composer.compile().build();

      // Append with \Seen flag so it shows as read in Sent Mail
      await client.append(targetPath, rawBuffer, ['\\Seen']);
      console.log(`[EmailSentSyncService] ✅ Synced sent email to "${targetPath}" for ${params.to} (${user})`);

      await client.logout();
      return true;
    } catch (err: any) {
      console.warn(`[EmailSentSyncService] Failed to append sent message to IMAP Sent Mail:`, err?.message || err);
      return false;
    }
  }
}

export const emailSentSyncService = new EmailSentSyncService();
