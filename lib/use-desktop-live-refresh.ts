"use client";

import { useEffect, useRef } from "react";

export function useDesktopLiveRefresh(refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let timer = 0;
    let running = false;
    const onChanges = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (running) return;
        running = true;
        try { await refreshRef.current(); }
        finally { running = false; }
      }, 300);
    };
    window.addEventListener("dali-server-changes", onChanges);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("dali-server-changes", onChanges);
    };
  }, []);
}
