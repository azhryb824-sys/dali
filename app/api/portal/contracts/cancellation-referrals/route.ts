import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { legalRecords } from "@/db/schema";
import { hasPortalPermission, requirePortalApiRole } from "@/lib/portal-access";
import { jsonNoStore } from "@/lib/security";

type CancellationSnapshot = {
  request?: {
    type?: string;
    requestedStatus?: string;
    reason?: string;
    requestedAt?: string;
  };
};

function readRequest(fileSnapshotJson: string | null) {
  if (!fileSnapshotJson) return null;
  try {
    const snapshot = JSON.parse(fileSnapshotJson) as CancellationSnapshot;
    const request = snapshot.request;
    if (
      request?.type === "contract-cancellation" &&
      (request.requestedStatus === "cancelled" || request.requestedStatus === "terminated")
    ) {
      return request;
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET() {
  const access = await requirePortalApiRole(["admin", "manager", "employee"]);
  if (!access || !(await hasPortalPermission(access, "workforce", "read"))) {
    return jsonNoStore({ error: "غير مصرح" }, { status: 403 });
  }

  const db = getDb();
  const cases = await db
    .select({
      id: legalRecords.id,
      contractId: legalRecords.contractId,
      status: legalRecords.status,
      referralReason: legalRecords.referralReason,
      referredAt: legalRecords.referredAt,
      fileSnapshotJson: legalRecords.fileSnapshotJson,
    })
    .from(legalRecords)
    .where(eq(legalRecords.status, "reviewing"))
    .orderBy(desc(legalRecords.referredAt), desc(legalRecords.createdAt));

  const referrals = cases.flatMap((matter) => {
    const request = readRequest(matter.fileSnapshotJson);
    if (!request || !matter.contractId) return [];
    return [
      {
        id: matter.id,
        contractId: matter.contractId,
        status: matter.status,
        requestedStatus: request.requestedStatus as "cancelled" | "terminated",
        reason: request.reason || matter.referralReason || "",
        referredAt: request.requestedAt || matter.referredAt,
      },
    ];
  });

  return jsonNoStore({ referrals });
}
