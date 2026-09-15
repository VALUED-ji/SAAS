import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolveQuotationShareShortUrl } from "@/lib/quotationShareShortLinks";
import { getPublicAppOrigin } from "@/lib/security/requestOrigin";

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = await paramsPromise;
  const code = String(params.code || "").trim();
  const targetUrl = resolveQuotationShareShortUrl(getDb(), code);
  if (!targetUrl) return NextResponse.json({ message: "报价分享链接无效或已过期" }, { status: 404 });
  return NextResponse.redirect(new URL(targetUrl, getPublicAppOrigin(req)), 307);
}
