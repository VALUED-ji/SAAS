import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCaptureSessionByToken, submitCaptureSession } from "@/lib/signatures";

const submitSchema = z.object({
  image: z.string().min(100),
  strokes: z.array(z.unknown()).max(5000),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = getCaptureSessionByToken(getDb(), token);
  if (!session) return NextResponse.json({ message: "二维码无效" }, { status: 404 });
  return NextResponse.json({ status: session.status, expires_at: session.expires_at });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = submitSchema.parse(await req.json());
    submitCaptureSession(getDb(), token, body.image, body.strokes);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ message: error?.issues?.[0]?.message || error?.message || "提交失败" }, { status: 400 });
  }
}
