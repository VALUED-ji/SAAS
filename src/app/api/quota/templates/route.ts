import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";
import { isSameOriginMutation } from "@/lib/security/requestOrigin";

type Db = ReturnType<typeof getDb>;

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function canManageQuota(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return hasPermission(auth, "quotations.manage") || hasPermission(auth, "settings.manage");
}

function safeJsonParse(value: unknown, fallback: any) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function ensureQuotaTemplatesTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_templates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'enabled',
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quota_templates_company_template
      ON quota_templates(company_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_quota_templates_company_status
      ON quota_templates(company_id, status, deleted_at);
  `);
}

function normalizeTemplatePayload(value: any) {
  const id = String(value?.id || "").trim() || makeId("tpl");
  const name = String(value?.name || "未命名模板").trim() || "未命名模板";
  const status = String(value?.status || "enabled").trim() || "enabled";
  return {
    ...value,
    id,
    name,
    status,
    updatedAt: String(value?.updatedAt || "").trim() || new Date().toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有预算模板权限" }, { status: 403 });

  const db = getDb();
  ensureQuotaTemplatesTable(db);
  const rows = db.prepare(`
    SELECT payload
    FROM quota_templates
    WHERE company_id = ? AND deleted_at IS NULL
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, template_id DESC
  `).all(auth.companyId) as Array<{ payload?: string | null }>;
  const templates = rows
    .map((row) => safeJsonParse(row.payload, null))
    .filter(Boolean);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有预算模板权限" }, { status: 403 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "非法请求来源" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const templates = Array.isArray(body?.templates) ? body.templates.map(normalizeTemplatePayload) : [];
  const db = getDb();
  ensureQuotaTemplatesTable(db);

  const tx = (db as any).transaction(() => {
    const activeIds = templates.map((template: any) => String(template.id));
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => "?").join(",");
      db.prepare(`
        UPDATE quota_templates
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND template_id NOT IN (${placeholders}) AND deleted_at IS NULL
      `).run(auth.companyId, ...activeIds);
    } else {
      db.prepare(`
        UPDATE quota_templates
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND deleted_at IS NULL
      `).run(auth.companyId);
    }

    const upsert = db.prepare(`
      INSERT INTO quota_templates (
        id, company_id, template_id, name, status, payload, created_by_id, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
      ON CONFLICT(company_id, template_id) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        payload = excluded.payload,
        updated_at = datetime('now'),
        deleted_at = NULL
    `);

    templates.forEach((template: any) => {
      upsert.run(
        makeId("quota_tpl"),
        auth.companyId,
        String(template.id),
        String(template.name),
        String(template.status || "enabled"),
        JSON.stringify(template),
        auth.userId,
      );
    });
  });

  tx();
  return NextResponse.json({ templates, count: templates.length });
}
