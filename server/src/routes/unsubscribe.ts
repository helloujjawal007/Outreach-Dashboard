import { Router, Request, Response } from 'express';
import validator from 'validator';
import { suppressionService } from '../services/suppressionService';
import { query } from '../config/db';
import { verifyUnsubscribeToken } from '../utils/tokenSigner';

export const unsubscribeRouter = Router();

function renderPageHtml(title: string, contentHtml: string): string {
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
      width: 52px;
      height: 52px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: #e0f2fe;
      color: #0284c7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      font-weight: 700;
    }
    .icon.success {
      background: #dcfce7;
      color: #16a34a;
    }
    .icon.error {
      background: #fee2e2;
      color: #dc2626;
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
      padding: 6px 14px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
      color: #334155;
      margin-bottom: 20px;
    }
    .btn-submit {
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease-in-out;
    }
    .btn-submit:hover {
      background: #0369a1;
    }
    .footer {
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 16px;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="card">
    ${contentHtml}
    <div class="footer">Cloud Consultancy &bull; Outreach & Communications</div>
  </div>
</body>
</html>`;
}

// GET /api/unsubscribe
// Renders confirmation page without automatically opting out on GET
// (protects against email security bots that pre-fetch incoming links)
unsubscribeRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const tokenParam = typeof req.query.token === 'string' ? req.query.token.trim() : (typeof req.query.t === 'string' ? req.query.t.trim() : '');
  const emailParam = typeof req.query.email === 'string' ? req.query.email.trim() : '';

  let targetEmail = '';
  const validToken = tokenParam;

  if (tokenParam) {
    const verified = verifyUnsubscribeToken(tokenParam);
    if (verified.valid && verified.email) {
      targetEmail = verified.email;
    } else {
      res.status(400).send(
        renderPageHtml(
          'Invalid Link',
          `<div class="icon error">!</div>
           <h1>Invalid or Expired Link</h1>
           <p>This unsubscribe link is invalid or has expired. Please use the original link from your email.</p>`
        )
      );
      return;
    }
  } else if (emailParam && validator.isEmail(emailParam)) {
    targetEmail = emailParam;
  } else {
    res.status(400).send(
      renderPageHtml(
        'Unsubscribe Request',
        `<div class="icon error">!</div>
         <h1>Invalid Request</h1>
         <p>No valid unsubscribe token or recipient address was provided.</p>`
      )
    );
    return;
  }

  // Render Confirmation Page with POST form
  const confirmationHtml = `
    <div class="icon">✉</div>
    <h1>Confirm Unsubscribe</h1>
    <div class="email-badge">${targetEmail}</div>
    <p>Please confirm that you would like to unsubscribe from future outreach and email communications from Cloud Consultancy.</p>
    <form method="POST" action="/api/unsubscribe">
      <input type="hidden" name="token" value="${validToken}" />
      <input type="hidden" name="email" value="${targetEmail}" />
      <button type="submit" class="btn-submit">Confirm Unsubscribe</button>
    </form>
  `;

  res.send(renderPageHtml('Confirm Unsubscribe', confirmationHtml));
});

// POST /api/unsubscribe
// Performs the actual opt-out and suppression
unsubscribeRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const tokenParam = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const emailParam = typeof req.body?.email === 'string' ? req.body.email.trim() : (typeof req.query.email === 'string' ? req.query.email.trim() : '');

  let targetEmail = '';
  let leadId = '';

  if (tokenParam) {
    const verified = verifyUnsubscribeToken(tokenParam);
    if (verified.valid && verified.email) {
      targetEmail = verified.email;
      leadId = verified.leadId || '';
    }
  }

  if (!targetEmail && emailParam && validator.isEmail(emailParam)) {
    targetEmail = emailParam;
  }

  if (!targetEmail || !validator.isEmail(targetEmail)) {
    if (req.headers.accept?.includes('application/json')) {
      res.status(400).json({ success: false, error: 'Valid signed token or email address is required' });
      return;
    }
    res.status(400).send(
      renderPageHtml(
        'Error',
        `<div class="icon error">!</div>
         <h1>Unsubscribe Failed</h1>
         <p>A valid signed token or email address is required to process your request.</p>`
      )
    );
    return;
  }

  try {
    // 1. Add to global suppression list
    await suppressionService.suppress({
      email: targetEmail,
      reason: 'Recipient unsubscribed via signed web link',
      source: 'web_link',
    });

    // 2. Update leads table: set consent_status = 'opted_out' and status = 'inactive'
    if (leadId) {
      await query(
        `UPDATE leads 
         SET consent_status = 'opted_out', 
             status = CASE WHEN status = 'active' THEN 'inactive' ELSE status END,
             updated_at = NOW() 
         WHERE id = $1`,
        [leadId]
      );
    } else {
      await query(
        `UPDATE leads 
         SET consent_status = 'opted_out', 
             status = CASE WHEN status = 'active' THEN 'inactive' ELSE status END,
             updated_at = NOW() 
         WHERE LOWER(email) = LOWER($1)`,
        [targetEmail]
      );
    }

    if (req.headers.accept?.includes('application/json')) {
      res.json({
        success: true,
        message: `Successfully unsubscribed ${targetEmail} from all outreach communications.`,
        email: targetEmail,
      });
      return;
    }

    const successHtml = `
      <div class="icon success">✓</div>
      <h1>Unsubscribe Successful</h1>
      <div class="email-badge">${targetEmail}</div>
      <p>You have been unsubscribed from all future outreach and notifications. Please allow up to 24 hours for all queued systems to clear.</p>
    `;
    res.send(renderPageHtml('Unsubscribe Successful', successHtml));
  } catch (err: any) {
    console.error('[Unsubscribe POST Error]', err);
    if (req.headers.accept?.includes('application/json')) {
      res.status(500).json({ success: false, error: 'Failed to process unsubscribe request' });
      return;
    }
    res.status(500).send(
      renderPageHtml(
        'Error',
        `<div class="icon error">!</div>
         <h1>Error Processing Request</h1>
         <p>Unable to process unsubscribe request. Please try again or contact support.</p>`
      )
    );
  }
});
