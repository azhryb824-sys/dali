import type { Metadata } from "next";
import "./worker.css";

export const metadata: Metadata = { title: { absolute: "الخدمة الذاتية للعامل | شركة دالي" }, description: "خدمة ذاتية محمية لعرض الإسناد والدوام والوثائق.", robots: { index: false, follow: false, nocache: true } };
export default function WorkerLayout({ children }: { children: React.ReactNode }) { return children; }
