import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companyAssets, companyDocuments, contractPaymentSchedules, contractProfessions, contractWorkerAssignments, workers, workforceContracts } from "@/db/schema";
import { generateIssuedPdf } from "@/lib/pdf-generator";
import { getRuntimeEnv } from "@/lib/runtime-env";

type ContractMetadata = {
  clientAddress?: string;
  clientRepresentative?: string;
  clientRepresentativeTitle?: string;
  paymentTerms?: string;
  workingHours?: string;
  weeklyOff?: string;
  accommodationParty?: string;
  transportParty?: string;
  specialTerms?: string;
};

export async function regenerateWorkforceContractPdf(documentId: number, pdfLanguage: "ar" | "bilingual" = "ar") {
  const db = getDb();
  const [document, contract, assets] = await Promise.all([
    db.query.companyDocuments.findFirst({ where: eq(companyDocuments.id, documentId) }),
    db.query.workforceContracts.findFirst({ where: eq(workforceContracts.documentId, documentId) }),
    db.select().from(companyAssets),
  ]);
  if (!document || !contract || document.documentType !== "workforce_contract") return null;

  const professions = await db.select().from(contractProfessions).where(eq(contractProfessions.contractId, contract.id));
  const paymentSchedule = await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.contractId, contract.id));
  const assignments = await db.select().from(contractWorkerAssignments).where(eq(contractWorkerAssignments.contractId, contract.id));
  const activeAssignments = assignments.filter((item) => item.status === "active");
  const workerIds = [...new Set(activeAssignments.map((item) => item.workerId))];
  const assignedWorkers = workerIds.length
    ? await db.select().from(workers).where(inArray(workers.id, workerIds))
    : [];
  const workerById = new Map(assignedWorkers.map((worker) => [worker.id, worker]));
  let metadata: ContractMetadata = {};
  try { metadata = document.metadataJson ? JSON.parse(document.metadataJson) as ContractMetadata : {}; } catch { metadata = {}; }

  const pdfBytes = await generateIssuedPdf({
    pdfLanguage,
    documentType: "workforce_contract",
    referenceCode: contract.referenceCode,
    clientName: contract.clientName,
    clientCr: contract.clientCr || undefined,
    clientVat: contract.clientVat || undefined,
    title: contract.title,
    issueDate: contract.issueDate,
    amountHalalas: contract.amountHalalas,
    details: contract.details,
    workSite: contract.workSite,
    startDate: contract.startDate,
    endDate: contract.endDate,
    clientAddress: metadata.clientAddress,
    clientRepresentative: metadata.clientRepresentative,
    clientRepresentativeTitle: metadata.clientRepresentativeTitle,
    paymentTerms: metadata.paymentTerms,
    workingHours: metadata.workingHours,
    weeklyOff: metadata.weeklyOff,
    accommodationParty: metadata.accommodationParty,
    transportParty: metadata.transportParty,
    specialTerms: metadata.specialTerms,
    professions: professions.map((profession) => ({
      profession: profession.profession,
      requiredCount: profession.requiredCount,
      sponsorshipType: profession.sponsorshipType as "dali" | "other" | null,
      sponsorName: profession.sponsorName,
      ajirContractStatus: profession.ajirContractStatus as "not_applicable" | "with_ajir" | "without_ajir" | null,
      assignedWorkers: activeAssignments
        .filter((assignment) => assignment.contractProfessionId === profession.id)
        .map((assignment) => workerById.get(assignment.workerId))
        .filter((worker): worker is NonNullable<typeof worker> => Boolean(worker))
        .map((worker) => ({ fullName: worker.fullName, iqamaNumber: worker.iqamaNumber })),
    })),
    paymentSchedule: paymentSchedule.sort((a, b) => a.installmentNumber - b.installmentNumber).map((payment) => ({ title: payment.title, dueDate: payment.dueDate, percentageBps: payment.percentageBps, amountHalalas: payment.amountHalalas })),
  }, assets.map((asset) => ({ slot: asset.slot as "stamp" | "signature", storageKey: asset.storageKey, contentType: asset.contentType })));

  if (pdfLanguage === "ar") {
    await getRuntimeEnv().BUCKET.put(document.storageKey, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { regenerated: "true", referenceCode: contract.referenceCode, template: "letterhead-v2" },
    });
    await db.update(companyDocuments).set({ sizeBytes: pdfBytes.byteLength, updatedAt: new Date().toISOString() }).where(eq(companyDocuments.id, document.id));
  }
  return { bytes: pdfBytes, document };
}
