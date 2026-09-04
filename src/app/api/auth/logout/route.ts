import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/security/session";
import { isSameOriginMutation } from "@/lib/security/authorization";

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "请求来源无效" }, { status: 403 });
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
