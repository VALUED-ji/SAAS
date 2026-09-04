// 系统设置-材料类设置 分类编辑弹窗模块
// 从 page.tsx 渐进拆出的分类编辑弹窗与表单字段组件。

"use client";

import { Loader2, Plus, X } from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import { cn } from "@/lib/utils";

export type Category = {
  id: string;
  name: string;
  parent_id?: string | null;
  parent_name?: string | null;
  sort_order?: number | null;
  is_active?: number | null;
  direct_material_count?: number | null;
  material_count?: number | null;
  child_count?: number | null;
};

export type CategoryDraft = {
  id?: string;
  name: string;
  parent_id: string;
  sort_order: string;
};

export function makeEmptyDraft(parentId = ""): CategoryDraft {
  return { name: "", parent_id: parentId, sort_order: "" };
}

export function normalizeSortInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function isActive(category: Category) {
  return Number(category.is_active ?? 1) === 1;
}

export function CategoryEditorDialog({
  draft,
  categories,
  parentCategories,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  draft: CategoryDraft;
  categories: Category[];
  parentCategories: Category[];
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<CategoryDraft>) => void;
  onSubmit: () => void;
}) {
  const currentCategory = draft.id ? categories.find((item) => item.id === draft.id) : null;
  const hasChildren = Number(currentCategory?.child_count || 0) > 0;
  const availableParents = parentCategories.filter((category) => category.id !== draft.id && isActive(category));

  return (
    <div className="system-settings-modal-overlay fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/24 px-5 py-6 backdrop-blur-[2px] max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭" />
      <div className="system-settings-modal system-settings-compact-modal material-category-editor-dialog relative flex w-full max-w-[600px] flex-col overflow-hidden border bg-white" role="dialog" aria-modal="true" aria-labelledby="material-category-dialog-title">
        <header className="system-settings-modal-header flex min-h-[68px] items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="system-settings-modal-mark flex h-10 w-10 flex-none items-center justify-center border border-blue-100 bg-blue-50 text-blue-600">
              <Plus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p id="material-category-dialog-title" className="text-[15px] font-semibold leading-5 text-surface-900">{draft.id ? "编辑材料分类" : "新增材料分类"}</p>
              <p className="mt-1 text-xs leading-5 text-surface-500">维护材料库分类层级，最多支持一级 / 二级分类。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="system-settings-modal-close flex h-9 w-9 flex-none items-center justify-center text-surface-400 transition hover:text-surface-700" aria-label="关闭弹窗">
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        <main className="system-settings-modal-body px-5 py-5">
          <div className="rounded-[14px] border border-surface-200/80 bg-surface-50/70 p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
              <Field label="分类名称" required className="sm:col-span-2">
                <input
                  value={draft.name}
                  onChange={(event) => onChange({ name: event.target.value })}
                  className="input-field"
                  placeholder="如：PPR管件、瓷砖、乳胶漆"
                />
              </Field>
              <Field label="上级分类" hint="不选择上级分类时，将创建为一级分类。">
                <SystemSelect
                  value={draft.parent_id}
                  onChange={(event) => onChange({ parent_id: event.target.value })}
                  className={cn("input-field w-full", hasChildren && "cursor-not-allowed bg-surface-100 text-surface-500")}
                  disabled={hasChildren}
                  menuClassName="system-settings-select-menu"
                >
                  <option value="">无，作为一级分类</option>
                  {availableParents.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </SystemSelect>
              </Field>
              <Field label="排序" hint="数字越小越靠前。">
                <input
                  value={draft.sort_order}
                  onChange={(event) => onChange({ sort_order: normalizeSortInput(event.target.value) })}
                  className="input-field"
                  inputMode="numeric"
                  placeholder="如：10"
                />
              </Field>
            </div>
            {hasChildren && (
              <p className="mt-4 rounded-[10px] border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                该分类已有二级分类，不能再改成二级分类，避免层级超过两级。
              </p>
            )}
          </div>
        </main>
        <footer className="system-settings-modal-footer flex items-center justify-end gap-2 border-t px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary min-h-9 px-4 text-sm" disabled={saving}>取消</button>
          <button type="button" onClick={onSubmit} className="btn-primary min-h-9 px-5 text-sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("system-settings-field block", className)}>
      <span className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-surface-800">
        {label}
        {required && <b className="font-semibold text-red-500">*</b>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-surface-500">{hint}</span>}
    </label>
  );
}
