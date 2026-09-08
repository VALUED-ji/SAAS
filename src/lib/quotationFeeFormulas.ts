import { formatAlphaSequence } from "./quotationSequence";

export type FeeCalcMethod = "fixed" | "reference" | "percent" | "area_unit";
export type FeeCalcBase = "base" | "main_material" | "base_material" | string;
export type FeeScopeMode = "all" | "include" | "exclude";

export type FormulaFeeItem = {
  id?: string | null;
  client_key?: string | null;
  category?: string;
  space?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  fee_calc_method?: string | null;
  fee_calc_base?: string | null;
  fee_rate?: number | null;
  fee_scope_mode?: string | null;
  fee_scope_space_ids?: string[] | string | null;
  fee_scope_space_names?: string[] | string | null;
};

const STABLE_FEE_REFERENCE_PATTERN = /\[\[fee:([^\]]+)\]\]/gi;

function getFormulaFeeItemId(item: FormulaFeeItem, index: number) {
  return String(item.id || item.client_key || `fee-index-${index}`).trim();
}

function decodeStableFeeReference(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function hasStableFeeReferences(value: unknown) {
  STABLE_FEE_REFERENCE_PATTERN.lastIndex = 0;
  return STABLE_FEE_REFERENCE_PATTERN.test(String(value || ""));
}

export function getStableFeeReferenceIds(value: unknown) {
  const ids: string[] = [];
  String(value || "").replace(STABLE_FEE_REFERENCE_PATTERN, (_match, encodedId: string) => {
    ids.push(decodeStableFeeReference(encodedId));
    return _match;
  });
  return Array.from(new Set(ids));
}

export function formatStableFeeFormula(value: unknown, items: FormulaFeeItem[], sequenceOffset = 0) {
  const sequenceById = new Map<string, string>();
  items.forEach((item, index) => {
    sequenceById.set(getFormulaFeeItemId(item, index), formatAlphaSequence(index + sequenceOffset));
  });
  return String(value || "").replace(STABLE_FEE_REFERENCE_PATTERN, (_match, encodedId: string) => (
    sequenceById.get(decodeStableFeeReference(encodedId)) || "[已删除费用]"
  ));
}

export function bindStableFeeFormula(value: unknown, items: FormulaFeeItem[], sequenceOffset = 0) {
  const displayFormula = formatStableFeeFormula(value, items, sequenceOffset);
  return displayFormula.replace(
    /(^|[^A-Za-z0-9_])([A-Za-z]{1,3})(?=$|[^A-Za-z0-9_])/g,
    (match, prefix: string, sequence: string) => {
      const sequenceIndex = alphaSequenceToIndex(sequence);
      if (sequenceIndex === null) return match;
      const itemIndex = sequenceIndex - sequenceOffset;
      if (itemIndex < 0 || itemIndex >= items.length) return match;
      const stableId = getFormulaFeeItemId(items[itemIndex], itemIndex);
      return `${prefix}[[fee:${encodeURIComponent(stableId)}]]`;
    },
  );
}

export function remapStableFeeFormulaIds(value: unknown, idMap: Map<string, string> | Record<string, string>) {
  const resolveId = (id: string) => idMap instanceof Map ? idMap.get(id) : idMap[id];
  return String(value || "").replace(STABLE_FEE_REFERENCE_PATTERN, (match, encodedId: string) => {
    const nextId = resolveId(decodeStableFeeReference(encodedId));
    return nextId ? `[[fee:${encodeURIComponent(nextId)}]]` : match;
  });
}

export type FeeFormulaContext = {
  houseArea?: number | null;
  mainMaterialAmount?: number;
  directItemAmount?: number;
  laborAmount?: number;
  materialCostAmount?: number;
  categoryAmounts?: Record<string, number>;
  directItems?: Array<{
    category?: string | null;
    categoryLabel?: string | null;
    space?: string | null;
    total: number;
    laborAmount?: number;
    materialCostAmount?: number;
  }>;
};

export const feeCalcMethodLabels: Record<FeeCalcMethod, string> = {
  fixed: "固定金额",
  reference: "引用金额",
  percent: "按比例",
  area_unit: "按面积单价",
};

export const feeCalcBaseLabels = {
  base: "基装",
  main_material: "产品",
  base_material: "基装+产品",
} as const;

type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "leftParen" }
  | { type: "rightParen" };

type FormulaAlias = {
  label: string;
  key: string;
};

type OtherFeeCalculationDetail = {
  total: number;
  error: string;
};

export function toMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function toNumber(value: unknown) {
  const nextValue = Number(value || 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

export function normalizeFeeCalcMethod(value: unknown): FeeCalcMethod {
  if (value === "reference") return "reference";
  if (value === "area_unit" || value === "area" || value === "house_area_unit") return "area_unit";
  return value === "percent" ? "percent" : "fixed";
}

export function normalizeFeeCalcBase(value: unknown): FeeCalcBase {
  const text = String(value || "").trim();
  return text;
}

export function normalizeFeeScopeMode(value: unknown): FeeScopeMode {
  return value === "include" || value === "exclude" ? value : "all";
}

export function parseFeeScopeValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {}
  return text.split(/[,\n，、]/).map((item) => item.trim()).filter(Boolean);
}

function getFeeScopeSpaceNames(item?: FormulaFeeItem | null) {
  return parseFeeScopeValues(item?.fee_scope_space_names);
}

function getScopedFormulaContext(item: FormulaFeeItem | null | undefined, context?: FeeFormulaContext) {
  const mode = normalizeFeeScopeMode(item?.fee_scope_mode);
  const names = getFeeScopeSpaceNames(item);
  if (mode === "all" || names.length === 0 || !context?.directItems?.length) return context;

  const nameSet = new Set(names);
  const directItems = context.directItems.filter((directItem) => {
    const space = String(directItem.space || "").trim();
    const category = String(directItem.category || "").trim();
    const categoryLabel = String(directItem.categoryLabel || "").trim();
    const matched = nameSet.has(space) || nameSet.has(category) || nameSet.has(categoryLabel);
    return mode === "include" ? matched : !matched;
  });
  const categoryAmounts: Record<string, number> = {};
  directItems.forEach((directItem) => {
    const category = String(directItem.category || "").trim();
    const label = String(directItem.categoryLabel || category).trim();
    if (!category || category === "base" || category === "main_material" || category === "other") return;
    categoryAmounts[label] = toMoney(toNumber(categoryAmounts[label]) + toNumber(directItem.total));
  });
  const mainMaterialAmount = directItems
    .filter((directItem) => String(directItem.category || "").trim() === "main_material")
    .reduce((sum, directItem) => sum + toNumber(directItem.total), 0);
  const laborAmount = directItems.reduce((sum, directItem) => sum + toNumber(directItem.laborAmount), 0);
  const materialCostAmount = directItems.reduce((sum, directItem) => sum + toNumber(directItem.materialCostAmount), 0);
  const customCategoryAmount = Object.values(categoryAmounts).reduce((sum, amount) => sum + toNumber(amount), 0);
  return {
    ...context,
    mainMaterialAmount: toMoney(mainMaterialAmount),
    directItemAmount: toMoney(mainMaterialAmount + customCategoryAmount),
    laborAmount: toMoney(laborAmount),
    materialCostAmount: toMoney(materialCostAmount),
    categoryAmounts,
    directItems,
  };
}

function getScopedBaseAmounts(item: FormulaFeeItem | null | undefined, baseAmount: number, materialAmount: number, context?: FeeFormulaContext) {
  const scopedContext = getScopedFormulaContext(item, context);
  if (scopedContext === context) return { baseAmount, materialAmount, context };
  const scopedBaseAmount = scopedContext?.directItems
    ?.filter((directItem) => String(directItem.category || "").trim() === "base")
    .reduce((sum, directItem) => sum + toNumber(directItem.total), 0) ?? baseAmount;
  const scopedMaterialAmount = toNumber(scopedContext?.mainMaterialAmount) + Object.values(scopedContext?.categoryAmounts || {}).reduce((sum, amount) => sum + toNumber(amount), 0);
  return {
    baseAmount: toMoney(scopedBaseAmount),
    materialAmount: toMoney(scopedMaterialAmount),
    context: scopedContext,
  };
}

export function getFeeScopeText(item: FormulaFeeItem) {
  const mode = normalizeFeeScopeMode(item.fee_scope_mode);
  const names = getFeeScopeSpaceNames(item);
  if (mode === "all" || names.length === 0) return "";
  const prefix = mode === "include" ? "仅含" : "不含";
  return `${prefix}：${names.join("、")}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getReferenceData(
  baseAmount: number,
  materialAmount: number,
  referenceAmounts: Record<string, number>,
  context?: FeeFormulaContext,
) {
  const categoryAmounts = context?.categoryAmounts || {};
  const mainMaterialAmount = toNumber(
    context?.mainMaterialAmount
    ?? categoryAmounts.main_material
    ?? categoryAmounts["产品"]
    ?? categoryAmounts["主材"]
    ?? materialAmount,
  );
  const directItemAmount = toNumber(context?.directItemAmount ?? materialAmount);
  const laborAmount = toNumber(context?.laborAmount);
  const materialCostAmount = toNumber(context?.materialCostAmount);
  const references: Record<string, number> = {
    BASE: baseAmount,
    MATERIAL: mainMaterialAmount,
    LABOR: laborAmount,
    MATERIAL_COST: materialCostAmount,
    DIRECT_ITEMS: directItemAmount,
    DIRECT: baseAmount + directItemAmount,
    ...referenceAmounts,
  };
  const aliases: FormulaAlias[] = [
    { label: "基装直接费", key: "BASE" },
    { label: "基装项目", key: "BASE" },
    { label: "基装", key: "BASE" },
    { label: "人工费合计", key: "LABOR" },
    { label: "人工费", key: "LABOR" },
    { label: "人工", key: "LABOR" },
    { label: "材料费合计", key: "MATERIAL_COST" },
    { label: "材料费", key: "MATERIAL_COST" },
    { label: "材料", key: "MATERIAL_COST" },
    { label: "产品直接费", key: "MATERIAL" },
    { label: "产品项目", key: "MATERIAL" },
    { label: "产品", key: "MATERIAL" },
    { label: "主材直接费", key: "MATERIAL" },
    { label: "主材项目", key: "MATERIAL" },
    { label: "主材", key: "MATERIAL" },
    { label: "直接费合计", key: "DIRECT" },
    { label: "工程直接费", key: "DIRECT" },
    { label: "直接费", key: "DIRECT" },
  ];
  const addAlias = (label: string, key: string) => {
    const normalizedLabel = String(label || "").trim();
    if (!normalizedLabel) return;
    aliases.push({ label: normalizedLabel, key });
  };

  Object.entries(categoryAmounts).forEach(([label, amount], index) => {
    const normalizedLabel = String(label || "").trim();
    if (!normalizedLabel) return;
    const key = `CAT${index}`;
    references[key] = toNumber(amount);
    addAlias(normalizedLabel, key);
  });

  return { references, aliases };
}

export function getFeeBaseAmount(baseAmount: number, materialAmount: number, calcBase: unknown, context?: FeeFormulaContext) {
  const nextBase = normalizeFeeCalcBase(calcBase) || "直接费";
  const { references } = getReferenceData(baseAmount, materialAmount, {}, context);
  if (nextBase === "base" || nextBase === "基装" || nextBase === "基装直接费") return baseAmount;
  if (nextBase === "基装项目") return baseAmount;
  if (nextBase === "人工" || nextBase === "人工费" || nextBase === "人工费合计") return references.LABOR;
  if (nextBase === "材料" || nextBase === "材料费" || nextBase === "材料费合计") return references.MATERIAL_COST;
  if (nextBase === "main_material" || nextBase === "产品" || nextBase === "产品直接费" || nextBase === "主材" || nextBase === "主材直接费") return references.MATERIAL;
  if (nextBase === "产品项目" || nextBase === "主材项目") return references.MATERIAL;
  if (nextBase === "base_material" || nextBase === "基装+产品" || nextBase === "基装+主材") return baseAmount + references.MATERIAL;
  if (nextBase === "直接费" || nextBase === "直接费合计" || nextBase === "工程直接费") return references.DIRECT;
  return references.DIRECT;
}

export function isLegacyFeeCalcBase(value: unknown) {
  return value === "base"
    || value === "main_material"
    || value === "base_material"
    || value === "基装"
    || value === "基装直接费"
    || value === "基装项目"
    || value === "人工"
    || value === "人工费"
    || value === "人工费合计"
    || value === "材料"
    || value === "材料费"
    || value === "材料费合计"
    || value === "主材"
    || value === "产品"
    || value === "产品直接费"
    || value === "产品项目"
    || value === "主材直接费"
    || value === "主材项目"
    || value === "基装+产品"
    || value === "基装+主材"
    || value === "直接费"
    || value === "直接费合计"
    || value === "工程直接费";
}

export function getFeeBaseLabel(value: unknown) {
  const nextBase = normalizeFeeCalcBase(value) || "直接费";
  if (nextBase === "base" || nextBase === "main_material" || nextBase === "base_material") {
    return feeCalcBaseLabels[nextBase];
  }
  return nextBase;
}

function normalizeFormulaText(expression: string, aliases: FormulaAlias[] = []) {
  let text = expression
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");

  const aliasMap = new Map<string, FormulaAlias>();
  aliases.forEach((alias) => {
    if (!aliasMap.has(alias.label)) aliasMap.set(alias.label, alias);
  });
  const uniqueAliases = Array.from(aliasMap.values())
    .sort((a, b) => b.label.length - a.label.length);
  uniqueAliases.forEach((alias) => {
    text = text.replace(new RegExp(escapeRegExp(alias.label), "g"), alias.key);
  });
  return text;
}

function tokenizeExpression(expression: string, referenceAmounts: Record<string, number>, aliases: FormulaAlias[] = []) {
  const tokens: Token[] = [];
  const text = normalizeFormulaText(expression, aliases);
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[0-9.]/.test(text[end])) end += 1;
      const rawNumber = text.slice(index, end);
      const parsed = Number(rawNumber);
      if (!Number.isFinite(parsed)) return null;
      tokens.push({ type: "number", value: parsed });
      index = end;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
      const key = text.slice(index, end).toUpperCase();
      if (!Object.prototype.hasOwnProperty.call(referenceAmounts, key)) return null;
      tokens.push({ type: "number", value: toNumber(referenceAmounts[key]) });
      index = end;
      continue;
    }
    if (char === "%") {
      tokens.push({ type: "operator", value: "/" }, { type: "number", value: 100 });
      index += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "leftParen" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rightParen" });
      index += 1;
      continue;
    }
    return null;
  }

  return tokens;
}

function parseExpression(expression: string, referenceAmounts: Record<string, number>, aliases: FormulaAlias[] = []) {
  const parsedTokens = tokenizeExpression(expression, referenceAmounts, aliases);
  if (!parsedTokens) return null;
  const tokens = parsedTokens;
  let position = 0;

  function parseFactor(): number | null {
    const token = tokens[position];
    if (!token) return null;
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      position += 1;
      const value = parseFactor();
      if (value === null) return null;
      return token.value === "-" ? -value : value;
    }
    if (token.type === "number") {
      position += 1;
      return token.value;
    }
    if (token.type === "leftParen") {
      position += 1;
      const value = parseAddSubtract();
      if (value === null || tokens[position]?.type !== "rightParen") return null;
      position += 1;
      return value;
    }
    return null;
  }

  function parseMultiplyDivide(): number | null {
    let value = parseFactor();
    if (value === null) return null;
    while (true) {
      const token = tokens[position];
      if (token?.type !== "operator" || (token.value !== "*" && token.value !== "/")) break;
      const operator = token.value;
      position += 1;
      const nextValue = parseFactor();
      if (nextValue === null) return null;
      value = operator === "*" ? value * nextValue : value / nextValue;
    }
    return value;
  }

  function parseAddSubtract(): number | null {
    let value = parseMultiplyDivide();
    if (value === null) return null;
    while (true) {
      const token = tokens[position];
      if (token?.type !== "operator" || (token.value !== "+" && token.value !== "-")) break;
      const operator = token.value;
      position += 1;
      const nextValue = parseMultiplyDivide();
      if (nextValue === null) return null;
      value = operator === "+" ? value + nextValue : value - nextValue;
    }
    return value;
  }

  const result = parseAddSubtract();
  if (result === null || position !== tokens.length || !Number.isFinite(result)) return null;
  return result;
}

export function evaluateFeeFormula(expression: unknown, referenceAmounts: Record<string, number>, aliases: FormulaAlias[] = []) {
  const text = String(expression || "").trim();
  if (!text) return null;
  return parseExpression(text, referenceAmounts, aliases);
}

function getFormulaTokenKeys(expression: unknown, aliases: FormulaAlias[] = []) {
  const text = normalizeFormulaText(String(expression || ""), aliases);
  return Array.from(new Set((text.match(/[A-Za-z][A-Za-z0-9_]*/g) || []).map((key) => key.toUpperCase())));
}

function alphaSequenceToIndex(value: string) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(text)) return null;
  let result = 0;
  for (const char of text) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

function calculateOtherFeeDetailsInternal(
  items: FormulaFeeItem[],
  baseAmount: number,
  materialAmount: number,
  context?: FeeFormulaContext,
): OtherFeeCalculationDetail[] {
  const totals: Array<number | null | undefined> = [];
  const errors: string[] = [];
  const resolving = new Set<number>();
  const itemIndexById = new Map<string, number>();
  items.forEach((item, index) => itemIndexById.set(getFormulaFeeItemId(item, index), index));

  const resolveStableReferences = (expression: string) => {
    let missingReference = false;
    const resolved = expression.replace(STABLE_FEE_REFERENCE_PATTERN, (_match, encodedId: string) => {
      const referenceIndex = itemIndexById.get(decodeStableFeeReference(encodedId));
      if (referenceIndex === undefined) {
        missingReference = true;
        return "INVALID_REFERENCE";
      }
      return formatAlphaSequence(referenceIndex);
    });
    return { expression: resolved, missingReference };
  };

  const resolveBaseForItem = (item: FormulaFeeItem, index: number): { value: number | null; error: string } => {
    const normalizedBase = normalizeFeeCalcBase(item.fee_calc_base);
    if (!normalizedBase) return { value: null, error: "请填写基础公式" };
    const scoped = getScopedBaseAmounts(item, baseAmount, materialAmount, context);
    if (isLegacyFeeCalcBase(normalizedBase)) return { value: getFeeBaseAmount(scoped.baseAmount, scoped.materialAmount, normalizedBase, scoped.context), error: "" };

    const stableResolution = resolveStableReferences(normalizedBase);
    if (stableResolution.missingReference) return { value: null, error: "公式引用的费用项已删除" };
    const resolvedBase = stableResolution.expression;

    const { references, aliases } = getReferenceData(scoped.baseAmount, scoped.materialAmount, {}, scoped.context);
    const tokenKeys = getFormulaTokenKeys(resolvedBase, aliases);
    for (const key of tokenKeys) {
      if (Object.prototype.hasOwnProperty.call(references, key)) continue;
      const referenceIndex = alphaSequenceToIndex(key);
      if (referenceIndex === null || referenceIndex < 0 || referenceIndex >= items.length) {
        return { value: null, error: "基础公式无法识别" };
      }
      if (referenceIndex === index) return { value: null, error: "基础公式不能引用本行" };
      const referenceTotal = resolveItem(referenceIndex);
      if (referenceTotal === null) return { value: null, error: errors[referenceIndex] || "基础公式无法识别" };
      references[key] = referenceTotal;
    }

    const formulaValue = evaluateFeeFormula(resolvedBase, references, aliases);
    return formulaValue === null
      ? { value: null, error: "基础公式无法识别" }
      : { value: formulaValue, error: "" };
  };

  const resolveItem = (index: number): number | null => {
    if (index < 0 || index >= items.length) return null;
    if (totals[index] !== undefined) return totals[index] ?? null;
    if (resolving.has(index)) {
      errors[index] = "基础公式循环引用";
      totals[index] = null;
      return null;
    }

    resolving.add(index);
    const item = items[index];
    let total: number | null = 0;
    let error = "";

    if (item.category !== "other") {
      total = toMoney(toNumber(item.quantity) * toNumber(item.unit_price));
    } else {
      const legacyManagementFeeRate = !item.fee_calc_method && /^(项目)?管理费$/.test(String(item.name || "").trim())
        ? getLegacyManagementFeeRate(item)
        : 0;
      if (legacyManagementFeeRate > 0) {
        const scoped = getScopedBaseAmounts(item, baseAmount, materialAmount, context);
        total = toMoney(getFeeBaseAmount(scoped.baseAmount, scoped.materialAmount, "base_material", scoped.context) * legacyManagementFeeRate / 100);
      } else {
        const method = normalizeFeeCalcMethod(item.fee_calc_method);
        if (method === "area_unit") {
          total = toMoney(toNumber(context?.houseArea) * toNumber(item.unit_price));
        } else if (method === "reference" || method === "percent") {
          const resolvedBase = resolveBaseForItem(item, index);
          if (resolvedBase.value === null) {
            total = null;
            error = resolvedBase.error;
          } else {
            total = method === "reference"
              ? toMoney(resolvedBase.value)
              : toMoney(resolvedBase.value * toNumber(item.fee_rate) / 100);
          }
        } else {
          total = toMoney(toNumber(item.quantity) * toNumber(item.unit_price));
        }
      }
    }

    resolving.delete(index);
    errors[index] = error;
    totals[index] = total;
    return total;
  };

  items.forEach((_item, index) => resolveItem(index));
  return items.map((_item, index) => ({ total: totals[index] ?? 0, error: errors[index] || "" }));
}

export function getFeeCalcBaseError(
  calcBase: unknown,
  baseAmount: number,
  materialAmount: number,
  referenceAmounts: Record<string, number> = {},
  context?: FeeFormulaContext,
  allItems?: FormulaFeeItem[],
  currentIndex?: number,
) {
  if (allItems && typeof currentIndex === "number") {
    return calculateOtherFeeDetailsInternal(allItems, baseAmount, materialAmount, context)[currentIndex]?.error || "";
  }
  const normalizedBase = normalizeFeeCalcBase(calcBase);
  if (!normalizedBase) return "请填写基础公式";
  if (isLegacyFeeCalcBase(normalizedBase)) return "";
  const { references, aliases } = getReferenceData(baseAmount, materialAmount, referenceAmounts, context);
  const formulaValue = evaluateFeeFormula(normalizedBase, references, aliases);
  return formulaValue === null ? "基础公式无法识别" : "";
}

function resolveFormulaBase(
  calcBase: unknown,
  baseAmount: number,
  materialAmount: number,
  referenceAmounts: Record<string, number>,
  context?: FeeFormulaContext,
  item?: FormulaFeeItem | null,
) {
  const normalizedBase = normalizeFeeCalcBase(calcBase);
  if (!normalizedBase) return null;
  const scoped = getScopedBaseAmounts(item, baseAmount, materialAmount, context);
  if (isLegacyFeeCalcBase(normalizedBase)) return getFeeBaseAmount(scoped.baseAmount, scoped.materialAmount, normalizedBase, scoped.context);
  const { references, aliases } = getReferenceData(scoped.baseAmount, scoped.materialAmount, referenceAmounts, scoped.context);
  const formulaValue = evaluateFeeFormula(normalizedBase, references, aliases);
  return formulaValue;
}

export function calculateOtherFeeTotal(
  item: FormulaFeeItem,
  baseAmount: number,
  materialAmount: number,
  referenceAmounts: Record<string, number> = {},
  context?: FeeFormulaContext,
) {
  if (item.category !== "other") return toMoney(toNumber(item.quantity) * toNumber(item.unit_price));
  const legacyManagementFeeRate = !item.fee_calc_method && /^(项目)?管理费$/.test(String(item.name || "").trim())
    ? getLegacyManagementFeeRate(item)
    : 0;
  if (legacyManagementFeeRate > 0) {
    const scoped = getScopedBaseAmounts(item, baseAmount, materialAmount, context);
    return toMoney(getFeeBaseAmount(scoped.baseAmount, scoped.materialAmount, "base_material", scoped.context) * legacyManagementFeeRate / 100);
  }
  const method = normalizeFeeCalcMethod(item.fee_calc_method);
  if (method === "reference") {
    const baseValue = resolveFormulaBase(item.fee_calc_base, baseAmount, materialAmount, referenceAmounts, context, item);
    return toMoney(baseValue ?? 0);
  }
  if (method === "percent") {
    const baseValue = resolveFormulaBase(item.fee_calc_base, baseAmount, materialAmount, referenceAmounts, context, item);
    if (baseValue === null) return 0;
    return toMoney(baseValue * toNumber(item.fee_rate) / 100);
  }
  if (method === "area_unit") return toMoney(toNumber(context?.houseArea) * toNumber(item.unit_price));
  return toMoney(toNumber(item.quantity) * toNumber(item.unit_price));
}

export function calculateOtherFeeTotals(
  items: FormulaFeeItem[],
  baseAmount: number,
  materialAmount: number,
  context?: FeeFormulaContext,
) {
  return calculateOtherFeeDetailsInternal(items, baseAmount, materialAmount, context).map((item) => item.total);
}

export function calculateOtherFeeDetails(
  items: FormulaFeeItem[],
  baseAmount: number,
  materialAmount: number,
  context?: FeeFormulaContext,
) {
  return calculateOtherFeeDetailsInternal(items, baseAmount, materialAmount, context);
}

export function isChargeableOtherFeeItem(item: FormulaFeeItem) {
  if (item.category !== "other") return true;
  if (normalizeFeeCalcMethod(item.fee_calc_method) !== "reference") return true;
  const calcBase = normalizeFeeCalcBase(item.fee_calc_base);
  if (!calcBase || isLegacyFeeCalcBase(calcBase)) return false;
  return hasFeeSequenceReference(calcBase);
}

export function calculateChargeableOtherFeeTotals(
  items: FormulaFeeItem[],
  baseAmount: number,
  materialAmount: number,
  context?: FeeFormulaContext,
) {
  const details = calculateOtherFeeDetailsInternal(items, baseAmount, materialAmount, context);
  return items.map((item, index) => isChargeableOtherFeeItem(item) ? details[index]?.total || 0 : 0);
}

function formatPercentBaseLabel(value: string) {
  const text = String(value || "").trim();
  if (!text) return text;
  if (/^\(.+\)$/.test(text)) return text;
  return /[+\-*/×÷]/.test(text) ? `(${text})` : text;
}

function hasFeeSequenceReference(expression: string) {
  if (hasStableFeeReferences(expression)) return true;
  const text = normalizeFormulaText(expression);
  return /(^|[+\-*/(])([A-Z]{1,3})(?=$|[+\-*/)%])/.test(text);
}

export function getFeeFormulaText(item: FormulaFeeItem, items?: FormulaFeeItem[], sequenceOffset = 0) {
  const legacyManagementFeeRate = !item.fee_calc_method && /^(项目)?管理费$/.test(String(item.name || "").trim())
    ? getLegacyManagementFeeRate(item)
    : 0;
  if (legacyManagementFeeRate > 0) return `${formatPercentBaseLabel(feeCalcBaseLabels.base_material)} x ${legacyManagementFeeRate}%`;
  const method = normalizeFeeCalcMethod(item.fee_calc_method);
  if (method === "percent") {
    const baseLabel = getFeeBaseLabel(items ? formatStableFeeFormula(item.fee_calc_base, items, sequenceOffset) : item.fee_calc_base);
    return baseLabel ? `${formatPercentBaseLabel(baseLabel)} x ${toNumber(item.fee_rate)}%` : "-";
  }
  if (method === "area_unit") return `房屋面积 x ${toNumber(item.unit_price)}元/㎡`;
  return "";
}

type FeeRuleTextOptions = {
  currencySymbol?: boolean;
  useGrouping?: boolean;
  includeMethodLabel?: boolean;
};

function formatCurrencyText(value: number, showCurrencySymbol = true, useGrouping = true) {
  return new Intl.NumberFormat("zh-CN", showCurrencySymbol
    ? {
      style: "currency",
      currency: "CNY",
      useGrouping,
      maximumFractionDigits: 0,
    }
    : {
      useGrouping,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNumber(value));
}

function formatFeeRuleExpression(value: string) {
  return value
    .replace(/×/g, "*")
    .replace(/\*/g, " × ")
    .replace(/\s*x\s*/gi, " × ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDirectFeeBase(value: string) {
  return value === "直接费" || value === "直接费合计" || value === "工程直接费";
}

function isBaseMaterialFeeBase(value: string) {
  return value === "base_material" || value === "基装+产品" || value === "基装+主材";
}

function isBaseFeeBase(value: string) {
  return value === "base" || value === "基装" || value === "基装直接费";
}

function isLaborFeeBase(value: string) {
  return value === "人工" || value === "人工费" || value === "人工费合计";
}

function isMaterialCostFeeBase(value: string) {
  return value === "材料" || value === "材料费" || value === "材料费合计";
}

function isMaterialFeeBase(value: string) {
  return value === "main_material" || value === "产品" || value === "产品直接费" || value === "主材" || value === "主材直接费";
}

function getDirectFeeRuleDescription(context?: FeeFormulaContext) {
  const categoryAmounts = context?.categoryAmounts || {};
  const customCategoryLabels = Object.entries(categoryAmounts)
    .filter(([label, amount]) => String(label || "").trim() && toNumber(amount) > 0)
    .map(([label]) => String(label).trim())
    .filter((label) => !["base", "基装", "main_material", "产品", "主材", "other", "综合费用"].includes(label));

  return ["基装直接费", "产品直接费", ...customCategoryLabels].join(" + ");
}

export function getFeeRuleText(item: FormulaFeeItem, total: number, options?: FeeRuleTextOptions, context?: FeeFormulaContext, items?: FormulaFeeItem[], sequenceOffset = 0) {
  const method = normalizeFeeCalcMethod(item.fee_calc_method);
  const calcBase = normalizeFeeCalcBase(items ? formatStableFeeFormula(item.fee_calc_base, items, sequenceOffset) : item.fee_calc_base);
  const totalText = formatCurrencyText(total, options?.currencySymbol !== false, options?.useGrouping !== false);
  const includeMethodLabel = options?.includeMethodLabel !== false;
  const scopedContext = getScopedFormulaContext(item, context);
  const scopeText = getFeeScopeText(item);
  const appendScope = (text: string) => scopeText ? `${text}，${scopeText}` : text;

  if (method === "fixed") {
    return includeMethodLabel ? `固定金额 = ${totalText}` : `金额 = ${totalText}`;
  }

  if (method === "reference") {
    if (!calcBase) return includeMethodLabel ? `引用金额 = ${totalText}` : `金额 = ${totalText}`;
    if (isDirectFeeBase(calcBase)) return appendScope(includeMethodLabel ? `工程直接费 = ${getDirectFeeRuleDescription(scopedContext)} = ${totalText}` : `${getDirectFeeRuleDescription(scopedContext)} = ${totalText}`);
    if (isBaseMaterialFeeBase(calcBase)) return appendScope(includeMethodLabel ? `基装+产品 = 基装直接费 + 产品直接费 = ${totalText}` : `基装直接费 + 产品直接费 = ${totalText}`);
    if (isBaseFeeBase(calcBase)) return appendScope(includeMethodLabel ? `基装 = 基装直接费 = ${totalText}` : `基装直接费 = ${totalText}`);
    if (isLaborFeeBase(calcBase)) return appendScope(`人工费 = ${totalText}`);
    if (isMaterialCostFeeBase(calcBase)) return appendScope(`材料费 = ${totalText}`);
    if (isMaterialFeeBase(calcBase)) return appendScope(includeMethodLabel ? `产品 = 产品直接费 = ${totalText}` : `产品直接费 = ${totalText}`);
    return appendScope(`${formatFeeRuleExpression(calcBase)} = ${totalText}`);
  }

  if (method === "area_unit") {
    const area = toNumber(context?.houseArea);
    const unitPrice = toNumber(item.unit_price);
    return appendScope(`房屋面积 ${area}㎡ × ${unitPrice}元/㎡ = ${totalText}`);
  }

  const rate = toNumber(item.fee_rate);
  if (isDirectFeeBase(calcBase)) return appendScope(includeMethodLabel ? `工程直接费(${getDirectFeeRuleDescription(scopedContext)}) × ${rate}% = ${totalText}` : `(${getDirectFeeRuleDescription(scopedContext)}) × ${rate}% = ${totalText}`);
  if (isBaseMaterialFeeBase(calcBase)) return appendScope(includeMethodLabel ? `基装+产品(基装直接费 + 产品直接费) × ${rate}% = ${totalText}` : `(基装直接费 + 产品直接费) × ${rate}% = ${totalText}`);
  if (isBaseFeeBase(calcBase)) return appendScope(`基装直接费 × ${rate}% = ${totalText}`);
  if (isLaborFeeBase(calcBase)) return appendScope(`人工费 × ${rate}% = ${totalText}`);
  if (isMaterialCostFeeBase(calcBase)) return appendScope(`材料费 × ${rate}% = ${totalText}`);
  if (isMaterialFeeBase(calcBase)) return appendScope(`产品直接费 × ${rate}% = ${totalText}`);

  const formulaText = getFeeFormulaText(item, items, sequenceOffset);
  if (formulaText && formulaText !== "-") return appendScope(`${formatFeeRuleExpression(formulaText)} = ${totalText}`);
  const baseLabel = getFeeBaseLabel(calcBase);
  return appendScope(baseLabel ? `${baseLabel} × ${rate}% = ${totalText}` : `按比例计算 = ${totalText}`);
}

export function getLegacyManagementFeeRate(item: FormulaFeeItem, fallbackRate?: unknown) {
  const fromSpec = String((item as FormulaFeeItem & { spec?: string | null }).spec || "").match(/原管理费比例\s*([\d.]+)%/);
  const parsedRate = fromSpec ? Number(fromSpec[1]) : 0;
  return parsedRate || toNumber(fallbackRate);
}
