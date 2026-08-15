"use client";

import { createContext, useContext } from "react";
import type { WebsiteContent } from "@/lib/website-content";

const WebsiteContentContext = createContext<WebsiteContent | null>(null);

export function WebsiteContentProvider({ content, children }: { content: WebsiteContent; children: React.ReactNode }) {
  return <WebsiteContentContext.Provider value={content}>{children}</WebsiteContentContext.Provider>;
}

export function useWebsiteContent() {
  const content = useContext(WebsiteContentContext);
  if (!content) throw new Error("WebsiteContentProvider is unavailable");
  return content;
}
