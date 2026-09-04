// 分公司设置页通用表单字段组件
// 从 page.tsx 渐进拆出的纯展示表单控件。

import { ImageIcon, Loader2, Upload } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";
import SystemSelect from "@/components/ui/SystemSelect";
import { cn } from "@/lib/utils";

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)} className="branch-settings-check-field inline-flex min-h-9 items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-50">
      <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary-600 bg-primary-600" : "border-surface-300 bg-white"}`}>
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {label}
    </button>
  );
}

export function BrandLogoField({
  value,
  uploading,
  disabled,
  label = "品牌Logo",
  setText,
  emptyText = "当前使用默认Logo",
  helpText = "保存后，公司及下级账号左上角会显示此Logo。",
  uploadText = "上传Logo",
  clearText = "恢复默认",
  onUpload,
  onClear,
}: {
  value: string;
  uploading: boolean;
  disabled?: boolean;
  label?: string;
  setText?: string;
  emptyText?: string;
  helpText?: string;
  uploadText?: string;
  clearText?: string;
  onUpload: (file?: File | null) => void;
  onClear: () => void;
}) {
  const previewUrl = String(value || "").trim();
  return (
    <div className="md:col-span-2 xl:col-span-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="block text-sm font-medium text-surface-700">{label}</span>
        <span className="text-xs text-surface-400">建议PNG/JPG，2MB以内</span>
      </div>
      <div className="branch-settings-logo-field flex flex-wrap items-center gap-3 border border-surface-200 bg-white p-3">
        <div className="flex h-14 w-32 shrink-0 items-center justify-center overflow-hidden bg-surface-50 px-2">
          {previewUrl ? (
            <NativeImage src={previewUrl} alt={`${label}预览`} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center rounded-md border border-dashed border-surface-200 bg-[#f8fafc] text-surface-400">
              <ImageIcon className="h-5 w-5" />
              <span className="mt-1 text-[11px] font-semibold leading-none">未设置</span>
            </div>
          )}
        </div>
        <div className="min-w-[180px] flex-1">
          <p className="text-sm font-semibold text-surface-800">{value ? (setText || `已设置${label}`) : emptyText}</p>
          <p className="mt-0.5 text-xs text-surface-500">{helpText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn("btn-secondary h-9 min-h-9 cursor-pointer px-3 py-0 text-xs", (uploading || disabled) && "pointer-events-none opacity-60")}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "上传中" : uploadText}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading || disabled}
              onChange={(event) => {
                onUpload(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {value && (
            <button type="button" className="btn-secondary h-9 min-h-9 px-3 py-0 text-xs" disabled={uploading || disabled} onClick={onClear}>
              {clearText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-surface-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-field"
        placeholder={placeholder}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-surface-700">{label}</span>
      <SystemSelect
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="input-field disabled:cursor-not-allowed disabled:bg-surface-50 disabled:text-surface-400"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </SystemSelect>
    </label>
  );
}

export function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-surface-700">{label}</span>
      <span className="branch-settings-number-field flex items-center rounded-lg border border-surface-200 bg-white focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-100/70">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
          className="min-h-10 min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-surface-800 outline-none"
        />
        <span className="shrink-0 border-l border-surface-100 px-3 text-xs font-medium text-surface-400">{suffix}</span>
      </span>
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  variant = "boxed",
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  variant?: "boxed" | "standalone";
}) {
  if (variant === "standalone") {
    return (
      <div className="block">
        <span className="mb-1 block text-sm font-medium text-transparent select-none" aria-hidden="true">占位</span>
        <span className="branch-settings-toggle-field flex h-10 min-h-10 items-center justify-between gap-3 rounded-lg border border-surface-200 bg-white px-3 py-0">
          <span className="text-sm font-medium text-surface-700">
            {label}
          </span>
          <button
            type="button"
            aria-label={label}
            aria-pressed={checked}
            onClick={() => onChange(!checked)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-primary-600" : "bg-surface-200"}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="branch-settings-toggle-field flex h-10 min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-surface-200 bg-white px-3 py-0 text-left transition-colors hover:border-surface-300 hover:bg-surface-50"
    >
      <span className="text-sm font-medium text-surface-700">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary-600" : "bg-surface-200"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
