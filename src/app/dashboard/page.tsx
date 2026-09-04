"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  FileCheck2,
  FileSignature,
  HardHat,
  Loader2,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/data";
import SystemDateInput from "@/components/ui/SystemDateInput";
import styles from "./dashboard.module.css";

type DashboardData = {
  range: { key: string; label: string };
  summary: {
    newCustomers: number;
    signedAmount: number;
    receivedAmount: number;
    activeSites: number;
    pendingQuotes: number;
    abnormalSites: number;
    signedCount: number;
    conversionRate: number;
  };
  snapshot?: {
    todayNewCustomers: number;
    todaySignedAmount: number;
    pendingStartContractAmount: number;
    startedSiteContractAmount: number;
    depositCustomers: number;
    activeSites: number;
    abnormalSites: number;
  };
  customerSources: { name: string; value: number; amount: number; color: string; percent: number }[];
  customerStages: { name: string; value: number; color: string }[];
  funnel: { name: string; count: number; rate: number; color: string }[];
  customerTrend: { date: string; value: number }[];
  salesTrend: { date: string; value: number }[];
  topSales: { name: string; amount: number; count: number }[];
  topDesigners: { name: string; amount: number; count: number }[];
  channelSales: { name: string; amount: number; count: number; color: string }[];
  sitePhaseDist: { name: string; value: number; color: string }[];
};

const ranges = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "last7", label: "最近7天" },
  { key: "last30", label: "最近30天" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "thisQuarter", label: "本季度" },
  { key: "thisYear", label: "本年" },
  { key: "custom", label: "自定义时间" },
];

const numberFormatter = new Intl.NumberFormat("zh-CN");
const accentBlue = "var(--chart-1)";
const accentBlueMid = "var(--chart-2)";
const gridColor = "var(--chart-grid)";
const mutedText = "var(--muted)";
const sourcePalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];
const customerFunnelPalette: Record<string, string> = {
  新线索: "var(--funnel-lead)",
  已联系: "var(--funnel-contact)",
  已到店: "var(--funnel-visit)",
  已量房: "var(--funnel-measure)",
  已交定金: "var(--funnel-deposit)",
  方案报价: "var(--funnel-quote)",
  签约客户: "var(--funnel-signed)",
  "失败/流失": "var(--funnel-lost)",
};

const metricPalette = [
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-6)",
];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultCustomRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

function shortCurrency(value: number) {
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(value >= 1000000 ? 1 : 0)}万`;
  return numberFormatter.format(value);
}

function formatWanCurrency(value: number) {
  const safeValue = Number(value || 0);
  if (!safeValue) return "0万";
  const text = (safeValue / 10000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${text}万`;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      {label && <p className={styles.tooltipLabel}>{label}</p>}
      {payload.map((item: any) => {
        const isMoney = String(item.name || item.dataKey || "").includes("金额") || String(item.name || "").includes("签约");
        return (
          <p key={item.dataKey || item.name} className={styles.tooltipLine}>
            {item.name || "数据"}：
            <span className={styles.tooltipValue}>{isMoney ? formatCurrency(item.value) : numberFormatter.format(item.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

function renderActiveSourceSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, index } = props;
  return (
    <g key={`active-source-slice-${index}`} className={styles.sourceActiveSlice}>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={Math.max(0, innerRadius - 1)}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {subtitle && <p className={styles.panelSubtitle}>{subtitle}</p>}
        </div>
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function TopMetric({
  title,
  value,
  caption,
  icon: Icon,
  focus = false,
  tone = "var(--accent)",
}: {
  title: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  focus?: boolean;
  tone?: string;
}) {
  return (
    <article className={`${styles.metric} ${focus ? styles.metricFocus : ""}`} style={{ "--metric-accent": tone } as CSSProperties}>
      <div className={styles.metricHead}>
        <span className={styles.metricIcon}>
          <Icon aria-hidden="true" />
        </span>
        <p className={styles.metricLabel}>{title}</p>
      </div>
      <p className={styles.metricValue}>{value}</p>
      <p className={styles.metricCaption}>{caption}</p>
    </article>
  );
}

function RankingPanel({ title, subtitle, items }: { title: string; subtitle: string; items: DashboardData["topSales"] }) {
  return (
    <Panel title={title} subtitle={subtitle}>
      <div className={styles.rankingList}>
        {items.map((item, index) => {
          const medalClass = index === 0
            ? styles.rankGold
            : index === 1
              ? styles.rankSilver
              : index === 2
                ? styles.rankBronze
                : "";
          return (
            <div key={item.name} className={styles.rankingRow} style={{ "--ranking-accent": sourcePalette[index % sourcePalette.length] } as CSSProperties}>
              <span className={`${styles.rank} ${medalClass}`}>{index + 1}</span>
              <span className={styles.avatar}>{item.name.slice(0, 1)}</span>
              <div>
                <p className={styles.rankingName}>{item.name}</p>
                <p className={styles.rankingMeta}>签约 {numberFormatter.format(item.count)} 单</p>
              </div>
              <span className={styles.rankingValue}>{shortCurrency(item.amount)}</span>
            </div>
          );
        })}
        {items.length === 0 && <EmptyState text="暂无排行数据" />}
      </div>
    </Panel>
  );
}

function FunnelChart({ items }: { items: DashboardData["funnel"] }) {
  const hasItems = items.length > 0;
  const hasAnyData = items.some((item) => item.count > 0);
  const [showEmptyState, setShowEmptyState] = useState(!hasItems || !hasAnyData);
  const [isOpening, setIsOpening] = useState(false);
  const wasEmptyRef = useRef(!hasItems || !hasAnyData);
  useEffect(() => {
    if (!hasItems) {
      setShowEmptyState(true);
      setIsOpening(false);
      wasEmptyRef.current = true;
      return;
    }
    if (hasAnyData) {
      const shouldAnimateOpen = wasEmptyRef.current;
      wasEmptyRef.current = false;
      setShowEmptyState(false);
      if (!shouldAnimateOpen) {
        setIsOpening(false);
        return;
      }
      setIsOpening(true);
      const timer = window.setTimeout(() => setIsOpening(false), 260);
      return () => window.clearTimeout(timer);
    }
    wasEmptyRef.current = true;
    setIsOpening(false);
    const timer = window.setTimeout(() => setShowEmptyState(true), 3220);
    return () => window.clearTimeout(timer);
  }, [hasAnyData, hasItems]);
  const recoveringFromEmpty = hasAnyData && showEmptyState;
  if (!hasItems || (!hasAnyData && showEmptyState)) return <EmptyState text="暂无客户转化数据" />;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className={styles.funnel}>
      {items.map((item, index) => {
        const width = item.count > 0 ? Math.max(28, (item.count / max) * 100) : 0;
        const accentColor = customerFunnelPalette[item.name] || item.color || sourcePalette[index % sourcePalette.length];
        const hasData = item.count > 0;
        return (
          <div
            key={item.name}
            className={`${styles.funnelRow} ${hasData ? "" : styles.funnelRowEmpty}`}
            style={{
              "--funnel-accent": accentColor,
              "--funnel-width": `${width}%`,
              "--funnel-scale": !recoveringFromEmpty && !isOpening && hasData ? 1 : 0,
            } as CSSProperties}
          >
            <div className={styles.funnelTrack}>
              <span className={styles.funnelFill} style={{ backgroundColor: accentColor }}>
                <span className={styles.funnelStage}>{item.name}</span>
                <span className={styles.funnelCount}>{numberFormatter.format(item.count)}人</span>
              </span>
            </div>
            <span className={styles.funnelRate}>{item.rate}%</span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.emptyState}>{text}</div>;
}

export default function DashboardPage() {
  const [range, setRange] = useState("thisMonth");
  const [customStart, setCustomStart] = useState(() => getDefaultCustomRange().start);
  const [customEnd, setCustomEnd] = useState(() => getDefaultCustomRange().end);
  const [appliedCustomStart, setAppliedCustomStart] = useState(() => getDefaultCustomRange().start);
  const [appliedCustomEnd, setAppliedCustomEnd] = useState(() => getDefaultCustomRange().end);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("start", appliedCustomStart);
      params.set("end", appliedCustomEnd);
    }
    fetch(`/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then((next) => {
        if (alive) setData(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range, appliedCustomStart, appliedCustomEnd]);

  const summary = data?.summary;
  const activeRangeLabel = data?.range?.label || ranges.find((item) => item.key === range)?.label || "本月";
  const signedAmount = summary?.signedAmount || 0;
  const activeSites = data?.snapshot?.activeSites ?? summary?.activeSites ?? 0;
  const pendingStartContractAmount = Math.max(0, data?.snapshot?.pendingStartContractAmount ?? 0);
  const startedSiteContractAmount = Math.max(0, data?.snapshot?.startedSiteContractAmount ?? 0);
  const depositCustomers = Math.max(0, data?.snapshot?.depositCustomers ?? 0);
  const customRangeChanged = customStart !== appliedCustomStart || customEnd !== appliedCustomEnd;

  const sourceTotal = useMemo(() => (data?.customerSources || []).reduce((sum, item) => sum + item.value, 0), [data]);
  const topSales = useMemo(() => (data?.topSales || []).slice(0, 10), [data]);
  const topDesigners = useMemo(() => (data?.topDesigners || []).slice(0, 10), [data]);
  const channelTop = useMemo(() => (data?.channelSales || []).slice(0, 6), [data]);

  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setRange("custom");
    setAppliedCustomStart(customStart);
    setAppliedCustomEnd(customEnd);
  };

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={`${styles.loadingPanel} ${styles.loadingState}`}>
          <Loader2 className="animate-spin" aria-hidden="true" />
          加载经营总览...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.commandPanel} aria-label="经营总览控制区">
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>经营总览</h1>
              <p className={styles.pageSubtitle}>掌握客户、签约、施工与产值的关键经营节奏</p>
            </div>
            <span className={styles.periodBadge}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              当前周期：{activeRangeLabel}
            </span>
          </header>

          <section className={styles.toolbar} aria-label="时间筛选">
            <div className={styles.toolbarLabel}>
              <CalendarDays aria-hidden="true" />
              时间范围
            </div>
            <div className={styles.rangeGroup}>
              {ranges.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`${styles.rangeButton} ${range === item.key ? styles.rangeButtonActive : ""}`}
                  aria-pressed={range === item.key}
                >
                  {item.label}
                </button>
              ))}
              {range === "custom" && (
                <div className={`${styles.customRange} ${styles.inlineCustomRange}`}>
                  <label className={styles.dateField}>
                    开始
                    <SystemDateInput
                      value={customStart}
                      onChange={setCustomStart}
                      className={styles.dateInput}
                    />
                  </label>
                  <label className={styles.dateField}>
                    结束
                    <SystemDateInput
                      value={customEnd}
                      onChange={setCustomEnd}
                      className={styles.dateInput}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    disabled={!customStart || !customEnd || (loading && !customRangeChanged)}
                    className={styles.queryButton}
                  >
                    查询
                  </button>
                  {customRangeChanged && <span className={styles.rangeNotice}>时间已修改，点击查询后更新数据</span>}
                </div>
              )}
            </div>
          </section>
        </section>

        <section className={styles.kpiGrid} aria-label="核心经营指标">
          <TopMetric title={`${activeRangeLabel}签约合同额`} value={formatWanCurrency(signedAmount)} caption={`${activeRangeLabel}合同签约金额`} icon={TrendingUp} focus tone={metricPalette[0]} />
          <TopMetric title={`${activeRangeLabel}新增客户`} value={numberFormatter.format(summary?.newCustomers || 0)} caption={`${activeRangeLabel}录入系统的客户`} icon={UserPlus} tone={metricPalette[1]} />
          <TopMetric title={`${activeRangeLabel}签约（定金）客户`} value={numberFormatter.format(depositCustomers)} caption="已收有效定金且尚未正式签约" icon={BadgeDollarSign} tone={metricPalette[2]} />
          <TopMetric title="当前在施工地" value={numberFormatter.format(activeSites)} caption="当前正在施工的工地（当前快照）" icon={HardHat} tone={metricPalette[3]} />
          <TopMetric title={`${activeRangeLabel}待开工工地合同产值`} value={formatWanCurrency(pendingStartContractAmount)} caption="已签约且待开工的合同金额" icon={FileSignature} tone={metricPalette[4]} />
          <TopMetric title={`${activeRangeLabel}已开工工地合同产值`} value={formatWanCurrency(startedSiteContractAmount)} caption="完成开工确认后的合同金额" icon={FileCheck2} tone={metricPalette[5]} />
        </section>

        <div className={styles.dashboardGrid}>
          <div className={styles.column}>
            <Panel title="客户转化漏斗" subtitle="基于所选时间范围内新增客户的当前阶段累计统计">
              <FunnelChart items={data?.funnel || []} />
            </Panel>
          </div>

          <aside className={styles.column}>
            <Panel title="客户来源分析" subtitle={`${activeRangeLabel}来源渠道统计客户数量`}>
              <div className={styles.sourceLayout}>
                <div>
                  {sourceTotal > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart onMouseLeave={() => setActiveSourceIndex(null)}>
                        <Pie
                          data={data?.customerSources || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={78}
                          paddingAngle={2}
                          dataKey="value"
                          activeIndex={activeSourceIndex ?? undefined}
                          activeShape={renderActiveSourceSlice}
                          onMouseEnter={(_, index) => setActiveSourceIndex(index)}
                        >
                          {(data?.customerSources || []).map((item, index) => <Cell key={item.name} fill={sourcePalette[index % sourcePalette.length]} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} cursor={false} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState text="暂无客户来源数据" />
                  )}
                </div>
                <div className={styles.legend}>
                  {(data?.customerSources || []).map((item, index) => (
                    <div key={item.name} className={styles.legendRow}>
                      <span className={styles.legendName}>
                        <i className={styles.legendDot} style={{ backgroundColor: sourcePalette[index % sourcePalette.length] }} />
                        <span>{item.name}</span>
                      </span>
                      <span className={styles.numberStrong}>{item.value}</span>
                      <span className={styles.numberMuted}>{item.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </aside>
        </div>

        <div className={styles.trendStack}>
          <Panel title="客户增长趋势" subtitle="新增客户数量走势">
            <div className={styles.chartWide}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.customerTrend || []} margin={{ left: -12, right: 14, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} minTickGap={22} />
                  <YAxis tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Area type="monotone" dataKey="value" name="新增客户" stroke={accentBlue} strokeWidth={2} fill={accentBlue} fillOpacity={0.08} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="签约趋势" subtitle="合同签约金额走势">
            <div className={styles.chartWide}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.salesTrend || []} margin={{ left: -4, right: 14, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} minTickGap={22} />
                  <YAxis tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value) / 10000}万`} />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Area type="monotone" dataKey="value" name="签约金额" stroke={accentBlueMid} strokeWidth={2} fill={accentBlueMid} fillOpacity={0.08} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <div className={styles.splitGrid}>
          <RankingPanel title="家装顾问排行榜 TOP10" subtitle={`${activeRangeLabel}签约金额排名`} items={topSales} />
          <RankingPanel title="设计师排行榜 TOP10" subtitle={`${activeRangeLabel}签约金额排名`} items={topDesigners} />
        </div>

        <div className={styles.splitGrid}>
          <Panel title="当前工地阶段分布" subtitle="各施工阶段的工地数量（当前快照，不受时间筛选影响）">
            <div className={styles.chart}>
              {(data?.sitePhaseDist || []).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.sitePhaseDist || []} margin={{ left: -12, right: 10, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={false} />
                    <Bar dataKey="value" name="工地数" radius={[4, 4, 0, 0]} barSize={36}>
                      {(data?.sitePhaseDist || []).map((item, index) => <Cell key={item.name} fill={sourcePalette[index % sourcePalette.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text="暂无工地阶段数据" />
              )}
            </div>
          </Panel>

          <Panel title="渠道签约分析" subtitle={`${activeRangeLabel}客户来源统计签约金额`}>
            <div className={styles.chart}>
              {channelTop.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelTop} margin={{ left: 0, right: 14, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value) / 10000}万`} />
                    <Tooltip content={<ChartTooltip />} cursor={false} />
                    <Bar dataKey="amount" name="签约金额" radius={[4, 4, 0, 0]} barSize={52}>
                      {channelTop.map((item, index) => <Cell key={item.name} fill={sourcePalette[index % sourcePalette.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text="暂无渠道签约数据" />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
