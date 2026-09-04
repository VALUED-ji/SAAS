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

function ensureStandardQuotaItemsTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS standard_quota_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      quota_item_id TEXT NOT NULL,
      code TEXT,
      scope TEXT,
      category TEXT,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'enabled',
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_standard_quota_items_company_item
      ON standard_quota_items(company_id, quota_item_id);
    CREATE INDEX IF NOT EXISTS idx_standard_quota_items_company_status
      ON standard_quota_items(company_id, status, deleted_at);
  `);
}

function normalizeQuotaPayload(value: any) {
  const id = String(value?.id || "").trim() || makeId("quota");
  const name = String(value?.name || "").trim() || "未命名定额";
  const laborPrice = Number(value?.laborPrice || 0);
  const materialPrice = Number(value?.materialPrice || 0);
  return {
    ...value,
    id,
    name,
    code: String(value?.code || "").trim(),
    scope: String(value?.scope || "").trim(),
    category: String(value?.category || "未分类").trim() || "未分类",
    status: value?.status === "disabled" ? "disabled" : "enabled",
    laborPrice: Number.isFinite(laborPrice) ? Math.max(0, laborPrice) : 0,
    materialPrice: Number.isFinite(materialPrice) ? Math.max(0, materialPrice) : 0,
    totalPrice: Number.isFinite(Number(value?.totalPrice)) ? Math.max(0, Number(value.totalPrice)) : Math.max(0, laborPrice + materialPrice),
    updatedAt: String(value?.updatedAt || "").trim() || new Date().toISOString().slice(0, 10),
  };
}

function getActiveStoreNames(db: Db, companyId: string) {
  const rows = db.prepare(`
    SELECT name
    FROM org_units
    WHERE company_id = ?
      AND type = 'store'
      AND deleted_at IS NULL
      AND COALESCE(is_active, 1) = 1
  `).all(companyId) as Array<{ name?: string | null }>;
  return new Set(rows.map((row) => String(row.name || "").trim()).filter(Boolean));
}

function filterItemsByActiveStore(items: any[], activeStoreNames: Set<string>) {
  if (activeStoreNames.size === 0) return items;
  return items.filter((item) => activeStoreNames.has(String(item?.scope || "").trim()));
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有基装定额权限" }, { status: 403 });

  const db = getDb();
  ensureStandardQuotaItemsTable(db);
  const rows = db.prepare(`
    SELECT payload
    FROM standard_quota_items
    WHERE company_id = ? AND deleted_at IS NULL
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, quota_item_id DESC
  `).all(auth.companyId) as Array<{ payload?: string | null }>;
  const items = rows
    .map((row) => safeJsonParse(row.payload, null))
    .filter(Boolean);
  const activeStoreNames = getActiveStoreNames(db, auth.companyId);
  return NextResponse.json({ items: filterItemsByActiveStore(items, activeStoreNames) });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有基装定额权限" }, { status: 403 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "非法请求来源" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const db = getDb();
  ensureStandardQuotaItemsTable(db);
  const activeStoreNames = getActiveStoreNames(db, auth.companyId);
  const items = filterItemsByActiveStore(
    Array.isArray(body?.items) ? body.items.map(normalizeQuotaPayload) : [],
    activeStoreNames,
  );

  const tx = (db as any).transaction(() => {
    const activeIds = items.map((item: any) => String(item.id));
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => "?").join(",");
      db.prepare(`
        UPDATE standard_quota_items
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND quota_item_id NOT IN (${placeholders}) AND deleted_at IS NULL
      `).run(auth.companyId, ...activeIds);
    } else {
      db.prepare(`
        UPDATE standard_quota_items
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND deleted_at IS NULL
      `).run(auth.companyId);
    }

    const upsert = db.prepare(`
      INSERT INTO standard_quota_items (
        id, company_id, quota_item_id, code, scope, category, name, status, payload, created_by_id, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)
      ON CONFLICT(company_id, quota_item_id) DO UPDATE SET
        code = excluded.code,
        scope = excluded.scope,
        category = excluded.category,
        name = excluded.name,
        status = excluded.status,
        payload = excluded.payload,
        updated_at = datetime('now'),
        deleted_at = NULL
    `);

    items.forEach((item: any) => {
      upsert.run(
        makeId("standard_quota"),
        auth.companyId,
        String(item.id),
        String(item.code || ""),
        String(item.scope || ""),
        String(item.category || "未分类"),
        String(item.name),
        String(item.status || "enabled"),
        JSON.stringify(item),
        auth.userId,
      );
    });
  });

  tx();
  return NextResponse.json({ items, count: items.length });
}
