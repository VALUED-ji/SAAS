// 报价合同列表页共享工具模块
// 存放列表页类型、常量与纯计算函数。

export const QUOTA_TEMPLATE_STORAGE_KEY = "zxgj_quota_templates";

import { toPricingAmount, type PackageQuoteConfigInput } from "@/lib/quotaTemplatePricing";
import { normalizeQuotaTemplateAutoScope, type QuotaTemplateAutoScope } from "@/lib/quotaTemplateScope";

export type QuotaTemplateSpaceQuota = {
  id: string;
  name: string;
  constructionDescription: string;
  unit: string;
  quoteScope: string;
  laborPrice: number;
  materialPrice: number;
  totalPrice: number;
};

export type QuotaTemplateSpace = {
  id: string;
  name: string;
  quotaItems: QuotaTemplateSpaceQuota[];
};

export type QuotaTemplateComprehensiveFee = {
  id: string;
  name: string;
  fee_calc_method: string;
  fee_calc_base: string;
  fee_rate: number;
  unit_price: number;
  remark: string;
};

export type QuotaTemplateQuoteConfig = PackageQuoteConfigInput & {
  areaTiers?: Array<{ minArea?: number; maxArea?: number; unitPrice?: number }>;
  combinedAreaTiers?: Array<{ minArea?: number; maxArea?: number; foundationUnitPrice?: number; materialUnitPrice?: number }>;
};

export type QuotaTemplateOption = {
  id: string;
  name: string;
  type?: string;
  remark?: string;
  status: string;
  createdByName?: string;
  autoScope?: QuotaTemplateAutoScope | null;
  constructionTemplateConfig?: {
    name: string;
    decorationType: string;
    durationText: string;
  };
  quoteConfig?: QuotaTemplateQuoteConfig;
  projectGroups?: Array<{ id: string; name: string }>;
  spaces: QuotaTemplateSpace[];
  comprehensiveFees: QuotaTemplateComprehensiveFee[];
  appendixNote?: string;
};

export function formatRecordAmount(value: number) {
  const amount = Number(value);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function getRecordAmount(record: any) {
  return Number(record?.final_amount ?? record?.total_amount ?? 0);
}

export function getRecordCostSummary(record: any) {
  const items = [
    { label: "基装", amount: Number(record?.base_amount || 0) },
    { label: "产品", amount: Number(record?.main_material_amount || 0) + Number(record?.custom_direct_amount || 0) },
    { label: "综合费用", amount: Number(record?.other_amount || 0), alwaysShow: true },
  ].filter((item) => Number.isFinite(item.amount) && (item.alwaysShow || Math.abs(item.amount) >= 0.01));

  return items.map((item) => `${item.label}${formatRecordAmount(item.amount)}`).join("、");
}

export function getSignedContractAmount(record: any) {
  return Number(record?.signed_contract_amount ?? 0);
}

export function isUsedBySignedContract(record: any) {
  return Number(record?.signed_quotation_contract_count || 0) > 0;
}

export function isSentToDesigner(record: any) {
  return String(record?.status || "").toUpperCase() === "SENT" || Number(record?.quotation_receipt_todo_count || 0) > 0;
}

export function formatRecordStatus(record: any) {
  if (isUsedBySignedContract(record)) return "已签合同";
  const status = String(record?.status || "").toUpperCase();
  if (status === "APPROVED") return "正式报价";
  if (isSentToDesigner(record)) return "已发送设计师";
  return "草稿报价";
}

export function hasSignedContract(record: any) {
  return Number(record?.signed_contract_count || 0) > 0;
}

export function formatContractStatus(record: any) {
  if (record?.is_unbound) return "未绑定客户";
  return hasSignedContract(record) ? "已签合同" : "未签合同";
}

export function getContractStatusClass(record: any) {
  if (record?.is_unbound) return "border-amber-200 bg-amber-50 text-amber-700";
  return hasSignedContract(record)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-surface-200 bg-surface-50 text-surface-600";
}

export function getRecordStatusClass(record: any) {
  if (isUsedBySignedContract(record)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  const status = String(record?.status || "").toUpperCase();
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (isSentToDesigner(record)) return "border-[#cfe0ff] bg-[#edf4ff] text-[#407aff]";
  return "border-surface-200 bg-surface-50 text-surface-600";
}

export function buildDefaultQuotationTitle(customer?: any) {
  const houseText = String(customer?.address || customer?.area || customer?.house_address || "").trim();
  return houseText ? `${houseText}装修报价单` : "装修报价单";
}

export function buildTemporaryQuotationTitle(customer?: any) {
  const houseText = String(customer?.address || "").trim();
  return houseText ? `${houseText}装修报价单` : "临时报价单";
}

export function toTemplateAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function sanitizeCreateAreaInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const firstDotIndex = cleaned.indexOf(".");
  const hasDecimal = firstDotIndex >= 0;
  const integerRaw = hasDecimal ? cleaned.slice(0, firstDotIndex) : cleaned;
  const decimalRaw = hasDecimal ? cleaned.slice(firstDotIndex + 1).replace(/\./g, "") : "";
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  return hasDecimal ? `${integer}.${decimalRaw}` : integer;
}

export function formatCreateAreaInput(value: unknown) {
  const amount = toPricingAmount(value);
  if (amount <= 0) return "";
  return Number.isInteger(amount) ? String(amount) : String(amount).replace(/\.?0+$/, "");
}

export function getCustomerAreaValue(customer: any) {
  return toPricingAmount(customer?.area_size ?? customer?.areaSize ?? customer?.area ?? 0);
}

export function normalizeTemplateScope(value: unknown) {
  const scope = String(value || "").trim();
  return scope || "foundation";
}

export function normalizeQuotaTemplate(value: any): QuotaTemplateOption | null {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim();
  if (!id || !name) return null;
  const spaces = Array.isArray(value.spaces)
    ? value.spaces.map((space: any, spaceIndex: number): QuotaTemplateSpace => ({
      id: String(space?.id || `space-${spaceIndex}`),
      name: String(space?.name || `空间${spaceIndex + 1}`).trim(),
      quotaItems: Array.isArray(space?.quotaItems)
        ? space.quotaItems.map((item: any, itemIndex: number): QuotaTemplateSpaceQuota => ({
          id: String(item?.id || `quota-${spaceIndex}-${itemIndex}`),
          name: String(item?.name || "").trim(),
          constructionDescription: String(item?.constructionDescription || "").trim(),
          unit: String(item?.unit || "").trim(),
          quoteScope: normalizeTemplateScope(item?.quoteScope),
          laborPrice: toTemplateAmount(item?.laborPrice),
          materialPrice: toTemplateAmount(item?.materialPrice),
          totalPrice: toTemplateAmount(item?.totalPrice ?? (toTemplateAmount(item?.laborPrice) + toTemplateAmount(item?.materialPrice))),
        })).filter((item: QuotaTemplateSpaceQuota) => item.name)
        : [],
    })).filter((space: QuotaTemplateSpace) => space.name)
    : [];
  const comprehensiveFees = Array.isArray(value.comprehensiveFees)
    ? value.comprehensiveFees.map((fee: any, feeIndex: number): QuotaTemplateComprehensiveFee => ({
      id: String(fee?.id || `fee-${feeIndex}`),
      name: String(fee?.name || "").trim(),
      fee_calc_method: String(fee?.fee_calc_method || "fixed"),
      fee_calc_base: String(fee?.fee_calc_base || ""),
      fee_rate: toTemplateAmount(fee?.fee_rate),
      unit_price: toTemplateAmount(fee?.unit_price),
      remark: String(fee?.remark || "").trim(),
    })).filter((fee: QuotaTemplateComprehensiveFee) => fee.name)
    : [];
  const projectGroups = Array.isArray(value.projectGroups)
    ? value.projectGroups
      .map((group: any) => ({
        id: String(group?.id || "").trim(),
        name: String(group?.name || "").trim(),
      }))
      .filter((group: { id: string; name: string }) => group.id && group.name)
    : [];
  const rawQuoteConfig = value.quoteConfig && typeof value.quoteConfig === "object" ? value.quoteConfig : null;
  const quoteConfig = rawQuoteConfig ? {
    mode: String(rawQuoteConfig.mode || ""),
    packageAmount: toTemplateAmount(rawQuoteConfig.packageAmount),
    includedArea: toTemplateAmount(rawQuoteConfig.includedArea),
    extraAreaPrice: toTemplateAmount(rawQuoteConfig.extraAreaPrice),
    packageTiers: Array.isArray(rawQuoteConfig.packageTiers)
      ? rawQuoteConfig.packageTiers.map((tier: any) => ({
        minArea: toTemplateAmount(tier?.minArea),
        maxArea: toTemplateAmount(tier?.maxArea),
        unitPrice: toTemplateAmount(tier?.unitPrice),
      }))
      : [],
    areaTiers: Array.isArray(rawQuoteConfig.areaTiers)
      ? rawQuoteConfig.areaTiers.map((tier: any) => ({
        minArea: toTemplateAmount(tier?.minArea),
        maxArea: toTemplateAmount(tier?.maxArea),
        unitPrice: toTemplateAmount(tier?.unitPrice),
      }))
      : [],
    combinedAreaTiers: Array.isArray(rawQuoteConfig.combinedAreaTiers)
      ? rawQuoteConfig.combinedAreaTiers.map((tier: any) => ({
        minArea: toTemplateAmount(tier?.minArea),
        maxArea: toTemplateAmount(tier?.maxArea),
        foundationUnitPrice: toTemplateAmount(tier?.foundationUnitPrice),
        materialUnitPrice: toTemplateAmount(tier?.materialUnitPrice),
      }))
      : [],
  } : undefined;
  return {
    id,
    name,
    type: String(value.type || "").trim(),
    remark: String(value.remark || "").trim(),
    status: String(value.status || "enabled"),
    createdByName: String(value.createdByName || value.created_by_name || value.creatorName || "").trim(),
    autoScope: normalizeQuotaTemplateAutoScope(value.autoScope || value.scope || value.accessScope),
    constructionTemplateConfig: value.constructionTemplateConfig && typeof value.constructionTemplateConfig === "object"
      ? {
        name: String(value.constructionTemplateConfig.name || "").trim(),
        decorationType: String(value.constructionTemplateConfig.decorationType || "").trim(),
        durationText: String(value.constructionTemplateConfig.durationText || "").trim(),
      }
      : undefined,
    quoteConfig,
    projectGroups,
    spaces,
    comprehensiveFees,
    appendixNote: String(value.appendixNote || value.quotationNote || "").trim(),
  };
}

export function loadQuotaTemplatesFromStorage() {
  if (typeof window === "undefined") return [] as QuotaTemplateOption[];
  try {
    const raw = window.localStorage.getItem(QUOTA_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeQuotaTemplate)
      .filter((template): template is QuotaTemplateOption => Boolean(template && template.status !== "disabled"));
  } catch {
    return [];
  }
}

export function getTemplateModeLabel(mode?: string | null) {
  if (mode === "list") return "清单报价模式";
  if (mode === "package") return "一口价模式";
  if (mode === "area") return "平方报价模式";
  if (mode === "foundation_material_area") return "基装+产品平方模式";
  return "未配置报价模式";
}

export function getTemplateStats(template?: QuotaTemplateOption | null) {
  if (!template) return { spaceCount: 0, itemCount: 0, feeCount: 0 };
  return {
    spaceCount: template.spaces.length,
    itemCount: template.spaces.reduce((total, space) => total + space.quotaItems.length, 0),
    feeCount: template.comprehensiveFees.length,
  };
}

export function normalizeRoomPart(value: string | null | undefined, suffixes: string[]) {
  const cleaned = value?.trim();
  if (!cleaned) return "";
  const suffix = suffixes.find((item) => cleaned.endsWith(item));
  return suffix ? cleaned.slice(0, -suffix.length) : cleaned;
}

export function buildQuotationRoomNumber(q: any) {
  if (q.customer_no_room_number === true || q.customer_no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(q.customer_building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(q.customer_unit_no, ["单元"]);
  const room = normalizeRoomPart(q.customer_room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

export function buildCustomerRoomNumber(customer: any) {
  if (customer?.no_room_number === true || customer?.no_room_number === 1) return "暂无房号";
  const building = normalizeRoomPart(customer?.building_no, ["号楼", "栋", "幢", "座"]);
  const unit = normalizeRoomPart(customer?.unit_no, ["单元"]);
  const room = normalizeRoomPart(customer?.room_no, ["室", "房", "号"]);
  return [building, unit, room].filter(Boolean).join("-");
}

export function getCustomerHouseText(customer: any) {
  const community = String(customer?.address || customer?.area || "").trim();
  const roomNumber = buildCustomerRoomNumber(customer);
  if (community && roomNumber && roomNumber !== "暂无房号") return `${community}${roomNumber}`;
  return community || String(customer?.house_address || "").trim() || "-";
}

export function getCustomerContactText(customer: any) {
  const phone = String(customer?.phone || "").trim();
  const weixin = String(customer?.weixin || "").trim();
  return phone || weixin || "-";
}
