import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: { absolute: "النظام الإداري | شركة دالي للتشغيل والصيانة" },
  description: "النظام الإداري الداخلي لشركة دالي للتشغيل والصيانة.",
  applicationName: "نظام دالي الإداري",
  icons: { icon: [{ url: "/dally-logo.jpg", type: "image/jpeg" }], shortcut: "/dally-logo.jpg", apple: "/dally-logo.jpg" },
  robots: { index: false, follow: false, nocache: true },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
