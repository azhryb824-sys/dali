import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fontPaths = {
  arabicBold: "cairo-arabic-700-normal.woff",
  latinBold: "cairo-latin-700-normal.woff",
} as const;

const fontCache = new Map<keyof typeof fontPaths, Promise<Uint8Array>>();

export function cairoFontBytes(font: keyof typeof fontPaths) {
  let pending = fontCache.get(font);
  if (!pending) {
    const path = join(process.cwd(), "public", "fonts", fontPaths[font]);
    pending = readFile(path).then((buffer) => new Uint8Array(buffer));
    fontCache.set(font, pending);
  }
  return pending;
}
