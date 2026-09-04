import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import {
  cancelCaptureSession,
  confirmCaptureSession,
  getCaptureSessionForOwner,
} from "@/lib/signatures";

const confirmSchema = z.object({
  name: z.string().trim().min(1, "请输入签名名称").max(30, "签名名称不能超过 30 个字"),
  make_default: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const session = getCaptureSessionForOwner(getDb(), id, auth.companyId, auth.userId);
  if (!session) return NextResponse.json({ message: "签名任务不存在" }, { status: 404 });
  return NextResponse.json({
    ...session,
    preview_url: session.has_preview ? `/api/profile/signatures/capture-sessions/${id}/preview` : null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  try {
    const { id } = await params;
    const body = confirmSchema.parse(await req.json());
    const signatureId = confirmCaptureSession(getDb(), {
      id,
      companyId: auth.companyId,
      userId: auth.userId,
      name: body.name,
      makeDefault: body.make_default,
    });
    return NextResponse.json({ success: true, signature_id: signatureId });
  } catch (error: any) {
    return NextResponse.json({ message: error?.issues?.[0]?.message || error?.message || "保存失败" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  cancelCaptureSession(getDb(), id, auth.companyId, auth.userId);
  return NextResponse.json({ success: true });
}
