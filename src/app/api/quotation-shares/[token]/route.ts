import { NextRequest, NextResponse } from "next/server";
import { verifyQuotationShareToken } from "@/lib/security/quotationShare";

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "");
  const claims = verifyQuotationShareToken(token);
  if (!claims) return NextResponse.json({ message: "报价分享链接无效或已过期" }, { status: 404 });

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const origin = host ? `${proto}://${host}` : req.url;
  const target = new URL(`/api/quotations/${encodeURIComponent(claims.quotationId)}`, origin);
  target.searchParams.set("share", token);
  return NextResponse.redirect(target, 307);
}
