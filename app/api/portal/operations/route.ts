import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  capacityPlans,
  clientContacts,
  clientPortalUsers,
  clients,
  dataSubjectRequests,
  documentStamps,
  quoteItems,
  quoteVersions,
  salesRepresentatives,
  salesOpportunities,
  timeEntries,
  timesheets,
  workflowApprovals,
  workOrderRequirements,
  workOrders,
  workerPortalUsers,
  workers,
} from "@/db/schema";
import {
  auditPortalAction,
  enqueueOutbox,
  recordStatusChange,
} from "@/lib/audit";
import {
  beginOperation,
  completeOperation,
  failOperation,
} from "@/lib/idempotency";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { emitPortalNotification } from "@/lib/portal-notifications";
import {
  parsePaymentSchedule,
  validateSeasonalSchedule,
} from "@/lib/payment-schedules";
import {
  jsonNoStore,
  rejectCrossSiteRequest,
  requestCorrelationId,
} from "@/lib/security";

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : null;
};
const date = (value: unknown, optional = false) => {
  const result = text(value, 10);
  return optional && !result
    ? null
    : /^\d{4}-\d{2}-\d{2}$/.test(result)
      ? result
      : "";
};
const code = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;

async function requireOperationsAccess(write = false) {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (
    !access ||
    !(await hasPortalPermission(access, "operations", write ? "write" : "read"))
  )
    return null;
  return access;
}

export async function GET(request: Request) {
  const access = await requireOperationsAccess(false);
  if (!access)
    return jsonNoStore(
      { error: "غير مصرح بالوصول إلى المبيعات والتشغيل" },
      { status: 403 },
    );
  const correlationId = requestCorrelationId(request);
  try {
    const params = new URL(request.url).searchParams;
    const limit = Math.min(
      100,
      Math.max(10, Number(params.get("limit")) || 50),
    );
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const canSeePrivacy =
      access.role !== "employee" || access.department === "legal";
    const [
      clientRows,
      contactRows,
      opportunityRows,
      representativeRows,
      quoteRows,
      quoteItemRows,
      orderRows,
      requirementRows,
      sheetRows,
      entryRows,
      workerRows,
      planRows,
      approvalRows,
      privacyRows,
      clientUserRows,
      workerUserRows,
    ] = await Promise.all([
      getDb()
        .select()
        .from(clients)
        .orderBy(desc(clients.updatedAt))
        .limit(limit)
        .offset(offset),
      getDb()
        .select()
        .from(clientContacts)
        .orderBy(desc(clientContacts.updatedAt))
        .limit(limit * 3)
        .offset(offset),
      getDb()
        .select()
        .from(salesOpportunities)
        .orderBy(desc(salesOpportunities.updatedAt))
        .limit(limit)
        .offset(offset),
      getDb()
        .select()
        .from(salesRepresentatives)
        .orderBy(salesRepresentatives.fullName),
      getDb()
        .select()
        .from(quoteVersions)
        .orderBy(desc(quoteVersions.updatedAt))
        .limit(limit)
        .offset(offset),
      getDb()
        .select()
        .from(quoteItems)
        .orderBy(quoteItems.sortOrder)
        .limit(limit * 10)
        .offset(offset),
      getDb()
        .select()
        .from(workOrders)
        .orderBy(desc(workOrders.updatedAt))
        .limit(limit)
        .offset(offset),
      getDb()
        .select()
        .from(workOrderRequirements)
        .limit(limit * 10)
        .offset(offset),
      getDb()
        .select()
        .from(timesheets)
        .orderBy(desc(timesheets.updatedAt))
        .limit(limit)
        .offset(offset),
      getDb()
        .select()
        .from(timeEntries)
        .orderBy(desc(timeEntries.workDate))
        .limit(limit * 20)
        .offset(offset),
      getDb()
        .select({
          id: workers.id,
          fullName: workers.fullName,
          workerNumber: workers.workerNumber,
          profession: workers.profession,
          status: workers.status,
          clientId: workers.clientId,
          workOrderId: workers.workOrderId,
        })
        .from(workers)
        .orderBy(desc(workers.updatedAt))
        .limit(limit * 10)
        .offset(offset),
      getDb()
        .select()
        .from(capacityPlans)
        .orderBy(desc(capacityPlans.updatedAt))
        .limit(limit)
        .offset(offset),
      getDb()
        .select()
        .from(workflowApprovals)
        .orderBy(desc(workflowApprovals.createdAt))
        .limit(limit * 3)
        .offset(offset),
      canSeePrivacy
        ? getDb()
            .select()
            .from(dataSubjectRequests)
            .orderBy(desc(dataSubjectRequests.createdAt))
            .limit(limit)
            .offset(offset)
        : Promise.resolve([]),
      access.role === "admin"
        ? getDb()
            .select()
            .from(clientPortalUsers)
            .orderBy(desc(clientPortalUsers.updatedAt))
            .limit(limit)
            .offset(offset)
        : Promise.resolve([]),
      access.role === "admin"
        ? getDb()
            .select()
            .from(workerPortalUsers)
            .orderBy(desc(workerPortalUsers.updatedAt))
            .limit(limit)
            .offset(offset)
        : Promise.resolve([]),
    ]);
    return jsonNoStore({
      clients: clientRows,
      contacts: contactRows,
      opportunities: opportunityRows,
      representatives: representativeRows,
      quotes: quoteRows,
      quoteItems: quoteItemRows,
      workOrders: orderRows,
      requirements: requirementRows,
      timesheets: sheetRows,
      timeEntries: entryRows,
      workers: workerRows,
      capacityPlans: planRows,
      approvals: approvalRows,
      privacyRequests: privacyRows,
      clientUsers: clientUserRows,
      workerUsers: workerUserRows,
      page: {
        limit,
        offset,
        hasMore: [
          clientRows,
          opportunityRows,
          quoteRows,
          orderRows,
          sheetRows,
        ].some((rows) => rows.length === limit),
      },
    });
  } catch (error) {
    console.error("operations-list-failed", { correlationId, error });
    return jsonNoStore(
      { error: "تعذّر تحميل بيانات المبيعات والتشغيل", correlationId },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireOperationsAccess(true);
  if (!access)
    return jsonNoStore(
      { error: "غير مصرح بإنشاء سجلات التشغيل" },
      { status: 403 },
    );
  let operationKey = "";
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = text(payload.action, 50);
    const operation = await beginOperation(
      payload.idempotencyKey,
      access.user.email,
      action,
    );
    operationKey = operation.key;
    if (operation.duplicate)
      return jsonNoStore({
        ...(operation.response as object),
        duplicate: true,
      });
    const result = await createRecord(
      action,
      payload,
      access,
      requestCorrelationId(request),
    );
    await completeOperation(operation.key, result);
    return jsonNoStore(result, { status: 201 });
  } catch (error) {
    if (operationKey)
      await failOperation(operationKey, error).catch(() => undefined);
    const message =
      error instanceof Error ? error.message : "تعذّر إنشاء السجل";
    return jsonNoStore(
      { error: message },
      {
        status: message.includes("غير مصرح")
          ? 403
          : message.includes("غير موجود")
            ? 404
            : 400,
      },
    );
  }
}

async function createRecord(
  action: string,
  payload: Record<string, unknown>,
  access: NonNullable<Awaited<ReturnType<typeof requireOperationsAccess>>>,
  correlationId: string,
) {
  const db = getDb();
  const actor = access.user.email;
  if (action === "create-client") {
    const legalName = text(payload.legalName, 180);
    if (legalName.length < 2) throw new Error("اسم العميل غير مكتمل");
    const salesRepresentativeId = integer(payload.salesRepresentativeId, 1);
    if (
      salesRepresentativeId &&
      !(await db.query.salesRepresentatives.findFirst({
        where: and(
          eq(salesRepresentatives.id, salesRepresentativeId),
          eq(salesRepresentatives.status, "active"),
        ),
      }))
    )
      throw new Error("المندوب المحدد غير موجود أو غير نشط");
    const [client] = await db
      .insert(clients)
      .values({
        clientCode: code("CLI"),
        legalName,
        tradeName: text(payload.tradeName, 180) || null,
        commercialRegistration:
          text(payload.commercialRegistration, 30) || null,
        vatNumber: text(payload.vatNumber, 30) || null,
        sector: text(payload.sector, 100) || null,
        city: text(payload.city, 100) || "مكة المكرمة",
        address: text(payload.address, 500) || null,
        status: "prospect",
        ownerEmail: text(payload.ownerEmail, 160).toLowerCase() || actor,
        salesRepresentativeId,
        createdBy: actor,
      })
      .returning();
    const contactName = text(payload.contactName, 120);
    if (contactName)
      await db.insert(clientContacts).values({
        clientId: client.id,
        fullName: contactName,
        jobTitle: text(payload.contactJobTitle, 100) || null,
        mobile: text(payload.contactMobile, 20) || null,
        email: text(payload.contactEmail, 160).toLowerCase() || null,
        preferredChannel: "either",
        isPrimary: true,
      });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "client",
      entityId: client.id,
      after: client,
      correlationId,
    });
    await recordStatusChange({
      entityType: "client",
      entityId: client.id,
      toStatus: client.status,
      actorEmail: actor,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "client.created",
      aggregateType: "client",
      aggregateId: client.id,
      payload: { clientId: client.id },
    });
    await emitPortalNotification({
      eventType: "client-created",
      title: "أُضيف عميل جديد",
      message: `${client.clientCode} — ${client.legalName}.`,
      severity: "success",
      module: "sales",
      entityType: "client",
      entityId: client.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { client };
  }

  if (action === "create-opportunity") {
    const clientId = integer(payload.clientId, 1);
    const title = text(payload.title, 180);
    if (!clientId || title.length < 3)
      throw new Error("بيانات الفرصة غير مكتملة");
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, clientId),
    });
    if (!client) throw new Error("العميل غير موجود");
    const salesRepresentativeId =
      integer(payload.salesRepresentativeId, 1) ?? client.salesRepresentativeId;
    if (
      salesRepresentativeId &&
      !(await db.query.salesRepresentatives.findFirst({
        where: and(
          eq(salesRepresentatives.id, salesRepresentativeId),
          eq(salesRepresentatives.status, "active"),
        ),
      }))
    )
      throw new Error("المندوب المحدد غير موجود أو غير نشط");
    const [opportunity] = await db
      .insert(salesOpportunities)
      .values({
        opportunityCode: code("OPP"),
        clientId,
        contactId: integer(payload.contactId, 1),
        salesRepresentativeId,
        title,
        stage: "new",
        expectedValueHalalas: Math.round(
          (Number(payload.expectedValue) || 0) * 100,
        ),
        expectedCloseDate: date(payload.expectedCloseDate, true),
        probability: integer(payload.probability, 0, 100) ?? 10,
        ownerEmail: text(payload.ownerEmail, 160).toLowerCase() || actor,
        notes: text(payload.notes, 2000) || null,
        createdBy: actor,
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "sales-opportunity",
      entityId: opportunity.id,
      after: opportunity,
      correlationId,
    });
    await recordStatusChange({
      entityType: "sales-opportunity",
      entityId: opportunity.id,
      toStatus: "new",
      actorEmail: actor,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "sales.opportunity.created",
      aggregateType: "sales-opportunity",
      aggregateId: opportunity.id,
      payload: { opportunityId: opportunity.id, clientId },
    });
    await emitPortalNotification({
      eventType: "sales-opportunity-created",
      title: "أُنشئت فرصة مبيعات",
      message: `${opportunity.opportunityCode} — ${opportunity.title}.`,
      severity: "info",
      module: "sales",
      entityType: "sales-opportunity",
      entityId: opportunity.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { opportunity };
  }

  if (action === "create-quote") {
    let opportunityId = integer(payload.opportunityId, 1);
    const directClientName = text(payload.clientName, 180);
    const issueDate = date(payload.issueDate);
    const validUntil = date(payload.validUntil);
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const activityLabel = text(payload.activityLabel, 120);
    const workSite = text(payload.workSite, 180);
    const accommodationParty =
      payload.accommodationParty === "dali"
        ? "dali"
        : payload.accommodationParty === "counterparty"
          ? "counterparty"
          : null;
    const transportParty =
      payload.transportParty === "dali"
        ? "dali"
        : payload.transportParty === "counterparty"
          ? "counterparty"
          : null;
    const vatRate = Number(payload.vatRate || 0);
    const quantityMode = payload.quantityMode === "open" ? "open" : "fixed";
    const seasonType =
      payload.seasonType === "ramadan" || payload.seasonType === "hajj"
        ? payload.seasonType
        : "regular";
    const paymentSchedule = parsePaymentSchedule(payload.paymentSchedule);
    if (
      (!opportunityId && directClientName.length < 2) ||
      !issueDate ||
      !validUntil ||
      validUntil < issueDate ||
      !rawItems.length ||
      activityLabel.length < 3 ||
      workSite.length < 2 ||
      !accommodationParty ||
      !transportParty ||
      !Number.isFinite(vatRate) ||
      vatRate < 0 ||
      vatRate > 100
    )
      throw new Error("أكمل اسم العميل وبيانات عرض السعر والسكن والنقل");
    if (
      quantityMode === "fixed" &&
      seasonType !== "regular" &&
      !validateSeasonalSchedule(paymentSchedule)
    )
      throw new Error(
        "عروض موسمي الحج ورمضان تتطلب دفعات بمواعيد صحيحة ومجموع نسب 100%",
      );
    let opportunity = opportunityId
      ? await db.query.salesOpportunities.findFirst({
          where: eq(salesOpportunities.id, opportunityId),
        })
      : null;
    if (!opportunity && directClientName) {
      let client = await db.query.clients.findFirst({
        where: eq(clients.legalName, directClientName),
      });
      if (!client)
        [client] = await db
          .insert(clients)
          .values({
            clientCode: code("CLI"),
            legalName: directClientName,
            city: text(payload.clientCity, 100) || "مكة المكرمة",
            status: "prospect",
            ownerEmail: actor,
            createdBy: actor,
          })
          .returning();
      [opportunity] = await db
        .insert(salesOpportunities)
        .values({
          opportunityCode: code("OPP"),
          clientId: client.id,
          title: `${activityLabel} - ${directClientName}`,
          stage: "proposal",
          expectedValueHalalas: 0,
          probability: 50,
          ownerEmail: actor,
          createdBy: actor,
        })
        .returning();
      opportunityId = opportunity.id;
    }
    if (!opportunity) throw new Error("الفرصة أو اسم العميل غير موجود");
    const normalizedItems = rawItems.slice(0, 50).map((raw, index) => {
      const item =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const profession = text(item.profession, 120);
      const quantity = integer(
        item.quantity,
        quantityMode === "open" ? 0 : 1,
        100000,
      );
      const requestedDurationMonths = integer(item.durationMonths, 1, 120);
      const durationMonths =
        activityLabel === "توريد العمالة" && seasonType === "regular"
          ? 12
          : requestedDurationMonths;
      const unitPriceHalalas = Math.round((Number(item.unitPrice) || 0) * 100);
      const actualSalaryHalalas = Math.round(
        (Number(item.actualSalary) || 0) * 100,
      );
      const sponsorshipType =
        item.sponsorshipType === "dali"
          ? "dali"
          : item.sponsorshipType === "other"
            ? "other"
            : null;
      const sponsorName =
        sponsorshipType === "other" ? text(item.sponsorName, 160) : null;
      const ajirContractStatus =
        item.ajirContractStatus === "with_ajir"
          ? "with_ajir"
          : item.ajirContractStatus === "without_ajir"
            ? "without_ajir"
            : "not_applicable";
      if (
        !profession ||
        quantity === null ||
        (quantityMode === "fixed" && quantity < 1) ||
        !durationMonths ||
        unitPriceHalalas < 1 ||
        actualSalaryHalalas < 0
      )
        throw new Error(`بيانات البند ${index + 1} غير صحيحة`);
      const normalizedQuantity = quantityMode === "open" ? 0 : quantity;
      return {
        profession,
        quantity: normalizedQuantity,
        durationMonths,
        unitPriceHalalas,
        actualSalaryHalalas,
        lineTotalHalalas:
          normalizedQuantity * durationMonths * unitPriceHalalas,
        notes: text(item.notes, 500) || null,
        sponsorshipType,
        sponsorName,
        ajirContractStatus,
        sortOrder: index,
      };
    });
    const allocationKeys = normalizedItems.map((item) =>
      [
        item.profession,
        item.sponsorshipType || "",
        item.sponsorName || "",
        item.ajirContractStatus,
      ].join("::"),
    );
    if (
      activityLabel === "توريد العمالة" &&
      new Set(allocationKeys).size !== allocationKeys.length
    )
      throw new Error(
        "لا تكرر توزيع المهنة والكفيل وحالة أجير نفسه؛ اجمع العدد في بند واحد",
      );
    const subtotalHalalas = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotalHalalas,
      0,
    );
    const discountHalalas = Math.min(
      subtotalHalalas,
      Math.max(0, Math.round((Number(payload.discount) || 0) * 100)),
    );
    const vatHalalas = Math.round(
      ((subtotalHalalas - discountHalalas) * vatRate) / 100,
    );
    const assumptions = [
      `النشاط: ${activityLabel}`,
      `موقع الخدمة: ${workSite}`,
      `الضريبة: ${vatRate}`,
      text(payload.assumptions, 2500),
    ]
      .filter(Boolean)
      .join("\n");
    const [quote] = await db
      .insert(quoteVersions)
      .values({
        quoteCode: code("QUO"),
        opportunityId: opportunity.id,
        versionNumber: 1,
        status: "draft",
        issueDate,
        validUntil,
        quantityMode,
        seasonType,
        paymentScheduleJson: paymentSchedule.length
          ? JSON.stringify(paymentSchedule)
          : null,
        accommodationParty,
        transportParty,
        vatRateBps: Math.round(vatRate * 100),
        subtotalHalalas,
        discountHalalas,
        totalHalalas: subtotalHalalas - discountHalalas + vatHalalas,
        assumptions,
        terms: text(payload.terms, 3000) || null,
        createdBy: actor,
      })
      .returning();
    try {
      await db.insert(quoteItems).values(
        normalizedItems.map((item) => ({
          ...item,
          quoteVersionId: quote.id,
        })),
      );
    } catch (error) {
      await db.delete(quoteVersions).where(eq(quoteVersions.id, quote.id));
      throw error;
    }
    await db
      .update(salesOpportunities)
      .set({
        stage: "proposal",
        expectedValueHalalas: quote.totalHalalas,
        probability: 50,
        updatedAt: new Date().toISOString(),
        version: opportunity.version + 1,
      })
      .where(
        and(
          eq(salesOpportunities.id, opportunity.id),
          eq(salesOpportunities.version, opportunity.version),
        ),
      );
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "quote-version",
      entityId: quote.id,
      after: { quote, items: normalizedItems },
      correlationId,
    });
    await recordStatusChange({
      entityType: "quote-version",
      entityId: quote.id,
      toStatus: "draft",
      actorEmail: actor,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "quote.created",
      aggregateType: "quote-version",
      aggregateId: quote.id,
      payload: { quoteId: quote.id, opportunityId },
    });
    await emitPortalNotification({
      eventType: "quote-created",
      title: "أُنشئ عرض سعر",
      message:
        quantityMode === "open"
          ? `${quote.quoteCode} — عرض بعدد مفتوح.`
          : `${quote.quoteCode} — بقيمة ${(quote.totalHalalas / 100).toLocaleString("ar-SA")} ريال.`,
      severity: "success",
      module: "sales",
      entityType: "quote-version",
      entityId: quote.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { quote, items: normalizedItems };
  }

  if (action === "create-quote-revision") {
    const sourceQuoteId = integer(payload.sourceQuoteId, 1);
    if (!sourceQuoteId) throw new Error("عرض السعر المصدر غير محدد");
    const source = await db.query.quoteVersions.findFirst({
      where: eq(quoteVersions.id, sourceQuoteId),
    });
    if (!source || source.status === "accepted")
      throw new Error("عرض السعر غير متاح لإنشاء نسخة جديدة");
    const existingVersions = await db
      .select({ versionNumber: quoteVersions.versionNumber })
      .from(quoteVersions)
      .where(eq(quoteVersions.quoteCode, source.quoteCode));
    const sourceItems = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteVersionId, source.id))
      .orderBy(quoteItems.sortOrder);
    if (!sourceItems.length) throw new Error("لا توجد بنود قابلة للنسخ");
    const now = new Date();
    const issueDate = date(payload.issueDate) || now.toISOString().slice(0, 10);
    const defaultExpiry = new Date(now.getTime() + 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    const validUntil = date(payload.validUntil) || defaultExpiry;
    if (validUntil < issueDate)
      throw new Error("تاريخ صلاحية النسخة الجديدة غير صحيح");
    const versionNumber =
      Math.max(
        ...existingVersions.map((item) => item.versionNumber),
        source.versionNumber,
      ) + 1;
    const [quote] = await db
      .insert(quoteVersions)
      .values({
        quoteCode: source.quoteCode,
        opportunityId: source.opportunityId,
        versionNumber,
        status: "draft",
        issueDate,
        validUntil,
        quantityMode: source.quantityMode,
        seasonType: source.seasonType,
        paymentScheduleJson: source.paymentScheduleJson,
        accommodationParty: source.accommodationParty,
        transportParty: source.transportParty,
        vatRateBps: source.vatRateBps,
        subtotalHalalas: source.subtotalHalalas,
        discountHalalas: source.discountHalalas,
        totalHalalas: source.totalHalalas,
        assumptions: source.assumptions,
        terms: source.terms,
        createdBy: actor,
      })
      .returning();
    try {
      await db.insert(quoteItems).values(
        sourceItems.map((item) => ({
          quoteVersionId: quote.id,
          profession: item.profession,
          quantity: item.quantity,
          durationMonths: item.durationMonths,
          unitPriceHalalas: item.unitPriceHalalas,
          actualSalaryHalalas: item.actualSalaryHalalas,
          lineTotalHalalas: item.lineTotalHalalas,
          notes: item.notes,
          sponsorshipType: item.sponsorshipType,
          sponsorName: item.sponsorName,
          ajirContractStatus: item.ajirContractStatus,
          sortOrder: item.sortOrder,
        })),
      );
      await db
        .update(quoteVersions)
        .set({
          status: "superseded",
          updatedAt: new Date().toISOString(),
          recordVersion: source.recordVersion + 1,
        })
        .where(
          and(
            eq(quoteVersions.id, source.id),
            eq(quoteVersions.recordVersion, source.recordVersion),
          ),
        );
    } catch (error) {
      await db.delete(quoteVersions).where(eq(quoteVersions.id, quote.id));
      throw error;
    }
    await recordStatusChange({
      entityType: "quote-version",
      entityId: source.id,
      fromStatus: source.status,
      toStatus: "superseded",
      reason: `إنشاء الإصدار ${versionNumber}`,
      actorEmail: actor,
      correlationId,
    });
    await recordStatusChange({
      entityType: "quote-version",
      entityId: quote.id,
      toStatus: "draft",
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "quote-version",
      entityId: quote.id,
      before: { sourceQuoteId: source.id, sourceVersion: source.versionNumber },
      after: quote,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "quote.revised",
      aggregateType: "quote-version",
      aggregateId: quote.id,
      payload: { quoteId: quote.id, sourceQuoteId: source.id, versionNumber },
    });
    await emitPortalNotification({
      eventType: "quote-revised",
      title: "أُنشئ إصدار جديد لعرض سعر",
      message: `${quote.quoteCode} — الإصدار ${versionNumber}.`,
      severity: "info",
      module: "sales",
      entityType: "quote-version",
      entityId: quote.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { quote, items: sourceItems };
  }

  if (action === "create-work-order") {
    const clientId = integer(payload.clientId, 1);
    const startDate = date(payload.startDate);
    const endDate = date(payload.endDate, true);
    const title = text(payload.title, 180);
    const rawRequirements = Array.isArray(payload.requirements)
      ? payload.requirements
      : [];
    if (
      !clientId ||
      !startDate ||
      (endDate && endDate < startDate) ||
      title.length < 3 ||
      !rawRequirements.length
    )
      throw new Error("بيانات أمر التشغيل غير مكتملة");
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, clientId),
    });
    if (!client) throw new Error("العميل غير موجود");
    const requirements = rawRequirements.slice(0, 50).map((raw) => {
      const item =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const profession = text(item.profession, 120);
      const requiredCount = integer(item.requiredCount, 1, 100000);
      if (!profession || !requiredCount)
        throw new Error("أحد متطلبات العمالة غير صحيح");
      return {
        profession,
        requiredCount,
        shiftName: text(item.shiftName, 100) || null,
        startTime: text(item.startTime, 5) || null,
        endTime: text(item.endTime, 5) || null,
      };
    });
    const [order] = await db
      .insert(workOrders)
      .values({
        workOrderCode: code("WO"),
        clientId,
        contractId: integer(payload.contractId, 1),
        quoteVersionId: integer(payload.quoteVersionId, 1),
        title,
        workSite: text(payload.workSite, 180),
        startDate,
        endDate,
        supervisorEmail:
          text(payload.supervisorEmail, 160).toLowerCase() || null,
        status: "staffing",
        notes: text(payload.notes, 2000) || null,
        createdBy: actor,
      })
      .returning();
    try {
      await db
        .insert(workOrderRequirements)
        .values(
          requirements.map((item) => ({ ...item, workOrderId: order.id })),
        );
    } catch (error) {
      await db.delete(workOrders).where(eq(workOrders.id, order.id));
      throw error;
    }
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "work-order",
      entityId: order.id,
      after: { order, requirements },
      correlationId,
    });
    await recordStatusChange({
      entityType: "work-order",
      entityId: order.id,
      toStatus: order.status,
      actorEmail: actor,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "work-order.created",
      aggregateType: "work-order",
      aggregateId: order.id,
      payload: { workOrderId: order.id, clientId },
    });
    await emitPortalNotification({
      eventType: "work-order-created",
      title: "أُنشئ أمر تشغيل",
      message: `${order.workOrderCode} — ${order.title} — يبدأ ${order.startDate}.`,
      severity: "warning",
      module: "operations",
      entityType: "work-order",
      entityId: order.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { workOrder: order, requirements };
  }

  if (action === "create-timesheet") {
    const workOrderId = integer(payload.workOrderId, 1);
    const periodStart = date(payload.periodStart);
    const periodEnd = date(payload.periodEnd);
    if (!workOrderId || !periodStart || !periodEnd || periodEnd < periodStart)
      throw new Error("فترة كشف الدوام غير صحيحة");
    const order = await db.query.workOrders.findFirst({
      where: eq(workOrders.id, workOrderId),
    });
    if (!order) throw new Error("أمر التشغيل غير موجود");
    const [sheet] = await db
      .insert(timesheets)
      .values({
        timesheetCode: code("TS"),
        workOrderId,
        clientId: order.clientId,
        periodStart,
        periodEnd,
        status: "draft",
        createdBy: actor,
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "timesheet",
      entityId: sheet.id,
      after: sheet,
      correlationId,
    });
    await recordStatusChange({
      entityType: "timesheet",
      entityId: sheet.id,
      toStatus: "draft",
      actorEmail: actor,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "timesheet-created",
      title: "أُنشئ كشف دوام",
      message: `${sheet.timesheetCode} — ${periodStart} إلى ${periodEnd}.`,
      severity: "info",
      module: "operations",
      entityType: "timesheet",
      entityId: sheet.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { timesheet: sheet };
  }

  if (action === "add-time-entry") {
    const timesheetId = integer(payload.timesheetId, 1);
    const workerId = integer(payload.workerId, 1);
    const workDate = date(payload.workDate);
    if (!timesheetId || !workerId || !workDate)
      throw new Error("بيانات الدوام غير مكتملة");
    const sheet = await db.query.timesheets.findFirst({
      where: eq(timesheets.id, timesheetId),
    });
    if (!sheet || sheet.status !== "draft")
      throw new Error("كشف الدوام غير موجود أو غير قابل للتعديل");
    const worker = await db.query.workers.findFirst({
      where: eq(workers.id, workerId),
    });
    if (!worker || worker.workOrderId !== sheet.workOrderId)
      throw new Error("العامل غير مسند إلى أمر التشغيل المرتبط بالكشف");
    if (workDate < sheet.periodStart || workDate > sheet.periodEnd)
      throw new Error("تاريخ الدوام خارج فترة الكشف");
    const [entry] = await db
      .insert(timeEntries)
      .values({
        timesheetId,
        workerId,
        workDate,
        regularMinutes: integer(payload.regularMinutes, 0, 1440) ?? 0,
        overtimeMinutes: integer(payload.overtimeMinutes, 0, 1440) ?? 0,
        attendanceStatus: text(payload.attendanceStatus, 20) || "present",
        notes: text(payload.notes, 500) || null,
      })
      .onConflictDoUpdate({
        target: [
          timeEntries.timesheetId,
          timeEntries.workerId,
          timeEntries.workDate,
        ],
        set: {
          regularMinutes: integer(payload.regularMinutes, 0, 1440) ?? 0,
          overtimeMinutes: integer(payload.overtimeMinutes, 0, 1440) ?? 0,
          attendanceStatus: text(payload.attendanceStatus, 20) || "present",
          notes: text(payload.notes, 500) || null,
        },
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "time-entry",
      entityId: entry.id,
      after: entry,
      correlationId,
    });
    return { timeEntry: entry };
  }

  if (action === "assign-worker-to-work-order") {
    const requirementId = integer(payload.requirementId, 1);
    const workerId = integer(payload.workerId, 1);
    if (!requirementId || !workerId)
      throw new Error("بيانات الإسناد غير مكتملة");
    const [requirement, worker] = await Promise.all([
      db.query.workOrderRequirements.findFirst({
        where: eq(workOrderRequirements.id, requirementId),
      }),
      db.query.workers.findFirst({ where: eq(workers.id, workerId) }),
    ]);
    if (!requirement) throw new Error("متطلب أمر التشغيل غير موجود");
    const order = await db.query.workOrders.findFirst({
      where: eq(workOrders.id, requirement.workOrderId),
    });
    if (!order || !["staffing", "active"].includes(order.status))
      throw new Error("أمر التشغيل غير متاح للإسناد");
    if (!worker || worker.status !== "available" || worker.workOrderId)
      throw new Error("العامل غير متاح للإسناد");
    if (worker.profession !== requirement.profession)
      throw new Error("مهنة العامل لا تطابق متطلب أمر التشغيل");
    if (requirement.filledCount >= requirement.requiredCount)
      throw new Error("اكتمل العدد المطلوب لهذه المهنة");
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, order.clientId),
    });
    const [updatedRequirement] = await db
      .update(workOrderRequirements)
      .set({ filledCount: requirement.filledCount + 1 })
      .where(
        and(
          eq(workOrderRequirements.id, requirement.id),
          eq(workOrderRequirements.filledCount, requirement.filledCount),
        ),
      )
      .returning();
    if (!updatedRequirement)
      throw new Error("تعارض في سعة متطلب العمالة؛ حدّث الصفحة");
    const [updatedWorker] = await db
      .update(workers)
      .set({
        status: "assigned",
        clientId: order.clientId,
        workOrderId: order.id,
        beneficiaryName: client?.legalName || null,
        clientSite: order.workSite,
        assignmentStartDate: order.startDate,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(workers.id, worker.id), eq(workers.status, "available")))
      .returning();
    if (!updatedWorker) {
      await db
        .update(workOrderRequirements)
        .set({
          filledCount: sql`MAX(0, ${workOrderRequirements.filledCount} - 1)`,
        })
        .where(eq(workOrderRequirements.id, requirement.id));
      throw new Error("تغيرت حالة العامل أثناء الإسناد");
    }
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "worker",
      entityId: worker.id,
      before: worker,
      after: updatedWorker,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "work-order.worker-assigned",
      aggregateType: "work-order",
      aggregateId: order.id,
      payload: {
        workOrderId: order.id,
        workerId: worker.id,
        requirementId: requirement.id,
      },
    });
    await emitPortalNotification({
      eventType: "work-order-worker-assigned",
      title: "أُسند عامل إلى أمر تشغيل",
      message: `${worker.fullName} — ${order.workOrderCode} — ${requirement.profession}.`,
      severity: "success",
      module: "operations",
      entityType: "work-order",
      entityId: order.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { worker: updatedWorker, requirement: updatedRequirement };
  }

  if (action === "release-worker-from-work-order") {
    const workerId = integer(payload.workerId, 1);
    if (!workerId) throw new Error("العامل غير محدد");
    const worker = await db.query.workers.findFirst({
      where: eq(workers.id, workerId),
    });
    if (!worker?.workOrderId) throw new Error("العامل غير مسند إلى أمر تشغيل");
    const requirement = await db.query.workOrderRequirements.findFirst({
      where: and(
        eq(workOrderRequirements.workOrderId, worker.workOrderId),
        eq(workOrderRequirements.profession, worker.profession),
      ),
    });
    const [updatedWorker] = await db
      .update(workers)
      .set({
        status: "available",
        clientId: null,
        workOrderId: null,
        beneficiaryName: null,
        clientSite: "غير مسند",
        assignmentStartDate: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(workers.id, worker.id),
          eq(workers.workOrderId, worker.workOrderId),
        ),
      )
      .returning();
    if (!updatedWorker) throw new Error("تغير إسناد العامل أثناء العملية");
    if (requirement && requirement.filledCount > 0)
      await db
        .update(workOrderRequirements)
        .set({
          filledCount: sql`MAX(0, ${workOrderRequirements.filledCount} - 1)`,
        })
        .where(eq(workOrderRequirements.id, requirement.id));
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "worker",
      entityId: worker.id,
      before: worker,
      after: updatedWorker,
      reason: text(payload.reason, 1000) || null,
      correlationId,
    });
    await enqueueOutbox({
      eventType: "work-order.worker-released",
      aggregateType: "work-order",
      aggregateId: worker.workOrderId,
      payload: { workOrderId: worker.workOrderId, workerId: worker.id },
    });
    await emitPortalNotification({
      eventType: "work-order-worker-released",
      title: "أُنهي إسناد عامل من أمر تشغيل",
      message: `${worker.fullName} — أصبح متاحاً للإسناد.`,
      severity: "warning",
      module: "operations",
      entityType: "worker",
      entityId: worker.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { worker: updatedWorker };
  }

  if (action === "create-capacity-plan") {
    const requiredCount = integer(payload.requiredCount, 1, 100000);
    const startDate = date(payload.startDate);
    const endDate = date(payload.endDate);
    const seasonName = text(payload.seasonName, 120);
    const profession = text(payload.profession, 120);
    if (
      !requiredCount ||
      !startDate ||
      !endDate ||
      endDate < startDate ||
      !seasonName ||
      !profession
    )
      throw new Error("بيانات خطة السعة غير مكتملة");
    const [plan] = await db
      .insert(capacityPlans)
      .values({
        planCode: code("CAP"),
        seasonName,
        location: text(payload.location, 180) || "مكة المكرمة",
        profession,
        requiredCount,
        availableCount: integer(payload.availableCount, 0, 100000) ?? 0,
        reservedCount: integer(payload.reservedCount, 0, 100000) ?? 0,
        startDate,
        endDate,
        status: "planning",
        ownerEmail: text(payload.ownerEmail, 160).toLowerCase() || actor,
        notes: text(payload.notes, 2000) || null,
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "capacity-plan",
      entityId: plan.id,
      after: plan,
      correlationId,
    });
    await recordStatusChange({
      entityType: "capacity-plan",
      entityId: plan.id,
      toStatus: plan.status,
      actorEmail: actor,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "capacity-plan-created",
      title: "أُنشئت خطة سعة موسمية",
      message: `${plan.planCode} — ${plan.seasonName} — ${plan.profession}: ${plan.requiredCount} عامل.`,
      severity: "info",
      module: "capacity",
      entityType: "capacity-plan",
      entityId: plan.id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { capacityPlan: plan };
  }

  if (action === "invite-client-user") {
    if (access.role !== "admin")
      throw new Error("غير مصرح بإدارة وصول العملاء");
    const clientId = integer(payload.clientId, 1);
    const email = text(payload.email, 160).toLowerCase();
    const displayName = text(payload.displayName, 120);
    if (!clientId || !email || !displayName)
      throw new Error("بيانات مستخدم العميل غير مكتملة");
    const [clientUser] = await db
      .insert(clientPortalUsers)
      .values({
        email,
        clientId,
        displayName,
        status: "active",
        canApproveQuotes: Boolean(payload.canApproveQuotes),
        canApproveTimesheets: Boolean(payload.canApproveTimesheets),
        invitedBy: actor,
      })
      .onConflictDoUpdate({
        target: clientPortalUsers.email,
        set: {
          clientId,
          displayName,
          status: "active",
          canApproveQuotes: Boolean(payload.canApproveQuotes),
          canApproveTimesheets: Boolean(payload.canApproveTimesheets),
          invitedBy: actor,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "client-portal-user",
      entityId: email,
      after: clientUser,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "client-user-invited",
      title: "فُعّل وصول عميل",
      message: `${displayName} (${email}) أصبح مخولاً بدخول بوابة العميل.`,
      severity: "warning",
      module: "users",
      entityType: "client-portal-user",
      entityId: email,
      actionView: "operations",
      targetRole: "admin",
    }).catch(() => undefined);
    return { clientUser };
  }

  if (action === "invite-worker-user") {
    if (access.role !== "admin") throw new Error("غير مصرح بإدارة وصول العمال");
    const workerId = integer(payload.workerId, 1);
    const email = text(payload.email, 160).toLowerCase();
    const displayName = text(payload.displayName, 120);
    if (!workerId || !email || !displayName)
      throw new Error("بيانات مستخدم العامل غير مكتملة");
    const worker = await db.query.workers.findFirst({
      where: eq(workers.id, workerId),
    });
    if (!worker) throw new Error("العامل غير موجود");
    const [workerUser] = await db
      .insert(workerPortalUsers)
      .values({
        email,
        workerId,
        displayName,
        status: "active",
        invitedBy: actor,
      })
      .onConflictDoUpdate({
        target: workerPortalUsers.email,
        set: {
          workerId,
          displayName,
          status: "active",
          invitedBy: actor,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "worker-portal-user",
      entityId: email,
      after: workerUser,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "worker-user-invited",
      title: "فُعّل وصول عامل",
      message: `${worker.fullName} — ${email} — أصبح مخولاً بدخول الخدمة الذاتية.`,
      severity: "warning",
      module: "users",
      entityType: "worker-portal-user",
      entityId: email,
      actionView: "operations",
      targetRole: "admin",
    }).catch(() => undefined);
    return { workerUser };
  }

  throw new Error("إجراء الإنشاء غير صحيح");
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request))
    return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await requireOperationsAccess(true);
  if (!access)
    return jsonNoStore({ error: "غير مصرح بتحديث سير العمل" }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = text(payload.action, 50);
    const correlationId = requestCorrelationId(request);
    const result =
      action === "update-client-portal-user" ||
      action === "update-worker-portal-user"
        ? await updateSelfServiceAccess(action, payload, access, correlationId)
        : await transitionRecord(action, payload, access, correlationId);
    return jsonNoStore(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذّر تحديث سير العمل";
    return jsonNoStore(
      { error: message },
      {
        status: message.includes("تعارض")
          ? 409
          : message.includes("غير مصرح")
            ? 403
            : message.includes("غير موجود")
              ? 404
              : 400,
      },
    );
  }
}

async function updateSelfServiceAccess(
  action: string,
  payload: Record<string, unknown>,
  access: NonNullable<Awaited<ReturnType<typeof requireOperationsAccess>>>,
  correlationId: string,
) {
  if (access.role !== "admin") throw new Error("غير مصرح بإدارة وصول البوابات");
  const email = text(payload.email, 160).toLowerCase();
  const status = text(payload.status, 20);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["pending", "active", "suspended"].includes(status)
  )
    throw new Error("بيانات الوصول غير صحيحة");
  const db = getDb();
  if (action === "update-client-portal-user") {
    const existing = await db.query.clientPortalUsers.findFirst({
      where: eq(clientPortalUsers.email, email),
    });
    if (!existing) throw new Error("مستخدم العميل غير موجود");
    const [updated] = await db
      .update(clientPortalUsers)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(clientPortalUsers.email, email))
      .returning();
    if (existing.status !== status)
      await recordStatusChange({
        entityType: "client-portal-user",
        entityId: email,
        fromStatus: existing.status,
        toStatus: status,
        actorEmail: access.user.email,
        correlationId,
      });
    await auditPortalAction({
      actorEmail: access.user.email,
      action,
      entityType: "client-portal-user",
      entityId: email,
      before: existing,
      after: updated,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "client-portal-access-updated",
      title: "تغيّر وصول مستخدم عميل",
      message: `${updated.displayName} — ${status}.`,
      severity: status === "suspended" ? "warning" : "info",
      module: "users",
      entityType: "client-portal-user",
      entityId: email,
      actionView: "operations",
      targetRole: "admin",
    }).catch(() => undefined);
    return { clientUser: updated };
  }
  const existing = await db.query.workerPortalUsers.findFirst({
    where: eq(workerPortalUsers.email, email),
  });
  if (!existing) throw new Error("مستخدم العامل غير موجود");
  const [updated] = await db
    .update(workerPortalUsers)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(workerPortalUsers.email, email))
    .returning();
  if (existing.status !== status)
    await recordStatusChange({
      entityType: "worker-portal-user",
      entityId: email,
      fromStatus: existing.status,
      toStatus: status,
      actorEmail: access.user.email,
      correlationId,
    });
  await auditPortalAction({
    actorEmail: access.user.email,
    action,
    entityType: "worker-portal-user",
    entityId: email,
    before: existing,
    after: updated,
    correlationId,
  });
  await emitPortalNotification({
    eventType: "worker-portal-access-updated",
    title: "تغيّر وصول مستخدم عامل",
    message: `${updated.displayName} — ${status}.`,
    severity: status === "suspended" ? "warning" : "info",
    module: "users",
    entityType: "worker-portal-user",
    entityId: email,
    actionView: "operations",
    targetRole: "admin",
  }).catch(() => undefined);
  return { workerUser: updated };
}

async function transitionRecord(
  action: string,
  payload: Record<string, unknown>,
  access: NonNullable<Awaited<ReturnType<typeof requireOperationsAccess>>>,
  correlationId: string,
) {
  const db = getDb();
  const actor = access.user.email;
  const id = integer(payload.id, 1);
  const nextStatus = text(payload.status, 40);
  const reason = text(payload.reason, 1000) || null;
  if (!id) throw new Error("السجل غير محدد");

  if (action === "transition-opportunity") {
    const item = await db.query.salesOpportunities.findFirst({
      where: eq(salesOpportunities.id, id),
    });
    if (!item) throw new Error("الفرصة غير موجودة");
    const allowed: Record<string, string[]> = {
      new: ["qualified", "lost"],
      qualified: ["proposal", "lost"],
      proposal: ["negotiation", "won", "lost"],
      negotiation: ["won", "lost"],
      won: [],
      lost: ["new"],
    };
    if (!allowed[item.stage]?.includes(nextStatus))
      throw new Error("انتقال حالة الفرصة غير مسموح");
    const [updated] = await db
      .update(salesOpportunities)
      .set({
        stage: nextStatus,
        lossReason: nextStatus === "lost" ? reason : null,
        probability:
          nextStatus === "won"
            ? 100
            : nextStatus === "lost"
              ? 0
              : item.probability,
        updatedAt: new Date().toISOString(),
        version: item.version + 1,
      })
      .where(
        and(
          eq(salesOpportunities.id, id),
          eq(
            salesOpportunities.version,
            integer(payload.version, 1) ?? item.version,
          ),
        ),
      )
      .returning();
    if (!updated)
      throw new Error("تعارض في إصدار السجل؛ حدّث الصفحة وحاول مجددًا");
    await recordStatusChange({
      entityType: "sales-opportunity",
      entityId: id,
      fromStatus: item.stage,
      toStatus: nextStatus,
      reason,
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "sales-opportunity",
      entityId: id,
      before: item,
      after: updated,
      reason,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "opportunity-status-updated",
      title: "تغيّرت مرحلة فرصة",
      message: `${item.opportunityCode} — ${item.stage} ← ${nextStatus}.`,
      severity:
        nextStatus === "won"
          ? "success"
          : nextStatus === "lost"
            ? "warning"
            : "info",
      module: "sales",
      entityType: "sales-opportunity",
      entityId: id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { opportunity: updated };
  }

  if (action === "transition-quote") {
    const item = await db.query.quoteVersions.findFirst({
      where: eq(quoteVersions.id, id),
    });
    if (!item) throw new Error("عرض السعر غير موجود");
    const canApprove =
      access.role === "admin" ||
      access.functionalRoles.some(
        (role) => role === "system_owner" || role === "system_admin",
      );
    const allowed: Record<string, string[]> = {
      draft: canApprove
        ? ["pending_approval", "approved", "cancelled"]
        : ["pending_approval"],
      pending_approval: canApprove
        ? ["approved", "rejected", "cancelled"]
        : ["approved", "rejected"],
      approved: canApprove ? ["sent", "cancelled"] : ["sent"],
      sent: canApprove
        ? ["accepted", "rejected", "expired", "cancelled"]
        : ["accepted", "rejected", "expired"],
      accepted: [],
      rejected: canApprove ? ["cancelled"] : [],
      expired: [],
      superseded: [],
      cancelled: [],
    };
    if (!allowed[item.status]?.includes(nextStatus))
      throw new Error("انتقال حالة العرض غير مسموح");
    if (
      ["approved", "rejected", "cancelled"].includes(nextStatus) &&
      !canApprove
    )
      throw new Error(
        "قرار اعتماد أو رفض أو إلغاء عرض السعر متاح للمالك أو مشرف النظام فقط",
      );
    const stampId = integer(payload.stampId, 1);
    if (nextStatus === "approved") {
      if (!stampId) throw new Error("اختيار ختم الاعتماد إلزامي");
      const stamp = await db.query.documentStamps.findFirst({
        where: and(
          eq(documentStamps.id, stampId),
          eq(documentStamps.active, true),
        ),
      });
      if (!stamp) throw new Error("الختم المختار غير موجود أو غير نشط");
    }
    const now = new Date().toISOString();
    const [updated] = await db
      .update(quoteVersions)
      .set({
        status: nextStatus,
        approvalReason: ["approved", "rejected"].includes(nextStatus)
          ? reason
          : item.approvalReason,
        approvedBy: nextStatus === "approved" ? actor : item.approvedBy,
        approvedAt: nextStatus === "approved" ? now : item.approvedAt,
        stampId: nextStatus === "approved" ? stampId : item.stampId,
        acceptedAt: nextStatus === "accepted" ? now : item.acceptedAt,
        updatedAt: now,
        recordVersion: item.recordVersion + 1,
      })
      .where(
        and(
          eq(quoteVersions.id, id),
          eq(
            quoteVersions.recordVersion,
            integer(payload.version, 1) ?? item.recordVersion,
          ),
        ),
      )
      .returning();
    if (!updated)
      throw new Error("تعارض في إصدار العرض؛ حدّث الصفحة وحاول مجددًا");
    if (nextStatus === "pending_approval")
      await db.insert(workflowApprovals).values({
        entityType: "quote-version",
        entityId: String(id),
        step: "commercial-approval",
        status: "pending",
        requestedBy: actor,
        assignedRole: "manager",
      });
    if (["approved", "rejected"].includes(nextStatus))
      await db
        .update(workflowApprovals)
        .set({
          status: nextStatus,
          decisionBy: actor,
          decisionReason: reason,
          decidedAt: now,
        })
        .where(
          and(
            eq(workflowApprovals.entityType, "quote-version"),
            eq(workflowApprovals.entityId, String(id)),
            eq(workflowApprovals.status, "pending"),
          ),
        );
    if (nextStatus === "accepted") {
      const opportunity = await db.query.salesOpportunities.findFirst({
        where: eq(salesOpportunities.id, item.opportunityId),
      });
      if (opportunity) {
        await db
          .update(salesOpportunities)
          .set({
            stage: "won",
            probability: 100,
            updatedAt: now,
            version: opportunity.version + 1,
          })
          .where(eq(salesOpportunities.id, opportunity.id));
        if (opportunity.clientId)
          await db
            .update(clients)
            .set({ status: "active", updatedAt: now })
            .where(eq(clients.id, opportunity.clientId));
      }
    }
    await recordStatusChange({
      entityType: "quote-version",
      entityId: id,
      fromStatus: item.status,
      toStatus: nextStatus,
      reason,
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "quote-version",
      entityId: id,
      before: item,
      after: updated,
      reason,
      correlationId,
    });
    await enqueueOutbox({
      eventType: `quote.${nextStatus}`,
      aggregateType: "quote-version",
      aggregateId: id,
      payload: { quoteId: id, status: nextStatus },
    });
    await emitPortalNotification({
      eventType: `quote-${nextStatus}`,
      title:
        nextStatus === "pending_approval"
          ? "عرض سعر ينتظر الاعتماد"
          : nextStatus === "cancelled"
            ? "أُلغي عرض سعر"
            : "تغيّرت حالة عرض سعر",
      message: `${item.quoteCode} — ${item.status} ← ${nextStatus}${reason ? ` — ${reason}` : ""}.`,
      severity:
        nextStatus === "accepted" || nextStatus === "approved"
          ? "success"
          : ["rejected", "cancelled"].includes(nextStatus)
            ? "warning"
            : "info",
      module: "sales",
      entityType: "quote-version",
      entityId: id,
      actionView: "operations",
      targetRole: nextStatus === "pending_approval" ? "manager" : null,
      targetDepartment: nextStatus === "pending_approval" ? null : "workforce",
    }).catch(() => undefined);
    return { quote: updated };
  }

  if (action === "transition-work-order") {
    const item = await db.query.workOrders.findFirst({
      where: eq(workOrders.id, id),
    });
    if (!item) throw new Error("أمر التشغيل غير موجود");
    const allowed: Record<string, string[]> = {
      planned: ["staffing", "cancelled"],
      staffing: ["active", "paused", "cancelled"],
      active: ["paused", "completed"],
      paused: ["active", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[item.status]?.includes(nextStatus))
      throw new Error("انتقال حالة أمر التشغيل غير مسموح");
    const [updated] = await db
      .update(workOrders)
      .set({
        status: nextStatus,
        updatedAt: new Date().toISOString(),
        version: item.version + 1,
      })
      .where(
        and(
          eq(workOrders.id, id),
          eq(workOrders.version, integer(payload.version, 1) ?? item.version),
        ),
      )
      .returning();
    if (!updated) throw new Error("تعارض في إصدار أمر التشغيل");
    await recordStatusChange({
      entityType: "work-order",
      entityId: id,
      fromStatus: item.status,
      toStatus: nextStatus,
      reason,
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "work-order",
      entityId: id,
      before: item,
      after: updated,
      reason,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "work-order-status-updated",
      title: "تغيّرت حالة أمر تشغيل",
      message: `${item.workOrderCode} — ${item.status} ← ${nextStatus}.`,
      severity:
        nextStatus === "active" || nextStatus === "completed"
          ? "success"
          : "warning",
      module: "operations",
      entityType: "work-order",
      entityId: id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { workOrder: updated };
  }

  if (action === "transition-timesheet") {
    const item = await db.query.timesheets.findFirst({
      where: eq(timesheets.id, id),
    });
    if (!item) throw new Error("كشف الدوام غير موجود");
    const allowed: Record<string, string[]> = {
      draft: ["submitted"],
      submitted: ["approved", "rejected"],
      rejected: ["draft"],
      approved: ["invoiced"],
      invoiced: [],
    };
    if (!allowed[item.status]?.includes(nextStatus))
      throw new Error("انتقال حالة كشف الدوام غير مسموح");
    if (
      ["approved", "rejected"].includes(nextStatus) &&
      access.role === "employee"
    )
      throw new Error("غير مصرح باعتماد كشف الدوام");
    if (
      nextStatus === "approved" &&
      item.createdBy === actor &&
      access.role !== "admin"
    )
      throw new Error("لا يجوز لمنشئ الكشف اعتماده");
    const now = new Date().toISOString();
    const [updated] = await db
      .update(timesheets)
      .set({
        status: nextStatus,
        submittedBy: nextStatus === "submitted" ? actor : item.submittedBy,
        submittedAt: nextStatus === "submitted" ? now : item.submittedAt,
        approvedBy: nextStatus === "approved" ? actor : item.approvedBy,
        approvedAt: nextStatus === "approved" ? now : item.approvedAt,
        rejectionReason: nextStatus === "rejected" ? reason : null,
        updatedAt: now,
        version: item.version + 1,
      })
      .where(
        and(
          eq(timesheets.id, id),
          eq(timesheets.version, integer(payload.version, 1) ?? item.version),
        ),
      )
      .returning();
    if (!updated) throw new Error("تعارض في إصدار كشف الدوام");
    if (nextStatus === "submitted")
      await db.insert(workflowApprovals).values({
        entityType: "timesheet",
        entityId: String(id),
        step: "timesheet-approval",
        status: "pending",
        requestedBy: actor,
        assignedRole: "manager",
      });
    if (["approved", "rejected"].includes(nextStatus))
      await db
        .update(workflowApprovals)
        .set({
          status: nextStatus,
          decisionBy: actor,
          decisionReason: reason,
          decidedAt: now,
        })
        .where(
          and(
            eq(workflowApprovals.entityType, "timesheet"),
            eq(workflowApprovals.entityId, String(id)),
            eq(workflowApprovals.status, "pending"),
          ),
        );
    await recordStatusChange({
      entityType: "timesheet",
      entityId: id,
      fromStatus: item.status,
      toStatus: nextStatus,
      reason,
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "timesheet",
      entityId: id,
      before: item,
      after: updated,
      reason,
      correlationId,
    });
    await emitPortalNotification({
      eventType: `timesheet-${nextStatus}`,
      title:
        nextStatus === "submitted"
          ? "كشف دوام ينتظر الاعتماد"
          : "تغيّرت حالة كشف دوام",
      message: `${item.timesheetCode} — ${item.status} ← ${nextStatus}.`,
      severity:
        nextStatus === "approved"
          ? "success"
          : nextStatus === "rejected"
            ? "warning"
            : "info",
      module: "operations",
      entityType: "timesheet",
      entityId: id,
      actionView: "operations",
      targetRole: nextStatus === "submitted" ? "manager" : null,
      targetDepartment: nextStatus === "submitted" ? null : "workforce",
    }).catch(() => undefined);
    return { timesheet: updated };
  }

  if (action === "transition-capacity-plan") {
    const item = await db.query.capacityPlans.findFirst({
      where: eq(capacityPlans.id, id),
    });
    if (!item) throw new Error("خطة السعة غير موجودة");
    const allowed: Record<string, string[]> = {
      planning: ["approved", "cancelled"],
      approved: ["active", "cancelled"],
      active: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[item.status]?.includes(nextStatus))
      throw new Error("انتقال حالة الخطة غير مسموح");
    const [updated] = await db
      .update(capacityPlans)
      .set({
        status: nextStatus,
        availableCount:
          integer(payload.availableCount, 0, 100000) ?? item.availableCount,
        reservedCount:
          integer(payload.reservedCount, 0, 100000) ?? item.reservedCount,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(capacityPlans.id, id))
      .returning();
    await recordStatusChange({
      entityType: "capacity-plan",
      entityId: id,
      fromStatus: item.status,
      toStatus: nextStatus,
      reason,
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "capacity-plan",
      entityId: id,
      before: item,
      after: updated,
      reason,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "capacity-plan-updated",
      title: "تغيّرت خطة السعة",
      message: `${item.planCode} — ${item.status} ← ${nextStatus}.`,
      severity:
        nextStatus === "approved" || nextStatus === "completed"
          ? "success"
          : "info",
      module: "capacity",
      entityType: "capacity-plan",
      entityId: id,
      actionView: "operations",
      targetDepartment: "workforce",
    }).catch(() => undefined);
    return { capacityPlan: updated };
  }

  if (action === "transition-privacy-request") {
    if (access.role === "employee" && access.department !== "legal")
      throw new Error("غير مصرح بإدارة طلبات الخصوصية");
    const item = await db.query.dataSubjectRequests.findFirst({
      where: eq(dataSubjectRequests.id, id),
    });
    if (!item) throw new Error("طلب الخصوصية غير موجود");
    const allowed = new Set([
      "received",
      "verifying",
      "processing",
      "completed",
      "rejected",
    ]);
    if (!allowed.has(nextStatus)) throw new Error("حالة الطلب غير صحيحة");
    const [updated] = await db
      .update(dataSubjectRequests)
      .set({
        status: nextStatus,
        assignedTo:
          text(payload.assignedTo, 160).toLowerCase() ||
          item.assignedTo ||
          actor,
        completedAt:
          nextStatus === "completed"
            ? new Date().toISOString()
            : item.completedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(dataSubjectRequests.id, id))
      .returning();
    await recordStatusChange({
      entityType: "data-subject-request",
      entityId: id,
      fromStatus: item.status,
      toStatus: nextStatus,
      reason,
      actorEmail: actor,
      correlationId,
    });
    await auditPortalAction({
      actorEmail: actor,
      action,
      entityType: "data-subject-request",
      entityId: id,
      before: {
        ...item,
        email: "[محجوب]",
        mobile: item.mobile ? "[محجوب]" : null,
      },
      after: {
        ...updated,
        email: "[محجوب]",
        mobile: updated.mobile ? "[محجوب]" : null,
      },
      reason,
      correlationId,
    });
    await emitPortalNotification({
      eventType: "privacy-request-updated",
      title: "تغيّرت حالة طلب خصوصية",
      message: `${item.trackingCode} — ${item.status} ← ${nextStatus}.`,
      severity: nextStatus === "completed" ? "success" : "info",
      module: "privacy",
      entityType: "data-subject-request",
      entityId: id,
      actionView: "operations",
      targetRole: "admin",
    }).catch(() => undefined);
    return { privacyRequest: updated };
  }

  throw new Error("إجراء التحديث غير صحيح");
}
