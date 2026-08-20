import type { ReactNode } from "react";
import PublicPageShell from "@/app/components/PublicPageShell";
import ConstructionSectionNav from "./ConstructionSectionNav";

export default function ConstructionSubpage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <PublicPageShell><ConstructionSectionNav/><section className="inner-hero construction-sub-hero"><p className="eyebrow light"><span/>{eyebrow}</p><h1>{title}</h1><p>{intro}</p></section>{children}</PublicPageShell>;
}
