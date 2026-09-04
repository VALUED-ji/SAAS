"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FileSignature,
  HardHat,
  Loader2,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import baseStyles from "../dashboard/dashboard.module.css";
import styles from "./group-dashboard.module.css";
import SystemDateInput from "@/components/ui/SystemDateInput";


import {
  BranchTable,
  FunnelBars,
  GroupDashboardData,
  GroupMap,
  GroupMode,
  GroupModeSwitch,
  MetricCard,
  SalesTable,
  SectionTitle,
  SiteStageChart,
  TopList,
  formatWanCurrency,
  getDefaultCustomRange,
  numberFormatter,
  ranges,
} from "./group-dashboard-charts";

export default function GroupDashboardPage() {
  const [range, setRange] = useState("thisMonth");
  const [groupMode, setGroupMode] = useState<GroupMode>("province");
  const [rankingAnimationKey, setRankingAnimationKey] = useState(0);
  const [customStart, setCustomStart] = useState(() => getDefaultCustomRange().start);
  const [customEnd, setCustomEnd] = useState(() => getDefaultCustomRange().end);
  const [appliedCustomStart, setAppliedCustomStart] = useState(() => getDefaultCustomRange().start);
  const [appliedCustomEnd, setAppliedCustomEnd] = useState(() => getDefaultCustomRange().end);
  const [data, setData] = useState<GroupDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("start", appliedCustomStart);
      params.set("end", appliedCustomEnd);
    }
    fetch(`/api/group-dashboard?${params.toString()}`)
      .then(async (res) => {
        const next = await res.json();
        if (!res.ok) throw new Error(next?.message || "集团总览加载失败");
        return next;
      })
      .then((next) => {
        if (alive) setData(next);
      })
      .catch((err) => {
        if (alive) setError(err?.message || "集团总览加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range, appliedCustomStart, appliedCustomEnd]);

  const activeRangeLabel = data?.range.label || ranges.find((item) => item.key === range)?.label || "本月";
  const summary = data?.summary;
  const customRangeChanged = customStart !== appliedCustomStart || customEnd !== appliedCustomEnd;
  const groupLabel = groupMode === "province" ? "省份" : "大区";
  const groupStats = useMemo(() => (groupMode === "province" ? data?.provinceStats || [] : data?.regionStats || []), [data, groupMode]);
  const groupBottom = useMemo(() => (groupMode === "province" ? data?.provinceBottom || [] : data?.regionBottom || []), [data, groupMode]);
  const groupTop = useMemo(() => groupStats.slice(0, 10), [groupStats]);
  const branchTop = useMemo(() => (data?.branchStats || []).slice(0, 10), [data]);
  const signedContractAmountTitle = activeRangeLabel === "最近30天" ? "最佳30天签约合同额" : `${activeRangeLabel}签约合同额`;

  const handleGroupModeChange = (mode: GroupMode) => {
    if (mode === groupMode) return;
    setGroupMode(mode);
    setRankingAnimationKey((value) => value + 1);
  };

  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setRange("custom");
    setAppliedCustomStart(customStart);
    setAppliedCustomEnd(customEnd);
  };

  if (loading && !data) {
    return (
      <div className={`${baseStyles.page} ${styles.groupPage}`}>
        <div className={`${baseStyles.loadingPanel} ${baseStyles.loadingState}`}>
          <Loader2 className="animate-spin" aria-hidden="true" />
          加载集团总览...
        </div>
      </div>
    );
  }

  return (
    <div className={`${baseStyles.page} ${styles.groupPage}`}>
      <div className={baseStyles.container}>
        <section className={styles.commandPanel} aria-label="集团总览控制区">
          <header className={`${baseStyles.pageHeader} ${styles.pageHeader}`}>
            <div>
              <h1 className={`${baseStyles.pageTitle} ${styles.pageTitle}`}>集团总览</h1>
              <p className={`${baseStyles.pageSubtitle} ${styles.pageSubtitle}`}>掌握跨区域组织、签约、客户与施工交付表现</p>
            </div>
            <span className={`${baseStyles.periodBadge} ${styles.periodBadge}`}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              当前周期：{activeRangeLabel}
            </span>
          </header>

          <section className={`${baseStyles.toolbar} ${styles.toolbar}`} aria-label="时间筛选">
            <div className={baseStyles.toolbarLabel}>
              <CalendarDays aria-hidden="true" />
              时间范围
            </div>
            <div className={baseStyles.rangeGroup}>
              {ranges.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`${baseStyles.rangeButton} ${range === item.key ? baseStyles.rangeButtonActive : ""}`}
                  aria-pressed={range === item.key}
                >
                  {item.label}
                </button>
              ))}
              {range === "custom" && (
                <div className={`${baseStyles.customRange} ${styles.inlineCustomRange}`}>
                  <label className={baseStyles.dateField}>
                    开始
                    <SystemDateInput
                      value={customStart}
                      onChange={setCustomStart}
                      className={baseStyles.dateInput}
                    />
                  </label>
                  <label className={baseStyles.dateField}>
                    结束
                    <SystemDateInput
                      value={customEnd}
                      onChange={setCustomEnd}
                      className={baseStyles.dateInput}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    disabled={!customStart || !customEnd || (loading && !customRangeChanged)}
                    className={baseStyles.queryButton}
                  >
                    查询
                  </button>
                  {customRangeChanged && <span className={baseStyles.rangeNotice}>时间已修改，点击查询后更新数据</span>}
                </div>
              )}
            </div>
          </section>
        </section>

        {error && (
          <section className={styles.error}>
            <AlertTriangle aria-hidden="true" />
            {error}
          </section>
        )}

        <SectionTitle title="全国经营沙盘" meta={activeRangeLabel} />
        <section className={`${styles.metricGridFour} ${styles.summaryMetricRail}`} aria-label="全国经营沙盘指标">
          <MetricCard title="分公司数" value={numberFormatter.format(summary?.branchCount || 0)} caption="当前启用分公司数量" icon={Building2} />
          <MetricCard title={`${activeRangeLabel}合同客户`} value={numberFormatter.format(summary?.signedContracts || 0)} caption="本期已签合同客户" icon={FileCheck2} />
          <MetricCard title={signedContractAmountTitle} value={formatWanCurrency(summary?.signedAmount || 0)} caption="已签合同额" icon={TrendingUp} emphasis />
          <MetricCard title={`${activeRangeLabel}已开工合同额`} value={formatWanCurrency(summary?.startedContractAmount || 0)} caption="本期完成开工确认合同额" icon={TrendingUp} />
        </section>

        <section className={styles.mapAnalysisPanel} aria-label="集团经营分布与排名">
          <header className={styles.mapAnalysisHeader}>
            <div>
              <h3>集团经营分布</h3>
              <p>按{groupMode === "province" ? "分公司省份" : "组织大区"}聚合签约金额与经营热度</p>
            </div>
            <GroupModeSwitch value={groupMode} onChange={handleGroupModeChange} />
          </header>
          <div className={styles.mapAnalysisBody}>
            <div className={styles.mapAnalysisMap}>
              <GroupMap
                items={groupStats}
                mode={groupMode}
                rankingItems={groupTop}
                groupLabel={groupLabel}
                rankingAnimationKey={String(rankingAnimationKey)}
              />
            </div>
          </div>
        </section>

        <SectionTitle title="核心经营指标" meta={activeRangeLabel} />
        <section className={`${styles.metricGridEight} ${styles.coreMetricGrid}`} aria-label="核心经营指标">
          <MetricCard title={`${activeRangeLabel}新增客户`} value={numberFormatter.format(summary?.newCustomers || 0)} caption="本期录入客户" icon={UsersRound} />
          <MetricCard title={`${activeRangeLabel}签约（定金）客户`} value={numberFormatter.format(summary?.depositCustomers || 0)} caption="本期已收有效定金客户" icon={BadgeDollarSign} />
          <MetricCard title={`${activeRangeLabel}签约（合同）客户`} value={numberFormatter.format(summary?.signedContracts || 0)} caption="本期已签合同客户" icon={FileCheck2} />
          <MetricCard title={signedContractAmountTitle} value={formatWanCurrency(summary?.signedAmount || 0)} caption="本期已签合同额" icon={TrendingUp} emphasis />
          <MetricCard title={`${activeRangeLabel}待开工工地数`} value={numberFormatter.format(summary?.pendingStartSites || 0)} caption="本期签约后仍待开工" icon={FileSignature} />
          <MetricCard title="当前施工中工地" value={numberFormatter.format(summary?.activeSites || 0)} caption="当前施工中的工地" icon={HardHat} />
          <MetricCard title={`${activeRangeLabel}开工合同额`} value={formatWanCurrency(summary?.startedContractAmount || 0)} caption="本期完成开工确认合同额" icon={TrendingUp} />
          <MetricCard title={`${activeRangeLabel}竣工工地`} value={numberFormatter.format(summary?.completedSites || 0)} caption="本期进入结算/竣工" icon={CheckCircle2} />
        </section>

        <SectionTitle title={`${groupLabel}排行榜`} extra={<GroupModeSwitch value={groupMode} onChange={handleGroupModeChange} />} />
        <div className={styles.splitGrid}>
          <TopList title={`${groupLabel} TOP10`} items={groupTop} transitionKey={`${groupMode}-top-${rankingAnimationKey}`} />
          <TopList title={`${groupLabel}倒数 TOP10`} items={groupBottom} transitionKey={`${groupMode}-bottom-${rankingAnimationKey}`} showMedals={false} />
        </div>

        <SectionTitle title="分公司排行榜" />
        <div className={`${styles.splitGrid} ${styles.branchGrid}`}>
          <BranchTable title="分公司 TOP10" items={branchTop} />
          <BranchTable title="分公司倒数 TOP10" items={data?.branchBottom || []} showMedals={false} />
        </div>

        <SectionTitle title="销售与交付分析" />
        <SalesTable items={data?.salesTop || []} />

        <div className={styles.analysisGrid}>
          <FunnelBars items={data?.customerFunnel || []} />
          <SiteStageChart items={data?.siteStageDist || []} />
        </div>
      </div>
    </div>
  );
}
