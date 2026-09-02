import type { Metadata } from "next";
import { PwaRuntime } from "@/app/components/PwaRuntime";
import "./pwa.css";

export const metadata: Metadata = {
  title: { absolute: "نظام دالي | تثبيت iPhone" },
  description: "تثبيت واعتماد نسخة iPhone الخاصة من نظام دالي الإداري.",
  applicationName: "نظام دالي الإداري",
  manifest: "/pwa/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "نظام دالي" },
  icons: { apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  robots: { index: false, follow: false, nocache: true },
};

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  return <><PwaRuntime />{children}</>;
}
