import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { operationRequests } from "@/db/schema";

export async function beginOperation(keyValue: unknown, actorEmail: string, action: string) {
  const key = typeof keyValue === "string" ? keyValue.trim().slice(0, 120) : "";
  if (!/^[a-zA-Z0-9-]{16,120}$/.test(key)) throw new Error("مفتاح العملية غير صالح");
  const db = getDb();
  const now = new Date().toISOString();
  const [inserted] = await db.insert(operationRequests).values({
    key,
    actorEmail: actorEmail.trim().toLowerCase(),
    action,
    status: "processing",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now,
  }).onConflictDoNothing().returning();
  if (inserted) return { key, duplicate: false as const, response: null };

  const existing = await db.query.operationRequests.findFirst({ where: eq(operationRequests.key, key) });
  if (!existing || existing.actorEmail !== actorEmail.trim().toLowerCase() || existing.action !== action) {
    throw new Error("يتعارض مفتاح العملية مع طلب آخر");
  }
  if (existing.status === "completed" && existing.responseJson) {
    return { key, duplicate: true as const, response: JSON.parse(existing.responseJson) as unknown };
  }
  if (existing.status === "processing") throw new Error("العملية نفسها قيد التنفيذ");
  await db.update(operationRequests).set({ status: "processing", errorMessage: null, updatedAt: now }).where(eq(operationRequests.key, key));
  return { key, duplicate: false as const, response: null };
}

export async function completeOperation(key: string, response: unknown) {
  await getDb().update(operationRequests).set({ status: "completed", responseJson: JSON.stringify(response), updatedAt: new Date().toISOString() }).where(eq(operationRequests.key, key));
}

export async function failOperation(key: string, error: unknown) {
  const message = error instanceof Error ? error.message : "تعذّر إكمال العملية";
  await getDb().update(operationRequests).set({ status: "failed", errorMessage: message.slice(0, 1000), updatedAt: new Date().toISOString() }).where(eq(operationRequests.key, key));
}
