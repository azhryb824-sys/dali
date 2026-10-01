"use client";
import { createContext, useContext } from "react";
const PreviewContext = createContext(false);
export const WebsitePreviewMode = PreviewContext.Provider;
export function useWebsitePreviewMode() { return useContext(PreviewContext); }
