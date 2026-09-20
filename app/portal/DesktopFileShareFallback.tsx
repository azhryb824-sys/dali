"use client";

import { useState } from "react";
import { copyDaliFilesOnDesktop, daliDesktopFileShareError, supportsDaliDesktopFileCopy, type DaliShareFileDescriptor } from "@/lib/file-share-runtime";
import { openDaliWhatsApp, type DaliWhatsAppLinks } from "@/lib/whatsapp-runtime";

export default function DesktopFileShareFallback({ files, title, text, links, disabled, onNotice, onError }: {
  files: DaliShareFileDescriptor[];
  title: string;
  text: string;
  links: DaliWhatsAppLinks;
  disabled?: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!supportsDaliDesktopFileCopy()) return null;
  async function copyAndOpen() {
    setBusy(true);
    setMessage("");
    onError("");
    onNotice("");
    try {
      const result = await copyDaliFilesOnDesktop(files, { title, text });
      if (!result.copied) throw new Error(daliDesktopFileShareError(result.reason));
      const message = "نُسخت الملفات الفعلية. في محادثة العميل اضغط Ctrl+V، وتحقق من ظهور المرفقات ثم اضغط إرسال. لم تُرسل الملفات تلقائيًا.";
      setMessage(message);
      onNotice(message);
      openDaliWhatsApp("app", links);
    } catch (error) {
      onError(error instanceof Error ? error.message : "تعذرت مشاركة الملفات");
    } finally {
      setBusy(false);
    }
  }
  return <><button type="button" disabled={disabled || busy} onClick={() => void copyAndOpen()}>
    {busy ? "جارٍ نسخ الملفات…" : "نسخ الملفات وفتح واتساب"}
  </button>{message && <p role="status">{message}</p>}</>;
}
