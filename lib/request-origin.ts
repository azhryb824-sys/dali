function nodeEnvironment(): Record<string, string | undefined> {
  return typeof process === "undefined" ? {} : process.env;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function safeHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

function configuredExternalUrl() {
  const env = nodeEnvironment();
  const explicit = safeHttpUrl(
    env.APP_URL?.trim()
    || env.PUBLIC_APP_URL?.trim()
    || env.RENDER_EXTERNAL_URL?.trim(),
  );
  if (explicit) return explicit;
  const hostname = env.RENDER_EXTERNAL_HOSTNAME?.trim();
  return hostname ? safeHttpUrl(`https://${hostname}`) : null;
}

function forwardedExternalUrl(request: Request) {
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  if (!host || (protocol !== "https" && protocol !== "http")) return null;
  return safeHttpUrl(`${protocol}://${host}`);
}

export function externalRequestOrigin(request: Request) {
  return (configuredExternalUrl() || forwardedExternalUrl(request) || new URL(request.url)).origin;
}

export function externalRequestUrl(request: Request, path: string) {
  return new URL(path, externalRequestOrigin(request));
}

export function isSecureExternalRequest(request: Request) {
  return new URL(externalRequestOrigin(request)).protocol === "https:";
}

export function allowedRequestOrigins(request: Request) {
  const configured = configuredExternalUrl();
  if (configured) return new Set([configured.origin]);

  const origins = new Set<string>();
  const requestUrl = safeHttpUrl(request.url);
  const forwarded = forwardedExternalUrl(request);
  if (requestUrl) origins.add(requestUrl.origin);
  if (forwarded) origins.add(forwarded.origin);

  const host = firstHeaderValue(request.headers.get("host"));
  if (host) {
    const protocol = forwarded?.protocol || requestUrl?.protocol || "https:";
    const hostUrl = safeHttpUrl(`${protocol}//${host}`);
    if (hostUrl) origins.add(hostUrl.origin);
  }
  return origins;
}
