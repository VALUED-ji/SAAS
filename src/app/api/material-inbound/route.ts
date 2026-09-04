import { NextRequest, NextResponse } from "next/server";
import { ensureMaterialSystemSchema, getDb } from "@/lib/db";
import { addMaterialStock, deductMaterialStock } from "@/lib/material-inventory";
import { getChinaDateNumber } from "@/lib/materialOrderNo";
import { canManageMaterials, getAuthContext } from "@/lib/security/authorization";
const inboundStatuses = ["DRAFT", "CONFIRMED", "CANCELLED"] as const;
const inboundSourceTypes = ["PURCHASE", "RETURN", "TRANSFER", "OTHER"] as const;

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

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function getRequestUser(req: NextRequest) {
  return getAuthContext(req);
}

function getUserName(db: ReturnType<typeof getDb>, userId?: string | null) {
  if (!userId) return null;
  const user = db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(userId) as any;
  return user?.name || null;
}

function getCompanyCondition(alias: string, companyId: string) {
  return companyId ? ` AND ${alias}.company_id = ?` : "";
}

function makeInboundNo(db: ReturnType<typeof getDb>) {
  const prefix = `RK${getChinaDateNumber()}`;
  const latest = db.prepare(`
    SELECT inbound_no
    FROM material_inbound_orders
    WHERE inbound_no LIKE ?
    ORDER BY inbound_no DESC
    LIMIT 1
  `).get(`${prefix}%`) as any;
  let sequence = Number(String(latest?.inbound_no || "").slice(prefix.length)) + 1;
  if (!Number.isFinite(sequence) || sequence <= 0) sequence = 1;
  let inboundNo = `${prefix}${String(sequence).padStart(4, "0")}`;
  while (db.prepare("SELECT id FROM material_inbound_orders WHERE inbound_no = ? LIMIT 1").get(inboundNo)) {
    sequence += 1;
    inboundNo = `${prefix}${String(sequence).padStart(4, "0")}`;
  }
  return inboundNo;
}

function getInboundItems(db: ReturnType<typeof getDb>, inboundId: string) {
  return db.prepare(`
    SELECT material_id as materialId, quantity
    FROM material_inbound_order_items
    WHERE inbound_id = ?
  `).all(inboundId) as { materialId: string; quantity: number }[];
}

function validateSupplier(db: ReturnType<typeof getDb>, supplierId: string | null, companyId: string, label: string) {
  if (!supplierId) return null;
  const supplier = db.prepare(`
    SELECT id, company_id, name, supplier_type, cooperation_status, is_active
    FROM suppliers
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(supplierId) as any;
  if (!supplier || supplier.company_id !== companyId) {
    throw new Error(`${label}不存在或不属于当前公司`);
  }
  if (Number(supplier.is_active ?? 1) !== 1 || supplier.cooperation_status !== "ACTIVE") {
    throw new Error(`${label}「${supplier.name || "未命名"}」不是合作中状态，不能入库`);
  }
  return supplier;
}

export async function GET(req: NextRequest) {
  const requestUser = getRequestUser(req);
  if (!requestUser) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(requestUser)) return NextResponse.json({ message: "没有材料入库查看权限" }, { status: 403 });
  const db = getDb();
  ensureMaterialSystemSchema(db);
  const companyId = requestUser.companyId;

  const orders = db.prepare(`
    SELECT mio.*,
      source_supplier.name as supplier_name,
      source_supplier.contact as supplier_contact,
      source_supplier.phone as supplier_phone,
      warehouse.name as warehouse_name,
      creator.name as created_by_name,
      confirmer.name as confirmed_by_name,
      (SELECT COUNT(*) FROM material_inbound_order_items item WHERE item.inbound_id = mio.id) as item_count,
      (SELECT COALESCE(SUM(item.quantity), 0) FROM material_inbound_order_items item WHERE item.inbound_id = mio.id) as total_quantity
    FROM material_inbound_orders mio
    LEFT JOIN suppliers source_supplier ON mio.supplier_id = source_supplier.id
    LEFT JOIN suppliers warehouse ON mio.warehouse_id = warehouse.id
    LEFT JOIN users creator ON mio.created_by_id = creator.id
    LEFT JOIN users confirmer ON mio.confirmed_by_id = confirmer.id
    WHERE mio.deleted_at IS NULL
      ${getCompanyCondition("mio", companyId)}
    ORDER BY CASE mio.status WHEN 'DRAFT' THEN 0 WHEN 'CONFIRMED' THEN 1 ELSE 2 END,
      datetime(COALESCE(mio.inbound_date, mio.created_at, '1970-01-01')) DESC,
      datetime(COALESCE(mio.created_at, '1970-01-01')) DESC,
      mio.id DESC
    LIMIT 500
  `).all(...(companyId ? [companyId] : [])) as any[];

  const items = db.prepare(`
    SELECT item.*,
      m.code as material_code, m.name as material_name, m.brand as material_brand,
      m.product_name as material_product_name, m.material_model as material_model,
      m.color as material_color, m.spec as material_spec, m.unit as material_unit,
      m.image as material_image, m.images as material_images, m.stock as material_stock,
      m.min_stock as material_min_stock, m.cost_price as material_cost_price, m.unit_price as material_unit_price,
      CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
      ms.name as material_supplier_name
    FROM material_inbound_order_items item
    INNER JOIN material_inbound_orders mio ON item.inbound_id = mio.id
    LEFT JOIN materials m ON item.material_id = m.id
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    LEFT JOIN suppliers ms ON m.supplier_id = ms.id
    WHERE mio.deleted_at IS NULL
      ${getCompanyCondition("mio", companyId)}
    ORDER BY datetime(COALESCE(mio.inbound_date, mio.created_at, '1970-01-01')) DESC,
      item.created_at ASC
    LIMIT 3000
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
      ${getCompanyCondition("m", companyId)}
    ORDER BY COALESCE(parent_mc.sort_order, mc.sort_order, 999) ASC,
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
      ${getCompanyCondition("s", companyId)}
    ORDER BY CASE COALESCE(s.supplier_type, 'OTHER')
        WHEN 'COMPANY_WAREHOUSE' THEN 0
        WHEN 'WAREHOUSE' THEN 0
        WHEN 'AUXILIARY' THEN 1
        WHEN 'MAIN_MATERIAL' THEN 2
        WHEN 'CUSTOM' THEN 3
        WHEN 'SOFT_DECOR' THEN 4
        ELSE 5
      END,
      s.name ASC
  `).all(...(companyId ? [companyId] : [])) as any[];

  const summary = {
    totalCount: orders.length,
    draftCount: orders.filter((order) => order.status === "DRAFT").length,
    confirmedCount: orders.filter((order) => order.status === "CONFIRMED").length,
    cancelledCount: orders.filter((order) => order.status === "CANCELLED").length,
    totalAmount: orders.filter((order) => order.status === "CONFIRMED").reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
  };

  return NextResponse.json({ orders, items, materials, suppliers, summary });
}

export async function POST(req: NextRequest) {
  const requestUser = getRequestUser(req);
  if (!requestUser) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(requestUser)) return NextResponse.json({ message: "没有材料入库管理权限" }, { status: 403 });
  try {
    const db = getDb();
    ensureMaterialSystemSchema(db);
    const companyId = requestUser.companyId;
    if (!companyId) return NextResponse.json({ message: "缺少公司信息" }, { status: 400 });
    const body = await req.json();
    const action = asText(body.action);
    const operatorId = requestUser.userId;
    const operatorName = getUserName(db, operatorId);

    if (action === "create_inbound_order") {
      const supplierId = asNullableText(body.supplier_id);
      if (!supplierId) return NextResponse.json({ message: "请选择采购来源/供应商" }, { status: 400 });
      const warehouseId = asNullableText(body.warehouse_id);
      const status = normalizeEnum(body.status, inboundStatuses, "DRAFT");
      if (status === "CANCELLED") return NextResponse.json({ message: "新建入库单不能直接作废" }, { status: 400 });
      const sourceType = normalizeEnum(body.source_type, inboundSourceTypes, "PURCHASE");
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const materialQuery = db.prepare(`
        SELECT id, company_id, name, unit, cost_price, unit_price, is_active
        FROM materials
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `);
      const items = rawItems.map((item: any, index: number) => {
        const materialId = asText(item?.material_id);
        if (!materialId) return null;
        const material = materialQuery.get(materialId, companyId) as any;
        if (!material || Number(material.is_active ?? 1) !== 1) {
          throw new Error(`第${index + 1}行材料不存在或已下架`);
        }
        if (material.company_id !== companyId) {
          throw new Error(`第${index + 1}行材料不属于当前公司`);
        }
        const quantity = asNumber(item?.quantity);
        const unitPrice = item?.unit_price === "" || item?.unit_price == null
          ? asNumber(material.cost_price ?? material.unit_price)
          : asNumber(item?.unit_price);
        return {
          materialId,
          quantity,
          unitPrice,
          remark: asNullableText(item?.remark),
        };
      }).filter(Boolean) as { materialId: string; quantity: number; unitPrice: number; remark: string | null }[];
      if (items.length === 0 || items.every((item) => item.quantity <= 0)) {
        return NextResponse.json({ message: "请至少选择一个材料并填写入库数量" }, { status: 400 });
      }
      if (items.some((item) => item.quantity <= 0)) {
        return NextResponse.json({ message: "入库数量必须大于 0" }, { status: 400 });
      }
      validateSupplier(db, supplierId, companyId, "采购来源");
      validateSupplier(db, warehouseId, companyId, "入库仓库");

      const inboundId = makeId("MIO");
      const inboundNo = makeInboundNo(db);
      const inboundDate = asText(body.inbound_date) || new Date().toISOString().slice(0, 10);
      const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const confirmNow = status === "CONFIRMED";

      try {
        db.prepare("BEGIN").run();
        db.prepare(`
          INSERT INTO material_inbound_orders (
            id, company_id, supplier_id, warehouse_id, inbound_no, status, source_type, total_amount,
            inbound_date, handler_name, notes, created_by_id, confirmed_by_id, confirmed_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          inboundId,
          companyId,
          supplierId,
          warehouseId,
          inboundNo,
          status,
          sourceType,
          totalAmount,
          inboundDate,
          asNullableText(body.handler_name),
          asNullableText(body.notes),
          operatorId || null,
          confirmNow ? operatorId || null : null,
          confirmNow ? new Date().toISOString() : null,
        );
        const insertItem = db.prepare(`
          INSERT INTO material_inbound_order_items (
            id, inbound_id, material_id, quantity, unit_price, total_price, remark, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        items.forEach((item, index) => {
          insertItem.run(
            makeId(`MII${index}`),
            inboundId,
            item.materialId,
            item.quantity,
            item.unitPrice,
            item.quantity * item.unitPrice,
            item.remark,
          );
        });
        if (confirmNow) {
          addMaterialStock(db, items, {
            sourceType: "material_inbound",
            sourceId: inboundId,
            sourceNo: inboundNo,
            operatorId: operatorId || null,
            operatorName,
            reason: sourceType === "RETURN" ? "退料入库" : sourceType === "TRANSFER" ? "调拨入库" : sourceType === "OTHER" ? "其他入库" : "采购入库",
            remark: asNullableText(body.notes),
          });
        }
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }

      return NextResponse.json({ success: true, id: inboundId, inbound_no: inboundNo }, { status: 201 });
    }

    if (action === "confirm_inbound_order") {
      const inboundId = asText(body.id);
      if (!inboundId) return NextResponse.json({ message: "缺少入库单" }, { status: 400 });
      const inbound = db.prepare(`
        SELECT *
        FROM material_inbound_orders
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(inboundId, companyId) as any;
      if (!inbound) return NextResponse.json({ message: "未找到入库单" }, { status: 404 });
      if (inbound.status === "CONFIRMED") return NextResponse.json({ message: "该入库单已确认，不能重复入库" }, { status: 400 });
      if (inbound.status === "CANCELLED") return NextResponse.json({ message: "已作废入库单不能确认入库" }, { status: 400 });
      const items = getInboundItems(db, inboundId);
      if (items.length === 0) return NextResponse.json({ message: "入库单没有材料明细" }, { status: 400 });
      try {
        db.prepare("BEGIN").run();
        addMaterialStock(db, items, {
          sourceType: "material_inbound",
          sourceId: inbound.id,
          sourceNo: inbound.inbound_no,
          operatorId: operatorId || null,
          operatorName,
          reason: inbound.source_type === "RETURN" ? "退料入库" : inbound.source_type === "TRANSFER" ? "调拨入库" : inbound.source_type === "OTHER" ? "其他入库" : "采购入库",
          remark: inbound.notes,
        });
        db.prepare(`
          UPDATE material_inbound_orders
          SET status = 'CONFIRMED',
            confirmed_by_id = ?,
            confirmed_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(operatorId || null, inboundId, companyId);
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    if (action === "cancel_inbound_order") {
      const inboundId = asText(body.id);
      if (!inboundId) return NextResponse.json({ message: "缺少入库单" }, { status: 400 });
      const inbound = db.prepare(`
        SELECT *
        FROM material_inbound_orders
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(inboundId, companyId) as any;
      if (!inbound) return NextResponse.json({ message: "未找到入库单" }, { status: 404 });
      if (inbound.status === "CANCELLED") return NextResponse.json({ message: "该入库单已作废" }, { status: 400 });
      const items = getInboundItems(db, inboundId);
      try {
        db.prepare("BEGIN").run();
        if (inbound.status === "CONFIRMED" && items.length > 0) {
          deductMaterialStock(db, items, {
            sourceType: "material_inbound_cancel",
            sourceId: inbound.id,
            sourceNo: inbound.inbound_no,
            operatorId: operatorId || null,
            operatorName,
            reason: "入库单作废冲回",
            remark: asNullableText(body.reason) || inbound.notes,
          });
        }
        db.prepare(`
          UPDATE material_inbound_orders
          SET status = 'CANCELLED',
            notes = COALESCE(?, notes),
            updated_at = datetime('now')
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        `).run(asNullableText(body.reason), inboundId, companyId);
        db.prepare("COMMIT").run();
      } catch (error) {
        db.prepare("ROLLBACK").run();
        throw error;
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "入库单操作失败" }, { status: 500 });
  }
}
