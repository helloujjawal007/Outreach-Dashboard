import { Router, Request, Response } from 'express';
import validator from 'validator';
import { suppressionService } from '../services/suppressionService';
import { query } from '../config/db';

export const unsubscribeRouter = Router();

function renderUnsubscribeHtml(title: string, message: string, email?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Cloud Consultancy</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #ffffff;
      max-width: 480px;
      width: 100%;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      padding: 32px 28px;
      text-align: center;
    }
    .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: #e0f2fe;
      color: #0284c7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 12px;
      color: #0f172a;
    }
    p {
      font-size: 14px;
      color: #64748b;
      line-height: 1.5;
      margin: 0 0 24px;
    }
    .email-badge {
      display: inline-block;
      background: #f1f5f9;
      padding: 4px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
      color: #334155;
      margin-bottom: 16px;
    }
    .footer {
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>${title}</h1>
    ${email ? `<div class="email-badge">${email}</div>` : ''}
    <p>${message}</p>
    <div class="footer">Cloud Consultancy &bull; Outreach & Communications</div>
  </div>
</body>
</html>`;
}

// GET /api/unsubscribe or /unsubscribe
unsubscribeRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const emailParam = typeof req.query.email === 'string' ? req.query.email.trim() : '';
  const tokenParam = typeof req.query.t === 'string' ? req.query.t.trim() : '';
  const leadIdParam = typeof req.query.leadId === 'string' ? req.query.leadId.trim() : '';

  let targetEmail = emailParam;
  if (!targetEmail && tokenParam) {
    try {
      const decoded = Buffer.from(tokenParam, 'base64url').toString('utf8');
      if (validator.isEmail(decoded)) {
        targetEmail = decoded;
      }
    } catch {}
  }

  if (!targetEmail && leadIdParam) {
    try {
      const leadRes = await query<{ email: string }>(`SELECT email FROM leads WHERE id = $1`, [leadIdParam]);
      if (leadRes.rows.length > 0 && leadRes.rows[0].email) {
        targetEmail = leadRes.rows[0].email;
      }
    } catch {}
  }

  if (!targetEmail || !validator.isEmail(targetEmail)) {
    res.status(400).send(renderUnsubscribeHtml('Unsubscribe', 'Please provide a valid email address to unsubscribe.'));
    return;
  }

  try {
    await suppressionService.suppress({
      email: targetEmail,
      reason: 'Recipient unsubscribed via web link',
      source: 'web_link',
    });

    // Ensure lead status is updated to opted_out
    await query(
      `UPDATE leads 
       SET consent_status = 'opted_out', 
           status = CASE WHEN status = 'active' THEN 'inactive' ELSE status END,
           updated_at = NOW() 
       WHERE LOWER(email) = LOWER($1)`,
      [targetEmail]
    );

    if (req.headers.accept?.includes('application/json')) {
      res.json({ success: true, message: `Successfully unsubscribed ${targetEmail}` });
      return;
    }

    res.send(
      renderUnsubscribeHtml(
        'Unsubscribe Successful',
        'You have been unsubscribed from all future outreach and notifications. Please allow up to 24 hours for all queued systems to clear.',
        targetEmail
      )
    );
  } catch (err: any) {
    console.error('[Unsubscribe Router Error]', err);
    res.status(500).send(renderUnsubscribeHtml('Error', 'Unable to process unsubscribe request. Please try again.'));
  }
});

// POST /api/unsubscribe
unsubscribeRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : (typeof req.query.email === 'string' ? req.query.email.trim() : '');

  if (!email || !validator.isEmail(email)) {
    res.status(400).json({ success: false, error: 'Valid email address is required' });
    return;
  }

  try {
    await suppressionService.suppress({
      email,
      reason: 'Recipient unsubscribed via web link',
      source: 'web_link',
    });

    await query(
      `UPDATE leads 
       SET consent_status = 'opted_out', 
           status = CASE WHEN status = 'active' THEN 'inactive' ELSE status END,
           updated_at = NOW() 
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    res.json({
      success: true,
      message: `Successfully unsubscribed ${email} from all outreach communications.`,
    });
  } catch (err: any) {
    console.error('[Unsubscribe POST Error]', err);
    res.status(500).json({ success: false, error: 'Failed to process unsubscribe request' });
  }
});

