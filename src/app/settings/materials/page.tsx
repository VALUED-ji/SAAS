"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  AlertCircle,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  Edit3,
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
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";

import {
  Category,
  CategoryDraft,
  CategoryEditorDialog,
  isActive,
  makeEmptyDraft,
} from "./category-editor-dialog";

import {
  MaterialCategoryIcon,
} from "./material-category-icon";




function normalizeNumberText(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.max(0, number)) : "0";
}

export default function MaterialSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const canManage = ["OWNER", "ADMIN"].includes(user?.role || "");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>(makeEmptyDraft());
  const isErrorMessage = /失败|请|缺少|没有|错误|权限|只有/.test(message);

  const parentCategories = useMemo(() => categories.filter((item) => !item.parent_id), [categories]);

  const childrenByParentId = useMemo(() => {
    return categories.reduce<Record<string, Category[]>>((result, category) => {
      if (!category.parent_id) return result;
      if (!result[category.parent_id]) result[category.parent_id] = [];
      result[category.parent_id].push(category);
      return result;
    }, {});
  }, [categories]);

  const filterText = keyword.trim().toLowerCase();
  const shouldUseFlatList = Boolean(filterText) || Boolean(levelFilter) || statusFilter === "inactive";
  const matchesCategoryFilters = useCallback((category: Category) => {
    if (statusFilter === "active" && !isActive(category)) return false;
    if (statusFilter === "inactive" && isActive(category)) return false;
    if (levelFilter === "parent" && category.parent_id) return false;
    if (levelFilter === "child" && !category.parent_id) return false;
    if (!filterText) return true;
    return [category.name, category.parent_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(filterText));
  }, [filterText, levelFilter, statusFilter]);

  const flatCategories = useMemo(() => categories.filter(matchesCategoryFilters), [categories, matchesCategoryFilters]);
  const treeParentCategories = useMemo(() => parentCategories.filter(matchesCategoryFilters), [matchesCategoryFilters, parentCategories]);
  const visibleCategories = shouldUseFlatList ? flatCategories : treeParentCategories;
  const categoryPagination = useDataPagination(visibleCategories, [keyword, levelFilter, statusFilter].join("|"));

  const expandableParentIds = useMemo(
    () => parentCategories.filter((category) => Number(category.child_count || 0) > 0).map((category) => category.id),
    [parentCategories]
  );

  const expandAllParents = () => {
    setExpandedParents(Object.fromEntries(expandableParentIds.map((id) => [id, true])));
  };

  const collapseAllParents = () => {
    setExpandedParents({});
  };

  const allParentsExpanded = expandableParentIds.length > 0 && expandableParentIds.every((id) => Boolean(expandedParents[id]));

  const toggleAllParents = () => {
    if (allParentsExpanded) {
      collapseAllParents();
      return;
    }
    expandAllParents();
  };

  const toggleParentExpanded = (categoryId: string) => {
    setExpandedParents((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  };

  const loadData = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<{ categories: Category[] }>("/api/materials?view=categories");
      setCategories(data.categories || []);
    } catch (error: any) {
      setMessage(error?.message || "材料分类加载失败");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, loadData]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const openCreate = (parentId = "") => {
    setDraft(makeEmptyDraft(parentId));
    setEditorOpen(true);
    setMessage("");
  };

  const openEdit = (category: Category) => {
    setDraft({
      id: category.id,
      name: category.name || "",
      parent_id: category.parent_id || "",
      sort_order: String(category.sort_order ?? ""),
    });
    setEditorOpen(true);
    setMessage("");
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setDraft(makeEmptyDraft());
  };

  const saveCategory = async () => {
    if (!canManage) {
      setMessage("只有老板或管理员可以维护材料分类");
      return;
    }
    if (!draft.name.trim()) {
      setMessage("请填写分类名称");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await api.post("/api/materials", {
        action: draft.id ? "update_category" : "add_category",
        id: draft.id,
        name: draft.name.trim(),
        parent_id: draft.parent_id || null,
        sort_order: draft.sort_order === "" ? undefined : normalizeNumberText(draft.sort_order),
      });
      setMessage(draft.id ? "分类已更新" : "分类已新增");
      closeEditor();
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "保存分类失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleCategoryStatus = async (category: Category) => {
    if (!canManage) {
      setMessage("只有老板或管理员可以维护材料分类");
      return;
    }
    const active = isActive(category);
    const confirmText = active
      ? `确定停用材料分类「${category.name}」吗？停用后新增材料和导入材料不能再选择此分类。`
      : `确定启用材料分类「${category.name}」吗？`;
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    setMessage("");
    try {
      await api.post("/api/materials", { action: "toggle_category_status", id: category.id, is_active: active ? 0 : 1 });
      setMessage(active ? "分类已停用" : "分类已启用");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || (active ? "停用分类失败" : "启用分类失败"));
    } finally {
      setSaving(false);
    }
  };

  const renderCategoryColGroup = () => (
    <colgroup>
      <col className="w-[30%]" />
      <col className="w-[12%]" />
      <col className="w-[16%]" />
      <col className="w-[8%]" />
      <col className="w-[9%]" />
      <col className="w-[9%]" />
      <col className="w-[8%]" />
      <col className="w-[8%]" />
    </colgroup>
  );

  const renderCategoryCells = (category: Category, options?: { canExpand?: boolean; expanded?: boolean; childRow?: boolean }) => {
    const active = isActive(category);
    const isChild = Boolean(category.parent_id);
    const canExpand = Boolean(options?.canExpand);
    const expanded = Boolean(options?.expanded);

    return (
      <>
        <td className="px-4 py-3">
          <div className={cn("flex items-center gap-2", (isChild || options?.childRow) && "pl-9")}>
            {isChild || options?.childRow ? (
              <span className="h-px w-4 bg-surface-300" />
            ) : canExpand ? (
              <button
                type="button"
                onClick={() => toggleParentExpanded(category.id)}
                className="system-settings-tree-toggle flex h-7 w-7 items-center justify-center rounded-[8px] text-surface-500 transition hover:bg-primary-50 hover:text-primary-700"
                title={expanded ? "收起二级分类" : "展开二级分类"}
                aria-expanded={expanded}
              >
                <ChevronRight className={cn("h-4 w-4 transition-transform duration-300 ease-out", expanded && "rotate-90")} />
              </button>
            ) : (
              <span className="h-6 w-6" />
            )}
            <MaterialCategoryIcon category={category} compact={isChild || options?.childRow} />
            <span className="font-semibold text-surface-900">{category.name}</span>
          </div>
        </td>
        <td className="py-3 pr-4 text-center">
          <span className={cn(
            "system-settings-level-tag inline-flex min-w-[68px] justify-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1",
            isChild ? "bg-primary-50 text-primary-700 ring-primary-100" : "bg-surface-100 text-surface-700 ring-surface-200"
          )}>
            {isChild ? "二级分类" : "一级分类"}
          </span>
        </td>
        <td className="py-3 pr-4 text-center text-surface-700">{category.parent_name || "-"}</td>
        <td className="py-3 pr-4 text-center text-surface-700">{Number(category.sort_order || 0)}</td>
        <td className="py-3 pr-4 text-center text-surface-700">{Number(category.child_count || 0)}</td>
        <td className="py-3 pr-4 text-center text-surface-700">{Number(category.material_count || 0)}</td>
        <td className="py-3 pr-4 text-center">
          <span className={cn(
            "system-settings-status-tag inline-flex min-w-[64px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1",
            active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-surface-100 text-surface-600 ring-surface-200"
          )}>
            {active ? "启用" : "停用"}
          </span>
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-center justify-end gap-2">
            {!isChild && (
              <button type="button" onClick={() => openCreate(category.id)} className="system-settings-row-action rounded-[8px] p-1.5 text-surface-500 transition hover:bg-primary-50 hover:text-primary-700" title="新增二级分类" aria-label={`为${category.name}新增二级分类`}>
                <Plus className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={() => openEdit(category)} className="system-settings-row-action rounded-[8px] p-1.5 text-surface-500 transition hover:bg-primary-50 hover:text-primary-700" title="编辑分类" aria-label={`编辑${category.name}`}>
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleCategoryStatus(category)}
              className={cn(
                "system-settings-row-action rounded-[8px] p-1.5 text-surface-500 transition",
                active ? "hover:bg-amber-50 hover:text-amber-600" : "hover:bg-emerald-50 hover:text-emerald-600"
              )}
              title={active ? "停用分类" : "启用分类"}
              aria-label={`${active ? "停用" : "启用"}${category.name}`}
            >
              {active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            </button>
          </div>
        </td>
      </>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-96 items-center justify-center text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        材料分类加载中...
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
          <p className="mt-4 text-base font-semibold text-surface-900">无权限访问材料分类</p>
          <p className="mt-2 text-sm leading-6 text-surface-500">材料分类属于系统主数据，仅老板或管理员可以维护。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="app-page-surface admin-config-ui system-settings-ui system-settings-split-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="system-settings-toolbar-panel system-settings-toolbar flex shrink-0 flex-col gap-3 rounded-[14px] border border-surface-200/90 bg-white/95 px-3 py-3 shadow-none xl:flex-row xl:items-center xl:justify-between">
          <div className="system-settings-list-heading min-w-0 flex-1 border-l-[3px] border-primary-500 pl-3">
            <p className="text-sm font-semibold text-surface-900">材料分类列表</p>
            <p className="mt-1 text-xs leading-5 text-surface-500">新增按钮集中在顶部，二级分类可在列表中直接识别所属一级分类。</p>
          </div>
          <div className="system-settings-toolbar-controls flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64 2xl:w-[300px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="input-field pl-9"
                placeholder="搜索分类或上级分类"
              />
            </div>
            <SystemSelect value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} className="input-field w-32 py-2" menuClassName="system-settings-select-menu">
              <option value="">全部层级</option>
              <option value="parent">一级分类</option>
              <option value="child">二级分类</option>
            </SystemSelect>
            <SystemSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field w-32 py-2" menuClassName="system-settings-select-menu">
              <option value="active">启用中</option>
              <option value="inactive">已停用</option>
              <option value="">全部状态</option>
            </SystemSelect>
            <button
              type="button"
              onClick={toggleAllParents}
              disabled={expandableParentIds.length === 0}
              className="btn-secondary min-h-10 px-3.5 text-sm"
            >
              {allParentsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {allParentsExpanded ? "全部收起" : "全部展开"}
            </button>
            <button type="button" onClick={() => openCreate()} className="btn-primary">
              <Plus className="h-4 w-4" />
              新增分类
            </button>
          </div>
      </section>

      <section className="system-settings-list-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-surface-200/90 bg-white/95 shadow-none">
        <ThinScrollArea className="system-settings-table-scroll min-h-0 flex-1">
          <table className="w-full min-w-[980px] table-fixed text-left text-[13px]">
            {renderCategoryColGroup()}
            <thead className="bg-surface-50">
              <tr className="border-b border-surface-200 text-xs font-semibold text-surface-700">
                <th className="px-4 py-2.5">分类名称</th>
                <th className="py-2.5 pr-4 text-center">层级</th>
                <th className="py-2.5 pr-4 text-center">上级分类</th>
                <th className="py-2.5 pr-4 text-center">排序</th>
                <th className="py-2.5 pr-4 text-center">二级数</th>
                <th className="py-2.5 pr-4 text-center">材料数</th>
                <th className="py-2.5 pr-4 text-center">状态</th>
                <th className="py-2.5 pr-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {categoryPagination.pageItems.map((category) => {
                if (shouldUseFlatList) {
                  return (
                    <tr key={category.id} className={cn("transition hover:bg-surface-50/80", !isActive(category) && "bg-surface-50/60 text-surface-500")}>
                      {renderCategoryCells(category)}
                    </tr>
                  );
                }

                const childRows = (childrenByParentId[category.id] || []).filter(matchesCategoryFilters);
                const canExpand = childRows.length > 0;
                const expanded = Boolean(expandedParents[category.id]);

                return (
                  <Fragment key={category.id}>
                    <tr className={cn("transition hover:bg-surface-50/80", !isActive(category) && "bg-surface-50/60 text-surface-500")}>
                      {renderCategoryCells(category, { canExpand, expanded })}
                    </tr>
                    {canExpand && (
                      <tr className={cn("material-category-children-row", !expanded && "is-collapsed")}>
                        <td colSpan={8} className="p-0">
                          <div
                            className={cn(
                              "grid overflow-hidden transition-[grid-template-rows,opacity] ease-out",
                              expanded ? "grid-rows-[1fr] opacity-100 duration-300" : "pointer-events-none grid-rows-[0fr] opacity-0 duration-500"
                            )}
                            aria-hidden={!expanded}
                          >
                            <div className="min-h-0">
                              <table className="w-full table-fixed text-left text-[13px]">
                                {renderCategoryColGroup()}
                                <tbody>
                                  {childRows.map((child) => (
                                    <tr key={child.id} className={cn("transition hover:bg-surface-50/80", !isActive(child) && "bg-surface-50/60 text-surface-500")}>
                                      {renderCategoryCells(child, { childRow: true })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {visibleCategories.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-surface-500">暂无符合条件的材料分类。</td>
                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination
          total={visibleCategories.length}
          page={categoryPagination.page}
          pageSize={categoryPagination.pageSize}
          onPageChange={categoryPagination.setPage}
          onPageSizeChange={categoryPagination.setPageSize}
          itemName="个分类"
        />
      </section>

      {editorOpen && (
        <CategoryEditorDialog
          draft={draft}
          categories={categories}
          parentCategories={parentCategories}
          saving={saving}
          onClose={closeEditor}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSubmit={saveCategory}
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
          <button
            type="button"
            onClick={() => setMessage("")}
            className="ml-1 rounded-md p-1 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
            aria-label="关闭提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

