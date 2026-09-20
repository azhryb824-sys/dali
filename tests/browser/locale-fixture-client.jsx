import React from "react";
import { hydrateRoot } from "react-dom/client";
import { App, exposeProbe } from "./locale-fixture";
const params = new URLSearchParams(window.__TEST_QUERY || location.search);
const locale = document.documentElement.lang || params.get("locale") || "ar";
exposeProbe();
hydrateRoot(document.getElementById("root"), <App locale={locale} delay={params.get("delay") === "1"}/>, {
  onRecoverableError: error => console.error("HYDRATION", error),
});
