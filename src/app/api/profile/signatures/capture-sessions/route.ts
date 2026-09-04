import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import { getPublicAppOrigin } from "@/lib/security/requestOrigin";
import { createCaptureSession } from "@/lib/signatures";

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const session = createCaptureSession(getDb(), auth.companyId, auth.userId);
  const captureUrl = `${getPublicAppOrigin(req)}/signature-capture/${session.token}`;
  const qrDataUrl = await QRCode.toDataURL(captureUrl, {
    width: 280,
    margin: 1,
    color: { dark: "#162033", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });
  return NextResponse.json({ id: session.id, expires_at: session.expiresAt, qr_data_url: qrDataUrl });
}
