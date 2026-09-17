export type DaliWhatsAppRuntime = "mobile-app" | "desktop-app" | "browser";

export type DaliWhatsAppLinks = {
  appUrl: string;
  universalUrl: string;
  webUrl: string;
  secureLaunchUrl: string;
};

type DaliDesktopWhatsAppBridge = {
  open: (
    target: "app" | "web",
    url: string,
  ) => Promise<{ opened: boolean }>;
};

type DaliWhatsAppWindow = Window & {
  daliDesktop?: {
    whatsapp?: DaliDesktopWhatsAppBridge;
  };
};

const DALI_MOBILE_MARKER = /(?:^|\s)DaliMobile\/1(?:\s|$)/;

export function detectDaliWhatsAppRuntime(
  userAgent: string,
  hasDesktopBridge: boolean,
): DaliWhatsAppRuntime {
  if (DALI_MOBILE_MARKER.test(userAgent)) return "mobile-app";
  if (hasDesktopBridge) return "desktop-app";
  return "browser";
}

export function currentDaliWhatsAppRuntime(): DaliWhatsAppRuntime {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return "browser";
  return detectDaliWhatsAppRuntime(
    navigator.userAgent,
    "daliDesktop" in window,
  );
}

function desktopWhatsAppBridge() {
  if (typeof window === "undefined") return null;
  return (window as DaliWhatsAppWindow).daliDesktop?.whatsapp || null;
}

function trustedWhatsAppAppUrl(value: string) {
  try {
    const url = new URL(value);
    const phone = (url.searchParams.get("phone") || "").replace(/\D/g, "");
    return url.protocol === "whatsapp:" &&
      url.hostname === "send" &&
      ["", "/"].includes(url.pathname) &&
      /^9665\d{8}$/.test(phone)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function trustedWhatsAppWebUrl(value: string) {
  try {
    const url = new URL(value);
    const phone = (url.searchParams.get("phone") || "").replace(/\D/g, "");
    return url.protocol === "https:" &&
      url.hostname === "web.whatsapp.com" &&
      url.pathname.replace(/\/+$/, "") === "/send" &&
      /^9665\d{8}$/.test(phone)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function openBrowserTarget(url: string, preparedWindow?: Window | null) {
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.location.replace(url);
    preparedWindow.opener = null;
    return;
  }
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
  else window.location.assign(url);
}

export function preopenDaliWhatsAppWindow() {
  if (
    typeof window === "undefined" ||
    currentDaliWhatsAppRuntime() !== "browser"
  )
    return null;
  return window.open("/portal/whatsapp-launch", "_blank");
}

export function openDaliWhatsApp(
  target: "app" | "web",
  links: DaliWhatsAppLinks,
  preparedWindow?: Window | null,
) {
  if (typeof window === "undefined") return;
  const runtime = currentDaliWhatsAppRuntime();
  const appUrl = trustedWhatsAppAppUrl(links.appUrl);
  const webUrl = trustedWhatsAppWebUrl(links.webUrl);
  if (!appUrl || !webUrl) return;

  if (runtime === "browser") {
    if (target === "app") {
      preparedWindow?.close();
      // This runs directly inside the user's button click so the browser may
      // hand the custom protocol to the installed WhatsApp application.
      window.location.assign(appUrl);
    } else {
      openBrowserTarget(webUrl, preparedWindow);
    }
    return;
  }

  if (runtime === "mobile-app") {
    window.location.assign(target === "app" ? appUrl : webUrl);
    return;
  }

  const bridge = desktopWhatsAppBridge();
  if (!bridge) {
    window.location.assign(
      target === "app" ? links.universalUrl : webUrl,
    );
    return;
  }

  const targetUrl = target === "app" ? appUrl : webUrl;
  void bridge
    .open(target, targetUrl)
    .then((result) => {
      if (!result?.opened)
        window.location.assign(
          target === "app" ? links.universalUrl : webUrl,
        );
    })
    .catch(() => {
      window.location.assign(
        target === "app" ? links.universalUrl : webUrl,
      );
    });
}
