import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

async function testImap() {
  console.log('Testing Gmail IMAP connection...');
  console.log('User:', process.env.SMTP_USER);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    },
    logger: false,
  });

  try {
    await client.connect();
    console.log('✅ Connected to Gmail IMAP successfully!');

    const lock = await client.getMailboxLock('INBOX');
    try {
      console.log('✅ Acquired INBOX lock. Status:', client.mailbox);

      // Fetch the latest 5 messages
      const messages: any[] = [];
      for await (const message of client.fetch({ seq: `${Math.max(1, (client.mailbox?.exists || 1) - 4)}:*` }, {
        envelope: true,
        source: true,
      })) {
        const parsed = await simpleParser(message.source);
        messages.push({
          uid: message.uid,
          subject: parsed.subject,
          from: parsed.from?.value,
          to: parsed.to,
          text: parsed.text,
          date: parsed.date,
        });
      }

      console.log(`✅ Fetched ${messages.length} recent messages:`);
      for (const m of messages) {
        console.log('---');
        console.log('Subject:', m.subject);
        console.log('From:', JSON.stringify(m.from));
        console.log('Date:', m.date);
        console.log('Snippet:', (m.text || '').substring(0, 100));
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('✅ Logged out cleanly.');
  } catch (err) {
    console.error('❌ IMAP Test Error:', err);
  }
}

testImap();
