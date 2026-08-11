import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" }
];

const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/q/:path*", headers: noStoreHeaders },
      { source: "/api/public/:path*", headers: noStoreHeaders }
    ];
  }
};

export default nextConfig;
