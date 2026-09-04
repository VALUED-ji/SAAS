import { NextRequest, NextResponse } from "next/server";
import areaMap from "china-area-data";
import { getDb } from "@/lib/db";
import { customerStatusFlow, customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { canViewDashboard, getAuthContext } from "@/lib/security/authorization";

const chartPalette = ["#407AFF", "#74A0FF", "#16bdd8", "#12bf78", "#ff8a12", "#ef4444", "#7c3aed", "#0f766e"];

const siteStages = ["PENDING_START", "START_CONFIRM", "CONSTRUCTION", "OWNER_SETTLEMENT", "SITE_SETTLEMENT"] as const;
const siteStageLabels: Record<string, string> = {
  PENDING_START: "待开工",
  START_CONFIRM: "开工确认",
  CONSTRUCTION: "施工中",
  OWNER_SETTLEMENT: "业主结算",
  SITE_SETTLEMENT: "工地结算",
};
const constructionPhaseLabels: Record<string, string> = {
  DEMOLITION: "拆改",
  PLUMBING: "水电",
  MASONRY: "泥瓦",
  CARPENTRY: "木工",
  PAINTING: "油漆",
  INSTALLATION: "安装",
  DECORATION: "软装",
  INSPECTION: "验收",
};

type OrgUnit = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  address?: string | null;
  branch_settings?: string | null;
  is_active?: number | null;
};

type RangeStat = {
  name: string;
  province: string;
  region: string;
  branchCount: number;
  newCustomers: number;
  signedAmount: number;
  signedContracts: number;
  activeSites: number;
  completedSites: number;
  overdueSites: number;
  conversionRate: number;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseInputDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = startOfDay(new Date(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSqlDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatDateLabel(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRange(range: string | null, customStart?: string | null, customEnd?: string | null) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  if (range === "custom") {
    const start = parseInputDate(customStart);
    const end = parseInputDate(customEnd);
    if (start && end) {
      const normalizedStart = start <= end ? start : end;
      const normalizedEnd = start <= end ? end : start;
      return {
        start: normalizedStart,
        end: addDays(normalizedEnd, 1),
        label: `${formatDateLabel(normalizedStart)} 至 ${formatDateLabel(normalizedEnd)}`,
      };
    }
  }
  if (range === "today") return { start: today, end: tomorrow, label: "今天" };
  if (range === "yesterday") return { start: addDays(today, -1), end: today, label: "昨天" };
  if (range === "last7") return { start: addDays(today, -6), end: tomorrow, label: "最近7天" };
  if (range === "last30") return { start: addDays(today, -29), end: tomorrow, label: "最近30天" };
  if (range === "lastMonth") return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 1), label: "上月" };
  if (range === "thisQuarter") {
    const month = Math.floor(today.getMonth() / 3) * 3;
    return { start: new Date(today.getFullYear(), month, 1), end: tomorrow, label: "本季度" };
  }
  if (range === "thisYear") return { start: new Date(today.getFullYear(), 0, 1), end: tomorrow, label: "本年" };
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: tomorrow, label: "本月" };
}

function inRangeSql(column: string) {
  return `${column} >= ? AND ${column} < ?`;
}

function num(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function normalizeSiteStage(project: any) {
  const stage = String(project?.site_stage || "").trim();
  if ((siteStages as readonly string[]).includes(stage)) return stage;
  const status = String(project?.status || "").toUpperCase();
  if (status === "SIGNED") return "PENDING_START";
  if (status === "CONSTRUCTION") return "CONSTRUCTION";
  if (status === "COMPLETED") return "OWNER_SETTLEMENT";
  if (status === "CLOSED") return "SITE_SETTLEMENT";
  return "PENDING_START";
}

function getConstructionStageName(project: any) {
  const stage = normalizeSiteStage(project);
  if (stage !== "CONSTRUCTION") return siteStageLabels[stage] || stage;
  const phaseName = String(project?.current_phase_name || project?.active_phase_name || "").trim();
  if (phaseName) return phaseName;
  const phaseKey = String(project?.current_phase || "").trim();
  if (constructionPhaseLabels[phaseKey]) return constructionPhaseLabels[phaseKey];
  if (/[\u4e00-\u9fa5]/.test(phaseKey)) return phaseKey;
  return "施工中";
}

function createStat(name: string, province = name, region = name): RangeStat {
  return {
    name,
    province,
    region,
    branchCount: 0,
    newCustomers: 0,
    signedAmount: 0,
    signedContracts: 0,
    activeSites: 0,
    completedSites: 0,
    overdueSites: 0,
    conversionRate: 0,
  };
}

const provinceEntries = Object.entries(areaMap["86"] || {});
const cityProvinceHints = new Map<string, string>();
provinceEntries.forEach(([provinceCode, provinceName]) => {
  Object.values(areaMap[provinceCode] || {}).forEach((cityName) => {
    if (cityName) cityProvinceHints.set(String(cityName), String(provinceName));
  });
});

function parseBranchProvince(settings?: string | null) {
  try {
    const parsed = settings ? JSON.parse(settings) : {};
    return String(parsed?.basicInfo?.province || "").trim();
  } catch {
    return "";
  }
}

function normalizeAreaText(value: string) {
  return value
    .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市/g, "")
    .trim();
}

function inferProvinceFromText(...values: Array<string | null | undefined>) {
  const text = values.map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  if (!text) return "";
  for (const [, provinceName] of provinceEntries) {
    const name = String(provinceName);
    if (text.includes(name) || text.includes(normalizeAreaText(name))) return name;
  }
  for (const [cityName, provinceName] of cityProvinceHints.entries()) {
    if (text.includes(cityName) || text.includes(normalizeAreaText(cityName))) return provinceName;
  }
  return "";
}

function getBranchProvince(branch?: OrgUnit | null, fallbackText?: string | null) {
  return (
    parseBranchProvince(branch?.branch_settings) ||
    inferProvinceFromText(branch?.address, branch?.name, fallbackText) ||
    "未设置省份"
  );
}

function buildOrgResolver(orgUnits: OrgUnit[]) {
  const byId = new Map(orgUnits.map((unit) => [unit.id, unit]));
  const byName = new Map<string, OrgUnit[]>();
  orgUnits.forEach((unit) => {
    const name = String(unit.name || "").trim();
    if (!name) return;
    const list = byName.get(name) || [];
    list.push(unit);
    byName.set(name, list);
  });
  const typePriority = ["store", "company", "dept", "team", "region", "group"];
  byName.forEach((list) => {
    list.sort((a, b) => typePriority.indexOf(a.type) - typePriority.indexOf(b.type));
  });

  function getChain(unit?: OrgUnit | null) {
    const chain: OrgUnit[] = [];
    let current = unit || null;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      chain.push(current);
      visited.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) || null : null;
    }
    return chain;
  }

  function resolve(storeName?: string | null) {
    const fallback = String(storeName || "").trim() || "未填写门店";
    const unit = byName.get(fallback)?.[0] || null;
    const chain = getChain(unit);
    const branch = chain.find((item) => item.type === "company");
    const region = chain.find((item) => item.type === "region");
    const province = getBranchProvince(branch || unit, fallback);
    return {
      store: unit?.name || fallback,
      branch: branch?.name || fallback || "未归属分公司",
      province,
      region: region?.name || "未归属大区",
    };
  }

  function ancestorsOf(unit: OrgUnit) {
    const chain = getChain(unit);
    const region = chain.find((item) => item.type === "region");
    return {
      province: getBranchProvince(unit),
      region: region?.name || "未归属大区",
    };
  }

  return { resolve, ancestorsOf };
}

function finalizeStats<T extends RangeStat>(items: T[]) {
  return items.map((item) => ({
    ...item,
    conversionRate: item.newCustomers > 0 ? Math.round((item.signedContracts / item.newCustomers) * 1000) / 10 : 0,
  }));
}

function safeDateValue(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewDashboard(auth)) return NextResponse.json({ message: "没有集团总览查看权限" }, { status: 403 });

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const rangeKey = searchParams.get("range") || "thisMonth";
  const range = getRange(rangeKey, searchParams.get("start"), searchParams.get("end"));
  const start = formatSqlDate(range.start);
  const end = formatSqlDate(range.end);
  const now = Date.now();

  const orgUnits = db.prepare(`
    SELECT ou.id, ou.name, ou.type, ou.parent_id, ou.address, COALESCE(ou.is_active, 1) as is_active,
      bs.settings as branch_settings
    FROM org_units ou
    LEFT JOIN branch_settings bs ON bs.org_unit_id = ou.id
      AND bs.company_id = ou.company_id
      AND bs.deleted_at IS NULL
    WHERE ou.company_id = ? AND ou.deleted_at IS NULL AND COALESCE(ou.is_active, 1) = 1
  `).all(auth.companyId) as OrgUnit[];
  const orgResolver = buildOrgResolver(orgUnits);
  const provinceStats = new Map<string, RangeStat>();
  const regionStats = new Map<string, RangeStat>();
  const branchStats = new Map<string, RangeStat>();
  const branchNamesByProvince = new Map<string, Set<string>>();
  const branchNamesByRegion = new Map<string, Set<string>>();

  const ensureProvince = (name: string) => {
    const safeName = name || "未设置省份";
    if (!provinceStats.has(safeName)) provinceStats.set(safeName, createStat(safeName));
    return provinceStats.get(safeName)!;
  };
  const ensureRegion = (name: string) => {
    const safeName = name || "未归属大区";
    if (!regionStats.has(safeName)) regionStats.set(safeName, createStat(safeName, safeName, safeName));
    return regionStats.get(safeName)!;
  };
  const ensureBranch = (name: string, province: string, region: string) => {
    const safeName = name || "未归属分公司";
    if (!branchStats.has(safeName)) branchStats.set(safeName, createStat(safeName, province || "未设置省份", region || "未归属大区"));
    return branchStats.get(safeName)!;
  };

  orgUnits
    .filter((unit) => unit.type === "company")
    .forEach((unit) => {
      const { province, region } = orgResolver.ancestorsOf(unit);
      ensureProvince(province);
      ensureRegion(region);
      ensureBranch(unit.name, province, region);
      const branchSet = branchNamesByProvince.get(province) || new Set<string>();
      branchSet.add(unit.name);
      branchNamesByProvince.set(province, branchSet);
      const regionBranchSet = branchNamesByRegion.get(region) || new Set<string>();
      regionBranchSet.add(unit.name);
      branchNamesByRegion.set(region, regionBranchSet);
    });

  const rangeCustomers = db.prepare(`
    SELECT id, COALESCE(status, 'NEW') as status, service_store
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL AND ${inRangeSql("created_at")}
  `).all(auth.companyId, start, end) as any[];

  rangeCustomers.forEach((customer) => {
    const org = orgResolver.resolve(customer.service_store);
    ensureProvince(org.province).newCustomers += 1;
    ensureRegion(org.region).newCustomers += 1;
    ensureBranch(org.branch, org.province, org.region).newCustomers += 1;
    const branchSet = branchNamesByProvince.get(org.province) || new Set<string>();
    branchSet.add(org.branch);
    branchNamesByProvince.set(org.province, branchSet);
    const regionBranchSet = branchNamesByRegion.get(org.region) || new Set<string>();
    regionBranchSet.add(org.branch);
    branchNamesByRegion.set(org.region, regionBranchSet);
  });

  const signedContracts = db.prepare(`
    SELECT contract.id, contract.project_id, contract.total_amount, COALESCE(contract.signed_at, contract.effective_at, contract.created_at) as signed_time,
      p.status as project_status, p.site_stage as project_site_stage,
      c.service_store,
      COALESCE(inviter.id, creator.id, manager.id, contract_creator.id) as sales_id,
      COALESCE(inviter.name, creator.name, manager.name, contract_creator.name, '未分配') as sales_name,
      COALESCE(inviter_org.name, creator_org.name, manager_org.name, contract_creator_org.name, '未归属组织') as sales_org_name
    FROM contracts contract
    INNER JOIN projects p ON contract.project_id = p.id
    INNER JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users inviter ON c.inviter_id = inviter.id AND inviter.deleted_at IS NULL
    LEFT JOIN users creator ON c.created_by_id = creator.id AND creator.deleted_at IS NULL
    LEFT JOIN users manager ON p.manager_id = manager.id AND manager.deleted_at IS NULL
    LEFT JOIN users contract_creator ON contract.created_by_id = contract_creator.id AND contract_creator.deleted_at IS NULL
    LEFT JOIN org_units inviter_org ON inviter.org_unit_id = inviter_org.id AND inviter_org.deleted_at IS NULL
    LEFT JOIN org_units creator_org ON creator.org_unit_id = creator_org.id AND creator_org.deleted_at IS NULL
    LEFT JOIN org_units manager_org ON manager.org_unit_id = manager_org.id AND manager_org.deleted_at IS NULL
    LEFT JOIN org_units contract_creator_org ON contract_creator.org_unit_id = contract_creator_org.id AND contract_creator_org.deleted_at IS NULL
    WHERE contract.company_id = ?
      AND p.company_id = ?
      AND contract.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND UPPER(COALESCE(contract.status, '')) IN ('SIGNED', 'RESIGNED')
      AND ${inRangeSql("COALESCE(contract.signed_at, contract.effective_at, contract.created_at)")}
  `).all(auth.companyId, auth.companyId, start, end) as any[];

  signedContracts.forEach((contract) => {
    const org = orgResolver.resolve(contract.service_store);
    const amount = num(contract.total_amount);
    const province = ensureProvince(org.province);
    const region = ensureRegion(org.region);
    const branch = ensureBranch(org.branch, org.province, org.region);
    province.signedAmount += amount;
    province.signedContracts += 1;
    region.signedAmount += amount;
    region.signedContracts += 1;
    branch.signedAmount += amount;
    branch.signedContracts += 1;
    const branchSet = branchNamesByProvince.get(org.province) || new Set<string>();
    branchSet.add(org.branch);
    branchNamesByProvince.set(org.province, branchSet);
    const regionBranchSet = branchNamesByRegion.get(org.region) || new Set<string>();
    regionBranchSet.add(org.branch);
    branchNamesByRegion.set(org.region, regionBranchSet);
  });

  const siteRows = db.prepare(`
    SELECT p.id, p.status, p.site_stage, p.current_phase, p.start_date, p.planned_end_date, p.actual_end_date, p.updated_at,
      c.service_store,
      (
        SELECT phase_lookup.name
        FROM project_phases phase_lookup
        WHERE phase_lookup.project_id = p.id
          AND (
            phase_lookup.phase = p.current_phase
            OR phase_lookup.id = p.current_phase
            OR phase_lookup.name = p.current_phase
          )
        ORDER BY
          CASE
            WHEN phase_lookup.phase = p.current_phase THEN 0
            WHEN phase_lookup.id = p.current_phase THEN 1
            WHEN phase_lookup.name = p.current_phase THEN 2
            ELSE 3
          END,
          COALESCE(phase_lookup.sort_order, 999) ASC,
          datetime(COALESCE(phase_lookup.updated_at, phase_lookup.created_at, '1970-01-01')) DESC
        LIMIT 1
      ) as current_phase_name,
      (
        SELECT phase_active.name
        FROM project_phases phase_active
        WHERE phase_active.project_id = p.id
        ORDER BY
          CASE phase_active.status
            WHEN 'IN_PROGRESS' THEN 0
            WHEN 'REVIEW' THEN 1
            WHEN 'PENDING' THEN 2
            WHEN 'COMPLETED' THEN 3
            ELSE 4
          END,
          COALESCE(phase_active.sort_order, 999) ASC,
          datetime(COALESCE(phase_active.updated_at, phase_active.created_at, '1970-01-01')) DESC
        LIMIT 1
      ) as active_phase_name
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    WHERE p.company_id = ?
      AND p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND c.status = 'SIGNED'
      AND EXISTS (
        SELECT 1
        FROM contracts contract
        WHERE contract.project_id = p.id
          AND contract.deleted_at IS NULL
          AND UPPER(COALESCE(contract.status, '')) IN ('SIGNED', 'RESIGNED')
      )
      AND (
        p.status IN ('SIGNED', 'CONSTRUCTION', 'COMPLETED', 'CLOSED')
        OR p.site_stage IN ('PENDING_START', 'START_CONFIRM', 'CONSTRUCTION', 'OWNER_SETTLEMENT', 'SITE_SETTLEMENT')
      )
  `).all(auth.companyId) as any[];

  const siteStageMap = new Map<string, number>();
  let activeSites = 0;
  let completedSites = 0;
  let cumulativeCompletedSites = 0;
  let overdueSites = 0;
  let totalActiveDays = 0;

  siteRows.forEach((project) => {
    const stage = normalizeSiteStage(project);
    const stageName = getConstructionStageName(project);
    siteStageMap.set(stageName, (siteStageMap.get(stageName) || 0) + 1);
    const org = orgResolver.resolve(project.service_store);
    const province = ensureProvince(org.province);
    const region = ensureRegion(org.region);
    const branch = ensureBranch(org.branch, org.province, org.region);
    const branchSet = branchNamesByProvince.get(org.province) || new Set<string>();
    branchSet.add(org.branch);
    branchNamesByProvince.set(org.province, branchSet);
    const regionBranchSet = branchNamesByRegion.get(org.region) || new Set<string>();
    regionBranchSet.add(org.branch);
    branchNamesByRegion.set(org.region, regionBranchSet);

    if (stage === "CONSTRUCTION") {
      activeSites += 1;
      province.activeSites += 1;
      region.activeSites += 1;
      branch.activeSites += 1;
      const startTime = safeDateValue(project.start_date);
      if (startTime) totalActiveDays += Math.max(1, Math.ceil((now - startTime) / 86400000));
    }
    const completed = stage === "OWNER_SETTLEMENT" || stage === "SITE_SETTLEMENT" || ["COMPLETED", "CLOSED"].includes(String(project.status || "").toUpperCase());
    if (completed) {
      cumulativeCompletedSites += 1;
      const finishedAt = String(project.actual_end_date || project.updated_at || "");
      if (finishedAt >= start && finishedAt < end) {
        completedSites += 1;
        province.completedSites += 1;
        region.completedSites += 1;
        branch.completedSites += 1;
      }
    }
    const plannedEnd = safeDateValue(project.planned_end_date);
    if (!completed && plannedEnd && plannedEnd < now) {
      overdueSites += 1;
      province.overdueSites += 1;
      region.overdueSites += 1;
      branch.overdueSites += 1;
    }
  });

  branchNamesByProvince.forEach((branches, provinceName) => {
    ensureProvince(provinceName).branchCount = branches.size;
  });
  branchNamesByRegion.forEach((branches, regionName) => {
    ensureRegion(regionName).branchCount = branches.size;
  });

  const normalizedStatusCounts = new Map<string, number>();
  rangeCustomers.forEach((customer) => {
    const status = normalizeCustomerStatus(customer.status);
    normalizedStatusCounts.set(status, (normalizedStatusCounts.get(status) || 0) + 1);
  });
  const customerFunnel = customerStatusFlow.map((status, index) => {
    const value = normalizedStatusCounts.get(status.value) || 0;
    const total = rangeCustomers.length;
    return {
      key: status.value,
      name: customerStatusLabels[status.value] || status.label,
      value,
      percent: total ? Math.round((value / total) * 1000) / 10 : 0,
      color: chartPalette[index % chartPalette.length],
    };
  });

  const siteStageDist = Array.from(siteStageMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([name, value], index) => ({
      name,
      value,
      color: chartPalette[index % chartPalette.length],
    }));

  const followUpRows = db.prepare(`
    SELECT f.user_id, COALESCE(u.name, '未分配') as name, COALESCE(org.name, '未归属组织') as org_name, COUNT(*) as follow_count
    FROM follow_ups f
    LEFT JOIN users u ON f.user_id = u.id AND u.deleted_at IS NULL
    LEFT JOIN org_units org ON u.org_unit_id = org.id AND org.deleted_at IS NULL
    WHERE u.company_id = ?
      AND f.deleted_at IS NULL
      AND ${inRangeSql("f.created_at")}
    GROUP BY f.user_id, u.name, org.name
  `).all(auth.companyId, start, end) as any[];

  const salesMap = new Map<string, { id: string; name: string; orgName: string; signedAmount: number; signedContracts: number; followCount: number }>();
  signedContracts.forEach((contract) => {
    const id = String(contract.sales_id || contract.sales_name || "unassigned");
    const current = salesMap.get(id) || {
      id,
      name: String(contract.sales_name || "未分配"),
      orgName: String(contract.sales_org_name || "未归属组织"),
      signedAmount: 0,
      signedContracts: 0,
      followCount: 0,
    };
    current.signedAmount += num(contract.total_amount);
    current.signedContracts += 1;
    salesMap.set(id, current);
  });
  followUpRows.forEach((row) => {
    const id = String(row.user_id || row.name || "unassigned");
    const current = salesMap.get(id) || {
      id,
      name: String(row.name || "未分配"),
      orgName: String(row.org_name || "未归属组织"),
      signedAmount: 0,
      signedContracts: 0,
      followCount: 0,
    };
    current.followCount += num(row.follow_count);
    salesMap.set(id, current);
  });

  const provinces = finalizeStats(Array.from(provinceStats.values()));
  const regions = finalizeStats(Array.from(regionStats.values()));
  const branches = finalizeStats(Array.from(branchStats.values()));
  const signedAmount = signedContracts.reduce((sum, contract) => sum + num(contract.total_amount), 0);
  const pendingStartSites = new Set(
    signedContracts
      .filter((contract) => normalizeSiteStage({ status: contract.project_status, site_stage: contract.project_site_stage }) === "PENDING_START")
      .map((contract) => String(contract.project_id || "").trim())
      .filter(Boolean),
  ).size;
  const depositCustomerSummary = db.prepare(`
    SELECT COUNT(*) as count
    FROM (
      SELECT c.id
      FROM customers c
      INNER JOIN customer_deposit_records d
        ON d.customer_id = c.id AND d.company_id = c.company_id
      WHERE c.company_id = ?
        AND c.deleted_at IS NULL
        AND d.deleted_at IS NULL
        AND COALESCE(d.record_type, 'deposit') = 'deposit'
        AND d.status = 'received'
        AND ${inRangeSql("d.received_at")}
        AND NOT EXISTS (
          SELECT 1
          FROM projects p
          INNER JOIN contracts contract ON contract.project_id = p.id
          WHERE p.customer_id = c.id
            AND p.company_id = c.company_id
            AND contract.company_id = c.company_id
            AND p.deleted_at IS NULL
            AND contract.deleted_at IS NULL
            AND UPPER(COALESCE(contract.status, '')) IN ('SIGNED', 'RESIGNED')
        )
      GROUP BY c.id
      HAVING SUM(CASE
        WHEN COALESCE(d.amount, 0) - COALESCE(d.refund_amount, 0) > 0
        THEN COALESCE(d.amount, 0) - COALESCE(d.refund_amount, 0)
        ELSE 0
      END) > 0
    ) deposited_customers
  `).get(auth.companyId, start, end) as any;
  const depositCustomers = Math.max(0, num(depositCustomerSummary?.count));
  const startedContractSummary = db.prepare(`
    WITH started_projects AS (
      SELECT DISTINCT project_id
      FROM (
        SELECT CASE
          WHEN json_valid(log.detail) THEN json_extract(log.detail, '$.metadata.projectId')
          ELSE NULL
        END as project_id
        FROM operation_logs log
        WHERE log.action = 'customer.site.start.confirm'
          AND log.entity = 'customer'
          AND log.created_at >= ?
          AND log.created_at < ?
      ) log_projects
      WHERE project_id IS NOT NULL AND TRIM(project_id) != ''
    )
    SELECT COALESCE(SUM(contract.total_amount), 0) as amount
    FROM contracts contract
    INNER JOIN projects p ON contract.project_id = p.id
    WHERE contract.company_id = ?
      AND p.company_id = ?
      AND contract.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND UPPER(COALESCE(contract.status, '')) IN ('SIGNED', 'RESIGNED')
      AND (
        p.id IN (SELECT project_id FROM started_projects)
        OR (
          datetime(p.start_date) >= ?
          AND datetime(p.start_date) < ?
          AND (
            UPPER(COALESCE(NULLIF(TRIM(p.site_stage), ''), '')) IN ('CONSTRUCTION', 'OWNER_SETTLEMENT', 'SITE_SETTLEMENT')
            OR (
              COALESCE(TRIM(p.site_stage), '') = ''
              AND UPPER(COALESCE(p.status, '')) IN ('CONSTRUCTION', 'COMPLETED', 'CLOSED')
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM operation_logs log_all
            WHERE log_all.action = 'customer.site.start.confirm'
              AND log_all.entity = 'customer'
              AND CASE
                WHEN json_valid(log_all.detail) THEN json_extract(log_all.detail, '$.metadata.projectId')
                ELSE NULL
              END = p.id
          )
        )
      )
  `).get(start, end, auth.companyId, auth.companyId, start, end) as any;
  const startedContractAmount = Math.max(0, num(startedContractSummary?.amount));

  return NextResponse.json({
    range: { key: rangeKey, label: range.label, start, end },
    summary: {
      branchCount: orgUnits.filter((unit) => unit.type === "company").length || branches.length,
      newCustomers: rangeCustomers.length,
      signedAmount,
      signedContracts: signedContracts.length,
      depositCustomers,
      pendingStartSites,
      startedContractAmount,
      activeSites,
      completedSites,
      overdueSites,
      averageConstructionDays: activeSites ? Math.round(totalActiveDays / activeSites) : 0,
      cumulativeCompletedSites,
    },
    provinceStats: provinces
      .sort((a, b) => b.signedAmount - a.signedAmount || b.newCustomers - a.newCustomers || a.name.localeCompare(b.name, "zh-CN"))
      .map((item, index) => ({ ...item, color: chartPalette[index % chartPalette.length] })),
    regionStats: regions
      .sort((a, b) => b.signedAmount - a.signedAmount || b.newCustomers - a.newCustomers || a.name.localeCompare(b.name, "zh-CN"))
      .map((item, index) => ({ ...item, color: chartPalette[index % chartPalette.length] })),
    branchStats: branches
      .sort((a, b) => b.signedAmount - a.signedAmount || b.newCustomers - a.newCustomers || a.name.localeCompare(b.name, "zh-CN"))
      .map((item, index) => ({ ...item, color: chartPalette[index % chartPalette.length] })),
    provinceBottom: [...provinces]
      .sort((a, b) => a.signedAmount - b.signedAmount || a.newCustomers - b.newCustomers || a.name.localeCompare(b.name, "zh-CN"))
      .slice(0, 10)
      .map((item, index) => ({ ...item, color: chartPalette[index % chartPalette.length] })),
    regionBottom: [...regions]
      .sort((a, b) => a.signedAmount - b.signedAmount || a.newCustomers - b.newCustomers || a.name.localeCompare(b.name, "zh-CN"))
      .slice(0, 10)
      .map((item, index) => ({ ...item, color: chartPalette[index % chartPalette.length] })),
    branchBottom: [...branches]
      .sort((a, b) => a.signedAmount - b.signedAmount || a.newCustomers - b.newCustomers || a.name.localeCompare(b.name, "zh-CN"))
      .slice(0, 10)
      .map((item, index) => ({ ...item, color: chartPalette[index % chartPalette.length] })),
    customerFunnel,
    siteStageDist,
    salesTop: Array.from(salesMap.values()).sort((a, b) => b.signedAmount - a.signedAmount || b.signedContracts - a.signedContracts || b.followCount - a.followCount).slice(0, 10),
  });
}
