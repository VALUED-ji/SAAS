// 集团总览图表组件模块
// 从 page.tsx 渐进拆出的图表、地图与排行组件。

"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  MapPinned,
  Maximize2,
  Minimize2,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import baseStyles from "../dashboard/dashboard.module.css";
import styles from "./group-dashboard.module.css";
export type OrgStat = {
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
  color: string;
};

export type GeoPoint = [number, number];

export type ChinaMapGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type ChinaMapFeature = {
  type: "Feature";
  properties?: {
    name?: string;
    center?: GeoPoint;
    centroid?: GeoPoint;
  };
  geometry?: ChinaMapGeometry | null;
};

export type ChinaMapFeatureCollection = {
  type: "FeatureCollection";
  features: ChinaMapFeature[];
};

export type MapHoverState = {
  item: OrgStat;
  point: { x: number; y: number };
};

export type GroupDashboardData = {
  range: { key: string; label: string; start: string; end: string };
  summary: {
    branchCount: number;
    newCustomers: number;
    signedAmount: number;
    signedContracts: number;
    depositCustomers: number;
    pendingStartSites: number;
    startedContractAmount: number;
    activeSites: number;
    completedSites: number;
    overdueSites: number;
    averageConstructionDays: number;
    cumulativeCompletedSites: number;
  };
  provinceStats: OrgStat[];
  regionStats: OrgStat[];
  branchStats: OrgStat[];
  provinceBottom: OrgStat[];
  regionBottom: OrgStat[];
  branchBottom: OrgStat[];
  customerFunnel: { key: string; name: string; value: number; percent: number; color: string }[];
  siteStageDist: { name: string; value: number; color: string }[];
  salesTop: { id: string; name: string; orgName: string; signedAmount: number; signedContracts: number; followCount: number }[];
};

export const ranges = [
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

export type GroupMode = "province" | "region";

export const groupModeOptions: Array<{ key: GroupMode; label: string }> = [
  { key: "province", label: "省份" },
  { key: "region", label: "大区" },
];

export const gridColor = "var(--chart-grid)";
export const mutedText = "var(--muted)";
export const numberFormatter = new Intl.NumberFormat("zh-CN");
export const chinaMapBox = { width: 920, height: 540, padding: 28 };
export const broadRegionKeys = ["华北", "华东", "华南", "华中", "西南", "西北", "东北"] as const;
export const unassignedProvinceCenter: GeoPoint = [108.9, 34.3];
export const fallbackProvinceCenters: GeoPoint[] = [
  [116.4, 39.9],
  [119.5, 31.2],
  [113.3, 23.1],
  [112.9, 30.5],
  [104.1, 30.7],
  [103.8, 36.1],
  [126.6, 45.8],
  [87.6, 43.8],
];
export const provinceRegionMap: Record<string, string> = {
  北京: "华北",
  天津: "华北",
  河北: "华北",
  山西: "华北",
  内蒙古: "华北",
  上海: "华东",
  江苏: "华东",
  浙江: "华东",
  安徽: "华东",
  福建: "华东",
  江西: "华东",
  山东: "华东",
  台湾: "华东",
  广东: "华南",
  广西: "华南",
  海南: "华南",
  香港: "华南",
  澳门: "华南",
  河南: "华中",
  湖北: "华中",
  湖南: "华中",
  重庆: "西南",
  四川: "西南",
  贵州: "西南",
  云南: "西南",
  西藏: "西南",
  陕西: "西北",
  甘肃: "西北",
  青海: "西北",
  宁夏: "西北",
  新疆: "西北",
  辽宁: "东北",
  吉林: "东北",
  黑龙江: "东北",
};
export const mapFillSteps = [
  "var(--map-empty-fill)",
  "color-mix(in oklab, var(--accent), white 88%)",
  "color-mix(in oklab, var(--accent), white 76%)",
  "color-mix(in oklab, var(--accent), white 62%)",
  "color-mix(in oklab, var(--accent), white 44%)",
  "color-mix(in oklab, var(--accent), white 20%)",
  "var(--accent)",
];
export const chartPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];
export const customerFunnelPalette: Record<string, string> = {
  NEW: "var(--funnel-lead)",
  CONTACTED: "var(--funnel-contact)",
  INVITED: "var(--funnel-visit)",
  MEASURED: "var(--funnel-measure)",
  DEPOSITED: "var(--funnel-deposit)",
  PROPOSAL: "var(--funnel-quote)",
  SIGNED: "var(--funnel-signed)",
  LOST: "var(--funnel-lost)",
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getDefaultCustomRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

export function formatWanCurrency(value: number) {
  const safeValue = Number(value || 0);
  if (!safeValue) return "0万";
  const text = (safeValue / 10000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${text}万`;
}

function shortCurrency(value: number) {
  const safeValue = Number(value || 0);
  if (!safeValue) return "0万";
  if (Math.abs(safeValue) >= 10000) return formatWanCurrency(safeValue);
  return `${numberFormatter.format(safeValue)}元`;
}

function getRankingProgressWidth(value: number, maxValue: number) {
  const safeValue = Number(value || 0);
  const safeMax = Number(maxValue || 0);
  if (safeValue <= 0 || safeMax <= 0) return "0%";
  return `${Math.max(4, (safeValue / safeMax) * 100)}%`;
}
export function EmptyState({ text }: { text: string }) {
  return <div className={baseStyles.emptyState}>{text}</div>;
}

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={baseStyles.tooltip}>
      {label && <p className={baseStyles.tooltipLabel}>{label}</p>}
      {payload.map((item: any) => {
        const isMoney = String(item.name || item.dataKey || "").includes("金额");
        return (
          <p key={item.dataKey || item.name} className={baseStyles.tooltipLine}>
            {item.name || "数据"}：
            <span className={baseStyles.tooltipValue}>{isMoney ? formatWanCurrency(Number(item.value || 0)) : numberFormatter.format(Number(item.value || 0))}</span>
          </p>
        );
      })}
    </div>
  );
}

export function SectionTitle({ title, meta, extra }: { title: string; meta?: string; extra?: ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionHeading}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {meta && <span className={styles.sectionMeta}>{meta}</span>}
      </div>
      {extra}
    </div>
  );
}

export function Panel({ title, subtitle, children, className = "", extra }: { title: string; subtitle?: string; children: ReactNode; className?: string; extra?: ReactNode }) {
  return (
    <section className={`${baseStyles.panel} ${className}`}>
      <div className={baseStyles.panelHeader}>
        <div>
          <h3 className={baseStyles.panelTitle}>{title}</h3>
          {subtitle && <p className={baseStyles.panelSubtitle}>{subtitle}</p>}
        </div>
        {extra}
      </div>
      <div className={baseStyles.panelBody}>{children}</div>
    </section>
  );
}

export function GroupModeSwitch({ value, onChange }: { value: GroupMode; onChange: (mode: GroupMode) => void }) {
  return (
    <div className={styles.modeSwitch}>
      {groupModeOptions.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`${styles.modeButton} ${value === item.key ? styles.modeButtonActive : ""}`}
          aria-pressed={value === item.key}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function MetricCard({
  title,
  value,
  caption,
  icon: Icon,
  emphasis = false,
}: {
  title: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  emphasis?: boolean;
}) {
  return (
    <article className={`${baseStyles.metric} ${emphasis ? styles.metricEmphasis : ""}`}>
      <div className={baseStyles.metricHead}>
        <span className={`${baseStyles.metricIcon} ${emphasis ? styles.metricEmphasisIcon : ""}`}>
          <Icon aria-hidden="true" />
        </span>
        <p className={baseStyles.metricLabel}>{title}</p>
      </div>
      <p className={`${baseStyles.metricValue} ${emphasis ? styles.metricEmphasisValue : ""}`}>{value}</p>
      <p className={baseStyles.metricCaption}>{caption}</p>
    </article>
  );
}

function mercatorY(lat: number) {
  const safeLat = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (safeLat * Math.PI) / 360));
}

function mercatorX(lng: number) {
  return (lng * Math.PI) / 180;
}

function forEachMapPoint(geometry: ChinaMapGeometry | null | undefined, callback: (point: GeoPoint) => void) {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    (geometry.coordinates as number[][][]).forEach((ring) => {
      ring.forEach((point) => callback([Number(point[0]), Number(point[1])]));
    });
    return;
  }
  if (geometry.type === "MultiPolygon") {
    (geometry.coordinates as number[][][][]).forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((point) => callback([Number(point[0]), Number(point[1])]));
      });
    });
  }
}

function createChinaMapProjection(features: ChinaMapFeature[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  features.forEach((feature) => {
    forEachMapPoint(feature.geometry, ([lng, lat]) => {
      const x = mercatorX(lng);
      const y = mercatorY(lat);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  const mapWidth = chinaMapBox.width - chinaMapBox.padding * 2;
  const mapHeight = chinaMapBox.height - chinaMapBox.padding * 2;
  const scale = Math.min(mapWidth / Math.max(maxX - minX, 1), mapHeight / Math.max(maxY - minY, 1));
  const offsetX = (chinaMapBox.width - (maxX - minX) * scale) / 2;
  const offsetY = (chinaMapBox.height - (maxY - minY) * scale) / 2;

  return {
    project([lng, lat]: GeoPoint) {
      return {
        x: offsetX + (mercatorX(lng) - minX) * scale,
        y: offsetY + (maxY - mercatorY(lat)) * scale,
      };
    },
  };
}

function pointToSvg(point: { x: number; y: number }) {
  return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
}

function ringToPath(ring: number[][], project: (point: GeoPoint) => { x: number; y: number }) {
  if (!ring.length) return "";
  const [first, ...rest] = ring;
  const firstPoint = project([Number(first[0]), Number(first[1])]);
  return [
    `M ${pointToSvg(firstPoint)}`,
    ...rest.map((point) => `L ${pointToSvg(project([Number(point[0]), Number(point[1])]))}`),
    "Z",
  ].join(" ");
}

function geometryToPath(geometry: ChinaMapGeometry | null | undefined, project: (point: GeoPoint) => { x: number; y: number }) {
  if (!geometry) return "";
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as number[][][]).map((ring) => ringToPath(ring, project)).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][])
      .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, project)))
      .join(" ");
  }
  return "";
}

function normalizeProvinceName(value: string) {
  return value.replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市|\s/g, "").trim();
}

function isGeoPoint(value: unknown): value is GeoPoint {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function getFeatureCenter(feature: ChinaMapFeature): GeoPoint | null {
  const centroid = feature.properties?.centroid;
  if (isGeoPoint(centroid)) return [Number(centroid[0]), Number(centroid[1])];
  const center = feature.properties?.center;
  if (isGeoPoint(center)) return [Number(center[0]), Number(center[1])];
  return null;
}

function buildProvinceCenters(features: ChinaMapFeature[]) {
  const centerMap = new Map<string, GeoPoint>();
  features.forEach((feature) => {
    const name = String(feature.properties?.name || "").trim();
    const center = getFeatureCenter(feature);
    if (!name || !center) return;
    centerMap.set(name, center);
    centerMap.set(normalizeProvinceName(name), center);
  });
  return centerMap;
}

function getProvinceCenter(name: string, centerMap: Map<string, GeoPoint>, index: number): GeoPoint {
  const provinceName = String(name || "").trim();
  if (!provinceName || provinceName.includes("未设置")) return unassignedProvinceCenter;
  return centerMap.get(provinceName) || centerMap.get(normalizeProvinceName(provinceName)) || fallbackProvinceCenters[index % fallbackProvinceCenters.length];
}

function getRegionKey(name: string) {
  const text = String(name || "").trim();
  return broadRegionKeys.find((key) => text.includes(key)) || "";
}

function getDefaultRegionForProvince(name: string) {
  return provinceRegionMap[normalizeProvinceName(name)] || "";
}

function getMapFill(value: number, maxValue: number, active: boolean) {
  if (active) return "var(--accent)";
  if (!value) return mapFillSteps[0];
  const ratio = Math.min(1, Math.max(0, value / Math.max(maxValue, 1)));
  const index = Math.min(mapFillSteps.length - 1, Math.max(1, Math.ceil(ratio * (mapFillSteps.length - 1))));
  return mapFillSteps[index];
}

function createEmptyMapStat(name: string, province: string, region: string): OrgStat {
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
    color: "var(--border)",
  };
}

export function GroupMap({
  items,
  mode,
  rankingItems = [],
  groupLabel,
  rankingAnimationKey = "",
}: {
  items: OrgStat[];
  mode: GroupMode;
  rankingItems?: OrgStat[];
  groupLabel?: string;
  rankingAnimationKey?: string;
}) {
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const [chinaMap, setChinaMap] = useState<ChinaMapFeatureCollection | null>(null);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [hovered, setHovered] = useState<MapHoverState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const maxAmount = Math.max(...items.map((item) => item.signedAmount), 1);
  const visibleItems = useMemo(() => (items.length ? items : []), [items]);
  const signedAmountTotal = useMemo(
    () => visibleItems.reduce((sum, item) => sum + Number(item.signedAmount || 0), 0),
    [visibleItems],
  );
  const mapInsight = useMemo(() => {
    const topItem = [...visibleItems].sort((a, b) => Number(b.signedAmount || 0) - Number(a.signedAmount || 0))[0] || null;
    const activeAreaCount = visibleItems.filter((item) => Number(item.signedAmount || 0) > 0 || Number(item.newCustomers || 0) > 0 || Number(item.signedContracts || 0) > 0).length;
    const branchTotal = visibleItems.reduce((sum, item) => sum + Number(item.branchCount || 0), 0);
    const customerTotal = visibleItems.reduce((sum, item) => sum + Number(item.newCustomers || 0), 0);
    const contractTotal = visibleItems.reduce((sum, item) => sum + Number(item.signedContracts || 0), 0);
    const conversionRate = customerTotal ? Math.round((contractTotal / customerTotal) * 1000) / 10 : 0;
    const topShare = topItem && signedAmountTotal ? Math.round((Number(topItem.signedAmount || 0) / signedAmountTotal) * 1000) / 10 : 0;
    return { activeAreaCount, branchTotal, customerTotal, contractTotal, conversionRate, topItem, topShare };
  }, [signedAmountTotal, visibleItems]);
  const activeMapInsight = useMemo(() => {
    if (hovered?.item) {
      const item = hovered.item;
      const customerCount = Number(item.newCustomers || 0);
      const contractCount = Number(item.signedContracts || 0);
      const contribution = signedAmountTotal ? Math.round((Number(item.signedAmount || 0) / signedAmountTotal) * 1000) / 10 : 0;
      const conversionRate = customerCount ? Math.round((contractCount / customerCount) * 1000) / 10 : 0;
      return {
        title: item.name || "当前区域",
        text: Number(item.signedAmount || 0) > 0 ? `当前区域贡献 ${contribution}%` : "当前区域暂无签约金额",
        cards: [
          { label: "签约金额", value: shortCurrency(item.signedAmount) },
          { label: "新增客户", value: numberFormatter.format(customerCount) },
          { label: "签约数", value: numberFormatter.format(contractCount) },
          { label: "签约率", value: `${conversionRate}%` },
        ],
      };
    }

    return {
      title: mapInsight.topItem?.name || "暂无区域",
      text: mapInsight.topItem ? `签约金额最高，贡献 ${mapInsight.topShare}%` : "当前筛选条件下暂无经营分布",
      cards: [
        { label: "覆盖区域", value: numberFormatter.format(mapInsight.activeAreaCount) },
        { label: "分公司", value: numberFormatter.format(mapInsight.branchTotal) },
        { label: "新增客户", value: numberFormatter.format(mapInsight.customerTotal) },
        { label: "签约率", value: `${mapInsight.conversionRate}%` },
      ],
    };
  }, [hovered, mapInsight, signedAmountTotal]);
  const rankingMaxValue = Math.max(...rankingItems.map((item) => item.signedAmount), 1);
  const projection = useMemo(() => createChinaMapProjection(chinaMap?.features || []), [chinaMap]);
  const provinceCenterMap = useMemo(() => buildProvinceCenters(chinaMap?.features || []), [chinaMap]);
  const statLookup = useMemo(() => {
    const byName = new Map<string, OrgStat>();
    const byRegion = new Map<string, OrgStat>();
    visibleItems.forEach((item) => {
      const name = String(item.name || "").trim();
      if (name) {
        byName.set(name, item);
        byName.set(normalizeProvinceName(name), item);
      }
      const regionKey = getRegionKey(item.region || item.name);
      if (regionKey) byRegion.set(regionKey, item);
    });
    return { byName, byRegion };
  }, [visibleItems]);
  const provincePaths = useMemo(() => {
    if (!chinaMap?.features.length || !projection) return [];
    return chinaMap.features
      .map((feature, index) => {
        const name = feature.properties?.name || "南海诸岛";
        const provinceStat = statLookup.byName.get(name) || statLookup.byName.get(normalizeProvinceName(name)) || null;
        const regionKey = getDefaultRegionForProvince(name);
        const regionStat = regionKey ? statLookup.byRegion.get(regionKey) || null : null;
        const stat = mode === "province"
          ? provinceStat || createEmptyMapStat(name, name, regionKey || "未归属大区")
          : regionStat || createEmptyMapStat(regionKey || name, name, regionKey || "未归属大区");
        const center = getFeatureCenter(feature) || getProvinceCenter(name, provinceCenterMap, index);
        return {
          key: `${name}-${index}`,
          name,
          center,
          point: projection.project(center),
          stat,
          hasData: mode === "province" ? Boolean(provinceStat) : Boolean(regionStat),
          path: geometryToPath(feature.geometry, projection.project),
        };
      })
      .filter((item) => item.path);
  }, [chinaMap, mode, projection, provinceCenterMap, statLookup]);
  useEffect(() => {
    let alive = true;
    fetch("/maps/china.json")
      .then(async (res) => {
        if (!res.ok) throw new Error("地图数据加载失败");
        return res.json() as Promise<ChinaMapFeatureCollection>;
      })
      .then((next) => {
        if (!alive) return;
        const features = Array.isArray(next?.features) ? next.features : [];
        setChinaMap({ ...next, features });
        setMapLoadFailed(false);
      })
      .catch(() => {
        if (alive) setMapLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === mapFrameRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = () => {
    const node = mapFrameRef.current;
    if (!node) return;

    if (document.fullscreenElement === node) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    void node.requestFullscreen().catch(() => undefined);
  };

  return (
    <div
      ref={mapFrameRef}
      className={`${styles.mapFrame} ${isFullscreen ? styles.mapFrameFullscreen : ""}`}
    >
      <div className={styles.mapFullscreenHeader} aria-hidden={!isFullscreen}>
        <div className={styles.mapFullscreenTitle}>
          <MapPinned aria-hidden="true" />
          <div>
            <p>中国地图 · {mode === "province" ? "省份" : "大区"}经营分布</p>
            <span>按签约金额展示经营热度</span>
          </div>
        </div>
        <div className={styles.mapFullscreenStats}>
          <span>{numberFormatter.format(visibleItems.length)} 个区域</span>
          <span>{formatWanCurrency(signedAmountTotal)}</span>
        </div>
      </div>
      <div className={styles.mapBadge}>
        <MapPinned aria-hidden="true" />
        中国地图 · {mode === "province" ? "省份" : "大区"}经营分布
      </div>
      <div className={styles.mapInsightPanel}>
        <div className={styles.mapInsightHeader}>
          <span>地图洞察</span>
          <strong>{activeMapInsight.title}</strong>
        </div>
        <p className={styles.mapInsightText}>{activeMapInsight.text}</p>
        <div className={styles.mapInsightGrid}>
          {activeMapInsight.cards.map((card) => (
            <span key={card.label}>
              <b>{card.value}</b>
              {card.label}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label={isFullscreen ? "退出全屏" : "全屏查看地图"}
        title={isFullscreen ? "退出全屏" : "全屏查看地图"}
        onClick={toggleFullscreen}
        className={styles.mapFullscreenButton}
      >
        {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
      </button>
      <div className={styles.mapLegend}>
        <div className={styles.mapLegendLabel}>签约金额强度</div>
        <div className={styles.mapLegendScale}>
          {mapFillSteps.slice(1).map((color) => (
            <span key={color} className={styles.mapLegendStep} style={{ backgroundColor: color }} />
          ))}
        </div>
        <div className={styles.mapLegendRange}>
          <span>低</span>
          <span>高</span>
        </div>
      </div>
      {rankingItems.length > 0 && (
        <aside className={styles.mapRankingOverlay} aria-label={`${groupLabel || (mode === "province" ? "省份" : "大区")} TOP10`}>
          <div className={styles.mapRankingOverlayHeader}>
            <div>
              <h4>{groupLabel || (mode === "province" ? "省份" : "大区")} TOP10</h4>
              <p>按当前筛选时间统计</p>
            </div>
          </div>
          <div
            key={`map-ranking-${mode}-${rankingAnimationKey}`}
            className={styles.mapRankingOverlayList}
          >
            {rankingItems.slice(0, 10).map((item, index) => (
              <div key={`map-ranking-${item.name}`} className={styles.mapRankingOverlayRow}>
                <span className={`${styles.rank} ${index < 3 ? styles.rankTop : ""}`}>{index + 1}</span>
                <div className={styles.topListMain}>
                  <div className={styles.topListHeader}>
                    <span className={styles.topListName}>{item.name}</span>
                    <span className={styles.topListMeta}>{item.branchCount || 0}家分公司</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <span className={styles.progressFill} style={{ width: getRankingProgressWidth(item.signedAmount, rankingMaxValue) }} />
                  </div>
                </div>
                <span className={styles.topListValue}>{shortCurrency(item.signedAmount)}</span>
              </div>
            ))}
          </div>
        </aside>
      )}
      <div className={styles.mapCanvas}>
        {provincePaths.length > 0 ? (
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${chinaMapBox.width} ${chinaMapBox.height}`}
            role="img"
            aria-label="中国地图经营分布"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect x="0" y="0" width={chinaMapBox.width} height={chinaMapBox.height} rx="0" fill="var(--map-canvas)" />
            <g>
              {provincePaths.map((feature) => {
                const active = Boolean(hovered?.item.name && feature.stat.name === hovered.item.name);
                return (
                  <path
                    key={feature.key}
                    d={feature.path}
                    fill={getMapFill(feature.stat.signedAmount, maxAmount, active)}
                    stroke={active ? "var(--accent)" : feature.hasData ? "var(--chart-3)" : "var(--border)"}
                    strokeWidth={active ? "2" : "1.1"}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer transition-colors duration-150 outline-none"
                    onMouseEnter={() => setHovered({ item: feature.stat, point: feature.point })}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered({ item: feature.stat, point: feature.point })}
                    onBlur={() => setHovered(null)}
                  >
                    <title>{`${feature.stat.name}：${formatWanCurrency(feature.stat.signedAmount)}`}</title>
                  </path>
                );
              })}
            </g>
          </svg>
        ) : (
          <div className={styles.mapEmpty}>
            {mapLoadFailed ? "中国地图数据加载失败" : "中国地图加载中..."}
          </div>
        )}
      </div>
      {!visibleItems.length && provincePaths.length > 0 && <EmptyState text={`暂无${mode === "province" ? "省份" : "大区"}分布数据`} />}
    </div>
  );
}

export function TopList({
  title,
  items,
  valueType = "money",
  className = "",
  transitionKey,
  showMedals = true,
}: {
  title: string;
  items: OrgStat[];
  valueType?: "money" | "count";
  className?: string;
  transitionKey?: string;
  showMedals?: boolean;
}) {
  const maxValue = Math.max(...items.map((item) => valueType === "money" ? item.signedAmount : item.newCustomers), 1);
  return (
    <Panel title={title} subtitle="按当前筛选时间统计" className={className}>
      <div
        key={transitionKey || title}
        className={`${styles.topList} ${showMedals ? "" : styles.topListNoMedals}`}
      >
        {items.slice(0, 10).map((item, index) => {
          const value = valueType === "money" ? item.signedAmount : item.newCustomers;
          return (
            <div key={`${title}-${item.name}`} className={styles.topListRow}>
              <span className={`${styles.rank} ${showMedals && index < 3 ? styles.rankTop : ""}`}>{index + 1}</span>
              <div className={styles.topListMain}>
                <div className={styles.topListHeader}>
                  <span className={styles.topListName}>{item.name}</span>
                  <span className={styles.topListMeta}>{item.branchCount || 0}家分公司</span>
                </div>
                <div className={styles.progressTrack}>
                  <span className={styles.progressFill} style={{ width: getRankingProgressWidth(value, maxValue) }} />
                </div>
              </div>
              <span className={styles.topListValue}>{valueType === "money" ? shortCurrency(value) : numberFormatter.format(value)}</span>
            </div>
          );
        })}
        {items.length === 0 && <EmptyState text="暂无排行数据" />}
      </div>
    </Panel>
  );
}

export function BranchTable({ title, items, showMedals = true }: { title: string; items: OrgStat[]; showMedals?: boolean }) {
  return (
    <Panel title={title} subtitle="签约金额、新增客户和签约率">
      <div className={styles.tableScroll}>
        <table className={`${styles.table} ${showMedals ? "" : styles.tableNoMedals}`}>
          <colgroup>
            <col className="w-[9%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[13%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="text-center">排名</th>
              <th className="text-left">分公司</th>
              <th className="text-left">省份</th>
              <th className="text-right">新增客户</th>
              <th className="text-right">签约金额</th>
              <th className="text-right">签约数</th>
              <th className="text-right">签约率</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 10).map((item, index) => (
              <tr key={`${title}-${item.name}`}>
                <td className="text-center">
                  <span className={styles.tableRank}>{index + 1}</span>
                </td>
                <td className={styles.tablePrimary} title={item.name}>{item.name}</td>
                <td title={item.province}>{item.province}</td>
                <td className={styles.tableNumber}>{numberFormatter.format(item.newCustomers)}</td>
                <td className={`${styles.tableNumber} ${styles.tableAccent}`}>{shortCurrency(item.signedAmount)}</td>
                <td className={styles.tableNumber}>{numberFormatter.format(item.signedContracts)}</td>
                <td className={`${styles.tableNumber} ${styles.tableSuccess}`}>{item.conversionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <EmptyState text="暂无分公司数据" />}
      </div>
    </Panel>
  );
}

export function SalesTable({ items }: { items: GroupDashboardData["salesTop"] }) {
  return (
    <Panel title="销售战区分析" subtitle="按签约金额统计销售表现">
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className="text-center">排名</th>
              <th className="text-left">销售</th>
              <th className="text-left">所属组织</th>
              <th className="text-right">签约金额</th>
              <th className="text-right">签约数</th>
              <th className="text-right">跟进数</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id || `${item.name}-${index}`}>
                <td className="text-center">
                  <span className={styles.tableRank}>{index + 1}</span>
                </td>
                <td className={styles.tablePrimary}>{item.name}</td>
                <td>{item.orgName}</td>
                <td className={`${styles.tableNumber} ${styles.tableAccent}`}>{shortCurrency(item.signedAmount)}</td>
                <td className={styles.tableNumber}>{numberFormatter.format(item.signedContracts)}</td>
                <td className={styles.tableNumber}>{numberFormatter.format(item.followCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <EmptyState text="暂无销售数据" />}
      </div>
    </Panel>
  );
}

export function FunnelBars({ items }: { items: GroupDashboardData["customerFunnel"] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <Panel title="集团客户漏斗" subtitle="取客户管理现有客户状态">
      <div className={styles.funnelList}>
        {items.map((item, index) => {
          const accentColor = customerFunnelPalette[item.key] || chartPalette[index % chartPalette.length];
          return (
            <div key={item.key} className={styles.funnelRow} style={{ "--funnel-accent": accentColor } as CSSProperties}>
              <span className={styles.funnelLabel}>{item.name}</span>
              <div className={styles.funnelTrack}>
                <span
                  className={styles.funnelFill}
                  style={{
                    width: `${Math.max(item.value ? 5 : 0, (item.value / max) * 100)}%`,
                    backgroundColor: accentColor,
                  }}
                />
              </div>
              <span className={styles.funnelValue}>{numberFormatter.format(item.value)}人，占比 {item.percent}%</span>
            </div>
          );
        })}
        {items.length === 0 && <EmptyState text="暂无客户漏斗数据" />}
      </div>
    </Panel>
  );
}

export function SiteStageChart({ items }: { items: GroupDashboardData["siteStageDist"] }) {
  return (
    <Panel title="集团工地分析" subtitle="取工地管理当前施工阶段">
      <div className={styles.chartLarge}>
        {items.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={items} layout="vertical" margin={{ left: 12, right: 26, top: 8, bottom: 8 }}>
              <CartesianGrid stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: mutedText }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="工地数" barSize={18} radius={[0, 4, 4, 0]}>
                {items.map((item, index) => <Cell key={item.name} fill={chartPalette[index % chartPalette.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="暂无工地阶段数据" />
        )}
      </div>
    </Panel>
  );
}

