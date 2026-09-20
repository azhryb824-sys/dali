import React from "react";
import { renderToString } from "react-dom/server";
import { App } from "./locale-fixture";
export function render(locale) { return renderToString(<App locale={locale}/>); }
