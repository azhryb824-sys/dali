"use client";
import { useState } from "react";
import CommercialDetailsFields from "@/app/components/CommercialDetailsFields";
import CommercialAttachmentFields from "@/app/components/CommercialAttachmentFields";
import CommercialLineItemsEditor, { newCommercialLine, type EditableCommercialLine } from "@/app/components/CommercialLineItemsEditor";
import RequestedPaymentSchedule from "@/app/components/RequestedPaymentSchedule";
import { readCommercialTerms } from "@/lib/commercial-terms";

type Quote = { commercialTermsJson: string | null; issueDate: string; validUntil: string; quantityMode: "fixed" | "open"; seasonType: "regular" | "ramadan" | "hajj"; paymentScheduleJson: string | null; vatRateBps: number; accommodationParty: string | null; transportParty: string | null; recordVersion: number; assumptions?: string | null; discountHalalas?: number };
type Item = { id: number; profession: string; quantity: number; durationMonths: number; unitPriceHalalas: number; actualSalaryHalalas: number; notes?: string | null; sponsorshipType: string | null; sponsorName: string | null; ajirContractStatus: string | null };
export default function QuoteFullEditFields({ quote, items }: { quote: Quote; items: Item[] }) {
  const [quantityMode, setQuantityMode] = useState(quote.quantityMode);
  const [season, setSeason] = useState(quote.seasonType);
  const [activity, setActivity] = useState(() => quote.assumptions?.split("\n").find(line => line.startsWith("النشاط:"))?.slice(7).trim() || "توريد العمالة");
  const [lines, setLines] = useState<EditableCommercialLine[]>(() => items.length ? items.map(row => ({ ...newCommercialLine(), key: String(row.id), profession: row.profession, quantity: row.quantity || 1, durationMonths: row.durationMonths, unitPrice: row.unitPriceHalalas / 100, actualSalary: row.actualSalaryHalalas / 100, notes: row.notes || "", sponsorshipType: row.sponsorshipType === "other" ? "other" : "dali", sponsorName: row.sponsorName || "", ajirContractStatus: row.ajirContractStatus === "with_ajir" ? "with_ajir" : row.ajirContractStatus === "without_ajir" ? "without_ajir" : "not_applicable" })) : [newCommercialLine()]);
  const terms = readCommercialTerms(quote.commercialTermsJson);
  return <>
    <p className="span-two">جميع بيانات المسودة قابلة للتعديل. يُعاد احتساب الأسعار والضريبة والدفعات على الخادم، ويلزم الاعتماد قبل المشاركة والتحويل.</p>
    <input name="recordVersion" type="hidden" value={quote.recordVersion}/>
    <CommercialDetailsFields defaults={terms}/>
    <label>تاريخ الإصدار<input name="issueDate" type="date" required defaultValue={quote.issueDate}/></label>
    <label>صالح حتى<input name="validUntil" type="date" required defaultValue={quote.validUntil}/></label>
    <label>نوع النشاط<select name="activityLabel" value={activity} onChange={event => setActivity(event.target.value)}>{["توريد العمالة", "المقاولات", "التشغيل والصيانة", "الخدمات الموسمية"].map(label => <option key={label}>{label}</option>)}</select></label>
    <label>نطاق العدد<select name="quantityMode" value={quantityMode} onChange={event => setQuantityMode(event.target.value as typeof quantityMode)}><option value="fixed">عدد محدد</option><option value="open">عدد مفتوح</option></select></label>
    <RequestedPaymentSchedule defaults={{ seasonType: quote.seasonType, paymentSchedule: quote.paymentScheduleJson }} required={quantityMode === "fixed"} onSeasonChange={setSeason}/>
    <CommercialLineItemsEditor lines={lines} onChange={setLines} quantityMode={quantityMode} annual={season === "regular"} workforce={activity === "توريد العمالة"}/>
    <label>نسبة الضريبة %<input name="vatRate" type="number" min={0} max={100} step="0.01" required defaultValue={quote.vatRateBps / 100}/></label>
    {activity !== "توريد العمالة" && <label>الخصم بالريال<input name="discount" type="number" min={0} step="0.01" defaultValue={(quote.discountHalalas || 0) / 100}/></label>}
    <label>السكن على<select name="accommodationParty" defaultValue={quote.accommodationParty || "dali"}><option value="dali">شركة دالي</option><option value="counterparty">الطرف الآخر</option><option value="not_applicable">لا ينطبق</option></select></label>
    <label>النقل على<select name="transportParty" defaultValue={quote.transportParty || "dali"}><option value="dali">شركة دالي</option><option value="counterparty">الطرف الآخر</option><option value="not_applicable">لا ينطبق</option></select></label>
    <label className="span-two">افتراضات العرض<textarea name="assumptions" rows={3} maxLength={2500} defaultValue={(quote.assumptions || "").split("\n").filter(line => !["النشاط:", "موقع الخدمة:", "الضريبة:"].some(prefix => line.startsWith(prefix))).join("\n")}/></label>
    <CommercialAttachmentFields defaults={quote.commercialTermsJson}/>
  </>;
}
