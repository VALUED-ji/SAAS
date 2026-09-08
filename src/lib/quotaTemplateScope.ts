export type QuotaTemplateOrgUnit = {
  id: string;
  name: string;
  type?: string | null;
  parent_id?: string | null;
  is_active?: number | string | boolean | null;
};

export type QuotaTemplateOrgOption = QuotaTemplateOrgUnit & {
  depth: number;
  path: string;
  ancestorIds: string[];
};

export type QuotaTemplateAutoScope = {
  scopeType?: "global" | "branch";
  branchOrgUnitId?: string;
  branchOrgUnitName?: string;
  branchOrgUnitPath?: string;
  orgUnitId: string;
  orgUnitName: string;
  orgUnitPath: string;
  orgUnitType: string;
  companyName: string;
  createdByUserId: string;
  createdByName: string;
};

export type QuotaTemplateScopeUser = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  org_unit_id?: string | null;
  companyName?: string | null;
};

export type QuotaTemplateLike = {
  status?: string | null;
  type?: string | null;
  createdByName?: string | null;
  autoScope?: QuotaTemplateAutoScope | null;
  scope?: unknown;
  accessScope?: unknown;
  quoteConfig?: {
    mode?: string | null;
    includedArea?: unknown;
    packageTiers?: Array<{ minArea?: unknown; maxArea?: unknown }> | null;
    areaTiers?: Array<{ minArea?: unknown; maxArea?: unknown }> | null;
    combinedAreaTiers?: Array<{ minArea?: unknown; maxArea?: unknown }> | null;
  } | null;
  constructionTemplateConfig?: {
    name?: string | null;
    decorationType?: string | null;
    durationText?: string | null;
  } | null;
};

export type QuotaTemplateMatchContext = {
  user?: QuotaTemplateScopeUser | null;
  orgOptions?: QuotaTemplateOrgOption[];
  customerArea?: number | null;
  customerDecorationType?: string | null;
  customerOrgUnitId?: string | null;
  customerOrgUnitName?: string | null;
};

const pricingModeLabels: Record<string, string> = {
  list: "清单报价模式",
  package: "一口价模式",
  area: "平方报价模式",
  foundation_material_area: "基装+主材平方模式",
};

const orgTypeLabels: Record<string, string> = {
  group: "集团",
  region: "大区",
  company: "公司",
  store: "门店",
  dept: "部门",
  team: "小组",
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function toFiniteAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const text = cleanText(value);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

export function buildQuotaTemplateOrgOptions(units: QuotaTemplateOrgUnit[]): QuotaTemplateOrgOption[] {
  const map = new Map<string, QuotaTemplateOrgUnit & { children: QuotaTemplateOrgUnit[] }>();
  units.forEach((unit) => {
    const id = cleanText(unit.id);
    if (!id) return;
    map.set(id, { ...unit, id, name: cleanText(unit.name), children: [] });
  });

  const roots: Array<QuotaTemplateOrgUnit & { children: QuotaTemplateOrgUnit[] }> = [];
  map.forEach((node) => {
    const parentId = cleanText(node.parent_id);
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const options: QuotaTemplateOrgOption[] = [];
  const walk = (node: QuotaTemplateOrgUnit & { children: QuotaTemplateOrgUnit[] }, depth: number, pathParts: string[], ancestorIds: string[]) => {
    const nextPathParts = [...pathParts, node.name].filter(Boolean);
    options.push({
      ...node,
      depth,
      path: nextPathParts.join(" / "),
      ancestorIds,
    });
    node.children.forEach((child) => walk(child as QuotaTemplateOrgUnit & { children: QuotaTemplateOrgUnit[] }, depth + 1, nextPathParts, [...ancestorIds, node.id]));
  };

  roots.forEach((root) => walk(root, 0, [], []));
  return options;
}

export function isQuotaPrivilegedRole(role?: string | null) {
  const code = cleanText(role).toUpperCase();
  return code === "OWNER" || code === "ADMIN";
}

export function normalizeQuotaTemplateAutoScope(value: unknown): QuotaTemplateAutoScope | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawScopeType = cleanText(raw.scopeType ?? raw.scope_type);
  const scopeType = rawScopeType === "branch" ? "branch" : rawScopeType === "global" ? "global" : "";
  const branchOrgUnitId = cleanText(raw.branchOrgUnitId ?? raw.branch_org_unit_id);
  const branchOrgUnitName = cleanText(raw.branchOrgUnitName ?? raw.branch_org_unit_name);
  const branchOrgUnitPath = cleanText(raw.branchOrgUnitPath ?? raw.branch_org_unit_path);
  const orgUnitId = branchOrgUnitId || cleanText(raw.orgUnitId ?? raw.org_unit_id);
  const orgUnitName = branchOrgUnitName || cleanText(raw.orgUnitName ?? raw.org_unit_name);
  const orgUnitPath = branchOrgUnitPath || cleanText(raw.orgUnitPath ?? raw.org_unit_path);
  const orgUnitType = cleanText(raw.orgUnitType ?? raw.org_unit_type);
  const companyName = cleanText(raw.companyName ?? raw.company_name);
  const createdByUserId = cleanText(raw.createdByUserId ?? raw.created_by_user_id);
  const createdByName = cleanText(raw.createdByName ?? raw.created_by_name);
  if (scopeType === "global") {
    return {
      scopeType: "global",
      branchOrgUnitId: "",
      branchOrgUnitName: "",
      branchOrgUnitPath: "",
      orgUnitId: "",
      orgUnitName: "",
      orgUnitPath: "",
      orgUnitType: "",
      companyName,
      createdByUserId,
      createdByName,
    };
  }
  if (!orgUnitId && !orgUnitName && !companyName && !createdByUserId) return null;
  return {
    scopeType: orgUnitId ? "branch" : "global",
    branchOrgUnitId: orgUnitId,
    branchOrgUnitName: orgUnitName,
    branchOrgUnitPath: orgUnitPath,
    orgUnitId,
    orgUnitName,
    orgUnitPath,
    orgUnitType,
    companyName,
    createdByUserId,
    createdByName,
  };
}

export function makeQuotaTemplateAutoScope(user: QuotaTemplateScopeUser | null | undefined, orgOptions: QuotaTemplateOrgOption[] = []): QuotaTemplateAutoScope {
  const orgUnitId = cleanText(user?.org_unit_id);
  const org = orgOptions.find((option) => option.id === orgUnitId);
  return {
    scopeType: orgUnitId ? "branch" : "global",
    branchOrgUnitId: orgUnitId,
    branchOrgUnitName: org?.name || "",
    branchOrgUnitPath: org?.path || org?.name || "",
    orgUnitId,
    orgUnitName: org?.name || "",
    orgUnitPath: org?.path || org?.name || "",
    orgUnitType: org?.type || "",
    companyName: cleanText(user?.companyName),
    createdByUserId: cleanText(user?.id),
    createdByName: cleanText(user?.name),
  };
}

export function getQuotaTemplateScope(template: QuotaTemplateLike): QuotaTemplateAutoScope | null {
  return normalizeQuotaTemplateAutoScope(template.autoScope || template.scope || template.accessScope);
}

export function getQuotaOrgTypeLabel(type?: string | null) {
  const code = cleanText(type);
  return orgTypeLabels[code] || code || "组织";
}

function isSameOrDescendant(orgUnitId: string, ancestorId: string, orgOptions: QuotaTemplateOrgOption[] = []) {
  if (!orgUnitId || !ancestorId) return false;
  if (orgUnitId === ancestorId) return true;
  const option = orgOptions.find((item) => item.id === orgUnitId);
  return Boolean(option?.ancestorIds.includes(ancestorId));
}

function findOrgIdsByName(name: string, orgOptions: QuotaTemplateOrgOption[] = []) {
  const normalized = cleanText(name);
  if (!normalized) return [];
  return orgOptions.filter((option) => cleanText(option.name) === normalized).map((option) => option.id);
}

function isOrgOptionActive(option?: QuotaTemplateOrgOption | null) {
  if (!option) return false;
  return Number(option.is_active ?? 1) !== 0;
}

function findActiveOrgOption(orgUnitId: string, orgOptions: QuotaTemplateOrgOption[] = []) {
  return orgOptions.find((option) => option.id === orgUnitId && isOrgOptionActive(option)) || null;
}

function hasLoadedOrgOptions(orgOptions: QuotaTemplateOrgOption[] = []) {
  return orgOptions.length > 0;
}

export function canViewQuotaTemplate(template: QuotaTemplateLike, context: QuotaTemplateMatchContext = {}) {
  const user = context.user;
  const scope = getQuotaTemplateScope(template);
  if (!scope?.orgUnitId || scope.scopeType === "global") return false;
  if (hasLoadedOrgOptions(context.orgOptions) && !findActiveOrgOption(scope.orgUnitId, context.orgOptions)) return false;
  const currentOrgUnitId = cleanText(user?.org_unit_id);
  if (!currentOrgUnitId) return false;
  return isSameOrDescendant(currentOrgUnitId, scope.orgUnitId, context.orgOptions)
    || isSameOrDescendant(scope.orgUnitId, currentOrgUnitId, context.orgOptions);
}

export function getQuotaTemplateScopeLabel(template: QuotaTemplateLike, orgOptions: QuotaTemplateOrgOption[] = []) {
  const scope = getQuotaTemplateScope(template);
  if (!scope?.orgUnitId || scope.scopeType === "global") return "未指定分公司";
  const org = orgOptions.find((option) => option.id === scope.orgUnitId);
  if (hasLoadedOrgOptions(orgOptions) && !isOrgOptionActive(org)) return "查看范围已失效";
  const orgName = org?.name || scope.branchOrgUnitName || scope.orgUnitName || "指定分公司";
  return orgName;
}

export function getQuotaTemplateScopePath(template: QuotaTemplateLike, orgOptions: QuotaTemplateOrgOption[] = []) {
  const scope = getQuotaTemplateScope(template);
  if (!scope?.orgUnitId || scope.scopeType === "global") return "模板未绑定分公司，无法使用";
  const org = orgOptions.find((option) => option.id === scope.orgUnitId);
  if (hasLoadedOrgOptions(orgOptions) && !isOrgOptionActive(org)) return "原查看范围对应的组织已删除或停用";
  return org?.path || scope.branchOrgUnitPath || scope.orgUnitPath || scope.orgUnitName || "指定分公司";
}

function getAreaRanges(quoteConfig: QuotaTemplateLike["quoteConfig"]) {
  const mode = cleanText(quoteConfig?.mode);
  const tiers = mode === "package"
    ? quoteConfig?.packageTiers
    : mode === "area"
      ? quoteConfig?.areaTiers
      : mode === "foundation_material_area"
        ? quoteConfig?.combinedAreaTiers
        : [];
  return (Array.isArray(tiers) ? tiers : [])
    .map((tier) => ({
      min: toFiniteAmount(tier?.minArea),
      max: toFiniteAmount(tier?.maxArea),
    }))
    .filter((tier) => tier.min > 0 || tier.max > 0);
}

function formatAreaRange(range: { min: number; max: number }) {
  if (range.min <= 0 && range.max > 0) return `≤${range.max}㎡`;
  if (range.max <= 0 && range.min > 0) return `≥${range.min}㎡`;
  if (range.min > 0 && range.max > 0) return `${range.min}-${range.max}㎡`;
  return "";
}

export function getQuotaTemplateAreaRangeText(template: QuotaTemplateLike) {
  const ranges = getAreaRanges(template.quoteConfig);
  if (ranges.length === 0) return "不限面积";
  if (ranges.length === 1) return formatAreaRange(ranges[0]) || "不限面积";
  const first = formatAreaRange(ranges[0]);
  return first ? `${first}等${ranges.length}档` : `${ranges.length}个面积档`;
}

function isAreaMatched(template: QuotaTemplateLike, area?: number | null) {
  const amount = Number(area || 0);
  if (!Number.isFinite(amount) || amount <= 0) return true;
  const ranges = getAreaRanges(template.quoteConfig);
  if (ranges.length === 0) return true;
  return ranges.some((range) => amount >= range.min && (range.max <= 0 || amount <= range.max));
}

function isDecorationTypeMatched(template: QuotaTemplateLike, customerDecorationType?: string | null) {
  const customerType = cleanText(customerDecorationType);
  const templateType = cleanText(template.constructionTemplateConfig?.decorationType);
  if (!customerType || !templateType) return true;
  return customerType === templateType || customerType.includes(templateType) || templateType.includes(customerType);
}

function isCustomerInTemplateScope(template: QuotaTemplateLike, context: QuotaTemplateMatchContext) {
  const scope = getQuotaTemplateScope(template);
  if (!scope?.orgUnitId || scope.scopeType === "global") return false;
  if (hasLoadedOrgOptions(context.orgOptions) && !findActiveOrgOption(scope.orgUnitId, context.orgOptions)) return false;
  const customerOrgUnitId = cleanText(context.customerOrgUnitId);
  if (customerOrgUnitId) return isSameOrDescendant(customerOrgUnitId, scope.orgUnitId, context.orgOptions);
  const customerOrgUnitName = cleanText(context.customerOrgUnitName);
  if (!customerOrgUnitName) return true;
  const matchedOrgIds = findOrgIdsByName(customerOrgUnitName, context.orgOptions);
  if (matchedOrgIds.length === 0) return cleanText(scope.orgUnitName) === customerOrgUnitName;
  return matchedOrgIds.some((orgId) => isSameOrDescendant(orgId, scope.orgUnitId, context.orgOptions));
}

export function getQuotaTemplateMatch(template: QuotaTemplateLike, context: QuotaTemplateMatchContext = {}) {
  const reasons: string[] = [];
  const visibleToUser = canViewQuotaTemplate(template, context);
  if (!visibleToUser) reasons.push("不在当前账号查看范围");
  if (template.status === "disabled") reasons.push("模板已停用");
  if (!isCustomerInTemplateScope(template, context)) reasons.push("客户所属组织不匹配");
  if (!isAreaMatched(template, context.customerArea)) reasons.push("客户面积不在模板面积范围");
  if (!isDecorationTypeMatched(template, context.customerDecorationType)) reasons.push("装修类型不匹配");
  return {
    visibleToUser,
    recommended: visibleToUser && reasons.length === 0,
    reasons,
  };
}

export function getQuotaTemplateApplicabilityTags(template: QuotaTemplateLike) {
  const mode = cleanText(template.quoteConfig?.mode);
  return uniqueTexts([
    cleanText(template.type),
    pricingModeLabels[mode] || mode,
    cleanText(template.constructionTemplateConfig?.decorationType),
    cleanText(template.constructionTemplateConfig?.name),
    getQuotaTemplateAreaRangeText(template),
    cleanText(template.constructionTemplateConfig?.durationText),
  ]).slice(0, 5);
}
