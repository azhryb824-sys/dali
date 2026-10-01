import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { translateUi, type AppLocale } from "@/lib/i18n";
export function localizedPublicTree(node: ReactNode, locale: AppLocale, catalog: Record<string, string> = {}): ReactNode {
  if (locale === "ar") return node;
  if (typeof node === "string") return catalog[node] || translateUi(node, locale);
  if (Array.isArray(node)) return Children.map(node, child => localizedPublicTree(child, locale, catalog));
  if (isValidElement<{ children?: ReactNode; "data-dali-no-translate"?: boolean }>(node)) {
    if (node.props["data-dali-no-translate"] || node.type === "script" || node.type === "style") return node;
    const attributes: Record<string, string> = {};
    for (const key of ["title", "alt", "aria-label", "placeholder"]) {
      const value = (node.props as Record<string, unknown>)[key];
      if (typeof value === "string") attributes[key] = catalog[value] || translateUi(value, locale);
    }
    return cloneElement(node, attributes, localizedPublicTree(node.props.children, locale, catalog));
  }
  return node;
}
