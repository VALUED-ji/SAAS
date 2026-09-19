import { toMoney, toNumber } from "@/lib/quotationFeeFormulas";

export type QuotationQuantityFormulaOperator = "add" | "subtract" | "multiply" | "divide";
export type QuotationQuantityFormulaAdjustmentOperator = "add" | "subtract";

export type QuotationQuantityFormulaNode =
  | { type: "reference"; itemId: string }
  | { type: "number"; value: number }
  | {
    type: "binary";
    operator: QuotationQuantityFormulaOperator;
    left: QuotationQuantityFormulaNode;
    right: QuotationQuantityFormulaNode;
  };

export type QuotationQuantityFormula = {
  version: 2;
  expression: QuotationQuantityFormulaNode;
};

export type QuotationQuantityFormulaTerm = {
  operator: QuotationQuantityFormulaAdjustmentOperator;
  itemId?: string;
  constant?: number;
};

export type QuotationQuantityLinkItem = {
  id?: string | null;
  client_key?: string | null;
  category?: string | null;
  name?: string | null;
  space?: string | null;
  unit?: string | null;
  quantity?: number | null;
  quantity_formula?: unknown;
};

type FormulaEvaluation = {
  value: number | null;
  error: string;
};

const formulaOperatorSymbols: Record<QuotationQuantityFormulaOperator, string> = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
};

export function getQuantityCategoryKey(category: unknown) {
  const name = String(category || "").trim();
  if (name === "base" || name === "基装" || name === "基装项目") return "base";
  if (name === "main_material" || name === "主材" || name === "主材项目" || name === "产品" || name === "产品项目") return "main_material";
  if (name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目") return "custom_cabinet";
  if (name === "other" || name === "综合费用") return "other";
  return name ? "main_material" : "";
}

function parseFormulaNode(value: unknown): QuotationQuantityFormulaNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (node.type === "reference") {
    const itemId = String(node.itemId || "").trim();
    return itemId ? { type: "reference", itemId } : null;
  }
  if (node.type === "number") {
    const number = Number(node.value);
    return Number.isFinite(number) ? { type: "number", value: number } : null;
  }
  if (node.type === "binary") {
    const operator = node.operator === "add"
      || node.operator === "subtract"
      || node.operator === "multiply"
      || node.operator === "divide"
      ? node.operator
      : "";
    const left = parseFormulaNode(node.left);
    const right = parseFormulaNode(node.right);
    return operator && left && right ? { type: "binary", operator, left, right } : null;
  }
  return null;
}

export function parseQuotationQuantityFormula(value: unknown): QuotationQuantityFormula | null {
  let raw = value;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (Number(source.version) === 2) {
    const expression = parseFormulaNode(source.expression);
    return expression ? { version: 2, expression } : null;
  }

  const baseItemId = String(source.baseItemId || "").trim();
  if (!baseItemId) return null;
  const rawTerms = Array.isArray(source.terms)
    ? source.terms
    : source.itemId
      ? [{ operator: source.operator, itemId: source.itemId }]
      : [];
  let expression: QuotationQuantityFormulaNode = { type: "reference", itemId: baseItemId };
  for (const rawTerm of rawTerms) {
    if (!rawTerm || typeof rawTerm !== "object") return null;
    const term = rawTerm as Record<string, unknown>;
    const operator = term.operator === "subtract" ? "subtract" : term.operator === "add" ? "add" : "";
    if (!operator) return null;
    const itemId = String(term.itemId || "").trim();
    const rawConstant = term.constant;
    const hasConstant = rawConstant !== undefined && rawConstant !== null && Number.isFinite(Number(rawConstant));
    if (Boolean(itemId) === hasConstant) return null;
    expression = {
      type: "binary",
      operator,
      left: expression,
      right: itemId ? { type: "reference", itemId } : { type: "number", value: Number(rawConstant) },
    };
  }
  return { version: 2, expression };
}

export function serializeQuotationQuantityFormula(value: unknown) {
  const formula = parseQuotationQuantityFormula(value);
  return formula ? JSON.stringify(formula) : "";
}

export function getQuantityLinkItemId(item: QuotationQuantityLinkItem) {
  return String(item.id || item.client_key || "").trim();
}

export function getQuantityLinkItemName(item: QuotationQuantityLinkItem, index: number) {
  return String(item.name || "").trim() || `项目 ${index + 1}`;
}

function buildQuantityLinkItemMap(items: QuotationQuantityLinkItem[]) {
  const map = new Map<string, { item: QuotationQuantityLinkItem; index: number }>();
  items.forEach((item, index) => {
    const id = String(item.id || "").trim();
    const clientKey = String(item.client_key || "").trim();
    if (id) map.set(id, { item, index });
    if (clientKey) map.set(clientKey, { item, index });
  });
  return map;
}

function collectFormulaReferenceIds(node: QuotationQuantityFormulaNode): string[] {
  if (node.type === "reference") return [node.itemId];
  if (node.type === "number") return [];
  return [...collectFormulaReferenceIds(node.left), ...collectFormulaReferenceIds(node.right)];
}

function mapFormulaReferences(
  node: QuotationQuantityFormulaNode,
  mapper: (itemId: string) => string | null,
): QuotationQuantityFormulaNode | null {
  if (node.type === "number") return node;
  if (node.type === "reference") {
    const itemId = mapper(node.itemId);
    return itemId ? { type: "reference", itemId } : null;
  }
  const left = mapFormulaReferences(node.left, mapper);
  const right = mapFormulaReferences(node.right, mapper);
  return left && right ? { type: "binary", operator: node.operator, left, right } : null;
}

function formulaHasReferences(node: QuotationQuantityFormulaNode) {
  return collectFormulaReferenceIds(node).length > 0;
}

function validateFormulaStructure(items: QuotationQuantityLinkItem[], targetIndex: number, formula: QuotationQuantityFormula) {
  const target = items[targetIndex];
  if (!target) return "结果项目不存在";
  if (getQuantityCategoryKey(target.category) === "other") return "综合费用不能设置数量联动";
  const itemMap = buildQuantityLinkItemMap(items);
  const referenceIds = Array.from(new Set(collectFormulaReferenceIds(formula.expression)));
  if (referenceIds.length === 0) return "数量联动公式至少需要引用一个项目";
  for (const itemId of referenceIds) {
    const linked = itemMap.get(itemId);
    if (!linked) return "参与计算的项目不存在";
    if (linked.index === targetIndex) return "结果项目不能引用自己";
    const targetCategory = getQuantityCategoryKey(target.category);
    if (targetCategory !== getQuantityCategoryKey(linked.item.category)) return "只能引用同一类别中的项目";
    if (String(target.space || "").trim() !== String(linked.item.space || "").trim()) return "只能引用同一空间中的项目";
    if (String(target.unit || "").trim() !== String(linked.item.unit || "").trim()) return "参与计算的项目单位必须一致";
  }
  return "";
}

function evaluateFormulaNode(
  node: QuotationQuantityFormulaNode,
  resolveReference: (itemId: string) => FormulaEvaluation,
): FormulaEvaluation {
  if (node.type === "number") return { value: node.value, error: "" };
  if (node.type === "reference") return resolveReference(node.itemId);
  const left = evaluateFormulaNode(node.left, resolveReference);
  if (left.error || left.value === null) return left;
  const right = evaluateFormulaNode(node.right, resolveReference);
  if (right.error || right.value === null) return right;
  if (node.operator === "divide" && Math.abs(right.value) < 0.0000001) {
    return { value: null, error: "除数不能为 0" };
  }
  const value = node.operator === "add"
    ? left.value + right.value
    : node.operator === "subtract"
      ? left.value - right.value
      : node.operator === "multiply"
        ? left.value * right.value
        : left.value / right.value;
  return Number.isFinite(value) ? { value, error: "" } : { value: null, error: "计算结果无效" };
}

function resolveOwnedQuantity(
  items: QuotationQuantityLinkItem[],
  targetIndex: number,
  cache: Map<number, FormulaEvaluation>,
  visiting: Set<number>,
): FormulaEvaluation {
  const cached = cache.get(targetIndex);
  if (cached) return cached;
  if (visiting.has(targetIndex)) return { value: null, error: "数量联动不能形成循环引用" };
  const item = items[targetIndex];
  const formula = parseQuotationQuantityFormula(item?.quantity_formula);
  if (!item || !formula) {
    const value = toNumber(item?.quantity);
    cache.set(targetIndex, { value, error: "" });
    return { value, error: "" };
  }
  const structureError = validateFormulaStructure(items, targetIndex, formula);
  if (structureError) {
    const result = { value: null, error: structureError };
    cache.set(targetIndex, result);
    return result;
  }
  visiting.add(targetIndex);
  const itemMap = buildQuantityLinkItemMap(items);
  const evaluated = evaluateFormulaNode(formula.expression, (itemId) => {
    const linked = itemMap.get(itemId);
    return linked ? resolveOwnedQuantity(items, linked.index, cache, visiting) : { value: null, error: "参与计算的项目不存在" };
  });
  visiting.delete(targetIndex);
  if (evaluated.error || evaluated.value === null) {
    const result = { value: null, error: evaluated.error || "计算结果无效" };
    cache.set(targetIndex, result);
    return result;
  }
  if (evaluated.value < -0.000001) {
    const result = { value: null, error: "计算结果不能小于 0" };
    cache.set(targetIndex, result);
    return result;
  }
  const result = { value: toMoney(evaluated.value), error: "" };
  cache.set(targetIndex, result);
  return result;
}

export function calculateQuotationQuantityFormula(items: QuotationQuantityLinkItem[], formula: QuotationQuantityFormula) {
  const itemMap = buildQuantityLinkItemMap(items);
  const evaluated = evaluateFormulaNode(formula.expression, (itemId) => {
    const linked = itemMap.get(itemId);
    return linked ? resolveOwnedQuantity(items, linked.index, new Map(), new Set()) : { value: null, error: "参与计算的项目不存在" };
  });
  return evaluated.error || evaluated.value === null ? null : toMoney(evaluated.value);
}

export function getQuotationQuantityFormulaError(items: QuotationQuantityLinkItem[], targetIndex: number, formula: QuotationQuantityFormula) {
  const structureError = validateFormulaStructure(items, targetIndex, formula);
  if (structureError) return structureError;
  const tempItems = items.map((item, index) => index === targetIndex ? { ...item, quantity_formula: JSON.stringify(formula) } : item);
  return resolveOwnedQuantity(tempItems, targetIndex, new Map(), new Set()).error;
}

export function applyQuotationQuantityLinks<T extends QuotationQuantityLinkItem>(items: T[]) {
  const cache = new Map<number, FormulaEvaluation>();
  let changed = false;
  const nextItems = items.map((item, index) => {
    if (!parseQuotationQuantityFormula(item.quantity_formula)) return item;
    const resolution = resolveOwnedQuantity(items, index, cache, new Set());
    if (resolution.error || resolution.value === null) return item;
    const nextQuantity = toMoney(resolution.value);
    if (Math.abs(toNumber(item.quantity) - nextQuantity) < 0.000001) return item;
    changed = true;
    return { ...item, quantity: nextQuantity };
  });
  return changed ? nextItems : items;
}

function isLinearFormulaNode(node: QuotationQuantityFormulaNode): boolean {
  if (node.type !== "binary") return true;
  if (node.operator !== "add" && node.operator !== "subtract") return false;
  return isLinearFormulaNode(node.left) && isLinearFormulaNode(node.right);
}

function buildFormulaFromLinearTerms(baseItemId: string, terms: QuotationQuantityFormulaTerm[]) {
  let expression: QuotationQuantityFormulaNode = { type: "reference", itemId: baseItemId };
  terms.forEach((term) => {
    expression = {
      type: "binary",
      operator: term.operator,
      left: expression,
      right: term.constant !== undefined
        ? { type: "number", value: term.constant }
        : { type: "reference", itemId: String(term.itemId || "") },
    };
  });
  return { version: 2 as const, expression };
}

function getLinearFormulaParts(node: QuotationQuantityFormulaNode, sign: 1 | -1 = 1): {
  baseItemId: string;
  terms: QuotationQuantityFormulaTerm[];
} | null {
  if (node.type === "number") return null;
  if (node.type === "reference") return { baseItemId: node.itemId, terms: [] };
  if (node.operator !== "add" && node.operator !== "subtract") return null;
  const left = getLinearFormulaParts(node.left, sign);
  const rightSign = node.operator === "subtract" ? sign * -1 : sign;
  const right = getLinearFormulaParts(node.right, rightSign as 1 | -1);
  if (!left || !right) return null;
  const rightTerms: QuotationQuantityFormulaTerm[] = [
    {
      operator: rightSign === 1 ? "add" : "subtract",
      itemId: right.baseItemId,
    },
    ...right.terms,
  ];
  return { baseItemId: left.baseItemId, terms: [...left.terms, ...rightTerms] };
}

export type QuotationQuantityLinkDeletionRepair<T extends QuotationQuantityLinkItem> = {
  item: T;
  oldFormulaText: string;
  newFormulaText: string;
  oldQuantity: number;
  newQuantity: number;
  unlinked: boolean;
  reason: string;
};

export function repairQuotationQuantityLinksAfterDeletion<T extends QuotationQuantityLinkItem>(
  items: T[],
  deletedItemIds: Set<string>,
) {
  const remainingItems = items.filter((item) => !deletedItemIds.has(getQuantityLinkItemId(item)));
  const directChanges = new Map<number, { formula: QuotationQuantityFormula | null; reason: string }>();

  remainingItems.forEach((item, index) => {
    const formula = parseQuotationQuantityFormula(item.quantity_formula);
    if (!formula) return;
    const referencesDeletedItem = collectFormulaReferenceIds(formula.expression).some((itemId) => deletedItemIds.has(itemId));
    if (!referencesDeletedItem) return;
    if (!isLinearFormulaNode(formula.expression)) {
      directChanges.set(index, {
        formula: null,
        reason: "复杂计算公式无法安全自动修复，已保留当前数量并解除联动",
      });
      return;
    }
    const parts = getLinearFormulaParts(formula.expression);
    if (!parts) {
      directChanges.set(index, { formula: null, reason: "公式已无法继续使用，已保留当前数量并解除联动" });
      return;
    }

    const baseDeleted = deletedItemIds.has(parts.baseItemId);
    let nextBaseItemId = baseDeleted ? "" : parts.baseItemId;
    let nextTerms = parts.terms.filter((term) => !term.itemId || !deletedItemIds.has(term.itemId));
    let reason = "已移除被删除项目";
    if (baseDeleted) {
      const promotedIndex = nextTerms.findIndex((term) => term.operator === "add" && Boolean(term.itemId));
      if (promotedIndex >= 0) {
        nextBaseItemId = String(nextTerms[promotedIndex].itemId || "");
        nextTerms = nextTerms.filter((_, termIndex) => termIndex !== promotedIndex);
        reason = "基准项目已删除，系统已自动提升新的基准项目";
      } else {
        directChanges.set(index, { formula: null, reason: "剩余项目无法组成有效公式，已保留当前数量并解除联动" });
        return;
      }
    }
    if (!nextBaseItemId) {
      directChanges.set(index, { formula: null, reason });
      return;
    }
    directChanges.set(index, { formula: buildFormulaFromLinearTerms(nextBaseItemId, nextTerms), reason });
  });

  const candidateItems = remainingItems.map((item, index) => {
    const change = directChanges.get(index);
    return change ? { ...item, quantity_formula: change.formula ? JSON.stringify(change.formula) : null } : item;
  });
  const appliedItems = applyQuotationQuantityLinks(candidateItems);
  const repairs: Array<QuotationQuantityLinkDeletionRepair<T>> = [];

  const finalItems = appliedItems.map((item, index) => {
    const originalItem = remainingItems[index];
    const originalFormula = parseQuotationQuantityFormula(originalItem.quantity_formula);
    const directChange = directChanges.get(index);
    const currentFormula = parseQuotationQuantityFormula(item.quantity_formula);
    let nextItem = item;
    let unlinked = !currentFormula;
    let reason = directChange?.reason || "上游联动项目发生变化，已自动重新计算";
    if (currentFormula) {
      const formulaError = getQuotationQuantityFormulaError(appliedItems, index, currentFormula);
      if (formulaError) {
        nextItem = { ...item, quantity_formula: null };
        unlinked = true;
        reason = `${formulaError}，已保留当前数量并解除联动`;
      }
    }
    const oldQuantity = toNumber(originalItem.quantity);
    const newQuantity = toNumber(nextItem.quantity);
    const formulaChanged = Boolean(originalFormula) || Boolean(currentFormula);
    if (directChange || formulaChanged && Math.abs(oldQuantity - newQuantity) >= 0.000001 || (unlinked && Boolean(originalFormula))) {
      repairs.push({
        item: nextItem as T,
        oldFormulaText: originalFormula ? formatQuotationQuantityFormulaRows(items, originalFormula) : "",
        newFormulaText: currentFormula && !unlinked ? formatQuotationQuantityFormulaRows(appliedItems, currentFormula) : "",
        oldQuantity,
        newQuantity,
        unlinked,
        reason,
      });
    }
    return nextItem;
  });

  return { items: finalItems, repairs };
}

export function getQuotationQuantityLinkDependents(items: QuotationQuantityLinkItem[], targetIds: Set<string>) {
  return items.filter((item) => {
    const formula = parseQuotationQuantityFormula(item.quantity_formula);
    return Boolean(formula && collectFormulaReferenceIds(formula.expression).some((itemId) => targetIds.has(itemId)));
  });
}

export function remapQuotationQuantityFormulaIds(value: unknown, idMap: Map<string, string>) {
  const formula = parseQuotationQuantityFormula(value);
  if (!formula) return null;
  const expression = mapFormulaReferences(formula.expression, (itemId) => idMap.get(itemId) || null);
  return expression ? JSON.stringify({ version: 2, expression }) : null;
}

function formatFormulaNode(
  node: QuotationQuantityFormulaNode,
  formatReference: (itemId: string) => string,
  parentPrecedence = 0,
  spacedOperators = false,
): string {
  if (node.type === "number") return String(Number(node.value.toFixed(4)));
  if (node.type === "reference") return formatReference(node.itemId);
  const precedence = node.operator === "multiply" || node.operator === "divide" ? 2 : 1;
  const left = formatFormulaNode(node.left, formatReference, precedence, spacedOperators);
  const right = formatFormulaNode(
    node.right,
    formatReference,
    precedence + (node.operator === "subtract" || node.operator === "divide" ? 1 : 0),
    spacedOperators,
  );
  if (!left || !right) return "";
  const symbol = spacedOperators ? ` ${formulaOperatorSymbols[node.operator]} ` : formulaOperatorSymbols[node.operator];
  const text = `${left}${symbol}${right}`;
  return precedence < parentPrecedence ? `(${text})` : text;
}

export function formatQuotationQuantityFormulaRows(items: QuotationQuantityLinkItem[], formulaValue: unknown) {
  const formula = parseQuotationQuantityFormula(formulaValue);
  if (!formula) return "";
  const text = formatFormulaNode(formula.expression, (itemId) => {
    const index = items.findIndex((item) => getQuantityLinkItemId(item) === itemId);
    return index < 0 ? "" : `[${index + 1}]`;
  });
  return text ? `=${text}` : "";
}

export function formatQuotationQuantityFormulaNames(items: QuotationQuantityLinkItem[], formulaValue: unknown) {
  const formula = parseQuotationQuantityFormula(formulaValue);
  if (!formula) return "";
  return formatFormulaNode(formula.expression, (itemId) => {
    const index = items.findIndex((item) => getQuantityLinkItemId(item) === itemId);
    if (index < 0) return "";
    return String(items[index].name || "").trim() || `项目 ${index + 1}`;
  }, 0, true);
}

function createFormulaParser(items: QuotationQuantityLinkItem[], targetIndex: number, input: string) {
  const text = input
    .trim()
    .replace(/^=/, "")
    .replace(/[＋]/g, "+")
    .replace(/[－—–]/g, "-")
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[＊∗∙⋅]/g, "*")
    .replace(/[／]/g, "/")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "");
  let position = 0;
  const referenceIndexes: number[] = [];

  const fail = (error: string): never => {
    throw new Error(error);
  };

  const parseExpression = (): QuotationQuantityFormulaNode => {
    let node = parseTerm();
    while (position < text.length) {
      const operator = text[position];
      if (operator !== "+" && operator !== "-") break;
      position += 1;
      node = {
        type: "binary",
        operator: operator === "+" ? "add" : "subtract",
        left: node,
        right: parseTerm(),
      };
    }
    return node;
  };

  const parseTerm = (): QuotationQuantityFormulaNode => {
    let node = parseFactor();
    while (position < text.length) {
      const operator = text[position];
      if (operator !== "*" && operator !== "/") break;
      position += 1;
      node = {
        type: "binary",
        operator: operator === "*" ? "multiply" : "divide",
        left: node,
        right: parseFactor(),
      };
    }
    return node;
  };

  const parseFactor = (): QuotationQuantityFormulaNode => {
    const char = text[position];
    if (char === "+" || char === "-") {
      position += 1;
      const factor = parseFactor();
      if (char === "+") return factor;
      return { type: "binary", operator: "multiply", left: { type: "number", value: -1 }, right: factor };
    }
    if (char === "(") {
      position += 1;
      const expression = parseExpression();
      if (text[position] !== ")") fail("括号不完整");
      position += 1;
      return expression;
    }
    if (char === "[" || char === "#") {
      const closing = char === "[" ? "]" : "";
      const start = position + 1;
      let end = start;
      while (end < text.length && /\d/.test(text[end])) end += 1;
      if (end === start || (closing && text[end] !== closing)) fail("项目编号格式不正确");
      const rowNumber = Number(text.slice(start, end));
      position = closing ? end + 1 : end;
      const index = rowNumber - 1;
      if (!Number.isInteger(index) || index < 0 || index >= items.length) fail("公式引用的项目编号不存在");
      referenceIndexes.push(index);
      const itemId = getQuantityLinkItemId(items[index]);
      if (!itemId) fail("公式引用的项目缺少有效编号");
      return { type: "reference", itemId };
    }
    const match = text.slice(position).match(/^\d+(?:\.\d+)?/);
    if (!match) {
      fail("公式格式不正确");
      return { type: "number", value: 0 };
    }
    position += match[0].length;
    return { type: "number", value: Number(match[0]) };
  };

  const expression = parseExpression();
  if (position !== text.length) fail("公式格式不正确");
  if (referenceIndexes.includes(targetIndex)) fail("结果项目不能引用自己");
  const formula: QuotationQuantityFormula = { version: 2, expression };
  if (!formulaHasReferences(expression)) fail("数量联动公式至少需要引用一个项目");
  const error = getQuotationQuantityFormulaError(items, targetIndex, formula);
  if (error) fail(error);
  return formula;
}

export function parseQuotationQuantityFormulaRows(items: QuotationQuantityLinkItem[], targetIndex: number, value: unknown) {
  const text = String(value || "").trim();
  if (!text) return { formula: null as QuotationQuantityFormula | null, error: "" };
  try {
    return { formula: createFormulaParser(items, targetIndex, text), error: "" };
  } catch (error) {
    return {
      formula: null,
      error: error instanceof Error ? error.message : "数量联动公式无效",
    };
  }
}

export function parseQuotationQuantityConstantTerms(value: unknown): QuotationQuantityFormulaTerm[] | null {
  const text = String(value || "")
    .trim()
    .replace(/^=/, "")
    .replace(/[＋]/g, "+")
    .replace(/[－—–]/g, "-")
    .replace(/\s+/g, "");
  if (!text || !/^[+-]\d+(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)*$/.test(text)) return null;
  return Array.from(text.matchAll(/([+-])(\d+(?:\.\d+)?)/g)).map((match) => ({
    operator: match[1] === "-" ? "subtract" : "add",
    constant: Number(match[2]),
  }));
}
