"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";

type OrgUnit = {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  manager_name?: string | null;
  is_active?: number;
};

type BranchOption = OrgUnit & { path: string; parentPath: string };

type BranchSettingsSummary = {
  org_unit_id: string;
  legalCompanyName?: string;
  province?: string;
  city?: string;
  district?: string;
  updated_at: string | null;
};

function buildBranchOptions(units: OrgUnit[]): BranchOption[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const pathOf = (unit: OrgUnit): string => {
    const names = [unit.name];
    let current = unit;
    while (current.parent_id && byId.has(current.parent_id)) {
      current = byId.get(current.parent_id)!;
      names.unshift(current.name);
    }
    return names.join(" / ");
  };

  return units
    .filter((unit) => unit.type === "company")
    .map((unit) => {
      const path = pathOf(unit);
      const parts = path.split(" / ");
      return {
        ...unit,
        path,
        parentPath: parts.length > 1 ? parts.slice(0, -1).join(" / ") : "顶级分公司",
      };
    });
}

function formatTime(value: string | null) {
  return formatDateTime(value);
}

function formatRegion(summary?: BranchSettingsSummary) {
  const region = [summary?.province, summary?.city, summary?.district].filter(Boolean).join(" / ");
  return region || "-";
}

function isOrgActive(unit?: OrgUnit | null) {
  return Number(unit?.is_active ?? 1) === 1;
}

export default function BranchSettingsListPage() {
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [summaries, setSummaries] = useState<BranchSettingsSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const summaryMap = useMemo(() => new Map(summaries.map((item) => [item.org_unit_id, item])), [summaries]);
  const branches = useMemo(() => buildBranchOptions(orgUnits), [orgUnits]);
  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((branch) => {
      const summary = summaryMap.get(branch.id);
      return [
        branch.name,
        branch.path,
        summary?.legalCompanyName || "",
        summary?.province || "",
        summary?.city || "",
        summary?.district || "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [branches, search, summaryMap]);
  const branchPagination = useDataPagination(filteredBranches, search);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/org").then((res) => res.json()),
      fetch("/api/branch-settings").then((res) => res.json()).catch(() => ({ items: [] })),
    ])
      .then(([orgData, settingsData]) => {
        if (!mounted) return;
        setOrgUnits(Array.isArray(orgData) ? orgData : []);
        setSummaries(Array.isArray(settingsData?.items) ? settingsData.items : []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="app-page-surface admin-config-ui branch-settings-ui branch-settings-list-ui flex h-full min-h-0 flex-col gap-4 bg-[#F5F7FB]">
      <section className="branch-settings-toolbar rounded-lg border border-surface-200/90 bg-white/95 px-3 py-3 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-9" placeholder="搜索分公司 / 法定公司名称 / 地区" />
        </div>
      </section>

      <section className="branch-settings-list-panel overflow-hidden rounded-lg border border-surface-200/90 bg-white/95 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
        <ThinScrollArea className="branch-settings-table-scroll">
        <div className="grid min-h-11 min-w-[1080px] grid-cols-[minmax(240px,1.25fr)_minmax(260px,1.35fr)_minmax(200px,1fr)_170px_96px] items-center border-b border-surface-100 bg-surface-50/80 px-4 text-xs font-semibold text-surface-500">
          <div>分公司</div>
          <div>法定公司名称</div>
          <div>省市区</div>
          <div>最近修改时间</div>
          <div className="text-right">操作</div>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-surface-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载分公司...
          </div>
        ) : filteredBranches.length > 0 ? (
          <div className="divide-y divide-surface-100">
            {branchPagination.pageItems.map((branch) => {
              const summary = summaryMap.get(branch.id);
              return (
                <div key={branch.id} className="grid min-h-[68px] min-w-[1080px] grid-cols-[minmax(240px,1.25fr)_minmax(260px,1.35fr)_minmax(200px,1fr)_170px_96px] items-center px-4 text-sm transition-colors hover:bg-surface-50/70">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-surface-900">{branch.name}</span>
                        {!isOrgActive(branch) && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">已停用</span>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-surface-400">{branch.path}</div>
                    </div>
                  </div>
                  <div className="truncate text-surface-600">{summary?.legalCompanyName || "-"}</div>
                  <div className="truncate text-surface-600">{formatRegion(summary)}</div>
                  <div className="truncate text-surface-600">{formatTime(summary?.updated_at || null)}</div>
                  <div className="flex justify-end">
                    <Link href={`/branch-settings/${branch.id}`} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
                      isOrgActive(branch)
                        ? "bg-primary-600 text-white hover:bg-primary-700"
                        : "border border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
                    }`}>
                      {isOrgActive(branch) ? "设置" : "查看"}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center text-surface-400">
            <SlidersHorizontal className="mb-3 h-10 w-10 text-surface-300" />
            <p className="text-sm">{branches.length === 0 ? "暂无分公司，请先在组织管理中添加公司节点。" : "没有匹配的分公司"}</p>
          </div>
        )}
        </ThinScrollArea>
        {!loading && filteredBranches.length > 0 && (
          <DataPagination
            total={filteredBranches.length}
            page={branchPagination.page}
            pageSize={branchPagination.pageSize}
            onPageChange={branchPagination.setPage}
            onPageSizeChange={branchPagination.setPageSize}
            itemName="个分公司"
          />
        )}
      </section>
    </div>
  );
}
