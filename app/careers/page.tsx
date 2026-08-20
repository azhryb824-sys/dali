import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPageShell from "@/app/components/PublicPageShell";
import { ManagedCollectionIndex } from "@/app/components/ManagedContentPages";
import PublicRequestForm from "@/app/components/PublicRequestForm";
import { getWebsiteContent, publishedEntries } from "@/lib/website-content";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const content = await getWebsiteContent(); const hasJobs = publishedEntries(content, "jobs").length > 0; return { title: "الوظائف وفرص العمل", description: "الفرص الوظيفية المنشورة لدى شركة دالي وطريقة إرسال طلب توظيف عام للعمل في خدماتها ومشروعاتها.", alternates: { canonical: "/careers" }, robots: { index: hasJobs, follow: true } }; }
export default async function CareersPage() { const content = await getWebsiteContent(); if (!content.visibility.jobs) notFound(); const entries = publishedEntries(content, "jobs"); return <PublicPageShell><ManagedCollectionIndex content={content} collectionKey="jobs" title="انضم إلى فريق يصنع فرقًا في الميدان" description="اكتشف الفرص المتاحة لدى شركة دالي، وشاركنا خبرتك المهنية للمساهمة في خدمة المنشآت والمشروعات في مدن المملكة." entries={entries} emptyTitle="لا توجد فرص معلنة الآن" emptyText="يمكنك تسجيل اهتمامك الوظيفي العام، وسنعود إليك عندما تتوافر فرصة مناسبة لتخصصك."/><section className="inner-content public-request-section"><div className="inner-heading"><p className="eyebrow"><span/>طلب توظيف عام</p><h2>عرّفنا بتخصصك وخبرتك</h2><p>أرسل المعلومات المهنية الأساسية فقط؛ ولا ترسل رقم إقامة أو صور وثائق أو بيانات بنكية في هذه المرحلة.</p></div><PublicRequestForm specialization="طلب توظيف" submitLabel="إرسال طلب التوظيف" detailsLabel="التخصص والخبرة" detailsPlaceholder="اذكر مهنتك وخبرتك والمدينة وأوقات التواصل المناسبة."/></section></PublicPageShell>; }
