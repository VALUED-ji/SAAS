import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureContractTemplateTables, sanitizeContractTemplateHtml } from "@/lib/contractTemplates";
import { canManageOrganization, getAuthContext, hasPermission } from "@/lib/security/authorization";
import { getPublicAppOrigin } from "@/lib/security/requestOrigin";

const EXPIRE_MS: Record<string, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function makeToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function canManageBranchSettings(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return canManageOrganization(auth) || hasPermission(auth, "settings.manage");
}

function ensureContractTemplateShareTables(db: ReturnType<typeof getDb>) {
  ensureContractTemplateTables(db);
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
    CREATE INDEX IF NOT EXISTS idx_contract_template_shares_template ON contract_template_shares(template_id);
  `);
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageBranchSettings(auth)) return NextResponse.json({ message: "没有合同模板分享权限" }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const expiresIn = String(body.expiresIn || "7d");
    if (!(expiresIn in EXPIRE_MS)) return NextResponse.json({ message: "分享有效期不正确" }, { status: 400 });

    const orgUnitId = String(body.org_unit_id || "").trim();
    const templateId = String(body.template_id || body.id || "").trim();
    const name = String(body.name || "合同模板").trim() || "合同模板";
    const contractType = String(body.contract_type || "").trim();
    const html = sanitizeContractTemplateHtml(body.html);
    if (!html) return NextResponse.json({ message: "请先填写合同模板内容" }, { status: 400 });

    const db = getDb();
    ensureContractTemplateShareTables(db);

    if (orgUnitId) {
      const org = db.prepare(`
        SELECT id
        FROM org_units
        WHERE id = ? AND company_id = ? AND type = 'company' AND deleted_at IS NULL
        LIMIT 1
      `).get(orgUnitId, auth.companyId) as any;
      if (!org) return NextResponse.json({ message: "分公司不存在" }, { status: 404 });
    }

    if (templateId) {
      const template = db.prepare(`
        SELECT id
        FROM contract_templates
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(templateId, auth.companyId) as any;
      if (!template) return NextResponse.json({ message: "合同模板不存在" }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + EXPIRE_MS[expiresIn]).toISOString();
    let token = makeToken();
    while (db.prepare("SELECT id FROM contract_template_shares WHERE token = ? LIMIT 1").get(token)) {
      token = makeToken();
    }

    const id = makeId("CTSH");
    db.prepare(`
      INSERT INTO contract_template_shares (
        id, company_id, org_unit_id, template_id, token, name, contract_type,
        source_html, draft_html, expires_at, created_by_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, auth.companyId, orgUnitId || null, templateId || null, token, name, contractType || null, html, html, expiresAt, auth.userId);

    return NextResponse.json({
      id,
      token,
      share_url: `${getPublicAppOrigin(req)}/contract-template-share/${token}`,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "生成分享链接失败" }, { status: 500 });
  }
}
