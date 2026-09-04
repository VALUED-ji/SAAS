// 工地详情页格式化工具模块
// 从 page.tsx 渐进拆出的纯展示/格式化工具函数。

import { formatDateTime as formatBeijingDateTime } from "@/lib/utils";
import { formatPlainAmount } from "./site-detail-shared";
export function formatSignedPlainAmount(value: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) return formatPlainAmount(0);
  return `${amount > 0 ? "+" : "-"}${formatPlainAmount(Math.abs(amount))}`;
}

export function formatPlainQuantity(value: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

export function getMaterialOrderCategory(order: any) {
  const type = String(order?.order_type || "").toUpperCase();
  if (type === "MAIN_SUPPLIER") return "MAIN";
  if (type === "AUXILIARY_WAREHOUSE" || type === "AUXILIARY_MONTHLY") return "AUXILIARY";
  return "OTHER";
}

export function getMaterialOrderSupplierName(order: any) {
  const supplierName = String(order?.supplier_name || "").trim();
  if (supplierName) return supplierName;
  const type = String(order?.order_type || "").toUpperCase();
  if (type === "AUXILIARY_WAREHOUSE") return "未设置仓库";
  if (type === "AUXILIARY_MONTHLY") return "未设置月结供应商";
  if (type === "MAIN_SUPPLIER") return "未设置主材供应商";
  return "未设置供应方";
}

export function getSiteOrderReceiveAddress(site: any) {
  return String(site?.customer_house_address || site?.address || site?.customer_address || "").trim() || "-";
}

export function getMaterialSpecText(item: any) {
  return [
    item?.material_brand || item?.brand,
    item?.material_product_name || item?.product_name,
    item?.material_model,
    item?.material_color || item?.color,
    item?.material_spec || item?.spec,
  ].filter(Boolean).join(" / ");
}

export function getMaterialImageUrl(item: any) {
  const primaryImage = item?.material_image || item?.image;
  if (primaryImage) return String(primaryImage);
  const images = item?.material_images || item?.images;
  if (Array.isArray(images)) return String(images[0] || "");
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

export function getHandoverMessageClass(message: string) {
  if (message.includes("失败") || message.includes("请先")) return "bg-red-50 text-red-600";
  if (message.includes("提醒") || message.includes("尚未收齐")) return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}



export function getPaymentRecordReceivableAmount(record: any) {
  const amount = Number(record?.receivable_amount ?? record?.amount ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

export function getPaymentRecordRefundedAmount(record: any) {
  const refundedAmount = Number(record?.refunded_amount ?? 0);
  if (refundedAmount > 0) return Math.round(refundedAmount * 100) / 100;
  if (["refunded", "partial_refunded"].includes(String(record?.refund_status || ""))) {
    return Math.max(0, Math.round(Number(record?.refund_amount || 0) * 100) / 100);
  }
  return 0;
}

export function getPaymentRecordActualReceivedAmount(record: any) {
  if (record?.status !== "received") return 0;
  const amount = Number(record?.amount || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round((amount - getPaymentRecordRefundedAmount(record)) * 100) / 100);
}

export function getTeamMemberInitial(name: any) {
  const text = String(name || "未设置").trim();
  if (!text) return "未";
  const firstWord = text.split(/\s+/).filter(Boolean)[0] || text;
  return Array.from(firstWord)[0]?.toUpperCase() || "未";
}

export function getTeamDepartmentName(member: any) {
  return String(member?.org_unit_name || member?.department_name || member?.store_name || "未设置部门").trim();
}

export function makeQrCodeUrl(target: string, size = 280) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(target)}`;
}

export function formatShareExpiresAt(value?: string | null) {
  if (!value) return "永久有效";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "永久有效";
  return date
    .toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "-");
}

export function normalizeSiteRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = value?.trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

export function buildSiteCustomerRoomNumber(site: any) {
  if (!site) return "";
  if (site.customer_no_room_number === true || site.customer_no_room_number === 1) return "暂无房号";
  const building = normalizeSiteRoomPart(site.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeSiteRoomPart(site.customer_unit_no, ["单元"]);
  const room = normalizeSiteRoomPart(site.customer_room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

export function buildSiteFullRoomName(site: any) {
  if (!site) return "";
  const baseName = String(site.customer_address || site.address || site.site_name || site.display_name || site.name || "").trim();
  const roomNumber = buildSiteCustomerRoomNumber(site);
  if (roomNumber && roomNumber !== "暂无房号") {
    if (!baseName) return roomNumber;
    if (baseName.includes(roomNumber)) return baseName;
    return `${baseName}${roomNumber}`;
  }
  return baseName;
}

export function getSiteDisplayName(site: any) {
  return String(buildSiteFullRoomName(site) || site?.site_name || site?.display_name || site?.customer_address || site?.address || site?.name || "工地").trim();
}

export function getSiteAddress(site: any) {
  return String(site?.customer_address || site?.address || "").trim();
}

export function toSafeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "工地";
}

export function formatDateTime(value?: string | null) {
  return formatBeijingDateTime(value);
}

export function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getMaterialGroup(categoryName?: string | null, materialName?: string | null) {
  const text = `${categoryName || ""} ${materialName || ""}`;
  if (/辅材|水泥|沙|砂|腻子|防水|电线|线管|水管|胶|板材|龙骨|石膏|乳胶漆|油漆|螺丝|钉/.test(text)) return "AUXILIARY";
  if (/主材|瓷砖|地砖|墙砖|地板|木门|门窗|洁具|卫浴|橱柜|柜|灯|开关|插座|五金|台面|石材/.test(text)) return "MAIN_MATERIAL";
  if (/设备|电器|空调|新风|地暖|暖通|净水|热水器|智能|中央/.test(text)) return "EQUIPMENT";
  return "OTHER";
}
