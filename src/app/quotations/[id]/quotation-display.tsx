// 报价详情页展示组件模块
// 从 page.tsx 渐进拆出的费用展示与归属设置组件。

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import {
  DictionaryOption,
  QuotationItem,
  formatQuoteAmount,
} from "./quotation-shared";
export function NumberField({ label, suffix, value, onChange, readOnly }: { label: string; suffix: string; value: number; onChange: (value: number) => void; readOnly?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-surface-700">{label}</span>
      <div className="relative">
        <input type="number" value={value} readOnly={readOnly} onChange={(event) => onChange(Number(event.target.value || 0))} className="input-field w-full pr-10 read-only:cursor-default" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">{suffix}</span>
      </div>
    </label>
  );
}

export function CostPill({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-md px-3 py-2 ${strong ? "bg-red-50" : "bg-surface-50"}`}>
      <div className={`text-xs font-medium ${strong ? "text-red-500" : "text-surface-500"}`}>{label}</div>
      <div className={`mt-1 font-semibold tabular-nums ${strong ? "text-red-600" : "text-surface-900"}`}>{formatQuoteAmount(value)}</div>
    </div>
  );
}

export function CostCompositionBlock({ title, rows, emptyText }: { title: string; rows: { name: string; amount: number }[]; emptyText: string }) {
  return (
    <div className="rounded-md border border-surface-100 bg-surface-50/70 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-surface-900">{title}</p>
        <span className="text-xs font-semibold text-surface-400">费用构成</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md bg-white px-3 py-3 text-sm text-surface-500">{emptyText}</p>
      ) : (
        <div className="grid gap-1.5">
          {rows.slice(0, 8).map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium text-surface-700" title={row.name}>{row.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-surface-900">{formatQuoteAmount(row.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PackagePricingMetric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-[64px] flex-col justify-center rounded-md border border-surface-200 bg-surface-50 px-3">
      <span className="text-xs font-medium text-surface-500">{label}</span>
      <span className={`mt-1 text-sm font-semibold tabular-nums ${strong ? "text-red-600" : "text-surface-900"}`}>{value}</span>
    </div>
  );
}

export function AttributionDialog({
  item,
  workTypeOptions,
  materialCategoryOptions,
  onClose,
  onSave,
}: {
  item: QuotationItem;
  workTypeOptions: DictionaryOption[];
  materialCategoryOptions: DictionaryOption[];
  onClose: () => void;
  onSave: (workTypeId: string, materialCategoryId: string) => void;
}) {
  const [workTypeId, setWorkTypeId] = useState(item.work_type_id || "");
  const [materialCategoryId, setMaterialCategoryId] = useState(item.material_category_id || "");
  const titleText = item.name?.trim() || "未命名项目";
  const availableWorkTypes = useMemo(() => {
    const rows = [...workTypeOptions];
    if (item.work_type_id && item.work_type_name && !rows.some((option) => option.id === item.work_type_id)) {
      rows.unshift({ id: item.work_type_id, name: item.work_type_name });
    }
    return rows;
  }, [item.work_type_id, item.work_type_name, workTypeOptions]);
  const availableMaterialCategories = useMemo(() => {
    const rows = [...materialCategoryOptions];
    if (item.material_category_id && item.material_category_name && !rows.some((option) => option.id === item.material_category_id)) {
      rows.unshift({ id: item.material_category_id, name: item.material_category_name });
    }
    return rows;
  }, [item.material_category_id, item.material_category_name, materialCategoryOptions]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-[18px] border border-surface-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-surface-900">设置费用归属</div>
            <div className="mt-1 truncate text-sm text-surface-500">{titleText}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-50 hover:text-surface-700"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-surface-100 bg-surface-50/70 px-4 py-3 text-sm text-surface-600">
            费用构成只用于汇总分析：人工金额按工种统计，材料金额按材料分类统计；综合费用不参与这里的归属。
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-surface-700">工种</span>
            <SystemSelect
              value={workTypeId}
              onChange={(event) => setWorkTypeId(event.target.value)}
              className="input-field h-11 w-full py-0"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="">未指定工种</option>
              {availableWorkTypes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </SystemSelect>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-surface-700">材料分类</span>
            <SystemSelect
              value={materialCategoryId}
              onChange={(event) => setMaterialCategoryId(event.target.value)}
              className="input-field h-11 w-full py-0"
              menuClassName="quote-system-select-menu"
              optionClassName="quote-system-select-option"
            >
              <option value="">未分类材料</option>
              {availableMaterialCategories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </SystemSelect>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-surface-100 bg-surface-50/70 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary h-10 px-4">取消</button>
          <button type="button" onClick={() => onSave(workTypeId, materialCategoryId)} className="btn-primary h-10 px-4">保存</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

