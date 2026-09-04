import { NextRequest, NextResponse } from "next/server";
import { ensureMaterialSystemSchema, getDb } from "@/lib/db";
import { canManageMaterials, getAuthContext } from "@/lib/security/authorization";

const supplierTypes = ["MAIN_MATERIAL", "AUXILIARY", "CUSTOM", "SOFT_DECOR", "COMPANY_WAREHOUSE", "OTHER"] as const;
const cooperationStatuses = ["ACTIVE", "PENDING", "PAUSED", "BLACKLIST"] as const;
const ratings = ["A", "B", "C", "UNRATED"] as const;

function asText(value: unknown) {
  return String(value || "").trim();
}

function asNullableText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function normalizeEnum<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  const input = asText(value);
  return (options as readonly string[]).includes(input) ? input as T[number] : fallback;
}

function normalizeSupplierType(value: unknown) {
  const input = asText(value);
  if ((supplierTypes as readonly string[]).includes(input)) return input as typeof supplierTypes[number];
  const legacyMap: Record<string, typeof supplierTypes[number]> = {
    GENERAL: "OTHER",
    AUXILIARY_SETTLEMENT: "AUXILIARY",
    WAREHOUSE: "COMPANY_WAREHOUSE",
    LABOR: "AUXILIARY",
    SERVICE: "SOFT_DECOR",
  };
  return legacyMap[input] || "MAIN_MATERIAL";
}

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizeSupplierAccounts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      id: asText(item?.id),
      login_account: asText(item?.login_account || item?.account),
      display_name: asText(item?.display_name || item?.name),
      phone: "",
      role: asText(item?.role) || "ORDER",
      is_active: item?.is_active === false || item?.is_active === 0 ? 0 : 1,
      remark: asText(item?.remark),
    }))
    .filter((item) => item.login_account);
}

function saveSupplierAccounts(db: ReturnType<typeof getDb>, supplierId: string, companyId: string, accounts: ReturnType<typeof normalizeSupplierAccounts>) {
  const keepIds: string[] = [];
  accounts.forEach((account) => {
    const accountId = account.id || makeId("SACC");
    const duplicate = db.prepare(`
      SELECT id
      FROM supplier_accounts
      WHERE company_id = ? AND login_account = ? AND supplier_id <> ? AND deleted_at IS NULL
      LIMIT 1
    `).get(companyId, account.login_account, supplierId) as any;
    if (duplicate?.id) throw new Error(`供应商账号「${account.login_account}」已被其他供应商使用`);
    const existing = account.id
      ? db.prepare("SELECT id FROM supplier_accounts WHERE id = ? AND supplier_id = ? AND company_id = ? AND deleted_at IS NULL")
        .get(account.id, supplierId, companyId) as any
      : null;
    if (existing?.id) {
      db.prepare(`
        UPDATE supplier_accounts
        SET login_account = ?, display_name = ?, phone = ?, role = ?, is_active = ?, remark = ?, updated_at = datetime('now')
        WHERE id = ? AND supplier_id = ? AND company_id = ? AND deleted_at IS NULL
      `).run(account.login_account, account.display_name || null, account.phone || null, account.role, account.is_active, account.remark || null, accountId, supplierId, companyId);
    } else {
      db.prepare(`
        INSERT INTO supplier_accounts (
          id, supplier_id, company_id, login_account, display_name, phone, role, is_active, remark, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(accountId, supplierId, companyId, account.login_account, account.display_name || null, account.phone || null, account.role, account.is_active, account.remark || null);
    }
    keepIds.push(accountId);
  });
  if (keepIds.length > 0) {
    const placeholders = keepIds.map(() => "?").join(",");
    db.prepare(`
      UPDATE supplier_accounts
      SET deleted_at = datetime('now'), is_active = 0, updated_at = datetime('now')
      WHERE supplier_id = ? AND company_id = ? AND deleted_at IS NULL AND id NOT IN (${placeholders})
    `).run(supplierId, companyId, ...keepIds);
  } else {
    db.prepare(`
      UPDATE supplier_accounts
      SET deleted_at = datetime('now'), is_active = 0, updated_at = datetime('now')
      WHERE supplier_id = ? AND company_id = ? AND deleted_at IS NULL
    `).run(supplierId, companyId);
  }
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(auth)) return NextResponse.json({ message: "没有供应商查看权限" }, { status: 403 });
  const db = getDb();
  ensureMaterialSystemSchema(db);

  const suppliers = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM materials m WHERE m.supplier_id = s.id AND m.deleted_at IS NULL AND m.is_active = 1) as material_count,
      (SELECT COUNT(*) FROM material_orders mo WHERE mo.supplier_id = s.id AND mo.deleted_at IS NULL) as order_count,
      (SELECT COALESCE(SUM(mo.total_amount), 0) FROM material_orders mo WHERE mo.supplier_id = s.id AND mo.deleted_at IS NULL) as order_amount,
      (SELECT MAX(mo.order_date) FROM material_orders mo WHERE mo.supplier_id = s.id AND mo.deleted_at IS NULL) as last_order_date,
      (SELECT COUNT(*) FROM supplier_accounts sa WHERE sa.supplier_id = s.id AND sa.deleted_at IS NULL) as account_count
    FROM suppliers s
    WHERE s.company_id = ? AND s.deleted_at IS NULL
    ORDER BY
      CASE COALESCE(s.cooperation_status, 'ACTIVE')
        WHEN 'ACTIVE' THEN 0
        WHEN 'PENDING' THEN 1
        WHEN 'PAUSED' THEN 2
        WHEN 'BLACKLIST' THEN 3
        ELSE 4
      END,
      s.updated_at DESC,
      s.name ASC
  `).all(auth.companyId) as any[];
  const accountRows = db.prepare(`
    SELECT id, supplier_id, login_account, display_name, phone, role, is_active, remark, last_login_at, created_at, updated_at
    FROM supplier_accounts
    WHERE company_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `).all(auth.companyId) as any[];
  const accountsBySupplier = accountRows.reduce<Record<string, any[]>>((result, account) => {
    if (!result[account.supplier_id]) result[account.supplier_id] = [];
    result[account.supplier_id].push(account);
    return result;
  }, {});
  suppliers.forEach((supplier) => {
    supplier.accounts = accountsBySupplier[supplier.id] || [];
  });

  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(auth)) return NextResponse.json({ message: "没有供应商管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureMaterialSystemSchema(db);
    const body = await req.json();
    const action = asText(body.action) || "save";

    if (action === "delete" || action === "pause") {
      const id = asText(body.id);
      if (!id) return NextResponse.json({ message: "缺少供应商" }, { status: 400 });
      const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
        .get(id, auth.companyId);
      if (!supplier) return NextResponse.json({ message: "未找到供应商" }, { status: 404 });
      let result = { supplierChanges: 0, materialChanges: 0 };
      try {
        db.prepare("BEGIN").run();
        const supplierResult = db.prepare(`
          UPDATE suppliers
          SET is_active = 0, cooperation_status = 'PAUSED', updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(id, auth.companyId);
	        const materialResult = db.prepare(`
	          UPDATE materials
	          SET is_active = 0, updated_at = datetime('now')
	          WHERE supplier_id = ? AND company_id = ? AND deleted_at IS NULL
	        `).run(id, auth.companyId);
	        db.prepare(`
	          UPDATE supplier_accounts
	          SET is_active = 0, updated_at = datetime('now')
	          WHERE supplier_id = ? AND company_id = ? AND deleted_at IS NULL
	        `).run(id, auth.companyId);
	        result = { supplierChanges: supplierResult.changes, materialChanges: materialResult.changes };
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      if (result.supplierChanges === 0) return NextResponse.json({ message: "未找到供应商" }, { status: 404 });
      return NextResponse.json({ success: true, pausedMaterialCount: result.materialChanges });
    }

    const name = asText(body.name);
    if (!name) return NextResponse.json({ message: "供应商名称不能为空" }, { status: 400 });
    const explicitId = asText(body.id);
    const id = explicitId || makeId("SUP");
    const companyId = auth.companyId;

    const supplierType = normalizeSupplierType(body.supplier_type);
    const cooperationStatus = normalizeEnum(body.cooperation_status, cooperationStatuses, "ACTIVE");
	    const rating = normalizeEnum(body.rating, ratings, "UNRATED");
	    const accounts = normalizeSupplierAccounts(body.accounts);
    const payload = [
      name,
      asNullableText(body.contact),
      asNullableText(body.phone),
      asNullableText(body.address),
      asNullableText(body.remark),
      supplierType,
      asNullableText(body.settlement_cycle) || "MONTHLY",
      asNullableText(body.bank_account),
      asNullableText(body.tax_no),
      cooperationStatus,
      asNullableText(body.owner_name),
      asNullableText(body.settlement_method),
      asNullableText(body.main_categories),
      rating,
    ];

    const existing = action === "import"
      ? db.prepare("SELECT id FROM suppliers WHERE company_id = ? AND name = ? AND deleted_at IS NULL").get(companyId, name) as any
      : db.prepare("SELECT id FROM suppliers WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(id, companyId) as any;
	    if (existing) {
	      try {
	        db.prepare("BEGIN").run();
	        db.prepare(`
	          UPDATE suppliers
	          SET name = ?, contact = ?, phone = ?, address = ?, remark = ?, supplier_type = ?,
	            settlement_cycle = ?, bank_account = ?, tax_no = ?, cooperation_status = ?, owner_name = ?,
	            settlement_method = ?, main_categories = ?, rating = ?, is_active = 1, updated_at = datetime('now')
		          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
		        `).run(...payload, existing.id || id, companyId);
	        saveSupplierAccounts(db, existing.id || id, companyId, accounts);
	        db.prepare("COMMIT").run();
	      } catch (error) {
	        db.prepare("ROLLBACK").run();
	        throw error;
	      }
	      return NextResponse.json({ success: true, id: existing.id || id });
	    }

	    try {
	      db.prepare("BEGIN").run();
	      db.prepare(`
	        INSERT INTO suppliers (
	          id, company_id, name, contact, phone, address, remark, supplier_type, settlement_cycle,
	          bank_account, tax_no, cooperation_status, owner_name, settlement_method, main_categories,
	          rating, is_active, created_at, updated_at
	        )
	        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
	      `).run(id, companyId, ...payload);
	      saveSupplierAccounts(db, id, companyId, accounts);
	      db.prepare("COMMIT").run();
	    } catch (error) {
	      db.prepare("ROLLBACK").run();
	      throw error;
	    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "保存供应商失败" }, { status: 500 });
  }
}
