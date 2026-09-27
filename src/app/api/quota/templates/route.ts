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
	  if (scope?.scopeType !== "branch" || !scope.orgUnitId) {
	    return null;
	  }
	  const branchScope = scope;
	  const rawOrg = orgOptions.find((option) => option.id === branchScope.orgUnitId);
	  const branch = branchOptions.find((option) => option.id === branchScope.orgUnitId)
	    || branchOptions.find((option) => rawOrg?.ancestorIds.includes(option.id));
	  if (!branch) return null;
	  return {
	    scopeType: "branch",
	    scopeOrgUnitId: branch.id,
	    autoScope: {
	      ...branchScope,
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
      createdAt: String(value?.createdAt || value?.created_at || value?.updatedAt || "").trim() || new Date().toISOString().slice(0, 10),
      updatedAt: String(value?.updatedAt || "").trim() || new Date().toISOString().slice(0, 10),
    },
  };
}

function makeTemplateSummary(
  row: {
    template_id?: string | null;
    name?: string | null;
    status?: string | null;
    scope_org_unit_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    template_type?: string | null;
    remark?: string | null;
    created_by_name?: string | null;
    created_by_name_snake?: string | null;
    quote_config?: string | null;
    construction_template_config?: string | null;
    payload_created_at?: string | null;
    payload_created_at_snake?: string | null;
    payload_updated_at?: string | null;
  },
  branchOptions: ReturnType<typeof getManageableBranchOptions>["branchOptions"],
) {
  const scopeOrgUnitId = cleanText(row.scope_org_unit_id);
  const branch = branchOptions.find((option) => option.id === scopeOrgUnitId);
  return {
    id: cleanText(row.template_id),
    name: cleanText(row.name) || "未命名模板",
    type: cleanText(row.template_type) || "半包",
    remark: cleanText(row.remark),
    status: cleanText(row.status) || "enabled",
    createdByName: cleanText(row.created_by_name) || cleanText(row.created_by_name_snake),
    autoScope: branch ? {
      scopeType: "branch",
      branchOrgUnitId: branch.id,
      branchOrgUnitName: branch.name,
      branchOrgUnitPath: branch.path,
      orgUnitId: branch.id,
      orgUnitName: branch.name,
      orgUnitPath: branch.path,
      orgUnitType: branch.type || "company",
    } : null,
    constructionTemplateConfig: safeJsonParse(row.construction_template_config, {}),
    quoteConfig: safeJsonParse(row.quote_config, {}),
    projectGroups: [],
    comprehensiveFees: [],
    appendixNote: "",
    budgetCompilationHtml: "",
    spaces: [],
    createdAt: cleanText(row.payload_created_at)
      || cleanText(row.payload_created_at_snake)
      || cleanText(row.created_at)
      || cleanText(row.updated_at),
    updatedAt: cleanText(row.payload_updated_at) || cleanText(row.updated_at) || cleanText(row.created_at),
  };
}

function backfillBranchTemplateScopes(
  db: Db,
  companyId: string,
  orgOptions: ReturnType<typeof getManageableBranchOptions>["orgOptions"],
  branchOptions: ReturnType<typeof getManageableBranchOptions>["branchOptions"],
) {
  const rows = db.prepare(`
    SELECT id, payload
    FROM quota_templates
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND (scope_type IS NULL OR scope_type <> 'branch' OR scope_org_unit_id IS NULL OR scope_org_unit_id = '')
  `).all(companyId) as Array<{ id: string; payload?: string | null }>;
  if (rows.length === 0) return;

  const updateScope = db.prepare(`
    UPDATE quota_templates
    SET scope_type = 'branch', scope_org_unit_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  rows.forEach((row) => {
    const payload = safeJsonParse(row.payload, null);
    if (!payload) return;
    const scope = normalizeTemplateScope(payload, orgOptions, branchOptions);
    if (!scope?.scopeOrgUnitId) return;
    updateScope.run(scope.scopeOrgUnitId, row.id);
  });
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有预算模板权限" }, { status: 403 });

  const db = getDb();
  ensureQuotaTemplatesTable(db);
  const { orgOptions, branchOptions } = getManageableBranchOptions(db, auth);
  backfillBranchTemplateScopes(db, auth.companyId, orgOptions, branchOptions);
  const branchIds = branchOptions.map((option) => option.id);
  const branchPlaceholders = branchIds.map(() => "?").join(",");
  const summaryOnly = cleanText(req.nextUrl.searchParams.get("summary")) === "1";
  if (summaryOnly) {
    const rows = db.prepare(`
      SELECT
        template_id,
        name,
        status,
        scope_org_unit_id,
        created_at,
        updated_at,
        json_extract(payload, '$.type') AS template_type,
        COALESCE(
          json_extract(payload, '$.remark'),
          json_extract(payload, '$.description'),
          json_extract(payload, '$.pricingRule')
        ) AS remark,
        json_extract(payload, '$.createdByName') AS created_by_name,
        json_extract(payload, '$.created_by_name') AS created_by_name_snake,
        json_extract(payload, '$.quoteConfig') AS quote_config,
        json_extract(payload, '$.constructionTemplateConfig') AS construction_template_config,
        json_extract(payload, '$.createdAt') AS payload_created_at,
        json_extract(payload, '$.created_at') AS payload_created_at_snake,
        json_extract(payload, '$.updatedAt') AS payload_updated_at
      FROM quota_templates
      WHERE company_id = ?
        AND deleted_at IS NULL
        AND scope_type = 'branch'
        ${branchIds.length > 0 ? `AND scope_org_unit_id IN (${branchPlaceholders})` : "AND 1 = 0"}
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, template_id DESC
    `).all(auth.companyId, ...branchIds) as any[];
    return NextResponse.json({
      templates: rows.map((row) => makeTemplateSummary(row, branchOptions)),
      orgOptions,
      scopeOptions: branchOptions.map((option) => ({
        id: option.id,
        name: option.name,
        path: option.path,
        type: option.type || "company",
      })),
    });
  }

  const templateId = cleanText(req.nextUrl.searchParams.get("templateId"));
  if (templateId) {
    const row = db.prepare(`
      SELECT payload
      FROM quota_templates
      WHERE company_id = ?
        AND template_id = ?
        AND deleted_at IS NULL
        AND scope_type = 'branch'
        ${branchIds.length > 0 ? `AND scope_org_unit_id IN (${branchPlaceholders})` : "AND 1 = 0"}
      LIMIT 1
    `).get(auth.companyId, templateId, ...branchIds) as { payload?: string | null } | undefined;
    const template = safeJsonParse(row?.payload, null);
    if (!template) return NextResponse.json({ message: "预算模板不存在或无权查看" }, { status: 404 });
    return NextResponse.json({ template });
  }

  const rows = db.prepare(`
    SELECT payload
    FROM quota_templates
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND scope_type = 'branch'
      ${branchIds.length > 0 ? `AND scope_org_unit_id IN (${branchPlaceholders})` : "AND 1 = 0"}
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
  const action = cleanText(body?.action);
  const db = getDb();
  ensureQuotaTemplatesTable(db);
  const { orgOptions, branchOptions } = getManageableBranchOptions(db, auth);
  backfillBranchTemplateScopes(db, auth.companyId, orgOptions, branchOptions);
  const branchIds = branchOptions.map((option) => option.id);
  const branchPlaceholders = branchIds.map(() => "?").join(",");
  const managedScopeSql = branchIds.length > 0
    ? `scope_type = 'branch' AND scope_org_unit_id IN (${branchPlaceholders})`
    : "1 = 0";
  if (action === "delete") {
    const templateId = cleanText(body?.templateId || body?.template_id);
    if (!templateId) return NextResponse.json({ message: "缺少预算模板 ID" }, { status: 400 });
    db.prepare(`
      UPDATE quota_templates
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE company_id = ? AND template_id = ? AND deleted_at IS NULL AND ${managedScopeSql}
    `).run(auth.companyId, templateId, ...branchIds);
    return NextResponse.json({ success: true, templateId });
  }

  const templates = (Array.isArray(body?.templates) ? body.templates : [])
    .map((template: any) => normalizeTemplatePayload(template, orgOptions, branchOptions))
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof normalizeTemplatePayload>>>;
  if (Array.isArray(body?.templates) && templates.length !== body.templates.length) {
    return NextResponse.json({ message: "存在当前账号不可使用的模板范围，请重新选择适用分公司" }, { status: 400 });
  }

  const tx = (db as any).transaction(() => {
    const activeIds = templates.map((template) => String(template.payload.id));
    if (action !== "upsert") {
      if (activeIds.length > 0) {
        const placeholders = activeIds.map(() => "?").join(",");
        db.prepare(`
          UPDATE quota_templates
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE company_id = ? AND template_id NOT IN (${placeholders}) AND deleted_at IS NULL AND ${managedScopeSql}
        `).run(auth.companyId, ...activeIds, ...branchIds);
      } else {
        db.prepare(`
          UPDATE quota_templates
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE company_id = ? AND deleted_at IS NULL AND ${managedScopeSql}
        `).run(auth.companyId, ...branchIds);
      }
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
