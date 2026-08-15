import { eq } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { clientPortalUsers, workerPortalUsers } from "@/db/schema";

const email = (value: string) => value.trim().toLowerCase();

export async function resolveClientAccess(user: ChatGPTUser, markLogin = false) {
  const record = await getDb().query.clientPortalUsers.findFirst({ where: eq(clientPortalUsers.email, email(user.email)) });
  if (!record || record.status !== "active") return null;
  if (markLogin) await getDb().update(clientPortalUsers).set({ displayName: user.displayName, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(clientPortalUsers.email, record.email));
  return { ...record, user: { ...user, email: email(user.email) } };
}

export async function requireClientApiAccess() {
  const user = await getChatGPTUser();
  return user ? resolveClientAccess(user) : null;
}

export async function resolveWorkerAccess(user: ChatGPTUser, markLogin = false) {
  const record = await getDb().query.workerPortalUsers.findFirst({ where: eq(workerPortalUsers.email, email(user.email)) });
  if (!record || record.status !== "active") return null;
  if (markLogin) await getDb().update(workerPortalUsers).set({ displayName: user.displayName, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(workerPortalUsers.email, record.email));
  return { ...record, user: { ...user, email: email(user.email) } };
}

export async function requireWorkerApiAccess() {
  const user = await getChatGPTUser();
  return user ? resolveWorkerAccess(user) : null;
}
