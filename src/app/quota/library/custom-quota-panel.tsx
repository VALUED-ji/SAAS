// 定额库自定义项目面板组件模块
// 从 page.tsx 渐进拆出，共享工具来自 ./custom-quota-shared。

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import {
  CustomQuotaItem,
  PromoteConfirmState,
  formatAmount,
  parsePriceInput,
  requestCustomQuotaLibrary,
} from "./custom-quota-shared";

type DictionaryOption = {
  id: string;
  name: string;
};

export function makeEmptyCustomQuotaItem(defaultStoreName: string): CustomQuotaItem {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: "",
    source: "custom",
    scope: defaultStoreName,
    storeName: defaultStoreName,
    category: "未分类",
    workTypeId: "",
    workTypeName: "",
    materialCategoryId: "",
    materialCategoryName: "",
    name: "",
    constructionDescription: "",
    unit: "",
    laborPrice: 0,
    materialPrice: 0,
    totalPrice: 0,
    isSpecialPrice: false,
    status: "enabled",
    updatedAt: today,
    createdAt: today,
  };
}

export function CustomQuotaPromoteDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: PromoteConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const totalPrice = Number(state.item.totalPrice || 0) || Number(state.item.laborPrice || 0) + Number(state.item.materialPrice || 0);
  return (
    <div className="qm-modal-overlay fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-950/25 px-6 py-7 max-md:inset-0 max-md:w-full max-md:px-4">
      <div role="dialog" aria-modal="true" className="qm-modal-shell flex w-full max-w-lg flex-col overflow-hidden border border-surface-200 bg-white shadow-[0_24px_72px_rgba(15,35,70,0.18)]">
        <div className="qm-modal-header flex items-start justify-between gap-4 border-b border-surface-200 px-5 py-4">
          <div>
            <p className="qm-modal-title text-base font-semibold text-surface-900">转正为标准定额</p>
            <p className="qm-modal-subtitle mt-0.5 text-xs text-surface-500">转正后该项目会进入标准定额库，报价中只能选择标准定额。</p>
          </div>
          <button type="button" onClick={onCancel} className="qm-icon-button inline-flex h-9 w-9 items-center justify-center text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-surface-900" title={state.item.name}>{state.item.name}</p>
                <p className="mt-1 text-xs text-surface-500">{state.item.category || "未分类"} · {state.item.unit || "-"} · {state.targetScope}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold text-surface-500">客户单价</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-600">{formatAmount(totalPrice)}</p>
              </div>
            </div>
          </div>
          {state.duplicateName && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              标准定额库中已存在同门店、同分类、同名称、同单位的项目。确认后仍会新增一条标准定额，请确认是否继续。
            </div>
          )}
          <div className="grid gap-2 text-sm text-surface-600">
            <div className="flex justify-between gap-4">
              <span>目标库</span>
              <span className="font-semibold text-surface-900">标准定额库</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>自定义库状态</span>
              <span className="font-semibold text-primary-700">转正后标记为已转正</span>
            </div>
          </div>
        </div>
        <div className="qm-modal-footer flex justify-end gap-2 border-t border-surface-200 bg-surface-50 px-5 py-4">
          <button type="button" onClick={onCancel} className="btn-secondary">取消</button>
          <button type="button" onClick={onConfirm} className="btn-primary">确认转正</button>
        </div>
      </div>
    </div>
  );
}

export function normalizeCustomStatus(value: unknown): CustomQuotaItem["status"] {
  const status = String(value || "");
  if (status === "disabled" || status === "promoted") return status;
  return "enabled";
}

export function CustomQuotaLibraryPanel({
  storeOptions,
  defaultStoreName,
  onPromote,
  onNotice,
  workTypeOptions = [],
  materialCategoryOptions = [],
}: {
  storeOptions: string[];
  defaultStoreName: string;
  onPromote: (item: CustomQuotaItem) => Promise<void>;
  onNotice: (message: string) => void;
  workTypeOptions?: DictionaryOption[];
  materialCategoryOptions?: DictionaryOption[];
}) {
  const [items, setItems] = useState<CustomQuotaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingItem, setEditingItem] = useState<CustomQuotaItem | null>(null);
  const [editMode, setEditMode] = useState<"create" | "edit">("edit");
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestCustomQuotaLibrary("?status=active");
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows.map((row: any) => ({
        id: String(row.id || ""),
        source: "custom" as const,
        code: String(row.code || ""),
        scope: String(row.scope || row.storeName || ""),
        storeName: String(row.storeName || row.scope || ""),
        category: String(row.category || "未分类"),
        workTypeId: String(row.workTypeId || ""),
        workTypeName: String(row.workTypeName || ""),
        materialCategoryId: String(row.materialCategoryId || ""),
        materialCategoryName: String(row.materialCategoryName || ""),
        name: String(row.name || ""),
        constructionDescription: String(row.constructionDescription || ""),
        unit: String(row.unit || ""),
        laborPrice: Number(row.laborPrice || 0),
        materialPrice: Number(row.materialPrice || 0),
        totalPrice: Number(row.totalPrice || 0),
        isSpecialPrice: Boolean(row.isSpecialPrice),
        status: normalizeCustomStatus(row.status),
        sourceQuotationId: String(row.sourceQuotationId || ""),
        sourceQuotationTitle: String(row.sourceQuotationTitle || ""),
        sourceQuotationItemId: String(row.sourceQuotationItemId || ""),
        createdById: String(row.createdById || ""),
        createdByName: String(row.createdByName || ""),
        sourceEmployeeName: String(row.sourceEmployeeName || row.createdByName || ""),
        promotedQuotaCode: String(row.promotedQuotaCode || ""),
        promotedAt: String(row.promotedAt || ""),
        updatedAt: String(row.updatedAt || ""),
        createdAt: String(row.createdAt || ""),
      })).filter((item: CustomQuotaItem) => item.status !== "promoted"));
    } catch (error: any) {
      window.alert(error?.message || "自定义库加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const customStoreOptions = useMemo(() => {
    const scopes = new Set<string>(storeOptions);
    items.forEach((item) => {
      if (item.storeName?.trim()) scopes.add(item.storeName.trim());
    });
    if (defaultStoreName) scopes.add(defaultStoreName);
    return Array.from(scopes).filter(Boolean);
  }, [defaultStoreName, items, storeOptions]);
  const getDefaultEditorStoreName = useCallback(() => defaultStoreName || customStoreOptions[0] || "", [customStoreOptions, defaultStoreName]);

  const openEditCustomItem = (item: CustomQuotaItem) => {
    const nextStoreName = item.storeName?.trim() || item.scope?.trim() || getDefaultEditorStoreName();
    setEditMode("edit");
    setEditingItem({
      ...item,
      storeName: nextStoreName,
      scope: nextStoreName,
    });
  };

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category).filter(Boolean))), [items]);
  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesKeyword = !keyword || [
        item.storeName,
        item.category,
        item.workTypeName,
        item.materialCategoryName,
        item.name,
        item.constructionDescription,
        item.unit,
        item.sourceQuotationTitle,
        item.createdByName,
        item.sourceEmployeeName,
      ].some((value) => String(value || "").toLowerCase().includes(keyword));
      const matchesStore = !storeFilter || item.storeName === storeFilter;
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesStatus = !statusFilter || item.status === statusFilter;
      return matchesKeyword && matchesStore && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, items, search, statusFilter, storeFilter]);
  const pagination = useDataPagination(filteredItems, [search, storeFilter, categoryFilter, statusFilter].join("|"));

  const openCreate = () => {
    setEditMode("create");
    setEditingItem(makeEmptyCustomQuotaItem(getDefaultEditorStoreName()));
  };

  const saveEditingItem = async () => {
    if (!editingItem) return;
    const nextStoreName = editingItem.storeName.trim() || editingItem.scope.trim();
    if (!nextStoreName) {
      window.alert("请选择所属门店");
      return;
    }
    if (!editingItem.name.trim()) {
      window.alert("请填写项目名称");
      return;
    }
    if (!editingItem.unit.trim()) {
      window.alert("请填写单位");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...editingItem,
        storeName: nextStoreName,
        scope: nextStoreName,
        totalPrice: Number(editingItem.totalPrice || 0) || Number(editingItem.laborPrice || 0) + Number(editingItem.materialPrice || 0),
      };
      if (editMode === "create") {
        await requestCustomQuotaLibrary("", { method: "POST", body: JSON.stringify(payload) });
        onNotice(`已新增自定义项目：${editingItem.name}`);
      } else {
        await requestCustomQuotaLibrary("", { method: "PUT", body: JSON.stringify(payload) });
        onNotice(`已保存自定义项目：${editingItem.name}`);
      }
      setEditingItem(null);
      await loadItems();
    } catch (error: any) {
      window.alert(error?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updateCustomItemStatus = async (item: CustomQuotaItem, action: "enable" | "disable" | "delete") => {
    if (action === "delete" && !window.confirm(`确认删除自定义项目“${item.name}”吗？`)) return;
    try {
      await requestCustomQuotaLibrary("", {
        method: "POST",
        body: JSON.stringify({ action, id: item.id }),
      });
      onNotice(action === "delete" ? `已删除自定义项目：${item.name}` : `已${action === "enable" ? "启用" : "停用"}自定义项目：${item.name}`);
      await loadItems();
    } catch (error: any) {
      window.alert(error?.message || "操作失败");
    }
  };

  const promoteItem = async (item: CustomQuotaItem) => {
    try {
      await onPromote(item);
      await loadItems();
    } catch (error: any) {
      window.alert(error?.message || "转正失败");
    }
  };

  return (
    <section className="table-shell quota-list-shell flex min-h-0 flex-1 flex-col">
      <div className="quota-list-toolbar quota-library-toolbar flex flex-col gap-3 border-b border-surface-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="quota-search-control flex min-h-10 flex-1 items-center gap-2 border border-surface-200 bg-white px-3 text-sm text-surface-500 lg:max-w-md">
          <Search className="h-4 w-4" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400" placeholder="搜索门店、项目名称、施工说明、来源员工" />
        </div>
        <div className="quota-toolbar-compact flex flex-wrap items-center gap-2">
          <span className="quota-filter-label inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500"><SlidersHorizontal className="h-3.5 w-3.5" />筛选</span>
          <SystemSelect aria-label="按门店筛选" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} className="input-field h-10 w-36 py-0">
            <option value="">全部门店</option>
            {customStoreOptions.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
          </SystemSelect>
          <SystemSelect aria-label="按分类筛选" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="input-field h-10 w-36 py-0">
            <option value="">全部分类</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </SystemSelect>
          <SystemSelect aria-label="按状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field h-10 w-32 py-0">
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </SystemSelect>
          <button type="button" onClick={loadItems} className="btn-secondary quota-toolbar-action min-h-10 px-3">刷新</button>
          <button type="button" onClick={openCreate} className="btn-primary quota-toolbar-action min-h-10 px-3"><Plus className="h-4 w-4" />新增自定义项目</button>
        </div>
      </div>

      <ThinScrollArea className="quota-list-scroll min-h-0 flex-1" scrollClassName="quota-list-scroll-region h-full overflow-auto">
        <table className="quota-list-table w-full min-w-[1440px] table-fixed border-separate border-spacing-0 text-sm [&_td]:border-b [&_td]:border-surface-100 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-surface-100 [&_th]:border-b [&_th]:border-surface-300 [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-surface-200">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[15%]" />
            <col className="w-[5%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
            <tr>
              <th className="px-3 py-3 text-center">所属门店</th>
              <th className="px-3 py-3 text-center">分类</th>
              <th className="px-3 py-3 text-left">项目名称</th>
              <th className="px-3 py-3 text-center">单位</th>
              <th className="px-3 py-3 text-right">人工单价</th>
              <th className="px-3 py-3 text-right">材料单价</th>
              <th className="px-3 py-3 text-right">客户单价</th>
              <th className="px-3 py-3 text-left">施工说明</th>
              <th className="px-3 py-3 text-center">来源员工</th>
              <th className="px-3 py-3 text-center">状态</th>
              <th className="px-3 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-surface-500">正在加载自定义库...</td></tr>
            ) : pagination.pageItems.length === 0 ? (
              <tr className="quota-empty-row quota-custom-empty-row">
                <td colSpan={11} className="px-4 py-12 text-center">
                  <div className="quota-custom-empty-state mx-auto flex max-w-md flex-col items-center justify-center text-center">
                    <div className="quota-empty-icon mx-auto flex h-12 w-12 items-center justify-center rounded-[14px]">
                      <Search className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-surface-900">暂无自定义项目</p>
                    <p className="mt-1.5 text-xs leading-5 text-surface-500">报价页右键手动项目可保存到这里，也可以直接新增自定义项目。</p>
                    <button type="button" onClick={openCreate} className="btn-secondary mt-4 min-h-9 px-3 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      新增自定义项目
                    </button>
                  </div>
                </td>
              </tr>
            ) : pagination.pageItems.map((item) => (
              <tr key={item.id} className="bg-white hover:bg-surface-50">
                <td className="px-3 py-3 text-center text-surface-700">{item.storeName || "-"}</td>
                <td className="px-3 py-3 text-center text-surface-700">{item.category || "未分类"}</td>
                <td className="quota-primary-cell px-3 py-3">
                  <p className="font-semibold text-surface-900">{item.name}</p>
                </td>
                <td className="px-3 py-3 text-center text-surface-700">{item.unit}</td>
                <td className="quota-money-cell px-3 py-3 text-right tabular-nums text-surface-700">{formatAmount(item.laborPrice)}</td>
                <td className="quota-money-cell px-3 py-3 text-right tabular-nums text-surface-700">{formatAmount(item.materialPrice)}</td>
                <td className="quota-money-cell quota-total-price px-3 py-3 text-right font-semibold tabular-nums text-red-600">{formatAmount(item.totalPrice || item.laborPrice + item.materialPrice)}</td>
                <td className="quota-description-cell px-3 py-3 text-left text-surface-700">
                  <p className="line-clamp-2 leading-5" title={item.constructionDescription || undefined}>{item.constructionDescription || "-"}</p>
                </td>
                <td className="px-3 py-3 text-center text-surface-700">
                  <span className="inline-flex max-w-full truncate font-medium" title={item.sourceEmployeeName || item.createdByName || "-"}>
                    {item.sourceEmployeeName || item.createdByName || "-"}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={item.status === "enabled" ? "quota-status-tag bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" : item.status === "promoted" ? "quota-status-tag bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700" : "quota-status-tag bg-surface-100 px-2 py-1 text-xs font-semibold text-surface-500"}>
                    {item.status === "enabled" ? "启用" : item.status === "promoted" ? "已转正" : "停用"}
                  </span>
                  {item.promotedQuotaCode && <p className="mt-1 text-[11px] font-semibold text-surface-400">{item.promotedQuotaCode}</p>}
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="quota-row-actions inline-flex flex-wrap items-center justify-center gap-1">
                    <button type="button" onClick={() => openEditCustomItem(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700" title="编辑自定义项目">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {item.status !== "promoted" && (
                      <button type="button" onClick={() => promoteItem(item)} className="inline-flex h-8 items-center justify-center rounded-lg border border-primary-100 bg-white px-2 text-xs font-semibold text-primary-700 transition hover:border-primary-200 hover:bg-primary-50" title="转正到标准定额库">
                        转正
                      </button>
                    )}
                    {item.status === "disabled" ? (
                      <button type="button" onClick={() => updateCustomItemStatus(item, "enable")} className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-100 bg-white px-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">启用</button>
                    ) : item.status === "enabled" ? (
                      <button type="button" onClick={() => updateCustomItemStatus(item, "disable")} className="inline-flex h-8 items-center justify-center rounded-lg border border-surface-200 bg-white px-2 text-xs font-semibold text-surface-600 transition hover:bg-surface-50">停用</button>
                    ) : null}
                    <button type="button" onClick={() => updateCustomItemStatus(item, "delete")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="删除自定义项目">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ThinScrollArea>
      <DataPagination className="quota-list-pagination shrink-0" total={filteredItems.length} page={pagination.page} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemName="条自定义项目" />

      {editingItem && typeof document !== "undefined" && createPortal(
        <div
          className="qm-modal-overlay quota-custom-editor-overlay fixed inset-y-0 left-[var(--active-sidebar-width,260px)] right-0 z-50 flex items-center justify-center px-6 py-7 max-md:inset-0 max-md:px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingItem(null);
          }}
        >
          <div role="dialog" aria-modal="true" className="qm-modal-shell qm-editor-modal flex w-full max-w-2xl flex-col overflow-hidden border border-surface-200 bg-white">
            <div className="qm-modal-header flex items-center justify-between border-b border-surface-200 px-5 py-4">
              <div>
                <p className="qm-modal-title text-base font-semibold text-surface-900">{editMode === "create" ? "新增自定义项目" : "编辑自定义项目"}</p>
                <p className="qm-modal-subtitle mt-0.5 text-xs text-surface-500">{editMode === "create" ? "填写自定义项目基础信息和单价" : "自定义项目按门店独立管理，转正后进入标准定额库。"}</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="qm-icon-button inline-flex h-9 w-9 items-center justify-center text-surface-500 hover:bg-surface-100 hover:text-surface-900" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="qm-modal-body qm-editor-form grid gap-4 overflow-y-auto px-5 py-5 md:grid-cols-2">
              <label className="qm-field space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-surface-600">所属门店</span>
                <SystemSelect
                  value={editingItem.storeName || ""}
                  onChange={(event) => setEditingItem({ ...editingItem, storeName: event.target.value, scope: event.target.value })}
                  className="input-field"
                >
                  <option value="">请选择所属门店</option>
                  {Array.from(new Set([editingItem.storeName, editingItem.scope, ...customStoreOptions].map((scope) => String(scope || "").trim()).filter(Boolean))).map((scope) => (
                    <option key={scope} value={scope}>{scope}</option>
                  ))}
                </SystemSelect>
              </label>
              <label className="qm-field space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-surface-600">项目名称 <span className="text-red-500">*</span></span>
                <input value={editingItem.name} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} className="input-field" />
              </label>
              <label className="qm-field space-y-1.5">
                <span className="text-xs font-semibold text-surface-600">分类</span>
                <input
                  value={editingItem.category}
                  onChange={(event) => setEditingItem({ ...editingItem, category: event.target.value })}
                  className="input-field"
                  placeholder="如：拆除工程 / 水电工程 / 泥瓦工程"
                />
              </label>
              <label className="qm-field space-y-1.5">
                <span className="text-xs font-semibold text-surface-600">单位 <span className="text-red-500">*</span></span>
                <input
                  value={editingItem.unit}
                  onChange={(event) => setEditingItem({ ...editingItem, unit: event.target.value })}
                  className="input-field"
                  placeholder="请选择或输入单位"
                />
              </label>
              <label className="qm-field space-y-1.5">
                <span className="text-xs font-semibold text-surface-600">人工单价</span>
                <input type="text" inputMode="decimal" value={String(editingItem.laborPrice ?? 0)} onChange={(event) => setEditingItem({ ...editingItem, laborPrice: parsePriceInput(event.target.value) })} className="input-field text-right tabular-nums" />
              </label>
              <label className="qm-field space-y-1.5">
                <span className="text-xs font-semibold text-surface-600">材料单价</span>
                <input type="text" inputMode="decimal" value={String(editingItem.materialPrice ?? 0)} onChange={(event) => setEditingItem({ ...editingItem, materialPrice: parsePriceInput(event.target.value) })} className="input-field text-right tabular-nums" />
              </label>
              <label className="qm-field space-y-1.5">
                <span className="text-xs font-semibold text-surface-600">工种</span>
                <SystemSelect
                  value={editingItem.workTypeId || ""}
                  onChange={(event) => {
                    const option = workTypeOptions.find((item) => item.id === event.target.value);
                    setEditingItem({ ...editingItem, workTypeId: option?.id || "", workTypeName: option?.name || "" });
                  }}
                  className="input-field"
                >
                  <option value="">未指定</option>
                  {workTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </SystemSelect>
              </label>
              <label className="qm-field space-y-1.5">
                <span className="text-xs font-semibold text-surface-600">材料分类</span>
                <SystemSelect
                  value={editingItem.materialCategoryId || ""}
                  onChange={(event) => {
                    const option = materialCategoryOptions.find((item) => item.id === event.target.value);
                    setEditingItem({ ...editingItem, materialCategoryId: option?.id || "", materialCategoryName: option?.name || "" });
                  }}
                  className="input-field"
                >
                  <option value="">未分类</option>
                  {materialCategoryOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </SystemSelect>
              </label>
              <label className="qm-field space-y-1.5 md:col-span-2">
                <span className="text-xs font-semibold text-surface-600">施工说明</span>
                <textarea
                  value={editingItem.constructionDescription}
                  onChange={(event) => setEditingItem({ ...editingItem, constructionDescription: event.target.value })}
                  className="input-field min-h-32 resize-none leading-6"
                  placeholder="填写该自定义项目的施工范围、工艺要求、验收口径等"
                />
              </label>
              <div className="qm-price-summary border border-surface-200 bg-surface-50 px-3 py-2 md:col-span-2">
                <p className="text-xs font-semibold text-surface-500">客户单价</p>
                <p className="mt-1 text-right text-lg font-semibold tabular-nums text-red-600">{formatAmount(Number(editingItem.laborPrice || 0) + Number(editingItem.materialPrice || 0))}</p>
              </div>
              <div className={editMode === "edit" ? "grid gap-4 md:col-span-2 md:grid-cols-2" : "md:col-span-2"}>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-surface-600">是否特价项目</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editingItem.isSpecialPrice}
                    onClick={() => setEditingItem({ ...editingItem, isSpecialPrice: !editingItem.isSpecialPrice })}
                    className="qm-switch-row flex h-10 w-full items-center justify-between border border-surface-200 bg-white px-3 text-sm text-surface-700 transition hover:border-primary-200 hover:bg-primary-50/40"
                  >
                    <span className="font-medium">{editingItem.isSpecialPrice ? "是" : "否"}</span>
                    <span className={editingItem.isSpecialPrice ? "qm-switch flex h-5 w-9 items-center bg-primary-600 p-0.5 transition" : "qm-switch flex h-5 w-9 items-center bg-surface-300 p-0.5 transition"}>
                      <span className={editingItem.isSpecialPrice ? "qm-switch-thumb h-4 w-4 translate-x-4 bg-white transition" : "qm-switch-thumb h-4 w-4 bg-white transition"} />
                    </span>
                  </button>
                </div>
                {editMode === "edit" && (
                  <label className="qm-field space-y-1.5">
                    <span className="text-xs font-semibold text-surface-600">状态</span>
                    <SystemSelect value={editingItem.status} onChange={(event) => setEditingItem({ ...editingItem, status: event.target.value as CustomQuotaItem["status"] })} className="input-field">
                      <option value="enabled">启用</option>
                      <option value="disabled">停用</option>
                      {editingItem.status === "promoted" && <option value="promoted">已转正</option>}
                    </SystemSelect>
                  </label>
                )}
              </div>
            </div>
            <div className="qm-modal-footer flex justify-end gap-2 border-t border-surface-200 px-5 py-4">
              <button type="button" onClick={() => setEditingItem(null)} className="btn-secondary">取消</button>
              <button type="button" onClick={saveEditingItem} disabled={saving} className="btn-primary">{saving ? "保存中..." : editMode === "create" ? "新增项目" : "保存"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
