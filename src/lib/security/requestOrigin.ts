import type { NextRequest } from "next/server";

function getProxyAwareOrigin(req: NextRequest) {
  const host = String(req.headers.get("host") || "").trim();
  const forwardedProtocol = String(req.headers.get("x-forwarded-proto") || "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : req.nextUrl.protocol.replace(":", "");

  if (host && (protocol === "http" || protocol === "https")) {
    try {
      return new URL(`${protocol}://${host}`).origin;
    } catch {
      // Fall back to Next.js' parsed origin for malformed proxy headers.
    }
  }
  return req.nextUrl.origin;
}

export function getPublicAppOrigin(req: NextRequest) {
  const configuredOrigin = String(process.env.APP_PUBLIC_URL || "").trim();
  if (configuredOrigin) {
    try {
      const url = new URL(configuredOrigin);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // Ignore an invalid optional override and use the request origin.
    }
  }
  return getProxyAwareOrigin(req);
}

export function isSameOriginMutation(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === getProxyAwareOrigin(req);
  } catch {
    return false;
  }
}
