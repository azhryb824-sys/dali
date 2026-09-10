import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  legalExternalShareBundleItems,
  legalExternalShareBundles,
  legalLawyers,
  legalRecords,
  portalActivity,
} from "@/db/schema";
import { hashShareToken } from "@/lib/company-documents";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const preciseSaudiTime = (value: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{64}$/i.test(token))
    return Response.json({ error: "رابط المشاركة غير صالح" }, { status: 404 });
  const db = getDb();
  const tokenHash = await hashShareToken(token);
  const bundle = await db.query.legalExternalShareBundles.findFirst({
    where: eq(legalExternalShareBundles.tokenHash, tokenHash),
  });
  if (
    !bundle ||
    bundle.revokedAt ||
    Date.parse(bundle.expiresAt) <= Date.now() ||
    bundle.downloadCount >= bundle.maxDownloads
  )
    return Response.json(
      { error: "انتهت صلاحية رابط المشاركة" },
      { status: 410 },
    );
  const [matter, lawyer, items] = await Promise.all([
    db.query.legalRecords.findFirst({
      where: and(
        eq(legalRecords.id, bundle.legalRecordId),
        isNull(legalRecords.deletedAt),
      ),
    }),
    db.query.legalLawyers.findFirst({
      where: eq(legalLawyers.id, bundle.lawyerId),
    }),
    db
      .select()
      .from(legalExternalShareBundleItems)
      .where(eq(legalExternalShareBundleItems.bundleId, bundle.id))
      .orderBy(asc(legalExternalShareBundleItems.id)),
  ]);
  if (!matter)
    return Response.json({ error: "الملف القانوني غير متاح" }, { status: 410 });
  const accessedAt = new Date().toISOString();
  await Promise.all([
    db
      .update(legalExternalShareBundles)
      .set({ lastAccessedAt: accessedAt })
      .where(
        and(
          eq(legalExternalShareBundles.id, bundle.id),
          isNull(legalExternalShareBundles.revokedAt),
        ),
      ),
    db.insert(portalActivity).values({
      actorEmail: "external-lawyer-share",
      action: "legal-external-bundle-opened",
      entityType: "legal-record",
      entityId: String(bundle.legalRecordId),
      afterJson: JSON.stringify({
        bundleId: bundle.id,
        lawyerId: bundle.lawyerId,
        itemCount: items.length,
        accessedAt,
      }),
      correlationId: crypto.randomUUID(),
      source: "shared-link",
    }),
  ]);

  const itemCards = items
    .map(
      (item, index) => `<a class="file" href="/api/legal-share-bundles/${token}/items/${item.id}">
        <span class="number">${new Intl.NumberFormat("ar-SA").format(index + 1)}</span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.fileName)}</small></span>
        <b>تنزيل</b>
      </a>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>مرفقات ${escapeHtml(matter.referenceCode)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f6f7;color:#102f3c;font-family:Tajawal,"Segoe UI",sans-serif;line-height:1.7}.shell{width:min(820px,calc(100% - 28px));margin:32px auto}.head{padding:28px;border-radius:20px;background:linear-gradient(135deg,#0b3545,#164f60);color:#fff;box-shadow:0 18px 45px rgba(11,53,69,.18)}.eyebrow{margin:0;color:#bfe3e6;font-size:14px}.head h1{margin:7px 0 10px;font-size:clamp(24px,5vw,36px)}.head p{margin:0;color:#d7e9eb}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.facts span{padding:13px;border:1px solid #d7e2e5;border-radius:12px;background:#fff}.facts small,.file small{display:block;color:#677b83;font-size:13px}.facts strong{display:block;margin-top:3px;font-size:15px}.files{display:grid;gap:9px}.file{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:13px;padding:15px;border:1px solid #d7e2e5;border-radius:13px;background:#fff;color:inherit;text-decoration:none;box-shadow:0 5px 18px rgba(16,47,60,.05)}.file:hover,.file:focus-visible{border-color:#2a7583;outline:3px solid rgba(42,117,131,.16)}.number{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#e7f1f3;color:#17606e;font-weight:800}.file b{color:#176d57}.notice{margin:16px 0 0;padding:13px;border-radius:11px;background:#fff4d9;color:#6f5214;font-size:14px}@media(max-width:620px){.shell{margin:14px auto}.head{padding:21px}.facts{grid-template-columns:1fr}.file{grid-template-columns:auto 1fr}.file>b{grid-column:2}}
</style></head><body><main class="shell"><section class="head"><p class="eyebrow">مشاركة قانونية مشفرة</p><h1>${escapeHtml(matter.title)}</h1><p>${escapeHtml(matter.referenceCode)} · ${escapeHtml(matter.counterparty)}</p></section><section class="facts"><span><small>المحامي المستلم</small><strong>${escapeHtml(lawyer?.fullName || "المحامي الخارجي")}</strong></span><span><small>وقت المشاركة</small><strong>${escapeHtml(preciseSaudiTime(bundle.sharedAt))}</strong></span><span><small>صلاحية الرابط حتى</small><strong>${escapeHtml(preciseSaudiTime(bundle.expiresAt))}</strong></span></section><section class="files" aria-label="المرفقات">${itemCards}</section><p class="notice">هذا الرابط مخصص للمستلم المسجل، وتُسجل عمليات فتح وتنزيل المرفقات لأغراض حماية الملف القانوني.</p></main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
