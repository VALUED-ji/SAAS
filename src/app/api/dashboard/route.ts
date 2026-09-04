import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { canViewDashboard, getAuthContext } from "@/lib/security/authorization";

const sourceColors = ["#7657f4", "#17bfd4", "#20c997", "#ec4899", "#f59e0b", "#64748b"];
const stageColors = ["#7657f4", "#3b82f6", "#17bfd4", "#14b8a6", "#20c997", "#f59e0b", "#fb7185", "#64748b"];
const phaseLabels: Record<string, string> = {
  PENDING_START: "待开工",
  START_CONFIRM: "开工确认",
  CONSTRUCTION: "施工中",
  OWNER_SETTLEMENT: "业主结算",
  SITE_SETTLEMENT: "工地结算",
};

function normalizeSiteStage(project: any) {
  const stage = String(project?.site_stage || "").trim();
  if (phaseLabels[stage]) return stage;
  const status = String(project?.status || "").toUpperCase();
  if (status === "SIGNED") return "PENDING_START";
  if (status === "CONSTRUCTION") return "CONSTRUCTION";
  if (status === "COMPLETED") return "OWNER_SETTLEMENT";
  if (status === "CLOSED") return "SITE_SETTLEMENT";
  return "PENDING_START";
}

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

function formatSqlDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatAxisDate(value: string) {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = startOfDay(new Date(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
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
      const labelStart = formatDateLabel(normalizedStart);
      const labelEnd = formatDateLabel(normalizedEnd);
      return {
        start: normalizedStart,
        end: addDays(normalizedEnd, 1),
        label: `${labelStart} 至 ${labelEnd}`,
      };
    }
  }
  if (range === "today") return { start: today, end: tomorrow, label: "今天" };
  if (range === "yesterday") return { start: addDays(today, -1), end: today, label: "昨天" };
  if (range === "last7") return { start: addDays(today, -6), end: tomorrow, label: "最近7天" };
  if (range === "last30") return { start: addDays(today, -29), end: tomorrow, label: "最近30天" };
  if (range === "thisMonth") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: tomorrow, label: "本月" };
  if (range === "lastMonth") return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 1), label: "上月" };
  if (range === "thisQuarter") {
    const month = Math.floor(today.getMonth() / 3) * 3;
    return { start: new Date(today.getFullYear(), month, 1), end: tomorrow, label: "本季度" };
  }
  if (range === "thisYear") return { start: new Date(today.getFullYear(), 0, 1), end: tomorrow, label: "本年" };
  return { start: addDays(today, -29), end: tomorrow, label: "最近30天" };
}

function inRangeSql(column = "created_at") {
  return `${column} >= ? AND ${column} < ?`;
}

function num(value: unknown) {
  return Number(value || 0);
}

function makeSeries(start: Date, end: Date, rows: any[], valueKey = "value") {
  const map = new Map(rows.map((row) => [String(row.day), num(row[valueKey])]));
  const days: { date: string; value: number }[] = [];
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: formatAxisDate(key), value: map.get(key) || 0 });
  }
  return days;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewDashboard(auth)) return NextResponse.json({ message: "没有经营总览查看权限" }, { status: 403 });
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const rangeKey = searchParams.get("range") || "thisMonth";
  const range = getRange(rangeKey, searchParams.get("start"), searchParams.get("end"));
  const start = formatSqlDate(range.start);
  const end = formatSqlDate(range.end);

  const customerDimensionRows = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(source), ''), '未知来源') as source,
      COALESCE(status, 'NEW') as status,
      COUNT(*) as value,
      COALESCE(SUM(budget), 0) as amount
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL AND ${inRangeSql("created_at")}
    GROUP BY COALESCE(NULLIF(TRIM(source), ''), '未知来源'), COALESCE(status, 'NEW')
  `).all(auth.companyId, start, end) as any[];
  const totalCustomers = customerDimensionRows.reduce((sum, row) => sum + num(row.value), 0);

  const projects = db.prepare(`
    SELECT p.id, p.status, p.site_stage, p.contract_amount, p.created_at, p.planned_end_date,
      c.source as customer_source, c.created_by_id, c.inviter_id,
      u.name as manager_name, creator.name as creator_name, inviter.name as inviter_name,
      (
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = p.customer_id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_name
    FROM projects p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.manager_id = u.id
    LEFT JOIN users creator ON c.created_by_id = creator.id
    LEFT JOIN users inviter ON c.inviter_id = inviter.id
    WHERE p.company_id = ? AND p.deleted_at IS NULL
  `).all(auth.companyId) as any[];

  const signedProjects = projects.filter((project) =>
    ["SIGNED", "CONSTRUCTION", "COMPLETED", "CLOSED"].includes(String(project.status || ""))
  );
  const rangeSignedProjects = signedProjects.filter((project) => {
    const createdAt = String(project.created_at || "");
    return createdAt >= start && createdAt < end;
  });

  const paymentSummary = db.prepare(`
    SELECT COALESCE(SUM(pr.amount), 0) as amount
    FROM payment_records pr
    LEFT JOIN payment_plans pp ON pr.payment_plan_id = pp.id
    LEFT JOIN projects p ON pp.project_id = p.id
    WHERE p.company_id = ? AND ${inRangeSql("pr.pay_date")}
  `).get(auth.companyId, start, end) as any;

  const quotationSummary = db.prepare(`
    SELECT COUNT(*) as pending_count
    FROM quotations q
    INNER JOIN projects p ON q.project_id = p.id
    WHERE p.company_id = ?
      AND q.deleted_at IS NULL
      AND q.status = 'DRAFT'
      AND ${inRangeSql("q.created_at")}
  `).get(auth.companyId, start, end) as any;

  const openIssues = db.prepare(`
    SELECT COUNT(*) as count
    FROM site_inspections i
    INNER JOIN projects p ON i.project_id = p.id
    WHERE p.company_id = ? AND i.deleted_at IS NULL AND i.status != 'closed'
  `).get(auth.companyId) as any;

  const signedAmount = rangeSignedProjects.reduce((sum, project) => sum + num(project.contract_amount), 0);
  const receivedAmount = num(paymentSummary?.amount);
  const pendingQuotes = num(quotationSummary?.pending_count);
  const activeSites = projects.filter((project) => ["SIGNED", "CONSTRUCTION"].includes(String(project.status || ""))).length;
  const abnormalSites = projects.filter((project) => {
    const overdue = project.planned_end_date && new Date(project.planned_end_date).getTime() < Date.now() && !["COMPLETED", "CLOSED"].includes(String(project.status || ""));
    return overdue;
  }).length + num(openIssues?.count);
  const today = startOfDay(new Date());
  const todayStart = formatSqlDate(today);
  const todayEnd = formatSqlDate(addDays(today, 1));
  const todayNewCustomers = num((db.prepare(`
    SELECT COUNT(*) as total
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL AND ${inRangeSql("created_at")}
  `).get(auth.companyId, todayStart, todayEnd) as any)?.total);
  const todaySignedAmount = signedProjects.reduce((sum, project) => {
    const createdAt = String(project.created_at || "");
    return createdAt >= todayStart && createdAt < todayEnd ? sum + num(project.contract_amount) : sum;
  }, 0);
  const pendingStartContractSummary = db.prepare(`
    SELECT COALESCE(SUM(c.total_amount), 0) as amount
    FROM contracts c
    INNER JOIN projects p ON c.project_id = p.id
    WHERE c.company_id = ?
      AND p.company_id = ?
      AND c.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND UPPER(COALESCE(c.status, '')) = 'SIGNED'
      AND (
        UPPER(COALESCE(NULLIF(TRIM(p.site_stage), ''), '')) = 'PENDING_START'
        OR (
          COALESCE(TRIM(p.site_stage), '') = ''
          AND UPPER(COALESCE(p.status, '')) = 'SIGNED'
        )
      )
  `).get(auth.companyId, auth.companyId) as any;
  const pendingStartContractAmount = Math.max(0, num(pendingStartContractSummary?.amount));
  const startedSiteContractSummary = db.prepare(`
    SELECT COALESCE(SUM(c.total_amount), 0) as amount
    FROM contracts c
    INNER JOIN projects p ON c.project_id = p.id
    WHERE c.company_id = ?
      AND p.company_id = ?
      AND c.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND UPPER(COALESCE(c.status, '')) = 'SIGNED'
      AND (
        UPPER(COALESCE(NULLIF(TRIM(p.site_stage), ''), '')) IN ('CONSTRUCTION', 'OWNER_SETTLEMENT', 'SITE_SETTLEMENT')
        OR (
          COALESCE(TRIM(p.site_stage), '') = ''
          AND UPPER(COALESCE(p.status, '')) IN ('CONSTRUCTION', 'COMPLETED', 'CLOSED')
        )
      )
  `).get(auth.companyId, auth.companyId) as any;
  const startedSiteContractAmount = Math.max(0, num(startedSiteContractSummary?.amount));
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
        AND NOT EXISTS (
          SELECT 1
          FROM projects p
          INNER JOIN contracts contract ON contract.project_id = p.id
          WHERE p.customer_id = c.id
            AND p.company_id = c.company_id
            AND contract.company_id = c.company_id
            AND p.deleted_at IS NULL
            AND contract.deleted_at IS NULL
            AND UPPER(COALESCE(contract.status, '')) = 'SIGNED'
        )
      GROUP BY c.id
      HAVING SUM(MAX(COALESCE(d.amount, 0) - COALESCE(d.refund_amount, 0), 0)) > 0
    ) deposited_customers
  `).get(auth.companyId) as any;
  const depositCustomers = Math.max(0, num(depositCustomerSummary?.count));
  const customerSourceMap = new Map<string, { name: string; value: number; amount: number }>();
  customerDimensionRows.forEach((row) => {
    const name = String(row.source || "未知来源");
    const current = customerSourceMap.get(name) || { name, value: 0, amount: 0 };
    current.value += num(row.value);
    current.amount += num(row.amount);
    customerSourceMap.set(name, current);
  });
  const customerSources = Array.from(customerSourceMap.values())
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 6)
    .map((row, index) => ({
      ...row,
      color: sourceColors[index % sourceColors.length],
      percent: totalCustomers ? Math.round((row.value / totalCustomers) * 1000) / 10 : 0,
    }));

  const normalizedStatusCounts = new Map<string, number>();
  customerDimensionRows.forEach((row) => {
    const status = normalizeCustomerStatus(row.status);
    normalizedStatusCounts.set(status, (normalizedStatusCounts.get(status) || 0) + num(row.value));
  });
  const customerStages = Object.keys(customerStatusLabels)
    .map((status) => ({ status, value: normalizedStatusCounts.get(status) || 0 }))
    .filter((item) => item.value > 0)
    .map((item, index) => ({
      name: customerStatusLabels[item.status] || item.status,
      value: item.value,
      color: stageColors[index % stageColors.length],
    }));

  const funnelOrder = ["NEW", "CONTACTED", "INVITED", "MEASURED", "DEPOSITED", "SIGNED"];
  const statusRank = new Map(funnelOrder.map((status, index) => [status, index]));
  const funnel = funnelOrder.map((status, index) => {
    const count = Array.from(normalizedStatusCounts.entries()).reduce((sum, [normalized, value]) => (
      (statusRank.get(normalized) ?? 0) >= index ? sum + value : sum
    ), 0);
    const previous = index === 0 ? count : Array.from(normalizedStatusCounts.entries()).reduce((sum, [normalized, value]) => (
      (statusRank.get(normalized) ?? 0) >= index - 1 ? sum + value : sum
    ), 0);
    return {
      name: customerStatusLabels[status] || status,
      count,
      rate: previous ? Math.round((count / previous) * 1000) / 10 : 0,
      color: stageColors[index % stageColors.length],
    };
  });

  const customerTrendRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as value
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL AND ${inRangeSql("created_at")}
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(auth.companyId, start, end) as any[];

  const salesTrendRows = db.prepare(`
    SELECT date(created_at) as day, COALESCE(SUM(contract_amount), 0) as value
    FROM projects
    WHERE company_id = ? AND deleted_at IS NULL
      AND status IN ('SIGNED','CONSTRUCTION','COMPLETED','CLOSED')
      AND ${inRangeSql("created_at")}
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(auth.companyId, start, end) as any[];

  const topSalesMap = new Map<string, { name: string; amount: number; count: number }>();
  rangeSignedProjects.forEach((project) => {
    const name = project.inviter_name || project.creator_name || project.manager_name || "未分配";
    const item = topSalesMap.get(name) || { name, amount: 0, count: 0 };
    item.amount += num(project.contract_amount);
    item.count += 1;
    topSalesMap.set(name, item);
  });
  const topSales = Array.from(topSalesMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);

  const topDesignersMap = new Map<string, { name: string; amount: number; count: number }>();
  rangeSignedProjects.forEach((project) => {
    const name = String(project.designer_name || "").trim();
    if (!name) return;
    const item = topDesignersMap.get(name) || { name, amount: 0, count: 0 };
    item.amount += num(project.contract_amount);
    item.count += 1;
    topDesignersMap.set(name, item);
  });
  const topDesigners = Array.from(topDesignersMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);

  const channelSalesMap = new Map<string, { name: string; amount: number; count: number }>();
  rangeSignedProjects.forEach((project) => {
    const name = project.customer_source || "未知来源";
    const item = channelSalesMap.get(name) || { name, amount: 0, count: 0 };
    item.amount += num(project.contract_amount);
    item.count += 1;
    channelSalesMap.set(name, item);
  });
  const channelSales = Array.from(channelSalesMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((item, index) => ({ ...item, color: sourceColors[index % sourceColors.length] }));

  const siteStageMap = new Map<string, number>();
  projects.forEach((project) => {
    const stage = normalizeSiteStage(project);
    const name = phaseLabels[stage] || stage;
    siteStageMap.set(name, (siteStageMap.get(name) || 0) + 1);
  });
  const sitePhaseDist = Array.from(siteStageMap.entries()).map(([name, value], index) => ({
    name,
    value,
    color: ["#fbbf24", "#f97316", "#7657f4", "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6", "#22c55e"][index % 8],
  }));

  const conversionRate = totalCustomers ? Math.round((rangeSignedProjects.length / totalCustomers) * 1000) / 10 : 0;

  return NextResponse.json({
    range: { key: rangeKey, label: range.label, start, end },
    summary: {
      newCustomers: totalCustomers,
      signedAmount,
      receivedAmount,
      activeSites,
      pendingQuotes,
      abnormalSites,
      signedCount: rangeSignedProjects.length,
      conversionRate,
    },
    snapshot: {
      todayNewCustomers,
      todaySignedAmount,
      pendingStartContractAmount,
      startedSiteContractAmount,
      depositCustomers,
      activeSites,
      abnormalSites,
    },
    customerSources,
    customerStages,
    funnel,
    customerTrend: makeSeries(range.start, range.end, customerTrendRows),
    salesTrend: makeSeries(range.start, range.end, salesTrendRows),
    topSales,
    topDesigners,
    channelSales,
    sitePhaseDist,
  });
}
