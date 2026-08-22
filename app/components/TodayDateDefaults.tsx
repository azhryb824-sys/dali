"use client";

import { useEffect } from "react";

export function TodayDateDefaults() {
  useEffect(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const apply = (root: { querySelectorAll<T extends globalThis.Element = globalThis.Element>(selectors: string): NodeListOf<T> }) => root.querySelectorAll<HTMLInputElement>('input[type="date"]:not([data-no-today-default])').forEach((input) => {
      if (!input.value && !input.defaultValue) { input.defaultValue = today; input.value = today; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    apply(document);
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node instanceof HTMLElement) apply(node); })));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
