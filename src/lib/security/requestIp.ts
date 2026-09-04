import type { NextRequest } from "next/server";

function normalizeHeaderIp(value: string | null) {
  const ip = String(value || "").split(",")[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}

export function getRequestIp(req: NextRequest) {
  return normalizeHeaderIp(req.headers.get("x-real-ip"))
    || normalizeHeaderIp(req.headers.get("x-forwarded-for"))
    || "unknown";
}
