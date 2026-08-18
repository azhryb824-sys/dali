import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { chartOfAccounts, companyDocuments, employees, financialRecords, journalEntries, purchaseInvoices, suppliers, workforceContracts } from "@/db/schema";
import { createDraftJournal } from "@/lib/accounting";
import { auditPortalAction } from "@/lib/audit";
import { makeReference, objectKey, safeFileName } from "@/lib/company-documents";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { jsonNoStore, rejectCrossSiteRequest, validateUploadedFile } from "@/lib/security";

const TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 12 * 1024 * 1024;
const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0; };
const money = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : -1; };

async function authorize(write = false) {
  const access = await requirePortalApiRole(write ? ["admin", "manager"] : ["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "finance", write ? "write" : "read"))) return null;
  return access;
}

export async function GET() {
  const access = await authorize();
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  const [supplierRows, invoiceRows, employeeRows, contractRows, entries, receivables] = await Promise.all([
    db.select().from(suppliers).orderBy(desc(suppliers.id)).limit(500),
    db.select().from(purchaseInvoices).orderBy(desc(purchaseInvoices.id)).limit(1000),
    db.select({ id: employees.id, employeeNumber: employees.employeeNumber, fullName: employees.fullName }).from(employees).orderBy(employees.fullName),
    db.select({ id: workforceContracts.id, referenceCode: workforceContracts.referenceCode, clientName: workforceContracts.clientName }).from(workforceContracts).orderBy(desc(workforceContracts.id)).limit(500),
    db.select({ id: journalEntries.id, status: journalEntries.status, entryNumber: journalEntries.entryNumber, postedAt: journalEntries.postedAt }).from(journalEntries).orderBy(desc(journalEntries.id)).limit(2000),
    db.select().from(financialRecords).orderBy(desc(financialRecords.id)).limit(2000),
  ]);
  return jsonNoStore({ suppliers: supplierRows, invoices: invoiceRows, employees: employeeRows, contracts: contractRows, entries, receivables: receivables.filter((row) => ["workforce_invoice", "invoice", "progress_claim"].includes(row.category) && row.postingStatus === "posted" && row.status !== "paid") });
}

export async function POST(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await authorize(true);
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await request.json() as Record<string, unknown>;
      const legalName = clean(body.legalName);
      if (legalName.length < 3) return jsonNoStore({ error: "اسم المورد غير مكتمل" }, { status: 400 });
      const [saved] = await db.insert(suppliers).values({
        supplierCode: `SUP-${Date.now().toString(36).toUpperCase()}`,
        legalName, commercialRegistration: clean(body.commercialRegistration, 40) || null,
        vatNumber: clean(body.vatNumber, 30) || null, contactName: clean(body.contactName) || null,
        mobile: clean(body.mobile, 30) || null, email: clean(body.email, 160) || null,
        address: clean(body.address, 300) || null, createdBy: access.user.email,
      }).returning();
      await auditPortalAction({ actorEmail: access.user.email, action: "supplier-created", entityType: "supplier", entityId: saved.id, after: saved });
      return jsonNoStore({ supplier: saved }, { status: 201 });
    } catch (error) { return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر حفظ المورد" }, { status: 400 }); }
  }

  let storageKey = "";
  let documentId = 0;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonNoStore({ error: "المرفق إلزامي لفاتورة المشتريات أو مصروف الموظف" }, { status: 400 });
    const validation = await validateUploadedFile(file, { contentTypes: TYPES, maxBytes: MAX_BYTES });
    if (!validation.valid) return jsonNoStore({ error: validation.error }, { status: 400 });
    const expenseType = clean(form.get("expenseType"), 30);
    const supplierId = positiveId(form.get("supplierId"));
    const employeeId = positiveId(form.get("employeeId"));
    const contractId = positiveId(form.get("contractId"));
    const subtotalHalalas = money(form.get("subtotal"));
    const vatHalalas = money(form.get("vat"));
    const invoiceDate = clean(form.get("invoiceDate"), 10);
    const dueDate = clean(form.get("dueDate"), 10);
    const description = clean(form.get("description"), 500);
    const supplierInvoiceNumber = clean(form.get("supplierInvoiceNumber"), 80);
    if (!new Set(["supplier_invoice", "employee_expense"]).has(expenseType) || subtotalHalalas < 0 || vatHalalas < 0 || description.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < invoiceDate || supplierInvoiceNumber.length < 1) return jsonNoStore({ error: "بيانات الفاتورة غير مكتملة أو غير صحيحة" }, { status: 400 });
    if (expenseType === "supplier_invoice" && !supplierId) return jsonNoStore({ error: "اختر المورد" }, { status: 400 });
    if (expenseType === "employee_expense" && !employeeId) return jsonNoStore({ error: "اختر الموظف صاحب المصروف" }, { status: 400 });
    const fileName = safeFileName(file.name);
    storageKey = objectKey("purchase-invoices", fileName);
    await getRuntimeEnv().BUCKET.put(storageKey, validation.bytes, { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: access.user.email, validation: validation.validationDetails } });
    const [document] = await db.insert(companyDocuments).values({ referenceCode: makeReference("PUR"), title: `${expenseType === "employee_expense" ? "مصروف موظف" : "فاتورة مشتريات"} — ${supplierInvoiceNumber}`, category: "finance", documentType: expenseType, fileName, storageKey, contentType: file.type, sizeBytes: file.size, source: "purchase-module", validationStatus: "signature-validated", validationDetails: validation.validationDetails, createdBy: access.user.email }).returning();
    documentId = document.id;
    const [saved] = await db.insert(purchaseInvoices).values({ referenceCode: makeReference("PINV"), supplierInvoiceNumber, expenseType, supplierId: supplierId || null, employeeId: employeeId || null, contractId: contractId || null, documentId, invoiceDate, dueDate, description, subtotalHalalas, vatHalalas, totalHalalas: subtotalHalalas + vatHalalas, createdBy: access.user.email }).returning();
    await auditPortalAction({ actorEmail: access.user.email, action: "purchase-invoice-created", entityType: "purchase-invoice", entityId: saved.id, after: saved });
    return jsonNoStore({ invoice: saved, document }, { status: 201 });
  } catch (error) {
    if (documentId) await db.delete(companyDocuments).where(eq(companyDocuments.id, documentId)).catch(() => undefined);
    if (storageKey) await getRuntimeEnv().BUCKET.delete(storageKey).catch(() => undefined);
    return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر حفظ الفاتورة" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (rejectCrossSiteRequest(request)) return jsonNoStore({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
  const access = await authorize(true);
  if (!access) return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = positiveId(body.id); const action = clean(body.action, 30); const db = getDb();
    const invoice = await db.query.purchaseInvoices.findFirst({ where: eq(purchaseInvoices.id, id) });
    if (!invoice) return jsonNoStore({ error: "الفاتورة غير موجودة" }, { status: 404 });
    const now = new Date().toISOString();
    if (action === "approve") {
      if (invoice.status !== "draft" || invoice.createdBy.toLowerCase() === access.user.email.toLowerCase()) return jsonNoStore({ error: "يلزم اعتماد الفاتورة من مستخدم آخر" }, { status: 409 });
      const accounts = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.isPosting, true), eq(chartOfAccounts.status, "active")));
      const account = (code: string) => accounts.find((row) => row.code === code);
      const expense = account(invoice.expenseType === "employee_expense" ? "5200" : invoice.contractId ? "5100" : "5200"); const vat = account("1400"); const payable = account("2100");
      if (!expense || !payable || (invoice.vatHalalas > 0 && !vat)) return jsonNoStore({ error: "دليل الحسابات غير مكتمل للمشتريات والضريبة" }, { status: 409 });
      const dimensions = { contractId: invoice.contractId, employeeId: invoice.employeeId };
      const lines = [{ accountId: expense.id, debitHalalas: invoice.subtotalHalalas, description: invoice.description, ...dimensions }, { accountId: payable.id, creditHalalas: invoice.totalHalalas, description: `ذمم دائنة — ${invoice.description}`, ...dimensions }];
      if (invoice.vatHalalas > 0 && vat) lines.push({ accountId: vat.id, debitHalalas: invoice.vatHalalas, description: `ضريبة مدخلات — ${invoice.description}`, ...dimensions });
      const journal = await createDraftJournal({ entryDate: invoice.invoiceDate, description: `إثبات ${invoice.referenceCode} — ${invoice.description}`, sourceType: "purchase-invoice", sourceId: String(invoice.id), actorEmail: access.user.email, lines });
      const [updated] = await db.update(purchaseInvoices).set({ status: "approved", postingStatus: "draft", journalEntryId: journal.entry.id, approvedBy: access.user.email, approvedAt: now, updatedAt: now }).where(eq(purchaseInvoices.id, id)).returning();
      return jsonNoStore({ invoice: updated, journal: journal.entry });
    }
    if (action === "sync") {
      if (!invoice.journalEntryId) return jsonNoStore({ error: "لا يوجد قيد مرتبط" }, { status: 409 });
      const journal = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, invoice.journalEntryId) });
      const postingStatus = journal?.status === "posted" ? "posted" : journal?.status === "reversed" ? "reversed" : "draft";
      const status = postingStatus === "posted" && invoice.status === "approved" ? "posted" : invoice.status;
      let paidAt = invoice.paidAt; let paidBy = invoice.paidBy;
      if (invoice.paymentJournalEntryId) { const payment = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, invoice.paymentJournalEntryId) }); if (payment?.status === "posted") { paidAt = payment.postedAt || now; paidBy = payment.postedBy; } }
      const [updated] = await db.update(purchaseInvoices).set({ postingStatus, status: paidAt ? "paid" : status, paidAt, paidBy, updatedAt: now }).where(eq(purchaseInvoices.id, id)).returning();
      return jsonNoStore({ invoice: updated });
    }
    if (action === "pay") {
      if (invoice.status !== "posted" || invoice.postingStatus !== "posted" || invoice.paymentJournalEntryId) return jsonNoStore({ error: "يجب ترحيل قيد الفاتورة أولاً وألا يكون لها قيد سداد سابق" }, { status: 409 });
      const accounts = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.isPosting, true), eq(chartOfAccounts.status, "active")));
      const payable = accounts.find((row) => row.code === "2100"); const bank = accounts.find((row) => row.code === "1200");
      if (!payable || !bank) return jsonNoStore({ error: "حساب الذمم الدائنة أو البنك غير مهيأ" }, { status: 409 });
      const dimensions = { contractId: invoice.contractId, employeeId: invoice.employeeId };
      const journal = await createDraftJournal({ entryDate: now.slice(0, 10), description: `سداد ${invoice.referenceCode} — ${invoice.description}`, sourceType: "purchase-payment", sourceId: String(invoice.id), actorEmail: access.user.email, lines: [{ accountId: payable.id, debitHalalas: invoice.totalHalalas, description: `تسوية ذمة — ${invoice.description}`, ...dimensions }, { accountId: bank.id, creditHalalas: invoice.totalHalalas, description: `سداد من البنك — ${invoice.description}`, ...dimensions }] });
      const [updated] = await db.update(purchaseInvoices).set({ status: "payment_pending", paymentJournalEntryId: journal.entry.id, updatedAt: now }).where(eq(purchaseInvoices.id, id)).returning();
      return jsonNoStore({ invoice: updated, journal: journal.entry });
    }
    return jsonNoStore({ error: "الإجراء غير مدعوم" }, { status: 400 });
  } catch (error) { return jsonNoStore({ error: error instanceof Error ? error.message : "تعذّر تنفيذ الإجراء" }, { status: 400 }); }
}
