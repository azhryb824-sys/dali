import type { Metadata } from "next";
import "./client.css";

export const metadata: Metadata = { title: { absolute: "بوابة العميل | شركة دالي للتشغيل والصيانة" }, description: "بوابة عميل محمية لمتابعة أوامر التشغيل والدوام والمستندات.", robots: { index: false, follow: false, nocache: true } };
export default function ClientLayout({ children }: { children: React.ReactNode }) { return children; }
