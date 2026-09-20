import { translateUi, type AppLocale } from "@/lib/i18n";

type TranslationState = { source: string; rendered: string };
const originalText = new WeakMap<Text, TranslationState>();
const implicitOptionValues = new WeakMap<Element, string>();
const originalAttributes = new WeakMap<Element, Map<string, TranslationState>>();
const attributes = ["placeholder", "aria-label", "title"] as const;
const excluded = 'script,style,noscript,template,code,pre,[translate="no"],.notranslate,[data-dali-no-translate],[data-dali-localized],[contenteditable]:not([contenteditable="false"])';

/** Translate hydrated display nodes in place; never replace a React-owned node. */
export function translateLocaleTree(root: Element, locale: AppLocale, websiteTranslations: Record<string, string> = {}, skipPortal = false) {
  const skip = (element: Element | null) => !element || Boolean(element.closest(excluded)) || (skipPortal && Boolean(element.closest(".admin-shell")));
  const translate = (source: string) => {
    if (locale === "ar") return source;
    const replacement = Object.hasOwn(websiteTranslations, source) ? websiteTranslations[source] : undefined;
    return typeof replacement === "string" && replacement ? replacement : translateUi(source, locale);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      // Textarea text is its value/defaultValue, not a display label.
      if (skip(parent) || (node.nodeType === Node.TEXT_NODE && parent?.closest("textarea"))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const applyAttributes = (element: Element) => {
    if (skip(element)) return;
    if (element.tagName === "OPTION" && (!element.hasAttribute("value") || element.getAttribute("value") === implicitOptionValues.get(element))) {
      const value = Array.from(element.childNodes).map(node => {
        const state = originalText.get(node as Text);
        return state && node.nodeValue === state.rendered ? state.source : node.textContent || "";
      }).join("");
      element.setAttribute("value", value);
      implicitOptionValues.set(element, value);
    }
    let originals = originalAttributes.get(element);
    if (!originals) { originals = new Map(); originalAttributes.set(element, originals); }
    for (const name of attributes) {
      const current = element.getAttribute(name);
      if (current === null) { originals.delete(name); continue; }
      const previous = originals.get(name);
      const source = previous && current === previous.rendered ? previous.source : current;
      const rendered = translate(source);
      originals.set(name, { source, rendered });
      if (current !== rendered) element.setAttribute(name, rendered);
    }
  };
  if (skip(root)) return;
  applyAttributes(root);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.ELEMENT_NODE) { applyAttributes(node as Element); continue; }
    const text = node as Text, current = text.nodeValue || "", previous = originalText.get(text);
    // React can update an existing text node. Never replay a stale count/label.
    const source = previous && current === previous.rendered ? previous.source : current;
    const trimmed = source.trim();
    if (!trimmed) continue;
    const translated = translate(trimmed);
    const rendered = translated === trimmed ? source : source.replace(trimmed, () => translated);
    originalText.set(text, { source, rendered });
    if (current !== rendered) {
      text.nodeValue = rendered;
    }
  }
}

export function observeLocaleTree(root: Element, locale: AppLocale, translations: Record<string, string> = {}, skipPortal = false) {
  let frame = 0, disposed = false;
  const observer = new MutationObserver(() => {
    if (!frame) frame = window.requestAnimationFrame(update);
  });
  const options: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes] };
  function update() {
    frame = 0;
    if (disposed) return;
    // Do not observe our own text/attribute writes or create translation loops.
    observer.disconnect();
    try { translateLocaleTree(root, locale, translations, skipPortal); }
    finally { if (!disposed) observer.observe(root, options); }
  }
  update();
  return () => { disposed = true; observer.disconnect(); if (frame) window.cancelAnimationFrame(frame); };
}
