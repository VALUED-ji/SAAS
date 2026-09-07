import { NextRequest, NextResponse } from "next/server";
import { signQuotationShareToken, verifyQuotationShareToken } from "@/lib/security/quotationShare";
import { getPublicAppOrigin } from "@/lib/security/requestOrigin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || "").trim();
  const claims = verifyQuotationShareToken(token);
  if (!claims) return NextResponse.json({ message: "报价分享链接无效或已过期" }, { status: 404 });

  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = claims.expiresAt ? Math.max(1, claims.expiresAt - now) : null;
  const compactToken = signQuotationShareToken(claims.quotationId, claims.companyId, maxAgeSeconds);

  return NextResponse.json({
    url: `${getPublicAppOrigin(req)}/quotation-share/${encodeURIComponent(compactToken)}`,
  });
}
