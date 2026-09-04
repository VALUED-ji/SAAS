"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Hammer,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import SystemSelect from "@/components/ui/SystemSelect";
import ThinScrollArea from "@/components/ui/ThinScrollArea";

type WorkType = {
  id: string;
  code?: string;
  name: string;
  sort_order?: number | null;
  remark?: string | null;
  is_active?: number | null;
  updated_at?: string | null;
};

type WorkTypeDraft = {
  id?: string;
  code: string;
  name: string;
  sort_order: string;
  remark: string;
};

function makeEmptyDraft(): WorkTypeDraft {
  return { code: "", name: "", sort_order: "", remark: "" };
}

function normalizeSortInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function isActive(item: WorkType) {
  return Number(item.is_active ?? 1) === 1;
}

type WorkTypeIconKind = "mason" | "carpenter" | "paint" | "plumbing" | "electric" | "brick" | "general";

function getWorkTypeIconKind(item: WorkType): WorkTypeIconKind {
  const text = `${item.name || ""} ${item.code || ""}`.toLowerCase();
  if (/砌|墙|砖/.test(text)) return "brick";
  if (/泥|瓦|抹灰|找平/.test(text)) return "mason";
  if (/木|柜|板|吊顶/.test(text)) return "carpenter";
  if (/油|漆|涂|乳胶/.test(text)) return "paint";
  if (/水|管|给排|防水/.test(text)) return "plumbing";
  if (/电|线|灯|开关|插座|dg/.test(text)) return "electric";
  return "general";
}

const workTypeIconMeta: Record<WorkTypeIconKind, { className: string; label: string }> = {
  mason: { className: "work-type-icon-mason", label: "泥瓦施工" },
  carpenter: { className: "work-type-icon-carpenter", label: "木作施工" },
  paint: { className: "work-type-icon-paint", label: "油漆涂装" },
  plumbing: { className: "work-type-icon-plumbing", label: "水路施工" },
  electric: { className: "work-type-icon-electric", label: "电路施工" },
  brick: { className: "work-type-icon-brick", label: "砌筑施工" },
  general: { className: "work-type-icon-general", label: "通用工种" },
};

function WorkTypeTradeIcon({ item }: { item: WorkType }) {
  const kind = getWorkTypeIconKind(item);
  const meta = workTypeIconMeta[kind];

  return (
    <span className={cn("work-type-icon-badge", meta.className)} title={meta.label} aria-label={meta.label}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-[22px] w-[22px]">
        <path d="M9.2 13.1c.4-4.6 3.2-7.4 6.8-7.4s6.4 2.8 6.8 7.4" fill="currentColor" opacity=".16" />
        <path d="M9.2 13.1c.4-4.6 3.2-7.4 6.8-7.4s6.4 2.8 6.8 7.4M8 13.2h16M13.5 6.4v4.2M18.5 6.4v4.2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.3 14.1a4.7 4.7 0 0 0 9.4 0v-.9h-9.4v.9Z" fill="currentColor" opacity=".1" />
        <path d="M11.3 14.1a4.7 4.7 0 0 0 9.4 0v-.9h-9.4v.9Z" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
        <path d="M8.4 26.4c.8-4.3 3.7-6.7 7.6-6.7s6.8 2.4 7.6 6.7H8.4Z" fill="currentColor" opacity=".12" />
        <path d="M8.4 26.4c.8-4.3 3.7-6.7 7.6-6.7s6.8 2.4 7.6 6.7" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        {kind === "mason" && (
          <>
            <path d="M19.3 23.4 26 16.7c.5-.5 1.2-.5 1.7 0l1.2 1.2c.5.5.5 1.2 0 1.7l-6.7 6.7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m17.8 24.8 2.7 2.7 2.1-2.1-2.7-2.7-2.1 2.1Z" fill="currentColor" opacity=".2" />
            <path d="m25.6 18.4 1.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
          </>
        )}
        {kind === "carpenter" && (
          <>
            <path d="m19.2 27.1 7.1-7.1 2.2 2.2-7.1 7.1c-.5.5-1.3.5-1.8 0l-.4-.4c-.5-.5-.5-1.3 0-1.8Z" fill="currentColor" opacity=".18" />
            <path d="m20.2 26.1 6.1-6.1 2.2 2.2-6.1 6.1M21.9 24.4l1.2 1.2M23.6 22.7l1.2 1.2M25.3 21l1.2 1.2" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === "paint" && (
          <>
            <path d="M20.5 17.8h6a1.7 1.7 0 0 1 1.7 1.7v.5a1.7 1.7 0 0 1-1.7 1.7h-6v-3.9Z" fill="currentColor" opacity=".18" />
            <path d="M20.5 17.8h6a1.7 1.7 0 0 1 1.7 1.7v.5a1.7 1.7 0 0 1-1.7 1.7h-6v-3.9ZM22.2 21.8v2.1h3.4c1 0 1.8.8 1.8 1.8v2.1" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === "plumbing" && (
          <>
            <path d="M22.6 17.4s4 4 4 6.5a4 4 0 1 1-8 0c0-2.5 4-6.5 4-6.5Z" fill="currentColor" opacity=".18" />
            <path d="M22.6 17.4s4 4 4 6.5a4 4 0 1 1-8 0c0-2.5 4-6.5 4-6.5ZM20.8 24.3c.2.8.8 1.3 1.7 1.3" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === "electric" && (
          <>
            <path d="m24.2 16.6-5 7.2h3.5l-.9 5.4 5-7.7h-3.4l.8-4.9Z" fill="currentColor" opacity=".2" />
            <path d="m24.2 16.6-5 7.2h3.5l-.9 5.4 5-7.7h-3.4l.8-4.9Z" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === "brick" && (
          <>
            <path d="M18.4 19h10.2v7.2H18.4V19Z" fill="currentColor" opacity=".16" />
            <path d="M18.4 19h10.2v7.2H18.4V19ZM18.4 22.6h10.2M21.8 19v3.6M25.2 22.6v3.6" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === "general" && (
          <>
            <path d="M19.2 20.2v-1.1a2 2 0 0 1 2-2h3.8a2 2 0 0 1 2 2v1.1" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
            <path d="M17.8 20.2h10.6v7H17.8v-7Z" fill="currentColor" opacity=".16" />
            <path d="M17.8 20.2h10.6v7H17.8v-7ZM21.2 23.5H25" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </span>
  );
}

export default function WorkTypeSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const canManage = ["OWNER", "ADMIN"].includes(user?.role || "");
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<WorkTypeDraft>(makeEmptyDraft());
  const isErrorMessage = /失败|请|缺少|没有|错误|权限|只有|无效|存在/.test(message);

  const loadData = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const data = await api.get<{ workTypes: WorkType[] }>(`/api/settings/work-types?${params.toString()}`);
      setWorkTypes(data.workTypes || []);
    } catch (error: any) {
      setMessage(error?.message || "工种设置加载失败");
    } finally {
      setLoading(false);
    }
  }, [canManage, keyword, statusFilter]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, loadData]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const filteredWorkTypes = useMemo(() => workTypes, [workTypes]);
  const pagination = useDataPagination(filteredWorkTypes, `${keyword}|${statusFilter}`);

  const openCreate = () => {
    setDraft(makeEmptyDraft());
    setEditorOpen(true);
    setMessage("");
  };

  const openEdit = (item: WorkType) => {
    setDraft({
      id: item.id,
      code: item.code || "",
      name: item.name || "",
      sort_order: String(item.sort_order ?? ""),
      remark: item.remark || "",
    });
    setEditorOpen(true);
    setMessage("");
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setDraft(makeEmptyDraft());
  };

  const saveWorkType = async () => {
    if (!canManage) {
      setMessage("只有老板或管理员可以维护工种设置");
      return;
    }
    if (!draft.name.trim()) {
      setMessage("请填写工种名称");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await api.post("/api/settings/work-types", {
        action: draft.id ? "update" : "add",
        id: draft.id,
        code: draft.code.trim(),
        name: draft.name.trim(),
        sort_order: draft.sort_order,
        remark: draft.remark.trim(),
      });
      setMessage(draft.id ? "工种已更新" : "工种已新增");
      closeEditor();
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "保存工种失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: WorkType) => {
    if (!canManage) {
      setMessage("只有老板或管理员可以维护工种设置");
      return;
    }
    const active = isActive(item);
    const confirmText = active
      ? `确定停用工种「${item.name}」吗？停用后新增业务将不能再选择此工种。`
      : `确定启用工种「${item.name}」吗？`;
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    setMessage("");
    try {
      await api.post("/api/settings/work-types", { action: "toggle_status", id: item.id, is_active: active ? 0 : 1 });
      setMessage(active ? "工种已停用" : "工种已启用");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || (active ? "停用工种失败" : "启用工种失败"));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-96 items-center justify-center text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        工种设置加载中...
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <section className="w-full max-w-md rounded-lg border border-surface-200 bg-white p-6 text-center shadow-[0_10px_24px_rgba(31,41,53,0.045)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <AlertCircle className="h-6 w-6" />
          </div>
          <p className="mt-4 text-base font-semibold text-surface-900">无权限访问工种设置</p>
          <p className="mt-2 text-sm leading-6 text-surface-500">工种设置属于系统基础数据，仅老板或管理员可以维护。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="app-page-surface admin-config-ui system-settings-ui system-settings-split-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="system-settings-toolbar-panel system-settings-toolbar flex shrink-0 flex-col gap-3 rounded-[14px] border border-surface-200/90 bg-white/95 px-3 py-3 shadow-none xl:flex-row xl:items-center xl:justify-between">
          <div className="system-settings-list-heading min-w-0 flex-1 border-l-[3px] border-primary-500 pl-3">
            <p className="text-sm font-semibold text-surface-900">工种设置</p>
            <p className="mt-1 text-xs leading-5 text-surface-500">维护瓦工、木工、电工、油工等施工工种字典，作为系统基础数据统一管理。</p>
          </div>
          <div className="system-settings-toolbar-controls flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64 2xl:w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="input-field pl-9"
                placeholder="搜索工种名称、编码或备注"
              />
            </div>
            <SystemSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field w-32 py-2" menuClassName="system-settings-select-menu">
              <option value="active">启用中</option>
              <option value="inactive">已停用</option>
              <option value="">全部状态</option>
            </SystemSelect>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4" />
              新增工种
            </button>
          </div>
      </section>

      <section className="system-settings-list-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-surface-200/90 bg-white/95 shadow-none">
        <ThinScrollArea className="system-settings-table-scroll min-h-0 flex-1">
          <table className="w-full min-w-[920px] table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[10%]" />
              <col className="w-[30%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="bg-surface-50">
              <tr className="border-b border-surface-200 text-xs font-semibold text-surface-700">
                <th className="px-4 py-2.5 text-center">
                  <span className="inline-block w-[136px] text-left">工种名称</span>
                </th>
                <th className="py-2.5 pr-4 text-center">排序</th>
                <th className="py-2.5 pr-4">备注</th>
                <th className="py-2.5 pr-4 text-center">状态</th>
                <th className="py-2.5 pr-4 text-center">工种编码</th>
                <th className="py-2.5 pr-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {pagination.pageItems.map((item) => {
                const active = isActive(item);
                return (
                  <tr key={item.id} className={cn("transition hover:bg-surface-50/80", !active && "bg-surface-50/60 text-surface-500")}>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-grid w-[136px] grid-cols-[30px_minmax(0,1fr)] items-center gap-3 text-left font-semibold text-surface-900">
                        <WorkTypeTradeIcon item={item} />
                        <span className="truncate">{item.name}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-center text-surface-700">{Number(item.sort_order || 0)}</td>
                    <td className="py-3 pr-4 text-surface-600">{item.remark || "-"}</td>
                    <td className="py-3 pr-4 text-center">
                      <span className={cn(
                        "system-settings-status-tag inline-flex min-w-[64px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1",
                        active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-surface-100 text-surface-600 ring-surface-200"
                      )}>
                        {active ? "启用" : "停用"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-center text-surface-700">{item.code || "-"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => openEdit(item)} className="system-settings-row-action rounded-[8px] p-1.5 text-surface-500 transition hover:bg-primary-50 hover:text-primary-700" title="编辑工种" aria-label={`编辑${item.name}`}>
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(item)}
                          className={cn(
                            "system-settings-row-action rounded-[8px] p-1.5 text-surface-500 transition",
                            active ? "hover:bg-amber-50 hover:text-amber-600" : "hover:bg-emerald-50 hover:text-emerald-600"
                          )}
                          title={active ? "停用工种" : "启用工种"}
                          aria-label={`${active ? "停用" : "启用"}${item.name}`}
                        >
                          {active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredWorkTypes.length === 0 && (
                <tr>
                  <td colSpan={6} className="system-settings-empty-cell py-12 text-center">
                    <div className="mx-auto flex min-h-[220px] max-w-sm flex-col items-center justify-center px-6 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-primary-100 bg-primary-50 text-primary-600">
                        <Hammer className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-surface-800">暂无符合条件的工种</p>
                      <p className="mt-1 text-xs leading-5 text-surface-500">可调整搜索或状态筛选，也可以新增一个施工工种。</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination
          total={filteredWorkTypes.length}
          page={pagination.page}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemName="个工种"
        />
      </section>

      {editorOpen && (
        <WorkTypeEditorDialog
          draft={draft}
          saving={saving}
          onClose={closeEditor}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSubmit={saveWorkType}
        />
      )}

      {message && (
        <div
          className={cn(
            "system-settings-toast fixed left-[calc(var(--active-sidebar-width,260px)+((100vw-var(--active-sidebar-width,260px))/2))] top-5 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-[10px] border bg-white px-4 py-3 text-sm font-semibold shadow-[0_14px_36px_rgba(31,41,53,0.12)] max-md:left-1/2",
            isErrorMessage ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"
          )}
        >
          {isErrorMessage ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{message}</span>
          <button type="button" onClick={() => setMessage("")} className="ml-1 rounded-md p-1 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700" aria-label="关闭提示">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function WorkTypeEditorDialog({
  draft,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  draft: WorkTypeDraft;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<WorkTypeDraft>) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="system-settings-modal-overlay fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/20 px-5 py-6 backdrop-blur-[1px] max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭" />
      <div className="system-settings-modal system-settings-compact-modal relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-[16px] border border-surface-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)]" role="dialog" aria-modal="true" aria-labelledby="work-type-dialog-title">
        <header className="system-settings-modal-header flex items-start justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="system-settings-modal-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-50 text-primary-600 ring-1 ring-primary-100">
              <Hammer className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p id="work-type-dialog-title" className="text-[15px] font-semibold leading-6 text-surface-900">{draft.id ? "编辑工种" : "新增工种"}</p>
              <p className="mt-0.5 text-xs leading-5 text-surface-500">维护施工、结算等业务可复用的工种字典。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="system-settings-modal-close flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-surface-400 transition hover:bg-surface-100 hover:text-surface-700" aria-label="关闭弹窗">
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        <main className="system-settings-modal-body space-y-4 px-5 py-4">
          <Field label="工种名称" required>
            <input
              value={draft.name}
              onChange={(event) => onChange({ name: event.target.value })}
              className="input-field"
              placeholder="如：瓦工、木工、电工、油工"
            />
          </Field>
          <Field label="排序">
            <input
              value={draft.sort_order}
              onChange={(event) => onChange({ sort_order: normalizeSortInput(event.target.value) })}
              className="input-field"
              inputMode="numeric"
              placeholder="数字越小越靠前"
            />
          </Field>
          <Field label="备注">
            <textarea
              value={draft.remark}
              onChange={(event) => onChange({ remark: event.target.value })}
              className="input-field min-h-[88px] resize-none leading-6"
              placeholder="可填写适用范围或管理说明"
            />
          </Field>
          <Field label="工种编码">
            <input
              value={draft.code}
              onChange={(event) => onChange({ code: event.target.value.toUpperCase() })}
              className="input-field"
              placeholder="可选，如：WG、MG、DG"
            />
          </Field>
        </main>
        <footer className="system-settings-modal-footer flex items-center justify-end gap-2 border-t border-surface-200 bg-white px-5 py-3.5">
          <button type="button" onClick={onClose} className="btn-secondary min-w-[82px]" disabled={saving}>取消</button>
          <button type="button" onClick={onSubmit} className="btn-primary min-w-[92px]" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="system-settings-field block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-surface-700">
        {label}
        {required && <b className="font-semibold text-red-500">*</b>}
      </span>
      {children}
    </label>
  );
}
