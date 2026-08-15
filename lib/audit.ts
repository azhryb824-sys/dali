import { getDb } from "@/db";
import { integrationOutbox, portalActivity, workflowStatusHistory } from "@/db/schema";

type AuditInput = {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  correlationId?: string;
  source?: string;
  ipHash?: string | null;
};

function serialized(value: unknown) {
  if (value === undefined) return null;
  const result = JSON.stringify(value);
  return result.length > 20_000 ? `${result.slice(0, 19_980)}…` : result;
}

export async function auditPortalAction(input: AuditInput) {
  await getDb().insert(portalActivity).values({
    actorEmail: input.actorEmail.trim().toLowerCase(),
    action: input.action,
    entityType: input.entityType,
    entityId: String(input.entityId),
    beforeJson: serialized(input.before),
    afterJson: serialized(input.after),
    reason: input.reason?.trim().slice(0, 1000) || null,
    correlationId: input.correlationId || crypto.randomUUID(),
    source: input.source || "portal",
    ipHash: input.ipHash || null,
  });
}

export async function recordStatusChange(input: {
  entityType: string;
  entityId: string | number;
  fromStatus?: string | null;
  toStatus: string;
  reason?: string | null;
  actorEmail: string;
  correlationId?: string;
}) {
  const correlationId = input.correlationId || crypto.randomUUID();
  await getDb().insert(workflowStatusHistory).values({
    entityType: input.entityType,
    entityId: String(input.entityId),
    fromStatus: input.fromStatus || null,
    toStatus: input.toStatus,
    reason: input.reason?.trim().slice(0, 1000) || null,
    actorEmail: input.actorEmail.trim().toLowerCase(),
    correlationId,
  });
  return correlationId;
}

export async function enqueueOutbox(input: {
  eventType: string;
  aggregateType: string;
  aggregateId: string | number;
  payload: unknown;
}) {
  const id = crypto.randomUUID();
  await getDb().insert(integrationOutbox).values({
    id,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: String(input.aggregateId),
    payloadJson: JSON.stringify(input.payload),
  });
  return id;
}
