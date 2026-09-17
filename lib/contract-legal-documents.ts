import { eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyDocuments,
  contractPaymentSchedules,
  workforceContracts,
} from "@/db/schema";

type Database = ReturnType<typeof getDb>;
type ContractDocumentIdentity = {
  id: number;
  documentId: number;
  referenceCode: string;
};

type LegalRecordDocumentSource = {
  contractId: number | null;
  fileSnapshotJson: string | null;
};

export type LegalContractDocumentRole =
  | "approved_contract"
  | "contract_pdf"
  | "disputed_invoice"
  | "contract_attachment";

function parseMetadata(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function samePositiveId(value: unknown, expected: number) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed === expected;
}

export function documentMetadataMatchesContract(
  metadataJson: string | null,
  contract: Pick<ContractDocumentIdentity, "id" | "referenceCode">,
) {
  const metadata = parseMetadata(metadataJson);
  if (!metadata) return false;
  return (
    samePositiveId(metadata.contractId, contract.id) ||
    samePositiveId(metadata.linkedContractId, contract.id) ||
    metadata.contractReference === contract.referenceCode
  );
}

export async function loadContractLegalDocuments(
  db: Database,
  contract: ContractDocumentIdentity,
  explicitDocumentIds: Array<number | null | undefined> = [],
) {
  const directIds = [contract.documentId, ...explicitDocumentIds].filter(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value > 0,
  );
  const uniqueDirectIds = [...new Set(directIds)];
  const contractId = String(contract.id);
  const candidates = await db
    .select()
    .from(companyDocuments)
    .where(
      or(
        inArray(companyDocuments.id, uniqueDirectIds),
        like(companyDocuments.metadataJson, `%"contractId":${contractId}%`),
        like(companyDocuments.metadataJson, `%"contractId":"${contractId}"%`),
        like(
          companyDocuments.metadataJson,
          `%"linkedContractId":${contractId}%`,
        ),
        like(
          companyDocuments.metadataJson,
          `%"linkedContractId":"${contractId}"%`,
        ),
        like(
          companyDocuments.metadataJson,
          `%"contractReference":${JSON.stringify(contract.referenceCode)}%`,
        ),
      ),
    );
  const directIdSet = new Set(uniqueDirectIds);
  return candidates
    .filter(
      (document) =>
        directIdSet.has(document.id) ||
        documentMetadataMatchesContract(document.metadataJson, contract),
    )
    .sort((left, right) => left.id - right.id);
}

function positiveDocumentId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function loadLegalRecordContractDocuments(
  db: Database,
  matter: LegalRecordDocumentSource,
) {
  const snapshotDocumentIds = new Set<number>();
  let referredPaymentId = 0;
  if (matter.fileSnapshotJson) {
    try {
      const snapshot = JSON.parse(matter.fileSnapshotJson) as {
        documents?: Array<{ id?: unknown }>;
        payments?: Array<{ invoiceDocumentId?: unknown }>;
        finances?: Array<{ documentId?: unknown }>;
        referral?: { paymentId?: unknown };
      };
      for (const item of snapshot.documents || []) {
        const id = positiveDocumentId(item.id);
        if (id) snapshotDocumentIds.add(id);
      }
      for (const item of snapshot.payments || []) {
        const id = positiveDocumentId(item.invoiceDocumentId);
        if (id) snapshotDocumentIds.add(id);
      }
      for (const item of snapshot.finances || []) {
        const id = positiveDocumentId(item.documentId);
        if (id) snapshotDocumentIds.add(id);
      }
      referredPaymentId = positiveDocumentId(snapshot.referral?.paymentId);
    } catch {
      // Older manually created legal records may not contain a valid snapshot.
    }
  }

  const [contract, referredPayment] = await Promise.all([
    matter.contractId
      ? db.query.workforceContracts.findFirst({
          where: eq(workforceContracts.id, matter.contractId),
        })
      : Promise.resolve(null),
    referredPaymentId
      ? db.query.contractPaymentSchedules.findFirst({
          where: eq(contractPaymentSchedules.id, referredPaymentId),
        })
      : Promise.resolve(null),
  ]);
  const disputedInvoiceDocumentId = positiveDocumentId(
    referredPayment?.invoiceDocumentId,
  );
  if (disputedInvoiceDocumentId)
    snapshotDocumentIds.add(disputedInvoiceDocumentId);

  const documents = contract
    ? await loadContractLegalDocuments(db, contract, [...snapshotDocumentIds])
    : snapshotDocumentIds.size
      ? await db
          .select()
          .from(companyDocuments)
          .where(inArray(companyDocuments.id, [...snapshotDocumentIds]))
      : [];

  return documents
    .filter((document) => document.status === "active")
    .map((document) => {
      let legalDocumentRole: LegalContractDocumentRole =
        "contract_attachment";
      if (document.id === disputedInvoiceDocumentId) {
        legalDocumentRole = "disputed_invoice";
      } else if (contract && document.id === contract.documentId) {
        legalDocumentRole = contract.approvedBy
          ? "approved_contract"
          : "contract_pdf";
      }
      return { ...document, legalDocumentRole };
    })
    .sort((left, right) => {
      const priority: Record<LegalContractDocumentRole, number> = {
        approved_contract: 1,
        contract_pdf: 1,
        disputed_invoice: 2,
        contract_attachment: 3,
      };
      return (
        priority[left.legalDocumentRole] -
          priority[right.legalDocumentRole] ||
        left.id - right.id
      );
    });
}
