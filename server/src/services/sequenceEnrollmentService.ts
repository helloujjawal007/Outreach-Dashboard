import { query } from '../config/db';

export interface SequenceEnrollment {
  id: string;
  lead_id: string;
  sequence_name: string;
  current_step: number;
  total_steps: number;
  status: 'active' | 'paused' | 'completed' | 'bounced' | 'replied' | 'ooo_delayed';
  next_step_due_at: string | null;
  last_step_sent_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  metadata: Record<string, any>;
}

export class SequenceEnrollmentService {
  /**
   * Enrolls a lead into a structured outreach sequence
   */
  async enrollLead(
    leadId: string,
    sequenceName: string = 'Cold Outreach 4-Step',
    totalSteps: number = 4
  ): Promise<SequenceEnrollment> {
    // Check if lead is already in an active enrollment for this sequence
    const existing = await query<SequenceEnrollment>(
      `SELECT * FROM sequence_enrollments 
       WHERE lead_id = $1 AND sequence_name = $2 AND status IN ('active', 'ooo_delayed') 
       LIMIT 1`,
      [leadId, sequenceName]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const res = await query<SequenceEnrollment>(
      `INSERT INTO sequence_enrollments (
        lead_id, sequence_name, current_step, total_steps, status, next_step_due_at, enrolled_at
      ) VALUES ($1, $2, 1, $3, 'active', NOW(), NOW())
      RETURNING *`,
      [leadId, sequenceName, totalSteps]
    );

    // Record in activity_logs
    await query(
      `INSERT INTO activity_logs (lead_id, actor_type, activity_type, title, description, metadata)
       VALUES ($1, 'system', 'sequence_enrolled', $2, $3, $4)`,
      [
        leadId,
        `Enrolled in ${sequenceName}`,
        `Lead initiated in step 1 of ${totalSteps} multi-touch sequence.`,
        JSON.stringify({ sequenceName, totalSteps }),
      ]
    );

    return res.rows[0];
  }

  /**
   * Advances step after successful dispatch
   */
  async advanceStep(leadId: string, delayDays: number = 2.5): Promise<void> {
    const active = await query<SequenceEnrollment>(
      `SELECT * FROM sequence_enrollments 
       WHERE lead_id = $1 AND status = 'active' 
       ORDER BY enrolled_at DESC LIMIT 1`,
      [leadId]
    );

    if (active.rows.length === 0) return;
    const enrollment = active.rows[0];

    if (enrollment.current_step >= enrollment.total_steps) {
      // Completed all steps in sequence
      await query(
        `UPDATE sequence_enrollments 
         SET status = 'completed', 
             last_step_sent_at = NOW(), 
             completed_at = NOW(), 
             next_step_due_at = NULL 
         WHERE id = $1`,
        [enrollment.id]
      );

      await query(
        `INSERT INTO activity_logs (lead_id, actor_type, activity_type, title, description)
         VALUES ($1, 'system', 'sequence_completed', $2, $3)`,
        [leadId, `Sequence Completed: ${enrollment.sequence_name}`, `All ${enrollment.total_steps} touchpoints have been completed.`]
      );
    } else {
      const nextStep = enrollment.current_step + 1;
      const nextDueInterval = `${Math.round(delayDays * 24)} hours`;

      await query(
        `UPDATE sequence_enrollments 
         SET current_step = $1, 
             last_step_sent_at = NOW(), 
             next_step_due_at = NOW() + ($2)::interval 
         WHERE id = $3`,
        [nextStep, nextDueInterval, enrollment.id]
      );

      await query(
        `INSERT INTO activity_logs (lead_id, actor_type, activity_type, title, description)
         VALUES ($1, 'system', 'sequence_step_advanced', $2, $3)`,
        [leadId, `Advanced to Step ${nextStep} of ${enrollment.sequence_name}`, `Next message scheduled in ${delayDays} days.`]
      );
    }
  }

  /**
   * Delays sequence when Out-of-Office auto-reply is detected
   */
  async delayForOoo(leadId: string, delayDays: number = 7): Promise<void> {
    const delayInterval = `${Math.round(delayDays * 24)} hours`;

    await query(
      `UPDATE sequence_enrollments 
       SET status = 'ooo_delayed', 
           next_step_due_at = NOW() + ($1)::interval 
       WHERE lead_id = $2 AND status IN ('active', 'ooo_delayed')`,
      [delayInterval, leadId]
    );

    await query(
      `INSERT INTO activity_logs (lead_id, actor_type, activity_type, title, description)
       VALUES ($1, 'system', 'ooo_delayed', 'Sequence Paused for OOO', $2)`,
      [leadId, `Out of Office response detected. Next sequence step safely postponed by ${delayDays} days.`]
    );
  }

  /**
   * Completes or pauses sequence when a human reply or bounce occurs
   */
  async updateStatusForLead(leadId: string, status: 'replied' | 'bounced' | 'paused'): Promise<void> {
    await query(
      `UPDATE sequence_enrollments 
       SET status = $1::varchar, 
           completed_at = CASE WHEN $1::text = 'replied' OR $1::text = 'bounced' THEN NOW() ELSE completed_at END,
           next_step_due_at = NULL 
       WHERE lead_id::text = $2::text AND status IN ('active', 'ooo_delayed', 'paused')`,
      [status, leadId]
    );
  }

  /**
   * Fetches active sequence enrollments for a lead
   */
  async getLeadEnrollments(leadId: string): Promise<SequenceEnrollment[]> {
    const res = await query<SequenceEnrollment>(
      `SELECT * FROM sequence_enrollments WHERE lead_id = $1 ORDER BY enrolled_at DESC`,
      [leadId]
    );
    return res.rows;
  }
}

export const sequenceEnrollmentService = new SequenceEnrollmentService();
