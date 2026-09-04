import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canViewCustomers, getAuthContext } from "@/lib/security/authorization";
import { ApprovalSignatureType, getApprovalSnapshot } from "@/lib/signatures";

const APPROVAL_TYPES = new Set<ApprovalSignatureType>(["contract", "deposit", "deposit_refund", "change_order"]);

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; stepId: string }> },
) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { type, stepId } = await params;
  if (!APPROVAL_TYPES.has(type as ApprovalSignatureType)) {
    return NextResponse.json({ message: "签名记录不存在" }, { status: 404 });
  }
  const snapshot = getApprovalSnapshot(getDb(), type as ApprovalSignatureType, stepId, auth.companyId);
  if (!snapshot?.image_data) return NextResponse.json({ message: "签名记录不存在" }, { status: 404 });
  if (snapshot.signer_user_id !== auth.userId && !canViewCustomers(auth)) {
    return NextResponse.json({ message: "没有审批记录查看权限" }, { status: 403 });
  }
  return new NextResponse(snapshot.image_data, {
    headers: {
      "Cache-Control": "private, max-age=300, must-revalidate",
      "Content-Type": snapshot.mime_type || "image/png",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
