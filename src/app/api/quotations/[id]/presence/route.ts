import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  leaveQuotationPresence,
  touchQuotationPresence,
} from "@/lib/quotationPresence";
import {
  getAuthContext,
  hasPermission,
  isSameOriginMutation,
} from "@/lib/security/authorization";

function normalizeSessionId(value: unknown) {
  const sessionId = String(value || "").trim().slice(0, 120);
  return sessionId || "";
}

export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ message: "请求来源无效" }, { status: 403 });
  }
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!hasPermission(auth, "quotations.manage")) {
    return NextResponse.json({ message: "没有报价编辑权限" }, { status: 403 });
  }

  const params = await paramsPromise;
  const quotationId = String(params.id || "").trim();
  const body = await req.json().catch(() => ({}));
  const sessionId = normalizeSessionId(body?.session_id);
  const action = String(body?.action || "heartbeat").trim();
  if (!quotationId || !sessionId) {
    return NextResponse.json({ message: "缺少编辑会话信息" }, { status: 400 });
  }

  const db = getDb();
  const quotation = db.prepare(`
    SELECT q.id, u.name AS user_name, u.avatar AS user_avatar
    FROM quotations q
    LEFT JOIN users u ON u.id = ? AND u.company_id = q.company_id
    WHERE q.id = ? AND q.company_id = ? AND q.deleted_at IS NULL
    LIMIT 1
  `).get(auth.userId, quotationId, auth.companyId) as any;
  if (!quotation?.id) {
    return NextResponse.json({ message: "报价不存在" }, { status: 404 });
  }

  if (action === "leave") {
    leaveQuotationPresence(db, quotationId, auth.userId, sessionId);
    return NextResponse.json({ success: true });
  }

  touchQuotationPresence(db, {
    quotationId,
    userId: auth.userId,
    sessionId,
    userName: String(quotation.user_name || "未知用户"),
    avatar: quotation.user_avatar ? String(quotation.user_avatar) : null,
  });
  return NextResponse.json({ success: true });
}
