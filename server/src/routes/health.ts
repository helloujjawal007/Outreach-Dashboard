import { Router, type Request, type Response } from 'express';
import { query, testConnection } from '../config/db';
import { ollamaService } from '../services/ollamaService';
import { emailAdapter } from '../adapters/emailAdapter';

export const healthRouter = Router();

// GET /api/health - Get deliverability health, spam signals, warmup limits, and system status
healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    // 1. Fetch 7-day send metrics
    const metricsRes = await query<{
      formatted_date: string;
      metric_date: string;
      channel: string;
      sent_count: number;
      bounced_count: number;
      complaints_count: number;
      drafted_count: number;
    }>(
      `SELECT
         TO_CHAR(metric_date, 'Mon DD') as formatted_date,
         metric_date,
         sent_count,
         bounced_count,
         complaints_count,
         drafted_count
       FROM daily_send_metrics
       WHERE metric_date >= CURRENT_DATE - INTERVAL '6 days'
       ORDER BY metric_date ASC`
    );

    // 2. Count active draft queue items
    const queueRes = await query<{ count: string }>(
      `SELECT COUNT(*) FROM send_queue WHERE status = 'draft'`
    );
    const pendingDrafts = parseInt(queueRes.rows[0]?.count || '0', 10);

    const dailyData = metricsRes.rows.map((row) => ({
      date: row.formatted_date,
      sent: Number(row.sent_count),
      bounced: Number(row.bounced_count),
      complaints: Number(row.complaints_count),
      drafted: Number(row.drafted_count),
    }));

    const totalSent = dailyData.reduce((acc, d) => acc + d.sent, 0);
    const totalBounced = dailyData.reduce((acc, d) => acc + d.bounced, 0);
    const totalComplaints = dailyData.reduce((acc, d) => acc + d.complaints, 0);

    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
    const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;

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

    // 3. Email Warmup Status
    const warmupStatus = await emailAdapter.getWarmupStatus();
    if (warmupStatus.isThrottled && !isAutoThrottled) {
      isAutoThrottled = true;
      throttleReason = `Daily warm-up limit reached (${warmupStatus.sentToday}/${warmupStatus.dailyLimit} sent today).`;
    }

    // 4. System Infrastructure Status (Postgres & Ollama)
    const dbOk = await testConnection();
    const ollamaStatus = await ollamaService.checkHealth();

    res.json({
      success: true,
      health: {
        level: healthLevel,
        label: healthLabel,
        description: healthDescription,
        isAutoThrottled,
        throttleReason,
        totals: {
          sent: totalSent,
          bounced: totalBounced,
          complaints: totalComplaints,
          drafted: pendingDrafts,
          bounceRate: Number(bounceRate.toFixed(1)),
          complaintRate: Number(complaintRate.toFixed(2)),
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
    });
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
