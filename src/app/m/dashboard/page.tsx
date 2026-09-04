"use client";

import { type ElementType, type ReactNode, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileSignature,
  HardHat,
  Loader2,
  MapPinned,
  Medal,
  Store,
  TrendingUp,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { formatCurrency } from "@/lib/data";
import styles from "../mobile.module.css";

type CockpitMode = "business" | "group";
type RangeKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "custom";
type GroupMode = "province" | "region";

type RankItem = {
  name: string;
  amount?: number;
  count?: number;
  signedAmount?: number;
  signedContracts?: number;
  followCount?: number;
  newCustomers?: number;
  activeSites?: number;
  conversionRate?: number;
  branchCount?: number;
  province?: string;
  region?: string;
  orgName?: string;
};

type SegmentItem = { name: string; value?: number; count?: number; percent?: number; color?: string };
type TrendItem = { date: string; value: number };

type BusinessDashboardData = {
  range?: { label?: string };
  summary?: {
    newCustomers?: number;
    signedAmount?: number;
    receivedAmount?: number;
    activeSites?: number;
    pendingQuotes?: number;
    abnormalSites?: number;
    signedCount?: number;
    conversionRate?: number;
  };
  snapshot?: {
    todayNewCustomers?: number;
    todaySignedAmount?: number;
    pendingStartContractAmount?: number;
    startedSiteContractAmount?: number;
    depositCustomers?: number;
    activeSites?: number;
    abnormalSites?: number;
  };
  customerSources?: SegmentItem[];
  customerStages?: SegmentItem[];
  funnel?: Array<{ name: string; count: number; rate: number }>;
  customerTrend?: TrendItem[];
  salesTrend?: TrendItem[];
  sitePhaseDist?: SegmentItem[];
  topSales?: RankItem[];
  topDesigners?: RankItem[];
  channelSales?: RankItem[];
};

type GroupDashboardData = {
  range?: { label?: string };
  summary?: {
    branchCount?: number;
    newCustomers?: number;
    signedAmount?: number;
    signedContracts?: number;
    depositCustomers?: number;
    activeSites?: number;
    completedSites?: number;
    overdueSites?: number;
    pendingStartSites?: number;
    startedContractAmount?: number;
    averageConstructionDays?: number;
    cumulativeCompletedSites?: number;
  };
  provinceStats?: RankItem[];
  regionStats?: RankItem[];
  branchStats?: RankItem[];
  provinceBottom?: RankItem[];
  regionBottom?: RankItem[];
  branchBottom?: RankItem[];
  customerFunnel?: SegmentItem[];
  siteStageDist?: SegmentItem[];
  salesTop?: RankItem[];
};

const ranges: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "last7", label: "最近7天" },
  { key: "last30", label: "最近30天" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "thisQuarter", label: "本季度" },
  { key: "thisYear", label: "本年" },
  { key: "custom", label: "自定义" },
];

const tones = ["green", "amber", "red", "blue", "purple", "cyan"] as const;
const donutPalette = ["#2f9b72", "#d98a26", "#5b7ebc", "#cf6259", "#8a6bc4", "#2d9aa0"];
const donutRadius = 50;
const donutCircumference = 2 * Math.PI * donutRadius;

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultCustomRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

function num(value: unknown) {
  return Number(value || 0);
}

function compactMoney(value: unknown) {
  const amount = num(value);
  if (Math.abs(amount) >= 10000) {
    const wan = amount / 10000;
    return `${wan.toFixed(Math.abs(wan) >= 100 ? 0 : 1).replace(/\.0$/, "")}万`;
  }
  return formatCurrency(amount).replace("¥", "");
}

function intText(value: unknown) {
  return new Intl.NumberFormat("zh-CN").format(num(value));
}

function pctText(value: unknown) {
  return `${num(value).toFixed(num(value) % 1 ? 1 : 0)}%`;
}

function MetricCard({ label, value, note, icon: Icon, tone = "green" }: { label: string; value: string; note: string; icon: ElementType; tone?: (typeof tones)[number] }) {
  return (
    <article className={styles.cockpitMetric} data-tone={tone}>
      <span><Icon /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </div>
    </article>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className={styles.cockpitSection}>
      <div className={styles.cockpitSectionHead}>
        <div>
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </div>
      </div>
      {children}
    </section>
  );
}

function MiniBars({ items, valueKey = "value" }: { items: SegmentItem[]; valueKey?: "value" | "count" }) {
  const visible = items;
  const max = Math.max(...visible.map((item) => num(item[valueKey])), 1);
  if (!visible.length) return <div className={styles.cockpitEmpty}>暂无分布数据</div>;
  return (
    <div className={styles.cockpitBars}>
      {visible.map((item, index) => {
        const value = num(item[valueKey]);
        return (
          <div className={styles.cockpitBarRow} key={`${item.name}-${index}`}>
            <span>{item.name}</span>
            <div><i style={{ width: `${Math.max(6, (value / max) * 100)}%` }} data-tone={tones[index % tones.length]} /></div>
            <strong>{intText(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function SourceDonut({ items }: { items: SegmentItem[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const visible = items.filter((item) => num(item.value) > 0).slice(0, 6);
  const total = visible.reduce((sum, item) => sum + num(item.value), 0);
  if (!visible.length || total <= 0) return <div className={styles.cockpitEmpty}>暂无客户来源数据</div>;
  const activeIndex = Math.min(selectedIndex, visible.length - 1);
  const activeItem = visible[activeIndex];
  const activeValue = num(activeItem?.value);
  const activePercent = total ? Math.round((activeValue / total) * 1000) / 10 : 0;
  let cursor = 0;
  const segments = visible.map((item, index) => {
    const value = num(item.value);
    const percent = value / total;
    const dash = Math.max(0.1, percent * donutCircumference);
    const offset = cursor;
    cursor += dash;
    const color = item.color || donutPalette[index % donutPalette.length];
    return { item, value, percent, dash, offset, color };
  });
  return (
    <div className={styles.cockpitSourceDonut}>
      <div className={styles.cockpitDonutWrap}>
        <div className={styles.cockpitDonut}>
          <svg className={styles.cockpitDonutChart} viewBox="0 0 140 140" aria-label="客户来源圆环图">
            <circle className={styles.cockpitDonutTrack} cx="70" cy="70" r={donutRadius} />
            {segments.map((segment, index) => (
              <circle
                key={`${segment.item.name}-${index}`}
                className={styles.cockpitDonutSegment}
                cx="70"
                cy="70"
                r={donutRadius}
                role="button"
                tabIndex={0}
                data-active={activeIndex === index || undefined}
                aria-label={`${segment.item.name} ${intText(segment.value)}，占比 ${Math.round(segment.percent * 1000) / 10}%`}
                style={{
                  stroke: segment.color,
                  strokeDasharray: `${segment.dash} ${donutCircumference - segment.dash}`,
                  strokeDashoffset: -segment.offset,
                }}
                onClick={() => setSelectedIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedIndex(index);
                  }
                }}
              />
            ))}
          </svg>
          <div><small>{activeItem?.name || "来源合计"}</small><b>{intText(activeValue || total)}</b><em>{activeItem ? `${activePercent}%` : "合计"}</em></div>
        </div>
      </div>
      <div className={styles.cockpitDonutLegend}>
        {segments.map((segment, index) => {
          const percent = Math.round(segment.percent * 1000) / 10;
          return (
            <button type="button" key={`${segment.item.name}-${index}`} className={styles.cockpitDonutLegendRow} data-active={activeIndex === index || undefined} onClick={() => setSelectedIndex(index)}>
              <span><i style={{ background: segment.color }} />{segment.item.name}</span>
              <strong>{intText(segment.value)}</strong>
              <em>{percent}%</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Ranking({ items, mode, showBranchCount = false }: { items: RankItem[]; mode: "money" | "org" | "person" | "channel"; showBranchCount?: boolean }) {
  const visible = items.slice(0, 10);
  if (!visible.length) return <div className={styles.cockpitEmpty}>暂无排行数据</div>;
  return (
    <div className={styles.cockpitRankList}>
      {visible.map((item, index) => {
        const amount = num(item.amount ?? item.signedAmount);
        const count = num(item.count ?? item.signedContracts ?? item.newCustomers);
        const meta = mode === "person"
          ? `${item.orgName || "未归属组织"} · 签约 ${intText(count)} 单 · 跟进 ${intText(item.followCount)} 次`
          : mode === "org"
            ? `${showBranchCount ? `${intText(item.branchCount)}家分公司 · ` : ""}客户 ${intText(item.newCustomers)} · 工地 ${intText(item.activeSites)} · 转化 ${pctText(item.conversionRate)}`
            : mode === "channel"
              ? `签约 ${intText(count)} 单`
              : `签约 ${intText(count)} 单`;
        return (
          <div className={styles.cockpitRankRow} key={`${item.name}-${index}`}>
            <span data-rank={index + 1}>{index < 3 ? <Medal /> : index + 1}</span>
            <div>
              <b>{item.name || "未命名"}</b>
              <small>{meta}</small>
            </div>
            <strong>{compactMoney(amount)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function TrendList({ items, valueType = "count" }: { items: TrendItem[]; valueType?: "count" | "money" }) {
  const visible = items.filter((item) => item.date);
  if (!visible.length) return <div className={styles.cockpitEmpty}>暂无趋势数据</div>;
  const max = Math.max(...visible.map((item) => num(item.value)), 1);
  const pointGap = 54;
  const width = Math.max(320, 52 + Math.max(visible.length - 1, 1) * pointGap + 22);
  const height = 170;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 22;
  const padBottom = 30;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const pointFor = (item: TrendItem, index: number) => {
    const x = visible.length === 1 ? padLeft + chartWidth / 2 : padLeft + (index / (visible.length - 1)) * chartWidth;
    const y = padTop + chartHeight - (num(item.value) / max) * chartHeight;
    return { x, y };
  };
  const points = visible.map(pointFor);
  const linePath = points.map((point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = points[index - 1];
    const cp1x = previous.x + (point.x - previous.x) * .5;
    const cp2x = previous.x + (point.x - previous.x) * .5;
    return `C ${cp1x.toFixed(1)} ${previous.y.toFixed(1)}, ${cp2x.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x || padLeft} ${padTop + chartHeight} L ${points[0]?.x || padLeft} ${padTop + chartHeight} Z`;
  const peak = visible.reduce((best, item) => num(item.value) > num(best.value) ? item : best, visible[0]);
  const formatValue = (value: unknown) => valueType === "money" ? compactMoney(value) : intText(value);
  const midValue = max / 2;
  const labelledIndexes = new Set<number>();
  visible.forEach((item, index) => {
    if (num(item.value) > 0 || item === peak || index === visible.length - 1) labelledIndexes.add(index);
  });
  const axisStep = visible.length <= 7 ? 1 : visible.length <= 16 ? 2 : visible.length <= 40 ? 4 : 8;
  return (
    <div className={styles.cockpitTrendCard}>
      <div className={styles.cockpitCurveWrap} data-scroll={width > 360 || undefined}>
        <svg className={styles.cockpitCurveSvg} style={{ width }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="曲线趋势图">
          <defs>
            <linearGradient id={`mobile-trend-fill-${valueType}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2f9b72" stopOpacity=".22" />
              <stop offset="100%" stopColor="#2f9b72" stopOpacity=".03" />
            </linearGradient>
          </defs>
          <path className={styles.cockpitCurveGrid} d={`M ${padLeft} ${padTop} H ${width - padRight} M ${padLeft} ${padTop + chartHeight / 2} H ${width - padRight} M ${padLeft} ${padTop + chartHeight} H ${width - padRight}`} />
          <text className={styles.cockpitCurveYLabel} x="4" y={padTop + 4}>{formatValue(max)}</text>
          <text className={styles.cockpitCurveYLabel} x="4" y={padTop + chartHeight / 2 + 4}>{formatValue(midValue)}</text>
          <text className={styles.cockpitCurveYLabel} x="4" y={padTop + chartHeight + 4}>0</text>
          <path className={styles.cockpitCurveArea} d={areaPath} fill={`url(#mobile-trend-fill-${valueType})`} />
          <path className={styles.cockpitCurveLine} d={linePath} />
          {points.map((point, index) => {
            const item = visible[index];
            const showLabel = labelledIndexes.has(index);
            return (
              <g key={`${item.date}-${index}`}>
                <circle className={styles.cockpitCurveDot} data-peak={item === peak || undefined} cx={point.x} cy={point.y} r={item === peak ? 4 : 3} />
                {showLabel && <text className={styles.cockpitCurvePointLabel} x={point.x} y={Math.max(10, point.y - 8)} textAnchor="middle">{formatValue(item.value)}</text>}
              </g>
            );
          })}
          {visible.map((axisItem, index) => {
            if (index !== 0 && index !== visible.length - 1 && index % axisStep !== 0) return null;
            const point = points[index];
            return axisItem && point ? <text key={`${axisItem.date}-axis`} className={styles.cockpitCurveXLabel} x={point.x} y={height - 7} textAnchor={index === 0 ? "start" : index === visible.length - 1 ? "end" : "middle"}>{axisItem.date}</text> : null;
          })}
        </svg>
      </div>
    </div>
  );
}

function GroupModeSwitch({ value, onChange }: { value: GroupMode; onChange: (value: GroupMode) => void }) {
  return (
    <div className={styles.cockpitMiniSwitch} role="tablist" aria-label="组织维度切换">
      <button type="button" role="tab" aria-selected={value === "province"} data-active={value === "province" || undefined} onClick={() => onChange("province")}>省份</button>
      <button type="button" role="tab" aria-selected={value === "region"} data-active={value === "region" || undefined} onClick={() => onChange("region")}>大区</button>
    </div>
  );
}

export default function MobileDashboardPage() {
  const [mode, setMode] = useState<CockpitMode>("business");
  const [groupMode, setGroupMode] = useState<GroupMode>("province");
  const [range, setRange] = useState<RangeKey>("thisMonth");
  const [customStart, setCustomStart] = useState(() => getDefaultCustomRange().start);
  const [customEnd, setCustomEnd] = useState(() => getDefaultCustomRange().end);
  const [appliedCustomStart, setAppliedCustomStart] = useState(() => getDefaultCustomRange().start);
  const [appliedCustomEnd, setAppliedCustomEnd] = useState(() => getDefaultCustomRange().end);
  const [business, setBusiness] = useState<BusinessDashboardData | null>(null);
  const [group, setGroup] = useState<GroupDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const headers = authHeaders();
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("start", appliedCustomStart);
      params.set("end", appliedCustomEnd);
    }
    Promise.all([
      fetch(`/api/dashboard?${params.toString()}`, { headers }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "经营总览加载失败");
        return payload as BusinessDashboardData;
      }),
      fetch(`/api/group-dashboard?${params.toString()}`, { headers }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "集团总览加载失败");
        return payload as GroupDashboardData;
      }),
    ]).then(([nextBusiness, nextGroup]) => {
      if (!alive) return;
      setBusiness(nextBusiness);
      setGroup(nextGroup);
    }).catch((loadError) => {
      if (alive) setError(loadError instanceof Error ? loadError.message : "驾驶舱加载失败");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [appliedCustomEnd, appliedCustomStart, range]);

  const activeLabel = (mode === "business" ? business?.range?.label : group?.range?.label) || ranges.find((item) => item.key === range)?.label || "本月";
  const businessSummary = business?.summary || {};
  const businessSnapshot = business?.snapshot || {};
  const groupSummary = group?.summary || {};
  const businessMetrics = [
    { label: `${activeLabel}签约合同额`, value: compactMoney(businessSummary.signedAmount), note: `${activeLabel}合同签约金额`, icon: TrendingUp, tone: "green" as const },
    { label: `${activeLabel}新增客户`, value: intText(businessSummary.newCustomers), note: `${activeLabel}录入系统的客户`, icon: UserPlus, tone: "amber" as const },
    { label: `${activeLabel}签约（定金）客户`, value: intText(businessSnapshot.depositCustomers), note: "已收有效定金且尚未正式签约", icon: BadgeDollarSign, tone: "purple" as const },
    { label: "当前在施工地", value: intText(businessSnapshot.activeSites ?? businessSummary.activeSites), note: "当前正在施工的工地", icon: HardHat, tone: "blue" as const },
    { label: `${activeLabel}待开工工地合同产值`, value: compactMoney(businessSnapshot.pendingStartContractAmount), note: "已签约且待开工的合同金额", icon: FileSignature, tone: "cyan" as const },
    { label: `${activeLabel}已开工工地合同产值`, value: compactMoney(businessSnapshot.startedSiteContractAmount), note: "完成开工确认后的合同金额", icon: FileCheck2, tone: "red" as const },
  ];
  const groupSandboxMetrics = [
    { label: "分公司数", value: intText(groupSummary.branchCount), note: "当前启用分公司数量", icon: Building2, tone: "blue" as const },
    { label: `${activeLabel}合同客户`, value: intText(groupSummary.signedContracts), note: "本期已签合同客户", icon: FileCheck2, tone: "green" as const },
    { label: `${activeLabel === "最近30天" ? "最佳30天" : activeLabel}签约合同额`, value: compactMoney(groupSummary.signedAmount), note: "已签合同额", icon: TrendingUp, tone: "amber" as const },
    { label: `${activeLabel}已开工合同额`, value: compactMoney(groupSummary.startedContractAmount), note: "本期完成开工确认合同额", icon: TrendingUp, tone: "purple" as const },
  ];
  const groupCoreMetrics = [
    { label: `${activeLabel}新增客户`, value: intText(groupSummary.newCustomers), note: "本期录入客户", icon: UsersRound, tone: "green" as const },
    { label: `${activeLabel}签约（定金）客户`, value: intText(groupSummary.depositCustomers), note: "本期已收有效定金客户", icon: BadgeDollarSign, tone: "amber" as const },
    { label: `${activeLabel}签约（合同）客户`, value: intText(groupSummary.signedContracts), note: "本期已签合同客户", icon: FileCheck2, tone: "blue" as const },
    { label: `${activeLabel}签约合同额`, value: compactMoney(groupSummary.signedAmount), note: "本期已签合同额", icon: TrendingUp, tone: "purple" as const },
    { label: `${activeLabel}待开工工地数`, value: intText(groupSummary.pendingStartSites), note: "本期签约后仍待开工", icon: FileSignature, tone: "cyan" as const },
    { label: "当前施工中工地", value: intText(groupSummary.activeSites), note: "当前施工中的工地", icon: HardHat, tone: "red" as const },
    { label: `${activeLabel}开工合同额`, value: compactMoney(groupSummary.startedContractAmount), note: "本期完成开工确认合同额", icon: TrendingUp, tone: "green" as const },
    { label: `${activeLabel}竣工工地`, value: intText(groupSummary.completedSites), note: "本期进入结算/竣工", icon: CheckCircle2, tone: "amber" as const },
  ];
  const groupStats = groupMode === "province" ? group?.provinceStats || [] : group?.regionStats || [];
  const groupBottom = groupMode === "province" ? group?.provinceBottom || [] : group?.regionBottom || [];
  const groupLabel = groupMode === "province" ? "省份" : "大区";
  const customRangeChanged = customStart !== appliedCustomStart || customEnd !== appliedCustomEnd;
  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setRange("custom");
    setAppliedCustomStart(customStart);
    setAppliedCustomEnd(customEnd);
  };

  return (
    <div className={styles.page}>
      <header className={styles.cockpitHeader}>
        <div className={styles.cockpitModeSwitch} role="tablist" aria-label="驾驶舱模块切换">
          <button type="button" role="tab" aria-selected={mode === "business"} data-active={mode === "business" || undefined} onClick={() => setMode("business")}><Store />经营总览</button>
          <button type="button" role="tab" aria-selected={mode === "group"} data-active={mode === "group" || undefined} onClick={() => setMode("group")}><MapPinned />集团总览</button>
        </div>
        <div className={styles.cockpitRangeScroller}>
          {ranges.map((item) => <button type="button" key={item.key} data-active={range === item.key || undefined} onClick={() => setRange(item.key)}><CalendarDays />{item.label}</button>)}
        </div>
        {range === "custom" && (
          <div className={styles.cockpitCustomRange}>
            <label><span>开始</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label><span>结束</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
            <button type="button" onClick={applyCustomRange} disabled={!customStart || !customEnd || (loading && !customRangeChanged)}>查询</button>
          </div>
        )}
      </header>

      {loading && !business && !group ? <div className={styles.loadingList}><Loader2 className="h-5 w-5 animate-spin" />正在加载驾驶舱</div> : null}
      {error ? <div className={styles.errorState}><AlertTriangle className="mx-auto mb-2 h-5 w-5" />{error}</div> : null}

      {!error && (business || group) && (
        <main className={styles.cockpitContent}>
          {mode === "business" && (
            <>
              <section className={styles.cockpitMetricGrid}>
                {businessMetrics.map((item) => <MetricCard key={item.label} {...item} />)}
              </section>
              <Section title="客户转化漏斗" subtitle="基于所选时间范围内新增客户的当前阶段累计统计">
                <MiniBars items={(business?.funnel || []).map((item) => ({ name: item.name, value: item.count, percent: item.rate }))} />
              </Section>
              <Section title="客户来源分析" subtitle={`${activeLabel}来源渠道统计客户数量`}>
                <SourceDonut items={business?.customerSources || []} />
              </Section>
              <Section title="客户增长趋势" subtitle="新增客户数量走势">
                <TrendList items={business?.customerTrend || []} />
              </Section>
              <Section title="签约趋势" subtitle="合同签约金额走势">
                <TrendList items={business?.salesTrend || []} valueType="money" />
              </Section>
              <Section title="家装顾问排行榜 TOP10" subtitle={`${activeLabel}签约金额排名`}>
                <Ranking items={business?.topSales || []} mode="money" />
              </Section>
              <Section title="设计师排行榜 TOP10" subtitle={`${activeLabel}签约金额排名`}>
                <Ranking items={business?.topDesigners || []} mode="money" />
              </Section>
              <Section title="当前工地阶段分布" subtitle="各施工阶段的工地数量（当前快照，不受时间筛选影响）">
                <MiniBars items={business?.sitePhaseDist || []} />
              </Section>
              <Section title="渠道签约分析" subtitle={`${activeLabel}客户来源统计签约金额`}>
                <Ranking items={business?.channelSales || []} mode="channel" />
              </Section>
            </>
          )}

          {mode === "group" && (
            <>
              <Section title="全国经营沙盘" subtitle="电脑端集团总览核心沙盘指标">
                <section className={styles.cockpitMetricGrid}>
                  {groupSandboxMetrics.map((item) => <MetricCard key={item.label} {...item} />)}
                </section>
              </Section>
              <Section title="集团经营分布" subtitle={`按${groupLabel}聚合签约金额与经营热度`}>
                <GroupModeSwitch value={groupMode} onChange={setGroupMode} />
                <Ranking items={groupStats} mode="org" showBranchCount />
              </Section>
              <Section title="核心经营指标" subtitle={activeLabel}>
                <section className={styles.cockpitMetricGrid}>
                  {groupCoreMetrics.map((item) => <MetricCard key={item.label} {...item} />)}
                </section>
              </Section>
              <Section title={`${groupLabel}排行榜 TOP10`} subtitle="按当前筛选时间统计">
                <GroupModeSwitch value={groupMode} onChange={setGroupMode} />
                <Ranking items={groupStats} mode="org" showBranchCount />
              </Section>
              <Section title={`${groupLabel}倒数 TOP10`} subtitle="按当前筛选时间统计">
                <Ranking items={groupBottom} mode="org" showBranchCount />
              </Section>
              <Section title="分公司 TOP10" subtitle="签约金额、新增客户和签约率">
                <Ranking items={group?.branchStats || []} mode="org" />
              </Section>
              <Section title="分公司倒数 TOP10" subtitle="签约金额、新增客户和签约率">
                <Ranking items={group?.branchBottom || []} mode="org" />
              </Section>
              <Section title="销售战区分析" subtitle="按签约金额统计销售表现">
                <Ranking items={group?.salesTop || []} mode="person" />
              </Section>
              <Section title="集团客户漏斗" subtitle="取客户管理现有客户状态">
                <MiniBars items={group?.customerFunnel || []} />
              </Section>
              <Section title="集团工地分析" subtitle="取工地管理当前施工阶段">
                <MiniBars items={group?.siteStageDist || []} />
              </Section>
            </>
          )}

          <div className={styles.cockpitTip}>
            <UsersRound />
            <span>{mode === "group" ? "集团总览用于看组织规模、区域差异和门店排名。" : "经营总览用于看当前周期的客户、签约、收款和施工状态。"}</span>
            <ChevronRight />
          </div>
        </main>
      )}
    </div>
  );
}
