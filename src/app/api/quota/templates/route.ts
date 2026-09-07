import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";
import { isSameOriginMutation } from "@/lib/security/requestOrigin";
import { buildQuotaTemplateOrgOptions, normalizeQuotaTemplateAutoScope } from "@/lib/quotaTemplateScope";

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
      scope_type TEXT DEFAULT 'global',
      scope_org_unit_id TEXT,
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
  const columns = db.prepare("PRAGMA table_info(quota_templates)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("scope_type")) db.prepare("ALTER TABLE quota_templates ADD COLUMN scope_type TEXT DEFAULT 'global'").run();
  if (!columnNames.has("scope_org_unit_id")) db.prepare("ALTER TABLE quota_templates ADD COLUMN scope_org_unit_id TEXT").run();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quota_templates_company_scope
      ON quota_templates(company_id, scope_type, scope_org_unit_id, deleted_at);
  `);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function safeJsonStringify(value: unknown) {
  return JSON.stringify(value ?? {});
}

function getActiveOrgOptions(db: Db, companyId: string) {
  const rows = db.prepare(`
    SELECT id, name, type, parent_id, COALESCE(is_active, 1) as is_active
    FROM org_units
    WHERE company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    ORDER BY CASE type WHEN 'group' THEN 0 WHEN 'region' THEN 1 WHEN 'company' THEN 2 WHEN 'store' THEN 3 ELSE 4 END, name COLLATE NOCASE
  `).all(companyId) as Array<{ id: string; name: string; type?: string | null; parent_id?: string | null; is_active?: number | null }>;
  return buildQuotaTemplateOrgOptions(rows);
}

function getManageableBranchOptions(db: Db, auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  const companyId = auth.companyId;
  const orgOptions = getActiveOrgOptions(db, companyId);
  const branchOptions = orgOptions.filter((option) => option.type === "company");

  const currentOrgUnitId = cleanText(auth.orgUnitId);
  if (!currentOrgUnitId) return { orgOptions, branchOptions };

  const currentOrg = orgOptions.find((option) => option.id === currentOrgUnitId);
  if (!currentOrg) return { orgOptions, branchOptions: [] };
  if (currentOrg.type === "group" || currentOrg.type === "region") {
    return {
      orgOptions,
      branchOptions: branchOptions.filter((option) => option.id === currentOrg.id || option.ancestorIds.includes(currentOrg.id)),
    };
  }
  if (currentOrg.type === "company") return { orgOptions, branchOptions: [currentOrg] };
  const parentBranch = branchOptions.find((option) => currentOrg.ancestorIds.includes(option.id));
  return { orgOptions, branchOptions: parentBranch ? [parentBranch] : [] };
}

function normalizeTemplateScope(
  value: any,
  orgOptions: ReturnType<typeof getManageableBranchOptions>["orgOptions"],
  branchOptions: ReturnType<typeof getManageableBranchOptions>["branchOptions"],
) {
  const scope = normalizeQuotaTemplateAutoScope(value?.autoScope || value?.scope || value?.accessScope);
  const scopeType = scope?.scopeType === "branch" && scope.orgUnitId ? "branch" : "global";
  if (scopeType !== "branch") {
    return {
      scopeType: "global",
      scopeOrgUnitId: "",
      autoScope: {
        scopeType: "global" as const,
        branchOrgUnitId: "",
        branchOrgUnitName: "",
        branchOrgUnitPath: "",
        orgUnitId: "",
        orgUnitName: "",
        orgUnitPath: "",
        orgUnitType: "",
        companyName: scope?.companyName || "",
        createdByUserId: scope?.createdByUserId || "",
        createdByName: scope?.createdByName || "",
      },
    };
  }
  const rawOrg = orgOptions.find((option) => option.id === scope.orgUnitId);
  const branch = branchOptions.find((option) => option.id === scope.orgUnitId)
    || branchOptions.find((option) => rawOrg?.ancestorIds.includes(option.id));
  if (!branch) return null;
  return {
    scopeType: "branch",
    scopeOrgUnitId: branch.id,
    autoScope: {
      ...scope,
      scopeType: "branch" as const,
      branchOrgUnitId: branch.id,
      branchOrgUnitName: branch.name,
      branchOrgUnitPath: branch.path,
      orgUnitId: branch.id,
      orgUnitName: branch.name,
      orgUnitPath: branch.path,
      orgUnitType: branch.type || "company",
    },
  };
}

function normalizeTemplatePayload(
  value: any,
  orgOptions: ReturnType<typeof getManageableBranchOptions>["orgOptions"],
  branchOptions: ReturnType<typeof getManageableBranchOptions>["branchOptions"],
) {
  const id = String(value?.id || "").trim() || makeId("tpl");
  const name = String(value?.name || "未命名模板").trim() || "未命名模板";
  const status = String(value?.status || "enabled").trim() || "enabled";
  const scope = normalizeTemplateScope(value, orgOptions, branchOptions);
  if (!scope) return null;
  return {
    scopeType: scope.scopeType,
    scopeOrgUnitId: scope.scopeOrgUnitId,
    payload: {
      ...value,
      id,
      name,
      status,
      autoScope: scope.autoScope,
      updatedAt: String(value?.updatedAt || "").trim() || new Date().toISOString().slice(0, 10),
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有预算模板权限" }, { status: 403 });

  const db = getDb();
  ensureQuotaTemplatesTable(db);
  const { orgOptions, branchOptions } = getManageableBranchOptions(db, auth);
  const branchIds = branchOptions.map((option) => option.id);
  const branchPlaceholders = branchIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT payload
    FROM quota_templates
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND (
        COALESCE(scope_type, 'global') = 'global'
        ${branchIds.length > 0 ? `OR (scope_type = 'branch' AND scope_org_unit_id IN (${branchPlaceholders}))` : ""}
      )
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, template_id DESC
  `).all(auth.companyId, ...branchIds) as Array<{ payload?: string | null }>;
  const templates = rows
    .map((row) => safeJsonParse(row.payload, null))
    .filter(Boolean);
  return NextResponse.json({
    templates,
    orgOptions,
    scopeOptions: branchOptions.map((option) => ({
      id: option.id,
      name: option.name,
      path: option.path,
      type: option.type || "company",
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有预算模板权限" }, { status: 403 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "非法请求来源" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const db = getDb();
  ensureQuotaTemplatesTable(db);
  const { orgOptions, branchOptions } = getManageableBranchOptions(db, auth);
  const templates = (Array.isArray(body?.templates) ? body.templates : [])
    .map((template: any) => normalizeTemplatePayload(template, orgOptions, branchOptions))
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof normalizeTemplatePayload>>>;
  if (Array.isArray(body?.templates) && templates.length !== body.templates.length) {
    return NextResponse.json({ message: "存在当前账号不可使用的模板范围，请重新选择适用分公司" }, { status: 400 });
  }

  const tx = (db as any).transaction(() => {
    const activeIds = templates.map((template) => String(template.payload.id));
    const branchIds = branchOptions.map((option) => option.id);
    const branchPlaceholders = branchIds.map(() => "?").join(",");
    const managedScopeSql = `(
      COALESCE(scope_type, 'global') = 'global'
      ${branchIds.length > 0 ? `OR (scope_type = 'branch' AND scope_org_unit_id IN (${branchPlaceholders}))` : ""}
    )`;
    const managedScopeParams = branchIds;
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => "?").join(",");
      db.prepare(`
        UPDATE quota_templates
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND template_id NOT IN (${placeholders}) AND deleted_at IS NULL AND ${managedScopeSql}
      `).run(auth.companyId, ...activeIds, ...managedScopeParams);
    } else {
      db.prepare(`
        UPDATE quota_templates
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND deleted_at IS NULL AND ${managedScopeSql}
      `).run(auth.companyId, ...managedScopeParams);
    }

    const upsert = db.prepare(`
      INSERT INTO quota_templates (
        id, company_id, template_id, name, status, scope_type, scope_org_unit_id, payload, created_by_id, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
      ON CONFLICT(company_id, template_id) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        scope_type = excluded.scope_type,
        scope_org_unit_id = excluded.scope_org_unit_id,
        payload = excluded.payload,
        updated_at = datetime('now'),
        deleted_at = NULL
    `);

    templates.forEach((template) => {
      upsert.run(
        makeId("quota_tpl"),
        auth.companyId,
        String(template.payload.id),
        String(template.payload.name),
        String(template.payload.status || "enabled"),
        template.scopeType,
        template.scopeOrgUnitId || null,
        safeJsonStringify(template.payload),
        auth.userId,
      );
    });
  });

  tx();
  return NextResponse.json({ templates: templates.map((template) => template.payload), count: templates.length });
}
