import type { NextConfig } from "next";

// Baseline security headers for the public demo (D-034). A full script CSP needs per-request nonces in Next; framing is
// the risk worth closing here, so the CSP only sets frame-ancestors.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Seed docs and saved AI responses are read from disk by the API routes.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
