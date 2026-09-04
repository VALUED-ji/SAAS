/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
  typescript: {
    tsconfigPath: process.env.NEXT_TS_CONFIG || "tsconfig.json",
    ignoreBuildErrors: process.env.NEXT_IGNORE_BUILD_TYPECHECK === "1",
  },
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 12,
  },
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /(^|[\\/])(?:node_modules|\.git|\.next-build|\.next-runtime|\.next-turbo-eval)([\\/]|$)|(^|[\\/])next-env\.d\.ts$/,
      };
    }
    return config;
  },
  async headers() {
    const headers = [
      { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'self'; object-src 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};
module.exports = nextConfig;
