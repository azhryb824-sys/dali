import type { Metadata } from "next";
import Script from "next/script";
import { PwaAccessRuntime } from "@/app/components/PwaAccessRuntime";
import "./portal.css";
import "./contract-workflow.css";
import "./approval-actions.css";
import "./enhancements.css";
import "./contract-lifecycle.css";
import "./hr-workspace.css";
import "./hr-enterprise.css";
import "./compliance-workspace.css";
import "./financial-posting.css";
import "./purchasing-workspace.css";
import "./reports-workspace.css";
import "./report-pdf-action.css";
import "./bank-reconciliation.css";
import "./management-enhancements.css";
import "./premium-glass.css";
import "./visual-accessibility.css";
import "./system-guide.css";

export const metadata: Metadata = {
  title: { absolute: "النظام الإداري | شركة دالي للتشغيل والصيانة" },
  description: "النظام الإداري الداخلي لشركة دالي للتشغيل والصيانة.",
  applicationName: "نظام دالي الإداري",
  icons: {
    icon: [{ url: "/dally-logo.jpg", type: "image/jpeg" }],
    shortcut: "/dally-logo.jpg",
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false, nocache: true },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><PwaAccessRuntime />{children}<Script src="/mobile/runtime.js" strategy="afterInteractive" /></>;
}
