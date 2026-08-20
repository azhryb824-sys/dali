import Link from "next/link";
import { constructionNavigation } from "@/lib/construction-content";

export default function ConstructionSectionNav() {
  return <nav className="construction-section-nav" aria-label="قسم المقاولات">
    {constructionNavigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
  </nav>;
}
