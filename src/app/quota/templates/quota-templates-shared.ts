// 定额模板页共享工具模块
// 存放页面主体使用的类型、常量与纯计算函数。

import {
  formatAlphaSequence,
} from "@/lib/quotationSequence";
import {
  normalizeFeeCalcBase,
  normalizeFeeCalcMethod,
  toNumber,
  type FeeCalcBase,
  type FeeCalcMethod,
  type FeeFormulaContext,
  type FormulaFeeItem,
} from "@/lib/quotationFeeFormulas";
import {
  normalizeQuotaTemplateAutoScope,
  type QuotaTemplateAutoScope,
} from "@/lib/quotaTemplateScope";
export type QuoteType = "半包" | "全包" | "清包";
export type PricingMode = "package" | "area" | "foundation_material_area" | "list";
export type TemplateStatus = "enabled" | "disabled";
export type ItemDropPosition = "before" | "after";
export type TemplateSpaceQuotaScope = string;
export type QuotaPickerTarget = {
  spaceId: string;
  quoteScope: TemplateSpaceQuotaScope;
  quotaItemId?: string;
} | null;

export type DragOverQuotaState = {
  id: string;
  position: ItemDropPosition;
} | null;

export type DragOverSpaceState = {
  id: string;
  position: ItemDropPosition;
} | null;

export type DragOverProjectGroupState = {
  id: string;
  position: ItemDropPosition;
} | null;

export type DragOverFeeState = {
  id: string;
  position: ItemDropPosition;
} | null;

export type PointerQuotaDragState = {
  spaceId: string;
  quotaItemId: string;
  quoteScope: TemplateSpaceQuotaScope;
  startX: number;
  startY: number;
  moved: boolean;
  targetQuotaId: string | null;
  position: ItemDropPosition;
} | null;

export type PointerFeeDragState = {
  feeId: string;
  startX: number;
  startY: number;
  moved: boolean;
  targetFeeId: string | null;
  position: ItemDropPosition;
} | null;

export type PointerProjectGroupDragState = {
  sourceId: string;
  startX: number;
  startY: number;
  moved: boolean;
  targetId: string | null;
  position: ItemDropPosition;
} | null;

export type PackagePricingTier = {
  id: string;
  minArea: number;
  maxArea: number;
  unitPrice: number;
};

export type CombinedAreaPricingTier = {
  id: string;
  minArea: number;
  maxArea: number;
  foundationUnitPrice: number;
  materialUnitPrice: number;
};

export type TemplateComprehensiveFee = {
  id: string;
  name: string;
  fee_calc_method: FeeCalcMethod;
  fee_calc_base: FeeCalcBase;
  fee_rate: number;
  unit_price: number;
  remark: string;
};

export type QuoteConfig = {
  mode: PricingMode;
  packageAmount: number;
  includedArea: number;
  extraAreaPrice: number;
  packageTiers: PackagePricingTier[];
  areaTiers: PackagePricingTier[];
  areaUnitPrice: number;
  foundationUnitPrice: number;
  materialUnitPrice: number;
  combinedAreaTiers: CombinedAreaPricingTier[];
  minChargeAmount: number;
  calculationNote: string;
};

export type TemplateSpaceQuota = {
  id: string;
  quotaId: string;
  code: string;
  category: string;
  name: string;
  constructionDescription: string;
  unit: string;
  quoteScope: TemplateSpaceQuotaScope;
  laborPrice: number;
  materialPrice: number;
  totalPrice: number;
  isSpecialPrice: boolean;
};

export type TemplateSpace = {
  id: string;
  name: string;
  projectGroupIds?: TemplateSpaceQuotaScope[];
  quotaItems: TemplateSpaceQuota[];
};

export type TemplateProjectGroup = {
  id: string;
  name: string;
};

export type ConstructionTemplateConfig = {
  id: string;
  name: string;
  description: string;
  decorationType: string;
  stageCount: number;
  nodeCount: number;
  acceptanceCount: number;
  durationText: string;
  remark: string;
};

export type ConstructionTemplateOption = ConstructionTemplateConfig & {
  isDefault: boolean;
};

export type QuotaTemplate = {
  id: string;
  name: string;
  type: QuoteType;
  remark: string;
  status: TemplateStatus;
  createdByName: string;
  autoScope: QuotaTemplateAutoScope | null;
  constructionTemplateConfig: ConstructionTemplateConfig;
  quoteConfig: QuoteConfig;
  projectGroups: TemplateProjectGroup[];
  comprehensiveFees: TemplateComprehensiveFee[];
  appendixNote: string;
  spaces: TemplateSpace[];
  updatedAt: string;
};

export type QuotaLibraryItem = {
  id: string;
  code: string;
  category: string;
  name: string;
  constructionDescription: string;
  unit: string;
  laborPrice: number;
  materialPrice: number;
  totalPrice: number;
  isSpecialPrice: boolean;
  status?: string;
};

export type CustomQuotaDraft = {
  name: string;
  unit: string;
  laborPrice: number;
  materialPrice: number;
  totalPrice: number;
  constructionDescription: string;
  isSpecialPrice: boolean;
};

export const QUOTA_TEMPLATE_STORAGE_KEY = "zxgj_quota_templates";
export const QUOTA_LIBRARY_STORAGE_KEY = "zxgj_quota_library_items";
export const QUOTA_TEMPLATE_DRAFT_STORAGE_KEY = "zxgj_quota_template_draft";
export const DEFAULT_TEMPLATE_CREATOR = "系统管理员";
export const CUSTOM_QUOTA_NUMBER_INPUT_KEYS = ["customQuota.laborPrice", "customQuota.materialPrice", "customQuota.totalPrice"];
export const BUILTIN_PROJECT_GROUPS: TemplateProjectGroup[] = [
  { id: "foundation", name: "基装" },
  { id: "main_material", name: "产品" },
  { id: "custom_cabinet", name: "定制柜" },
];
export const quoteTypes: QuoteType[] = ["半包", "全包", "清包"];
export type TemplateEditMode = "create" | "edit";
export type SpaceAutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "draft" | "error";
export const pricingModeOptions: Array<{ value: PricingMode; label: string; description: string }> = [
  { value: "list", label: "清单报价模式", description: "按空间中配置的报价项目逐项累计，适合明细清单报价。" },
  { value: "package", label: "一口价模式", description: "固定套餐价，限制面积，超出部分按每平方加价。" },
  { value: "area", label: "平方报价模式", description: "按面积区间配置每平方单价，适合阶梯平方报价。" },
  { value: "foundation_material_area", label: "基装+主材平方模式", description: "基装和主材分别按面积计价，系统自动汇总每平方合计价。" },
];

export function getPricingModeLabel(mode: PricingMode) {
  return pricingModeOptions.find((option) => option.value === mode)?.label || "";
}

export function normalizeTemplateStatus(value: unknown): TemplateStatus {
  return value === "disabled" ? "disabled" : "enabled";
}

export function getTemplateStatusLabel(status: TemplateStatus) {
  return status === "disabled" ? "停用" : "启用";
}

export function getTemplateStatusBadgeClass(status: TemplateStatus) {
  return status === "disabled"
    ? "quota-status-tag quota-status-tag-disabled border-surface-200 bg-surface-100 text-surface-600"
    : "quota-status-tag quota-status-tag-enabled border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeComprehensiveFeeItem(partial?: Partial<TemplateComprehensiveFee>): TemplateComprehensiveFee {
  return {
    id: `fee-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    fee_calc_method: "fixed",
    fee_calc_base: "",
    fee_rate: 0,
    unit_price: 0,
    remark: "",
    ...(partial || {}),
  };
}

export function makeDefaultComprehensiveFees() {
  return [
    makeComprehensiveFeeItem({
      name: "管理费",
      fee_calc_method: "percent",
      fee_calc_base: "直接费",
      fee_rate: 10,
      remark: "按工程直接费比例计取",
    }),
  ];
}

export function isDefaultComprehensiveFeesOnly(value: TemplateComprehensiveFee[]) {
  if (value.length !== 1) return false;
  const fee = value[0];
  return fee.name.trim() === "管理费"
    && normalizeFeeCalcMethod(fee.fee_calc_method) === "percent"
    && (normalizeFeeCalcBase(fee.fee_calc_base) || "直接费") === "直接费"
    && toAmount(fee.fee_rate) === 10
    && toAmount(fee.unit_price) === 0
    && fee.remark.trim() === "按工程直接费比例计取";
}

export function normalizeComprehensiveFees(value: any, useDefault = false): TemplateComprehensiveFee[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const method = normalizeFeeCalcMethod(item?.fee_calc_method);
      const hasFeeCalcBase = Object.prototype.hasOwnProperty.call(item || {}, "fee_calc_base");
      return makeComprehensiveFeeItem({
        id: String(item?.id || `fee-${Date.now()}-${index}`),
        name: String(item?.name || ""),
        fee_calc_method: method,
        fee_calc_base: method === "fixed" ? "" : hasFeeCalcBase ? normalizeFeeCalcBase(item?.fee_calc_base) : "直接费",
        fee_rate: method === "percent" ? toAmount(item?.fee_rate) : 0,
        unit_price: method === "fixed" ? toAmount(item?.unit_price) : 0,
        remark: String(item?.remark || ""),
      });
    });
  }
  return useDefault ? makeDefaultComprehensiveFees() : [];
}

export function getComprehensiveFeeMethodPatch(method: FeeCalcMethod, item: TemplateComprehensiveFee): Partial<TemplateComprehensiveFee> {
  if (method === "fixed") {
    return { fee_calc_method: "fixed", fee_calc_base: "", fee_rate: 0 };
  }
  const feeCalcBase = normalizeFeeCalcBase(item.fee_calc_base) || "直接费";
  if (method === "reference") {
    return { fee_calc_method: "reference", fee_calc_base: feeCalcBase, fee_rate: 0, unit_price: 0 };
  }
  return { fee_calc_method: "percent", fee_calc_base: feeCalcBase, fee_rate: toNumber(item.fee_rate), unit_price: 0 };
}

export function buildTemplateFeeSequenceById(fees: TemplateComprehensiveFee[]) {
  const sequenceById = new Map<string, string>();
  fees.forEach((fee, index) => {
    sequenceById.set(fee.id, formatAlphaSequence(index));
  });
  return sequenceById;
}

export function buildTemplateFeeSequenceRemap(beforeFees: TemplateComprehensiveFee[], afterFees: TemplateComprehensiveFee[]) {
  const beforeSequenceById = buildTemplateFeeSequenceById(beforeFees);
  const afterSequenceById = buildTemplateFeeSequenceById(afterFees);
  const remap: Record<string, string> = {};
  beforeSequenceById.forEach((oldSequence, feeId) => {
    const nextSequence = afterSequenceById.get(feeId);
    if (nextSequence && nextSequence !== oldSequence) remap[oldSequence] = nextSequence;
  });
  return remap;
}

export function replaceFeeSequenceReferences(value: unknown, sequenceRemap: Record<string, string>) {
  const text = String(value || "").trim();
  const sequences = Object.keys(sequenceRemap).sort((a, b) => b.length - a.length);
  if (!text || sequences.length === 0) return text;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${sequences.map(escapeRegExp).join("|")})(?=$|[^A-Za-z0-9_])`, "gi");
  return text.replace(pattern, (_match, prefix: string, sequence: string) => `${prefix}${sequenceRemap[String(sequence).toUpperCase()] || sequence}`);
}

export function remapTemplateFeeReferences(beforeFees: TemplateComprehensiveFee[], afterFees: TemplateComprehensiveFee[]) {
  const sequenceRemap = buildTemplateFeeSequenceRemap(beforeFees, afterFees);
  if (Object.keys(sequenceRemap).length === 0) return afterFees;
  return afterFees.map((fee) => {
    if (!fee.fee_calc_base) return fee;
    const nextFeeCalcBase = replaceFeeSequenceReferences(fee.fee_calc_base, sequenceRemap);
    return nextFeeCalcBase === fee.fee_calc_base ? fee : { ...fee, fee_calc_base: nextFeeCalcBase as FeeCalcBase };
  });
}

export function formatFeeFormulaPreview(calcBase: string) {
  const formula = normalizeFeeCalcBase(calcBase);
  if (!formula) return "";
  const compactFormula = formula.replace(/\s+/g, "");
  const alreadyWrapped = (compactFormula.startsWith("(") && compactFormula.endsWith(")"))
    || (compactFormula.startsWith("（") && compactFormula.endsWith("）"));
  const hasOperator = /[+\-*/×÷]/.test(compactFormula);
  return hasOperator && !alreadyWrapped ? `(${formula})` : formula;
}

export function getTemplateFeeRulePreview(item: TemplateComprehensiveFee) {
  const method = normalizeFeeCalcMethod(item.fee_calc_method);
  if (method === "fixed") return `固定金额 ${formatAmount(item.unit_price)} 元`;
  const calcBase = normalizeFeeCalcBase(item.fee_calc_base);
  if (!calcBase) return "待填写基础公式";
  const formulaText = formatFeeFormulaPreview(calcBase);
  if (method === "reference") return `引用 ${formulaText} 金额`;
  return `${formulaText} × ${formatAmount(item.fee_rate)}%`;
}

export const initialTemplates: QuotaTemplate[] = [];
export const legacySampleTemplateNames = new Set([
  "番禺店标准半包基础模板",
  "新塘店精装全包模板",
  "老房翻新快速报价模板",
  "出租房简装清包模板",
]);

export function todayText() {
  return new Date().toISOString().slice(0, 10);
}

export function makePackagePricingTier(partial?: Partial<PackagePricingTier>): PackagePricingTier {
  return {
    id: `pkg-tier-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    minArea: 0,
    maxArea: 0,
    unitPrice: 0,
    ...(partial || {}),
  };
}

export function makeCombinedAreaPricingTier(partial?: Partial<CombinedAreaPricingTier>): CombinedAreaPricingTier {
  return {
    id: `combined-area-tier-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    minArea: 0,
    maxArea: 0,
    foundationUnitPrice: 0,
    materialUnitPrice: 0,
    ...(partial || {}),
  };
}

export function normalizePackagePricingTiers(value: any, fallback?: { includedArea?: number; extraAreaPrice?: number }) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((tier, index) => makePackagePricingTier({
      id: String(tier?.id || `pkg-tier-${Date.now()}-${index}`),
      minArea: index === 0 && fallback?.includedArea !== undefined ? toAmount(fallback.includedArea) : toAmount(tier?.minArea),
      maxArea: toAmount(tier?.maxArea),
      unitPrice: toAmount(tier?.unitPrice),
    }));
  }
  return [makePackagePricingTier({
    minArea: toAmount(fallback?.includedArea),
    maxArea: toAmount(fallback?.includedArea),
    unitPrice: toAmount(fallback?.extraAreaPrice),
  })];
}

export function normalizeAreaPricingTiers(value: any, fallback?: { areaUnitPrice?: number }) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((tier, index) => makePackagePricingTier({
      id: String(tier?.id || `area-tier-${Date.now()}-${index}`),
      minArea: index === 0 ? 0 : toAmount(tier?.minArea),
      maxArea: toAmount(tier?.maxArea),
      unitPrice: toAmount(tier?.unitPrice),
    }));
  }
  return [makePackagePricingTier({
    minArea: 0,
    maxArea: 0,
    unitPrice: toAmount(fallback?.areaUnitPrice),
  })];
}

export function normalizeCombinedAreaPricingTiers(value: any, fallback?: { foundationUnitPrice?: number; materialUnitPrice?: number }) {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((tier, index) => makeCombinedAreaPricingTier({
      id: String(tier?.id || `combined-area-tier-${Date.now()}-${index}`),
      minArea: index === 0 ? 0 : toAmount(tier?.minArea),
      maxArea: toAmount(tier?.maxArea),
      foundationUnitPrice: toAmount(tier?.foundationUnitPrice),
      materialUnitPrice: toAmount(tier?.materialUnitPrice),
    }));
  }
  return [makeCombinedAreaPricingTier({
    minArea: 0,
    maxArea: 0,
    foundationUnitPrice: toAmount(fallback?.foundationUnitPrice),
    materialUnitPrice: toAmount(fallback?.materialUnitPrice),
  })];
}

export function makeDefaultQuoteConfig(partial?: Partial<QuoteConfig>): QuoteConfig {
  const mode: PricingMode = partial?.mode === "area" || partial?.mode === "list" || partial?.mode === "foundation_material_area" ? partial.mode : "package";
  const includedArea = toAmount(partial?.includedArea ?? 100);
  const extraAreaPrice = toAmount(partial?.extraAreaPrice ?? 800);
  const areaUnitPrice = toAmount(partial?.areaUnitPrice ?? 1000);
  const foundationUnitPrice = toAmount(partial?.foundationUnitPrice ?? 899);
  const materialUnitPrice = toAmount(partial?.materialUnitPrice ?? 599);
  return {
    packageAmount: 100000,
    areaUnitPrice,
    foundationUnitPrice,
    materialUnitPrice,
    minChargeAmount: 0,
    calculationNote: "",
    ...(partial || {}),
    includedArea,
    extraAreaPrice,
    packageTiers: normalizePackagePricingTiers(partial?.packageTiers, { includedArea, extraAreaPrice }),
    areaTiers: normalizeAreaPricingTiers(partial?.areaTiers, { areaUnitPrice }),
    combinedAreaTiers: normalizeCombinedAreaPricingTiers(partial?.combinedAreaTiers, { foundationUnitPrice, materialUnitPrice }),
    mode,
  };
}

export function formatAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, useGrouping: false }).format(Number(value || 0));
}

export function sanitizeTemplateNumberInputText(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const firstDotIndex = cleaned.indexOf(".");
  const hasDecimal = firstDotIndex >= 0;
  const integerRaw = hasDecimal ? cleaned.slice(0, firstDotIndex) : cleaned;
  const decimalRaw = hasDecimal ? cleaned.slice(firstDotIndex + 1).replace(/\./g, "") : "";
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  return hasDecimal ? `${integer}.${decimalRaw}` : integer;
}

export function toTemplateNumberInputAmount(value: string) {
  if (!value || value === ".") return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function formatTemplateNumberInputValue(value: number) {
  return String(toAmount(value));
}

export function isBuiltinProjectGroup(scope: TemplateSpaceQuotaScope) {
  return BUILTIN_PROJECT_GROUPS.some((group) => group.id === scope);
}

export function makeProjectGroupId() {
  return `custom_group_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function normalizeProjectGroupName(value: unknown) {
  return String(value || "").trim();
}

export function formatNewProjectGroupName(value: unknown) {
  return normalizeProjectGroupName(value);
}

export function makeProjectGroup(name: string): TemplateProjectGroup {
  return {
    id: makeProjectGroupId(),
    name: formatNewProjectGroupName(name) || "自定义",
  };
}

export function normalizeProjectGroup(value: any, index: number): TemplateProjectGroup | null {
  const id = String(value?.id || `custom_group_${index}`).trim();
  const name = normalizeProjectGroupName(value?.name);
  if (!id || !name) return null;
  return { id, name };
}

export function getProjectGroupName(groups: TemplateProjectGroup[], scope: TemplateSpaceQuotaScope) {
  return groups.find((group) => group.id === scope)?.name || scope;
}

export function normalizeProjectGroupComparableName(value: unknown) {
  return normalizeProjectGroupName(value).replace(/项目$/, "");
}

export function uniqueProjectGroupIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function getSpaceProjectGroupIds(space: TemplateSpace | null | undefined, groups: TemplateProjectGroup[]) {
  if (!space) return [] as TemplateSpaceQuotaScope[];
  const explicitIds = uniqueProjectGroupIds(space.projectGroupIds || []);
  const itemIds = uniqueProjectGroupIds(space.quotaItems.map((item) => normalizeQuotaScope(item.quoteScope)));
  if (explicitIds.length) return uniqueProjectGroupIds([...explicitIds, ...itemIds]);
  const orderedItemIds = groups.map((group) => group.id).filter((id) => itemIds.includes(id));
  return uniqueProjectGroupIds([...orderedItemIds, ...itemIds]);
}

export function getSpaceProjectGroups(space: TemplateSpace | null | undefined, groups: TemplateProjectGroup[]) {
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  return getSpaceProjectGroupIds(space, groups).map((id) => groupMap.get(id) || { id, name: id });
}

export function withSpaceProjectGroup(space: TemplateSpace, groupId: TemplateSpaceQuotaScope) {
  return {
    ...space,
    projectGroupIds: uniqueProjectGroupIds([...(space.projectGroupIds || []), groupId]),
  };
}

export function getProjectGroupAddText(groups: TemplateProjectGroup[], scope: TemplateSpaceQuotaScope) {
  const name = getProjectGroupName(groups, scope);
  return `添加${name.replace(/项目$/, "")}项目`;
}

export function getProjectGroupEmptyText(groups: TemplateProjectGroup[], scope: TemplateSpaceQuotaScope) {
  const name = getProjectGroupName(groups, scope);
  return `该空间暂无${name}`;
}

export function getTemplateFeeFormulaExamples(groups: TemplateProjectGroup[]) {
  const examples: string[] = [];
  const addExample = (value: unknown) => {
    const text = normalizeProjectGroupName(value);
    if (!text || examples.includes(text)) return;
    examples.push(text);
  };
  addExample("直接费");
  addExample("材料费");
  addExample("人工费");
  groups.forEach((group) => {
    const name = normalizeProjectGroupName(group.name);
    if (!name) return;
    addExample(name);
  });
  return examples.slice(0, 7);
}

export function getTemplateFeeFormulaPlaceholder(groups: TemplateProjectGroup[]) {
  const customGroup = groups.find((group) => {
    const name = normalizeProjectGroupName(group.name);
    return name && !isBuiltinProjectGroup(group.id);
  });
  return `如 材料费、人工费、${customGroup?.name || "直接费"} 或 A+B`;
}

export function buildTemplateFeeFormulaContext(groups: TemplateProjectGroup[]): FeeFormulaContext {
  const categoryAmounts: Record<string, number> = {};
  groups.forEach((group) => {
    const name = normalizeProjectGroupName(group.name);
    if (name) categoryAmounts[name] = 0;
  });
  return {
    mainMaterialAmount: 0,
    directItemAmount: 0,
    laborAmount: 0,
    materialCostAmount: 0,
    categoryAmounts,
  };
}

export function buildTemplateFormulaFeeItems(fees: TemplateComprehensiveFee[]): FormulaFeeItem[] {
  return fees.map((fee) => ({
    category: "other",
    name: fee.name,
    quantity: 1,
    unit_price: fee.unit_price,
    total_price: fee.unit_price,
    fee_calc_method: fee.fee_calc_method,
    fee_calc_base: fee.fee_calc_base,
    fee_rate: fee.fee_rate,
  }));
}

export function getPackageTierLabel(index: number) {
  const labels = ["第一阶梯", "第二阶梯", "第三阶梯", "第四阶梯", "第五阶梯"];
  return labels[index] || `第${index + 1}阶梯`;
}

export function getPackageTierStartArea(config: QuoteConfig, index: number) {
  if (index <= 0) return toAmount(config.includedArea);
  return toAmount(config.packageTiers[index - 1]?.maxArea);
}

export function getAreaTierStartArea(config: QuoteConfig, index: number) {
  if (index <= 0) return 0;
  return toAmount(config.areaTiers[index - 1]?.maxArea);
}

export function getCombinedAreaTierStartArea(config: QuoteConfig, index: number) {
  if (index <= 0) return 0;
  return toAmount(config.combinedAreaTiers[index - 1]?.maxArea);
}

export function getCombinedAreaTierTotalPrice(tier: CombinedAreaPricingTier) {
  return toAmount(tier.foundationUnitPrice) + toAmount(tier.materialUnitPrice);
}

export function makeSpace(name = ""): TemplateSpace {
  return {
    id: `space-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    projectGroupIds: [],
    quotaItems: [],
  };
}

export function getNextSpaceCopyName(source: string, spaces: TemplateSpace[]) {
  const sourceName = normalizeProjectGroupName(source) || "空间";
  const baseName = `${sourceName} 副本`;
  const names = new Set(spaces.map((space) => normalizeProjectGroupName(space.name)).filter(Boolean));
  if (!names.has(baseName)) return baseName;
  let count = 2;
  while (names.has(`${baseName}${count}`)) count += 1;
  return `${baseName}${count}`;
}

export function makeSpaceCopy(source: TemplateSpace, spaces: TemplateSpace[]): TemplateSpace {
  const timestamp = Date.now();
  return {
    ...source,
    id: `space-copy-${timestamp}-${Math.random().toString(16).slice(2)}`,
    name: getNextSpaceCopyName(source.name, spaces),
    quotaItems: source.quotaItems.map((item, itemIndex) => ({
      ...item,
      id: `space-quota-copy-${timestamp}-${itemIndex}-${Math.random().toString(16).slice(2)}`,
    })),
  };
}

export function makeSpaceQuotaItem(partial?: Partial<TemplateSpaceQuota>): TemplateSpaceQuota {
  return {
    id: `space-quota-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    quotaId: "",
    code: "",
    category: "",
    name: "",
    constructionDescription: "",
    unit: "",
    quoteScope: "foundation",
    laborPrice: 0,
    materialPrice: 0,
    totalPrice: 0,
    isSpecialPrice: false,
    ...(partial || {}),
  };
}

export function makeCustomQuotaDraft(): CustomQuotaDraft {
  return {
    name: "",
    unit: "",
    laborPrice: 0,
    materialPrice: 0,
    totalPrice: 0,
    constructionDescription: "",
    isSpecialPrice: false,
  };
}

export function toAmount(value: any) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function normalizeQuotaScope(value: any, fallbackText = ""): TemplateSpaceQuotaScope {
  const scope = String(value || "").trim();
  if (scope) return scope;
  if (/定制柜|橱柜|衣柜|玄关柜|阳台柜|浴室柜|柜门|柜体/.test(fallbackText)) return "custom_cabinet";
  return /主材|产品|瓷砖|地板|木门|卫浴|洁具|灯具|五金|墙布|墙纸|石材/.test(fallbackText) ? "main_material" : "foundation";
}

export function makeQuotaItemFromLibrary(quota: QuotaLibraryItem, quoteScope?: TemplateSpaceQuotaScope): TemplateSpaceQuota {
  return makeSpaceQuotaItem({
    quotaId: quota.id,
    code: quota.code,
    category: quota.category,
    name: quota.name,
    constructionDescription: quota.constructionDescription,
    unit: quota.unit,
    quoteScope: quoteScope || normalizeQuotaScope("", `${quota.category}${quota.name}${quota.constructionDescription}`),
    laborPrice: quota.laborPrice,
    materialPrice: quota.materialPrice,
    totalPrice: quota.totalPrice,
    isSpecialPrice: quota.isSpecialPrice,
  });
}

export function normalizeSpaceQuotaItem(value: any, index: number): TemplateSpaceQuota {
  return {
    id: String(value?.id || `space-quota-${Date.now()}-${index}`),
    quotaId: String(value?.quotaId || value?.quota_id || ""),
    code: String(value?.code || ""),
    category: String(value?.category || ""),
    name: String(value?.name || value?.quotaName || ""),
    constructionDescription: String(value?.constructionDescription || value?.description || ""),
    unit: String(value?.unit || ""),
    quoteScope: normalizeQuotaScope(value?.quoteScope, `${value?.category || ""}${value?.name || value?.quotaName || ""}${value?.constructionDescription || value?.description || ""}`),
    laborPrice: toAmount(value?.laborPrice),
    materialPrice: toAmount(value?.materialPrice),
    totalPrice: toAmount(value?.totalPrice ?? (toAmount(value?.laborPrice) + toAmount(value?.materialPrice))),
    isSpecialPrice: Boolean(value?.isSpecialPrice),
  };
}

export function normalizeSpace(value: any, index: number): TemplateSpace {
  return {
    id: String(value?.id || `space-${Date.now()}-${index}`),
    name: String(value?.name || `空间${index + 1}`),
    projectGroupIds: Array.isArray(value?.projectGroupIds) ? uniqueProjectGroupIds(value.projectGroupIds) : undefined,
    quotaItems: Array.isArray(value?.quotaItems) ? value.quotaItems.map(normalizeSpaceQuotaItem) : [],
  };
}

export function normalizeTemplateProjectGroups(value: any, spaces: TemplateSpace[]) {
  const fromConfig = Array.isArray(value)
    ? value.map(normalizeProjectGroup).filter((group): group is TemplateProjectGroup => Boolean(group))
    : [];
  const explicitScopes = spaces
    .flatMap((space) => space.projectGroupIds || [])
    .map((scope) => normalizeQuotaScope(scope))
    .filter(Boolean);
  const itemScopes = spaces
    .flatMap((space) => space.quotaItems.map((item) => normalizeQuotaScope(item.quoteScope)))
    .filter(Boolean);
  const allScopes = uniqueProjectGroupIds([...explicitScopes, ...itemScopes]);
  const customScopes = allScopes.filter((scope) => !isBuiltinProjectGroup(scope));
  const usedBuiltinGroups = BUILTIN_PROJECT_GROUPS.filter((group) => allScopes.includes(group.id));
  const byId = new Map<string, TemplateProjectGroup>();
  const orderedGroups: TemplateProjectGroup[] = [];
  const addGroup = (group: TemplateProjectGroup) => {
    if (!group.id || byId.has(group.id)) return;
    const builtinGroup = BUILTIN_PROJECT_GROUPS.find((item) => item.id === group.id);
    const nextGroup = builtinGroup || group;
    byId.set(nextGroup.id, nextGroup);
    orderedGroups.push(nextGroup);
  };
  fromConfig.forEach(addGroup);
  usedBuiltinGroups.forEach(addGroup);
  customScopes.forEach((scope) => {
    addGroup({ id: scope, name: scope });
  });
  return orderedGroups;
}

export function getTemplateProjectGroups(template: Pick<QuotaTemplate, "projectGroups" | "spaces"> | null | undefined) {
  if (!template) return [];
  return normalizeTemplateProjectGroups(template.projectGroups, template.spaces);
}

export function toSafeCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export function makeDefaultConstructionTemplateConfig(partial?: Partial<ConstructionTemplateConfig> & Record<string, any>): ConstructionTemplateConfig {
  return {
    id: String(partial?.id || partial?.templateId || ""),
    name: String(partial?.name || ""),
    description: String(partial?.description || ""),
    decorationType: String(partial?.decorationType || ""),
    stageCount: toSafeCount(partial?.stageCount ?? partial?.stage_count),
    nodeCount: toSafeCount(partial?.nodeCount ?? partial?.node_count),
    acceptanceCount: toSafeCount(partial?.acceptanceCount ?? partial?.acceptance_count),
    durationText: String(partial?.durationText || partial?.duration_text || ""),
    remark: String(partial?.remark || ""),
  };
}

export function normalizeConstructionTemplateOption(value: any): ConstructionTemplateOption | null {
  if (!value || typeof value !== "object") return null;
  const config = makeDefaultConstructionTemplateConfig(value);
  if (!config.id || !config.name) return null;
  return {
    ...config,
    isDefault: value.isDefault === true,
  };
}

export function loadQuotaLibraryItems() {
  if (typeof window === "undefined") return [] as QuotaLibraryItem[];
  try {
    const raw = window.localStorage.getItem(QUOTA_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any): QuotaLibraryItem | null => {
        if (!item || typeof item !== "object") return null;
        return {
          id: String(item.id || ""),
          code: String(item.code || ""),
          category: String(item.category || ""),
          name: String(item.name || ""),
          constructionDescription: String(item.constructionDescription || ""),
          unit: String(item.unit || ""),
          laborPrice: toAmount(item.laborPrice),
          materialPrice: toAmount(item.materialPrice),
          totalPrice: toAmount(item.totalPrice ?? (toAmount(item.laborPrice) + toAmount(item.materialPrice))),
          isSpecialPrice: Boolean(item.isSpecialPrice),
          status: String(item.status || ""),
        };
      })
      .filter((item): item is QuotaLibraryItem => Boolean(item?.id && item.name && item.status !== "disabled"));
  } catch {
    return [];
  }
}

export function getSpaceConfigModeCopy(mode: PricingMode) {
  if (mode === "list") {
    return {
      modeName: "清单报价模式",
      title: "空间报价项目",
      description: "按空间配置报价项目，客户单价会参与清单报价合计。",
      notice: "当前模式下，空间中的客户单价会直接形成报价明细。",
      addButtonText: "添加报价项目",
      emptyText: "该空间暂无报价项目",
      emptyHelp: "添加报价项目后，系统会按客户单价汇总清单报价。",
      priceHeader: "客户单价",
      priceTitle: "清单模式下参与报价合计",
      priceClassName: "relative px-2 py-2 pr-5 text-right font-semibold tabular-nums text-red-600",
      showScope: false,
    };
  }
  if (mode === "package") {
    return {
      modeName: "一口价模式",
      title: "套餐包含项目",
      description: "按空间配置一口价包含的施工项目，销售价以上方一口价配置为准。",
      notice: "当前模式下，空间定额用于说明套餐包含范围，不再按定额价格自动累加销售价。",
      addButtonText: "添加套餐项目",
      emptyText: "该空间暂无套餐项目",
      emptyHelp: "添加项目后，可说明一口价套餐包含哪些施工范围。",
      priceHeader: "参考单价",
      priceTitle: "一口价模式下仅作项目价格参考",
      priceClassName: "relative px-2 py-2 pr-5 text-right font-semibold tabular-nums text-surface-700",
      showScope: false,
    };
  }
  if (mode === "area") {
    return {
      modeName: "平方报价模式",
      title: "平方报价包含项目",
      description: "按空间配置平方单价包含的施工项目，销售价以上方平方阶梯配置为准。",
      notice: "当前模式下，空间定额用于说明每平方单价包含范围，不再按定额价格自动累加销售价。",
      addButtonText: "添加平方项目",
      emptyText: "该空间暂无平方项目",
      emptyHelp: "添加项目后，可说明平方报价包含哪些施工范围。",
      priceHeader: "参考单价",
      priceTitle: "平方报价模式下仅作项目价格参考",
      priceClassName: "relative px-2 py-2 pr-5 text-right font-semibold tabular-nums text-surface-700",
      showScope: false,
    };
  }
  return {
    modeName: "基装+主材平方模式",
    title: "基装/主材包含项目",
    description: "按空间配置基装和主材分别包含的项目，销售价以上方两类平方单价合计为准。",
    notice: "当前模式下，请为每条定额标记基装或主材，方便后续生成报价说明。",
    addButtonText: "添加基装/主材项目",
    emptyText: "该空间暂无基装/主材项目",
    emptyHelp: "添加项目后，可分别标记该项目属于基装还是主材。",
    priceHeader: "参考单价",
    priceTitle: "基装+主材平方模式下仅作项目价格参考",
    priceClassName: "relative px-2 py-2 pr-5 text-right font-semibold tabular-nums text-surface-700",
    showScope: true,
  };
}

export function makeEmptyTemplate(): QuotaTemplate {
  return {
    id: `tpl-${Date.now()}`,
    name: "",
    type: "半包",
    remark: "",
    status: "enabled",
    createdByName: DEFAULT_TEMPLATE_CREATOR,
    autoScope: null,
    constructionTemplateConfig: makeDefaultConstructionTemplateConfig(),
    quoteConfig: makeDefaultQuoteConfig(),
    projectGroups: [],
    comprehensiveFees: makeDefaultComprehensiveFees(),
    appendixNote: "",
    spaces: [],
    updatedAt: todayText(),
  };
}

export function normalizeTemplate(value: any, index: number): QuotaTemplate | null {
  if (!value || typeof value !== "object") return null;
  const type = quoteTypes.includes(value.type) ? value.type : "半包";
  const legacyRemark = value.remark || value.description || value.pricingRule || "";
  const hasComprehensiveFees = Object.prototype.hasOwnProperty.call(value, "comprehensiveFees");
  const spaces = Array.isArray(value.spaces) ? value.spaces.map(normalizeSpace) : [];
  return {
    id: String(value.id || `tpl-${Date.now()}-${index}`),
    name: String(value.name || "未命名模板"),
    type,
    remark: String(legacyRemark || ""),
    status: normalizeTemplateStatus(value.status),
    createdByName: String(value.createdByName || value.created_by_name || value.creatorName || value.creator || DEFAULT_TEMPLATE_CREATOR),
    autoScope: normalizeQuotaTemplateAutoScope(value.autoScope || value.scope || value.accessScope),
    constructionTemplateConfig: makeDefaultConstructionTemplateConfig(value.constructionTemplateConfig),
    quoteConfig: makeDefaultQuoteConfig(value.quoteConfig),
    projectGroups: normalizeTemplateProjectGroups(value.projectGroups, spaces),
    comprehensiveFees: normalizeComprehensiveFees(value.comprehensiveFees, !hasComprehensiveFees),
    appendixNote: String(value.appendixNote || value.quotationNote || "").trim(),
    spaces,
    updatedAt: String(value.updatedAt || todayText()),
  };
}

export function isLegacySampleTemplate(template: QuotaTemplate) {
  return legacySampleTemplateNames.has(template.name.trim());
}

export function loadTemplatesFromStorage() {
  if (typeof window === "undefined") return initialTemplates;
  const raw = window.localStorage.getItem(QUOTA_TEMPLATE_STORAGE_KEY);
  if (raw == null) return initialTemplates;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialTemplates;
    const normalized = parsed
      .map(normalizeTemplate)
      .filter(Boolean)
      .filter((template) => !isLegacySampleTemplate(template as QuotaTemplate)) as QuotaTemplate[];
    return normalized;
  } catch {
    return initialTemplates;
  }
}

export function getTemplateAutoSavePayload(template: QuotaTemplate | null, mode: TemplateEditMode) {
  if (!template) return "";
  if (mode === "edit") {
    return JSON.stringify({
      id: template.id,
      projectGroups: template.projectGroups,
      comprehensiveFees: template.comprehensiveFees,
      appendixNote: template.appendixNote,
      spaces: template.spaces,
    });
  }
  return JSON.stringify(template);
}

export function hasTemplateDraftContent(template: QuotaTemplate) {
  const hasComprehensiveFeeContent = template.comprehensiveFees.length > 0
    && !isDefaultComprehensiveFeesOnly(template.comprehensiveFees)
    && template.comprehensiveFees.some((fee) => fee.name.trim() || fee.unit_price > 0 || fee.fee_rate > 0 || fee.remark.trim());
  return Boolean(
    template.name.trim()
    || template.remark.trim()
    || template.constructionTemplateConfig.name.trim()
    || template.projectGroups.some((group) => group.name.trim())
    || hasComprehensiveFeeContent
    || template.appendixNote.trim()
    || template.spaces.some((space) => space.name.trim() || space.quotaItems.length > 0)
  );
}

export function loadTemplateDraftFromStorage() {
  if (typeof window === "undefined") return null as QuotaTemplate | null;
  try {
    const raw = window.localStorage.getItem(QUOTA_TEMPLATE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeTemplate(JSON.parse(raw), 0);
  } catch {
    return null;
  }
}

export function clearTemplateDraftFromStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(QUOTA_TEMPLATE_DRAFT_STORAGE_KEY);
}

export function getSpaceAutoSaveText(status: SpaceAutoSaveStatus, mode: TemplateEditMode) {
  if (status === "pending") return "待自动保存";
  if (status === "saving") return "自动保存中...";
  if (status === "saved") return "空间配置已自动保存";
  if (status === "draft") return "草稿已暂存";
  if (status === "error") return "自动保存失败";
  return mode === "create" ? "草稿自动暂存已开启" : "空间配置自动保存已开启";
}
