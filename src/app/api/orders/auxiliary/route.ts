import { NextRequest, NextResponse } from "next/server";
import { mergeBranchSettings } from "@/lib/branchSettings";
import { ensureMaterialSystemSchema, getDb } from "@/lib/db";
import {
  assertEnoughMaterialStock,
  deductMaterialStock,
  getOrderDeductedStockItems,
  getOrderPendingStockItems,
  getOrderStockItems,
  markOrderStockDeducted,
  restoreMaterialStock,
} from "@/lib/material-inventory";
import { makeMaterialOrderNo } from "@/lib/materialOrderNo";
import { canManageMaterials, getAuthContext } from "@/lib/security/authorization";
const orderTypes = ["AUXILIARY_WAREHOUSE", "AUXILIARY_MONTHLY"] as const;
const orderStatuses = ["PENDING", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
const settlementStatuses = ["UNSETTLED", "SETTLING", "SETTLED"] as const;
const EMPTY_STORE_FILTER = "__EMPTY_STORE__";
let auxiliaryOrderListIndexesReady = false;
const normalizedOrderStatusSql = `CASE
  WHEN UPPER(COALESCE(mo.status, '')) IN ('ORDERED', 'DRAFT') THEN 'PENDING'
  WHEN UPPER(COALESCE(mo.status, '')) IN ('PENDING', 'PARTIAL', 'RECEIVED', 'CANCELLED') THEN UPPER(COALESCE(mo.status, ''))
  ELSE 'PENDING'
END`;

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

function normalizeEnum<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  const input = asText(value);
  return (options as readonly string[]).includes(input) ? input as T[number] : fallback;
}

function normalizeOrderStatus(value: unknown): typeof orderStatuses[number] {
  const input = asText(value).toUpperCase();
  if (input === "ORDERED" || input === "DRAFT") return "PENDING";
  return normalizeEnum(input, orderStatuses, "PENDING");
}

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function getRequestUser(req: NextRequest) {
  return getAuthContext(req);
}

function getCompanyCondition(alias: string, companyId: string) {
  return companyId ? ` AND ${alias}.company_id = ?` : "";
}

function ensureAuxiliaryOrderListIndexes(db: ReturnType<typeof getDb>) {
  if (auxiliaryOrderListIndexesReady) return;
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_orders_aux_list ON material_orders(company_id, order_type, deleted_at, status, order_date, created_at);
    CREATE INDEX IF NOT EXISTS idx_material_orders_aux_project ON material_orders(project_id, order_type, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_material_order_items_order_material ON material_order_items(order_id, material_id);
    CREATE INDEX IF NOT EXISTS idx_materials_search_aux ON materials(company_id, deleted_at, is_active, name, code);
    CREATE INDEX IF NOT EXISTS idx_projects_customer_deleted ON projects(customer_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customers_store_deleted ON customers(service_store, deleted_at);
  `);
  auxiliaryOrderListIndexesReady = true;
}

function getAuxiliaryOrderBaseWhere(companyId: string) {
  const where = [
    "mo.deleted_at IS NULL",
    "mo.order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')",
  ];
  const params: unknown[] = [];
  if (companyId) {
    where.push("mo.company_id = ?");
    params.push(companyId);
  }
  return { where, params };
}

function getTrimmedQuery(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || "";
}

function buildAuxiliaryOrderListWhere(searchParams: URLSearchParams, companyId: string, options: { includeStatus?: boolean } = {}) {
  const includeStatus = options.includeStatus !== false;
  const base = getAuxiliaryOrderBaseWhere(companyId);
  const where = [...base.where];
  const params = [...base.params];

  const status = getTrimmedQuery(searchParams, "status");
  if (includeStatus) {
    if (status && status !== "all") {
      where.push(`${normalizedOrderStatusSql} = ?`);
      params.push(normalizeOrderStatus(status));
    } else {
      where.push(`${normalizedOrderStatusSql} != 'CANCELLED'`);
    }
  }

  const store = getTrimmedQuery(searchParams, "store");
  if (store) {
    if (store === EMPTY_STORE_FILTER) {
      where.push("TRIM(COALESCE(c.service_store, '')) = ''");
    } else {
      where.push("TRIM(COALESCE(c.service_store, '')) = ?");
      params.push(store);
    }
  }

  const search = getTrimmedQuery(searchParams, "search").toLowerCase();
  if (search) {
    const like = `%${search}%`;
    where.push(`(
      lower(COALESCE(mo.order_no, '')) LIKE ?
      OR lower(COALESCE(s.name, '')) LIKE ?
      OR lower(COALESCE(p.name, '')) LIKE ?
      OR lower(COALESCE(p.address, '')) LIKE ?
      OR lower(COALESCE(c.name, '')) LIKE ?
      OR lower(COALESCE(c.phone, '')) LIKE ?
      OR lower(COALESCE(c.address, '')) LIKE ?
      OR lower(COALESCE(c.house_address, '')) LIKE ?
      OR lower(COALESCE(c.service_store, '')) LIKE ?
      OR lower(COALESCE(u.name, '')) LIKE ?
      OR lower(COALESCE(u.phone, '')) LIKE ?
      OR lower(COALESCE(mo.notes, '')) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM material_order_items search_item
        LEFT JOIN materials search_material ON search_item.material_id = search_material.id
        LEFT JOIN material_categories search_category ON search_material.category_id = search_category.id
        WHERE search_item.order_id = mo.id
          AND (
            lower(COALESCE(search_material.name, '')) LIKE ?
            OR lower(COALESCE(search_material.code, '')) LIKE ?
            OR lower(COALESCE(search_category.name, '')) LIKE ?
          )
      )
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, like, like, like, like, like);
  }

  return { where: where.join(" AND "), params };
}

function getAuxiliaryOrderListSql(whereSql: string, limitSql = "") {
  return `
    SELECT mo.*, co.name as company_name,
      s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
      p.name as project_name, p.address as project_address, p.area as project_area,
      p.status as project_status, p.site_stage, p.current_phase, p.start_date as project_start_date,
      c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
      c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      c.service_store,
      manager.name as project_manager_name, manager.phone as project_manager_phone,
      u.name as created_by_name, u.phone as created_by_phone,
      (SELECT COUNT(*) FROM material_order_items item WHERE item.order_id = mo.id) as item_count,
      (SELECT COALESCE(SUM(item.quantity), 0) FROM material_order_items item WHERE item.order_id = mo.id) as total_quantity,
      (SELECT COALESCE(SUM(item.received_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as received_quantity,
      (SELECT COALESCE(SUM(item.stock_deducted_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as stock_deducted_quantity
    FROM material_orders mo
    LEFT JOIN companies co ON mo.company_id = co.id
    LEFT JOIN suppliers s ON mo.supplier_id = s.id
    LEFT JOIN projects p ON mo.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users manager ON p.manager_id = manager.id
    LEFT JOIN users u ON mo.created_by_id = u.id
    WHERE ${whereSql}
    ORDER BY datetime(COALESCE(mo.order_date, mo.created_at, '1970-01-01')) DESC,
      datetime(COALESCE(mo.created_at, '1970-01-01')) DESC,
      mo.id DESC
    ${limitSql}
  `;
}

function getAuxiliaryOrderItemsForOrders(db: ReturnType<typeof getDb>, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  return db.prepare(`
    SELECT item.*, mo.order_type, mo.project_id,
      m.code as material_code, m.name as material_name, m.brand as material_brand,
      m.product_name as material_product_name, m.material_model as material_model,
      m.color as material_color, m.spec as material_spec, m.unit as material_unit,
      m.image as material_image, m.images as material_images,
      m.stock as material_stock, m.min_stock as material_min_stock,
      m.material_type, m.supply_mode, m.warehouse_name, m.owner_name,
      CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
      ms.name as material_supplier_name
    FROM material_order_items item
    INNER JOIN material_orders mo ON item.order_id = mo.id
    LEFT JOIN materials m ON item.material_id = m.id
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    LEFT JOIN suppliers ms ON m.supplier_id = ms.id
    WHERE item.order_id IN (${orderIds.map(() => "?").join(",")})
    ORDER BY datetime(COALESCE(mo.order_date, mo.created_at, '1970-01-01')) DESC,
      item.created_at ASC
  `).all(...orderIds) as any[];
}

function getAuxiliaryOrderStatusCounts(db: ReturnType<typeof getDb>, searchParams: URLSearchParams, companyId: string) {
  const base = buildAuxiliaryOrderListWhere(searchParams, companyId, { includeStatus: false });
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN ${normalizedOrderStatusSql} != 'CANCELLED' THEN 1 ELSE 0 END) as active_total,
      SUM(CASE WHEN ${normalizedOrderStatusSql} = 'PENDING' THEN 1 ELSE 0 END) as pending_total,
      SUM(CASE WHEN ${normalizedOrderStatusSql} = 'PARTIAL' THEN 1 ELSE 0 END) as partial_total,
      SUM(CASE WHEN ${normalizedOrderStatusSql} = 'RECEIVED' THEN 1 ELSE 0 END) as received_total,
      SUM(CASE WHEN ${normalizedOrderStatusSql} = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_total
    FROM material_orders mo
    LEFT JOIN suppliers s ON mo.supplier_id = s.id
    LEFT JOIN projects p ON mo.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON mo.created_by_id = u.id
    WHERE ${base.where}
  `).get(...base.params) as Record<string, number | null | undefined>;
  return {
    all: Number(row?.active_total || 0),
    PENDING: Number(row?.pending_total || 0),
    PARTIAL: Number(row?.partial_total || 0),
    RECEIVED: Number(row?.received_total || 0),
    CANCELLED: Number(row?.cancelled_total || 0),
  };
}

function getAuxiliaryOrderStoreOptions(db: ReturnType<typeof getDb>, companyId: string) {
  const base = getAuxiliaryOrderBaseWhere(companyId);
  const rows = db.prepare(`
    SELECT
      CASE WHEN TRIM(COALESCE(c.service_store, '')) = '' THEN ? ELSE TRIM(c.service_store) END as value,
      CASE WHEN TRIM(COALESCE(c.service_store, '')) = '' THEN '未设置服务门店' ELSE TRIM(c.service_store) END as label,
      COUNT(*) as count
    FROM material_orders mo
    LEFT JOIN projects p ON mo.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    WHERE ${base.where.join(" AND ")}
      AND ${normalizedOrderStatusSql} != 'CANCELLED'
    GROUP BY value, label
    ORDER BY CASE WHEN value = ? THEN 1 ELSE 0 END ASC, label ASC
  `).all(EMPTY_STORE_FILTER, ...base.params, EMPTY_STORE_FILTER) as { value: string; label: string; count: number }[];
  return rows;
}

function getPagedAuxiliaryOrders(req: NextRequest, companyId: string) {
  const db = getDb();
  ensureMaterialSystemSchema(db);
  ensureAuxiliaryOrderListIndexes(db);
  const searchParams = req.nextUrl.searchParams;
  const exportAll = searchParams.get("export") === "1";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const requestedPageSize = Math.max(1, Number(searchParams.get("pageSize") || 20) || 20);
  const pageSize = exportAll ? 100000 : Math.min(requestedPageSize, 200);
  const offset = (page - 1) * pageSize;
  const filters = buildAuxiliaryOrderListWhere(searchParams, companyId);
  const total = Number((db.prepare(`
    SELECT COUNT(*) as total
    FROM material_orders mo
    LEFT JOIN suppliers s ON mo.supplier_id = s.id
    LEFT JOIN projects p ON mo.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON mo.created_by_id = u.id
    WHERE ${filters.where}
  `).get(...filters.params) as { total?: number })?.total || 0);
  const limitSql = exportAll ? "" : "LIMIT ? OFFSET ?";
  const params = exportAll ? filters.params : [...filters.params, pageSize, offset];
  const orders = (db.prepare(getAuxiliaryOrderListSql(filters.where, limitSql)).all(...params) as any[]).map((order) => ({
    ...order,
    status: normalizeOrderStatus(order.status),
  }));
  const orderItems = exportAll ? [] : getAuxiliaryOrderItemsForOrders(db, orders.map((order) => order.id));
  const statusCounts = getAuxiliaryOrderStatusCounts(db, searchParams, companyId);

  return NextResponse.json({
    orders,
    orderItems,
    projects: [],
    materials: [],
    suppliers: [],
    orderTemplates: [],
    total,
    page,
    pageSize: exportAll ? total || pageSize : pageSize,
    statusCounts,
    storeOptions: getAuxiliaryOrderStoreOptions(db, companyId),
    summary: {
      totalCount: statusCounts.all,
      activeCount: statusCounts.PENDING + statusCounts.PARTIAL,
      pendingCount: statusCounts.PENDING,
      partialCount: statusCounts.PARTIAL,
      receivedCount: statusCounts.RECEIVED,
      cancelledCount: statusCounts.CANCELLED,
      totalAmount: orders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
    },
  });
}

function getAuxiliaryOrderTemplates(db: ReturnType<typeof getDb>, companyId: string) {
  if (!companyId) return [];
  const materialRows = db.prepare(`
    SELECT id, supplier_id
    FROM materials
    WHERE company_id = ?
      AND deleted_at IS NULL
      AND is_active = 1
      AND COALESCE(material_type, 'AUXILIARY') <> 'MAIN'
      AND COALESCE(supply_mode, 'WAREHOUSE') = 'WAREHOUSE'
  `).all(companyId) as { id: string; supplier_id?: string | null }[];
  const materialMap = new Map(materialRows.map((material) => [material.id, material]));
  const rows = db.prepare(`
    SELECT bs.org_unit_id, bs.settings, ou.name as branch_name
    FROM branch_settings bs
    LEFT JOIN org_units ou ON bs.org_unit_id = ou.id
    WHERE bs.deleted_at IS NULL
      AND bs.company_id = ?
    ORDER BY datetime(COALESCE(bs.updated_at, bs.created_at, '1970-01-01')) DESC
  `).all(companyId) as any[];
  return rows.flatMap((row) => {
    const settings = mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {});
    return settings.orderSettings.auxiliaryTemplates
      .filter((template) => template.isEnabled)
      .map((template) => {
        const items = template.items.filter((item) => {
          const material = materialMap.get(item.materialId);
          if (!material) return false;
          if (template.warehouseSupplierId && material.supplier_id !== template.warehouseSupplierId) return false;
          return true;
        });
        return {
          id: template.id,
          name: template.name,
          orgUnitId: row.org_unit_id,
          branchName: row.branch_name || "",
          warehouseSupplierId: template.warehouseSupplierId,
          itemCount: items.length,
          items,
        };
      })
      .filter((template) => template.items.length > 0);
  });
}

export async function GET(req: NextRequest) {
  const requestUser = getRequestUser(req);
  if (!requestUser) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(requestUser)) return NextResponse.json({ message: "没有辅材订单查看权限" }, { status: 403 });
  const db = getDb();
  ensureMaterialSystemSchema(db);
  const companyId = requestUser.companyId;
  if (req.nextUrl.searchParams.get("mode") === "list" || req.nextUrl.searchParams.has("page")) {
    return getPagedAuxiliaryOrders(req, companyId);
  }

  const rawOrders = db.prepare(`
    SELECT mo.*, co.name as company_name,
      s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
      p.name as project_name, p.address as project_address, p.area as project_area,
      p.status as project_status, p.site_stage, p.current_phase, p.start_date as project_start_date,
      c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
      c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      c.service_store,
      manager.name as project_manager_name, manager.phone as project_manager_phone,
      u.name as created_by_name, u.phone as created_by_phone,
      (SELECT COUNT(*) FROM material_order_items item WHERE item.order_id = mo.id) as item_count,
      (SELECT COALESCE(SUM(item.quantity), 0) FROM material_order_items item WHERE item.order_id = mo.id) as total_quantity,
      (SELECT COALESCE(SUM(item.received_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as received_quantity,
      (SELECT COALESCE(SUM(item.stock_deducted_qty), 0) FROM material_order_items item WHERE item.order_id = mo.id) as stock_deducted_quantity
    FROM material_orders mo
    LEFT JOIN companies co ON mo.company_id = co.id
    LEFT JOIN suppliers s ON mo.supplier_id = s.id
    LEFT JOIN projects p ON mo.project_id = p.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users manager ON p.manager_id = manager.id
    LEFT JOIN users u ON mo.created_by_id = u.id
    WHERE mo.deleted_at IS NULL
      AND mo.order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')
      ${getCompanyCondition("mo", companyId)}
    ORDER BY datetime(COALESCE(mo.order_date, mo.created_at, '1970-01-01')) DESC,
      datetime(COALESCE(mo.created_at, '1970-01-01')) DESC,
      mo.id DESC
    LIMIT 500
  `).all(...(companyId ? [companyId] : [])) as any[];
  const orders = rawOrders.map((order) => ({
    ...order,
    status: normalizeOrderStatus(order.status),
  }));

  const orderItems = db.prepare(`
    SELECT item.*, mo.order_type, mo.project_id,
      m.code as material_code, m.name as material_name, m.brand as material_brand,
      m.product_name as material_product_name, m.material_model as material_model,
      m.color as material_color, m.spec as material_spec, m.unit as material_unit,
      m.image as material_image, m.images as material_images,
      m.stock as material_stock, m.min_stock as material_min_stock,
      m.material_type, m.supply_mode, m.warehouse_name, m.owner_name,
      CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
      ms.name as material_supplier_name
    FROM material_order_items item
    INNER JOIN material_orders mo ON item.order_id = mo.id
    LEFT JOIN materials m ON item.material_id = m.id
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    LEFT JOIN suppliers ms ON m.supplier_id = ms.id
    WHERE mo.deleted_at IS NULL
      AND mo.order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')
      ${getCompanyCondition("mo", companyId)}
    ORDER BY datetime(COALESCE(mo.order_date, mo.created_at, '1970-01-01')) DESC,
      item.created_at ASC
    LIMIT 2000
  `).all(...(companyId ? [companyId] : [])) as any[];

  const projects = db.prepare(`
    SELECT p.id, p.company_id, p.name, p.address, p.area, p.status, p.site_stage, p.current_phase,
      p.start_date, p.planned_end_date,
      c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
      c.house_address as customer_house_address,
      c.building_no as customer_building_no, c.unit_no as customer_unit_no,
      c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
      c.service_store,
      store.id as store_org_unit_id, branch.id as branch_org_unit_id, branch.name as branch_name,
      u.name as manager_name, u.phone as manager_phone
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN org_units store ON c.service_store = store.name AND store.deleted_at IS NULL
    LEFT JOIN org_units branch ON store.parent_id = branch.id AND branch.type = 'company' AND branch.deleted_at IS NULL
    LEFT JOIN users u ON p.manager_id = u.id
    WHERE p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      ${getCompanyCondition("p", companyId)}
      AND (
        p.status IN ('SIGNED', 'CONSTRUCTION', 'COMPLETED', 'CLOSED')
        OR p.site_stage IN ('PENDING_START', 'START_CONFIRM', 'CONSTRUCTION', 'OWNER_SETTLEMENT', 'SITE_SETTLEMENT')
        OR EXISTS (
          SELECT 1
          FROM contracts contract
          WHERE contract.project_id = p.id
            AND contract.deleted_at IS NULL
            AND contract.status IN ('SIGNED', 'RESIGNED')
        )
      )
    ORDER BY datetime(COALESCE(p.updated_at, p.created_at, '1970-01-01')) DESC,
      p.id DESC
    LIMIT 500
  `).all(...(companyId ? [companyId] : [])) as any[];

  const materials = db.prepare(`
    SELECT m.*,
      CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
      s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
      s.cooperation_status as supplier_cooperation_status, s.is_active as supplier_is_active
    FROM materials m
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    LEFT JOIN suppliers s ON m.supplier_id = s.id
    WHERE m.deleted_at IS NULL
      AND m.is_active = 1
      AND COALESCE(m.material_type, 'AUXILIARY') <> 'MAIN'
      AND COALESCE(m.supply_mode, 'WAREHOUSE') IN ('WAREHOUSE', 'MONTHLY_SETTLEMENT')
      ${getCompanyCondition("m", companyId)}
    ORDER BY CASE COALESCE(m.supply_mode, 'WAREHOUSE') WHEN 'WAREHOUSE' THEN 0 ELSE 1 END,
      COALESCE(parent_mc.sort_order, mc.sort_order, 999) ASC,
      COALESCE(mc.sort_order, 999) ASC,
      m.name ASC
  `).all(...(companyId ? [companyId] : [])) as any[];

  const suppliers = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM materials m WHERE m.supplier_id = s.id AND m.deleted_at IS NULL AND m.is_active = 1) as material_count
    FROM suppliers s
    WHERE s.deleted_at IS NULL
      AND s.is_active = 1
      AND COALESCE(s.cooperation_status, 'ACTIVE') = 'ACTIVE'
      AND COALESCE(s.supplier_type, 'OTHER') IN ('AUXILIARY', 'COMPANY_WAREHOUSE', 'OTHER', 'GENERAL', 'AUXILIARY_SETTLEMENT', 'WAREHOUSE')
      ${getCompanyCondition("s", companyId)}
    ORDER BY CASE COALESCE(s.supplier_type, 'OTHER')
        WHEN 'COMPANY_WAREHOUSE' THEN 0
        WHEN 'WAREHOUSE' THEN 0
        WHEN 'AUXILIARY' THEN 1
        WHEN 'AUXILIARY_SETTLEMENT' THEN 1
        ELSE 2
      END,
      s.name ASC
  `).all(...(companyId ? [companyId] : [])) as any[];

  const summary = {
    totalCount: orders.filter((order) => order.status !== "CANCELLED").length,
    activeCount: orders.filter((order) => !["RECEIVED", "CANCELLED"].includes(order.status)).length,
    pendingCount: orders.filter((order) => order.status === "PENDING").length,
    partialCount: orders.filter((order) => order.status === "PARTIAL").length,
    receivedCount: orders.filter((order) => order.status === "RECEIVED").length,
    cancelledCount: orders.filter((order) => order.status === "CANCELLED").length,
    totalAmount: orders.filter((order) => order.status !== "CANCELLED").reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
  };

  const orderTemplates = getAuxiliaryOrderTemplates(db, companyId);

  return NextResponse.json({ orders, orderItems, projects, materials, suppliers, orderTemplates, summary });
}

export async function POST(req: NextRequest) {
  const requestUser = getRequestUser(req);
  if (!requestUser) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(requestUser)) return NextResponse.json({ message: "没有辅材订单管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureMaterialSystemSchema(db);
    const body = await req.json();
    const action = asText(body.action);

    if (action === "add_auxiliary_order") {
      const projectId = asText(body.project_id);
      if (!projectId) return NextResponse.json({ message: "请选择下单工地" }, { status: 400 });
      const project = db.prepare(`
        SELECT p.id, p.company_id, c.service_store,
          branch.name as branch_name,
          COALESCE(branch.is_active, 1) as branch_is_active,
          creatorOrg.name as creator_org_name
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id AND c.deleted_at IS NULL
        LEFT JOIN org_units branch ON c.service_store = branch.name AND branch.deleted_at IS NULL
        LEFT JOIN users creator ON c.created_by_id = creator.id AND creator.deleted_at IS NULL
        LEFT JOIN org_units creatorOrg ON creator.org_unit_id = creatorOrg.id AND creatorOrg.deleted_at IS NULL
        WHERE p.id = ? AND p.company_id = ? AND p.deleted_at IS NULL
        LIMIT 1
      `).get(projectId, requestUser.companyId) as any;
      if (!project) return NextResponse.json({ message: "未找到工地" }, { status: 404 });
      if (String(project.service_store || "").trim() && project.branch_name && Number(project.branch_is_active ?? 1) !== 1) {
        return NextResponse.json({ message: "客户所属服务门店已停用，不能新增材料订单" }, { status: 400 });
      }

      const orderType = normalizeEnum(body.order_type, orderTypes, "AUXILIARY_WAREHOUSE");
      const expectedSupplyMode = orderType === "AUXILIARY_WAREHOUSE" ? "WAREHOUSE" : "MONTHLY_SETTLEMENT";
      let supplierId = asNullableText(body.supplier_id);
      if (orderType === "AUXILIARY_WAREHOUSE" && !supplierId) {
        return NextResponse.json({ message: "请选择下单仓库" }, { status: 400 });
      }
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const materialQuery = db.prepare(`
        SELECT id, company_id, name, supplier_id, material_type, supply_mode, unit_price, cost_price, stock, is_active
        FROM materials
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `);
      const items = rawItems.map((item: any, index: number) => {
        const materialId = asText(item?.material_id);
        if (!materialId) return null;
        const material = materialQuery.get(materialId, requestUser.companyId) as any;
        if (!material || Number(material.is_active ?? 1) !== 1) {
          throw new Error(`第${index + 1}行材料不存在或已下架`);
        }
        if (material.company_id !== project.company_id) {
          throw new Error(`第${index + 1}行材料不属于当前公司`);
        }
        if (String(material.material_type || "AUXILIARY") === "MAIN") {
          throw new Error(`第${index + 1}行不是辅材，不能加入辅材订单`);
        }
        if (String(material.supply_mode || "WAREHOUSE") !== expectedSupplyMode) {
          throw new Error(orderType === "AUXILIARY_WAREHOUSE"
            ? `第${index + 1}行不是公司仓库辅材`
            : `第${index + 1}行不是线下月结辅材`);
        }
        if (orderType === "AUXILIARY_MONTHLY" && !supplierId && material.supplier_id) {
          supplierId = material.supplier_id;
        }
        if (orderType === "AUXILIARY_MONTHLY" && supplierId && material.supplier_id && material.supplier_id !== supplierId) {
          throw new Error(`第${index + 1}行材料所属供应商与订单供应商不一致`);
        }
        const quantity = asNumber(item?.quantity);
        const unitPrice = item?.unit_price === "" || item?.unit_price == null
          ? asNumber(material.unit_price ?? material.cost_price)
          : asNumber(item?.unit_price);
        const receivedQty = orderType === "AUXILIARY_WAREHOUSE"
          ? quantity
          : Math.min(quantity, asNumber(item?.received_qty));
        return {
          materialId,
          quantity,
          unitPrice,
          receivedQty,
          remark: asNullableText(item?.remark),
        };
      }).filter(Boolean) as { materialId: string; quantity: number; unitPrice: number; receivedQty: number; remark: string | null }[];

      if (items.length === 0 || items.every((item) => item.quantity <= 0)) {
        return NextResponse.json({ message: "请至少选择一个材料并填写下单数量" }, { status: 400 });
      }
      if (items.some((item) => item.quantity <= 0)) {
        return NextResponse.json({ message: "下单数量必须大于 0" }, { status: 400 });
      }
      if (orderType === "AUXILIARY_MONTHLY" && !supplierId) {
        return NextResponse.json({ message: "月结辅材订单请选择供应商" }, { status: 400 });
      }
      if (supplierId) {
        const supplier = db.prepare(`
          SELECT id, company_id, name, supplier_type, cooperation_status, is_active
          FROM suppliers
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
          LIMIT 1
        `).get(supplierId, requestUser.companyId) as any;
        if (!supplier || supplier.company_id !== project.company_id) {
          return NextResponse.json({ message: "供应商不存在或不属于当前公司" }, { status: 400 });
        }
        if (Number(supplier.is_active ?? 1) !== 1 || supplier.cooperation_status !== "ACTIVE") {
          return NextResponse.json({ message: "该供应商不是合作中状态，不能下单" }, { status: 400 });
        }
        if (orderType === "AUXILIARY_WAREHOUSE") {
          const warehouseMaterialCount = (db.prepare(`
            SELECT COUNT(*) as count
            FROM materials
            WHERE supplier_id = ?
              AND company_id = ?
              AND deleted_at IS NULL
              AND is_active = 1
              AND COALESCE(material_type, 'AUXILIARY') <> 'MAIN'
              AND COALESCE(supply_mode, 'WAREHOUSE') = 'WAREHOUSE'
          `).get(supplierId, requestUser.companyId) as any)?.count || 0;
          const looksLikeWarehouse = ["COMPANY_WAREHOUSE", "WAREHOUSE"].includes(String(supplier.supplier_type || "")) || /仓|仓库/.test(String(supplier.name || ""));
          if (!looksLikeWarehouse && Number(warehouseMaterialCount) <= 0) {
            return NextResponse.json({ message: "请选择仓库或已维护仓库材料的供应商" }, { status: 400 });
          }
        }
      }

      const status = normalizeOrderStatus(body.status);
      const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const paidAmount = Math.min(totalAmount, asNumber(body.paid_amount));
      const settlementStatus = normalizeEnum(
        body.settlement_status,
        settlementStatuses,
        orderType === "AUXILIARY_WAREHOUSE" ? "SETTLED" : paidAmount >= totalAmount && totalAmount > 0 ? "SETTLED" : "UNSETTLED",
      );
      const orderDate = asText(body.order_date) || new Date().toISOString().slice(0, 10);
      const deliveryDate = asNullableText(body.delivery_date);
      const settlementMonth = asText(body.settlement_month) || orderDate.slice(0, 7);
      const authorId = requestUser.userId;

	      const orderId = makeId("MO");
	      const orderNo = makeMaterialOrderNo(db, project.service_store || project.branch_name || project.creator_org_name);
      const receivedAt = status === "RECEIVED" ? new Date().toISOString() : null;
      const warehouseStatus = orderType === "AUXILIARY_WAREHOUSE" && status !== "RECEIVED" ? "WAITING" : "DONE";
      const requestUserName = requestUser?.userId
        ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(requestUser.userId) as any)?.name || null
        : null;
      try {
        db.prepare("BEGIN").run();
        db.prepare(`
          INSERT INTO material_orders (
            id, company_id, project_id, supplier_id, order_no, status, total_amount, paid_amount,
            order_date, delivery_date, notes, created_by_id, order_type, warehouse_status, settlement_status,
            settlement_month, handler_name, received_at, stock_deducted, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          orderId,
          project.company_id,
          projectId,
          supplierId,
          orderNo,
          status,
          totalAmount,
          paidAmount,
          orderDate,
          deliveryDate,
          asNullableText(body.notes),
          authorId,
          orderType,
          warehouseStatus,
          settlementStatus,
          settlementMonth,
          asNullableText(body.handler_name),
          receivedAt,
          0,
        );
        const insertItem = db.prepare(`
          INSERT INTO material_order_items (
            id, order_id, material_id, quantity, unit_price, total_price, received_qty, remark, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        items.forEach((item, index) => {
          insertItem.run(
            makeId(`MOI${index}`),
            orderId,
            item.materialId,
            item.quantity,
            item.unitPrice,
            item.quantity * item.unitPrice,
            Math.min(item.quantity, item.receivedQty),
            item.remark,
          );
        });
        if (orderType === "AUXILIARY_WAREHOUSE" && status === "RECEIVED") {
          deductMaterialStock(db, items, {
            sourceType: "material_order",
            sourceId: orderId,
            sourceNo: orderNo,
            operatorId: requestUser?.userId || authorId,
            operatorName: requestUserName,
            reason: "辅材订单确认出库",
          });
          db.prepare("UPDATE material_order_items SET stock_deducted_qty = quantity WHERE order_id = ?").run(orderId);
          db.prepare("UPDATE material_orders SET stock_deducted = 1 WHERE id = ?").run(orderId);
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      return NextResponse.json({ success: true, id: orderId, order_no: orderNo }, { status: 201 });
    }

    if (action === "update_auxiliary_order") {
      const orderId = asText(body.id);
      if (!orderId) return NextResponse.json({ message: "缺少订单" }, { status: 400 });
      const existing = db.prepare(`
        SELECT *
        FROM material_orders
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')
        LIMIT 1
      `).get(orderId, requestUser.companyId) as any;
      if (!existing) return NextResponse.json({ message: "未找到辅材订单" }, { status: 404 });
      const status = body.status === undefined ? normalizeOrderStatus(existing.status) : normalizeOrderStatus(body.status);
      if (existing.order_type === "AUXILIARY_WAREHOUSE" && status === "RECEIVED" && existing.status !== "RECEIVED") {
        return NextResponse.json({ message: "仓库辅材订单请点击「确认出库」，不能直接改为已出库" }, { status: 400 });
      }
      const settlementStatus = body.settlement_status === undefined
        ? existing.settlement_status
        : normalizeEnum(body.settlement_status, settlementStatuses, existing.settlement_status || "UNSETTLED");
      const paidAmount = body.paid_amount === undefined
        ? Number(existing.paid_amount || 0)
        : Math.min(Number(existing.total_amount || 0), asNumber(body.paid_amount));
      const deliveryDate = body.delivery_date === undefined ? existing.delivery_date : asNullableText(body.delivery_date);
      const notes = body.notes === undefined ? existing.notes : asNullableText(body.notes);
      const shouldRestoreStock = existing.order_type === "AUXILIARY_WAREHOUSE"
        && Number(existing.stock_deducted || 0) === 1
        && existing.status !== "CANCELLED"
        && status === "CANCELLED";
      const shouldDeductStock = existing.order_type === "AUXILIARY_WAREHOUSE"
        && Number(existing.stock_deducted || 0) !== 1
        && existing.status === "CANCELLED"
        && status === "RECEIVED";
      try {
        db.prepare("BEGIN").run();
        const stockItems = shouldRestoreStock
          ? getOrderDeductedStockItems(db, orderId)
          : shouldDeductStock
            ? getOrderStockItems(db, orderId)
            : [];
        if (shouldDeductStock) assertEnoughMaterialStock(db, stockItems);
        db.prepare(`
          UPDATE material_orders
          SET status = ?,
            paid_amount = ?,
            settlement_status = ?,
            delivery_date = ?,
            notes = ?,
            received_at = CASE WHEN ? = 'RECEIVED' THEN COALESCE(received_at, datetime('now')) ELSE received_at END,
            warehouse_status = CASE WHEN ? = 'RECEIVED' THEN 'DONE' ELSE warehouse_status END,
            stock_deducted = CASE
              WHEN ? THEN 0
              WHEN ? THEN 1
              ELSE stock_deducted
            END,
            updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(status, paidAmount, settlementStatus, deliveryDate, notes, status, status, shouldRestoreStock ? 1 : 0, shouldDeductStock ? 1 : 0, orderId, requestUser.companyId);
	        const requestUserName = requestUser?.userId
	          ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(requestUser.userId) as any)?.name || null
	          : null;
        if (shouldRestoreStock) restoreMaterialStock(db, stockItems, {
	          sourceType: "material_order_cancel",
	          sourceId: orderId,
	          sourceNo: existing.order_no,
	          operatorId: requestUser?.userId || null,
	          operatorName: requestUserName,
	          reason: "订单取消恢复库存",
	        });
	        if (shouldDeductStock) deductMaterialStock(db, stockItems, {
	          sourceType: "material_order",
	          sourceId: orderId,
	          sourceNo: existing.order_no,
	          operatorId: requestUser?.userId || null,
	          operatorName: requestUserName,
	          reason: "辅材订单出库",
	        });
        if (shouldRestoreStock) {
          db.prepare("UPDATE material_order_items SET stock_deducted_qty = 0 WHERE order_id = ?").run(orderId);
        }
        if (shouldDeductStock) {
          db.prepare("UPDATE material_order_items SET stock_deducted_qty = quantity WHERE order_id = ?").run(orderId);
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action === "confirm_auxiliary_outbound") {
      const orderId = asText(body.id);
      if (!orderId) return NextResponse.json({ message: "缺少订单" }, { status: 400 });
      const existing = db.prepare(`
        SELECT *
        FROM material_orders
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND order_type = 'AUXILIARY_WAREHOUSE'
        LIMIT 1
      `).get(orderId, requestUser.companyId) as any;
      if (!existing) return NextResponse.json({ message: "未找到仓库辅材订单" }, { status: 404 });
      if (existing.status === "CANCELLED") return NextResponse.json({ message: "已取消订单不能确认出库" }, { status: 400 });
      const pendingItems = getOrderPendingStockItems(db, orderId);
      if (pendingItems.length === 0 || pendingItems.every((item) => Number(item.quantity || 0) <= 0)) {
        return NextResponse.json({ message: "请先填写本次出库数量" }, { status: 400 });
      }
      const requestUserName = requestUser?.userId
        ? (db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(requestUser.userId) as any)?.name || null
        : null;
      try {
        db.prepare("BEGIN").run();
        assertEnoughMaterialStock(db, pendingItems);
        deductMaterialStock(db, pendingItems, {
          sourceType: "material_order",
          sourceId: orderId,
          sourceNo: existing.order_no,
          operatorId: requestUser?.userId || null,
          operatorName: requestUserName,
          reason: "辅材订单确认出库",
        });
        markOrderStockDeducted(db, orderId);
        const orderSummary = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) as total_quantity,
            COALESCE(SUM(received_qty), 0) as received_quantity,
            COALESCE(SUM(stock_deducted_qty), 0) as deducted_quantity
          FROM material_order_items
          WHERE order_id = ?
        `).get(orderId) as any;
        const totalQuantity = Number(orderSummary?.total_quantity || 0);
        const deductedQuantity = Number(orderSummary?.deducted_quantity || 0);
        const nextStatus = totalQuantity > 0 && deductedQuantity >= totalQuantity ? "RECEIVED" : "PARTIAL";
        db.prepare(`
          UPDATE material_orders
          SET status = ?,
            warehouse_status = CASE WHEN ? = 'RECEIVED' THEN 'DONE' ELSE 'WAITING' END,
            received_at = COALESCE(received_at, datetime('now')),
            stock_deducted = CASE WHEN ? = 'RECEIVED' THEN 1 ELSE stock_deducted END,
            updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(nextStatus, nextStatus, nextStatus, orderId, requestUser.companyId);
        db.prepare("COMMIT").run();
        return NextResponse.json({ success: true, status: nextStatus });
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
    }

    if (action === "record_auxiliary_print") {
      const orderId = asText(body.id);
      if (!orderId) return NextResponse.json({ message: "缺少订单" }, { status: 400 });
      const existing = db.prepare(`
        SELECT id, COALESCE(print_count, 0) as print_count
        FROM material_orders
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')
        LIMIT 1
      `).get(orderId, requestUser.companyId) as any;
      if (!existing) return NextResponse.json({ message: "未找到辅材订单" }, { status: 404 });
      const nextPrintCount = Number(existing.print_count || 0) + 1;
      db.prepare(`
        UPDATE material_orders
        SET print_count = ?,
          last_printed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      `).run(nextPrintCount, orderId, requestUser.companyId);
      return NextResponse.json({ success: true, print_count: nextPrintCount });
    }

    if (action === "update_auxiliary_received") {
      const itemId = asText(body.item_id);
      if (!itemId) return NextResponse.json({ message: "缺少材料明细" }, { status: 400 });
      const item = db.prepare(`
        SELECT item.id, item.quantity, item.order_id, COALESCE(item.stock_deducted_qty, 0) as stock_deducted_qty,
          mo.order_type, mo.status as order_status
        FROM material_order_items item
        INNER JOIN material_orders mo ON item.order_id = mo.id
        WHERE item.id = ? AND mo.deleted_at IS NULL
          AND mo.company_id = ?
          AND mo.order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')
        LIMIT 1
      `).get(itemId, requestUser.companyId) as any;
      if (!item) return NextResponse.json({ message: "未找到材料明细" }, { status: 404 });
      const currentDeductedQty = Number(item.stock_deducted_qty || 0);
      const nextReceivedInput = body.outbound_qty === undefined
        ? asNumber(body.received_qty)
        : currentDeductedQty + asNumber(body.outbound_qty);
      const receivedQty = Math.max(
        currentDeductedQty,
        Math.min(Number(item.quantity || 0), nextReceivedInput),
      );
      db.prepare("UPDATE material_order_items SET received_qty = ? WHERE id = ?").run(receivedQty, itemId);
      const orderSummary = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) as total_quantity,
          COALESCE(SUM(received_qty), 0) as received_quantity,
          COALESCE(SUM(stock_deducted_qty), 0) as deducted_quantity
        FROM material_order_items
        WHERE order_id = ?
      `).get(item.order_id) as any;
      const totalQuantity = Number(orderSummary?.total_quantity || 0);
      const receivedQuantity = Number(orderSummary?.received_quantity || 0);
      const deductedQuantity = Number(orderSummary?.deducted_quantity || 0);
      const nextStatus = item.order_type === "AUXILIARY_WAREHOUSE"
        ? totalQuantity > 0 && deductedQuantity >= totalQuantity
          ? "RECEIVED"
          : deductedQuantity > 0
            ? "PARTIAL"
            : "PENDING"
        : totalQuantity > 0 && receivedQuantity >= totalQuantity
          ? "RECEIVED"
          : receivedQuantity > 0
            ? "PARTIAL"
            : "PENDING";
      db.prepare(`
        UPDATE material_orders
        SET status = ?,
          warehouse_status = CASE WHEN ? = 'RECEIVED' THEN 'DONE' ELSE warehouse_status END,
          received_at = CASE WHEN ? = 'RECEIVED' THEN COALESCE(received_at, datetime('now')) ELSE received_at END,
          updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(nextStatus, nextStatus, nextStatus, item.order_id, requestUser.companyId);
      return NextResponse.json({ success: true, status: nextStatus });
    }

    return NextResponse.json({ message: "未知操作" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "辅材订单操作失败" }, { status: 500 });
  }
}
