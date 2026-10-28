import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const activitiesRouter = Router();

export interface ActivityLogItem {
  id: string;
  lead_id: string;
  deal_id: string | null;
  actor_type: 'system' | 'user' | 'ai';
  activity_type:
    | 'email_sent'
    | 'email_reply'
    | 'whatsapp_sent'
    | 'whatsapp_reply'
    | 'website_form'
    | 'audit_generated'
    | 'stage_change'
    | 'note_added'
    | 'deal_created'
    | 'call_logged'
    | 'meeting_scheduled';
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

/**
 * GET /api/activities/by-lead/:leadId
 * Returns unified chronological timeline of all touches, notes, and audits for a lead
 */
activitiesRouter.get('/by-lead/:leadId', async (req: Request, res: Response) => {
  try {
    const leadId = String(Array.isArray(req.params.leadId) ? req.params.leadId[0] : req.params.leadId);

    const activitiesRes = await query<ActivityLogItem>(
      `SELECT * FROM activity_logs 
       WHERE lead_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100;`,
      [leadId]
    );

    // Also fetch messages from conversations table so communication threads seamlessly merge into the timeline
    const messagesRes = await query<{
      id: string;
      channel: string;
      direction: string;
      text: string;
      sent_at: string;
    }>(
      `SELECT m.id, m.channel, m.direction, m.text, m.sent_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.lead_id = $1
       ORDER BY m.sent_at DESC
       LIMIT 50;`,
      [leadId]
    );

    // Synthesize message records into virtual timeline items if not already logged
    const existingActivityTitles = new Set(activitiesRes.rows.map((a) => a.title));
    const mergedActivities: ActivityLogItem[] = [...activitiesRes.rows];

    for (const msg of messagesRes.rows) {
      const isOutbound = msg.direction === 'outbound';
      const syntheticTitle = isOutbound
        ? `${msg.channel.toUpperCase()} message sent`
        : `Inbound reply received via ${msg.channel.toUpperCase()}`;

      if (!existingActivityTitles.has(syntheticTitle)) {
        mergedActivities.push({
          id: `msg_${msg.id}`,
          lead_id: leadId,
          deal_id: null,
          actor_type: isOutbound ? 'system' : 'user',
          activity_type: isOutbound
            ? msg.channel === 'whatsapp'
              ? 'whatsapp_sent'
              : 'email_sent'
            : msg.channel === 'whatsapp'
            ? 'whatsapp_reply'
            : 'email_reply',
          title: syntheticTitle,
          description: msg.text?.slice(0, 300) || '',
          metadata: { messageId: msg.id, channel: msg.channel, direction: msg.direction },
          created_at: msg.sent_at,
        });
      }
    }

    // Sort descending by created_at
    mergedActivities.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    res.json({ success: true, activities: mergedActivities });
  } catch (err: any) {
    console.error('[activitiesRouter.by-lead]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch activity logs' });
  }
});

/**
 * POST /api/activities
 * Log a manual note, phone call, or meeting
 */
activitiesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { leadId, dealId, activityType = 'note_added', title, description, metadata = {} } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required' });
    }
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const insertRes = await query<ActivityLogItem>(
      `INSERT INTO activity_logs (lead_id, deal_id, actor_type, activity_type, title, description, metadata)
       VALUES ($1, $2, 'user', $3, $4, $5, $6)
       RETURNING *;`,
      [leadId, dealId || null, activityType, title.trim(), description || null, JSON.stringify(metadata)]
    );

    res.json({ success: true, activity: insertRes.rows[0] });
  } catch (err: any) {
    console.error('[activitiesRouter.post]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to log activity' });
  }
});
