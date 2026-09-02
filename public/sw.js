const CACHE_PREFIX = "dali-pwa";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const OFFLINE_PAGE = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_PAGE,
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-512.png",
  "/pwa/apple-touch-icon.png",
];

const PRIVATE_PATH_PREFIXES = [
  "/api",
  "/portal",
  "/login",
  "/client",
  "/worker",
  "/credentials",
  "/contracts/signature",
  "/forgot-password",
  "/reset-password",
];

function isPrivatePath(pathname) {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isCacheableStaticRequest(request, url) {
  return url.pathname.startsWith("/_next/static/")
    || PRECACHE_URLS.includes(url.pathname)
    || url.pathname.startsWith("/fonts/")
    || url.pathname === "/dally-logo.jpg";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE)));
    return;
  }

  if (!isCacheableStaticRequest(request, url)) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((networkResponse) => {
        if (!networkResponse.ok || networkResponse.type !== "basic") return networkResponse;
        const responseForCache = networkResponse.clone();
        void caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseForCache));
        return networkResponse;
      });
    }),
  );
});
