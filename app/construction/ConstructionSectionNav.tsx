import { publicRequestLocale } from "@/lib/public-content";
import { translateUi } from "@/lib/i18n";
import Link from "@/app/components/PublicLink";
import { constructionNavigation } from "@/lib/construction-content";

export default async function ConstructionSectionNav() {
  const locale = await publicRequestLocale();
  return <nav className="construction-section-nav" aria-label="قسم المقاولات">
    {constructionNavigation.map((item) => <Link key={item.href} href={item.href}>{translateUi(item.label, locale)}</Link>)}
  </nav>;
}
