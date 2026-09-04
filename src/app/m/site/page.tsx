"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Camera, CircleUserRound, Clock3, HardHat, Loader2, Search, Store, UserRound } from "lucide-react";
import styles from "../mobile.module.css";

type SiteProject = Record<string, any> & { id: string };

const stageTabs = [
  { key: "all", label: "全部" },
  { key: "PENDING_START", label: "待开工" },
  { key: "START_CONFIRM", label: "开工确认" },
  { key: "CONSTRUCTION", label: "施工中" },
  { key: "OWNER_SETTLEMENT", label: "业主结算" },
  { key: "SITE_SETTLEMENT", label: "工地结算" },
];

const stageLabels: Record<string, string> = {
  PENDING_START: "待开工",
  START_CONFIRM: "开工确认",
  CONSTRUCTION: "施工中",
  OWNER_SETTLEMENT: "业主结算",
  SITE_SETTLEMENT: "工地结算",
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!amount) return "-";
  if (Math.abs(amount) >= 10000) return `${(amount / 10000).toFixed(Math.abs(amount) >= 1000000 ? 0 : 1).replace(/\.0$/, "")}万`;
  return new Intl.NumberFormat("zh-CN").format(amount);
}

function formatDate(value: unknown) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "-";
}

function room(project: SiteProject) {
  const name = String(project.site_name || project.display_name || project.customer_address || project.address || project.name || "").trim();
  return name || "未命名工地";
}

function ownerName(project: SiteProject) {
  return String(project.customer_name || project.owner_name || "").trim() || "业主未设置";
}

function stageName(project: SiteProject) {
  return String(project.construction_stage_name || project.current_phase_name || project.active_phase_name || stageLabels[String(project.site_stage || "")] || project.status || "-");
}

function phaseTone(project: SiteProject) {
  const name = stageName(project);
  if (/开工|交底/.test(name)) return "handover";
  if (/拆|改/.test(name)) return "demolition";
  if (/水|电/.test(name)) return "plumbing";
  if (/泥|瓦|砌|贴砖/.test(name)) return "masonry";
  if (/木|吊顶/.test(name)) return "carpentry";
  if (/油|漆|乳胶/.test(name)) return "painting";
  if (/安装|主材/.test(name)) return "installation";
  if (/验收/.test(name)) return "inspection";
  if (/结算/.test(name)) return "settlement";
  return String(project.site_stage || "default").toLowerCase();
}

function CardStaffName({ name, avatar, emptyText }: { name?: unknown; avatar?: unknown; emptyText: string }) {
  const displayName = String(name || "").trim();
  const avatarUrl = String(avatar || "").trim();
  const label = displayName || emptyText;
  return (
    <span className={styles.cardStaffValue} data-empty={!displayName || undefined}>
      <span className={styles.cardStaffAvatar}>
        {avatarUrl ? <Image src={avatarUrl} alt="" width={18} height={18} unoptimized /> : label.slice(0, 1)}
      </span>
      <span>{label}</span>
    </span>
  );
}

export default function MobileSitePage() {
  const [projects, setProjects] = useState<SiteProject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeStage, setActiveStage] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: "1", pageSize: "80", includeMeta: "1" });
    if (activeStage !== "all") params.set("status", activeStage);
    if (keyword.trim()) params.set("search", keyword.trim());
    fetch(`/api/site?${params.toString()}`, { headers: authHeaders() })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "工地数据加载失败");
        return payload;
      })
      .then((payload) => {
        if (!alive) return;
        setProjects(Array.isArray(payload.projects) ? payload.projects : []);
        setCounts(payload.statusCounts || {});
      })
      .catch((loadError) => {
        if (alive) setError(loadError instanceof Error ? loadError.message : "工地数据加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [activeStage, keyword]);

  return (
    <div className={styles.page}>
      <header className={styles.mobileSiteTopbar}>
        <div className={styles.mobileSiteSearch}>
          <Search />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索工地、客户、地址、项目经理" />
        </div>
      </header>
      <div className={styles.mobileSiteTabs}>
        {stageTabs.map((tab) => (
          <button type="button" key={tab.key} data-active={activeStage === tab.key || undefined} onClick={() => setActiveStage(tab.key)}>
            {tab.label}<span>{Number(counts[tab.key] || 0)}</span>
          </button>
        ))}
      </div>

      {loading ? <div className={styles.loadingList}><Loader2 className="h-5 w-5 animate-spin" />正在加载工地</div> : null}
      {error ? <div className={styles.errorState}><AlertTriangle className="mx-auto mb-2 h-5 w-5" />{error}</div> : null}
      {!loading && !error && (
        <main className={styles.mobileSiteList}>
          {projects.map((project) => {
            const stage = String(project.site_stage || "");
            return (
              <Link href={`/m/site/${project.id}`} prefetch className={styles.mobileSiteCard} key={project.id}>
                <div className={styles.mobileSiteCardTop}>
                  <span className={styles.mobileSiteIcon} data-stage={stage}>{ownerName(project).slice(0, 1) || <UserRound />}</span>
                  <div>
                    <h2>{room(project)}</h2>
                    <p><CircleUserRound />{ownerName(project)}</p>
                  </div>
                  <span className={styles.mobileSitePhase} data-stage={stage} data-tone={phaseTone(project)}>{stageName(project)}</span>
                </div>
                {Number(project.open_issue_count || 0) > 0 && (
                  <div className={styles.mobileSiteBadges}>
                    <span data-tone="risk">问题 {project.open_issue_count}</span>
                  </div>
                )}
                <div className={styles.mobileSiteGrid}>
                  <span><small>项目经理</small><b><CardStaffName name={project.manager_name} avatar={project.manager_avatar} emptyText="未设置" /></b></span>
                  <span><small>设计师</small><b><CardStaffName name={project.designer_name} avatar={project.designer_avatar} emptyText="未设置" /></b></span>
                  <span><small>合同金额</small><b>{formatMoney(project.contract_amount)}</b></span>
                  <span><small>服务门店</small><b>{project.service_store || "-"}</b></span>
                  <span><small>开工时间</small><b>{formatDate(project.start_date)}</b></span>
                  <span><small>计划竣工</small><b>{formatDate(project.planned_end_date)}</b></span>
                </div>
                <div className={styles.mobileSiteMeta}>
                  <span><CalendarDays />工期 {project.contract_duration_days || project.handover_duration_days || "-"} 天</span>
                  <span><Clock3 />记录 {Number(project.construction_record_count || 0)}</span>
                  <span><Camera />监控 {Number(project.active_camera_count || 0)}</span>
                  <span><Store />{project.finance_no || "财务编号待生成"}</span>
                </div>
              </Link>
            );
          })}
          {!projects.length && <div className={styles.emptyState}><div className={styles.emptyIcon}><HardHat /></div><div className={styles.emptyTitle}>暂无工地</div><div className={styles.emptyText}>当前筛选条件下没有工地数据。</div></div>}
        </main>
      )}
    </div>
  );
}
