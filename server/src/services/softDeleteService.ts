import type { PoolClient } from 'pg';
import { withTransaction } from '../config/db';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function filterValidUuids(ids: unknown[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id.trim())).map((id) => id.trim()))];
}

export interface SoftDeleteResult {
  leadIds: string[];
  clientIds: string[];
  primaryClient?: Record<string, any>;
  primaryLead?: Record<string, any>;
}

async function performSoftDelete(client: PoolClient, validIds: string[]): Promise<SoftDeleteResult> {
  if (validIds.length === 0) {
    return { leadIds: [], clientIds: [] };
  }

  // 1. Snapshot matching active/existing leads & clients for 28-day audit/restore history
  const leadsRes = await client.query(
    `SELECT * FROM leads WHERE id = ANY($1::uuid[])`,
    [validIds]
  );

  const clientsRes = await client.query(
    `SELECT * FROM clients
     WHERE id = ANY($1::uuid[])
        OR original_lead_id = ANY($1::uuid[])
        OR (email <> '' AND LOWER(email) IN (
          SELECT LOWER(email) FROM leads WHERE id = ANY($1::uuid[]) AND email <> ''
        ))`,
    [validIds]
  );

  const matchedLeadIds = new Set<string>(leadsRes.rows.map((r) => r.id));
  for (const c of clientsRes.rows) {
    if (c.original_lead_id) matchedLeadIds.add(c.original_lead_id);
  }

  const extraLeadsRes = await client.query(
    `SELECT * FROM leads
     WHERE id = ANY($1::uuid[])
        OR (email <> '' AND LOWER(email) IN (
          SELECT LOWER(email) FROM clients WHERE id = ANY($2::uuid[]) AND email <> ''
        ))`,
    [[...matchedLeadIds], clientsRes.rows.map((c) => c.id)]
  );

  const leadMap = new Map<string, any>();
  for (const row of [...leadsRes.rows, ...extraLeadsRes.rows]) {
    leadMap.set(row.id, row);
  }

  const clientMap = new Map<string, any>();
  for (const row of clientsRes.rows) {
    clientMap.set(row.id, row);
  }

  const allLeadIds = [...leadMap.keys()];
  const allClientIds = [...clientMap.keys()];
  const allTargetIds = [...new Set([...validIds, ...allLeadIds, ...allClientIds])];

  if (allLeadIds.length > 0) {
    await client.query(
      `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
       SELECT 'lead', l.id, l.business_name, l.email, l.phone, row_to_json(l)::jsonb, NOW(), NOW() + INTERVAL '28 days'
       FROM leads l
       WHERE l.id = ANY($1::uuid[])`,
      [allLeadIds]
    );
  }

  if (allClientIds.length > 0) {
    await client.query(
      `INSERT INTO deletion_history (entity_type, entity_id, business_name, email, phone, data, deleted_at, expires_at)
       SELECT 'client', c.id, c.business_name, c.email, c.phone, row_to_json(c)::jsonb, NOW(), NOW() + INTERVAL '28 days'
       FROM clients c
       WHERE c.id = ANY($1::uuid[])`,
      [allClientIds]
    );
  }

  // 2. Cancel pending outbound jobs and remove active list memberships (preserving conversations/messages for 28-day restore)
  await client.query(
    `UPDATE scheduled_dispatches
     SET status = 'cancelled', error_message = COALESCE(NULLIF(error_message, ''), 'Entity soft-deleted'), updated_at = NOW()
     WHERE (lead_id = ANY($1::uuid[]) OR client_id = ANY($1::uuid[]))
       AND status IN ('scheduled', 'pending', 'processing')`,
    [allTargetIds]
  );
  await client.query(
    `UPDATE send_queue
     SET status = 'discarded', error_details = 'Entity soft-deleted', updated_at = NOW()
     WHERE (lead_id = ANY($1::uuid[]) OR client_id = ANY($1::uuid[]))
       AND status IN ('draft', 'approved')`,
    [allTargetIds]
  );
  await client.query(
    `DELETE FROM lead_list_memberships WHERE lead_id = ANY($1::uuid[])`,
    [allTargetIds]
  );

  // 3. Soft-delete leads & unassign 5-slot queues
  let primaryLead: Record<string, any> | undefined;
  if (allLeadIds.length > 0) {
    const updatedLeads = await client.query(
      `UPDATE leads
       SET deleted_at = NOW(),
           deleted_expires_at = NOW() + INTERVAL '28 days',
           slot_id = NULL,
           slot_assigned_at = NULL,
           claimed_stage = NULL,
           claimed_at = NULL,
           updated_at = NOW()
       WHERE id = ANY($1::uuid[])
       RETURNING *`,
      [allLeadIds]
    );
    primaryLead = updatedLeads.rows[0];
  }

  // 4. Soft-delete clients
  let primaryClient: Record<string, any> | undefined;
  if (allClientIds.length > 0) {
    const updatedClients = await client.query(
      `UPDATE clients
       SET deleted_at = NOW(),
           deleted_expires_at = NOW() + INTERVAL '28 days',
           updated_at = NOW()
       WHERE id = ANY($1::uuid[])
       RETURNING *`,
      [allClientIds]
    );
    primaryClient = updatedClients.rows[0];
  }

  return {
    leadIds: allLeadIds,
    clientIds: allClientIds,
    primaryClient,
    primaryLead,
  };
}

/**
 * Soft-deletes one or more leads/clients inside a single atomic transaction,
 * preserving conversations, messages, and follow-up logs for 28-day Trash restore.
 */
export async function softDeleteEntities(ids: unknown[]): Promise<SoftDeleteResult> {
  const validIds = filterValidUuids(ids);
  if (validIds.length === 0) {
    return { leadIds: [], clientIds: [] };
  }
  return withTransaction((client) => performSoftDelete(client, validIds));
}
