// 报价详情页展示组件模块
// 从 page.tsx 渐进拆出的费用展示与归属设置组件。

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Hammer, Layers, X } from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import {
  DictionaryOption,
  QuotationItem,
  formatQuoteAmount,
} from "./quotation-shared";
export function NumberField({ label, suffix, value, onChange, readOnly }: { label: string; suffix: string; value: number; onChange: (value: number) => void; readOnly?: boolean }) {
  const [textValue, setTextValue] = useState(String(value || 0));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setTextValue(String(value || 0));
  }, [focused, value]);

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-surface-700">{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={focused && value === 0 && textValue === "0" ? "" : textValue}
          readOnly={readOnly}
          onFocus={() => {
            setFocused(true);
            if (value === 0) setTextValue("");
          }}
          onBlur={() => {
            setFocused(false);
            if (!textValue) setTextValue("0");
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (!/^\d*\.?\d*$/.test(nextValue)) return;
            setTextValue(nextValue);
            onChange(Number(nextValue || 0));
          }}
          className="input-field w-full pr-10 read-only:cursor-default"
        />
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

function MaterialCategoryPanel({
  options,
  value,
  onChange,
}: {
  options: DictionaryOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const groups = useMemo(() => {
    const parentRows = new Map<string, DictionaryOption>();
    const childRows = new Map<string, DictionaryOption[]>();
    const order: string[] = [];

    options.forEach((option) => {
      const parentName = option.parentName?.trim();
      const groupName = parentName || option.name.trim() || "未分类材料";
      if (!order.includes(groupName)) order.push(groupName);
      if (parentName) {
        childRows.set(groupName, [...(childRows.get(groupName) || []), option]);
      } else {
        parentRows.set(groupName, option);
      }
    });

    return order.map((name) => {
      const children = childRows.get(name) || [];
      const parentOption = parentRows.get(name);
      return {
        name,
        parentOption,
        children: children.length > 0 ? children : parentOption ? [parentOption] : [],
      };
    });
  }, [options]);

  const selectedOption = useMemo(() => options.find((option) => option.id === value), [options, value]);
  const selectedParentName = selectedOption ? (selectedOption.parentName?.trim() || selectedOption.name.trim()) : "";
  const [parentName, setParentName] = useState("");

  useEffect(() => {
    setParentName(selectedParentName);
  }, [selectedParentName]);

  const activeGroup = groups.find((group) => group.name === parentName);
  const childOptions = activeGroup?.children.filter((option) => option.parentName?.trim()) || [];
  const childValue = selectedOption?.parentName ? selectedOption.id : "";

  return (
    <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-surface-700">一级分类</span>
          <SystemSelect
            value={parentName}
            onChange={(event) => {
              const nextParentName = event.target.value;
              setParentName(nextParentName);
              const nextGroup = groups.find((group) => group.name === nextParentName);
              onChange(nextGroup?.parentOption?.id || "");
            }}
            className="input-field h-10 w-full py-0"
            menuClassName="quote-system-select-menu"
            optionClassName="quote-system-select-option"
          >
            <option value="">未分类材料</option>
            {groups.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}
          </SystemSelect>
        </label>
        <label className="block">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="block text-sm font-semibold text-surface-700">二级分类</span>
            <span className="text-xs text-surface-400">可选</span>
          </div>
          <SystemSelect
            value={childValue}
            onChange={(event) => {
              const nextChildId = event.target.value;
              if (nextChildId) {
                onChange(nextChildId);
                return;
              }
              onChange(activeGroup?.parentOption?.id || "");
            }}
            className="input-field h-10 w-full py-0"
            menuClassName="quote-system-select-menu"
            optionClassName="quote-system-select-option"
            disabled={!activeGroup || childOptions.length === 0}
          >
            <option value="">{activeGroup ? "不选择二级分类" : "请先选择一级分类"}</option>
            {childOptions.map((option) => <option key={option.id} value={option.id}>{option.name.replace(`${option.parentName || ""} / `, "")}</option>)}
          </SystemSelect>
        </label>
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
        className="w-full max-w-[720px] overflow-hidden rounded-xl border border-surface-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-100 bg-white px-5 py-4">
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
        <div className="space-y-5 bg-white px-5 py-5">
          <div className="rounded-lg bg-surface-50 px-4 py-3 text-sm leading-6 text-surface-600">
            费用构成用于汇总分析：人工金额按工种统计，材料金额按材料分类统计；综合费用不参与这里的归属。
          </div>
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Hammer className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-900">人工归属</div>
                <div className="mt-1 text-xs text-surface-500">用于人工金额按工种汇总。</div>
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-surface-700">工种</span>
              <SystemSelect
                value={workTypeId}
                onChange={(event) => setWorkTypeId(event.target.value)}
                className="input-field h-10 w-full py-0"
                menuClassName="quote-system-select-menu"
                optionClassName="quote-system-select-option"
              >
                <option value="">未指定工种</option>
                {availableWorkTypes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </SystemSelect>
            </label>
          </div>
          <div className="border-t border-surface-100 pt-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-surface-900">材料归属</div>
                <div className="mt-1 text-xs text-surface-500">一级可直接保存，二级用于更细统计。</div>
              </div>
            </div>
            <MaterialCategoryPanel
              value={materialCategoryId}
              onChange={setMaterialCategoryId}
              options={availableMaterialCategories}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-surface-100 bg-white px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary h-10 px-4">取消</button>
          <button type="button" onClick={() => onSave(workTypeId, materialCategoryId)} className="btn-primary h-10 px-4">保存</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
