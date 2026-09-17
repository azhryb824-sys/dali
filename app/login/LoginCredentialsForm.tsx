"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

const rememberedIdentifierKey = "dali-remembered-login-identifier-v1";
const rememberLoginEnabledKey = "dali-remember-login-enabled-v2";

type SavedLoginCredentials = {
  identifier: string;
  password: string;
};

type DesktopLoginCredentialsBridge = {
  load: () => Promise<SavedLoginCredentials | null>;
  save: (
    credentials: SavedLoginCredentials,
  ) => Promise<{ saved: boolean; reason?: string }>;
  clear: () => Promise<boolean>;
};

type DaliDesktopWindow = Window & {
  daliDesktop?: {
    loginCredentials?: DesktopLoginCredentialsBridge;
  };
  PasswordCredential?: new (value: {
    id: string;
    password: string;
    name?: string;
  }) => Credential;
};

type BrowserPasswordCredential = Credential & {
  id: string;
  password?: string;
};

type BrowserPasswordManager = {
  get: (options: {
    password: true;
    mediation: "optional";
  }) => Promise<BrowserPasswordCredential | null>;
  store: (credential: Credential) => Promise<Credential>;
  preventSilentAccess?: () => Promise<void>;
};

function normalizeIdentifier(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[^0-9]/g, "")
    .slice(0, 10);
}

function desktopCredentialsBridge() {
  if (typeof window === "undefined") return null;
  return (window as DaliDesktopWindow).daliDesktop?.loginCredentials || null;
}

function browserPasswordManager() {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return null;
  const PasswordCredential = (window as DaliDesktopWindow).PasswordCredential;
  const credentials = navigator.credentials as unknown as BrowserPasswordManager;
  if (
    typeof PasswordCredential !== "function" ||
    typeof credentials?.get !== "function" ||
    typeof credentials?.store !== "function"
  )
    return null;
  return { PasswordCredential, credentials };
}

function rememberedLoginEnabled() {
  try {
    return (
      window.localStorage.getItem(rememberLoginEnabledKey) === "1" ||
      Boolean(window.localStorage.getItem(rememberedIdentifierKey))
    );
  } catch {
    return false;
  }
}

function saveRememberPreference(identifier: string, remember: boolean) {
  try {
    if (remember && /^\d{10}$/.test(identifier)) {
      window.localStorage.setItem(rememberedIdentifierKey, identifier);
      window.localStorage.setItem(rememberLoginEnabledKey, "1");
    } else {
      window.localStorage.removeItem(rememberedIdentifierKey);
      window.localStorage.removeItem(rememberLoginEnabledKey);
    }
  } catch {
    // Login must continue even when managed-device policy blocks local storage.
  }
}

export default function LoginCredentialsForm({ returnTo }: { returnTo: string }) {
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreCredentials() {
      let remembered = "";
      try {
        remembered = window.localStorage.getItem(rememberedIdentifierKey) || "";
      } catch {
        // The secure platform manager may still be available.
      }
      if (/^\d{10}$/.test(remembered) && identifierRef.current)
        identifierRef.current.value = remembered;
      if (!rememberedLoginEnabled()) return;
      if (rememberRef.current) rememberRef.current.checked = true;

      const desktopBridge = desktopCredentialsBridge();
      if (desktopBridge) {
        try {
          const saved = await desktopBridge.load();
          if (
            active &&
            saved &&
            /^\d{10}$/.test(saved.identifier) &&
            saved.password
          ) {
            if (identifierRef.current)
              identifierRef.current.value = saved.identifier;
            if (passwordRef.current) passwordRef.current.value = saved.password;
            setRestoreNotice("تم تحميل بيانات الدخول المحفوظة بأمان على هذا الجهاز.");
          }
        } catch {
          // A locked operating-system vault must not block manual login.
        }
        return;
      }

      const manager = browserPasswordManager();
      if (!manager) return;
      try {
        const saved = await manager.credentials.get({
          password: true,
          mediation: "optional",
        });
        if (
          active &&
          saved?.password &&
          /^\d{10}$/.test(normalizeIdentifier(saved.id))
        ) {
          if (identifierRef.current)
            identifierRef.current.value = normalizeIdentifier(saved.id);
          if (passwordRef.current) passwordRef.current.value = saved.password;
          setRestoreNotice("تم تحميل بيانات الدخول من مدير كلمات المرور الآمن.");
        }
      } catch {
        // Browsers may require the user to select the credential manually.
      }
    }

    void restoreCredentials();
    return () => {
      active = false;
    };
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const identifier = normalizeIdentifier(identifierRef.current?.value || "");
    const password = passwordRef.current?.value || "";
    const remember = Boolean(rememberRef.current?.checked);
    const desktopBridge = desktopCredentialsBridge();
    const manager = browserPasswordManager();

    saveRememberPreference(identifier, remember);

    if (!remember) {
      if (!desktopBridge) {
        void manager?.credentials.preventSilentAccess?.().catch(() => undefined);
        return;
      }
      event.preventDefault();
      setBusy(true);
      await desktopBridge.clear().catch(() => false);
      form.submit();
      return;
    }

    // Browsers without the Credential Management API retain their native
    // password-manager flow through the normal form navigation.
    if (!desktopBridge && !manager) return;

    event.preventDefault();
    setBusy(true);

    let response: Response;
    try {
      response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
        redirect: "follow",
      });
    } catch {
      form.submit();
      return;
    }

    const finalUrl = new URL(
      response.url || "/login?error=service",
      window.location.origin,
    );
    const sameOrigin = finalUrl.origin === window.location.origin;
    const authenticated =
      response.ok && sameOrigin && finalUrl.pathname.startsWith("/portal");

    if (authenticated) {
      try {
        if (desktopBridge) {
          await desktopBridge.save({ identifier, password });
        } else if (manager) {
          const credential = new manager.PasswordCredential({
            id: identifier,
            password,
            name: "نظام دالي الإداري",
          });
          await manager.credentials.store(credential);
        }
      } catch {
        // Authentication has succeeded; vault policy must not cancel login.
      }
    }

    if (sameOrigin) {
      window.location.replace(
        `${finalUrl.pathname}${finalUrl.search}${finalUrl.hash}`,
      );
    } else {
      window.location.replace("/login?error=service");
    }
  }

  return (
    <form
      className="login-credentials-form"
      method="post"
      action="/api/auth/login"
      onSubmit={submitLogin}
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
          ref={passwordRef}
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          required
        />
      </label>
      <label className="remember-login-option">
        <input ref={rememberRef} type="checkbox" />
        <span>حفظ رقم الهوية وكلمة المرور على هذا الجهاز</span>
      </label>
      <p className="remember-login-hint">
        عند تفعيل الخيار تُحفظ كلمة المرور في مدير كلمات المرور الآمن للجهاز،
        وتُشفّر داخل تطبيقات دالي لسطح المكتب. لا تُحفظ كلمة المرور في التخزين
        العادي للمتصفح ولا تُرسل نسخة إضافية إلى خادم دالي.
      </p>
      {restoreNotice && (
        <p className="remember-login-status" role="status">
          {restoreNotice}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "جارٍ التحقق وحفظ بيانات الدخول..." : "دخول آمن"}
      </button>
    </form>
  );
}
