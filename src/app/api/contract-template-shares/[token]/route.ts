import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sanitizeContractTemplateHtml } from "@/lib/contractTemplates";

function ensureContractTemplateShareTables(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_template_shares (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      org_unit_id TEXT REFERENCES org_units(id),
      template_id TEXT,
      token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contract_type TEXT,
      source_html TEXT NOT NULL DEFAULT '',
      draft_html TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      view_count INTEGER DEFAULT 0,
      last_viewed_at TEXT,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_contract_template_shares_token ON contract_template_shares(token);
  `);
}

function getActiveShare(db: ReturnType<typeof getDb>, token: string) {
  ensureContractTemplateShareTables(db);
  const share = db.prepare(`
    SELECT id, token, name, contract_type, draft_html, expires_at, view_count, created_at, updated_at
    FROM contract_template_shares
    WHERE token = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(token) as any;
  if (!share) return { error: "分享链接不存在", status: 404 as const };
  if (new Date(share.expires_at).getTime() <= Date.now()) {
    return { error: "分享链接已过期，请联系分享人重新生成", status: 410 as const };
  }
  return { share };
}

export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "").trim();
  if (!token) return NextResponse.json({ message: "分享链接无效" }, { status: 404 });

  const db = getDb();
  const result = getActiveShare(db, token);
  if ("error" in result) return NextResponse.json({ message: result.error }, { status: result.status });

  db.prepare(`
    UPDATE contract_template_shares
    SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = datetime('now')
    WHERE id = ?
  `).run(result.share.id);

  return NextResponse.json({
    id: result.share.id,
    token: result.share.token,
    name: result.share.name,
    contract_type: result.share.contract_type,
    html: result.share.draft_html,
    expires_at: result.share.expires_at,
    updated_at: result.share.updated_at,
  });
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "").trim();
  if (!token) return NextResponse.json({ message: "分享链接无效" }, { status: 404 });

  try {
    const db = getDb();
    const result = getActiveShare(db, token);
    if ("error" in result) return NextResponse.json({ message: result.error }, { status: result.status });

    const body = await req.json().catch(() => ({}));
    const html = sanitizeContractTemplateHtml(body.html);
    if (!html) return NextResponse.json({ message: "合同模板内容不能为空" }, { status: 400 });

    db.prepare(`
      UPDATE contract_template_shares
      SET draft_html = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(html, result.share.id);

    const updated = db.prepare(`
      SELECT id, token, name, contract_type, draft_html, expires_at, updated_at
      FROM contract_template_shares
      WHERE id = ?
      LIMIT 1
    `).get(result.share.id) as any;

    return NextResponse.json({
      id: updated.id,
      token: updated.token,
      name: updated.name,
      contract_type: updated.contract_type,
      html: updated.draft_html,
      expires_at: updated.expires_at,
      updated_at: updated.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存分享编辑内容失败" }, { status: 500 });
  }
}
