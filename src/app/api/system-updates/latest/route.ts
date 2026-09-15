import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";

type ParsedUpdateSection = {
  module: string;
  items: string[];
};

function parseDetails(value: unknown): ParsedUpdateSection[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    if (!Array.isArray(parsed)) return [];
    if (parsed.every((item) => typeof item === "string")) {
      const items = parsed.map((item) => String(item || "").trim()).filter(Boolean);
      return items.length ? [{ module: "系统更新", items }] : [];
    }
    return parsed.flatMap((section) => {
      if (!section || typeof section !== "object") return [];
      const record = section as Record<string, unknown>;
      const moduleName = String(record.module || record.title || record.name || "系统更新").trim();
      const rawItems = Array.isArray(record.items)
        ? record.items
        : Array.isArray(record.details)
          ? record.details
          : [];
      const items = rawItems.map((item) => String(item || "").trim()).filter(Boolean);
      return items.length ? [{ module: moduleName || "系统更新", items }] : [];
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const db = getDb();
  const announcement = db.prepare(`
    SELECT id, version, title, summary, details_json, published_at
    FROM system_update_announcements
    WHERE deleted_at IS NULL
      AND status = 'published'
      AND (company_id IS NULL OR company_id = ?)
      AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))
      AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
      AND NOT EXISTS (
        SELECT 1
        FROM system_update_reads r
        WHERE r.announcement_id = system_update_announcements.id
          AND r.user_id = ?
      )
    ORDER BY datetime(COALESCE(published_at, created_at)) DESC, datetime(created_at) DESC
    LIMIT 1
  `).get(auth.companyId, auth.userId) as any;

  if (!announcement) return NextResponse.json({ announcement: null });

  return NextResponse.json({
    announcement: {
      id: String(announcement.id),
      version: String(announcement.version || ""),
      title: String(announcement.title || "系统更新"),
      summary: String(announcement.summary || ""),
      sections: parseDetails(announcement.details_json),
      publishedAt: announcement.published_at ? String(announcement.published_at) : null,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const announcementId = String(body.announcementId || "").trim();
  if (!announcementId) return NextResponse.json({ message: "缺少更新公告" }, { status: 400 });

  const db = getDb();
  const announcement = db.prepare(`
    SELECT id
    FROM system_update_announcements
    WHERE id = ?
      AND deleted_at IS NULL
      AND status = 'published'
      AND (company_id IS NULL OR company_id = ?)
    LIMIT 1
  `).get(announcementId, auth.companyId) as any;
  if (!announcement?.id) return NextResponse.json({ message: "更新公告不存在" }, { status: 404 });

  db.prepare(`
    INSERT OR IGNORE INTO system_update_reads (id, announcement_id, user_id, read_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(`SUR${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`, announcementId, auth.userId);

  return NextResponse.json({ success: true });
}
