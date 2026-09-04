import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission } from "@/lib/security/authorization";

type Db = ReturnType<typeof getDb>;

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function ensureCustomQuotaItemsTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_quota_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      org_unit_id TEXT REFERENCES org_units(id),
      store_name TEXT,
      category TEXT,
      work_type_id TEXT,
      work_type_name TEXT,
      material_category_id TEXT,
      material_category_name TEXT,
      name TEXT NOT NULL,
      construction_description TEXT,
      unit TEXT NOT NULL,
      labor_price REAL DEFAULT 0,
      material_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      is_special_price INTEGER DEFAULT 0,
      status TEXT DEFAULT 'enabled',
      source_quotation_id TEXT REFERENCES quotations(id),
      source_quotation_item_id TEXT,
      created_by_id TEXT REFERENCES users(id),
      promoted_quota_code TEXT,
      promoted_at TEXT,
      promoted_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_custom_quota_items_scope ON custom_quota_items(company_id, org_unit_id, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_custom_quota_items_lookup ON custom_quota_items(company_id, name, unit, category, deleted_at);
  `);
  const columns = db.prepare("PRAGMA table_info(custom_quota_items)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("created_by_id")) db.prepare("ALTER TABLE custom_quota_items ADD COLUMN created_by_id TEXT REFERENCES users(id)").run();
  if (!names.has("work_type_id")) db.prepare("ALTER TABLE custom_quota_items ADD COLUMN work_type_id TEXT").run();
  if (!names.has("work_type_name")) db.prepare("ALTER TABLE custom_quota_items ADD COLUMN work_type_name TEXT").run();
  if (!names.has("material_category_id")) db.prepare("ALTER TABLE custom_quota_items ADD COLUMN material_category_id TEXT").run();
  if (!names.has("material_category_name")) db.prepare("ALTER TABLE custom_quota_items ADD COLUMN material_category_name TEXT").run();
}

function canManageQuota(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return hasPermission(auth, "quotations.manage") || hasPermission(auth, "settings.manage");
}

function findNearestStore(db: Db, companyId: string, orgUnitId?: string | null) {
  if (!orgUnitId) return null;
  let current = db.prepare(`
    SELECT id, name, type, parent_id
    FROM org_units
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId, companyId) as any;
  const visited = new Set<string>();
  while (current?.id && !visited.has(current.id)) {
    visited.add(current.id);
    if (String(current.type || "") === "store") return current;
    current = current.parent_id
      ? db.prepare(`
        SELECT id, name, type, parent_id
        FROM org_units
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(current.parent_id, companyId) as any
      : null;
  }
  return null;
}

function getQuotationStoreName(db: Db, companyId: string, quotationId?: string | null) {
  if (!quotationId) return "";
  const row = db.prepare(`
    SELECT COALESCE(c.service_store, '') AS store_name
    FROM quotations q
    LEFT JOIN projects p ON p.id = q.project_id AND p.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = p.customer_id AND c.deleted_at IS NULL
    WHERE q.id = ? AND q.company_id = ? AND q.deleted_at IS NULL
    LIMIT 1
  `).get(quotationId, companyId) as any;
  return normalizeText(row?.store_name);
}

function mapCustomQuotaItem(row: any) {
  const storeName = normalizeText(row.store_name) || normalizeText(row.source_store_name);
  return {
    id: String(row.id),
    code: String(row.promoted_quota_code || ""),
    source: "custom" as const,
    scope: storeName,
    orgUnitId: row.org_unit_id ? String(row.org_unit_id) : "",
    storeName,
    category: String(row.category || "未分类"),
    workTypeId: row.work_type_id ? String(row.work_type_id) : "",
    workTypeName: row.work_type_name ? String(row.work_type_name) : "",
    materialCategoryId: row.material_category_id ? String(row.material_category_id) : "",
    materialCategoryName: row.material_category_name ? String(row.material_category_name) : "",
    name: String(row.name || ""),
    constructionDescription: String(row.construction_description || ""),
    unit: String(row.unit || ""),
    laborPrice: toAmount(row.labor_price),
    materialPrice: toAmount(row.material_price),
    totalPrice: toAmount(row.total_price),
    isSpecialPrice: Boolean(row.is_special_price),
    status: String(row.status || "enabled"),
    sourceQuotationId: row.source_quotation_id ? String(row.source_quotation_id) : "",
    sourceQuotationTitle: row.source_quotation_title ? String(row.source_quotation_title) : "",
    sourceQuotationItemId: row.source_quotation_item_id ? String(row.source_quotation_item_id) : "",
    createdById: row.created_by_id ? String(row.created_by_id) : "",
    createdByName: row.created_by_name ? String(row.created_by_name) : "",
    sourceEmployeeName: row.created_by_name ? String(row.created_by_name) : "",
    promotedQuotaCode: row.promoted_quota_code ? String(row.promoted_quota_code) : "",
    promotedAt: row.promoted_at ? String(row.promoted_at) : "",
    updatedAt: String(row.updated_at || row.created_at || ""),
    createdAt: String(row.created_at || ""),
  };
}

function getCustomQuotaItem(db: Db, companyId: string, id: string) {
  return db.prepare(`
    SELECT cqi.*, q.title AS source_quotation_title, c.service_store AS source_store_name, u.name AS created_by_name
    FROM custom_quota_items cqi
    LEFT JOIN quotations q ON q.id = cqi.source_quotation_id AND q.company_id = cqi.company_id AND q.deleted_at IS NULL
    LEFT JOIN projects p ON p.id = q.project_id AND p.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = p.customer_id AND c.deleted_at IS NULL
    LEFT JOIN users u ON u.id = cqi.created_by_id
    WHERE cqi.id = ? AND cqi.company_id = ? AND cqi.deleted_at IS NULL
    LIMIT 1
  `).get(id, companyId) as any;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有定额库权限" }, { status: 403 });

  const db = getDb();
  ensureCustomQuotaItemsTable(db);
  const status = normalizeText(req.nextUrl.searchParams.get("status"));
  const keyword = normalizeText(req.nextUrl.searchParams.get("keyword")).toLowerCase();
  const storeName = normalizeText(req.nextUrl.searchParams.get("storeName"));
  const category = normalizeText(req.nextUrl.searchParams.get("category"));
  const conditions = ["cqi.company_id = ?", "cqi.deleted_at IS NULL"];
  const params: any[] = [auth.companyId];
  if (status === "active") {
    conditions.push("cqi.status != 'promoted'");
  } else if (status && status !== "all") {
    conditions.push("cqi.status = ?");
    params.push(status);
  }
  if (storeName) {
    conditions.push("COALESCE(cqi.store_name, c.service_store, '') = ?");
    params.push(storeName);
  }
  if (category) {
    conditions.push("COALESCE(cqi.category, '') = ?");
    params.push(category);
  }
  if (keyword) {
    conditions.push(`LOWER(
      COALESCE(cqi.name, '') || ' ' ||
      COALESCE(cqi.category, '') || ' ' ||
      COALESCE(cqi.store_name, '') || ' ' ||
      COALESCE(c.service_store, '') || ' ' ||
      COALESCE(u.name, '') || ' ' ||
      COALESCE(cqi.construction_description, '') || ' ' ||
      COALESCE(cqi.unit, '')
    ) LIKE ?`);
    params.push(`%${keyword}%`);
  }

  const rows = db.prepare(`
    SELECT cqi.*, q.title AS source_quotation_title, c.service_store AS source_store_name, u.name AS created_by_name
    FROM custom_quota_items cqi
    LEFT JOIN quotations q ON q.id = cqi.source_quotation_id AND q.company_id = cqi.company_id AND q.deleted_at IS NULL
    LEFT JOIN projects p ON p.id = q.project_id AND p.deleted_at IS NULL
    LEFT JOIN customers c ON c.id = p.customer_id AND c.deleted_at IS NULL
    LEFT JOIN users u ON u.id = cqi.created_by_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY datetime(cqi.updated_at) DESC, datetime(cqi.created_at) DESC, cqi.id DESC
    LIMIT 1000
  `).all(...params);

  return NextResponse.json({ items: rows.map(mapCustomQuotaItem) });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有定额库权限" }, { status: 403 });

  try {
    const db = getDb();
    ensureCustomQuotaItemsTable(db);
    const body = await req.json().catch(() => ({}));
    const action = normalizeText(body.action);
    const id = normalizeText(body.id);

    if (action) {
      if (!id) return NextResponse.json({ message: "缺少自定义项目" }, { status: 400 });
      const existing = getCustomQuotaItem(db, auth.companyId, id);
      if (!existing) return NextResponse.json({ message: "自定义项目不存在" }, { status: 404 });

      if (action === "promote") {
        const promotedQuotaCode = normalizeText(body.promotedQuotaCode || body.promoted_quota_code);
        db.prepare(`
          UPDATE custom_quota_items
          SET status = 'promoted', promoted_quota_code = ?, promoted_at = datetime('now'), promoted_by_id = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(promotedQuotaCode || null, auth.userId, id, auth.companyId);
      } else if (action === "enable" || action === "disable") {
        db.prepare(`
          UPDATE custom_quota_items
          SET status = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(action === "enable" ? "enabled" : "disabled", id, auth.companyId);
      } else if (action === "delete") {
        db.prepare(`
          UPDATE custom_quota_items
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(id, auth.companyId);
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json({ message: "操作无效" }, { status: 400 });
      }

      const row = getCustomQuotaItem(db, auth.companyId, id);
      return NextResponse.json({ success: true, item: mapCustomQuotaItem(row) });
    }

    const name = normalizeText(body.name);
    const unit = normalizeText(body.unit);
    if (!name) return NextResponse.json({ message: "请填写项目名称" }, { status: 400 });
    if (!unit) return NextResponse.json({ message: "请填写单位" }, { status: 400 });

    const category = normalizeText(body.category) || "未分类";
    const laborPrice = toAmount(body.laborPrice ?? body.labor_price);
    const materialPrice = toAmount(body.materialPrice ?? body.material_price);
    const totalPrice = toAmount(body.totalPrice ?? body.total_price) || laborPrice + materialPrice;
    const sourceQuotationId = normalizeText(body.sourceQuotationId || body.source_quotation_id) || null;
    const sourceStoreName = getQuotationStoreName(db, auth.companyId, sourceQuotationId);
    if (sourceQuotationId) {
      const quotation = db.prepare(`
        SELECT id
        FROM quotations
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(sourceQuotationId, auth.companyId) as any;
      if (!quotation?.id) return NextResponse.json({ message: "来源报价不存在" }, { status: 404 });
    }
    const store = findNearestStore(db, auth.companyId, auth.orgUnitId);
    const storeName = normalizeText(body.storeName || body.store_name) || sourceStoreName || normalizeText(store?.name);
    const orgUnitId = normalizeText(body.orgUnitId || body.org_unit_id) || normalizeText(store?.id) || null;

    const duplicate = db.prepare(`
      SELECT id
      FROM custom_quota_items
      WHERE company_id = ?
        AND COALESCE(org_unit_id, '') = COALESCE(?, '')
        AND COALESCE(category, '') = ?
        AND name = ?
        AND unit = ?
        AND deleted_at IS NULL
        AND status != 'promoted'
      LIMIT 1
    `).get(auth.companyId, orgUnitId, category, name, unit) as any;
    if (duplicate?.id) {
      const row = getCustomQuotaItem(db, auth.companyId, duplicate.id);
      return NextResponse.json({ success: true, duplicated: true, item: mapCustomQuotaItem(row) });
    }

    const nextId = makeId("CQUOTA");
    db.prepare(`
      INSERT INTO custom_quota_items (
        id, company_id, org_unit_id, store_name, category, work_type_id, work_type_name, material_category_id, material_category_name, name, construction_description, unit,
        labor_price, material_price, total_price, is_special_price, status,
        source_quotation_id, source_quotation_item_id, created_by_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enabled', ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      nextId,
      auth.companyId,
      orgUnitId,
      storeName || null,
      category,
      normalizeText(body.workTypeId || body.work_type_id) || null,
      normalizeText(body.workTypeName || body.work_type_name) || null,
      normalizeText(body.materialCategoryId || body.material_category_id) || null,
      normalizeText(body.materialCategoryName || body.material_category_name) || null,
      name,
      normalizeText(body.constructionDescription || body.construction_description || body.spec) || null,
      unit,
      laborPrice,
      materialPrice,
      totalPrice,
      body.isSpecialPrice || body.is_special_price ? 1 : 0,
      sourceQuotationId,
      normalizeText(body.sourceQuotationItemId || body.source_quotation_item_id || body.itemId) || null,
      auth.userId,
    );

    const row = getCustomQuotaItem(db, auth.companyId, nextId);
    return NextResponse.json({ success: true, item: mapCustomQuotaItem(row) });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "保存自定义项目失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有定额库权限" }, { status: 403 });

  try {
    const db = getDb();
    ensureCustomQuotaItemsTable(db);
    const body = await req.json().catch(() => ({}));
    const id = normalizeText(body.id);
    if (!id) return NextResponse.json({ message: "缺少自定义项目" }, { status: 400 });
    const existing = getCustomQuotaItem(db, auth.companyId, id);
    if (!existing) return NextResponse.json({ message: "自定义项目不存在" }, { status: 404 });
    const name = normalizeText(body.name);
    const unit = normalizeText(body.unit);
    if (!name) return NextResponse.json({ message: "请填写项目名称" }, { status: 400 });
    if (!unit) return NextResponse.json({ message: "请填写单位" }, { status: 400 });
    const laborPrice = toAmount(body.laborPrice ?? body.labor_price);
    const materialPrice = toAmount(body.materialPrice ?? body.material_price);
    db.prepare(`
      UPDATE custom_quota_items
      SET store_name = ?, category = ?, work_type_id = ?, work_type_name = ?, material_category_id = ?, material_category_name = ?, name = ?, construction_description = ?, unit = ?,
          labor_price = ?, material_price = ?, total_price = ?, is_special_price = ?,
          status = CASE WHEN status = 'promoted' THEN status ELSE ? END,
          updated_at = datetime('now')
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `).run(
      normalizeText(body.storeName || body.store_name) || null,
      normalizeText(body.category) || "未分类",
      normalizeText(body.workTypeId || body.work_type_id) || null,
      normalizeText(body.workTypeName || body.work_type_name) || null,
      normalizeText(body.materialCategoryId || body.material_category_id) || null,
      normalizeText(body.materialCategoryName || body.material_category_name) || null,
      name,
      normalizeText(body.constructionDescription || body.construction_description) || null,
      unit,
      laborPrice,
      materialPrice,
      toAmount(body.totalPrice ?? body.total_price) || laborPrice + materialPrice,
      body.isSpecialPrice || body.is_special_price ? 1 : 0,
      normalizeText(body.status) === "disabled" ? "disabled" : "enabled",
      id,
      auth.companyId,
    );
    const row = getCustomQuotaItem(db, auth.companyId, id);
    return NextResponse.json({ success: true, item: mapCustomQuotaItem(row) });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "保存自定义项目失败" }, { status: 500 });
  }
}
