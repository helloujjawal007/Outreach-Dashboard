import { Router, type Request, type Response } from 'express';
import { query, testConnection } from '../config/db';
import { ollamaService } from '../services/ollamaService';
import { emailAdapter } from '../adapters/emailAdapter';

export const healthRouter = Router();

// GET /api/health - Get deliverability health, spam signals, warmup limits, and system status
healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { fastCache } = await import('../config/cache');
    const cached = fastCache.get('system_health');
    if (cached) {
      return res.json(cached);
    }
    // 1. Fetch 14-day aggregated send metrics (grouped by date across channels)
    const metricsRes = await query<{
      formatted_date: string;
      metric_date_str: string;
      total_sent: string;
      total_bounced: string;
      total_complaints: string;
      total_drafted: string;
    }>(
      `SELECT
         TO_CHAR(metric_date, 'Mon DD') as formatted_date,
         TO_CHAR(metric_date, 'YYYY-MM-DD') as metric_date_str,
         COALESCE(SUM(sent_count), 0)::text as total_sent,
         COALESCE(SUM(bounced_count), 0)::text as total_bounced,
         COALESCE(SUM(complaints_count), 0)::text as total_complaints,
         COALESCE(SUM(drafted_count), 0)::text as total_drafted
       FROM daily_send_metrics
       WHERE metric_date >= CURRENT_DATE - INTERVAL '13 days'
       GROUP BY metric_date, TO_CHAR(metric_date, 'Mon DD'), TO_CHAR(metric_date, 'YYYY-MM-DD')
       ORDER BY metric_date ASC`
    );

    // 2. Fetch daily inbound replies received from messages table
    const repliesRes = await query<{
      recv_date_str: string;
      received_count: string;
    }>(
      `SELECT
         TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as recv_date_str,
         COUNT(*)::text as received_count
       FROM messages
       WHERE direction = 'inbound'
         AND created_at >= CURRENT_DATE - INTERVAL '13 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`
    );

    const repliesByDate = new Map<string, number>();
    for (const r of repliesRes.rows) {
      repliesByDate.set(r.recv_date_str, parseInt(r.received_count || '0', 10));
    }

    // 3. Count active draft queue items
    const queueRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM send_queue WHERE status = 'draft'`
    );
    const pendingDrafts = parseInt(queueRes.rows[0]?.count || '0', 10);

    // Build unified map of dates
    const metricsByDate = new Map<string, {
      date: string;
      metricDate: string;
      sent: number;
      bounced: number;
      complaints: number;
      drafted: number;
    }>();

    for (const row of metricsRes.rows) {
      metricsByDate.set(row.metric_date_str, {
        date: row.formatted_date,
        metricDate: row.metric_date_str,
        sent: parseInt(row.total_sent || '0', 10),
        bounced: parseInt(row.total_bounced || '0', 10),
        complaints: parseInt(row.total_complaints || '0', 10),
        drafted: parseInt(row.total_drafted || '0', 10),
      });
    }

    // Ensure today is always present
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!metricsByDate.has(todayStr)) {
      metricsByDate.set(todayStr, {
        date: todayFormatted,
        metricDate: todayStr,
        sent: 0,
        bounced: 0,
        complaints: 0,
        drafted: 0,
      });
    }

    // Combine sent, received, bounced into dailyData
    const dailyData = Array.from(metricsByDate.values())
      .sort((a, b) => a.metricDate.localeCompare(b.metricDate))
      .map((item) => {
        const received = repliesByDate.get(item.metricDate) || 0;
        const deliverabilityRate = item.sent > 0
          ? Math.max(0, Math.min(100, Number((((item.sent - item.bounced) / item.sent) * 100).toFixed(1))))
          : (item.bounced > 0 ? 0 : 100);
        const replyRate = item.sent > 0
          ? Number(((received / item.sent) * 100).toFixed(1))
          : 0;

        return {
          date: item.date,
          metricDate: item.metricDate,
          sent: item.sent,
          received,
          bounced: item.bounced,
          complaints: item.complaints,
          drafted: item.drafted,
          deliverabilityRate,
          replyRate,
        };
      });

    const totalSent = dailyData.reduce((acc, d) => acc + d.sent, 0);
    const totalReceived = dailyData.reduce((acc, d) => acc + d.received, 0);
    const totalBounced = dailyData.reduce((acc, d) => acc + d.bounced, 0);
    const totalComplaints = dailyData.reduce((acc, d) => acc + d.complaints, 0);

    const todayItem = dailyData.find((d) => d.metricDate === todayStr) || {
      sent: 0,
      received: 0,
      bounced: 0,
      complaints: 0,
    };

    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
    const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;
    const overallReplyRate = totalSent > 0 ? (totalReceived / totalSent) * 100 : 0;

    let healthLevel: 'green' | 'yellow' | 'red' = 'green';
    let healthLabel = 'Healthy';
    let healthDescription = 'Sending reputation looks good. Bounce and complaint rates are within safe compliance thresholds.';
    let isAutoThrottled = false;
    let throttleReason = 'Deliverability is optimal. All health signals are within safe limits.';

    if (bounceRate > 5) {
      healthLevel = 'red';
      healthLabel = 'Critical (Throttled)';
      healthDescription = `Bounce rate is ${bounceRate.toFixed(1)}% (exceeds 5% maximum). Automated cold sends are paused to protect domain reputation.`;
      isAutoThrottled = true;
      throttleReason = `Bounce rate (${bounceRate.toFixed(1)}%) breached 5% ceiling.`;
    } else if (complaintRate > 0.3) {
      healthLevel = 'red';
      healthLabel = 'Critical (Throttled)';
      healthDescription = `Spam complaint rate is ${complaintRate.toFixed(2)}% (exceeds 0.30% Google/Yahoo ceiling). Automated outreach is halted.`;
      isAutoThrottled = true;
      throttleReason = `Spam complaint rate (${complaintRate.toFixed(2)}%) breached 0.30% threshold.`;
    } else if (bounceRate > 2 || complaintRate > 0.1) {
      healthLevel = 'yellow';
      healthLabel = 'Fair (Warning)';
      healthDescription = `Elevated deliverability risk detected (Bounce: ${bounceRate.toFixed(1)}%, Complaints: ${complaintRate.toFixed(2)}%). Clean list before volume increases.`;
      throttleReason = 'Elevated deliverability signals detected. Monitoring closely.';
    }

    // 4. Email Warmup Status
    const warmupStatus = await emailAdapter.getWarmupStatus();
    if (warmupStatus.isThrottled && !isAutoThrottled) {
      isAutoThrottled = true;
      throttleReason = `Daily warm-up limit reached (${warmupStatus.sentToday}/${warmupStatus.dailyLimit} sent today).`;
    }

    // 5. System Infrastructure Status (Postgres & Ollama)
    const dbOk = await testConnection();
    const ollamaStatus = await ollamaService.checkHealth();

    const responsePayload = {
      success: true,
      health: {
        level: healthLevel,
        label: healthLabel,
        description: healthDescription,
        isAutoThrottled,
        throttleReason,
        totals: {
          sent: totalSent,
          received: totalReceived,
          bounced: totalBounced,
          complaints: totalComplaints,
          drafted: pendingDrafts,
          bounceRate: Number(bounceRate.toFixed(1)),
          complaintRate: Number(complaintRate.toFixed(2)),
          replyRate: Number(overallReplyRate.toFixed(1)),
          sentToday: todayItem.sent,
          receivedToday: todayItem.received,
          bouncedToday: todayItem.bounced,
          complaintsToday: todayItem.complaints,
        },
        warmup: {
          stage: warmupStatus.stage,
          stageName: warmupStatus.stageName,
          dailyLimit: warmupStatus.dailyLimit,
          sentToday: warmupStatus.sentToday,
          remainingToday: warmupStatus.remainingToday,
          isThrottled: warmupStatus.isThrottled,
        },
        dailyData,
      },
      system: {
        postgres: dbOk ? 'connected' : 'disconnected',
        ollama: ollamaStatus.online ? 'online' : 'offline',
        ollamaModels: ollamaStatus.models,
        ollamaError: ollamaStatus.error,
      },
    };

    fastCache.set('system_health', responsePayload, 3000);
    res.json(responsePayload);
  } catch (error) {
    console.error('[healthRouter.get]', error);
    res.status(500).json({ success: false, error: 'Failed to aggregate health metrics' });
  }
});

// POST /api/health/signal - Ingest deliverability signals (bounce, spam complaint, sent)
healthRouter.post('/signal', async (req: Request, res: Response) => {
  try {
    const { type, count = 1, channel = 'total' } = req.body;
    if (!type || !['bounce', 'complaint', 'sent'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be bounce, complaint, or sent' });
    }

    const col = type === 'bounce' ? 'bounced_count' : type === 'complaint' ? 'complaints_count' : 'sent_count';
    await query(
      `INSERT INTO daily_send_metrics (metric_date, channel, ${col}, updated_at)
       VALUES (CURRENT_DATE, $1, $2, NOW())
       ON CONFLICT (metric_date, channel)
       DO UPDATE SET ${col} = daily_send_metrics.${col} + $2, updated_at = NOW()`,
      [channel, count]
    );

    res.json({ success: true, message: `Recorded ${count} ${type} event(s)` });
  } catch (err) {
    console.error('[healthRouter.signal]', err);
    res.status(500).json({ success: false, error: 'Failed to record deliverability signal' });
  }
});

// POST /api/health/reset-today - Reset today's deliverability test signals
healthRouter.post('/reset-today', async (_req: Request, res: Response) => {
  try {
    await query(
      `UPDATE daily_send_metrics
       SET bounced_count = 0, complaints_count = 0, sent_count = 25, updated_at = NOW()
       WHERE metric_date = CURRENT_DATE`
    );
    res.json({ success: true, message: "Reset today's test signals to normal baseline" });
  } catch (err) {
    console.error('[healthRouter.reset]', err);
    res.status(500).json({ success: false, error: 'Failed to reset test signals' });
  }
});

// GET /api/health/test-form - Serves a test contact form for verifying website form detection
healthRouter.get('/test-form', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Nova Meridian Health - Contact Us</title></head>
<body>
  <h2>Contact Nova Meridian Health</h2>
  <form action="/api/health/test-form-submit" method="POST">
    <input type="text" name="name" placeholder="Full Name" required />
    <input type="email" name="email" placeholder="Email Address" required />
    <input type="tel" name="phone" placeholder="Phone" />
    <input type="text" name="subject" placeholder="Subject" />
    <textarea name="message" placeholder="Your message here..." required></textarea>
    <button type="submit">Submit Inquiry</button>
  </form>
</body>
</html>`);
});

// POST /api/health/test-form-submit - Receives submitted form
healthRouter.post('/test-form-submit', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Inquiry received successfully', received: req.body });
});

