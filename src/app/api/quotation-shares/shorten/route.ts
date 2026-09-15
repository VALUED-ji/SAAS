import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createQuotationShareShortUrl } from "@/lib/quotationShareShortLinks";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const targetUrl = String(body?.url || "").trim();
  if (!targetUrl) return NextResponse.json({ message: "缺少分享链接" }, { status: 400 });
  const shortUrl = createQuotationShareShortUrl(req, getDb(), targetUrl);
  if (!shortUrl) return NextResponse.json({ message: "分享链接无效" }, { status: 400 });
  return NextResponse.json({ url: shortUrl });
}
