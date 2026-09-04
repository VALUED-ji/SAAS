import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import { listUserSignatures, removeUserSignature, updateUserSignature } from "@/lib/signatures";

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(30).optional(),
  make_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const items = listUserSignatures(getDb(), auth.companyId, auth.userId);
  return NextResponse.json({
    items: items.map((item) => ({ ...item, image_url: `/api/profile/signatures/${item.id}/image` })),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  try {
    const body = updateSchema.parse(await req.json());
    updateUserSignature(getDb(), {
      id: body.id,
      companyId: auth.companyId,
      userId: auth.userId,
      name: body.name,
      makeDefault: body.make_default,
      isActive: body.is_active,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error?.issues?.[0]?.message || error?.message || "保存失败" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ message: "签名不存在" }, { status: 400 });
  try {
    removeUserSignature(getDb(), id, auth.companyId, auth.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "操作失败" }, { status: 400 });
  }
}
