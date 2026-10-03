/** Free fallback for public website copy only; never used for portal records. */
const cache = new Map<string, string>();
export function translationSegments(text: string): string[] {
  const parts: string[] = []; let part = "";
  for (const word of text.match(/\S+\s*|\s+/gu) || []) {
    if (Buffer.byteLength(part + word, "utf8") <= 480) { part += word; continue; }
    if (part) { parts.push(part); part = ""; }
    for (const character of word) {
      if (Buffer.byteLength(part + character, "utf8") > 480) { parts.push(part); part = ""; }
      part += character;
    }
  }
  if (part) parts.push(part);
  return parts;
}
export async function translateWebsiteText(values: string[], target: "en" | "bn", signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string[]> {
  const results = new Array<string>(values.length); let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++; const source = values[index]; const key = `${target}:${source}`;
      if (cache.has(key)) { results[index] = cache.get(key)!; continue; }
      const parts: string[] = [];
      for (const segment of translationSegments(source)) {
        const url = new URL("https://api.mymemory.translated.net/get");
        url.searchParams.set("q", segment.trim()); url.searchParams.set("langpair", `ar|${target}`);
        const response = await fetcher(url, { signal, cache: "no-store" });
        const data = await response.json() as { responseStatus?: number; quotaFinished?: boolean; responseData?: { translatedText?: string } };
        if (data.quotaFinished || data.responseStatus === 429 || response.status === 429) throw new Error("TRANSLATION_QUOTA");
        const text = data.responseData?.translatedText;
        if (!response.ok || Number(data.responseStatus) !== 200 || typeof text !== "string" || !text.trim() || /[\u0600-\u06ff]/.test(text)) throw new Error("TRANSLATION_UNAVAILABLE");
        parts.push(text.trim() + (segment.match(/\s+$/u)?.[0] || ""));
      }
      const translated = parts.join("");
      if (!translated.trim()) throw new Error("TRANSLATION_UNAVAILABLE");
      if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
      cache.set(key, translated); results[index] = translated;
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, values.length) }, () => worker()));
  return results;
}
