import { inArray, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { companyDocuments } from "@/db/schema";

type Database = ReturnType<typeof getDb>;
type ContractDocumentIdentity = {
  id: number;
  documentId: number;
  referenceCode: string;
};

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
