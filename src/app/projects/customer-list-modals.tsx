// 客户管理列表页弹窗组件模块
// 从 page.tsx 渐进拆出，共享工具来自 ./customer-list-shared。

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown, Download, Loader2, Search, Upload, X } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { customerStatusLabels, normalizeCustomerStatus } from "@/lib/customerStatus";
import { formatDate } from "@/lib/utils";
import styles from "./projects.module.css";
import {
  Customer,
  OrgOption,
  StaffInlineAvatar,
  getCustomerRoomDisplay,
  isOrgActive,
  orgTypeLabels,
  primaryButtonClass,
  secondaryButtonClass,
} from "./customer-list-shared";
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className={styles.filterFieldLabel}>{label}</span>
      {children}
    </div>
  );
}

export function OrgUnitFilterPicker({ options, value, onChange }: { options: OrgOption[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState({ left: 0, top: 0, width: 260, maxHeight: 340 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);
  const visibleOptions = options.filter((option) => isOrgActive(option) || option.id === value);
  const filteredOptions = visibleOptions.filter((option) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [option.name, option.path, orgTypeLabels[option.type]]
      .filter(Boolean)
      .some((item) => String(item).toLowerCase().includes(q));
  });

  const updateMenuPosition = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 12;
    const width = Math.max(rect.width, 260);
    const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding));
    const top = rect.bottom + 6;
    const maxHeight = Math.max(180, Math.min(360, window.innerHeight - top - padding));
    setMenuStyle({ left, top, width, maxHeight });
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleReposition = () => updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const menu = open && mounted ? createPortal(
    <div
      ref={menuRef}
      data-customer-filter-overlay
      className={`${styles.orgMenu} fixed z-[1200] overflow-hidden border border-[#E5EAF2] bg-white shadow-[0_16px_40px_rgba(27,51,88,0.10)]`}
      style={menuStyle}
    >
      <div className="border-b border-[#E5EAF2] bg-[#F8FAFC] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${styles.inputControl} h-9 w-full px-3 pl-9 text-xs font-medium outline-none transition placeholder:text-[#9CA3AF]`}
            placeholder="搜索组织名称或路径"
          />
        </div>
      </div>
      <div className="overflow-y-auto p-1.5" style={{ maxHeight: menuStyle.maxHeight - 54 }}>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              setQuery("");
            }}
            className={styles.orgClearButton}
          >
            清空组织筛选
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {filteredOptions.length > 0 ? filteredOptions.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setOpen(false);
                setQuery("");
              }}
              className={`${styles.orgOption} ${active ? styles.orgOptionActive : ""}`}
            >
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center" style={{ marginLeft: option.depth * 14 }}>
                {active ? <Check className={styles.orgCheckIcon} /> : <Building2 className={styles.orgBuildingIcon} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-semibold">{option.name}</span>
                  <span className={styles.orgTypeTag}>
                    {orgTypeLabels[option.type] || "组织"}
                  </span>
                  {!isOrgActive(option) && <span className="shrink-0 border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">已停用</span>}
                </span>
                <span className={styles.orgPath}>
                  {option.path}
                </span>
              </span>
            </button>
          );
        }) : (
          <div className="px-3 py-8 text-center text-xs font-semibold text-[#8b9aaf]">没有找到匹配的组织</div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={`${styles.inputControl} ${open ? styles.orgPickerOpen : ""} flex min-h-9 w-full items-center justify-between gap-2 border bg-white px-3 py-1.5 text-left text-xs font-medium transition`}
        >
          <span className="min-w-0">
            <span className={`${styles.orgPickerValue} ${selected ? styles.orgPickerValueSelected : ""}`}>{selected?.path || "请选择组织"}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#9CA3AF] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {menu}
    </>
  );
}

export function DuplicateCustomersModal({
  phone,
  customers,
  loading,
  onClose,
  onOpenCustomer,
}: {
  phone: string | null;
  customers: Customer[];
  loading: boolean;
  onClose: () => void;
  onOpenCustomer: (customerId: string) => void;
}) {
  if (!phone) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162033]/35 px-8 py-8 backdrop-blur-[2px]">
      <div className="flex h-[72vh] max-h-[760px] w-[min(1500px,calc(100vw-320px))] min-w-[1080px] flex-col overflow-hidden rounded-[16px] border border-[#d6e2f1] bg-white shadow-[0_18px_44px_rgba(27,51,88,0.12),0_4px_14px_rgba(27,51,88,0.05)]">
        <div className="flex items-center justify-between border-b border-[#e7eff9] bg-[#f8fbff] px-5 py-4">
          <div>
            <h3 className="text-base font-black text-[#162033]">重复客户</h3>
            <p className="mt-1 text-xs font-semibold text-[#8b9aaf]">
              手机号 {phone} 共匹配 {customers.length} 位客户
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8b9aaf] transition hover:bg-[#f4f8ff] hover:text-[#162033]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1040px] text-center text-sm">
            <thead className="bg-[#f8fbff]">
              <tr className="border-b border-[#dce8f8] text-xs font-black text-[#52647b]">
                <th className="px-4 py-3 text-center">客户姓名</th>
                <th className="px-4 py-3 text-center">手机号</th>
                <th className="px-4 py-3 text-center">房号</th>
                <th className="px-4 py-3 text-center">客户状态</th>
                <th className="px-4 py-3 text-center">家装顾问</th>
                <th className="px-4 py-3 text-center">创建时间</th>
                <th className="px-4 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7eff9]">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm font-semibold text-[#8b9aaf]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#407AFF]" />
                      正在查询重复客户...
                    </span>
                  </td>
                </tr>
              )}
              {customers.map((customer) => {
                const status = normalizeCustomerStatus(customer.status);
                const advisorName = customer.advisor_name || customer.inviter_name || customer.created_by_name;
                const advisorAvatar = customer.advisor_avatar || customer.inviter_avatar || customer.created_by_avatar;
                return (
                  <tr key={customer.id} className="transition hover:bg-[#f4f8ff]">
                    <td className="px-4 py-3 text-center font-black text-[#162033]">{customer.name || "未命名客户"}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#34445a]">{customer.phone || "-"}</td>
                    <td className="max-w-[220px] px-4 py-3 text-center text-[#52647b]">
                      <span className="block truncate">{getCustomerRoomDisplay(customer) || "-"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={status.toLowerCase()} label={customerStatusLabels[status] || status} />
                    </td>
                    <td className="px-4 py-3 text-center text-[#52647b]">
                      <StaffInlineAvatar name={advisorName} avatar={advisorAvatar} />
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-[#8b9aaf]">
                      {customer.created_at ? formatDate(customer.created_at) : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenCustomer(customer.id)}
                        className="inline-flex min-h-8 items-center justify-center rounded-[10px] border border-[#dce8f8] bg-white px-3 text-xs font-bold text-[#52647b] transition hover:border-[#cfe1ff] hover:bg-[#f4f8ff] hover:text-[#407AFF]"
                      >
                        打开详情
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type ImportResult = {
  created?: number;
  errors?: { row: number; message: string }[];
};

const customerImportHeaders = ["客户姓名", "手机号", "微信号", "客户来源", "小区/楼盘", "装修面积 (㎡)", "装修预算（万元）", "客户意向", "服务客户门店", "户型", "装修类型", "是否交房", "装修需求", "备注"];
const customerSourceOptions = ["门店", "转介绍", "小程序", "广告投放", "抖音", "小红书", "其它"];
const customerHouseTypeOptions = ["一室一厅", "两室一厅", "两室两厅", "三室一厅", "三室两厅", "四室及以上", "别墅/复式"];
const customerDecorationTypeOptions = ["全包", "半包", "清包"];
const customerIntentionOptions = Array.from({ length: 5 }, (_, index) => "★".repeat(index + 1));
const customerDeliveryOptions = ["已交房", "未交房"];
const customerImportFieldAliases: Record<string, readonly string[]> = {
  "客户姓名": ["客户姓名"],
  "手机号": ["手机号"],
  "微信号": ["微信号"],
  "客户来源": ["客户来源"],
  "小区/楼盘": ["小区/楼盘"],
  "装修面积 (㎡)": ["装修面积 (㎡)", "装修面积", "面积"],
  "装修预算（万元）": ["装修预算（万元）", "装修预算(万元)", "装修预算", "预算"],
  "客户意向": ["客户意向"],
  "服务客户门店": ["服务客户门店", "服务门店"],
  "户型": ["户型"],
  "装修类型": ["装修类型"],
  "是否交房": ["是否交房"],
  "装修需求": ["装修需求"],
  "备注": ["备注"],
};
const importBudgetWanHeaders = new Set(["装修预算（万元）", "装修预算(万元)"]);

type ImportValidationOptions = {
  storeOptions?: string[];
};

export function ImportCustomersModal({
  isOpen,
  onClose,
  onSuccess,
  storeOptions = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  storeOptions?: string[];
}) {
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasImportedSuccessfully = Number(result?.created || 0) > 0;

  if (!isOpen) return null;

  const reset = () => {
    setFileName("");
    setPreviewRows([]);
    setErrors([]);
    setResult(null);
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setResult(null);
    setErrors([]);
    setPreviewRows([]);
    if (!file) return;
    setFileName(file.name);
    const lowerName = file.name.toLowerCase();
    const parsed = lowerName.endsWith(".xlsx")
      ? await parseXlsx(file)
      : lowerName.endsWith(".xls")
        ? parseExcelTable(await file.text())
        : parseCsv(await file.text());
    const validationErrors = validateImportRows(parsed, { storeOptions });
    setPreviewRows(parsed);
    setErrors(validationErrors);
  };

  const handleDownloadTemplate = async () => {
    await downloadXlsxTemplate("客户导入模板.xlsx", [
      customerImportHeaders,
      ["张伟", "13800000000", "zhangwei", "转介绍", "中海国际社区", "128", "30", "★★★", storeOptions[0] || "请填写系统已有门店", "三室两厅", "半包", "已交房", "准备近期装修", ""],
    ], { storeOptions });
  };

  const handleSubmit = async () => {
    const validationErrors = validateImportRows(previewRows, { storeOptions });
    setErrors(validationErrors);
    setResult(null);
    if (validationErrors.length > 0 || previewRows.length === 0) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("zxgj_token");
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          customers: previewRows.map(mapImportRowToPayload),
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.created > 0) onSuccess();
    } catch (err: any) {
      setErrors([err.message || "导入失败"]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#162033]/45 px-4 py-6 backdrop-blur-[1px] sm:px-6">
      <div className="absolute inset-0" onClick={close} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[16px] border border-[#d6e2f1] bg-white shadow-[0_18px_44px_rgba(27,51,88,0.12),0_4px_14px_rgba(27,51,88,0.05)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#e7eff9] bg-[#f8fbff] px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-[#162033]">导入客户</h2>
            <p className="mt-0.5 text-sm font-semibold text-[#8b9aaf]">支持 CSV / XLSX 模板文件，建议先下载模板再填写。</p>
          </div>
          <button onClick={close} className="rounded-[10px] p-1 text-[#8b9aaf] hover:bg-[#f4f8ff] hover:text-[#162033]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f8fbff] px-6 py-5">
          <div className="rounded-[12px] border border-[#dce8f8] bg-white px-4 py-3 text-sm font-semibold text-[#52647b]">
            <p className="font-black text-[#162033]">导入要求</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <p>文件格式：CSV 或下载的 XLSX 模板，第一行必须是表头。</p>
              <p>必填字段：客户姓名、小区/楼盘、装修面积，手机号和微信号至少填一项。</p>
              <p>客户进度由系统按跟进、量房、定金、报价、合同自动判断，导入客户默认从新线索开始。</p>
              <p>装修面积按㎡填写数字；装修预算按万元填写数字，不要带单位。</p>
              <p>是否交房可填：已交房、未交房；留空默认未交房。</p>
              <p>服务客户门店、客户来源、户型、装修类型、客户意向必须使用系统已有选项。</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2F66E8]">
              <Upload className="h-4 w-4" />
              选择文件
              <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={handleFileChange} />
            </label>
            <button type="button" onClick={handleDownloadTemplate} className={secondaryButtonClass}>
              <Download className="h-4 w-4" />
              下载模板
            </button>
            {fileName && <span className="text-sm font-semibold text-[#7c8aa0]">{fileName}</span>}
          </div>

          {previewRows.length > 0 && (
            <div className="overflow-hidden rounded-[12px] border border-[#dce8f8] bg-white">
              <div className="flex items-center justify-between border-b border-[#e7eff9] px-4 py-2">
                <p className="text-sm font-black text-[#162033]">完整预览</p>
                <p className="text-xs font-semibold text-[#8b9aaf]">共 {previewRows.length} 行</p>
              </div>
              <div className="max-h-[34vh] overflow-auto">
                <table className="w-full min-w-[1500px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#f8fbff] text-[#52647b]">
                    <tr>
                      <th className="px-3 py-2 font-black">行号</th>
                      {customerImportHeaders.map((header) => (
                        <th key={header} className="px-3 py-2 font-black">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e7eff9]">
                    {previewRows.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-[#8b9aaf] tabular-nums">{index + 2}</td>
                        {customerImportHeaders.map((header) => (
                          <td key={header} className="max-w-52 truncate px-3 py-2 font-semibold text-[#52647b]" title={readImportCell(row, customerImportFieldAliases[header])}>
                            {readImportCell(row, customerImportFieldAliases[header]) || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <div className="flex items-center justify-between gap-3">
                <p className="font-black">请先修正以下问题</p>
                <p className="text-xs text-red-500">共 {errors.length} 条</p>
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-2">
                {errors.map((error, index) => <p key={index}>{error}</p>)}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              已导入 {result.created || 0} 位客户
              {result.errors?.length ? `，${result.errors.length} 行未导入。` : "。"}
              {hasImportedSuccessfully && <span className="ml-2 text-emerald-600">本次导入已完成，如需继续导入请重新选择文件。</span>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#e7eff9] bg-white px-6 py-4">
          <button type="button" onClick={close} className={secondaryButtonClass}>{hasImportedSuccessfully ? "完成" : "取消"}</button>
          {!hasImportedSuccessfully && (
            <button type="button" disabled={submitting || previewRows.length === 0 || errors.length > 0} onClick={handleSubmit} className={`${primaryButtonClass} disabled:opacity-60`}>
              {submitting ? "导入中..." : "确认导入"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getImportCell(row: Record<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) {
      return { header: alias, value: String(row[alias] || "").trim() };
    }
  }
  return { header: aliases[0] || "", value: "" };
}

function readImportCell(row: Record<string, string>, aliases: readonly string[]) {
  return getImportCell(row, aliases).value;
}

function budgetWanToYuanText(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? String(Math.round(amount * 10000 * 100) / 100) : "";
}

function normalizeImportBudget(row: Record<string, string>) {
  const budget = getImportCell(row, customerImportFieldAliases["装修预算（万元）"]);
  if (!budget.value) return "";
  return importBudgetWanHeaders.has(budget.header) ? budgetWanToYuanText(budget.value) : budget.value;
}

function mapImportRowToPayload(row: Record<string, string>) {
  return {
    name: readImportCell(row, customerImportFieldAliases["客户姓名"]),
    phone: readImportCell(row, customerImportFieldAliases["手机号"]),
    weixin: readImportCell(row, customerImportFieldAliases["微信号"]),
    source: readImportCell(row, customerImportFieldAliases["客户来源"]),
    address: readImportCell(row, customerImportFieldAliases["小区/楼盘"]),
    area_size: readImportCell(row, customerImportFieldAliases["装修面积 (㎡)"]),
    budget: normalizeImportBudget(row),
    intention: readImportCell(row, customerImportFieldAliases["客户意向"]),
    service_store: readImportCell(row, customerImportFieldAliases["服务客户门店"]),
    house_type: readImportCell(row, customerImportFieldAliases["户型"]),
    decoration_type: readImportCell(row, customerImportFieldAliases["装修类型"]),
    is_delivered: readImportCell(row, customerImportFieldAliases["是否交房"]),
    requirements: readImportCell(row, customerImportFieldAliases["装修需求"]),
    remarks: readImportCell(row, customerImportFieldAliases["备注"]),
  };
}

function normalizeImportOption(value?: string | null) {
  return String(value || "").trim();
}

function validateOptionValue(
  errors: string[],
  rowNumber: number,
  label: string,
  value: string | undefined,
  options: string[],
) {
  const text = normalizeImportOption(value);
  if (!text) return;
  if (!options.includes(text)) {
    errors.push(`第 ${rowNumber} 行：${label}「${text}」不在系统选项中，请使用：${options.join("、")}`);
  }
}

export function validateImportRows(rows: Record<string, string>[], options: ImportValidationOptions = {}) {
  const errors: string[] = [];
  const storeOptions = Array.from(new Set((options.storeOptions || []).map(normalizeImportOption).filter(Boolean)));
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = readImportCell(row, customerImportFieldAliases["客户姓名"]);
    const address = readImportCell(row, customerImportFieldAliases["小区/楼盘"]);
    const phone = readImportCell(row, customerImportFieldAliases["手机号"]);
    const weixin = readImportCell(row, customerImportFieldAliases["微信号"]);
    const areaValue = readImportCell(row, customerImportFieldAliases["装修面积 (㎡)"]);
    const budgetValue = readImportCell(row, customerImportFieldAliases["装修预算（万元）"]);
    if (!name) errors.push(`第 ${rowNumber} 行：客户姓名为必填项`);
    if (!address) errors.push(`第 ${rowNumber} 行：小区/楼盘为必填项`);
    if (!phone && !weixin) errors.push(`第 ${rowNumber} 行：手机号和微信号至少填一项`);
    const area = Number(areaValue);
    if (!area || Number.isNaN(area) || area <= 0) errors.push(`第 ${rowNumber} 行：装修面积必须是大于 0 的数字`);
    const budget = Number(budgetValue);
    if (budgetValue && (!Number.isFinite(budget) || budget <= 0)) errors.push(`第 ${rowNumber} 行：装修预算必须是大于 0 的数字`);
    validateOptionValue(errors, rowNumber, "客户来源", readImportCell(row, customerImportFieldAliases["客户来源"]), customerSourceOptions);
    validateOptionValue(errors, rowNumber, "客户意向", readImportCell(row, customerImportFieldAliases["客户意向"]), customerIntentionOptions);
    validateOptionValue(errors, rowNumber, "户型", readImportCell(row, customerImportFieldAliases["户型"]), customerHouseTypeOptions);
    validateOptionValue(errors, rowNumber, "装修类型", readImportCell(row, customerImportFieldAliases["装修类型"]), customerDecorationTypeOptions);
    validateOptionValue(errors, rowNumber, "是否交房", readImportCell(row, customerImportFieldAliases["是否交房"]), customerDeliveryOptions);
    const serviceStore = normalizeImportOption(readImportCell(row, customerImportFieldAliases["服务客户门店"]));
    if (serviceStore && !storeOptions.includes(serviceStore)) {
      errors.push(
        storeOptions.length > 0
          ? `第 ${rowNumber} 行：服务客户门店「${serviceStore}」不在系统启用门店中，请使用：${storeOptions.join("、")}`
          : `第 ${rowNumber} 行：服务客户门店「${serviceStore}」不在系统启用门店中，请先到组织架构维护门店`,
      );
    }
  });
  return errors;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      i += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows[0] || [];
  return rows.slice(1).map((values) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || "";
    });
    return item;
  });
}

export function parseExcelTable(text: string) {
  const parser = new DOMParser();
  const isXmlWorkbook = text.includes("urn:schemas-microsoft-com:office:spreadsheet");
  const doc = parser.parseFromString(text, isXmlWorkbook ? "text/xml" : "text/html");
  const tableRows = Array.from(doc.getElementsByTagName("Row"));
  const htmlRows = Array.from(doc.querySelectorAll("tr"));
  const matrix = (tableRows.length > 0 ? tableRows : htmlRows).map((tr) => {
    const cells = tableRows.length > 0 ? Array.from(tr.getElementsByTagName("Cell")) : Array.from(tr.querySelectorAll("th,td"));
    return cells.map((cell) => cell.textContent?.trim() || "");
  }).filter((row) => row.some(Boolean));
  const headers = matrix[0] || [];
  return matrix.slice(1).map((values) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || "";
    });
    return item;
  });
}

export function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadXlsx(filename: string, rows: unknown[][], sheetName = "导出数据") {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRows(rows as any[][]);
  sheet.columns.forEach((column, index) => {
    const maxLength = Math.max(
      8,
      ...rows.map((row) => String(row[index] ?? "").replace(/[^\x00-\xff]/g, "aa").length),
    );
    column.width = Math.min(Math.max(maxLength + 4, 12), 34);
    column.numFmt = "@";
  });
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF4FA" } };
    cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 26 : 24;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD8E0EA" } },
        left: { style: "thin", color: { argb: "FFD8E0EA" } },
        bottom: { style: "thin", color: { argb: "FFD8E0EA" } },
        right: { style: "thin", color: { argb: "FFD8E0EA" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseXlsx(file: File) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? "").trim());
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (!values.some((value) => String(value ?? "").trim())) return;
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = String(values[index] ?? "").trim();
    });
    rows.push(item);
  });
  return rows;
}

type XlsxTemplateOptions = {
  storeOptions?: string[];
};

export async function downloadXlsxTemplate(filename: string, rows: unknown[][], options: XlsxTemplateOptions = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("客户导入模板", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRows(rows as any[][]);
  sheet.columns.forEach((column, index) => {
    const maxLength = Math.max(
      ...rows.map((row) => String(row[index] ?? "").replace(/[^\x00-\xff]/g, "aa").length)
    );
    column.width = Math.min(Math.max(maxLength + 4, 12), 32);
    column.numFmt = "@";
  });
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FF1F2935" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 22;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });
  const headerRow = rows[0]?.map((value) => String(value ?? "")) || [];
  const validationOptionsByHeader: Record<string, string[]> = {
    "客户来源": customerSourceOptions,
    "客户意向": customerIntentionOptions,
    "服务客户门店": Array.from(new Set((options.storeOptions || []).map(normalizeImportOption).filter(Boolean))),
    "户型": customerHouseTypeOptions,
    "装修类型": customerDecorationTypeOptions,
    "是否交房": customerDeliveryOptions,
  };
  headerRow.forEach((header, index) => {
    const listOptions = validationOptionsByHeader[header] || [];
    const formula = listOptions.join(",");
    if (!listOptions.length || formula.length > 250) return;
    const columnNumber = index + 1;
    for (let row = 2; row <= 200; row += 1) {
      sheet.getCell(row, columnNumber).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${formula}"`],
        showErrorMessage: true,
        errorTitle: `${header}无效`,
        error: `请从下拉列表中选择${header}。`,
      };
    }
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
