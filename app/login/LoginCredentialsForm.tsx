"use client";

import { useEffect, useRef } from "react";

const rememberedIdentifierKey = "dali-remembered-login-identifier-v1";

function normalizeIdentifier(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[^0-9]/g, "")
    .slice(0, 10);
}

export default function LoginCredentialsForm({ returnTo }: { returnTo: string }) {
  const identifierRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(rememberedIdentifierKey);
      if (!remembered || !/^\d{10}$/.test(remembered)) return;
      if (identifierRef.current) identifierRef.current.value = remembered;
      if (rememberRef.current) rememberRef.current.checked = true;
    } catch {
      // Private browsing or a managed device policy may disable local storage.
    }
  }, []);

  function rememberIdentifier() {
    try {
      if (rememberRef.current?.checked && identifierRef.current?.value) {
        const identifier = normalizeIdentifier(identifierRef.current.value);
        if (identifier.length === 10)
          window.localStorage.setItem(rememberedIdentifierKey, identifier);
      } else {
        window.localStorage.removeItem(rememberedIdentifierKey);
      }
    } catch {
      // Login must continue even when the browser blocks local storage.
    }
  }

  return (
    <form
      className="login-credentials-form"
      method="post"
      action="/api/auth/login"
      onSubmit={rememberIdentifier}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <label>
        <span>رقم الهوية / الإقامة</span>
        <input
          ref={identifierRef}
          name="identifier"
          inputMode="numeric"
          pattern="[0-9٠-٩۰-۹]{10}"
          minLength={10}
          maxLength={10}
          autoComplete="username"
          dir="ltr"
          required
        />
      </label>
      <label>
        <span>كلمة المرور</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          required
        />
      </label>
      <label className="remember-login-option">
        <input ref={rememberRef} type="checkbox" />
        <span>حفظ معلومات الدخول على هذا الجهاز</span>
      </label>
      <p className="remember-login-hint">
        يُحفظ رقم الهوية أو الإقامة فقط. لا يحفظ النظام كلمة المرور؛ ويمكن
        للمتصفح حفظها في مدير كلمات المرور الآمن.
      </p>
      <button type="submit">دخول آمن</button>
    </form>
  );
}
