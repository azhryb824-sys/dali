"use client";

import { useEffect } from "react";
import { appConfirm } from "@/app/components/AppDialogProvider";

const dialogs = '[role="dialog"], .record-modal, .request-drawer, .issue-modal, .stamp-picker-dialog';
const fields = 'input:not([type="hidden"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled]), [contenteditable="true"]';

export default function PortalFormProtection() {
  useEffect(() => {
    const dirty = new Set<HTMLElement>();
    const allowed = new WeakSet<HTMLElement>();
    let confirming = false;
    const visible = (element: HTMLElement) => element.isConnected && element.getClientRects().length > 0;
    const editing = (element: HTMLElement) => !element.closest('.app-dialog-layer') && Boolean(element.querySelector('form, ' + fields));
    const topDialog = () => Array.from(document.querySelectorAll<HTMLElement>(dialogs)).filter(visible).at(-1);
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const changed = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const dialog = event.target.closest<HTMLElement>(dialogs);
      for (const old of dirty) if (!old.isConnected) dirty.delete(old);
      if (dialog && editing(dialog)) dirty.add(dialog);
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      if (target.closest('.app-dialog-layer')) return;
      const backdrop = target.closest('[class*="backdrop"]');
      const dialog = backdrop ? backdrop.parentElement?.querySelector<HTMLElement>(dialogs) || topDialog() : target.closest<HTMLElement>(dialogs) || (target.matches(".modal-layer, .stamp-picker-backdrop") ? target.querySelector<HTMLElement>(dialogs) : null);
      if (!dialog || !editing(dialog)) return;
      // Outside clicks never discard an entry form, even before its first edit.
      if (backdrop || target === dialog.parentElement) { stop(event); return; }
      const button = target.closest<HTMLElement>('button, [data-dialog-close]');
      if (!button || allowed.has(button)) { if (button) allowed.delete(button); return; }
      const label = (button.getAttribute('aria-label') || button.textContent || '').trim();
      const closes = button.hasAttribute('data-dialog-close') || /^(إغلاق|إلغاء|Close|Cancel|বন্ধ|বাতিল|×)$/i.test(label);
      if (!closes || !dirty.has(dialog)) return;
      stop(event);
      if (confirming) return;
      confirming = true;
      void appConfirm("لديك بيانات غير محفوظة. هل تريد إغلاق النافذة وفقدان التعديلات؟", { title: "تأكيد إغلاق النموذج", confirmLabel: "إغلاق وفقدان التعديلات", cancelLabel: "متابعة الإدخال", tone: "danger" }).then(confirmed => {
        if (confirmed && button.isConnected) { dirty.delete(dialog); allowed.add(button); button.click(); }
      }).finally(() => { confirming = false; });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.app-dialog-layer')) return;
      const dialog = topDialog();
      if (dialog && editing(dialog)) stop(event);
    };
    const leave = (event: BeforeUnloadEvent) => {
      for (const dialog of dirty) if (!dialog.isConnected) dirty.delete(dialog);
      if ([...dirty].some(visible)) { event.preventDefault(); event.returnValue = ''; }
    };
    document.addEventListener('input', changed, true);
    document.addEventListener('change', changed, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('beforeunload', leave);
    return () => {
      document.removeEventListener('input', changed, true); document.removeEventListener('change', changed, true);
      document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true);
      window.removeEventListener('beforeunload', leave);
    };
  }, []);
  return null;
}
