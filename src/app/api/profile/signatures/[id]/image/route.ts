import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import { getUserSignatureImage } from "@/lib/signatures";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params;
  const image = getUserSignatureImage(getDb(), id, auth.companyId, auth.userId);
  if (!image?.image_data) return NextResponse.json({ message: "签名不存在" }, { status: 404 });
  return new NextResponse(image.image_data, {
    headers: {
      "Cache-Control": "private, max-age=60, must-revalidate",
      "Content-Type": image.mime_type || "image/png",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
