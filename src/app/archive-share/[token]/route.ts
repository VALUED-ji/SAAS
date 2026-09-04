import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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

function renderExpired(message: string) {
  return new NextResponse(`<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${message}</title>
        <style>
          body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f3f5f8; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .card { width: min(420px, calc(100vw - 32px)); border: 1px solid #d8dee8; border-radius: 12px; background: #fff; padding: 28px; text-align: center; box-shadow: 0 24px 70px rgba(15,23,42,.12); }
          h1 { margin: 0; font-size: 18px; }
          p { margin: 10px 0 0; color: #667085; font-size: 14px; line-height: 1.7; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${message}</h1>
          <p>请联系工作人员重新分享有效链接。</p>
        </div>
      </body>
    </html>`, {
      status: message.includes("过期") ? 410 : 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const db = getDb();
  ensureArchiveShareTables(db);
  const share = db.prepare(`
    SELECT s.*, a.file_url
    FROM archive_link_shares s
    LEFT JOIN attachments a ON a.id = s.attachment_id
    WHERE s.token = ? AND s.deleted_at IS NULL
    LIMIT 1
  `).get(params.token) as any;

  if (!share?.file_url) return renderExpired("分享链接不存在");
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return renderExpired("分享链接已过期");
  }

  db.prepare(`
    UPDATE archive_link_shares
    SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = datetime('now')
    WHERE id = ?
  `).run(share.id);

  const rawUrl = String(share.file_url || "");
  const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : new URL(rawUrl, req.nextUrl.origin).toString();
  return NextResponse.redirect(target);
}
