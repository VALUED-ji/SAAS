import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canEditCustomers, canViewCustomers, getAuthContext } from "@/lib/security/authorization";

const EXPIRE_MS: Record<string, number | null> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  forever: null,
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function makeToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function ensureArchiveShareTables(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      customer_id TEXT REFERENCES customers(id),
      followup_id TEXT REFERENCES follow_ups(id),
      user_id TEXT REFERENCES users(id),
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS archive_link_shares (
      id TEXT PRIMARY KEY,
      attachment_id TEXT NOT NULL REFERENCES attachments(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT,
      view_count INTEGER DEFAULT 0,
      last_viewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_archive_link_shares_attachment ON archive_link_shares(attachment_id);
    CREATE INDEX IF NOT EXISTS idx_archive_link_shares_token ON archive_link_shares(token);
  `);
}

function isShareableLink(attachment: any) {
  const url = String(attachment?.file_url || "");
  return attachment?.mime_type === "text/uri-list" || /^https?:\/\//i.test(url) || /^\/vr-tour\//.test(url);
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有资料查看权限" }, { status: 403 });

  try {
    const attachmentId = String(req.nextUrl.searchParams.get("attachment_id") || "").trim();
    if (!attachmentId) return NextResponse.json({ message: "资料ID不能为空" }, { status: 400 });

    const db = getDb();
    ensureArchiveShareTables(db);
    const attachment = db.prepare(`
      SELECT a.*
      FROM attachments a
      LEFT JOIN projects p ON p.id = a.project_id AND p.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = COALESCE(a.customer_id, p.customer_id) AND c.deleted_at IS NULL
      WHERE a.id = ? AND COALESCE(p.company_id, c.company_id) = ?
      LIMIT 1
    `).get(attachmentId, auth.companyId) as any;
    if (!attachment) return NextResponse.json({ message: "资料不存在" }, { status: 404 });
    if (!isShareableLink(attachment)) return NextResponse.json({ message: "该资料不是在线链接" }, { status: 400 });

    const shares = db.prepare(`
      SELECT id, token, expires_at, created_at
      FROM archive_link_shares
      WHERE attachment_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `).all(attachmentId) as any[];
    const latest = shares.find((share) => !share.expires_at || new Date(share.expires_at).getTime() > Date.now());
    if (!latest) return NextResponse.json({ share: null });

    return NextResponse.json({
      share: {
        id: latest.id,
        token: latest.token,
        share_url: `${req.nextUrl.origin}/archive-share/${latest.token}`,
        expires_at: latest.expires_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "读取分享链接失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有资料分享权限" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const attachmentId = String(body?.attachment_id || "").trim();
    const expiresIn = String(body?.expiresIn || "7d");
    if (!attachmentId) return NextResponse.json({ message: "资料ID不能为空" }, { status: 400 });
    if (!(expiresIn in EXPIRE_MS)) return NextResponse.json({ message: "分享有效期不正确" }, { status: 400 });

    const db = getDb();
    ensureArchiveShareTables(db);
    const attachment = db.prepare(`
      SELECT a.*
      FROM attachments a
      LEFT JOIN projects p ON p.id = a.project_id AND p.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = COALESCE(a.customer_id, p.customer_id) AND c.deleted_at IS NULL
      WHERE a.id = ? AND COALESCE(p.company_id, c.company_id) = ?
      LIMIT 1
    `).get(attachmentId, auth.companyId) as any;
    if (!attachment) return NextResponse.json({ message: "资料不存在" }, { status: 404 });
    if (!isShareableLink(attachment)) return NextResponse.json({ message: "该资料不是在线链接" }, { status: 400 });

    const duration = EXPIRE_MS[expiresIn];
    const expiresAt = duration === null ? null : new Date(Date.now() + duration).toISOString();
    let token = makeToken();
    while (db.prepare("SELECT id FROM archive_link_shares WHERE token = ? LIMIT 1").get(token)) {
      token = makeToken();
    }

    const id = makeId("ALSH");
    db.prepare(`
      INSERT INTO archive_link_shares (id, attachment_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(id, attachmentId, token, expiresAt);

    return NextResponse.json({
      id,
      token,
      share_url: `${req.nextUrl.origin}/archive-share/${token}`,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "生成分享链接失败" }, { status: 500 });
  }
}
