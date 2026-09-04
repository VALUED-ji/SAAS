// 供应商信息页编辑/导入弹窗组件模块
// 从 page.tsx 渐进拆出，共享工具来自 ./supplier-editor-shared。

"use client";

import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileDown,
  FileUp,
  Loader2,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import { cn } from "@/lib/utils";
import {
  SupplierAccount,
  SupplierForm,
  normalizeMobile,
  ratingLabels,
  settlementCycleLabels,
  statusLabels,
  supplierImportRules,
  supplierTypeLabels,
} from "./supplier-editor-shared";
export function SupplierImportDialog({
  saving,
  message,
  fileName,
  inputRef,
  onClose,
  onDownloadTemplate,
  onImport,
}: {
  saving: boolean;
  message: string;
  fileName: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onImport: (file: File) => void;
}) {
  const isError = /失败|请|缺少|没有|不在/.test(message);

  return (
    <div className="suppliers-overlay fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/18 px-5 py-6 max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭" />
      <div className="suppliers-modal-shell suppliers-import-modal relative flex max-h-[90vh] w-full max-w-[980px] flex-col overflow-hidden border border-surface-200 bg-white">
        <header className="suppliers-modal-header flex min-h-16 items-center justify-between border-b border-surface-200 bg-white px-5">
          <div>
            <p className="text-base font-semibold text-surface-900">导入供应商</p>
            <p className="mt-0.5 text-xs text-surface-500">先下载模板填写，再上传 Excel 文件；同名供应商会自动更新。</p>
          </div>
          <button type="button" onClick={onClose} className="suppliers-icon-button rounded-lg p-2 text-surface-400 hover:bg-surface-50 hover:text-surface-700" aria-label="关闭导入供应商">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="suppliers-modal-body suppliers-import-layout grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[272px_1fr]">
          <aside className="suppliers-import-aside border-b border-surface-200 bg-surface-50/60 p-5 md:border-b-0 md:border-r">
            <div className="suppliers-import-template rounded-lg border border-primary-100 bg-white p-4">
              <div className="suppliers-import-icon flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <FileDown className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-surface-900">标准 Excel 模板</p>
              <p className="mt-1 text-xs leading-5 text-surface-500">模板内含示例行和填写说明，建议直接按模板填写。</p>
              <button type="button" onClick={onDownloadTemplate} className="btn-secondary mt-4 w-full justify-center">
                <FileDown className="h-4 w-4" />
                下载模板
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs leading-5 text-surface-600">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                仅支持 `.xlsx` 文件，建议不要修改表头名称。
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                供应商名称必填；同名供应商导入后会更新。
              </p>
              <p className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                系统统计字段如订单数、采购金额无需填写。
              </p>
            </div>
          </aside>

          <main className="suppliers-import-main space-y-4 p-5">
            <section className="suppliers-form-section overflow-hidden rounded-lg border border-surface-200 bg-white">
              <div className="border-b border-surface-200 px-4 py-3">
                <p className="text-sm font-semibold text-surface-900">上传要求</p>
              </div>
              <div className="grid gap-3 p-4 text-sm md:grid-cols-3">
                <div className="suppliers-import-requirement rounded-lg bg-surface-50 p-3">
                  <p className="font-semibold text-surface-900">文件格式</p>
                  <p className="mt-1 text-xs leading-5 text-surface-500">上传 Excel `.xlsx`，第一行必须是字段表头。</p>
                </div>
                <div className="suppliers-import-requirement rounded-lg bg-surface-50 p-3">
                  <p className="font-semibold text-surface-900">必填字段</p>
                  <p className="mt-1 text-xs leading-5 text-surface-500">至少填写供应商名称，其余字段可后续补充。</p>
                </div>
                <div className="suppliers-import-requirement rounded-lg bg-surface-50 p-3">
                  <p className="font-semibold text-surface-900">重复处理</p>
                  <p className="mt-1 text-xs leading-5 text-surface-500">同公司同名供应商会更新，不会重复新增。</p>
                </div>
              </div>
            </section>

            <section className="suppliers-form-section overflow-hidden rounded-lg border border-surface-200 bg-white">
              <div className="border-b border-surface-200 px-4 py-3">
                <p className="text-sm font-semibold text-surface-900">字段说明</p>
              </div>
              <div className="max-h-[210px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-100 text-surface-700">
                    <tr>
                      <th className="px-4 py-2 font-semibold">字段</th>
                      <th className="px-4 py-2 font-semibold">要求</th>
                      <th className="px-4 py-2 font-semibold">填写说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-200 text-surface-700">
                    {supplierImportRules.map((rule) => (
                      <tr key={rule[0]}>
                        <td className="px-4 py-2 font-semibold text-surface-900">{rule[0]}</td>
                        <td className={cn("px-4 py-2 font-semibold", rule[1] === "必填" ? "text-red-600" : "text-surface-500")}>{rule[1]}</td>
                        <td className="px-4 py-2 leading-5">{rule[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="suppliers-upload-zone rounded-lg border border-dashed border-primary-200 bg-primary-50/35 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-surface-900">选择已填写的供应商 Excel</p>
                  <p className="mt-1 text-xs text-surface-500">{fileName || "请上传按模板填写后的 .xlsx 文件"}</p>
                </div>
                <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary justify-center" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  选择文件并导入
                </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImport(file);
                }}
              />
              {message && (
                <div className={cn(
                  "mt-3 rounded-lg px-3 py-2 text-xs font-semibold",
                  isError ? "bg-red-50 text-red-600 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                )}>
                  {message}
                </div>
              )}
            </section>
          </main>
        </div>

        <footer className="suppliers-modal-footer flex items-center justify-end gap-2 border-t border-surface-200 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>关闭</button>
        </footer>
      </div>
    </div>
  );
}

export function SupplierEditor({
  form,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  form: SupplierForm;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<SupplierForm>) => void;
  onSubmit: () => void;
	}) {
	  const addAccount = () => {
	    onChange({
	      accounts: [
	        ...form.accounts,
	        {
	          login_account: "",
	          display_name: "",
	          phone: "",
	          role: "ORDER",
	          is_active: true,
	          remark: "",
	        },
	      ],
	    });
	  };
		  const updateAccount = (index: number, patch: Partial<SupplierAccount>) => {
		    onChange({
		      accounts: form.accounts.map((account, accountIndex) => accountIndex === index ? { ...account, ...patch, phone: "" } : account),
		    });
		  };
	  const removeAccount = (index: number) => {
	    onChange({ accounts: form.accounts.filter((_, accountIndex) => accountIndex !== index) });
	  };

	  return (
    <div className="suppliers-overlay fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/18 px-5 py-6 max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭" />
      <div className="suppliers-modal-shell suppliers-editor-modal relative flex max-h-[92vh] w-full max-w-[960px] flex-col overflow-hidden border border-surface-200 bg-white">
        <header className="suppliers-modal-header flex min-h-16 items-center justify-between border-b border-surface-200 px-5">
          <div>
            <p className="text-base font-semibold text-surface-900">{form.id ? "编辑供应商" : "新增供应商"}</p>
            <p className="mt-0.5 text-xs text-surface-500">维护合作信息、结算规则和内部负责人。</p>
          </div>
          <button type="button" onClick={onClose} className="suppliers-icon-button rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-700" aria-label="关闭供应商编辑">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="suppliers-modal-body flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <EditorSection title="基础信息">
            <Field label="供应商名称" required icon={Building2}>
              <input value={form.name} onChange={(event) => onChange({ name: event.target.value })} className="input-field" placeholder="如：东鹏瓷砖成都总代" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="供应商类型" icon={ShieldCheck}>
                <SystemSelect value={form.supplier_type} onChange={(event) => onChange({ supplier_type: event.target.value })} className="input-field" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
                  {Object.entries(supplierTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SystemSelect>
              </Field>
              <Field label="合作状态" icon={ShieldCheck}>
                <SystemSelect value={form.cooperation_status} onChange={(event) => onChange({ cooperation_status: event.target.value })} className="input-field" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SystemSelect>
              </Field>
              <Field label="供应商评级" icon={Star}>
                <SystemSelect value={form.rating} onChange={(event) => onChange({ rating: event.target.value })} className="input-field" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
                  {Object.entries(ratingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SystemSelect>
              </Field>
              <Field label="主营品类" icon={Building2}>
                <input value={form.main_categories} onChange={(event) => onChange({ main_categories: event.target.value })} className="input-field" placeholder="瓷砖、洁具、木门等" />
              </Field>
            </div>
          </EditorSection>

	          <EditorSection title="联系人与地址">
	            <div className="grid gap-3 md:grid-cols-2">
              <Field label="联系人" icon={UserRound}>
                <input value={form.contact} onChange={(event) => onChange({ contact: event.target.value })} className="input-field" placeholder="联系人姓名" />
              </Field>
              <Field label="联系电话" icon={Phone}>
                <input value={form.phone} onChange={(event) => onChange({ phone: event.target.value })} className="input-field" placeholder="手机号或座机" />
              </Field>
              <Field label="内部负责人" icon={UserRound}>
                <input value={form.owner_name} onChange={(event) => onChange({ owner_name: event.target.value })} className="input-field" placeholder="公司内部对接人" />
              </Field>
              <Field label="地址" icon={MapPin}>
                <input value={form.address} onChange={(event) => onChange({ address: event.target.value })} className="input-field" placeholder="门店/仓库/公司地址" />
              </Field>
	            </div>
	          </EditorSection>

	          <EditorSection title="供应商账号">
	            <div className="flex items-center justify-between gap-3">
	              <p className="text-xs leading-5 text-surface-500">用于后续供应商系统登录，可为同一供应商配置多个联系人账号。</p>
	              <button type="button" onClick={addAccount} className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-primary-100 bg-primary-50 px-3 text-xs font-semibold text-primary-700 transition hover:border-primary-200 hover:bg-primary-100">
	                <Plus className="h-3.5 w-3.5" />
	                添加账号
	              </button>
	            </div>
	            {form.accounts.length > 0 ? (
	              <div className="space-y-2">
	                {form.accounts.map((account, index) => (
		                  <div key={account.id || index} className="suppliers-account-row rounded-lg border border-surface-200 bg-white p-3">
		                    <div className="grid gap-3 md:grid-cols-[140px_120px_1fr_92px_40px]">
		                      <Field label="联系电话" icon={Phone} required>
		                        <input
		                          value={account.login_account}
		                          onChange={(event) => updateAccount(index, { login_account: normalizeMobile(event.target.value) })}
		                          className="input-field"
		                          placeholder="11位手机号"
		                          inputMode="numeric"
		                          maxLength={11}
		                        />
		                      </Field>
		                      <Field label="账号姓名" icon={UserRound}>
		                        <input value={account.display_name} onChange={(event) => updateAccount(index, { display_name: event.target.value })} className="input-field" placeholder="姓名" />
		                      </Field>
		                      <Field label="账号备注" icon={FileDown}>
		                        <input value={account.remark} onChange={(event) => updateAccount(index, { remark: event.target.value })} className="input-field" placeholder="主材专员、财务对账、仓库接单等" />
		                      </Field>
		                      <Field label="状态" icon={ShieldCheck}>
		                        <SystemSelect value={account.is_active ? "1" : "0"} onChange={(event) => updateAccount(index, { is_active: event.target.value === "1" })} className="input-field" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
		                          <option value="1">启用</option>
		                          <option value="0">停用</option>
		                        </SystemSelect>
		                      </Field>
		                      <div className="flex items-end justify-end">
		                        <button type="button" onClick={() => removeAccount(index)} className="mb-0.5 rounded-md p-2 text-surface-400 transition hover:bg-red-50 hover:text-red-600" title="删除账号">
		                          <Trash2 className="h-4 w-4" />
		                        </button>
		                      </div>
		                    </div>
		                  </div>
	                ))}
	              </div>
	            ) : (
	              <div className="suppliers-account-empty rounded-lg border border-dashed border-surface-200 bg-white px-4 py-5 text-center text-sm text-surface-400">
	                暂未配置供应商账号，后续开通供应商端时可直接启用。
	              </div>
	            )}
	          </EditorSection>

	          <EditorSection title="结算与财务">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="结算周期" icon={CalendarClock}>
                <SystemSelect value={form.settlement_cycle} onChange={(event) => onChange({ settlement_cycle: event.target.value })} className="input-field" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
                  {Object.entries(settlementCycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SystemSelect>
              </Field>
              <Field label="结算方式" icon={CalendarClock}>
                <input value={form.settlement_method} onChange={(event) => onChange({ settlement_method: event.target.value })} className="input-field" placeholder="公对公、私户、微信、支付宝" />
              </Field>
              <Field label="税号" icon={FileDown}>
                <input value={form.tax_no} onChange={(event) => onChange({ tax_no: event.target.value })} className="input-field" placeholder="纳税人识别号" />
              </Field>
              <Field label="收款账户" icon={FileDown}>
                <input value={form.bank_account} onChange={(event) => onChange({ bank_account: event.target.value })} className="input-field" placeholder="开户行 / 账号" />
              </Field>
            </div>
          </EditorSection>

          <EditorSection title="备注">
            <textarea
              value={form.remark}
              onChange={(event) => onChange({ remark: event.target.value })}
              className="input-field min-h-[92px] resize-none py-2"
              placeholder="合作价格、配送范围、开票规则、注意事项等"
            />
          </EditorSection>
        </div>

        <footer className="suppliers-modal-footer flex items-center justify-end gap-2 border-t border-surface-200 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>取消</button>
          <button type="button" onClick={onSubmit} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}

export function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="suppliers-form-section space-y-3 rounded-lg border border-surface-200 bg-surface-50/50 p-4">
      <p className="text-sm font-semibold text-surface-900">{title}</p>
      {children}
    </section>
  );
}

export function Field({ label, icon: Icon, required, children }: { label: string; icon: any; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="suppliers-field block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-surface-600">
        <Icon className="h-3.5 w-3.5 text-surface-400" />
        {label}
        {required && <b className="font-semibold text-red-500">*</b>}
      </span>
      {children}
    </label>
  );
}
