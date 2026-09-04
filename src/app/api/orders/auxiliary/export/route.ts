import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ensureMaterialSystemSchema, getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { canManageMaterials, getAuthContext } from "@/lib/security/authorization";

const orderStatuses = ["PENDING", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
const orderStatusLabels: Record<(typeof orderStatuses)[number], string> = {
  PENDING: "待处理",
  PARTIAL: "部分出库",
  RECEIVED: "已出库",
  CANCELLED: "已取消",
};

function asText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOrderStatus(value: unknown): (typeof orderStatuses)[number] {
  const input = asText(value).toUpperCase();
  if (input === "ORDERED" || input === "DRAFT") return "PENDING";
  return (orderStatuses as readonly string[]).includes(input) ? input as (typeof orderStatuses)[number] : "PENDING";
}

function safeFileName(value: string) {
  return encodeURIComponent(value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "").slice(0, 90) || "辅材订单.xlsx");
}

function todayText() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatQuantity(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function normalizeRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = value?.trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

function buildOrderRoomNumber(order: {
  customer_building_no?: string | null;
  customer_unit_no?: string | null;
  customer_room_no?: string | null;
  customer_no_room_number?: number | boolean | null;
}) {
  if (order.customer_no_room_number === true || order.customer_no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(order.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(order.customer_unit_no, ["单元"]);
  const room = normalizeRoomPart(order.customer_room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

function getSiteName(order: {
  customer_address?: string | null;
  customer_house_address?: string | null;
  customer_building_no?: string | null;
  customer_unit_no?: string | null;
  customer_room_no?: string | null;
  customer_no_room_number?: number | boolean | null;
  project_address?: string | null;
  project_name?: string | null;
}) {
  const community = String(order.customer_address || order.project_address || "").trim();
  const roomNumber = buildOrderRoomNumber(order);
  if (community && roomNumber && roomNumber !== "暂无房号") return `${community}${roomNumber}`;
  return String(community || order.customer_house_address || order.project_name || "未命名工地").trim();
}

function getMaterialSpec(item: {
  material_brand?: string | null;
  material_product_name?: string | null;
  material_model?: string | null;
  material_color?: string | null;
  material_spec?: string | null;
}) {
  return [
    item.material_brand,
    item.material_product_name,
    item.material_model,
    item.material_color,
    item.material_spec,
  ].filter(Boolean).join(" / ");
}

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: any[][], amountColumnIndexes: number[] = []) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRows([headers, ...rows]);
  sheet.columns.forEach((column, index) => {
    const maxLength = Math.max(
      ...[headers, ...rows].map((row) => String(row[index] ?? "").replace(/[^\x00-\xff]/g, "aa").length),
      8,
    );
    column.width = Math.min(Math.max(maxLength + 4, 10), index === headers.length - 1 ? 64 : 56);
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 26 : 24;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Microsoft YaHei", size: 11, bold: row.number === 1, color: { argb: "FF111827" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: false,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      if (row.number === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      }
      if (row.number > 1 && amountColumnIndexes.includes(colNumber)) {
        cell.numFmt = "0.00";
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      }
    });
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageMaterials(auth)) return NextResponse.json({ message: "没有辅材订单导出权限" }, { status: 403 });

  try {
    const db = getDb();
    ensureMaterialSystemSchema(db);
    const companyId = auth.companyId;
    const body = await req.json();
    const ids = Array.isArray(body?.order_ids)
      ? body.order_ids.map((id: unknown) => asText(id)).filter(Boolean)
      : [];
    const uniqueIds = Array.from(new Set(ids)).slice(0, 1000);
    if (uniqueIds.length === 0) {
      return NextResponse.json({ message: "请选择需要导出的订单" }, { status: 400 });
    }

    const placeholders = uniqueIds.map(() => "?").join(",");
    const orders = db.prepare(`
      SELECT mo.*, co.name as company_name,
        s.name as supplier_name, s.contact as supplier_contact, s.phone as supplier_phone,
        p.name as project_name, p.address as project_address,
        c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
        c.house_address as customer_house_address,
        c.building_no as customer_building_no, c.unit_no as customer_unit_no,
        c.room_no as customer_room_no, c.no_room_number as customer_no_room_number,
        c.service_store,
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
      LEFT JOIN users u ON mo.created_by_id = u.id
      WHERE mo.deleted_at IS NULL
        AND mo.order_type IN ('AUXILIARY_WAREHOUSE', 'AUXILIARY_MONTHLY')
        AND mo.id IN (${placeholders})
        AND mo.company_id = ?
      ORDER BY datetime(COALESCE(mo.order_date, mo.created_at, '1970-01-01')) DESC,
        datetime(COALESCE(mo.created_at, '1970-01-01')) DESC,
        mo.id DESC
    `).all(...uniqueIds, companyId) as any[];
    if (orders.length === 0) {
      return NextResponse.json({ message: "没有可导出的订单" }, { status: 404 });
    }

    const orderIdSet = new Set(orders.map((order) => order.id));
    const itemPlaceholders = orders.map(() => "?").join(",");
    const items = db.prepare(`
      SELECT item.*, mo.status as order_status,
        m.code as material_code, m.name as material_name, m.brand as material_brand,
        m.product_name as material_product_name, m.material_model as material_model,
        m.color as material_color, m.spec as material_spec, m.unit as material_unit,
        CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name
      FROM material_order_items item
      INNER JOIN material_orders mo ON item.order_id = mo.id
      LEFT JOIN materials m ON item.material_id = m.id
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
      WHERE mo.deleted_at IS NULL
        AND item.order_id IN (${itemPlaceholders})
        AND mo.company_id = ?
      ORDER BY item.created_at ASC, item.id ASC
    `).all(...orders.map((order) => order.id), companyId) as any[];
    const itemsByOrder = items.reduce<Record<string, any[]>>((result, item) => {
      if (!orderIdSet.has(item.order_id)) return result;
      if (!result[item.order_id]) result[item.order_id] = [];
      result[item.order_id].push(item);
      return result;
    }, {});

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "装修管家";
    workbook.created = new Date();

    const orderHeaders = ["序号", "状态", "订单编号", "房号", "客户姓名", "手机号", "下单人", "下单人电话", "下单时间", "服务门店", "下单仓库", "材料项", "下单数量", "已出库数量", "订单金额", "备注"];
    const orderRows = orders.map((order, index) => [
      index + 1,
      orderStatusLabels[normalizeOrderStatus(order.status)] || "待处理",
      order.order_no || "",
      getSiteName(order),
      order.customer_name || "",
      order.customer_phone || "",
      order.created_by_name || "",
      order.created_by_phone || "",
      formatDateTime(order.created_at || order.order_date),
      order.service_store || "",
      order.supplier_name || "",
      Number(order.item_count || 0),
      formatQuantity(order.total_quantity),
      formatQuantity(order.stock_deducted_quantity ?? order.received_quantity),
      Number(order.total_amount || 0),
      order.notes || "",
    ]);

    const detailHeaders = ["序号", "订单编号", "状态", "房号", "客户姓名", "下单仓库", "材料编码", "材料名称", "材料类别", "规格型号", "单位", "下单数量", "已出库数量", "剩余数量", "单价", "小计", "备注"];
    const detailRows = orders.flatMap((order, orderIndex) => {
      const orderItems = itemsByOrder[order.id] || [];
      return orderItems.map((item, itemIndex) => {
        const quantity = Number(item.quantity || 0);
        const outboundQty = Number(item.stock_deducted_qty ?? item.received_qty ?? 0);
        return [
          `${orderIndex + 1}.${itemIndex + 1}`,
          order.order_no || "",
          orderStatusLabels[normalizeOrderStatus(order.status)] || "待处理",
          getSiteName(order),
          order.customer_name || "",
          order.supplier_name || "",
          item.material_code || "",
          item.material_name || "",
          item.category_name || "",
          getMaterialSpec(item),
          item.material_unit || "",
          formatQuantity(quantity),
          formatQuantity(outboundQty),
          formatQuantity(Math.max(0, quantity - outboundQty)),
          Number(item.unit_price || 0),
          Number(item.total_price || quantity * Number(item.unit_price || 0)),
          item.remark || "",
        ];
      });
    });

    addSheet(workbook, "订单列表", orderHeaders, orderRows, [15]);
    addSheet(workbook, "订单明细", detailHeaders, detailRows, [15, 16]);

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = safeFileName(`辅材订单_${todayText()}.xlsx`);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "导出辅材订单失败" }, { status: 500 });
  }
}
