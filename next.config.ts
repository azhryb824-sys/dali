import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  proxyClientMaxBodySize: "40mb",
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "frame-src 'none'",
          "child-src 'none'",
          "manifest-src 'self'",
          "media-src 'self'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "style-src 'self' 'unsafe-inline'",
          "script-src 'self' 'unsafe-inline'",
          "connect-src 'self'",
          "worker-src 'self' blob:",
          "upgrade-insecure-requests",
        ].join("; "),
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Origin-Agent-Cluster", value: "?1" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];

    const protectedNoStoreHeaders = [
      { key: "Cache-Control", value: "private, no-store, no-cache, must-revalidate, max-age=0" },
      { key: "Pragma", value: "no-cache" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/portal/:path*", headers: protectedNoStoreHeaders },
      { source: "/api/portal/:path*", headers: protectedNoStoreHeaders },
      { source: "/login", headers: protectedNoStoreHeaders },
      { source: "/api/auth/:path*", headers: protectedNoStoreHeaders },
      { source: "/client/:path*", headers: protectedNoStoreHeaders },
      { source: "/api/client/:path*", headers: protectedNoStoreHeaders },
      { source: "/worker/:path*", headers: protectedNoStoreHeaders },
      { source: "/api/worker/:path*", headers: protectedNoStoreHeaders },
    ];
  },
};

export default nextConfig;
