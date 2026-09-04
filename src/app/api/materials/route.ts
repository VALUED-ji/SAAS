import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureMaterialSystemSchema } from "@/lib/db";
import { canManageMaterials, getAuthContext, hasPermission } from "@/lib/security/authorization";
const materialTypes = ["AUXILIARY", "MAIN"] as const;
const supplyModes = ["WAREHOUSE", "MONTHLY_SETTLEMENT", "SUPPLIER_ORDER"] as const;
const supplierTypes = ["MAIN_MATERIAL", "AUXILIARY", "CUSTOM", "SOFT_DECOR", "COMPANY_WAREHOUSE", "OTHER"] as const;
const orderTypes = ["AUXILIARY_WAREHOUSE", "AUXILIARY_MONTHLY", "MAIN_SUPPLIER"] as const;
const orderStatuses = ["DRAFT", "PENDING", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
const settlementStatuses = ["UNSETTLED", "SETTLING", "SETTLED"] as const;

function normalizeEnum<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  const input = String(value || "").trim();
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

function asText(value: unknown) {
  return String(value || "").trim();
}

function asNullableText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function inferMaterialType(name: string, categoryName?: string | null) {
  const text = `${name} ${categoryName || ""}`;
  if (/瓷砖|地板|木门|洁具|卫浴|橱柜|柜|灯|开关|插座|五金|石材|门窗|封窗/.test(text)) return "MAIN";
  return "AUXILIARY";
}

function inferSupplyMode(materialType: string, name: string) {
  if (materialType === "MAIN") return "SUPPLIER_ORDER";
  if (/水泥|沙|砂|木工板|板材|砖|河沙|黄沙/.test(name)) return "MONTHLY_SETTLEMENT";
  return "WAREHOUSE";
}

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizeMaterialCode(value: unknown) {
  return asText(value).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function makeMaterialNameFromParts(input: { brand?: unknown; product_name?: unknown; material_model?: unknown; color?: unknown; spec?: unknown }) {
  return [input.brand, input.product_name, input.material_model, input.color, input.spec]
    .map((value) => asText(value))
    .filter(Boolean)
    .join(" ");
}

function normalizeImageList(value: unknown, fallback?: unknown) {
  const values: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        })()
      : [value];
  const normalized = values
    .concat(fallback === undefined ? [] : [fallback])
    .map((item) => asText(item))
    .filter(Boolean);
	  return Array.from(new Set(normalized));
	}

type NormalizedProductSku = {
  id: string;
  sku_code: string | null;
  sku_name: string;
  spec: string | null;
  color: string | null;
  attributes: string | null;
  unit: string | null;
  unit_price: number;
  market_price: number | null;
  cost_price: number | null;
  internal_control_price: number | null;
  stock: number;
  min_stock: number;
  image: string | null;
  is_active: number;
  sort_order: number;
};

function normalizeProductSkus(body: any, fallback: { unit?: string | null; unitPrice: number; marketPrice: number | null; costPrice: number | null; internalControlPrice: number | null; spec?: string | null; color?: string | null; image?: string | null }): NormalizedProductSku[] {
  const rawSkus = Array.isArray(body.skus) ? body.skus : [];
  const sourceSkus = rawSkus.length > 0 ? rawSkus : [{
    sku_name: [fallback.color, fallback.spec].map((item) => asText(item)).filter(Boolean).join(" / ") || "默认规格",
    spec: fallback.spec || "",
    color: fallback.color || "",
    unit: fallback.unit || "",
    unit_price: fallback.unitPrice,
    market_price: fallback.marketPrice ?? "",
    cost_price: fallback.costPrice ?? "",
    internal_control_price: fallback.internalControlPrice ?? "",
    stock: 0,
    min_stock: 0,
    image: fallback.image || "",
    is_active: true,
  }];
  return sourceSkus
    .map((sku: any, index: number) => {
      const skuName = asText(sku.sku_name || sku.name || sku.spec || sku.color) || `规格${index + 1}`;
      const unitPrice = asNumber(sku.unit_price);
      return {
        id: asText(sku.id),
        sku_code: asNullableText(sku.sku_code || sku.code),
        sku_name: skuName,
        spec: asNullableText(sku.spec),
        color: asNullableText(sku.color),
        attributes: typeof sku.attributes === "string" ? asNullableText(sku.attributes) : sku.attributes ? JSON.stringify(sku.attributes) : null,
        unit: asNullableText(sku.unit) || fallback.unit || null,
        unit_price: unitPrice,
        market_price: sku.market_price === "" || sku.market_price === undefined || sku.market_price === null ? null : asNumber(sku.market_price),
        cost_price: sku.cost_price === "" || sku.cost_price === undefined || sku.cost_price === null ? null : asNumber(sku.cost_price),
        internal_control_price: sku.internal_control_price === "" || sku.internal_control_price === undefined || sku.internal_control_price === null ? null : asNumber(sku.internal_control_price),
        stock: asNumber(sku.stock),
        min_stock: asNumber(sku.min_stock),
        image: asNullableText(sku.image) || fallback.image || null,
        is_active: sku.is_active === false || sku.is_active === 0 || sku.is_active === "0" ? 0 : 1,
        sort_order: Number.isFinite(Number(sku.sort_order)) ? Number(sku.sort_order) : index + 1,
      };
    })
	    .filter((sku: NormalizedProductSku) => sku.sku_name && sku.unit_price >= 0);
}

function getProductSkuPriceSummary(skus: NormalizedProductSku[], fallback: { unitPrice: number; marketPrice: number | null; costPrice: number | null; internalControlPrice: number | null; unit?: string | null }) {
  const activeSkus = skus.filter((sku: NormalizedProductSku) => sku.is_active === 1);
  const visibleSkus = activeSkus.length > 0 ? activeSkus : skus;
  const first = visibleSkus[0];
  const unitPrices = visibleSkus.map((sku: NormalizedProductSku) => Number(sku.unit_price || 0)).filter((value: number) => Number.isFinite(value));
  const minUnitPrice = unitPrices.length > 0 ? Math.min(...unitPrices) : fallback.unitPrice;
  const marketPrices = visibleSkus.map((sku: NormalizedProductSku) => sku.market_price).filter((value: number | null): value is number => value !== null && Number.isFinite(Number(value)));
  const costPrices = visibleSkus.map((sku: NormalizedProductSku) => sku.cost_price).filter((value: number | null): value is number => value !== null && Number.isFinite(Number(value)));
  const internalControlPrices = visibleSkus.map((sku: NormalizedProductSku) => sku.internal_control_price).filter((value: number | null): value is number => value !== null && Number.isFinite(Number(value)));
  return {
    unit: first?.unit || fallback.unit || "",
    unitPrice: minUnitPrice,
    marketPrice: marketPrices.length > 0 ? Math.min(...marketPrices) : fallback.marketPrice,
    costPrice: costPrices.length > 0 ? Math.min(...costPrices) : fallback.costPrice,
    internalControlPrice: internalControlPrices.length > 0 ? Math.min(...internalControlPrices) : fallback.internalControlPrice,
  };
}

function replaceProductSkus(db: ReturnType<typeof getDb>, materialId: string, companyId: string, skus: NormalizedProductSku[]) {
  const existingRows = db.prepare("SELECT id FROM material_product_skus WHERE material_id = ? AND company_id = ? AND deleted_at IS NULL").all(materialId, companyId) as { id: string }[];
  const existingIds = new Set(existingRows.map((row) => row.id));
  const nextIds = new Set(skus.map((sku: NormalizedProductSku) => sku.id).filter(Boolean));
  const archiveIds = [...existingIds].filter((id) => !nextIds.has(id));
  if (archiveIds.length > 0) {
    db.prepare(`UPDATE material_product_skus SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id IN (${archiveIds.map(() => "?").join(",")}) AND company_id = ?`)
      .run(...archiveIds, companyId);
  }
  const updateSku = db.prepare(`
    UPDATE material_product_skus
    SET sku_code = ?, sku_name = ?, spec = ?, color = ?, attributes = ?, unit = ?, unit_price = ?, market_price = ?, cost_price = ?, internal_control_price = ?,
      stock = ?, min_stock = ?, image = ?, is_active = ?, sort_order = ?, updated_at = datetime('now'), deleted_at = NULL
    WHERE id = ? AND material_id = ? AND company_id = ?
  `);
  const insertSku = db.prepare(`
    INSERT INTO material_product_skus (
      id, company_id, material_id, sku_code, sku_name, spec, color, attributes, unit, unit_price, market_price, cost_price, internal_control_price,
      stock, min_stock, image, is_active, sort_order, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  skus.forEach((sku: NormalizedProductSku) => {
    const skuId = sku.id && existingIds.has(sku.id) ? sku.id : makeId("MSKU");
    if (existingIds.has(skuId)) {
      updateSku.run(sku.sku_code, sku.sku_name, sku.spec, sku.color, sku.attributes, sku.unit, sku.unit_price, sku.market_price, sku.cost_price, sku.internal_control_price, sku.stock, sku.min_stock, sku.image, sku.is_active, sku.sort_order, skuId, materialId, companyId);
    } else {
      insertSku.run(skuId, companyId, materialId, sku.sku_code, sku.sku_name, sku.spec, sku.color, sku.attributes, sku.unit, sku.unit_price, sku.market_price, sku.cost_price, sku.internal_control_price, sku.stock, sku.min_stock, sku.image, sku.is_active, sku.sort_order);
    }
  });
}

function makeMaterialCode(db: ReturnType<typeof getDb>, companyId: string) {
  const now = new Date();
  const prefix = `XY${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rows = db.prepare(`
    SELECT code
    FROM materials
    WHERE company_id = ? AND deleted_at IS NULL AND code LIKE ?
  `).all(companyId, `${prefix}%`) as { code: string }[];
  const used = new Set(rows.map((row) => row.code));
  const maxSequence = rows.reduce((max, row) => {
    const suffix = Number(String(row.code || "").slice(prefix.length));
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  let sequence = maxSequence + 1;
  let code = "";
  do {
    code = `${prefix}${String(sequence).padStart(4, "0")}`;
    sequence += 1;
  } while (used.has(code));
  return code;
}

function recordMaterialPriceHistory(
  db: ReturnType<typeof getDb>,
  {
    materialId,
    companyId,
    costPrice,
	    unitPrice,
	    changedFields,
	    changedById,
	    changedByName,
	    source,
	  }: {
	    materialId: string;
	    companyId: string;
	    costPrice: number | null;
	    unitPrice: number;
	    changedFields: Array<"cost_price" | "unit_price">;
	    changedById?: string | null;
	    changedByName?: string | null;
	    source: string;
	  }
) {
  if (changedFields.length === 0) return;
  const last = db.prepare(`
    SELECT cost_price, unit_price
    FROM material_price_history
    WHERE material_id = ?
    ORDER BY changed_at DESC, created_at DESC
    LIMIT 1
  `).get(materialId) as any;
  const lastCost = last?.cost_price == null ? null : Number(last.cost_price);
  const nextCost = costPrice == null ? null : Number(costPrice);
  const lastSale = Number(last?.unit_price ?? NaN);
  if (last && lastCost === nextCost && lastSale === Number(unitPrice || 0)) return;
	  db.prepare(`
	    INSERT INTO material_price_history (id, material_id, company_id, cost_price, unit_price, changed_fields, changed_by_id, changed_by_name, source, changed_at, created_at)
	    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	  `).run(makeId("MPH"), materialId, companyId, nextCost, Number(unitPrice || 0), changedFields.join(","), changedById || null, changedByName || null, source);
}

function getChangedPriceFields(
  existing: { cost_price?: number | null; unit_price?: number | null } | null | undefined,
  costPrice: number | null,
  unitPrice: number,
) {
  if (!existing) return ["cost_price", "unit_price"] as Array<"cost_price" | "unit_price">;
  const existingCost = existing.cost_price == null ? null : Number(existing.cost_price);
  const nextCost = costPrice == null ? null : Number(costPrice);
  const existingSale = Number(existing.unit_price ?? 0);
  const nextSale = Number(unitPrice || 0);
  const changedFields: Array<"cost_price" | "unit_price"> = [];
  if (existingCost !== nextCost) changedFields.push("cost_price");
  if (existingSale !== nextSale) changedFields.push("unit_price");
  return changedFields;
}

function resolveCategoryId(db: ReturnType<typeof getDb>, companyId: string, inputId: unknown, inputName: unknown) {
  const explicitId = asNullableText(inputId);
  if (explicitId) {
    const existing = db.prepare("SELECT id FROM material_categories WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND is_active = 1 LIMIT 1")
      .get(explicitId, companyId) as any;
    return existing?.id || null;
  }
  const name = asNullableText(inputName);
  if (!name) return null;
  const normalizedName = name.replace(/\s*\/\s*/g, " / ");
  const parts = normalizedName.split(" / ").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const childName = parts[parts.length - 1];
    const parentName = parts.slice(0, -1).join(" / ");
    const existing = db.prepare(`
      SELECT child.id
      FROM material_categories child
      INNER JOIN material_categories parent ON child.parent_id = parent.id
      WHERE child.company_id = ? AND parent.company_id = ?
        AND child.name = ? AND parent.name = ?
        AND child.deleted_at IS NULL AND parent.deleted_at IS NULL
        AND child.is_active = 1 AND parent.is_active = 1
      LIMIT 1
    `).get(companyId, companyId, childName, parentName) as any;
    if (existing?.id) return existing.id;
  }
  const existing = db.prepare(`
    SELECT id
    FROM material_categories
    WHERE company_id = ? AND name = ? AND parent_id IS NOT NULL AND deleted_at IS NULL AND is_active = 1
    LIMIT 1
  `).get(companyId, parts[parts.length - 1] || name) as any;
  return existing?.id || null;
}

function resolveSupplierId(db: ReturnType<typeof getDb>, companyId: string, inputId: unknown, inputName: unknown) {
  const explicitId = asNullableText(inputId);
  if (explicitId) {
    const existing = db.prepare("SELECT id FROM suppliers WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
      .get(explicitId, companyId) as any;
    return existing?.id || null;
  }
  const name = asNullableText(inputName);
  if (!name) return null;
  const existing = db.prepare("SELECT id FROM suppliers WHERE company_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1")
    .get(companyId, name) as any;
  return existing?.id || null;
}

function canManageMaterialCategories(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return auth.isAdmin;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const view = req.nextUrl.searchParams.get("view") || "workspace";
  if (!canManageMaterials(auth) && !(view === "categories" && hasPermission(auth, "quotations.manage"))) return NextResponse.json({ message: "没有材料查看权限" }, { status: 403 });
  const db = getDb();
  ensureMaterialSystemSchema(db);
  const includeMaterials = view !== "categories";
  const includePriceHistory = view === "workspace" || view === "library";
  const includeSuppliers = view === "workspace" || view === "library" || view === "inventory";
  const includeOrders = view === "workspace";
  const includeOrderItems = view === "workspace" || view === "inventory";
  const includeStockMovements = view === "workspace" || view === "inventory";

  const materials = includeMaterials ? (db.prepare(`
    SELECT m.*,
      CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
      parent_mc.name as parent_category_name,
      s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
      s.cooperation_status as supplier_cooperation_status, s.is_active as supplier_is_active,
      (SELECT COUNT(*) FROM material_order_items item INNER JOIN material_orders mo ON item.order_id = mo.id WHERE item.material_id = m.id AND mo.company_id = m.company_id AND mo.deleted_at IS NULL) as order_count,
      (SELECT COALESCE(SUM(item.quantity), 0) FROM material_order_items item INNER JOIN material_orders mo ON item.order_id = mo.id WHERE item.material_id = m.id AND mo.company_id = m.company_id AND mo.deleted_at IS NULL) as order_quantity
    FROM materials m
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    LEFT JOIN suppliers s ON m.supplier_id = s.id
    WHERE m.company_id = ? AND m.deleted_at IS NULL
    ORDER BY datetime(COALESCE(m.created_at, m.updated_at, '1970-01-01')) DESC,
      m.id DESC
  `).all(auth.companyId) as any[]) : [];

	  const priceHistoryRows = includePriceHistory ? (db.prepare(`
	    SELECT mph.material_id, mph.cost_price, mph.unit_price, mph.changed_fields, mph.source, mph.changed_at,
	      mph.changed_by_id, COALESCE(mph.changed_by_name, u.name) as changed_by_name
    FROM material_price_history mph
    INNER JOIN materials material_scope ON material_scope.id = mph.material_id
	    LEFT JOIN users u ON mph.changed_by_id = u.id
    WHERE material_scope.company_id = ? AND material_scope.deleted_at IS NULL
    ORDER BY mph.changed_at ASC, mph.created_at ASC
	  `).all(auth.companyId) as any[]) : [];
  const priceHistoryByMaterial = priceHistoryRows.reduce<Record<string, any[]>>((result, row) => {
    if (!result[row.material_id]) result[row.material_id] = [];
    result[row.material_id].push({
      cost_price: row.cost_price,
      unit_price: row.unit_price,
	      changed_fields: row.changed_fields,
	      source: row.source,
	      changed_at: row.changed_at,
	      changed_by_id: row.changed_by_id,
	      changed_by_name: row.changed_by_name,
	    });
    return result;
  }, {});
	  materials.forEach((material) => {
	    material.price_history = priceHistoryByMaterial[material.id] || [];
	  });
	  if (includeMaterials && materials.length > 0) {
	    const materialIds = materials.map((material) => material.id).filter(Boolean);
	    const skuRows = materialIds.length > 0 ? db.prepare(`
	      SELECT *
	      FROM material_product_skus
	      WHERE company_id = ? AND deleted_at IS NULL AND material_id IN (${materialIds.map(() => "?").join(",")})
	      ORDER BY sort_order ASC, created_at ASC
	    `).all(auth.companyId, ...materialIds) as any[] : [];
	    const skusByMaterial = skuRows.reduce<Record<string, any[]>>((result, sku) => {
	      if (!result[sku.material_id]) result[sku.material_id] = [];
	      result[sku.material_id].push(sku);
	      return result;
	    }, {});
	    materials.forEach((material) => {
	      material.skus = material.material_type === "MAIN" ? (skusByMaterial[material.id] || []) : [];
	    });
	  }

	  const categories = db.prepare(`
    SELECT mc.*, parent_mc.name as parent_name, parent_mc.is_active as parent_is_active,
      parent_mc.material_type as parent_material_type,
      (SELECT COUNT(*) FROM materials m WHERE m.category_id = mc.id AND m.deleted_at IS NULL) as direct_material_count,
      (
        SELECT COUNT(*)
        FROM materials m
        LEFT JOIN material_categories child_mc ON m.category_id = child_mc.id
        WHERE m.deleted_at IS NULL AND (m.category_id = mc.id OR child_mc.parent_id = mc.id)
      ) as material_count,
      (SELECT COUNT(*) FROM material_categories child WHERE child.parent_id = mc.id AND child.deleted_at IS NULL) as child_count
    FROM material_categories mc
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    WHERE mc.company_id = ? AND mc.deleted_at IS NULL
    ORDER BY mc.is_active DESC,
      CASE WHEN mc.parent_id IS NULL THEN mc.sort_order ELSE COALESCE(parent_mc.sort_order, mc.sort_order) END ASC,
      CASE WHEN mc.parent_id IS NULL THEN 0 ELSE 1 END ASC,
      mc.sort_order ASC,
      mc.name ASC
  `).all(auth.companyId);

  const suppliers = includeSuppliers ? (db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM materials m WHERE m.supplier_id = s.id AND m.deleted_at IS NULL AND m.is_active = 1) as material_count,
      (SELECT COUNT(*) FROM material_orders mo WHERE mo.supplier_id = s.id AND mo.deleted_at IS NULL) as order_count,
      (SELECT COALESCE(SUM(mo.total_amount), 0) FROM material_orders mo WHERE mo.supplier_id = s.id AND mo.deleted_at IS NULL) as order_amount
    FROM suppliers s
    WHERE s.company_id = ? AND s.deleted_at IS NULL AND s.is_active = 1
    ORDER BY CASE s.supplier_type
        WHEN 'COMPANY_WAREHOUSE' THEN 0
        WHEN 'AUXILIARY' THEN 1
        WHEN 'MAIN_MATERIAL' THEN 2
        WHEN 'CUSTOM' THEN 3
        WHEN 'SOFT_DECOR' THEN 4
        ELSE 5
      END,
      s.name ASC
  `).all(auth.companyId) as any[]) : [];

  const orders = includeOrders ? (db.prepare(`
    SELECT mo.*, s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
      p.name as project_name, p.address as project_address,
      c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
      u.name as created_by_name,
      (SELECT COUNT(*) FROM material_order_items item WHERE item.order_id = mo.id) as item_count,
      (SELECT COALESCE(SUM(item.quantity), 0) FROM material_order_items item WHERE item.order_id = mo.id) as total_quantity,
      (SELECT COALESCE(SUM(item.received_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as received_quantity
    FROM material_orders mo
    LEFT JOIN suppliers s ON mo.supplier_id = s.id
    LEFT JOIN projects p ON mo.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON mo.created_by_id = u.id
    WHERE mo.company_id = ? AND mo.deleted_at IS NULL
    ORDER BY mo.order_date DESC, mo.created_at DESC
    LIMIT 300
  `).all(auth.companyId) as any[]) : [];

  const orderItems = includeOrderItems ? (db.prepare(`
    SELECT item.*, mo.order_type, mo.status as order_status, mo.project_id, m.code as material_code, m.name as material_name,
      m.brand as material_brand, m.product_name as material_product_name, m.material_model as material_model, m.color as material_color, m.spec as material_spec,
      m.unit as material_unit, m.material_type, m.supply_mode, mc.name as category_name
    FROM material_order_items item
    INNER JOIN material_orders mo ON item.order_id = mo.id
    LEFT JOIN materials m ON item.material_id = m.id
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    WHERE mo.company_id = ? AND mo.deleted_at IS NULL
    ORDER BY mo.order_date DESC, item.created_at ASC
    LIMIT 1000
  `).all(auth.companyId) as any[]) : [];

  const summary = {
    materialCount: materials.length,
    warehouseMaterialCount: materials.filter((item) => item.material_type === "AUXILIARY" && item.supply_mode === "WAREHOUSE").length,
    lowStockCount: materials.filter((item) => item.supply_mode === "WAREHOUSE" && Number(item.stock || 0) <= Number(item.min_stock || 0)).length,
    monthlyMaterialCount: materials.filter((item) => item.supply_mode === "MONTHLY_SETTLEMENT").length,
    mainMaterialCount: materials.filter((item) => item.material_type === "MAIN").length,
    pendingWarehouseOrders: orders.filter((item) => item.order_type === "AUXILIARY_WAREHOUSE" && !["RECEIVED", "CANCELLED"].includes(item.status)).length,
    pendingMainOrders: orders.filter((item) => item.order_type === "MAIN_SUPPLIER" && !["RECEIVED", "CANCELLED"].includes(item.status)).length,
    unsettledAmount: orders
      .filter((item) => item.settlement_status !== "SETTLED" && item.status !== "CANCELLED")
      .reduce((sum, item) => sum + Math.max(0, Number(item.total_amount || 0) - Number(item.paid_amount || 0)), 0),
    supplierCount: suppliers.length,
  };

  const monthlySettlements = orders
    .filter((order) => order.order_type === "AUXILIARY_MONTHLY" && order.status !== "CANCELLED")
    .reduce((rows: any[], order) => {
      const month = order.settlement_month || String(order.order_date || order.created_at || "").slice(0, 7) || "未归档";
      const supplierName = order.supplier_name || "未设置供应商";
      const key = `${month}-${supplierName}`;
      const existing = rows.find((item) => item.key === key);
      if (existing) {
        existing.order_count += 1;
        existing.total_amount += Number(order.total_amount || 0);
        existing.paid_amount += Number(order.paid_amount || 0);
        existing.unsettled_amount += Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
        if (order.settlement_status !== "SETTLED") existing.unsettled_count += 1;
      } else {
        rows.push({
          key,
          month,
          supplier_name: supplierName,
          order_count: 1,
          total_amount: Number(order.total_amount || 0),
          paid_amount: Number(order.paid_amount || 0),
          unsettled_amount: Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0)),
          unsettled_count: order.settlement_status !== "SETTLED" ? 1 : 0,
        });
      }
      return rows;
    }, [])
    .sort((a, b) => String(b.month).localeCompare(String(a.month)));

  const stockMovements = includeStockMovements ? (db.prepare(`
    SELECT msm.*,
      COALESCE(msm.source_no, mo.order_no) as source_no,
      mo.order_no as order_no,
      m.code as material_code, m.name as material_name, m.unit as material_unit,
      m.spec as material_spec, m.brand as material_brand, m.product_name as material_product_name,
      mc.name as category_name
    FROM material_stock_movements msm
    LEFT JOIN material_orders mo ON msm.source_id = mo.id
    LEFT JOIN materials m ON msm.material_id = m.id
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    WHERE m.company_id = ? AND m.deleted_at IS NULL
    ORDER BY datetime(msm.created_at) DESC, msm.id DESC
    LIMIT 3000
  `).all(auth.companyId) as any[]) : [];

  return NextResponse.json({ materials, categories, suppliers, orders, orderItems, summary, monthlySettlements, stockMovements });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(auth)) return NextResponse.json({ message: "没有材料管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureMaterialSystemSchema(db);
    const body = await req.json();
    const action = asText(body.action);

    if (action === "add_material" || action === "update_material" || action === "import_material") {
      const companyId = auth.companyId;
      const brand = asNullableText(body.brand);
      const productName = asNullableText(body.product_name || body.productName || body.item_name);
      const materialModel = asNullableText(body.material_model || body.model);
      const color = asNullableText(body.color);
	      const spec = asNullableText(body.spec);
      const productAttributes = asNullableText(body.product_attributes);
      const productHighlights = asNullableText(body.product_highlights);
      const productDetail = asNullableText(body.product_detail);
	      const name = makeMaterialNameFromParts({ brand, product_name: productName, material_model: materialModel, color, spec });
	      if (!productName) return NextResponse.json({ message: action === "import_material" ? "品名不能为空" : "请填写品名，例如保护膜、PPR管、角阀" }, { status: 400 });
	      let materialId = asText(body.id) || makeId("MAT");
	      const imageList = normalizeImageList(body.images, body.image);
	      const primaryImage = imageList[0] || null;
	      const imageListJson = imageList.length > 0 ? JSON.stringify(imageList) : null;
	      const categoryId = resolveCategoryId(db, companyId, body.category_id, body.category_name);
      if (!categoryId) return NextResponse.json({ message: action === "import_material" ? "材料类别不能为空或未匹配到已启用分类" : "请选择材料类别" }, { status: 400 });
      const category = categoryId
        ? db.prepare(`
            SELECT child.name,
              COALESCE(child.material_type, parent.material_type, 'AUXILIARY') as material_type
            FROM material_categories child
            LEFT JOIN material_categories parent ON child.parent_id = parent.id
            WHERE child.id = ? AND child.company_id = ? AND child.deleted_at IS NULL
            LIMIT 1
          `).get(categoryId, companyId) as any
        : null;
      const categoryName = category?.name || "";
      const materialType = normalizeEnum(body.material_type || inferMaterialType(name, categoryName), materialTypes, "AUXILIARY");
      if (category?.material_type && category.material_type !== materialType) {
        return NextResponse.json({
          message: materialType === "MAIN" ? "产品库只能选择产品分类" : "辅材库只能选择辅材分类",
        }, { status: 400 });
      }
      const supplyMode = normalizeEnum(body.supply_mode || inferSupplyMode(materialType, name), supplyModes, materialType === "MAIN" ? "SUPPLIER_ORDER" : "WAREHOUSE");
	      const requestUser = auth;
	      const requestUserName = requestUser?.userId
	        ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(requestUser.userId) as any)?.name || null
	        : null;
	      const supplierId = resolveSupplierId(db, companyId, body.supplier_id, body.supplier_name);
      if (!supplierId) return NextResponse.json({ message: action === "import_material" ? "供应商不能为空或未匹配到已有供应商" : "请选择供应商" }, { status: 400 });
      const supplier = db.prepare(`
        SELECT owner_name, contact, settlement_cycle, cooperation_status, is_active
        FROM suppliers
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(supplierId, companyId) as any;
      if (!supplier || Number(supplier.is_active ?? 1) !== 1 || supplier.cooperation_status === "PAUSED" || supplier.cooperation_status === "BLACKLIST") {
        return NextResponse.json({ message: action === "import_material" ? "供应商不是合作中状态，不能导入材料" : "请选择合作中的供应商" }, { status: 400 });
      }
      const materialOwnerName = asNullableText(body.owner_name) || asNullableText(supplier?.owner_name) || asNullableText(supplier?.contact);
      const materialSettlementCycle = asNullableText(body.settlement_cycle) || asNullableText(supplier?.settlement_cycle) || "MONTHLY";
	      let materialUnit = asText(body.unit);
	      let unitPrice = asNumber(body.unit_price);
	      let marketPrice = body.market_price === "" || body.market_price === undefined ? null : asNumber(body.market_price);
		      let costPrice = body.cost_price === "" || body.cost_price === undefined ? null : asNumber(body.cost_price);
	      let internalControlPrice = body.internal_control_price === "" || body.internal_control_price === undefined ? null : asNumber(body.internal_control_price);
	      const productSkus = materialType === "MAIN"
	        ? normalizeProductSkus(body, {
	            unit: asText(body.unit),
	            unitPrice,
	            marketPrice,
	            costPrice,
	            internalControlPrice,
	            spec,
	            color,
	            image: primaryImage,
	          })
	        : [];
	      if (materialType === "MAIN") {
	        if (productSkus.length === 0 || !productSkus.some((sku) => sku.is_active === 1)) {
	          return NextResponse.json({ message: "产品至少需要维护一个启用规格" }, { status: 400 });
	        }
	        const skuSummary = getProductSkuPriceSummary(productSkus, { unitPrice, marketPrice, costPrice, internalControlPrice, unit: asText(body.unit) });
	        materialUnit = skuSummary.unit || materialUnit;
	        unitPrice = skuSummary.unitPrice;
	        marketPrice = skuSummary.marketPrice;
	        costPrice = skuSummary.costPrice;
	        internalControlPrice = skuSummary.internalControlPrice;
	      }
	      const requestedCode = normalizeMaterialCode(body.code || body.material_code);
      if (requestedCode && !requestedCode.startsWith("XY")) {
        return NextResponse.json({ message: "材料编码必须以 XY 开头" }, { status: 400 });
      }
	      const importExistingByCode = action === "import_material" && requestedCode
        ? db.prepare(`
            SELECT id, code FROM materials
            WHERE company_id = ? AND code = ? AND deleted_at IS NULL
            LIMIT 1
          `).get(companyId, requestedCode) as any
        : null;
      const importExistingByName = action === "import_material" && !importExistingByCode?.id
        ? db.prepare(`
            SELECT id, code FROM materials
            WHERE company_id = ? AND name = ? AND COALESCE(brand, '') = COALESCE(?, '')
              AND COALESCE(product_name, '') = COALESCE(?, '')
              AND COALESCE(material_model, '') = COALESCE(?, '') AND COALESCE(color, '') = COALESCE(?, '')
              AND COALESCE(spec, '') = COALESCE(?, '')
              AND deleted_at IS NULL
            LIMIT 1
          `).get(companyId, name, brand, productName, materialModel, color, spec) as any
        : null;
      const importExisting = importExistingByCode || importExistingByName;
      if (importExisting?.id) materialId = importExisting.id;
      const existingForUpdate = action === "update_material" || importExisting?.id
        ? db.prepare("SELECT id, code, cost_price, market_price, unit_price, internal_control_price FROM materials WHERE id = ? AND company_id = ? AND deleted_at IS NULL").get(materialId, companyId) as any
        : null;
      const materialCode = requestedCode || existingForUpdate?.code || makeMaterialCode(db, companyId);
      const duplicateCode = db.prepare(`
        SELECT id FROM materials
        WHERE company_id = ? AND code = ? AND id <> ? AND deleted_at IS NULL
        LIMIT 1
      `).get(companyId, materialCode, materialId) as any;
      if (duplicateCode?.id) return NextResponse.json({ message: `材料编码「${materialCode}」已存在，请更换编码` }, { status: 400 });

      if (action === "update_material" || importExisting?.id) {
        if (!existingForUpdate?.id) return NextResponse.json({ message: "未找到材料" }, { status: 404 });
	        db.prepare(`
	          UPDATE materials
	          SET code = ?, category_id = ?, name = ?, brand = ?, product_name = ?, material_model = ?, color = ?, spec = ?,
              product_attributes = ?, product_highlights = ?, product_detail = ?, unit = ?, unit_price = ?, market_price = ?, cost_price = ?, internal_control_price = ?,
	            supplier_id = ?, remark = ?, material_type = ?, supply_mode = ?,
	            warehouse_name = ?, owner_name = ?, settlement_cycle = ?, image = ?, images = ?, is_core = ?, updated_at = datetime('now')
	          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
	        `).run(
          materialCode,
          categoryId,
          name,
          brand,
          productName,
          materialModel,
          color,
          spec,
          productAttributes,
          productHighlights,
          productDetail,
	          materialUnit,
          unitPrice,
          marketPrice,
          costPrice,
          internalControlPrice,
          supplierId,
          asNullableText(body.remark),
          materialType,
          supplyMode,
	          asNullableText(body.warehouse_name) || (supplyMode === "WAREHOUSE" ? "直营辅材仓" : null),
	          materialOwnerName,
	          materialSettlementCycle,
	          primaryImage,
	          imageListJson,
	          body.is_core === false ? 0 : 1,
	          materialId,
            companyId,
        );
        const changedFields = getChangedPriceFields(existingForUpdate, costPrice, unitPrice);
	        if (changedFields.length > 0) {
	          recordMaterialPriceHistory(db, {
            materialId,
            companyId,
            costPrice,
	            unitPrice,
	            changedFields,
	            changedById: requestUser?.userId || null,
	            changedByName: requestUserName,
	            source: action === "import_material" ? "import" : "manual",
		          });
	        }
	        if (materialType === "MAIN") replaceProductSkus(db, materialId, companyId, productSkus);
	        return NextResponse.json({ success: true, id: materialId });
	      }

	      db.prepare(`
	        INSERT INTO materials (
	          id, company_id, code, category_id, name, brand, product_name, material_model, color, spec, product_attributes, product_highlights, product_detail, unit, unit_price, market_price, cost_price, internal_control_price, supplier_id,
	          stock, min_stock, remark, material_type, supply_mode, warehouse_name, owner_name, settlement_cycle, image, images, is_core,
	          is_active, created_at, updated_at
	        )
		        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
	      `).run(
        materialId,
        companyId,
        materialCode,
        categoryId,
        name,
        brand,
        productName,
        materialModel,
        color,
        spec,
        productAttributes,
        productHighlights,
        productDetail,
	        materialUnit,
        unitPrice,
        marketPrice,
        costPrice,
        internalControlPrice,
        supplierId,
        0,
        0,
        asNullableText(body.remark),
        materialType,
        supplyMode,
	        asNullableText(body.warehouse_name) || (supplyMode === "WAREHOUSE" ? "直营辅材仓" : null),
	        materialOwnerName,
	        materialSettlementCycle,
	        primaryImage,
	        imageListJson,
	        body.is_core === false ? 0 : 1,
	      );
	      recordMaterialPriceHistory(db, {
        materialId,
        companyId,
        costPrice,
	        unitPrice,
	        changedFields: ["cost_price", "unit_price"],
	        changedById: requestUser?.userId || null,
	        changedByName: requestUserName,
		        source: action === "import_material" ? "import" : "manual",
		      });
	      if (materialType === "MAIN") replaceProductSkus(db, materialId, companyId, productSkus);
	      return NextResponse.json({ success: true, id: materialId }, { status: 201 });
    }

    if (action === "adjust_stock") {
      const materialId = asText(body.id);
      const stock = asNumber(body.stock);
      const minStock = body.min_stock === undefined ? undefined : asNumber(body.min_stock);
      if (!materialId) return NextResponse.json({ message: "缺少材料" }, { status: 400 });
      const material = db.prepare(`
        SELECT id, company_id, stock, name
        FROM materials
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(materialId, auth.companyId) as any;
      if (!material?.id) return NextResponse.json({ message: "未找到材料" }, { status: 404 });
      const beforeStock = Number(material.stock || 0);
      const requestUser = auth;
      const requestUserName = requestUser?.userId
        ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(requestUser.userId) as any)?.name || null
        : null;
      db.prepare("BEGIN").run();
      try {
        db.prepare(`
          UPDATE materials
          SET stock = ?, min_stock = COALESCE(?, min_stock), updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(stock, minStock === undefined ? null : minStock, materialId, auth.companyId);
        if (beforeStock !== stock) {
          db.prepare(`
            INSERT INTO material_stock_movements (
              id, company_id, material_id, movement_type, quantity, before_stock, after_stock,
              source_type, source_id, source_no, operator_id, operator_name, reason, remark, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL, NULL, ?, ?, ?, ?, datetime('now'))
          `).run(
            makeId("MSM"),
            material.company_id,
            materialId,
            stock > beforeStock ? "IN" : "OUT",
            Math.abs(stock - beforeStock),
            beforeStock,
            stock,
            requestUser?.userId || null,
            requestUserName,
            asNullableText(body.reason) || "库存调整",
            asNullableText(body.remark),
          );
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_material_status") {
      const materialId = asText(body.id);
      if (!materialId) return NextResponse.json({ message: "缺少材料" }, { status: 400 });
      const active = body.is_active === false || body.is_active === 0 || body.is_active === "0" ? 0 : 1;
      if (active === 1) {
        const material = db.prepare(`
          SELECT m.id, m.name, s.name as supplier_name, s.cooperation_status, s.is_active
          FROM materials m
          LEFT JOIN suppliers s ON m.supplier_id = s.id AND s.company_id = m.company_id
          WHERE m.id = ? AND m.company_id = ? AND m.deleted_at IS NULL
          LIMIT 1
        `).get(materialId, auth.companyId) as any;
        if (!material?.id) return NextResponse.json({ message: "未找到材料" }, { status: 404 });
        if (!material.supplier_name || Number(material.is_active ?? 0) !== 1 || material.cooperation_status === "PAUSED" || material.cooperation_status === "BLACKLIST") {
          return NextResponse.json({ message: `供应商「${material.supplier_name || "未设置供应商"}」不是合作中状态，材料不能上架` }, { status: 400 });
        }
      }
      db.prepare(`
        UPDATE materials
        SET is_active = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      `).run(active, materialId, auth.companyId);
      return NextResponse.json({ success: true });
    }

    if (action === "batch_update_material_status" || action === "batch_restore_materials") {
      const materialIds = Array.from(new Set(
        (Array.isArray(body.ids) ? body.ids : [] as unknown[])
          .map((id: unknown) => asText(id))
          .filter(Boolean)
      ));
      const active = action === "batch_restore_materials" || body.is_active === true || body.is_active === 1 || body.is_active === "1" ? 1 : 0;
      if (materialIds.length === 0) return NextResponse.json({ message: active === 1 ? "请选择需要上架的材料" : "请选择需要下架的材料" }, { status: 400 });
      const placeholders = materialIds.map(() => "?").join(", ");
      const materials = db.prepare(`
        SELECT m.id, m.name, m.is_active, s.name as supplier_name, s.cooperation_status, s.is_active as supplier_is_active
        FROM materials m
        LEFT JOIN suppliers s ON m.supplier_id = s.id AND s.company_id = m.company_id
        WHERE m.id IN (${placeholders}) AND m.company_id = ? AND m.deleted_at IS NULL
      `).all(...materialIds, auth.companyId) as any[];
      const targetMaterials = active === 1
        ? materials.filter((material) => Number(material.is_active ?? 1) !== 1)
        : materials.filter((material) => Number(material.is_active ?? 1) === 1);
      const updateableIds = active === 1
        ? targetMaterials
          .filter((material) => material.supplier_name && Number(material.supplier_is_active ?? 0) === 1 && material.cooperation_status !== "PAUSED" && material.cooperation_status !== "BLACKLIST")
          .map((material) => material.id)
        : targetMaterials.map((material) => material.id);
      const blockedMaterials = active === 1
        ? targetMaterials
          .filter((material) => !updateableIds.includes(material.id))
          .map((material) => ({
            id: material.id,
            name: material.name,
            supplier_name: material.supplier_name || "未设置供应商",
            reason: `供应商「${material.supplier_name || "未设置供应商"}」不是合作中状态`,
          }))
        : [];
      let updatedCount = 0;
      if (updateableIds.length > 0) {
        const updatePlaceholders = updateableIds.map(() => "?").join(", ");
        const result = db.prepare(`
          UPDATE materials
          SET is_active = ?, updated_at = datetime('now')
          WHERE id IN (${updatePlaceholders}) AND company_id = ? AND deleted_at IS NULL
        `).run(active, ...updateableIds, auth.companyId);
        updatedCount = Number(result.changes || 0);
      }
      return NextResponse.json({
        success: true,
        requestedCount: materialIds.length,
        updatedCount,
        restoredCount: active === 1 ? updatedCount : 0,
        archivedCount: active === 0 ? updatedCount : 0,
        blockedCount: blockedMaterials.length,
        skippedCount: Math.max(0, materials.length - targetMaterials.length),
        missingCount: Math.max(0, materialIds.length - materials.length),
        blockedMaterials: blockedMaterials.slice(0, 20),
      });
    }

    if (action === "add_category" || action === "update_category") {
      if (!canManageMaterialCategories(auth)) {
        return NextResponse.json({ message: "只有老板或管理员可以维护材料分类" }, { status: 403 });
      }
      const name = asText(body.name);
      if (!name) return NextResponse.json({ message: "分类名称不能为空" }, { status: 400 });
      const categoryId = asText(body.id) || makeId("MC");
      const parentId = asNullableText(body.parent_id);
      if (parentId === categoryId) return NextResponse.json({ message: "上级分类不能选择自己" }, { status: 400 });
      if (parentId) {
        const parent = db.prepare("SELECT id, parent_id FROM material_categories WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
          .get(parentId, auth.companyId) as any;
        if (!parent?.id) return NextResponse.json({ message: "未找到上级分类" }, { status: 400 });
        if (parent.parent_id) return NextResponse.json({ message: "目前仅支持两级材料分类" }, { status: 400 });
        const childCount = action === "update_category"
          ? (db.prepare("SELECT COUNT(*) as count FROM material_categories WHERE parent_id = ? AND company_id = ? AND deleted_at IS NULL")
            .get(categoryId, auth.companyId) as any)?.count || 0
          : 0;
        if (Number(childCount) > 0) return NextResponse.json({ message: "已有二级分类的分类不能再设置为二级分类" }, { status: 400 });
      }
      const duplicate = db.prepare(`
        SELECT id FROM material_categories
        WHERE company_id = ? AND name = ? AND COALESCE(parent_id, '') = COALESCE(?, '') AND id <> ? AND deleted_at IS NULL
        LIMIT 1
      `).get(auth.companyId, name, parentId, categoryId) as any;
      if (duplicate?.id) return NextResponse.json({ message: parentId ? "同一上级下分类名称已存在" : "一级分类名称已存在" }, { status: 400 });
      const sortOrder = body.sort_order === undefined ? null : asNumber(body.sort_order);
      const materialType = normalizeEnum(body.material_type, materialTypes, parentId
        ? (db.prepare("SELECT COALESCE(material_type, 'AUXILIARY') as material_type FROM material_categories WHERE id = ? AND company_id = ?").get(parentId, auth.companyId) as any)?.material_type || "AUXILIARY"
        : "AUXILIARY");
      if (action === "update_category") {
        const existing = db.prepare("SELECT id FROM material_categories WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
          .get(categoryId, auth.companyId);
        if (!existing) return NextResponse.json({ message: "未找到分类" }, { status: 404 });
        db.prepare(`
          UPDATE material_categories
          SET name = ?, parent_id = ?, material_type = ?, sort_order = COALESCE(?, sort_order), updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(name, parentId, materialType, sortOrder, categoryId, auth.companyId);
        return NextResponse.json({ success: true, id: categoryId });
      }
      const row = db.prepare(`
        SELECT COALESCE(MAX(sort_order), 0) + 10 as sort_order
        FROM material_categories
        WHERE company_id = ? AND COALESCE(parent_id, '') = COALESCE(?, '') AND deleted_at IS NULL
      `).get(auth.companyId, parentId) as any;
      db.prepare(`
        INSERT INTO material_categories (id, company_id, name, parent_id, material_type, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(categoryId, auth.companyId, name, parentId, materialType, sortOrder ?? Number(row?.sort_order || 10));
      return NextResponse.json({ success: true, id: categoryId }, { status: 201 });
    }

    if (action === "toggle_category_status") {
      if (!canManageMaterialCategories(auth)) {
        return NextResponse.json({ message: "只有老板或管理员可以维护材料分类" }, { status: 403 });
      }
      const categoryId = asText(body.id);
      if (!categoryId) return NextResponse.json({ message: "缺少分类" }, { status: 400 });
      const active = body.is_active === false || body.is_active === 0 || body.is_active === "0" ? 0 : 1;
      db.prepare(`
        UPDATE material_categories
        SET is_active = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      `).run(active, categoryId, auth.companyId);
      return NextResponse.json({ success: true });
    }

    if (action === "add_supplier" || action === "update_supplier") {
      const name = asText(body.name);
      if (!name) return NextResponse.json({ message: "供应商名称不能为空" }, { status: 400 });
      const supplierId = asText(body.id) || makeId("SUP");
      const companyId = auth.companyId;
      if (!companyId) return NextResponse.json({ message: "缺少公司信息" }, { status: 400 });
      const supplierType = normalizeSupplierType(body.supplier_type);
      if (action === "update_supplier") {
        const existing = db.prepare("SELECT id FROM suppliers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
          .get(supplierId, companyId);
        if (!existing) return NextResponse.json({ message: "未找到供应商" }, { status: 404 });
        db.prepare(`
          UPDATE suppliers
          SET name = ?, contact = ?, phone = ?, address = ?, remark = ?, supplier_type = ?,
            settlement_cycle = ?, bank_account = ?, tax_no = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(
          name,
          asNullableText(body.contact),
          asNullableText(body.phone),
          asNullableText(body.address),
          asNullableText(body.remark),
          supplierType,
          asNullableText(body.settlement_cycle) || "MONTHLY",
          asNullableText(body.bank_account),
          asNullableText(body.tax_no),
          supplierId,
          companyId,
        );
        return NextResponse.json({ success: true, id: supplierId });
      }
      db.prepare(`
        INSERT INTO suppliers (
          id, company_id, name, contact, phone, address, remark, supplier_type, settlement_cycle,
          bank_account, tax_no, is_active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(
        supplierId,
        companyId,
        name,
        asNullableText(body.contact),
        asNullableText(body.phone),
        asNullableText(body.address),
        asNullableText(body.remark),
        supplierType,
        asNullableText(body.settlement_cycle) || "MONTHLY",
        asNullableText(body.bank_account),
        asNullableText(body.tax_no),
      );
      return NextResponse.json({ success: true, id: supplierId }, { status: 201 });
    }

    if (action === "update_order") {
      const orderId = asText(body.id);
      if (!orderId) return NextResponse.json({ message: "缺少订单" }, { status: 400 });
      const status = body.status === undefined ? null : normalizeEnum(body.status, orderStatuses, "ORDERED");
      const settlementStatus = body.settlement_status === undefined ? null : normalizeEnum(body.settlement_status, settlementStatuses, "UNSETTLED");
      const orderType = body.order_type === undefined ? null : normalizeEnum(body.order_type, orderTypes, "MAIN_SUPPLIER");
      const settlementMonth = body.settlement_month === undefined ? null : asNullableText(body.settlement_month);
      const handlerName = body.handler_name === undefined ? null : asNullableText(body.handler_name);
      const paidAmount = body.paid_amount === undefined ? null : asNumber(body.paid_amount);
      db.prepare(`
        UPDATE material_orders
        SET status = COALESCE(?, status),
          settlement_status = COALESCE(?, settlement_status),
          order_type = COALESCE(?, order_type),
          settlement_month = COALESCE(?, settlement_month),
          handler_name = COALESCE(?, handler_name),
          paid_amount = COALESCE(?, paid_amount),
          received_at = CASE WHEN ? = 'RECEIVED' THEN COALESCE(received_at, datetime('now')) ELSE received_at END,
          updated_at = datetime('now')
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      `).run(status, settlementStatus, orderType, settlementMonth, handlerName, paidAmount, status, orderId, auth.companyId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "未知操作" }, { status: 400 });
  } catch {
    return NextResponse.json({ message: "材料操作失败" }, { status: 500 });
  }
}
