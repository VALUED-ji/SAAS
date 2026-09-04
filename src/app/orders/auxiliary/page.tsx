"use client";

import {
  normalizeOrderStatus,
  orderStatusLabels,
} from "./auxiliary-order-shared";
import {
  InfoLine,
  StatusBadge,
} from "./auxiliary-order-bits";



import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileDown,
  Loader2,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate as formatBeijingDate, formatDateTime as formatBeijingDateTime, parseAppDate } from "@/lib/utils";
import { SystemResourceTable } from "@/components/ui/SystemResourceTable";
import SystemStatusFilter from "@/components/ui/SystemStatusFilter";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import SystemDateInput from "@/components/ui/SystemDateInput";

type AuxiliaryOrder = {
  id: string;
  company_id: string;
  company_name?: string | null;
  project_id: string | null;
  supplier_id: string | null;
  order_no: string;
  status: string;
  order_type?: string | null;
  total_amount: number;
  paid_amount: number;
  order_date?: string | null;
  delivery_date?: string | null;
  settlement_status?: string | null;
  settlement_month?: string | null;
  handler_name?: string | null;
  notes?: string | null;
  supplier_name?: string | null;
  supplier_contact?: string | null;
  supplier_phone?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  project_area?: number | null;
  project_status?: string | null;
  site_stage?: string | null;
  project_start_date?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_house_address?: string | null;
  customer_building_no?: string | null;
  customer_unit_no?: string | null;
  customer_room_no?: string | null;
  customer_no_room_number?: number | boolean | null;
  service_store?: string | null;
  project_manager_name?: string | null;
  project_manager_phone?: string | null;
  created_by_name?: string | null;
  created_by_phone?: string | null;
  item_count?: number | null;
  total_quantity?: number | null;
  received_quantity?: number | null;
  stock_deducted_quantity?: number | null;
  received_at?: string | null;
  print_count?: number | null;
  last_printed_at?: string | null;
  created_at?: string | null;
};

type AuxiliaryOrderItem = {
  id: string;
  order_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  received_qty: number;
  stock_deducted_qty?: number | null;
  remark?: string | null;
  material_code?: string | null;
  material_name?: string | null;
  material_brand?: string | null;
  material_product_name?: string | null;
  material_model?: string | null;
  material_color?: string | null;
  material_spec?: string | null;
  material_unit?: string | null;
  material_image?: string | null;
  material_images?: string[] | string | null;
  material_type?: string | null;
  supply_mode?: string | null;
  category_name?: string | null;
  material_supplier_name?: string | null;
};

type ProjectOption = {
  id: string;
  name?: string | null;
  address?: string | null;
  area?: number | null;
  status?: string | null;
  site_stage?: string | null;
  current_phase?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_house_address?: string | null;
  customer_building_no?: string | null;
  customer_unit_no?: string | null;
  customer_room_no?: string | null;
  customer_no_room_number?: number | boolean | null;
  service_store?: string | null;
  store_org_unit_id?: string | null;
  branch_org_unit_id?: string | null;
  branch_name?: string | null;
  manager_name?: string | null;
};

type MaterialOption = {
  id: string;
  code?: string | null;
  name: string;
  brand?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  color?: string | null;
  spec?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  cost_price?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  material_type?: string | null;
  supply_mode?: string | null;
  category_name?: string | null;
  stock?: number | null;
  image?: string | null;
  images?: string[] | string | null;
};

type SupplierOption = {
  id: string;
  name: string;
  supplier_type?: string | null;
  contact?: string | null;
  phone?: string | null;
  owner_name?: string | null;
  settlement_cycle?: string | null;
  material_count?: number | null;
};

type AuxiliaryOrderResponse = {
  orders: AuxiliaryOrder[];
  orderItems: AuxiliaryOrderItem[];
  projects: ProjectOption[];
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  orderTemplates: OrderTemplateOption[];
  total?: number;
  page?: number;
  pageSize?: number;
  statusCounts?: Record<string, number>;
  storeOptions?: { value: string; label: string; count: number }[];
  summary?: {
    totalCount: number;
    activeCount: number;
    pendingCount: number;
    partialCount: number;
    receivedCount: number;
    cancelledCount: number;
    totalAmount: number;
  };
};

type OrderTemplateOption = {
  id: string;
  name: string;
  orgUnitId?: string | null;
  branchName?: string | null;
  warehouseSupplierId?: string | null;
  itemCount?: number | null;
  items: {
    id: string;
    materialId: string;
    defaultQuantity: number;
    remark: string;
  }[];
};

type OrderLineForm = {
  material_id: string;
  quantity: string;
  unit_price: string;
  received_qty: string;
  remark: string;
  source_template_id?: string;
};

type OrderForm = {
  project_id: string;
  order_type: "AUXILIARY_WAREHOUSE" | "AUXILIARY_MONTHLY";
  supplier_id: string;
  status: string;
  settlement_status: string;
  settlement_month: string;
  order_date: string;
  delivery_date: string;
  paid_amount: string;
  notes: string;
  template_id: string;
  items: OrderLineForm[];
};

type AuxiliaryOrderDraftRecord = {
  form: OrderForm;
  savedAt: string;
};

const AUXILIARY_ORDER_DRAFT_KEY = "zxgj_auxiliary_order_create_draft_v1";


const settlementStatusLabels: Record<string, string> = {
  UNSETTLED: "未结算",
  SETTLING: "结算中",
  SETTLED: "已结算",
};

const projectPrintStatusLabels: Record<string, string> = {
  LEAD: "线索",
  DESIGNED: "已设计",
  QUOTED: "已报价",
  SIGNED: "已签约",
  CONSTRUCTION: "在建工地",
  COMPLETED: "已完工",
  CLOSED: "已结案",
};

const sitePrintStageLabels: Record<string, string> = {
  PENDING_START: "待开工",
  START_CONFIRM: "开工确认",
  CONSTRUCTION: "在建工地",
  OWNER_SETTLEMENT: "业主结算",
  SITE_SETTLEMENT: "工地结算",
};

const statusOptions = Object.entries(orderStatusLabels);

function getMaterialOutboundPrice(material: Pick<MaterialOption, "unit_price" | "cost_price">) {
  return Number(material.unit_price ?? material.cost_price ?? 0);
}

function getPendingOutboundQuantity(item: Pick<AuxiliaryOrderItem, "quantity" | "received_qty" | "stock_deducted_qty">) {
  const quantity = Math.max(0, Number(item.quantity || 0));
  const deductedQty = Math.max(0, Number(item.stock_deducted_qty || 0));
  const remainingQty = Math.max(0, quantity - deductedQty);
  const receivedQty = Math.max(0, Number(item.received_qty || 0));
  if (remainingQty <= 0) return 0;
  const pendingBaseQty = receivedQty > 0 ? receivedQty : quantity;
  const pendingQty = Math.max(0, Math.min(quantity, pendingBaseQty) - deductedQty);
  return pendingQty > 0 ? pendingQty : remainingQty;
}

function getRemainingOutboundQuantity(item: Pick<AuxiliaryOrderItem, "quantity" | "stock_deducted_qty">) {
  return Math.max(0, Number(item.quantity || 0) - Number(item.stock_deducted_qty || 0));
}

function getClampedOutboundQuantity(item: Pick<AuxiliaryOrderItem, "quantity" | "stock_deducted_qty">, value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(getRemainingOutboundQuantity(item), number));
}

function getCurrentOutboundQuantity(
  item: AuxiliaryOrderItem,
  values: Record<string, string>,
) {
  const rawValue = values[item.id];
  if (rawValue === undefined) return getPendingOutboundQuantity(item);
  return getClampedOutboundQuantity(item, rawValue);
}

function getPrintOutboundQuantity(
  item: AuxiliaryOrderItem,
  values: Record<string, string>,
  dirtyValues: Record<string, boolean>,
) {
  if (dirtyValues[item.id]) return getCurrentOutboundQuantity(item, values);
  const pendingQty = getPendingOutboundQuantity(item);
  if (pendingQty > 0) return pendingQty;
  const deductedQty = Math.max(0, Number(item.stock_deducted_qty || 0));
  if (deductedQty > 0) return Math.min(Number(item.quantity || 0), deductedQty);
  return Number(item.quantity || 0);
}

function formatAuxiliaryPrintAmount(value?: number | null) {
  const text = formatAmount(value);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}

function buildAuxiliaryOrderPrintPagesHtml(
  order: AuxiliaryOrder,
  items: AuxiliaryOrderItem[],
  printCount: number,
  resolvePrintQuantity: (item: AuxiliaryOrderItem) => number,
) {
  const firstPageRows = 26;
  const continuationRows = 28;
  const siteName = getSiteName(order);
  const companyName = order.company_name || "公司";
  const materialTotal = items.reduce((sum, item) => {
    const printQuantity = resolvePrintQuantity(item);
    return sum + printQuantity * Number(item.unit_price || 0);
  }, 0);
  const categoryList = Array.from(new Set(items.map((item) => String(item.category_name || "").trim()).filter(Boolean)));
  const categoryText = categoryList.length > 1 ? `${categoryList[0]}等` : categoryList[0] || "辅材";
  const projectStatusText = sitePrintStageLabels[String(order.site_stage || "")] || projectPrintStatusLabels[String(order.project_status || "")] || "-";
  const projectManager = order.project_manager_name || order.created_by_name || "-";
  const projectPhone = order.project_manager_phone || order.customer_phone || order.created_by_phone || "-";
  const applyApprover = order.handler_name || order.created_by_name || "-";
  const outboundUser = order.handler_name || order.supplier_contact || "-";
  const outboundTime = formatDateTime(order.received_at || "");
  const chunks: AuxiliaryOrderItem[][] = [];
  if (items.length === 0) {
    chunks.push([]);
  } else {
    chunks.push(items.slice(0, firstPageRows));
    for (let start = firstPageRows; start < items.length; start += continuationRows) {
      chunks.push(items.slice(start, start + continuationRows));
    }
  }
  const totalPages = chunks.length;
  const getStartIndex = (pageIndex: number) => pageIndex === 0 ? 0 : firstPageRows + (pageIndex - 1) * continuationRows;
  const renderItemRows = (pageItems: AuxiliaryOrderItem[], startIndex: number) => pageItems.map((item, index) => {
    const spec = getMaterialSpec(item);
    const printQuantity = resolvePrintQuantity(item);
    return `
      <tr>
        <td>${startIndex + index + 1}</td>
        <td class="material-name">${escapeHtml(item.material_name || "未知材料")}</td>
        <td>${escapeHtml(spec || "-")}</td>
        <td>${escapeHtml(item.material_unit || "-")}</td>
        <td>${formatQuantity(printQuantity)}</td>
        <td>${formatAuxiliaryPrintAmount(item.unit_price)}</td>
        <td>${formatAuxiliaryPrintAmount(printQuantity * Number(item.unit_price || 0))}</td>
      </tr>
    `;
  }).join("");

  return chunks.map((pageItems, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === totalPages - 1;
    const itemRows = renderItemRows(pageItems, getStartIndex(pageIndex));
    return `
      <div class="page ${isFirstPage ? "" : "page-continuation"}">
        ${isFirstPage ? `
          <div class="title-row">
            <h1>${escapeHtml(companyName)} 材料出库单</h1>
            <div class="print-count">第 ${printCount} 次打印</div>
          </div>

          <div class="top-info">
            <div class="top-item"><span class="top-label">出库单号：</span><span class="top-value">${escapeHtml(order.order_no)}</span></div>
            <div class="top-item"><span class="top-label">发货仓库：</span><span class="top-value">${escapeHtml(order.supplier_name || "-")}</span></div>
            <div class="top-item"><span class="top-label">房号：</span><span class="top-value">${escapeHtml(siteName)}</span></div>
            <div class="top-item"><span class="top-label">服务门店：</span><span class="top-value">${escapeHtml(order.service_store || "-")}</span></div>
            <div class="top-item"><span class="top-label">项目经理：</span><span class="top-value">${escapeHtml(projectManager)}</span></div>
            <div class="top-item"><span class="top-label">项目经理电话：</span><span class="top-value">${escapeHtml(projectPhone)}</span></div>
          </div>

          <table class="info-table">
            <colgroup>
              <col style="width: 18%" />
              <col style="width: 22%" />
              <col style="width: 10%" />
              <col style="width: 19%" />
              <col style="width: 15%" />
              <col style="width: 16%" />
            </colgroup>
            <tbody>
              <tr>
                <td class="info-label">财务编号☆</td>
                <td class="info-value">${escapeHtml(order.order_no)}</td>
                <td class="info-label">工地类型</td>
                <td class="info-value">基装工地</td>
                <td class="info-label">工地状态</td>
                <td class="info-value">${escapeHtml(projectStatusText)}</td>
              </tr>
              <tr>
                <td class="info-label">开工日期</td>
                <td class="info-value">${escapeHtml(formatDate(order.project_start_date))}</td>
                <td class="info-label">申领审批</td>
                <td class="info-value">${escapeHtml(applyApprover)}</td>
                <td class="info-label">材料类别</td>
                <td class="info-value">${escapeHtml(categoryText)}</td>
              </tr>
            </tbody>
          </table>
        ` : ""}

        <table class="material-table">
          <colgroup>
            <col style="width: 6%" />
            <col style="width: 34%" />
            <col style="width: 29%" />
            <col style="width: 8%" />
            <col style="width: 7%" />
            <col style="width: 8%" />
            <col style="width: 8%" />
          </colgroup>
          <thead>
            <tr>
              <th>序号</th>
              <th>材料名称</th>
              <th>规格</th>
              <th>单位</th>
              <th>数量</th>
              <th>单价</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || `<tr><td colspan="7">暂无材料明细</td></tr>`}
          </tbody>
        </table>

        ${isLastPage ? `
          <table class="summary-table">
            <colgroup>
              <col style="width: 100%" />
            </colgroup>
            <tbody>
              <tr>
                <td><span class="summary-label">费用小计：</span><span class="summary-value">${formatAuxiliaryPrintAmount(materialTotal)} 元</span></td>
              </tr>
            </tbody>
          </table>

          <div class="sign-row">
            <div class="sign-item"><span class="sign-label">下单时间：</span><span class="sign-value">${escapeHtml(formatDateTime(order.created_at || order.order_date))}</span></div>
            <div class="sign-item"><span class="sign-label">出库人：</span><span class="sign-value">${escapeHtml(outboundUser)}</span></div>
            <div class="sign-item"><span class="sign-label">出库时间：</span><span class="sign-value">${escapeHtml(outboundTime)}</span></div>
            <div class="sign-item"><span class="sign-label">签收人：</span></div>
          </div>
        ` : ""}
        <div class="page-number">第${pageIndex + 1}页/${totalPages}页</div>
      </div>
    `;
  });
}

function buildAuxiliaryOrderPrintDocumentHtml({
  title,
  pages,
}: {
  title: string;
  pages: string[];
}) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 landscape; margin: 7mm 10mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #000; font-family: "SimSun", "Songti SC", "Microsoft YaHei", Arial, sans-serif; font-size: 12px; background: #fff; }
          .page { position: relative; width: 100%; min-height: 188mm; padding-bottom: 6mm; }
          .page + .page { break-before: page; page-break-before: always; }
          .page-continuation { padding-top: 0; }
          .title-row { position: relative; margin: 0 0 5px; }
          h1 { margin: 0 0 5px; text-align: center; font-size: 20px; line-height: 1.15; font-weight: 700; letter-spacing: 0; }
          .print-count { position: absolute; right: 0; top: 2px; font-size: 12px; font-weight: 700; }
          .top-info { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 48px; row-gap: 1px; margin-bottom: 3px; }
          .top-item { display: grid; grid-template-columns: 70px minmax(0, 1fr); min-height: 18px; align-items: center; }
          .top-label { font-weight: 700; white-space: nowrap; }
          .top-value { color: #555; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          table { width: 100%; border-collapse: separate; table-layout: fixed; border-spacing: 0; border-top: 1.5px solid #000; border-left: 1.5px solid #000; }
          th, td {
            border-right: 1.5px solid #000 !important;
            border-bottom: 1.5px solid #000 !important;
            border-top: 0 !important;
            border-left: 0 !important;
            padding: 2px 4px;
            height: 20px;
            vertical-align: middle;
            line-height: 1.15;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #000;
            background-clip: padding-box;
          }
          th { background: #f4f4f4; font-weight: 700; }
          .info-table td { height: 22px; }
          .info-label { width: 92px; background: #f7f7f7; font-weight: 700; white-space: nowrap; }
          .info-value { color: #555; }
          .material-table th { height: 20px; }
          .material-table td { height: 22px; }
          .material-name { font-weight: 700; }
          .summary-table td { height: 23px; font-weight: 700; }
          .summary-label { text-align: left; }
          .summary-value { color: #555; font-weight: 400; }
          .sign-row { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr 1fr; column-gap: 34px; margin-top: 7px; align-items: center; }
          .sign-item { min-height: 20px; white-space: nowrap; }
          .sign-label { font-weight: 700; }
          .sign-value { color: #555; }
          .page-number {
            position: absolute;
            right: 0;
            bottom: 0;
            height: 5mm;
            text-align: right;
            font-size: 12px;
            line-height: 5mm;
            color: #000;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            table { border-top: 1.5px solid #000 !important; border-left: 1.5px solid #000 !important; }
            th, td {
              border-right: 1.5px solid #000 !important;
              border-bottom: 1.5px solid #000 !important;
              border-top: 0 !important;
              border-left: 0 !important;
              box-shadow: inset 0 0 0 0.25px #000;
            }
            tr { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        ${pages.join("\n")}
      </body>
    </html>
  `;
}

function todayText() {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date()).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function makeDefaultForm(): OrderForm {
  const today = todayText();
  return {
    project_id: "",
    order_type: "AUXILIARY_WAREHOUSE",
    supplier_id: "",
    status: "PENDING",
    settlement_status: "SETTLED",
    settlement_month: today.slice(0, 7),
    order_date: today,
    delivery_date: "",
    paid_amount: "",
    notes: "",
    template_id: "",
    items: [],
  };
}

function normalizeOrderDraftForm(value: unknown): OrderForm | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, any>;
  const fallback = makeDefaultForm();
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => ({
      material_id: String(item?.material_id || ""),
      quantity: String(item?.quantity ?? ""),
      unit_price: String(item?.unit_price ?? ""),
      received_qty: String(item?.received_qty ?? "0"),
      remark: String(item?.remark || ""),
      source_template_id: item?.source_template_id ? String(item.source_template_id) : undefined,
    })).filter((item) => item.material_id)
    : [];
  return {
    ...fallback,
    project_id: String(raw.project_id || ""),
    order_type: raw.order_type === "AUXILIARY_MONTHLY" ? "AUXILIARY_MONTHLY" : "AUXILIARY_WAREHOUSE",
    supplier_id: String(raw.supplier_id || ""),
    status: normalizeOrderStatus(String(raw.status || fallback.status)),
    settlement_status: String(raw.settlement_status || fallback.settlement_status),
    settlement_month: String(raw.settlement_month || fallback.settlement_month),
    order_date: String(raw.order_date || fallback.order_date),
    delivery_date: String(raw.delivery_date || ""),
    paid_amount: String(raw.paid_amount || ""),
    notes: String(raw.notes || ""),
    template_id: String(raw.template_id || ""),
    items,
  };
}

function hasOrderDraftContent(form: OrderForm) {
  return Boolean(
    form.project_id ||
    form.supplier_id ||
    form.template_id ||
    form.delivery_date ||
    form.paid_amount ||
    form.notes.trim() ||
    form.items.length > 0 ||
    form.status !== "PENDING"
  );
}

function readOrderDraftRecord(): AuxiliaryOrderDraftRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const text = window.localStorage.getItem(AUXILIARY_ORDER_DRAFT_KEY);
    if (!text) return null;
    const raw = JSON.parse(text);
    const form = normalizeOrderDraftForm(raw?.form);
    if (!form || !hasOrderDraftContent(form)) return null;
    return {
      form,
      savedAt: String(raw?.savedAt || ""),
    };
  } catch {
    return null;
  }
}

function writeOrderDraftRecord(form: OrderForm) {
  if (typeof window === "undefined" || !hasOrderDraftContent(form)) return null;
  const savedAt = new Date().toISOString();
  window.localStorage.setItem(AUXILIARY_ORDER_DRAFT_KEY, JSON.stringify({ form, savedAt }));
  return savedAt;
}

function clearOrderDraftRecord() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUXILIARY_ORDER_DRAFT_KEY);
}

function formatDraftSavedAt(value?: string | null) {
  const date = parseAppDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatTableAmount(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  const absAmount = Math.abs(amount);
  const trim = (nextValue: number) => nextValue.toFixed(2).replace(/\.?0+$/, "");
  if (absAmount >= 100000000) return `${trim(amount / 100000000)}亿`;
  if (absAmount >= 10000) return `${trim(amount / 10000)}万`;
  return formatAmount(amount);
}

function formatQuantity(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function getOrderUserNotes(notes?: string | null) {
  return String(notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const remarkMatch = line.match(/^备注[:：]\s*(.*)$/);
      return remarkMatch ? remarkMatch[1].trim() : line;
    })
    .filter((line) => line && !/^(收货人|电话|地址|供应方)[:：]/.test(line) && !/^移动端/.test(line))
    .join("\n");
}

function formatDate(value?: string | null) {
  return formatBeijingDate(value);
}

function formatDateTime(value?: string | null) {
  return formatBeijingDateTime(value);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "").slice(0, 80) || "辅材订单";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  address?: string | null;
  project_address?: string | null;
  name?: string | null;
  project_name?: string | null;
}) {
  const community = String(order.customer_address || order.address || order.project_address || "").trim();
  const roomNumber = buildOrderRoomNumber(order);
  if (community && roomNumber && roomNumber !== "暂无房号") return `${community}${roomNumber}`;
  return String(community || order.customer_house_address || order.name || order.project_name || "未命名工地").trim();
}

function getOrderReceiveAddress(order: { customer_house_address?: string | null }) {
  return String(order.customer_house_address || "").trim() || "-";
}

function getMaterialSpec(item: {
  material_brand?: string | null;
  brand?: string | null;
  material_product_name?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  material_color?: string | null;
  color?: string | null;
  material_spec?: string | null;
  spec?: string | null;
}) {
  return [
    item.material_brand || item.brand,
    item.material_product_name || item.product_name,
    item.material_model,
    item.material_color || item.color,
    item.material_spec || item.spec,
  ].filter(Boolean).join(" / ");
}

function getMaterialImage(item: AuxiliaryOrderItem | MaterialOption) {
  const primaryImage = (item as AuxiliaryOrderItem).material_image || (item as MaterialOption).image;
  if (primaryImage) return primaryImage;
  const images = (item as AuxiliaryOrderItem).material_images || (item as MaterialOption).images;
  if (Array.isArray(images)) return images[0] || "";
  if (typeof images === "string") {
    const text = images.trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return String(parsed[0] || "");
    } catch {
      return text.split(/[；;,]/).map((value) => value.trim()).filter(Boolean)[0] || "";
    }
  }
  return "";
}

function getOrderReceiveRate(order: AuxiliaryOrder) {
  const total = Number(order.total_quantity || 0);
  const outbound = Math.min(total, Number(order.stock_deducted_quantity ?? order.received_quantity ?? 0));
  if (total <= 0) return 0;
  return Math.round((outbound / total) * 100);
}

function normalizeNumberInput(value: string) {
  const text = value.replace(/[^\d.]/g, "");
  const [integer, ...decimals] = text.split(".");
  return decimals.length > 0 ? `${integer}.${decimals.join("")}` : integer;
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function buildAuxiliaryOrderListUrl({
  page,
  pageSize,
  status,
  store,
  search,
  exportAll = false,
}: {
  page: number;
  pageSize: number;
  status: string;
  store: string;
  search: string;
  exportAll?: boolean;
}) {
  const params = new URLSearchParams({
    mode: "list",
    page: String(page),
    pageSize: String(pageSize),
    status,
  });
  const append = (key: string, value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) params.set(key, trimmed);
  };
  append("store", store);
  append("search", search);
  if (exportAll) params.set("export", "1");
  return `/api/orders/auxiliary?${params.toString()}`;
}

export default function AuxiliaryOrdersPage() {
  const [data, setData] = useState<AuxiliaryOrderResponse>({
    orders: [],
    orderItems: [],
    projects: [],
    materials: [],
    suppliers: [],
    orderTemplates: [],
    total: 0,
    statusCounts: {},
    storeOptions: [],
  });
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [showCreate, setShowCreate] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("all");
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string; spec: string; x: number; y: number } | null>(null);
  const [form, setForm] = useState<OrderForm>(makeDefaultForm());
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedBatchOrderIds, setSelectedBatchOrderIds] = useState<string[]>([]);
  const [outboundInputs, setOutboundInputs] = useState<Record<string, string>>({});
  const [dirtyOutboundInputs, setDirtyOutboundInputs] = useState<Record<string, boolean>>({});
  const printRecordKeysRef = useRef<Set<string>>(new Set());
  const draftReadyRef = useRef(false);
  const suppressDraftRef = useRef(false);
  const debouncedSearch = useDebouncedValue(search, 300);
  const filterKey = useMemo(() => [statusFilter, storeFilter, debouncedSearch].join("|"), [debouncedSearch, statusFilter, storeFilter]);
  const lastFilterKey = useRef(filterKey);
  const effectivePage = lastFilterKey.current === filterKey ? page : 1;
  const listUrl = useMemo(() => buildAuxiliaryOrderListUrl({
    page: effectivePage,
    pageSize,
    status: statusFilter,
    store: storeFilter,
    search: debouncedSearch,
  }), [debouncedSearch, effectivePage, pageSize, statusFilter, storeFilter]);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<AuxiliaryOrderResponse>(listUrl);
      setData((current) => ({
        ...current,
        orders: result.orders || [],
        orderItems: result.orderItems || [],
        total: result.total || 0,
        page: result.page,
        pageSize: result.pageSize,
        statusCounts: result.statusCounts || {},
        storeOptions: result.storeOptions || [],
        summary: result.summary,
      }));
    } catch (error: any) {
      setMessage(error?.message || "辅材订单加载失败");
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  const loadWorkspaceData = useCallback(async () => {
    if (workspaceLoaded || workspaceLoading) return;
    setWorkspaceLoading(true);
    try {
      const result = await api.get<AuxiliaryOrderResponse>("/api/orders/auxiliary");
      setData((current) => ({
        ...current,
        projects: result.projects || [],
        materials: result.materials || [],
        suppliers: result.suppliers || [],
        orderTemplates: result.orderTemplates || [],
      }));
      setWorkspaceLoaded(true);
    } catch (error: any) {
      setMessage(error?.message || "下单数据加载失败");
    } finally {
      setWorkspaceLoading(false);
    }
  }, [workspaceLoaded, workspaceLoading]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    const draft = readOrderDraftRecord();
    if (draft) {
      setForm(draft.form);
      setDraftSavedAt(draft.savedAt);
      setHasSavedDraft(true);
    }
    draftReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (!draftReadyRef.current) return;
    if (suppressDraftRef.current) {
      suppressDraftRef.current = false;
      return;
    }
    if (!hasOrderDraftContent(form)) {
      clearOrderDraftRecord();
      setDraftSavedAt("");
      setHasSavedDraft(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const savedAt = writeOrderDraftRecord(form);
      if (!savedAt) return;
      setDraftSavedAt(savedAt);
      setHasSavedDraft(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form]);

  useEffect(() => {
    const handlePrintMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "AUXILIARY_ORDER_PRINTED") return;
      const orderId = String(event.data.orderId || "");
      const printSessionKey = String(event.data.printSessionKey || "");
      if (!orderId || !printSessionKey || printRecordKeysRef.current.has(printSessionKey)) return;
      printRecordKeysRef.current.add(printSessionKey);
      try {
        const result = await api.post<{ print_count?: number }>("/api/orders/auxiliary", {
          action: "record_auxiliary_print",
          id: orderId,
        });
        const printCount = Number(result.print_count || 0);
        if (printCount > 0) {
          setData((current) => ({
            ...current,
            orders: current.orders.map((item) => item.id === orderId ? { ...item, print_count: printCount } : item),
          }));
        }
      } catch (error: any) {
        setMessage(error?.message || "记录打印次数失败");
      }
    };
    window.addEventListener("message", handlePrintMessage);
    return () => window.removeEventListener("message", handlePrintMessage);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const selectedOrder = useMemo(
    () => data.orders.find((order) => order.id === selectedOrderId) || null,
    [data.orders, selectedOrderId]
  );

  const selectedOrderItems = useMemo(
    () => selectedOrder ? data.orderItems.filter((item) => item.order_id === selectedOrder.id) : [],
    [data.orderItems, selectedOrder]
  );
  const visibleOrderIds = useMemo(() => data.orders.map((order) => order.id), [data.orders]);
  const selectedBatchOrderIdSet = useMemo(() => new Set(selectedBatchOrderIds), [selectedBatchOrderIds]);
  const selectedVisibleOrderCount = visibleOrderIds.filter((id) => selectedBatchOrderIdSet.has(id)).length;
  const allVisibleOrdersSelected = visibleOrderIds.length > 0 && selectedVisibleOrderCount === visibleOrderIds.length;

  useEffect(() => {
    const visibleIds = new Set(visibleOrderIds);
    setSelectedBatchOrderIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleOrderIds]);

  useEffect(() => {
    setOutboundInputs((current) => {
      const next: Record<string, string> = {};
      selectedOrderItems.forEach((item) => {
        next[item.id] = current[item.id] ?? formatQuantity(getPendingOutboundQuantity(item));
      });
      return next;
    });
    setDirtyOutboundInputs((current) => {
      const next: Record<string, boolean> = {};
      selectedOrderItems.forEach((item) => {
        if (current[item.id]) next[item.id] = true;
      });
      return next;
    });
  }, [selectedOrder?.id, selectedOrderItems]);

  const statusCounts = data.statusCounts || {};
  const statusTabs = [
    { key: "all", label: "全部", count: Number(statusCounts.all || 0) },
    { key: "PENDING", label: "待处理", count: Number(statusCounts.PENDING || 0) },
    { key: "PARTIAL", label: "部分出库", count: Number(statusCounts.PARTIAL || 0) },
    { key: "RECEIVED", label: "已出库", count: Number(statusCounts.RECEIVED || 0) },
    { key: "CANCELLED", label: "已取消", count: Number(statusCounts.CANCELLED || 0) },
  ];

  const storeOptions = data.storeOptions || [];

  const warehouseSuppliers = useMemo(() => {
    const warehouseTypes = new Set(["COMPANY_WAREHOUSE", "WAREHOUSE"]);
    const warehouseMaterialSupplierIds = new Set(
      data.materials
        .filter((material) => String(material.supply_mode || "WAREHOUSE") === "WAREHOUSE")
        .map((material) => material.supplier_id)
        .filter(Boolean)
    );
    return data.suppliers.filter((supplier) => {
      const type = String(supplier.supplier_type || "");
      const name = String(supplier.name || "");
      return warehouseTypes.has(type) || /仓|仓库/.test(name) || warehouseMaterialSupplierIds.has(supplier.id);
    });
  }, [data.materials, data.suppliers]);

  const selectedWarehouse = useMemo(
    () => warehouseSuppliers.find((supplier) => supplier.id === form.supplier_id) || null,
    [form.supplier_id, warehouseSuppliers]
  );

  const selectedProject = useMemo(
    () => data.projects.find((project) => project.id === form.project_id) || null,
    [data.projects, form.project_id]
  );

  const availableOrderTemplates = useMemo(() => {
    return data.orderTemplates.filter((template) => {
      if (!selectedProject?.branch_org_unit_id) return true;
      return !template.orgUnitId || template.orgUnitId === selectedProject.branch_org_unit_id;
    });
  }, [data.orderTemplates, selectedProject?.branch_org_unit_id]);

  const selectableMaterials = useMemo(() => {
    return data.materials.filter((material) => {
      if (String(material.material_type || "AUXILIARY") === "MAIN") return false;
      if (String(material.supply_mode || "WAREHOUSE") !== "WAREHOUSE") return false;
      if (!form.supplier_id) return false;
      if (material.supplier_id !== form.supplier_id) return false;
      return true;
    });
  }, [data.materials, form.supplier_id]);

  const materialCategories = useMemo(() => {
    const counts = selectableMaterials.reduce<Record<string, number>>((result, material) => {
      const category = material.category_name || "未分类";
      result[category] = (result[category] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [selectableMaterials]);

  const filteredSelectableMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();
    return selectableMaterials.filter((material) => {
      if (materialCategoryFilter !== "all" && (material.category_name || "未分类") !== materialCategoryFilter) return false;
      if (!keyword) return true;
      const text = [
        material.code,
        material.name,
        material.brand,
        material.product_name,
        material.material_model,
        material.color,
        material.spec,
        material.unit,
        material.category_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(keyword);
    });
  }, [materialCategoryFilter, materialSearch, selectableMaterials]);

  const selectedMaterialMap = useMemo(() => {
    return form.items.reduce<Record<string, OrderLineForm>>((result, item) => {
      if (item.material_id) result[item.material_id] = item;
      return result;
    }, {});
  }, [form.items]);

  const formTotalAmount = form.items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);
  }, 0);
  const showReceivedColumn = ["PARTIAL", "RECEIVED"].includes(form.status);
  const selectedOutboundTotal = selectedOrderItems.reduce((sum, item) => sum + Number(item.stock_deducted_qty || 0), 0);
  const selectedPendingOutboundTotal = selectedOrderItems.reduce((sum, item) => sum + getCurrentOutboundQuantity(item, outboundInputs), 0);

  const exportOrders = async () => {
    if (Number(data.total || 0) === 0) {
      setMessage("当前筛选条件下没有可导出的订单");
      return;
    }
    setExporting(true);
    try {
      const exportData = await api.get<AuxiliaryOrderResponse>(buildAuxiliaryOrderListUrl({
        page: 1,
        pageSize: 100000,
        status: statusFilter,
        store: storeFilter,
        search,
        exportAll: true,
      }));
      const orderIds = (exportData.orders || []).map((order) => order.id);
      if (orderIds.length === 0) {
        setMessage("当前筛选条件下没有可导出的订单");
        return;
      }
      const token = localStorage.getItem("zxgj_token");
      const response = await fetch("/api/orders/auxiliary/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ order_ids: orderIds }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "导出订单失败" }));
        throw new Error(error.message || "导出订单失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = safeFileName(`辅材订单_${todayText()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`已导出 ${orderIds.length} 个辅材订单`);
    } catch (error: any) {
      setMessage(error?.message || "导出订单失败");
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    const draft = readOrderDraftRecord();
    setForm(draft?.form || makeDefaultForm());
    setDraftSavedAt(draft?.savedAt || "");
    setHasSavedDraft(Boolean(draft));
    setShowMaterialPicker(false);
    setMaterialSearch("");
    setMaterialCategoryFilter("all");
    setShowCreate(true);
    void loadWorkspaceData();
  };

  const closeCreate = (persistDraft = true) => {
    if (persistDraft) {
      const savedAt = writeOrderDraftRecord(form);
      if (savedAt) {
        setDraftSavedAt(savedAt);
        setHasSavedDraft(true);
      }
    }
    setShowCreate(false);
    setShowMaterialPicker(false);
    setImagePreview(null);
  };

  const discardCreateDraft = () => {
    suppressDraftRef.current = true;
    clearOrderDraftRecord();
    setForm(makeDefaultForm());
    setDraftSavedAt("");
    setHasSavedDraft(false);
    setShowMaterialPicker(false);
    setImagePreview(null);
    setMessage("已放弃本次下单草稿");
  };

  const updateLine = (index: number, patch: Partial<OrderLineForm>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const removeLine = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const openMaterialPicker = () => {
    if (!form.supplier_id) {
      setMessage("请先选择下单仓库");
      return;
    }
    setShowMaterialPicker(true);
  };

  const addMaterialToOrder = (material: MaterialOption) => {
    setForm((current) => {
      const currentIndex = current.items.findIndex((item) => item.material_id === material.id);
      if (currentIndex >= 0) {
        return {
          ...current,
          items: current.items.map((item, index) => {
            if (index !== currentIndex) return item;
            const nextQuantity = (Number(item.quantity || 0) || 0) + 1;
            return {
              ...item,
              quantity: formatQuantity(nextQuantity),
              received_qty: current.order_type === "AUXILIARY_WAREHOUSE" || current.status === "RECEIVED"
                ? formatQuantity(nextQuantity)
                : item.received_qty,
            };
          }),
        };
      }
      return {
        ...current,
        items: [
          ...current.items,
          {
            material_id: material.id,
            quantity: "1",
            unit_price: String(getMaterialOutboundPrice(material)),
            received_qty: current.order_type === "AUXILIARY_WAREHOUSE" || current.status === "RECEIVED" ? "1" : "0",
            remark: "",
          },
        ],
      };
    });
  };

  const applyOrderTemplate = (templateId: string) => {
    if (!templateId) {
      const hasTemplateItems = form.items.some((item) => item.source_template_id);
      setForm((current) => ({
        ...current,
        template_id: "",
        items: current.items.filter((item) => !item.source_template_id),
      }));
      if (hasTemplateItems) setMessage("已取消使用下单模板");
      return;
    }
    const template = data.orderTemplates.find((item) => item.id === templateId);
    if (!template) {
      setMessage("请选择下单模板");
      return;
    }
    const nextSupplierId = template.warehouseSupplierId || form.supplier_id;
    if (!nextSupplierId) {
      setMessage("请先选择下单仓库");
      return;
    }
    const materialById = new Map(data.materials.map((material) => [material.id, material]));
    setForm((current) => {
      const manualItems = current.items.filter((item) => !item.source_template_id);
      const manualMaterialIds = new Set(manualItems.map((item) => item.material_id));
      const nextItems = template.items.flatMap((templateItem) => {
        if (manualMaterialIds.has(templateItem.materialId)) return [];
        const material = materialById.get(templateItem.materialId);
        if (!material) return [];
        if (String(material.material_type || "AUXILIARY") === "MAIN") return [];
        if (String(material.supply_mode || "WAREHOUSE") !== "WAREHOUSE") return [];
        if (material.supplier_id !== nextSupplierId) return [];
        const quantity = Math.max(0, Number(templateItem.defaultQuantity || 0));
        return [{
          material_id: material.id,
          quantity: formatQuantity(quantity),
          unit_price: String(getMaterialOutboundPrice(material)),
          received_qty: current.order_type === "AUXILIARY_WAREHOUSE" || current.status === "RECEIVED" ? formatQuantity(quantity) : "0",
          remark: templateItem.remark || "",
          source_template_id: template.id,
        }];
      });
      return {
        ...current,
        template_id: template.id,
        supplier_id: nextSupplierId,
        items: [...manualItems, ...nextItems],
      };
    });
    const validCount = template.items.filter((templateItem) => {
      const material = materialById.get(templateItem.materialId);
      return material && material.supplier_id === nextSupplierId && String(material.supply_mode || "WAREHOUSE") === "WAREHOUSE";
    }).length;
    const templateWarehouse = warehouseSuppliers.find((supplier) => supplier.id === nextSupplierId)?.name || "";
    if (validCount === 0) {
      setMessage("模板中的材料不属于当前仓库或已下架");
    } else {
      setMessage(`已套用「${template.name}」${templateWarehouse ? `，仓库已切换为${templateWarehouse}` : ""}，手动选择的材料已保留`);
    }
  };

  const showMaterialImagePreview = (
    event: MouseEvent,
    image: string,
    item: MaterialOption | AuxiliaryOrderItem,
    fallbackName = "材料图片"
  ) => {
    if (!image) return;
    setImagePreview({
      src: image,
      name: (item as AuxiliaryOrderItem).material_name || (item as MaterialOption).name || fallbackName,
      spec: getMaterialSpec(item),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const saveOrder = async () => {
    if (!workspaceLoaded) {
      setMessage("下单数据还在加载，请稍等");
      void loadWorkspaceData();
      return;
    }
    const validItems = form.items.filter((item) => item.material_id && Number(item.quantity || 0) > 0);
    if (!form.project_id) {
      setMessage("请选择下单工地");
      return;
    }
    if (!form.supplier_id) {
      setMessage("请选择下单仓库");
      return;
    }
    if (validItems.length === 0) {
      setMessage("请至少选择一个材料并填写下单数量");
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ success: boolean; id: string; order_no: string }>("/api/orders/auxiliary", {
        action: "add_auxiliary_order",
        ...form,
        items: validItems.map((item) => ({
          material_id: item.material_id,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          received_qty: Number(item.received_qty || 0),
          remark: item.remark,
        })),
      });
      suppressDraftRef.current = true;
      clearOrderDraftRecord();
      closeCreate(false);
      setForm(makeDefaultForm());
      setDraftSavedAt("");
      setHasSavedDraft(false);
      setMessage(`辅材订单 ${result.order_no} 已创建`);
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "保存辅材订单失败");
    } finally {
      setSaving(false);
    }
  };

  const updateOrderStatus = async (order: AuxiliaryOrder, status: string) => {
    setSaving(true);
    try {
      await api.post("/api/orders/auxiliary", {
        action: "update_auxiliary_order",
        id: order.id,
        status,
      });
      setMessage("订单状态已更新");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "更新订单状态失败");
    } finally {
      setSaving(false);
    }
  };

  const confirmOutbound = async (order: AuxiliaryOrder) => {
    if (normalizeOrderStatus(order.status) === "CANCELLED") {
      setMessage("已取消订单不能确认出库");
      return;
    }
    const pendingQuantity = selectedOrderItems.reduce((sum, item) => sum + getCurrentOutboundQuantity(item, outboundInputs), 0);
    if (pendingQuantity <= 0) {
      setMessage("请先在材料明细中填写本次出库数量");
      return;
    }
    if (!window.confirm(`确认本次出库 ${formatQuantity(pendingQuantity)} 件材料？确认后会扣减库存并生成出库记录。`)) return;
    setSaving(true);
    try {
      const outboundItems = selectedOrderItems.filter((item) => getCurrentOutboundQuantity(item, outboundInputs) > 0);
      for (const item of outboundItems) {
        await api.post("/api/orders/auxiliary", {
          action: "update_auxiliary_received",
          item_id: item.id,
          outbound_qty: getCurrentOutboundQuantity(item, outboundInputs),
        });
      }
      await api.post("/api/orders/auxiliary", {
        action: "confirm_auxiliary_outbound",
        id: order.id,
      });
      setMessage("已确认出库，库存已扣减");
      const itemIds = new Set(selectedOrderItems.map((item) => item.id));
      setOutboundInputs((current) => {
        const next = { ...current };
        itemIds.forEach((id) => delete next[id]);
        return next;
      });
      setDirtyOutboundInputs((current) => {
        const next = { ...current };
        itemIds.forEach((id) => delete next[id]);
        return next;
      });
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "确认出库失败");
    } finally {
      setSaving(false);
    }
  };

  const updateReceivedQty = async (item: AuxiliaryOrderItem, value: string) => {
    const outboundQty = getClampedOutboundQuantity(item, value);
    setOutboundInputs((current) => ({ ...current, [item.id]: formatQuantity(outboundQty) }));
    setSaving(true);
    try {
      await api.post("/api/orders/auxiliary", {
        action: "update_auxiliary_received",
        item_id: item.id,
        outbound_qty: outboundQty,
      });
      setMessage("出库数量已更新");
      if (outboundQty > 0) {
        setDirtyOutboundInputs((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "更新出库数量失败");
    } finally {
      setSaving(false);
    }
  };

  const printAuxiliaryDocument = (
    html: string,
    printRecords: { orderId: string; printSessionKey: string }[],
    successMessage?: string,
  ) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const printDocument = iframe.contentDocument || iframe.contentWindow?.document;
    if (!printDocument) {
      iframe.remove();
      setMessage("无法创建打印预览，请刷新页面后重试");
      return;
    }

    let recorded = false;
    const recordPrinted = () => {
      if (recorded) return;
      recorded = true;
      printRecords.forEach((record) => {
        window.postMessage({
          type: "AUXILIARY_ORDER_PRINTED",
          orderId: record.orderId,
          printSessionKey: record.printSessionKey,
        }, window.location.origin);
      });
      if (successMessage) setMessage(successMessage);
      window.setTimeout(() => iframe.remove(), 800);
    };

    printDocument.open();
    printDocument.write(html);
    printDocument.close();

    window.setTimeout(() => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        iframe.remove();
        setMessage("无法打开打印预览，请刷新页面后重试");
        return;
      }
      printWindow.addEventListener("afterprint", recordPrinted, { once: true });
      printWindow.focus();
      printWindow.print();
    }, 120);
  };

  const printOrder = async (order: AuxiliaryOrder, items: AuxiliaryOrderItem[]) => {
    const printCount = Number(order.print_count || 0) + 1;
    const printSessionKey = `${order.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pages = buildAuxiliaryOrderPrintPagesHtml(
      order,
      items,
      printCount,
      (item) => getPrintOutboundQuantity(item, outboundInputs, dirtyOutboundInputs),
    );
    const printRecords = [{ orderId: order.id, printSessionKey }];
    printAuxiliaryDocument(buildAuxiliaryOrderPrintDocumentHtml({
      title: `${order.order_no} 材料出库单`,
      pages,
    }), printRecords);
  };

  const toggleBatchOrderSelected = (orderId: string, selected: boolean) => {
    setSelectedBatchOrderIds((current) => {
      if (selected) return current.includes(orderId) ? current : [...current, orderId];
      return current.filter((id) => id !== orderId);
    });
  };

  const toggleVisibleOrdersSelected = (selected: boolean) => {
    setSelectedBatchOrderIds(selected ? visibleOrderIds : []);
  };

  const printSelectedOrders = () => {
    const selectedOrders = data.orders.filter((order) => selectedBatchOrderIdSet.has(order.id));
    if (selectedOrders.length === 0) {
      setMessage("请先勾选需要打印的辅材订单");
      return;
    }
    const now = Date.now();
    const pages = selectedOrders.flatMap((order) => {
      const orderItems = data.orderItems.filter((item) => item.order_id === order.id);
      return buildAuxiliaryOrderPrintPagesHtml(
        order,
        orderItems,
        Number(order.print_count || 0) + 1,
        (item) => getPrintOutboundQuantity(item, {}, {}),
      );
    });
    const printRecords = selectedOrders.map((order, index) => ({
      orderId: order.id,
      printSessionKey: `${order.id}-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    printAuxiliaryDocument(buildAuxiliaryOrderPrintDocumentHtml({
      title: `辅材订单批量打印_${selectedOrders.length}单`,
      pages,
    }), printRecords, `已打开 ${selectedOrders.length} 个辅材订单的批量打印预览`);
  };

  if (loading) {
    return (
      <div className="app-page-surface enterprise-list-ui auxiliary-orders-ui aux-orders-page flex h-full min-h-0 items-center justify-center bg-[#F5F7FB] text-[#6B7280]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary-600" />
        辅材订单加载中...
      </div>
    );
  }

  return (
    <div className="app-page-surface enterprise-list-ui auxiliary-orders-ui aux-orders-page flex h-full min-h-0 flex-col bg-[#F5F7FB]">
      {message && (
        <div className={cn(
          "aux-orders-toast fixed left-1/2 top-5 z-[80] flex -translate-x-1/2 items-center gap-2 border bg-white px-4 py-2 text-sm font-medium",
          /失败|缺少|请选择|不能|不存在|至少|不足/.test(message) ? "border-red-100 text-red-600" : "border-emerald-100 text-emerald-700"
        )}>
          {/失败|缺少|请选择|不能|不存在|至少|不足/.test(message) ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {message}
        </div>
      )}

      <section className="aux-orders-toolbar-panel aux-orders-list-toolbar system-status-toolbar-panel shrink-0 overflow-hidden bg-white">
          <SystemStatusFilter
            items={statusTabs.map((tab) => ({ value: tab.key, label: tab.label, count: tab.count }))}
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="辅材订单状态筛选"
          />
          <div className="aux-orders-actions-row system-status-toolbar-actions">
              <label className="aux-orders-store-filter block">
                <span className="sr-only">服务门店筛选</span>
                <SystemSelect
                  value={storeFilter}
                  onChange={(event) => setStoreFilter(event.target.value)}
                  className="input-field min-h-10 py-2 text-sm"
                >
                  <option value="">全部服务门店</option>
                  {storeOptions.map((store) => (
                    <option key={store.value} value={store.value}>
                      {store.label}（{store.count}）
                    </option>
                  ))}
                </SystemSelect>
              </label>
              <div className="aux-orders-search relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="input-field pl-9"
                  placeholder="搜索订单、房号、客户姓名、供应商、材料"
                />
              </div>
              <button type="button" onClick={exportOrders} className="aux-orders-toolbar-button btn-secondary" disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                导出订单
              </button>
              <button
                type="button"
                onClick={printSelectedOrders}
                className={cn(
                  "aux-orders-toolbar-button aux-orders-batch-print-button btn-secondary",
                  selectedVisibleOrderCount > 0 && "is-active"
                )}
                disabled={selectedVisibleOrderCount === 0}
              >
                <Printer className="h-4 w-4" />
                批量打印{selectedVisibleOrderCount > 0 ? ` ${selectedVisibleOrderCount}` : ""}
              </button>
              <button type="button" onClick={openCreate} className="aux-orders-toolbar-button btn-primary">
                <Plus className="h-4 w-4" />
                新增下单
              </button>
          </div>
      </section>

      <SystemResourceTable.Panel className="auxiliary-orders-table aux-orders-list-panel flex-1">
        {loading && data.orders.length > 0 && (
          <div className="flex min-h-9 shrink-0 items-center justify-end gap-2 border-b border-[#DCE8FF] bg-[#F7FAFF] px-4 text-xs font-medium text-[#407AFF]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在更新
          </div>
        )}
        <SystemResourceTable.Scroll>
          <SystemResourceTable.Table minWidth={1636} fixed>
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[56px]" />
              <col className="w-[92px]" />
              <col className="w-[138px]" />
              <col className="w-[170px]" />
              <col className="w-[100px]" />
              <col className="w-[126px]" />
              <col className="w-[126px]" />
              <col className="w-[138px]" />
              <col className="w-[140px]" />
              <col className="w-[72px]" />
              <col className="w-[84px]" />
              <col className="w-[260px]" />
              <col className="w-[84px]" />
            </colgroup>
            <thead>
              <tr>
                <SystemResourceTable.HeaderCell align="center">
                  <input
                    type="checkbox"
                    checked={allVisibleOrdersSelected}
                    onChange={(event) => toggleVisibleOrdersSelected(event.target.checked)}
                    className="aux-orders-select-checkbox"
                    aria-label="全选当前页辅材订单"
                  />
                </SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">序号</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">状态</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>订单编号</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>房号</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>客户姓名</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>下单人</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>下单人电话</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">下单时间</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>下单仓库</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="right">材料项</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="right">订单金额</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell>备注</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">操作</SystemResourceTable.HeaderCell>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order, index) => {
                const siteName = getSiteName(order);
                const supplierName = order.supplier_name || "未设置仓库";
                const orderUserNotes = getOrderUserNotes(order.notes);
                return (
                  <SystemResourceTable.Row
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <SystemResourceTable.Cell align="center">
                      <input
                        type="checkbox"
                        checked={selectedBatchOrderIdSet.has(order.id)}
                        onChange={(event) => toggleBatchOrderSelected(order.id, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        className="aux-orders-select-checkbox"
                        aria-label={`选择订单 ${order.order_no}`}
                      />
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center" index>{(effectivePage - 1) * pageSize + index + 1}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center"><StatusBadge status={order.status} /></SystemResourceTable.Cell>
                    <SystemResourceTable.Cell emphasis className="tabular-nums">{order.order_no}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell>
                      <span className="auxiliary-order-room-text block truncate font-semibold" title={siteName}>{siteName}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell>
                      <span className="block truncate" title={order.customer_name || ""}>{order.customer_name || "-"}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell>
                      <span className="block truncate" title={order.created_by_name || ""}>{order.created_by_name || "-"}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell className="tabular-nums">{order.created_by_phone || "-"}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center" className="tabular-nums">{formatDateTime(order.created_at || order.order_date)}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell>
                      <span className="block truncate" title={supplierName}>{supplierName}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="right" className="tabular-nums">{Number(order.item_count || 0)}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="right" emphasis className="auxiliary-order-amount-cell auxiliary-order-amount-text tabular-nums">
                      <span className="block whitespace-nowrap" title={formatAmount(order.total_amount)}>
                        {formatTableAmount(order.total_amount)}
                      </span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell>
                      <span className="block truncate" title={orderUserNotes}>{orderUserNotes || "-"}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                        className="aux-orders-row-action inline-flex h-8 items-center gap-1 border border-[#DCE4F0] bg-white px-2.5 text-xs font-semibold text-[#34445A] hover:border-[#CFE0FF] hover:text-[#407AFF]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        查看
                      </button>
                    </SystemResourceTable.Cell>
                  </SystemResourceTable.Row>
                );
              })}
              {loading && data.orders.length === 0 && (
                <tr className="aux-orders-static-row">
                  <td colSpan={14} className="px-4 py-16 text-center">
                    <div className="aux-order-loading-state inline-flex items-center gap-2 border border-[#E5EAF2] bg-white px-4 py-2 text-sm font-medium text-surface-500">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-700" />
                      正在加载辅材订单...
                    </div>
                  </td>
                </tr>
              )}
              {!loading && data.orders.length === 0 && (
                <tr className="aux-orders-static-row">
                  <td colSpan={14} className="px-4 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center text-surface-400">
                      <ClipboardList className="mb-3 h-10 w-10 text-surface-300" />
                      <p className="text-sm">暂无符合条件的辅材订单</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </SystemResourceTable.Table>
        </SystemResourceTable.Scroll>
        <SystemResourceTable.Pagination
          total={Number(data.total || 0)}
          page={effectivePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemName="个订单"
          className="aux-orders-pagination"
        />
      </SystemResourceTable.Panel>

      {showCreate && (
        <div className={cn(
          "aux-orders-overlay fixed inset-y-0 right-0 z-50 bg-surface-950/25 md:left-[var(--active-sidebar-width)] max-md:left-0",
          showMaterialPicker && "aux-orders-picker-active"
        )}>
          <div className="flex h-full items-center justify-center p-2 lg:p-3">
            <div className="auxiliary-order-modal aux-orders-workspace aux-orders-create-workspace flex h-[96vh] w-full max-w-[1380px] flex-col overflow-hidden border border-[#DCE4F0] bg-[#F5F7FB]">
              <div className="aux-orders-workspace-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
                <div className="aux-order-create-heading flex min-w-0 items-center gap-3">
                  <span className="aux-order-create-heading-icon inline-flex h-10 w-10 shrink-0 items-center justify-center">
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-surface-900">新增辅材下单</p>
                    <p className="mt-0.5 truncate text-xs text-surface-500">
                      选择工地与仓库后添加材料{hasSavedDraft ? ` · 草稿已暂存${formatDraftSavedAt(draftSavedAt) ? ` ${formatDraftSavedAt(draftSavedAt)}` : ""}` : ""}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => closeCreate()} className="aux-orders-icon-button flex h-9 w-9 items-center justify-center border border-[#DCE4F0] bg-white text-surface-500 hover:text-surface-900" aria-label="关闭新增下单">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="aux-orders-workspace-body aux-order-create-body relative flex-1 space-y-4 overflow-y-auto bg-surface-50/70 p-4 lg:p-5">
                {workspaceLoading && !workspaceLoaded && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-50/85 backdrop-blur-[1px]">
                    <div className="aux-order-loading-state inline-flex items-center gap-2 border border-[#E5EAF2] bg-white px-4 py-2 text-sm font-medium text-surface-600 shadow-none">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-700" />
                      正在加载下单数据...
                    </div>
                  </div>
                )}
                <div className="grid gap-4">
                  <section className="aux-orders-section aux-order-create-basics border border-[#E5EAF2] bg-white p-4">
                    <div className="aux-order-create-section-heading mb-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-900">基础信息</p>
                        <p className="mt-0.5 text-xs text-surface-500">选择工地、下单仓库和预计到货时间</p>
                      </div>
                      <span className="aux-order-pending-tag inline-flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        保存后待处理
                      </span>
                    </div>

                    <div className="aux-order-create-form-grid grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                      <label className="block xl:col-span-2">
                        <span className="mb-1.5 block text-xs font-medium text-surface-600">下单工地</span>
	                        <SystemSelect
	                          value={form.project_id}
	                          onChange={(event) => setForm((current) => ({
	                            ...current,
	                            project_id: event.target.value,
	                            template_id: "",
	                            items: current.items.filter((item) => !item.source_template_id),
	                          }))}
	                          className="input-field min-h-10 py-2"
	                          disabled={saving}
	                        >
                          <option value="">请选择工地</option>
                          {data.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {getSiteName(project)}{project.customer_name ? ` / ${project.customer_name}` : ""}
                            </option>
                          ))}
                        </SystemSelect>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-600">下单仓库</span>
                        <SystemSelect
                          value={form.supplier_id}
                          onChange={(event) => {
                            setForm((current) => ({
                              ...current,
                              supplier_id: event.target.value,
                              template_id: "",
                              items: [],
                            }));
                            setMaterialSearch("");
                            setMaterialCategoryFilter("all");
                          }}
                          className="input-field min-h-10 py-2"
                          disabled={saving}
                        >
                          <option value="">请选择仓库</option>
                          {warehouseSuppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                          ))}
                        </SystemSelect>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-600">下单日期</span>
                        <SystemDateInput value={form.order_date} onChange={(nextValue) => setForm((current) => ({ ...current, order_date: nextValue }))} className="input-field min-h-10 py-2" disabled={saving} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-surface-600">预计到货</span>
                        <SystemDateInput value={form.delivery_date} onChange={(nextValue) => setForm((current) => ({ ...current, delivery_date: nextValue }))} className="input-field min-h-10 py-2" disabled={saving} />
                      </label>
                      <label className="block xl:col-span-2">
                        <span className="mb-1.5 block text-xs font-medium text-surface-600">下单备注</span>
                        <input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="input-field min-h-10 py-2" placeholder="送货地址、联系人、特殊要求" disabled={saving} />
                      </label>
                    </div>
                  </section>
                </div>

                <section className={cn("aux-orders-section aux-orders-line-items aux-order-create-materials overflow-hidden border border-[#E5EAF2] bg-white", form.items.length === 0 && "is-empty")}>
                  <div className="aux-order-material-toolbar flex flex-col gap-3 border-b border-surface-300 bg-surface-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-surface-900">材料明细</p>
                      <p className="mt-0.5 text-xs text-surface-500">
                        {form.supplier_id ? `已选 ${form.items.length} 项，当前仓库可选 ${selectableMaterials.length} 项` : "请先选择下单仓库"}
                        {!showReceivedColumn ? "，出库数量可在订单详情中填写" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <SystemSelect
                        value={form.template_id}
                        onChange={(event) => applyOrderTemplate(event.target.value)}
	                        className="input-field min-h-9 w-full min-w-[220px] py-1.5 text-sm sm:w-[260px]"
	                        disabled={saving || availableOrderTemplates.length === 0}
	                      >
	                        <option value="">{availableOrderTemplates.length > 0 ? "不使用模板" : "当前分公司暂无快速下单模板"}</option>
	                        {availableOrderTemplates.map((template) => (
	                          <option key={template.id} value={template.id}>
	                            {template.name}（{template.itemCount || template.items.length}项{template.warehouseSupplierId ? ` / ${warehouseSuppliers.find((supplier) => supplier.id === template.warehouseSupplierId)?.name || "指定仓库"}` : ""}）
	                          </option>
	                        ))}
                      </SystemSelect>
                      <button type="button" onClick={openMaterialPicker} className="aux-order-select-product btn-primary min-h-9 justify-center px-3 py-1.5" disabled={saving || !workspaceLoaded || workspaceLoading}>
                        <ShoppingCart className="h-4 w-4" />
                        选择商品
                      </button>
                    </div>
                  </div>
                  <ThinScrollArea className="aux-order-material-scroll">
                    <table className={cn("aux-order-create-table w-full table-fixed text-sm", showReceivedColumn ? "min-w-[1160px]" : "min-w-[1060px]")}>
                      <colgroup>
                        <col className="w-[76px]" />
                        <col />
                        <col className="w-[76px]" />
                        <col className="w-[96px]" />
                        <col className="w-[105px]" />
                        <col className="w-[105px]" />
                        {showReceivedColumn && <col className="w-[105px]" />}
                        <col className="w-[115px]" />
                        <col className="w-[190px]" />
                        <col className="w-[64px]" />
                      </colgroup>
                      <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
                        <tr className="border-b border-surface-300">
                          <th className="px-3 py-2.5 text-center">图片</th>
	                          <th className="px-3 py-2.5 text-center">材料</th>
                          <th className="px-3 py-2.5 text-center">单位</th>
                          <th className="px-3 py-2.5 text-right">库存</th>
                          <th className="px-3 py-2.5 text-right">数量</th>
                          <th className="px-3 py-2.5 text-right">单价</th>
                          {showReceivedColumn && <th className="px-3 py-2.5 text-right">出库数量</th>}
                          <th className="px-3 py-2.5 text-right">小计</th>
	                          <th className="px-3 py-2.5 text-center">备注</th>
                          <th className="px-3 py-2.5 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-200 bg-white">
                        {form.items.map((line, index) => {
                          const material = data.materials.find((item) => item.id === line.material_id);
                          const lineQuantity = Number(line.quantity || 0) || 0;
                          const lineAmount = lineQuantity * (Number(line.unit_price || 0) || 0);
                          const materialStock = Number(material?.stock || 0);
                          const stockInsufficient = Boolean(material) && lineQuantity > materialStock;
                          const materialImage = material ? getMaterialImage(material) : "";
                          return (
                            <tr key={index}>
                              <td className="px-3 py-2.5 text-center align-middle">
                                <div className="aux-order-material-image mx-auto flex h-11 w-11 items-center justify-center overflow-hidden border border-[#E5EAF2] bg-[#F7F9FC]">
                                  {materialImage ? (
                                    <NativeImage
                                      src={materialImage}
                                      alt={material?.name || "材料图片"}
                                      className="h-full w-full cursor-zoom-in object-cover"
                                      onMouseEnter={(event) => material && showMaterialImagePreview(event, materialImage, material)}
                                      onMouseMove={(event) => material && showMaterialImagePreview(event, materialImage, material)}
                                      onMouseLeave={() => setImagePreview(null)}
                                    />
                                  ) : (
                                    <Package className="h-5 w-5 text-surface-300" />
                                  )}
                                </div>
                              </td>
	                              <td className="px-3 py-2.5 text-center align-middle">
	                                <p className="truncate font-semibold text-surface-900" title={material?.name || ""}>{material?.name || "未知材料"}</p>
	                                <p className="mt-1 truncate text-xs text-surface-500" title={material ? getMaterialSpec(material) : ""}>
                                  {material ? `${material.category_name || "未分类"} · ${getMaterialSpec(material) || "未填写规格"}` : "材料不存在或已下架"}
                                </p>
                                {stockInsufficient && (
                                  <p className="mt-1 text-xs font-semibold text-red-600">
                                    库存不足，超出 {formatQuantity(lineQuantity - materialStock)} {material?.unit || ""}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle text-surface-600">{material?.unit || "-"}</td>
                              <td className={cn(
                                "px-3 py-2.5 text-right align-middle font-semibold tabular-nums",
                                stockInsufficient ? "text-red-600" : materialStock <= 0 ? "text-amber-600" : "text-surface-700"
                              )}>
                                {material ? formatQuantity(materialStock) : "-"}
                              </td>
	                              <td className="px-3 py-2.5 text-right align-middle">
	                                <input
                                  value={line.quantity}
                                  onChange={(event) => updateLine(index, {
                                    quantity: normalizeNumberInput(event.target.value),
                                    received_qty: form.status === "RECEIVED" ? normalizeNumberInput(event.target.value) : line.received_qty,
                                  })}
	                                  className={cn(
	                                    "input-field ml-auto min-h-9 max-w-[86px] py-1.5 text-right",
                                    stockInsufficient && "border-red-300 bg-red-50 text-red-700 focus:border-red-400 focus:ring-red-100"
                                  )}
                                  inputMode="decimal"
                                  placeholder="0"
                                  disabled={saving}
                                  title={stockInsufficient ? `库存不足，当前库存 ${formatQuantity(materialStock)}` : undefined}
                                />
                              </td>
	                              <td className="px-3 py-2.5 text-right align-middle">
	                                <input
                                  value={line.unit_price}
                                  onChange={(event) => updateLine(index, { unit_price: normalizeNumberInput(event.target.value) })}
	                                  className="input-field ml-auto min-h-9 max-w-[86px] py-1.5 text-right"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  disabled={saving}
                                />
                              </td>
                              {showReceivedColumn && (
	                                <td className="px-3 py-2.5 text-right align-middle">
	                                  <input
                                    value={line.received_qty}
                                    onChange={(event) => updateLine(index, { received_qty: normalizeNumberInput(event.target.value) })}
	                                    className="input-field ml-auto min-h-9 max-w-[86px] py-1.5 text-right"
                                    inputMode="decimal"
                                    placeholder="0"
                                    disabled={saving}
                                  />
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-red-600">{formatAmount(lineAmount)}</td>
	                              <td className="px-3 py-2.5 text-center align-middle">
	                                <input value={line.remark} onChange={(event) => updateLine(index, { remark: event.target.value })} className="input-field min-h-9 py-1.5" placeholder="备注" disabled={saving} />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button type="button" onClick={() => removeLine(index)} className="aux-order-remove-line p-1.5 text-surface-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={saving} aria-label="删除材料">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {form.items.length === 0 && (
                          <tr>
                            <td colSpan={showReceivedColumn ? 10 : 9} className="aux-order-empty-cell px-4 py-20 text-center">
                              <div className="aux-order-empty-state mx-auto flex max-w-sm flex-col items-center text-surface-400">
                                <span className="aux-order-empty-icon mb-3 inline-flex items-center justify-center"><Package className="h-5 w-5" /></span>
                                <p className="text-sm font-medium text-surface-600">还没有选择商品</p>
                                <p className="mt-1 text-xs text-surface-400">可套用下单模板，或从当前仓库的商品页加入订单。</p>
                                <button type="button" onClick={openMaterialPicker} className="aux-order-empty-action btn-secondary mt-4" disabled={saving || !workspaceLoaded || workspaceLoading}>
                                  <Plus className="h-4 w-4" />
                                  选择商品
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ThinScrollArea>
                </section>

                <section className="aux-orders-section aux-order-create-summary border border-[#E5EAF2] bg-white p-4">
                  <div className="grid gap-4">
                    <div className="aux-order-fulfillment-note flex min-w-0 items-start gap-3">
                      <span className="aux-order-fulfillment-icon inline-flex h-9 w-9 shrink-0 items-center justify-center"><Truck className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-900">仓库履约</p>
                        <p className="mt-1 text-xs leading-5 text-surface-500">
                          保存后进入仓库待处理；确认出库后，系统扣减库存并生成出库记录。
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {form.supplier_id && selectableMaterials.length === 0 && (
                  <p className="aux-order-stock-warning border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    当前仓库暂无可选辅材，请先在材料库维护该仓库的辅材商品。
                  </p>
                )}
              </div>

              <div className="aux-orders-workspace-footer aux-order-create-footer flex items-center justify-between gap-3 border-t border-surface-200 bg-white px-5 py-3">
                <div className="aux-order-footer-meta text-xs text-surface-500">
                  共 <span className="font-semibold text-surface-900">{form.items.length}</span> 行材料
                  {hasSavedDraft && (
                    <span className="ml-3 text-emerald-600">已暂存{formatDraftSavedAt(draftSavedAt) ? ` ${formatDraftSavedAt(draftSavedAt)}` : ""}</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <div className="aux-order-footer-total mr-2 hidden items-baseline gap-2 sm:flex">
                    <span className="text-xs font-medium text-surface-500">订单合计</span>
                    <strong className="text-lg font-semibold tabular-nums text-red-600">{formatAmount(formTotalAmount)}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={discardCreateDraft}
                    className="aux-order-discard-button inline-flex min-h-10 items-center gap-2 border border-red-100 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                    disabled={saving || !hasOrderDraftContent(form)}
                  >
                    放弃草稿
                  </button>
                  <button type="button" onClick={() => closeCreate()} className="aux-order-close-button btn-secondary" disabled={saving}>关闭</button>
                  <button type="button" onClick={saveOrder} className="aux-order-save-button btn-primary disabled:opacity-50" disabled={saving || workspaceLoading || !workspaceLoaded || form.items.length === 0}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    保存下单
                  </button>
                </div>
              </div>
            </div>
          </div>

          {showMaterialPicker && (
            <div className="aux-orders-overlay aux-orders-secondary-overlay fixed inset-y-0 right-0 z-[70] md:left-[var(--active-sidebar-width)] max-md:left-0">
              <div className="flex h-full items-center justify-center p-2 lg:p-3">
                <div className="auxiliary-order-modal aux-orders-workspace aux-orders-product-picker flex h-[96vh] w-full max-w-[1240px] flex-col overflow-hidden border border-[#DCE4F0] bg-[#F3F6FA]">
                  <div className="aux-orders-workspace-header aux-orders-picker-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
                    <div className="aux-orders-picker-heading flex min-w-0 items-center gap-3">
                      <span className="aux-orders-picker-heading-icon inline-flex h-9 w-9 shrink-0 items-center justify-center">
                        <ShoppingCart className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-surface-900">选择商品</p>
                          {selectedWarehouse && (
                            <span className="aux-orders-warehouse-tag rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
                              {selectedWarehouse.name}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-surface-500">
                          按分类和关键词快速找材料，点击商品即可加入当前订单
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMaterialPicker(false);
                        setImagePreview(null);
                      }}
                      className="aux-orders-icon-button flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900"
                      aria-label="关闭商品选择"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="aux-orders-picker-toolbar border-b border-surface-200 bg-white px-5 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="aux-orders-picker-search relative min-w-0 w-full lg:max-w-[520px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                        <input
                          value={materialSearch}
                          onChange={(event) => setMaterialSearch(event.target.value)}
                          className="input-field min-h-10 pl-9"
                          placeholder="搜索材料名称、编码、品牌、规格、颜色"
                        />
                      </div>
                      <div className="aux-orders-picker-stats flex items-center text-xs text-surface-500">
                        <span className="aux-orders-picker-stat">可选 <b className="font-semibold text-surface-900">{selectableMaterials.length}</b> 项</span>
                        <span className="aux-orders-picker-stat">当前筛选 <b className="font-semibold text-surface-900">{filteredSelectableMaterials.length}</b> 项</span>
                        <span className="aux-orders-picker-stat">已选 <b className="font-semibold text-primary-700">{form.items.length}</b> 项</span>
                      </div>
                    </div>
                  </div>

                  <div className="aux-orders-picker-layout grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[210px_minmax(0,1fr)_290px]">
                    <aside className="aux-orders-picker-categories border-b border-surface-200 bg-white p-3 lg:border-b-0 lg:border-r">
                      <div className="aux-orders-picker-categories-header flex items-center justify-between px-2 pb-2 pt-1">
                        <span className="text-xs font-semibold text-surface-700">商品分类</span>
                        <span className="text-xs tabular-nums text-surface-400">{materialCategories.length}</span>
                      </div>
                      <div className="aux-orders-picker-category-list max-h-[180px] space-y-1 overflow-y-auto pr-1 lg:max-h-full">
                        <button
                          type="button"
                          onClick={() => setMaterialCategoryFilter("all")}
                          className={cn(
                            "aux-orders-category-button flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium transition-colors",
                            materialCategoryFilter === "all" ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100" : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                          )}
                        >
                          <span>全部商品</span>
                          <span className="text-xs tabular-nums">{selectableMaterials.length}</span>
                        </button>
                        {materialCategories.map((category) => (
                          <button
                            key={category.name}
                            type="button"
                            onClick={() => setMaterialCategoryFilter(category.name)}
                            className={cn(
                              "aux-orders-category-button flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium transition-colors",
                              materialCategoryFilter === category.name ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100" : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                            )}
                          >
                            <span className="truncate" title={category.name}>{category.name}</span>
                            <span className="shrink-0 text-xs tabular-nums">{category.count}</span>
                          </button>
                        ))}
                      </div>
                    </aside>

                    <main className="aux-orders-picker-results min-h-0 overflow-y-auto bg-surface-50/80 p-4">
                      {filteredSelectableMaterials.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {filteredSelectableMaterials.map((material) => {
                            const image = getMaterialImage(material);
                            const selectedLine = selectedMaterialMap[material.id];
                            const selectedQuantity = Number(selectedLine?.quantity || 0) || 0;
                            const stock = Number(material.stock || 0);
                            const isOutOfStock = stock <= 0 || selectedQuantity > stock;
                            return (
                              <button
                                key={material.id}
                                type="button"
                                onClick={() => addMaterialToOrder(material)}
                                className={cn(
                                  "aux-orders-product-card group flex min-h-[142px] flex-col overflow-hidden border bg-white text-left transition-all duration-150 hover:border-primary-200",
                                  selectedLine ? "border-primary-200 ring-1 ring-primary-100" : "border-surface-200"
                                )}
                              >
                                <div className="flex gap-3 p-3">
                                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                                    {image ? (
                                      <NativeImage
                                        src={image}
                                        alt={material.name}
                                        className="h-full w-full cursor-zoom-in object-cover"
                                        onMouseEnter={(event) => showMaterialImagePreview(event, image, material)}
                                        onMouseMove={(event) => showMaterialImagePreview(event, image, material)}
                                        onMouseLeave={() => setImagePreview(null)}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                    ) : (
                                      <Package className="h-7 w-7 text-surface-300" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p
                                        className="overflow-hidden text-sm font-semibold leading-5 text-surface-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                                        title={material.name}
                                      >
                                        {material.name}
                                      </p>
                                      {selectedLine && (
                                        <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">
                                          已选 {formatQuantity(selectedQuantity)}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 truncate text-xs text-surface-500" title={getMaterialSpec(material)}>
                                      {getMaterialSpec(material) || "未填写规格"}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-surface-400" title={material.category_name || ""}>
                                      {material.category_name || "未分类"}
                                    </p>
                                    {material.code && (
                                      <p className="mt-1 truncate font-mono text-xs font-semibold text-surface-500" title={material.code}>
                                        {material.code}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-auto flex items-center justify-between border-t border-surface-100 bg-white px-3 py-2">
                                  <span className={cn("text-xs", isOutOfStock ? "text-red-600" : "text-surface-500")}>
                                    库存 <b className={cn("font-semibold", isOutOfStock ? "text-red-600" : "text-surface-800")}>{formatQuantity(material.stock)}</b> {material.unit || ""}
                                  </span>
                                  <span className="text-sm font-semibold tabular-nums text-red-600">
                                    {formatAmount(getMaterialOutboundPrice(material))}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="aux-orders-picker-empty flex h-full min-h-[360px] items-center justify-center">
                          <div className="text-center text-surface-400">
                            <span className="aux-orders-picker-empty-icon mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center">
                              <Search className="h-5 w-5" />
                            </span>
                            <p className="text-sm font-semibold text-surface-700">
                              {materialSearch || materialCategoryFilter !== "all" ? "没有找到匹配商品" : "当前仓库暂无可选商品"}
                            </p>
                            <p className="mt-1 text-xs">
                              {materialSearch || materialCategoryFilter !== "all" ? "换个关键词或分类试试" : "请先在材料库维护该仓库的辅材商品"}
                            </p>
                          </div>
                        </div>
                      )}
                    </main>

                    <aside className="aux-orders-picker-selection flex min-h-0 flex-col border-t border-surface-200 bg-white lg:border-l lg:border-t-0">
                      <div className="aux-orders-picker-selection-header border-b border-surface-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-surface-900">已选商品</p>
                          <span className="aux-orders-picker-selected-count inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">{form.items.length}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-surface-500">加入后可回到明细表修改数量和单价</p>
                      </div>
                      <div className="aux-orders-picker-selected-list min-h-0 flex-1 overflow-y-auto p-3">
                        {form.items.length > 0 ? (
                          <div className="space-y-2">
                            {form.items.map((line, index) => {
                              const material = data.materials.find((item) => item.id === line.material_id);
                              return (
                                <div key={`${line.material_id}-${index}`} className="aux-orders-picker-selected-item rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-surface-900" title={material?.name || ""}>{material?.name || "未知材料"}</p>
                                      <p className="mt-0.5 text-xs text-surface-500">
                                        {formatQuantity(Number(line.quantity || 0))} {material?.unit || ""} × {formatAmount(Number(line.unit_price || 0))}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeLine(index)}
                                      className="aux-orders-picker-remove shrink-0 p-1 text-surface-400 hover:bg-red-50 hover:text-red-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="aux-orders-picker-selection-empty flex h-full min-h-[220px] items-center justify-center text-center">
                            <div>
                              <span className="aux-orders-picker-selection-empty-icon mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center">
                                <ShoppingCart className="h-4 w-4" />
                              </span>
                              <p className="text-xs font-medium text-surface-500">点击商品加入订单</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="aux-orders-picker-footer border-t border-surface-200 bg-surface-50 px-4 py-3">
                        <div className="aux-orders-picker-total flex items-center justify-between text-sm">
                          <span className="text-surface-500">订单小计</span>
                          <span className="text-base font-semibold tabular-nums text-surface-900">{formatAmount(formTotalAmount)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMaterialPicker(false);
                            setImagePreview(null);
                          }}
                          className="aux-orders-picker-confirm btn-primary mt-3 w-full justify-center px-3 py-2 text-sm font-semibold"
                        >
                          完成选品
                        </button>
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedOrder && (
        <div className="aux-orders-overlay fixed inset-y-0 right-0 z-50 bg-surface-950/30 md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="flex h-full items-center justify-center p-4">
            <div className="aux-orders-detail aux-orders-detail-shell flex max-h-[92vh] w-full max-w-[1220px] flex-col overflow-hidden border border-surface-200 bg-surface-50">
              <div className="aux-orders-workspace-header aux-orders-detail-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="aux-orders-detail-heading-icon inline-flex h-10 w-10 shrink-0 items-center justify-center">
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-surface-900">{selectedOrder.order_no}</p>
                      <StatusBadge status={selectedOrder.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-surface-500">
                      {getSiteName(selectedOrder)}{selectedOrder.customer_name ? ` / ${selectedOrder.customer_name}` : ""} · {formatDateTime(selectedOrder.created_at || selectedOrder.order_date)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="aux-orders-detail-header-total hidden min-w-[132px] text-right sm:block">
                    <p className="text-xs font-medium text-surface-500">订单金额</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-surface-900">{formatAmount(selectedOrder.total_amount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => printOrder(selectedOrder, selectedOrderItems)}
                    className="aux-orders-detail-print inline-flex h-9 items-center gap-1.5 border border-surface-200 bg-white px-3 text-sm font-semibold text-surface-700 hover:border-primary-200 hover:text-primary-700"
                  >
                    <Printer className="h-4 w-4" />
                    <span className="aux-orders-detail-print-label">打印出库单</span>
                  </button>
                  <button type="button" onClick={() => {
                    setSelectedOrderId("");
                    setImagePreview(null);
                  }} className="aux-orders-icon-button flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900" aria-label="关闭订单详情">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="aux-orders-detail-body flex-1 space-y-4 overflow-y-auto p-5">
                <div className="aux-orders-detail-top-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <section className="aux-orders-section aux-orders-detail-summary overflow-hidden border border-surface-200 bg-white">
                    <div className="aux-orders-detail-section-header border-b border-surface-200 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-surface-900">订单概况</p>
                        <p className="mt-0.5 text-xs text-surface-500">客户、仓库与收货信息</p>
                      </div>
                    </div>
                    <div className="aux-orders-detail-info-grid grid md:grid-cols-3">
                      <InfoLine label="房号" value={getSiteName(selectedOrder)} />
                      <InfoLine label="服务门店" value={selectedOrder.service_store || "-"} />
                      <InfoLine label="客户姓名" value={selectedOrder.customer_name || "-"} />
                      <InfoLine label="手机号" value={selectedOrder.customer_phone || "-"} />
                      <InfoLine label="下单人" value={selectedOrder.created_by_name || "-"} />
                      <InfoLine label="下单人电话" value={selectedOrder.created_by_phone || "-"} />
                      <InfoLine label="下单仓库" value={selectedOrder.supplier_name || "未设置仓库"} />
                      <InfoLine label="下单时间" value={formatDateTime(selectedOrder.created_at || selectedOrder.order_date)} />
                      <InfoLine label="出库时间" value={formatDateTime(selectedOrder.received_at)} />
                      <InfoLine label="收货地址" value={getOrderReceiveAddress(selectedOrder)} span={3} />
                    </div>
                  </section>

                  <aside className="aux-orders-section aux-orders-outbound-panel overflow-hidden border border-surface-200 bg-white">
                    <div className="aux-orders-outbound-header flex items-center gap-3 border-b border-surface-200 px-4 py-3">
                      <span className="aux-orders-outbound-icon inline-flex h-9 w-9 shrink-0 items-center justify-center"><Truck className="h-4 w-4" /></span>
                      <div>
                        <p className="text-sm font-semibold text-surface-900">出库处理</p>
                        <p className="mt-0.5 text-xs text-surface-500">填写数量后确认本次出库</p>
                      </div>
                    </div>
                    <div className="aux-orders-outbound-content p-4">
                      <div className="aux-orders-outbound-progress">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-surface-500">出库进度</p>
                          <p className="mt-1 text-xl font-semibold text-surface-900">{getOrderReceiveRate(selectedOrder)}%</p>
                        </div>
                        <p className="text-sm tabular-nums text-surface-600">
                          {formatQuantity(selectedOutboundTotal)} / {formatQuantity(selectedOrder.total_quantity)}
                        </p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-100">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, getOrderReceiveRate(selectedOrder))}%` }} />
                      </div>
                      </div>
                      <div className="aux-orders-outbound-metrics mt-4 grid grid-cols-2 divide-x divide-surface-200 border-y border-surface-200 bg-surface-50">
                        <div className="px-3 py-2.5">
                          <p className="text-xs text-surface-500">本次待确认</p>
                          <p className="mt-1 text-base font-semibold tabular-nums text-primary-700">{formatQuantity(selectedPendingOutboundTotal)}</p>
                        </div>
                        <div className="px-3 py-2.5">
                          <p className="text-xs text-surface-500">已确认出库</p>
                          <p className="mt-1 text-base font-semibold tabular-nums text-emerald-700">{formatQuantity(selectedOutboundTotal)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => confirmOutbound(selectedOrder)}
                        disabled={saving || selectedPendingOutboundTotal <= 0 || normalizeOrderStatus(selectedOrder.status) === "CANCELLED"}
                        className="aux-orders-confirm-outbound btn-primary mt-4 w-full justify-center px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-surface-200 disabled:text-surface-500"
                      >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        确认出库
                      </button>
                      <div className="aux-orders-outbound-status mt-4 border-t border-surface-200 pt-4">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-surface-500">订单状态</span>
                          <SystemSelect
                            value={normalizeOrderStatus(selectedOrder.status)}
                            onChange={(event) => updateOrderStatus(selectedOrder, event.target.value)}
                            className="input-field min-h-10 py-2"
                            disabled={saving}
                          >
                            {statusOptions.filter(([value]) => value !== "RECEIVED" || normalizeOrderStatus(selectedOrder.status) === "RECEIVED").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </SystemSelect>
                        </label>
                        <div className="mt-3 flex items-center justify-between text-sm text-surface-600">
                          <span>结算状态</span>
                          <span className="font-semibold text-surface-900">{settlementStatusLabels[selectedOrder.settlement_status || "UNSETTLED"] || "-"}</span>
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>

                <section className="aux-orders-section aux-orders-detail-materials overflow-hidden border border-surface-300 bg-white">
                  <div className="aux-orders-detail-materials-header flex items-center justify-between border-b border-surface-300 bg-surface-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">材料明细</p>
                      <p className="mt-0.5 text-xs text-surface-500">填写本次出库数量，确认后才会扣减库存并生成出库流水</p>
                    </div>
                    <span className="text-xs font-semibold text-surface-500">共 {selectedOrderItems.length} 项</span>
                  </div>
                  <ThinScrollArea>
                    <table className="aux-orders-detail-table w-full min-w-[1040px] table-fixed text-sm">
                      <colgroup>
                        <col className="w-[84px]" />
                        <col />
                        <col className="w-[170px]" />
                        <col className="w-[76px]" />
                        <col className="w-[110px]" />
                        <col className="w-[120px]" />
                        <col className="w-[110px]" />
                        <col className="w-[120px]" />
                      </colgroup>
                      <thead className="bg-surface-50 text-xs font-semibold text-surface-700">
                        <tr className="border-b border-surface-300">
                          <th className="px-3 py-2.5 text-center">图片</th>
                          <th className="px-3 py-2.5 text-left">材料名称</th>
                          <th className="px-3 py-2.5 text-left">规格</th>
                          <th className="px-3 py-2.5 text-center">单位</th>
                          <th className="px-3 py-2.5 text-right">下单数量</th>
                          <th className="px-3 py-2.5 text-right">本次出库</th>
                          <th className="px-3 py-2.5 text-right">单价</th>
                          <th className="px-3 py-2.5 text-right">小计</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-200 bg-white">
                        {selectedOrderItems.map((item) => {
                          const quantity = Number(item.quantity || 0);
                          const deductedQty = Number(item.stock_deducted_qty || 0);
                          const remainingQty = Math.max(0, quantity - deductedQty);
                          const pendingInputQty = getCurrentOutboundQuantity(item, outboundInputs);
                          const image = getMaterialImage(item);
                          return (
                            <tr key={item.id} className="hover:bg-surface-50/80">
                              <td className="px-3 py-2.5 text-center align-middle">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                                  {image ? (
                                    <NativeImage
                                      src={image}
                                      alt={item.material_name || "材料图片"}
                                      className="h-full w-full cursor-zoom-in object-cover"
                                      onMouseEnter={(event) => showMaterialImagePreview(event, image, item)}
                                      onMouseMove={(event) => showMaterialImagePreview(event, image, item)}
                                      onMouseLeave={() => setImagePreview(null)}
                                    />
                                  ) : (
                                    <Package className="h-5 w-5 text-surface-300" />
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <span className="block truncate font-semibold text-surface-900" title={item.material_name || ""}>{item.material_name || "未知材料"}</span>
                                {item.material_code && <span className="mt-0.5 block truncate text-xs text-surface-400">{item.material_code}</span>}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-surface-600">
                                <span className="block truncate" title={getMaterialSpec(item)}>{getMaterialSpec(item) || "-"}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle text-surface-600">{item.material_unit || "-"}</td>
                              <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-surface-900">{formatQuantity(quantity)}</td>
                              <td className="px-3 py-2.5 text-right align-middle">
                                <input
                                  value={outboundInputs[item.id] ?? formatQuantity(pendingInputQty)}
                                  onChange={(event) => {
                                    setOutboundInputs((current) => ({
                                      ...current,
                                      [item.id]: normalizeNumberInput(event.target.value),
                                    }));
                                    setDirtyOutboundInputs((current) => ({ ...current, [item.id]: true }));
                                  }}
                                  onBlur={(event) => updateReceivedQty(item, event.target.value)}
                                  className="aux-orders-outbound-input h-9 w-20 border border-surface-300 bg-white px-2 text-right text-sm font-semibold tabular-nums text-emerald-700 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                                  inputMode="decimal"
                                  disabled={saving || selectedOrder.status === "CANCELLED"}
                                  title={`填写本次出库数量，最多可出 ${formatQuantity(remainingQty)}`}
                                />
                                {deductedQty > 0 && (
                                  <span className="mt-1 block text-[11px] font-medium text-surface-400">
                                    已出 {formatQuantity(deductedQty)}，余 {formatQuantity(remainingQty)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right align-middle tabular-nums text-surface-700">{formatAmount(item.unit_price)}</td>
                              <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums text-red-600">{formatAmount(item.total_price)}</td>
                            </tr>
                          );
                        })}
                        {selectedOrderItems.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-10 text-center text-sm text-surface-400">当前订单暂无材料明细</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ThinScrollArea>
                </section>

                {getOrderUserNotes(selectedOrder.notes) && (
                  <section className="aux-orders-section aux-orders-detail-note border border-surface-300 bg-white px-4 py-3 text-sm text-surface-700">
                    <p className="text-xs font-semibold text-surface-500">订单备注</p>
                    <p className="mt-1 whitespace-pre-wrap">{getOrderUserNotes(selectedOrder.notes)}</p>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {imagePreview && (
        <div
          className="pointer-events-none fixed z-[90] w-[240px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]"
          style={{
            left: Math.min(imagePreview.x + 18, (typeof window === "undefined" ? 1200 : window.innerWidth) - 260),
            top: Math.min(imagePreview.y + 18, (typeof window === "undefined" ? 900 : window.innerHeight) - 300),
          }}
        >
          <div className="aspect-square bg-surface-50">
            <NativeImage src={imagePreview.src} alt={imagePreview.name} className="h-full w-full object-contain" loading="eager" />
          </div>
          <div className="border-t border-surface-200 px-3 py-2">
            <p className="truncate text-xs font-semibold text-surface-900">{imagePreview.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium text-surface-500">{imagePreview.spec || "未填写规格"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
