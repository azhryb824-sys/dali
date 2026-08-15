import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientContacts, clients, salesOpportunities, workforceRequests } from "@/db/schema";
import { auditPortalAction, enqueueOutbox, recordStatusChange } from "@/lib/audit";
import { emitPortalNotification } from "@/lib/portal-notifications";

function code(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

export async function createOpportunityFromPublicRequest(requestId: number) {
  const db = getDb();
  const request = await db.query.workforceRequests.findFirst({ where: eq(workforceRequests.id, requestId) });
  if (!request || request.requestType !== "quotation") return null;

  const existingOpportunity = await db.query.salesOpportunities.findFirst({
    where: eq(salesOpportunities.sourceRequestId, request.id),
  });
  if (existingOpportunity) return existingOpportunity;

  const legalName = request.companyName?.trim() || request.fullName;
  let client = await db.query.clients.findFirst({ where: eq(clients.legalName, legalName) });
  if (!client) {
    [client] = await db.insert(clients).values({
      clientCode: code("CLI"),
      legalName,
      tradeName: request.companyName || null,
      city: request.workSite?.includes("مكة") ? "مكة المكرمة" : "مكة المكرمة",
      status: "prospect",
      createdBy: "public-website",
    }).returning();
    await auditPortalAction({
      actorEmail: "public-website@dali.local",
      action: "client-created-from-public-request",
      entityType: "client",
      entityId: client.id,
      after: client,
      source: "public-website",
    });
  }

  let contact = await db.query.clientContacts.findFirst({
    where: and(eq(clientContacts.clientId, client.id), eq(clientContacts.email, request.email)),
  });
  if (!contact) {
    [contact] = await db.insert(clientContacts).values({
      clientId: client.id,
      fullName: request.fullName,
      mobile: request.mobile,
      email: request.email,
      preferredChannel: request.preferredContact || "either",
      isPrimary: true,
    }).returning();
  }

  const [opportunity] = await db.insert(salesOpportunities).values({
    opportunityCode: code("OPP"),
    clientId: client.id,
    contactId: contact.id,
    sourceRequestId: request.id,
    title: `${request.specialization} — ${legalName}`,
    stage: "new",
    probability: 10,
    ownerEmail: request.assignedTo || "workforce-queue",
    notes: [request.details, request.workSite ? `موقع العمل: ${request.workSite}` : "", request.duration ? `المدة: ${request.duration}` : ""].filter(Boolean).join("\n"),
    createdBy: "public-website",
  }).returning();

  await db.update(workforceRequests).set({
    clientId: client.id,
    opportunityId: opportunity.id,
    updatedAt: new Date().toISOString(),
  }).where(eq(workforceRequests.id, request.id));

  const correlationId = await recordStatusChange({
    entityType: "sales-opportunity",
    entityId: opportunity.id,
    toStatus: "new",
    actorEmail: "public-website@dali.local",
  });
  await auditPortalAction({
    actorEmail: "public-website@dali.local",
    action: "sales-opportunity-created",
    entityType: "sales-opportunity",
    entityId: opportunity.id,
    after: opportunity,
    correlationId,
    source: "public-website",
  });
  await enqueueOutbox({
    eventType: "sales.opportunity.created",
    aggregateType: "sales-opportunity",
    aggregateId: opportunity.id,
    payload: { opportunityId: opportunity.id, requestId: request.id, clientId: client.id },
  });
  await emitPortalNotification({
    eventType: "sales-opportunity-created",
    title: "أُنشئت فرصة من طلب عرض سعر",
    message: `${opportunity.opportunityCode} — ${opportunity.title}.`,
    severity: "critical",
    module: "sales",
    entityType: "sales-opportunity",
    entityId: opportunity.id,
    actionView: "operations",
    targetDepartment: "workforce",
  }).catch(() => undefined);

  return opportunity;
}
