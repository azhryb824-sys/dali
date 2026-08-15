import type { Metadata } from "next";
import "./portal.css";
import "./enhancements.css";

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
