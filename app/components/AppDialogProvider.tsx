"use client";

import { FormEvent, ReactNode, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { normalizeAppLocale, translateUi } from "@/lib/i18n";

type DialogKind = "prompt" | "confirm" | "alert";
type DialogResult = string | boolean | undefined | null;

export type AppDialogOptions = {
  title?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  minLength?: number;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel" | "url";
  multiline?: boolean;
  readOnly?: boolean;
  copyable?: boolean;
  tone?: "default" | "danger";
};

type DialogRequest = {
  id: string;
  kind: DialogKind;
  message: string;
  options: AppDialogOptions;
  resolve: (value: DialogResult) => void;
};

let dialogHost: ((request: DialogRequest) => void) | null = null;
const waitingForHost: DialogRequest[] = [];

function send(request: DialogRequest) {
  if (dialogHost) dialogHost(request);
  else waitingForHost.push(request);
}

function requestDialog(kind: DialogKind, message: string, options: AppDialogOptions = {}) {
  return new Promise<DialogResult>((resolve) => {
    send({ id: crypto.randomUUID(), kind, message, options, resolve });
  });
}

export async function appPrompt(message: string, options: AppDialogOptions = {}) {
  return await requestDialog("prompt", message, options) as string | null;
}

export async function appConfirm(message: string, options: AppDialogOptions = {}) {
  return await requestDialog("confirm", message, options) as boolean;
}

export async function appAlert(message: string, options: AppDialogOptions = {}) {
  await requestDialog("alert", message, options);
}

function translated(value: string) {
  if (typeof document === "undefined") return value;
  return translateUi(value, normalizeAppLocale(document.documentElement.lang) || "ar");
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const queue = useRef<DialogRequest[]>([]);
  const activeRef = useRef<DialogRequest | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const present = useCallback((request: DialogRequest, preserveFocus = false) => {
    if (activeRef.current) {
      queue.current.push(request);
      return;
    }
    if (!preserveFocus) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeRef.current = request;
    setValue(request.options.defaultValue || "");
    setCopyStatus("");
    setActive(request);
  }, []);

  useEffect(() => {
    dialogHost = present;
    waitingForHost.splice(0).forEach((request) => present(request));
    return () => {
      if (dialogHost === present) dialogHost = null;
    };
  }, [present]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      if (active.kind === "prompt") {
        inputRef.current?.focus();
        if (active.options.readOnly) inputRef.current?.select();
      } else primaryButtonRef.current?.focus();
    }, 0);
    return () => { document.body.style.overflow = previousOverflow; };
  }, [active]);

  const finish = useCallback((result: DialogResult) => {
    const current = activeRef.current;
    if (!current) return;
    activeRef.current = null;
    setActive(null);
    current.resolve(result);
    const next = queue.current.shift();
    window.setTimeout(() => {
      if (next) present(next, true);
      else {
        previousFocus.current?.focus();
        previousFocus.current = null;
      }
    }, 0);
  }, [present]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(active.kind === "prompt" ? null : active.kind === "confirm" ? false : undefined);
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, finish]);

  function cancel() {
    if (!active) return;
    finish(active.kind === "prompt" ? null : active.kind === "confirm" ? false : undefined);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    if (active.kind === "prompt") {
      if ((active.options.minLength || 0) > value.trim().length) return;
      finish(value);
    } else if (active.kind === "confirm") finish(true);
    else finish(undefined);
  }

  async function copyValue() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(translated("تم النسخ"));
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyStatus(translated("تم تحديد النص للنسخ"));
    }
  }

  return <>
    {children}
    {active && <div className="app-dialog-layer" role="presentation">
      <button className="app-dialog-backdrop" type="button" aria-label={translated("إغلاق")} onClick={cancel} />
      <section
        ref={cardRef}
        className={`app-dialog-card ${active.options.tone === "danger" ? "danger" : ""}`}
        role={active.kind === "alert" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`app-dialog-title-${active.id}`}
        aria-describedby={`app-dialog-message-${active.id}`}
      >
        <header>
          <div>
            <span>{active.kind === "alert" ? translated("تنبيه") : translated("تأكيد الإجراء")}</span>
            <h2 id={`app-dialog-title-${active.id}`}>{active.options.title || (active.kind === "alert" ? translated("تنبيه") : translated("تأكيد"))}</h2>
          </div>
          <button type="button" aria-label={translated("إغلاق")} onClick={cancel}>×</button>
        </header>
        <form onSubmit={submit}>
          <p id={`app-dialog-message-${active.id}`}>{active.message}</p>
          {active.kind === "prompt" && (active.options.multiline
            ? <textarea
                ref={inputRef as RefObject<HTMLTextAreaElement>}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={active.options.placeholder}
                minLength={active.options.minLength}
                readOnly={active.options.readOnly}
                rows={active.options.readOnly ? 5 : 4}
              />
            : <input
                ref={inputRef as RefObject<HTMLInputElement>}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={active.options.placeholder}
                minLength={active.options.minLength}
                inputMode={active.options.inputMode}
                readOnly={active.options.readOnly}
              />)}
          {copyStatus && <small role="status">{copyStatus}</small>}
          <div className="app-dialog-actions">
            {active.kind !== "alert" && <button type="button" onClick={cancel}>{active.options.cancelLabel || translated("إلغاء")}</button>}
            {active.kind === "prompt" && active.options.copyable && <button type="button" onClick={() => void copyValue()}>{translated("نسخ")}</button>}
            <button
              ref={primaryButtonRef}
              className="primary"
              type="submit"
              disabled={active.kind === "prompt" && (active.options.minLength || 0) > value.trim().length}
            >
              {active.options.confirmLabel || translated(active.kind === "alert" ? "إغلاق" : "تأكيد")}
            </button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
