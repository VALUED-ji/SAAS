import { NextRequest, NextResponse } from "next/server";
import { verifyQuotationShareToken } from "@/lib/security/quotationShare";
import { getDb } from "@/lib/db";
import { isSameOriginMutation } from "@/lib/security/requestOrigin";

function parseSettings(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

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

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "");
  const claims = verifyQuotationShareToken(token);
  if (!claims) return NextResponse.json({ message: "报价分享链接无效或已过期" }, { status: 404 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "非法请求来源" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const quotationValidUntil = String(body?.quotationValidUntil || "").trim();
  if (quotationValidUntil && !/^\d{4}-\d{2}-\d{2}$/.test(quotationValidUntil)) {
    return NextResponse.json({ message: "报价执行有效期格式不正确" }, { status: 400 });
  }

  const db = getDb();
  const quotation = db.prepare(`
    SELECT settings
    FROM quotations
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(claims.quotationId, claims.companyId) as { settings?: string | null } | undefined;
  if (!quotation) return NextResponse.json({ message: "报价单不存在" }, { status: 404 });

  const settings = parseSettings(quotation.settings);
  if (quotationValidUntil) settings.quotationValidUntil = quotationValidUntil;
  else delete settings.quotationValidUntil;

  db.prepare(`
    UPDATE quotations
    SET settings = ?, updated_at = datetime('now')
    WHERE id = ? AND company_id = ?
  `).run(JSON.stringify(settings), claims.quotationId, claims.companyId);

  return NextResponse.json({ quotationValidUntil: quotationValidUntil || null });
}
