"use client";

import { useEffect } from "react";

export function PwaRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let disposed = false;

    const activateWaitingWorker = () => {
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    };

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };

    const register = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (disposed) return;

        registration = nextRegistration;
        activateWaitingWorker();
        nextRegistration.addEventListener("updatefound", () => {
          const installingWorker = nextRegistration.installing;
          installingWorker?.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
        document.addEventListener("visibilitychange", checkForUpdate);
        void nextRegistration.update();
      } catch {
        // The web experience must remain fully usable if service-worker registration is unavailable.
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  return null;
}
