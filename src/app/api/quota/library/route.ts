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

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

type OrgOption = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  ancestorIds: string[];
};

function getActiveOrgOptions(db: Db, companyId: string) {
  const rows = db.prepare(`
    SELECT id, name, type, parent_id
    FROM org_units
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND COALESCE(is_active, 1) = 1
  `).all(companyId) as Array<{ id?: string | null; name?: string | null; type?: string | null; parent_id?: string | null }>;
  const map = new Map<string, OrgOption>();
  rows.forEach((row) => {
    const id = cleanText(row.id);
    if (!id) return;
    map.set(id, {
      id,
      name: cleanText(row.name),
      type: cleanText(row.type),
      parent_id: cleanText(row.parent_id) || null,
      ancestorIds: [],
    });
  });
  const getAncestorIds = (org: OrgOption) => {
    const ids: string[] = [];
    let current = org.parent_id ? map.get(org.parent_id) : null;
    let guard = 0;
    while (current && guard < 30) {
      ids.push(current.id);
      current = current.parent_id ? map.get(current.parent_id) : null;
      guard += 1;
    }
    return ids;
  };
  map.forEach((org) => {
    org.ancestorIds = getAncestorIds(org);
  });
  return Array.from(map.values());
}

function getManageableStoreNames(db: Db, auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  const orgOptions = getActiveOrgOptions(db, auth.companyId);
  const stores = orgOptions.filter((option) => option.type === "store" && option.name);
  const currentOrgUnitId = cleanText(auth.orgUnitId);
  if (!currentOrgUnitId) return new Set(stores.map((store) => store.name));

  const currentOrg = orgOptions.find((option) => option.id === currentOrgUnitId);
  if (!currentOrg) return new Set<string>();
  if (currentOrg.type === "store") return new Set(currentOrg.name ? [currentOrg.name] : []);
  if (currentOrg.type === "company" || currentOrg.type === "region" || currentOrg.type === "group") {
    return new Set(stores.filter((store) => store.ancestorIds.includes(currentOrg.id)).map((store) => store.name));
  }
  const parentStore = stores.find((store) => currentOrg.ancestorIds.includes(store.id));
  return new Set(parentStore?.name ? [parentStore.name] : []);
}

function canManageBranch(
  orgOptions: OrgOption[],
  currentOrgUnitId: string,
  branch: OrgOption,
) {
  if (!currentOrgUnitId) return true;
  const currentOrg = orgOptions.find((option) => option.id === currentOrgUnitId);
  if (!currentOrg) return false;
  if (currentOrg.type === "group" || currentOrg.type === "region") {
    return branch.id === currentOrg.id || branch.ancestorIds.includes(currentOrg.id);
  }
  if (currentOrg.type === "company") return branch.id === currentOrg.id;
  return currentOrg.ancestorIds.includes(branch.id);
}

function getScopedStores(
  db: Db,
  auth: NonNullable<ReturnType<typeof getAuthContext>>,
  branchOrgUnitId: string,
) {
  const orgOptions = getActiveOrgOptions(db, auth.companyId);
  const manageableStoreNames = getManageableStoreNames(db, auth);
  const manageableStores = orgOptions.filter((option) => (
    option.type === "store" && option.name && manageableStoreNames.has(option.name)
  ));
  if (!branchOrgUnitId) return { stores: manageableStores, branch: null, error: "" };

  const branch = orgOptions.find((option) => option.id === branchOrgUnitId && option.type === "company");
  if (!branch || !canManageBranch(orgOptions, cleanText(auth.orgUnitId), branch)) {
    return { stores: [] as OrgOption[], branch: null, error: "当前账号无权使用该分公司的基装定额" };
  }
  return {
    stores: orgOptions.filter((store) => (
      store.type === "store" && store.name && store.ancestorIds.includes(branch.id)
    )),
    branch,
    error: "",
  };
}

function filterItemsByManageableStore(items: any[], storeNames: Set<string>) {
  if (storeNames.size === 0) return [];
  return items.filter((item) => storeNames.has(cleanText(item?.scope)));
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
  const branchOrgUnitId = cleanText(
    req.nextUrl.searchParams.get("branchOrgUnitId")
      || req.nextUrl.searchParams.get("branch_org_unit_id"),
  );
  const scoped = getScopedStores(db, auth, branchOrgUnitId);
  if (scoped.error) return NextResponse.json({ message: scoped.error }, { status: 403 });
  const storeNames = new Set(scoped.stores.map((store) => store.name));
  const scopedItems = filterItemsByManageableStore(items, storeNames);
  const itemCountByStore = scopedItems.reduce((counts, item) => {
    const storeName = cleanText(item?.scope);
    if (storeName) counts.set(storeName, (counts.get(storeName) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  return NextResponse.json({
    items: scopedItems,
    branch: scoped.branch ? { id: scoped.branch.id, name: scoped.branch.name } : null,
    storeOptions: scoped.stores.map((store) => ({
      id: store.id,
      name: store.name,
      itemCount: itemCountByStore.get(store.name) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageQuota(auth)) return NextResponse.json({ message: "没有基装定额权限" }, { status: 403 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "非法请求来源" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const db = getDb();
  ensureStandardQuotaItemsTable(db);
  const manageableStoreNames = getManageableStoreNames(db, auth);
  const items = filterItemsByManageableStore(
    Array.isArray(body?.items) ? body.items.map(normalizeQuotaPayload) : [],
    manageableStoreNames,
  );

  const tx = (db as any).transaction(() => {
    const activeIds = items.map((item: any) => String(item.id));
    const manageableStores = Array.from(manageableStoreNames);
    const manageableStorePlaceholders = manageableStores.map(() => "?").join(",");
    if (manageableStores.length === 0) return;
    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => "?").join(",");
      db.prepare(`
        UPDATE standard_quota_items
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND quota_item_id NOT IN (${placeholders}) AND scope IN (${manageableStorePlaceholders}) AND deleted_at IS NULL
      `).run(auth.companyId, ...activeIds, ...manageableStores);
    } else {
      db.prepare(`
        UPDATE standard_quota_items
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE company_id = ? AND scope IN (${manageableStorePlaceholders}) AND deleted_at IS NULL
      `).run(auth.companyId, ...manageableStores);
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
