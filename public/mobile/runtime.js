(() => {
  "use strict";
  if (!/(?:^|\s)DaliMobile\/1(?:\s|$)/.test(navigator.userAgent) || !("serviceWorker" in navigator)) return;

  const platform = /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "mobile";
  let registration = null;

  function post(type) {
    const worker = navigator.serviceWorker.controller || registration?.active;
    worker?.postMessage({ type, platform, deviceName: navigator.userAgent.slice(0, 160) });
  }

  function badge(message, tone = "#d5a94e") {
    let node = document.getElementById("dali-mobile-status");
    if (!node) {
      node = document.createElement("div");
      node.id = "dali-mobile-status";
      node.setAttribute("role", "status");
      Object.assign(node.style, { position: "fixed", left: "max(14px, env(safe-area-inset-left))", bottom: "max(14px, env(safe-area-inset-bottom))", zIndex: "2147483647", borderRadius: "12px", padding: "11px 14px", background: "#071a2b", color: "#fff", boxShadow: "0 8px 28px #0005", fontFamily: "Tajawal, sans-serif", fontWeight: "700", opacity: "0", transition: "opacity .2s ease", pointerEvents: "none" });
      document.body.appendChild(node);
    }
    node.style.borderInlineStart = `4px solid ${tone}`;
    node.textContent = message;
    node.style.opacity = "1";
    window.setTimeout(() => { node.style.opacity = "0"; }, 2800);
  }

  function safeFileName(value) {
    return (value || `dali-${Date.now()}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 120);
  }

  function blobBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function nativeDownload(anchor) {
    const plugins = window.Capacitor?.Plugins;
    if (!plugins?.Filesystem || !plugins?.Share) return false;
    const href = new URL(anchor.href, location.href);
    if (href.origin !== location.origin) return false;
    const response = await fetch(href, { credentials: "include" });
    if (!response.ok) throw new Error("تعذر تنزيل الملف");
    const disposition = response.headers.get("content-disposition") || "";
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const name = safeFileName(encoded ? decodeURIComponent(encoded) : plain || anchor.download || href.pathname.split("/").pop());
    const saved = await plugins.Filesystem.writeFile({ path: name, data: await blobBase64(await response.blob()), directory: "CACHE", recursive: true });
    await plugins.Share.share({ title: name, url: saved.uri, dialogTitle: "حفظ أو مشاركة المستند" });
    return true;
  }

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "dali-sync-complete") {
      window.dispatchEvent(new CustomEvent("dali-sync-complete", { detail: data.state }));
      if (data.state?.changes > 0) badge(`تم تحديث البيانات تلقائيًا (${data.state.changes})`);
    } else if (data.type === "dali-offline-queued") {
      window.dispatchEvent(new CustomEvent("dali-offline-queued", { detail: data }));
      badge("حُفظت العملية مشفرة وستُزامن عند عودة الاتصال", "#d5a94e");
    } else if (data.type === "dali-sync-conflict") {
      badge("توجد عملية تحتاج مراجعة بعد تعارض المزامنة", "#ef4444");
    }
  });

  navigator.serviceWorker.register("/mobile/service-worker.js", { scope: "/" }).then((value) => {
    registration = value;
    post("dali-sync");
  }).catch(() => badge("تعذر تشغيل التخزين الآمن دون اتصال", "#ef4444"));

  window.addEventListener("online", () => { badge("عاد الاتصال؛ جارٍ مزامنة التغييرات", "#22c55e"); post("dali-sync"); });
  window.addEventListener("offline", () => badge("أنت الآن دون اتصال؛ بعض الإجراءات الحساسة متوقفة", "#f59e0b"));
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[download]") : null;
    if (!anchor) return;
    event.preventDefault();
    nativeDownload(anchor).then((handled) => { if (!handled) location.href = anchor.href; }).catch((error) => badge(error instanceof Error ? error.message : "تعذر تنزيل الملف", "#ef4444"));
  }, true);
  window.setInterval(() => post("dali-sync"), 20_000);

  Object.defineProperty(window, "daliMobile", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      platform,
      isOnline: () => navigator.onLine,
      syncNow: () => post("dali-sync"),
      enableNotifications: async () => {
        const push = window.Capacitor?.Plugins?.PushNotifications;
        if (!push) return { receive: "unavailable" };
        let permission = await push.checkPermissions();
        if (permission.receive === "prompt") permission = await push.requestPermissions();
        if (permission.receive === "granted") await push.register();
        return permission;
      },
      policy: Object.freeze({ intervalSeconds: 20, encryptedOfflineData: true, privilegedOperationsRequireOnline: true }),
    }),
  });
})();
