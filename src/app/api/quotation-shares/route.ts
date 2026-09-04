import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";
import { signQuotationShareToken } from "@/lib/security/quotationShare";

const allowedExpireDays = [3, 7, 15, 30] as const;

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) return NextResponse.json({ message: "没有报价分享权限" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const quotationId = String(body?.quotation_id || "").trim();
  if (!quotationId) return NextResponse.json({ message: "缺少报价单" }, { status: 400 });
  const rawExpireHours = body?.expires_in_hours;
  const rawExpireDays = body?.expires_in_days;
  const expiresInHours = rawExpireHours === undefined || rawExpireHours === null || rawExpireHours === "" ? null : Number(rawExpireHours);
  if (expiresInHours !== null && expiresInHours !== 24) {
    return NextResponse.json({ message: "分享有效期不支持" }, { status: 400 });
  }
  const expiresInDays = expiresInHours ? null : rawExpireDays === null || rawExpireDays === "permanent" ? null : Number(rawExpireDays || 30);
  if (!expiresInHours && expiresInDays !== null && !allowedExpireDays.includes(expiresInDays as any)) {
    return NextResponse.json({ message: "分享有效期不支持" }, { status: 400 });
  }
  const quotation = getDb().prepare(`
    SELECT id
    FROM quotations
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(quotationId, auth.companyId) as { id?: string } | undefined;
  if (!quotation?.id) return NextResponse.json({ message: "报价单不存在" }, { status: 404 });

  const maxAgeSeconds = expiresInHours ? expiresInHours * 60 * 60 : expiresInDays === null ? null : expiresInDays * 24 * 60 * 60;
  const token = signQuotationShareToken(quotationId, auth.companyId, maxAgeSeconds);
  return NextResponse.json({
    url: `/quotation-share/${encodeURIComponent(token)}`,
    expires_in_days: expiresInDays,
    expires_in_hours: expiresInHours,
  });
}
