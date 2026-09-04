import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/security/authorization";

const amapJsKeyEnvNames = [
  "NEXT_PUBLIC_AMAP_JS_KEY",
  "AMAP_JS_KEY",
  "GAODE_JS_KEY",
] as const;

function getEnvValue(names: readonly string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

export async function GET(req: NextRequest) {
  if (!getAuthContext(req)) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const amapJsKey = getEnvValue(amapJsKeyEnvNames);
  if (!amapJsKey) {
    return NextResponse.json({ message: "未配置高德 JS Key" }, { status: 503 });
  }

  return NextResponse.json({
    amapJsKey,
    securityJsCode: getEnvValue(["AMAP_SECURITY_JS_CODE", "GAODE_SECURITY_JS_CODE"]),
  });
}
