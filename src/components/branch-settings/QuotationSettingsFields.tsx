"use client";

import { ClipboardList, FileCheck2, ListChecks, Plus, Trash2 } from "lucide-react";
import { BrandLogoField } from "@/app/branch-settings/[id]/branch-settings-fields";

type Props = {
  splitCustomerPrice: boolean;
  onSplitCustomerPriceChange: (value: boolean) => void;
  quotationLogoUrl: string;
  uploadingLogo: boolean;
  disabled?: boolean;
  onLogoUpload: (file?: File | null) => void;
  onLogoClear: () => void;
  signatureLabels: string[];
  defaultSignatureLabels: string[];
  onSignatureLabelsChange: (labels: string[]) => void;
};

export default function QuotationSettingsFields({
  splitCustomerPrice, onSplitCustomerPriceChange, quotationLogoUrl, uploadingLogo,
  disabled = false, onLogoUpload, onLogoClear, signatureLabels,
  defaultSignatureLabels, onSignatureLabelsChange,
}: Props) {
  const labels = signatureLabels.length ? signatureLabels : defaultSignatureLabels;
  const updateLabel = (index: number, value: string) => onSignatureLabelsChange(labels.map((label, i) => i === index ? value : label));
  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-surface-900">客户单价区分人工与材料</p>
            <p className="mt-1 text-xs text-surface-500">默认开启，关闭后仅填写客户单价；内部人工、材料成本仍分别维护。</p>
          </div>
          <button type="button" role="switch" aria-label="客户单价区分人工与材料"
            aria-checked={splitCustomerPrice} disabled={disabled}
            onClick={() => onSplitCustomerPriceChange(!splitCustomerPrice)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${splitCustomerPrice ? "bg-primary-600" : "bg-surface-200"}`}>
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${splitCustomerPrice ? "translate-x-4" : "translate-x-0"}`} />
          </button>
        </div>
        <p className="mt-2 text-xs text-surface-500">适用于该分公司的定额与新建报价，已保存报价保留原计价方式。</p>
      </section>
      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <div className="mb-3 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><FileCheck2 className="h-4 w-4" /></span><div><p className="font-semibold text-surface-900">打印标识</p><p className="mt-0.5 text-xs text-surface-500">单独维护报价文件中使用的 Logo。</p></div></div>
        <BrandLogoField value={quotationLogoUrl} uploading={uploadingLogo} disabled={disabled} label="报价打印Logo" setText="已设置报价打印Logo" emptyText="未单独设置，打印时沿用默认Logo" helpText="用于报价预览、打印PDF和报价表格封面，不影响系统左上角品牌Logo。" uploadText="上传打印Logo" clearText="清除打印Logo" onUpload={onLogoUpload} onClear={onLogoClear} />
      </section>
      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ecfdf3] text-[#16824a]"><ListChecks className="h-4 w-4" /></span><div><p className="font-semibold text-surface-900">报价单签字栏</p><p className="mt-0.5 text-xs text-surface-500">维护该分公司装修报价单底部展示的签字项。</p></div></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" aria-label="恢复默认签字栏" disabled={disabled} onClick={() => onSignatureLabelsChange([...defaultSignatureLabels])}>恢复默认</button><button type="button" className="btn-secondary" disabled={disabled || labels.length >= 8} onClick={() => onSignatureLabelsChange([...labels, `签字栏${labels.length + 1}`])}><Plus className="h-4 w-4" />添加签字栏</button></div></div>
        <div className="grid gap-3 lg:grid-cols-2">{labels.map((label, index) => <div key={index} className="grid grid-cols-[24px_minmax(0,1fr)_40px] items-center gap-2 rounded-lg border border-surface-100 bg-surface-50/60 p-3"><span className="text-sm font-semibold text-surface-400">{index + 1}</span><input aria-label={`签字栏${index + 1}`} maxLength={50} disabled={disabled} value={label} onChange={(event) => updateLabel(index, event.target.value)} className="input-field min-w-0 bg-white" placeholder="例如：客户签字" /><button type="button" aria-label={`删除签字栏${index + 1}`} title="删除签字栏" disabled={disabled || labels.length <= 1} onClick={() => onSignatureLabelsChange(labels.filter((_, i) => i !== index))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div>)}</div>
        <div className="mt-4 rounded-lg border border-surface-100 bg-surface-50/70 p-3"><div className="mb-3 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[#c25a18]" /><p className="text-sm font-semibold text-surface-900">打印预览</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{labels.map((label, index) => <div key={index} className="min-h-12 rounded-md bg-white px-3 py-2 text-sm font-semibold text-surface-700">{label.trim() || `签字栏${index + 1}`}</div>)}</div></div>
      </section>
    </div>
  );
}
