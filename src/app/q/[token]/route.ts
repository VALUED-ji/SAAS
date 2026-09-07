import { NextRequest, NextResponse } from "next/server";
import { verifyQuotationShareToken } from "@/lib/security/quotationShare";
import { getPublicAppOrigin } from "@/lib/security/requestOrigin";

export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "");
  const claims = verifyQuotationShareToken(token);
  if (!claims) return NextResponse.json({ message: "报价分享链接无效或已过期" }, { status: 404 });

  return NextResponse.redirect(`${getPublicAppOrigin(_req)}/quotation-share/${encodeURIComponent(token)}`, 307);
}
