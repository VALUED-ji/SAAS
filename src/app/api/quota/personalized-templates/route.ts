import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission, isSameOriginMutation } from "@/lib/security/authorization";
import { normalizePersonalizedTemplate } from "@/lib/personalizedQuotationTemplate";

type Db = ReturnType<typeof getDb>;

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function canManage(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return hasPermission(auth, "quotations.manage") || hasPermission(auth, "settings.manage");
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

type OrgRow = { id: string; name: string; type: string; parent_id?: string | null };

function getOrgOptions(db: Db, companyId: string) {
  const rows = db.prepare(`
    SELECT id, name, type, parent_id
    FROM org_units
    WHERE company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
  `).all(companyId) as OrgRow[];
  const map = new Map(rows.map((row) => [clean(row.id), { ...row, id: clean(row.id), name: clean(row.name), type: clean(row.type), parent_id: clean(row.parent_id) || null }]));
  const ancestors = (row: OrgRow) => {
    const result: string[] = [];
    let current = row.parent_id ? map.get(row.parent_id) : undefined;
    let guard = 0;
    while (current && guard < 30) {
      result.push(current.id);
      current = current.parent_id ? map.get(current.parent_id) : undefined;
      guard += 1;
    }
    return result;
  };
  return Array.from(map.values()).map((row) => ({ ...row, ancestorIds: ancestors(row) }));
}

function getManageableStores(db: Db, auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  const options = getOrgOptions(db, auth.companyId);
  const stores = options.filter((row) => row.type === "store" && row.name);
  const currentOrgId = clean(auth.orgUnitId);
  if (!currentOrgId) return stores;
  const current = options.find((row) => row.id === currentOrgId);
  if (!current) return [];
  if (current.type === "store") return stores.filter((row) => row.id === current.id);
  return stores.filter((row) => row.ancestorIds.includes(current.id));
}

function ensureTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personalized_quotation_templates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      store_id TEXT NOT NULL REFERENCES org_units(id),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'enabled',
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    DROP INDEX IF EXISTS idx_personalized_templates_company_store_name;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personalized_templates_company_store_name_active
      ON personalized_quotation_templates(company_id, store_id, name)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_personalized_templates_company_store
      ON personalized_quotation_templates(company_id, store_id, status, deleted_at);
  `);
}

function parsePayload(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManage(auth)) return NextResponse.json({ message: "没有个性化模板权限" }, { status: 403 });

  const db = getDb();
  ensureTable(db);
  const stores = getManageableStores(db, auth);
  const storeIds = stores.map((store) => store.id);
  const placeholders = storeIds.map(() => "?").join(",");
  const rows = storeIds.length > 0
      ? db.prepare(`
        SELECT t.id, t.store_id, t.name, t.status, t.payload, t.created_by_id, t.created_at, t.updated_at,
          creator.name AS created_by_name
        FROM personalized_quotation_templates t
        LEFT JOIN users creator ON creator.id = t.created_by_id
        WHERE t.company_id = ? AND t.deleted_at IS NULL AND t.store_id IN (${placeholders})
        ORDER BY datetime(t.updated_at) DESC, t.name COLLATE NOCASE
      `).all(auth.companyId, ...storeIds) as any[]
    : [];
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const templates = rows.map((row) => normalizePersonalizedTemplate({
    ...parsePayload(row.payload),
    id: row.id,
    name: row.name,
    status: row.status,
    storeId: row.store_id,
    storeName: storeNames.get(row.store_id) || "",
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })).filter(Boolean);
  return NextResponse.json({
    templates,
    stores: stores.map((store) => ({ id: store.id, name: store.name })),
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManage(auth)) return NextResponse.json({ message: "没有个性化模板权限" }, { status: 403 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "非法请求来源" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const db = getDb();
  ensureTable(db);
  const stores = getManageableStores(db, auth);
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const action = clean(body?.action || "save");

  if (action === "delete" || action === "toggle") {
    const id = clean(body?.id);
    const current = db.prepare(`
      SELECT id, store_id, status
      FROM personalized_quotation_templates
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(id, auth.companyId) as { id?: string; store_id?: string; status?: string } | undefined;
    if (!current || !storeMap.has(clean(current.store_id))) return NextResponse.json({ message: "模板不存在或无权操作" }, { status: 404 });
    if (action === "delete") {
      db.prepare("UPDATE personalized_quotation_templates SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    } else {
      const nextStatus = current.status === "disabled" ? "enabled" : "disabled";
      db.prepare("UPDATE personalized_quotation_templates SET status = ?, updated_at = datetime('now') WHERE id = ?").run(nextStatus, id);
    }
    return NextResponse.json({ ok: true });
  }

  const raw = body?.template;
  const template = normalizePersonalizedTemplate({
    ...raw,
    id: clean(raw?.id) || makeId("personalized"),
    storeId: clean(raw?.storeId || raw?.store_id),
  });
  if (!template) return NextResponse.json({ message: "请填写模板名称、门店，并至少保留有效项目字段" }, { status: 400 });
  if (!storeMap.has(template.storeId)) return NextResponse.json({ message: "当前账号无权维护该门店的模板" }, { status: 403 });
  if (!template.items.length) return NextResponse.json({ message: "请至少添加一个个性化项目" }, { status: 400 });

  const duplicate = db.prepare(`
    SELECT id FROM personalized_quotation_templates
    WHERE company_id = ? AND store_id = ? AND name = ? AND deleted_at IS NULL AND id <> ?
    LIMIT 1
  `).get(auth.companyId, template.storeId, template.name, template.id) as { id?: string } | undefined;
  if (duplicate?.id) return NextResponse.json({ message: "同一门店下已存在同名个性化模板" }, { status: 409 });

  db.prepare(`
    INSERT INTO personalized_quotation_templates
      (id, company_id, store_id, name, status, payload, created_by_id, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
    ON CONFLICT(id) DO UPDATE SET
      store_id = excluded.store_id,
      name = excluded.name,
      status = excluded.status,
      payload = excluded.payload,
      updated_at = datetime('now'),
      deleted_at = NULL
  `).run(
    template.id,
    auth.companyId,
    template.storeId,
    template.name,
    template.status,
    JSON.stringify(template),
    auth.userId,
  );
  return NextResponse.json({ template });
}
