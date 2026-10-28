import { Router, type Request, type Response } from 'express';
import { query } from '../config/db';

export const tasksRouter = Router();

export interface TaskRecord {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  title: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'completed' | 'cancelled';
  task_type: 'call' | 'email' | 'meeting' | 'review' | 'audit' | 'follow_up';
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  business_name?: string;
  deal_title?: string;
}

/**
 * GET /api/tasks
 * Returns tasks list with Today, Overdue, and Upcoming classifications
 */
tasksRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, filter } = req.query;

    let queryText = `
      SELECT 
        t.*,
        l.business_name,
        d.title as deal_title
      FROM tasks t
      LEFT JOIN leads l ON l.id = t.lead_id
      LEFT JOIN deals d ON d.id = t.deal_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && typeof status === 'string') {
      params.push(status);
      queryText += ` AND t.status = $${params.length}`;
    }

    if (filter === 'today') {
      queryText += ` AND t.due_date::date = CURRENT_DATE AND t.status = 'pending'`;
    } else if (filter === 'overdue') {
      queryText += ` AND t.due_date < NOW() AND t.status = 'pending'`;
    } else if (filter === 'upcoming') {
      queryText += ` AND t.due_date > NOW() AND t.status = 'pending'`;
    }

    queryText += ` ORDER BY t.due_date ASC LIMIT 100;`;

    const tasksRes = await query<TaskRecord>(queryText, params);

    // Summary counts
    const countsRes = await query<{
      today_count: string;
      overdue_count: string;
      pending_count: string;
      completed_count: string;
    }>(`
      SELECT 
        COUNT(*) FILTER (WHERE due_date::date = CURRENT_DATE AND status = 'pending')::int as today_count,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status = 'pending')::int as overdue_count,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending_count,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed_count
      FROM tasks;
    `);

    const summary = countsRes.rows[0] || {
      today_count: 0,
      overdue_count: 0,
      pending_count: 0,
      completed_count: 0,
    };

    res.json({
      success: true,
      tasks: tasksRes.rows,
      summary: {
        today: Number(summary.today_count) || 0,
        overdue: Number(summary.overdue_count) || 0,
        pending: Number(summary.pending_count) || 0,
        completed: Number(summary.completed_count) || 0,
      },
    });
  } catch (err: any) {
    console.error('[tasksRouter.get]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch tasks' });
  }
});

/**
 * POST /api/tasks
 * Create a new task / manual reminder
 */
tasksRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      leadId,
      dealId,
      title,
      dueDate = new Date().toISOString(),
      priority = 'medium',
      taskType = 'follow_up',
      notes,
    } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ success: false, error: 'Task title is required' });
    }

    const insertRes = await query<TaskRecord>(
      `INSERT INTO tasks (
        lead_id, deal_id, title, due_date, priority, status, task_type, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
      RETURNING *;`,
      [
        leadId || null,
        dealId || null,
        title.trim(),
        dueDate,
        priority,
        taskType,
        notes || null,
      ]
    );

    res.json({ success: true, task: insertRes.rows[0], message: 'Task created successfully' });
  } catch (err: any) {
    console.error('[tasksRouter.post]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to create task' });
  }
});

/**
 * PATCH /api/tasks/:id/toggle
 * Toggle task between completed and pending
 */
tasksRouter.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskRes = await query<TaskRecord>(`SELECT * FROM tasks WHERE id = $1`, [id]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const isPending = taskRes.rows[0].status === 'pending';
    const newStatus = isPending ? 'completed' : 'pending';
    const completedAt = isPending ? new Date().toISOString() : null;

    const updateRes = await query<TaskRecord>(
      `UPDATE tasks 
       SET status = $1, completed_at = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *;`,
      [newStatus, completedAt, id]
    );

    res.json({ success: true, task: updateRes.rows[0] });
  } catch (err: any) {
    console.error('[tasksRouter.toggle]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to toggle task' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
tasksRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM tasks WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err: any) {
    console.error('[tasksRouter.delete]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete task' });
  }
});
