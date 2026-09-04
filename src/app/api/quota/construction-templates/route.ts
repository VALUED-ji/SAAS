import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { mergeBranchSettings } from "@/lib/branchSettings";
import { getCompanyRootId } from "@/lib/branchSettingsLookup";
import { canViewCustomers, getAuthContext, hasPermission } from "@/lib/security/authorization";

function safeJsonParse(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toSafeDay(value: unknown) {
  const day = Number(value || 0);
  return Number.isFinite(day) ? Math.max(0, day) : 0;
}

function normalizeDurationRule(rule: any) {
  return {
    minArea: Number(rule?.minArea || 0) || 0,
    maxArea: rule?.maxArea === null || rule?.maxArea === undefined || rule?.maxArea === ""
      ? null
      : Number(rule.maxArea || 0) || 0,
    plannedDays: toSafeDay(rule?.plannedDays),
    floorHeatingDays: toSafeDay(rule?.floorHeatingDays ?? rule?.plannedDays),
  };
}

type DurationRuleSummary = ReturnType<typeof normalizeDurationRule>;

function summarizeStandardImages(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item: any, index: number) => ({
    id: String(item?.id || `standard-image-${index}`),
    url: String(item?.url || item?.imageUrl || "").trim(),
    caption: String(item?.caption || "").trim(),
  })).filter((item) => item.url);
}

function summarizeStandard(value: any) {
  const standards = (Array.isArray(value?.standards) ? value.standards : []).map((item: any, index: number) => ({
    id: String(item?.id || `standard-${index}`),
    description: String(item?.description || "").trim(),
    images: summarizeStandardImages(item?.images),
    required: item?.required !== false,
    photoRequired: item?.photoRequired !== false,
  })).filter((item: { description: string; images: ReturnType<typeof summarizeStandardImages> }) => item.description || item.images.length > 0);
  const descriptions = Array.isArray(value?.descriptions)
    ? value.descriptions.map((item: unknown) => String(item || "").trim()).filter(Boolean)
    : [];
  const legacyImages = summarizeStandardImages(value?.images);
  const description = String(value?.description || "").trim();
  const normalizedStandards: Array<{
    id: string;
    description: string;
    images: ReturnType<typeof summarizeStandardImages>;
    required: boolean;
    photoRequired: boolean;
  }> = standards.length
    ? standards
    : descriptions.length
      ? descriptions.map((item: string, index: number) => ({
        id: `standard-description-${index}`,
        description: item,
        images: index === 0 ? legacyImages : [],
        required: true,
        photoRequired: true,
      }))
      : (description || legacyImages.length
        ? [{
          id: "standard-description-0",
          description,
          images: legacyImages,
          required: true,
          photoRequired: true,
        }]
        : []);

  return {
    description: normalizedStandards.map((item) => item.description).filter(Boolean).join("\n"),
    descriptions: normalizedStandards.map((item) => item.description).filter(Boolean),
    images: normalizedStandards.flatMap((item) => item.images),
    standards: normalizedStandards,
  };
}

function getNodeDurationRules(node: any): DurationRuleSummary[] {
  return (Array.isArray(node?.areaDurationRules) ? node.areaDurationRules : [])
    .map(normalizeDurationRule)
    .filter((rule: DurationRuleSummary) => rule.plannedDays > 0 || rule.floorHeatingDays > 0);
}

function getStageDurationRuleGroups(stage: any): DurationRuleSummary[][] {
  const nodes = Array.isArray(stage?.processNodes) ? stage.processNodes : [];
  const nodeRuleGroups = nodes.map(getNodeDurationRules).filter((rules: DurationRuleSummary[]) => rules.length > 0);
  if (nodeRuleGroups.length > 0) return nodeRuleGroups;
  const legacyRules = Array.isArray(stage?.areaDurationRules) ? stage.areaDurationRules : [];
  const normalizedLegacyRules = legacyRules.map(normalizeDurationRule).filter((rule: DurationRuleSummary) => rule.plannedDays > 0 || rule.floorHeatingDays > 0);
  return normalizedLegacyRules.length > 0 ? [normalizedLegacyRules] : [];
}

function summarizeDuration(stages: any[]) {
  const ruleGroups = stages.flatMap(getStageDurationRuleGroups);
  const maxRuleCount = ruleGroups.reduce((count, rules) => Math.max(count, rules.length), 0);
  if (maxRuleCount <= 0) return "";

  const plannedTotals: number[] = [];
  const floorHeatingTotals: number[] = [];
  for (let ruleIndex = 0; ruleIndex < maxRuleCount; ruleIndex += 1) {
    let hasRule = false;
    let plannedTotal = 0;
    let floorHeatingTotal = 0;
    ruleGroups.forEach((rules) => {
      const rule = rules[ruleIndex] || rules[rules.length - 1];
      if (!rule) return;
      hasRule = true;
      plannedTotal += toSafeDay(rule.plannedDays);
      floorHeatingTotal += toSafeDay(rule.floorHeatingDays ?? rule.plannedDays);
    });
    if (hasRule) {
      plannedTotals.push(plannedTotal);
      floorHeatingTotals.push(floorHeatingTotal);
    }
  }
  if (!plannedTotals.length) return "";

  const formatRange = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min <= 0 && max <= 0) return "";
    return min === max ? `${min}天` : `${min}-${max}天`;
  };
  const plannedText = formatRange(plannedTotals);
  const floorHeatingText = formatRange(floorHeatingTotals);
  if (!plannedText) return "";
  if (floorHeatingText && floorHeatingText !== plannedText) {
    return `常规${plannedText} / 地暖${floorHeatingText}`;
  }
  return plannedText;
}

function summarizeDurationRules(stages: any[]) {
  return stages.map((stage, stageIndex) => ({
    id: String(stage?.id || `stage-${stageIndex}`),
    name: String(stage?.name || `施工阶段${stageIndex + 1}`),
    rules: summarizeStageDurationRules(stage),
  })).filter((stage) => stage.rules.length > 0);
}

function summarizeStageDurationRules(stage: any): DurationRuleSummary[] {
  const ruleGroups = getStageDurationRuleGroups(stage);
  const maxRuleCount = ruleGroups.reduce((count, rules) => Math.max(count, rules.length), 0);
  if (!maxRuleCount) return [];
  const rules: DurationRuleSummary[] = [];
  for (let ruleIndex = 0; ruleIndex < maxRuleCount; ruleIndex += 1) {
    let minArea = 0;
    let maxArea: number | null = null;
    let plannedDays = 0;
    let floorHeatingDays = 0;
    ruleGroups.forEach((group) => {
      const rule = group[ruleIndex] || group[group.length - 1];
      if (!rule) return;
      minArea = rule.minArea;
      maxArea = rule.maxArea;
      plannedDays += toSafeDay(rule.plannedDays);
      floorHeatingDays += toSafeDay(rule.floorHeatingDays ?? rule.plannedDays);
    });
    rules.push({ minArea, maxArea, plannedDays, floorHeatingDays });
  }
  return rules;
}

function summarizeTemplateStages(stages: any[]) {
  return stages.map((stage, stageIndex) => ({
    id: String(stage?.id || `stage-${stageIndex}`),
    name: String(stage?.name || `施工阶段${stageIndex + 1}`),
    code: String(stage?.code || ""),
    sortOrder: Number(stage?.sortOrder || stageIndex + 1) || stageIndex + 1,
    nodes: (Array.isArray(stage?.processNodes) ? stage.processNodes : []).map((node: any, nodeIndex: number) => ({
      id: String(node?.id || `node-${stageIndex}-${nodeIndex}`),
      name: String(node?.name || `工序节点${nodeIndex + 1}`),
      type: node?.type === "acceptance" ? "acceptance" : "construction",
      sortOrder: Number(node?.sortOrder || nodeIndex + 1) || nodeIndex + 1,
      durationRules: getNodeDurationRules(node),
      constructionStandard: summarizeStandard(node?.constructionStandard),
      acceptanceStandard: summarizeStandard(node?.acceptanceStandard),
      logBroadcastScripts: (Array.isArray(node?.logBroadcastScripts) ? node.logBroadcastScripts : [])
        .map((item: unknown) => String(item || "").trim())
        .filter(Boolean),
      photoRequired: node?.photoRequired !== false,
      customerConfirmRequired: node?.customerConfirmRequired === true,
      projectManagerConfirmRequired: node?.projectManagerConfirmRequired === true || node?.type === "acceptance",
    })).filter((node: any) => node.name),
  })).filter((stage) => stage.name);
}

function summarizeTemplate(template: any) {
  const stages: any[] = Array.isArray(template?.stages) ? template.stages : [];
  const processNodes: any[] = stages.flatMap((stage: any) => Array.isArray(stage?.processNodes) ? stage.processNodes : []);
  return {
    id: String(template?.id || ""),
    name: String(template?.name || ""),
    description: String(template?.description || ""),
    decorationType: String(template?.decorationType || ""),
    isDefault: template?.isDefault === true,
    stageCount: stages.length,
    nodeCount: processNodes.length,
    acceptanceCount: processNodes.filter((node: any) => node?.type === "acceptance").length,
    durationText: summarizeDuration(stages),
    durationRules: summarizeDurationRules(stages),
    stages: summarizeTemplateStages(stages),
  };
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth) && !hasPermission(auth, "quotations.manage")) {
    return NextResponse.json({ message: "没有施工模板查看权限" }, { status: 403 });
  }

  try {
    const db = getDb();
    const branchId = getCompanyRootId(db, auth.orgUnitId, auth.companyId)
      || (db.prepare(`
        SELECT id
        FROM org_units
        WHERE company_id = ?
          AND type = 'company'
          AND deleted_at IS NULL
          AND COALESCE(is_active, 1) = 1
        ORDER BY sort_order ASC, datetime(COALESCE(created_at, '1970-01-01')) ASC
        LIMIT 1
      `).get(auth.companyId) as any)?.id
      || "";
    const row = branchId
      ? db.prepare("SELECT settings FROM branch_settings WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL").get(branchId, auth.companyId) as any
      : null;
    const settings = mergeBranchSettings(safeJsonParse(row?.settings));
    const items = settings.constructionTemplates.templates
      .filter((template) => template.isEnabled !== false)
      .map(summarizeTemplate)
      .filter((template) => template.id && template.name);

    return NextResponse.json({ org_unit_id: branchId || null, items });
  } catch {
    return NextResponse.json({ message: "读取施工模板失败" }, { status: 500 });
  }
}
