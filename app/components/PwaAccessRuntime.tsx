"use client";

import { useEffect } from "react";
import { isStandalonePwa, refreshPwaAccess } from "@/app/components/pwa-device-client";

export function PwaAccessRuntime() {
  useEffect(() => {
    if (!isStandalonePwa()) return;
    let disposed = false;
    let refreshing = false;

    const refresh = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        const result = await refreshPwaAccess();
        if (!disposed && result.status === "revoked") window.location.replace("/pwa/launch?revoked=1");
      } catch {
        // A temporary network failure must not erase the device key.
      } finally {
        refreshing = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
