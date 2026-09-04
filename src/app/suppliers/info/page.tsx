"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  FileDown,
  FileUp,
  Loader2,
  MapPin,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";


import {
  Supplier,
  SupplierForm,
  makeDefaultForm,
  normalizeMobile,
  normalizeSupplierType,
  ratingLabels,
  ratingValues,
  settlementCycleLabels,
  settlementCycleValues,
  statusLabels,
  statusStyles,
  statusValues,
  supplierImportExamples,
  supplierImportHeaders,
  supplierImportRules,
  supplierTypeLabels,
  supplierTypeValues,
} from "./supplier-editor-shared";
import {
  SupplierEditor,
  SupplierImportDialog,
} from "./supplier-editor";


function supplierToForm(supplier: Supplier): SupplierForm {
  return {
    id: supplier.id,
    name: supplier.name || "",
    supplier_type: normalizeSupplierType(supplier.supplier_type),
    cooperation_status: supplier.cooperation_status || "ACTIVE",
    rating: supplier.rating || "UNRATED",
    main_categories: supplier.main_categories || "",
    contact: supplier.contact || "",
    phone: supplier.phone || "",
    owner_name: supplier.owner_name || "",
    address: supplier.address || "",
    settlement_cycle: supplier.settlement_cycle || "MONTHLY",
    settlement_method: supplier.settlement_method || "",
    tax_no: supplier.tax_no || "",
    bank_account: supplier.bank_account || "",
    accounts: (supplier.accounts || []).map((account) => ({
      id: account.id,
      login_account: account.login_account || "",
      display_name: account.display_name || "",
      phone: account.phone || "",
      role: account.role || "ORDER",
      is_active: account.is_active !== false && account.is_active !== 0,
      remark: account.remark || "",
      last_login_at: account.last_login_at || null,
    })),
    remark: supplier.remark || "",
  };
}

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function cellToText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") {
    const cellValue = value as any;
    if (cellValue.text != null) return String(cellValue.text).trim();
    if (cellValue.result != null) return String(cellValue.result).trim();
    if (Array.isArray(cellValue.richText)) return cellValue.richText.map((item: any) => item?.text || "").join("").trim();
  }
  return String(value).trim();
}

function resolveImportValue(
  row: Record<string, string>,
  fieldNames: string[],
  labelToValue: Record<string, string>,
  valueToLabel: Record<string, string>,
  fallback: string,
  fieldLabel: string
) {
  const raw = fieldNames.map((fieldName) => row[fieldName]).find((value) => String(value || "").trim()) || "";
  const input = String(raw).trim();
  if (!input) return { value: fallback, error: "" };
  if (labelToValue[input]) return { value: labelToValue[input], error: "" };
  if (Object.prototype.hasOwnProperty.call(valueToLabel, input)) return { value: input, error: "" };
  return { value: fallback, error: `${fieldLabel}“${input}”不在模板可选范围内` };
}

function buildSupplierImportForm(row: Record<string, string>) {
  const errors: string[] = [];
  const supplierType = resolveImportValue(row, ["类型", "供应商类型"], supplierTypeValues, supplierTypeLabels, "MAIN_MATERIAL", "类型");
  const status = resolveImportValue(row, ["合作状态", "状态"], statusValues, statusLabels, "ACTIVE", "合作状态");
  const rating = resolveImportValue(row, ["评级"], ratingValues, ratingLabels, "UNRATED", "评级");
  const settlementCycle = resolveImportValue(row, ["结算周期"], settlementCycleValues, settlementCycleLabels, "MONTHLY", "结算周期");
  [supplierType, status, rating, settlementCycle].forEach((item) => {
    if (item.error) errors.push(item.error);
  });
  const name = row["供应商名称"] || row["名称"] || "";
  if (!name.trim()) errors.push("供应商名称必填");

  const form: SupplierForm = {
    name,
    supplier_type: normalizeSupplierType(supplierType.value),
    cooperation_status: status.value,
    rating: rating.value,
    main_categories: row["主营品类"] || "",
    contact: row["联系人"] || "",
    phone: row["电话"] || row["联系电话"] || "",
    owner_name: row["内部负责人"] || row["负责人"] || "",
    address: row["地址"] || "",
    settlement_cycle: settlementCycle.value,
    settlement_method: row["结算方式"] || "",
    tax_no: row["税号"] || "",
    bank_account: row["收款账户"] || row["银行账户"] || "",
    accounts: [],
    remark: row["备注"] || "",
  };
  return { form, errors };
}

async function parseXlsx(file: File) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(cellToText);
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (!values.some((value) => cellToText(value))) return;
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = cellToText(values[index]);
    });
    rows.push(item);
  });
  return rows;
}

async function downloadXlsx(headers: string[], rows: any[][], sheetName: string, fileName: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows([headers, ...rows] as any[][]);
  sheet.columns.forEach((column, index) => {
    const maxLength = Math.max(
      ...[headers, ...rows].map((row) => String(row[index] ?? "").replace(/[^\x00-\xff]/g, "aa").length),
      10
    );
    column.width = Math.min(Math.max(maxLength + 4, 12), index === 13 ? 42 : 30);
  });
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.font = { name: "SimSun", size: 11, bold: true, color: { argb: "FF111827" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 22;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    });
  });

  if (fileName.includes("模板")) {
    const ruleSheet = workbook.addWorksheet("填写说明");
    ruleSheet.addRows([["字段", "是否必填", "填写要求", "示例"], ...supplierImportRules]);
    ruleSheet.columns = [
      { width: 18 },
      { width: 12 },
      { width: 68 },
      { width: 28 },
    ];
    ruleSheet.eachRow((row) => {
      row.height = row.number === 1 ? 24 : 34;
      row.eachCell((cell) => {
        cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
        if (row.number === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        }
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SupplierInfoPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [form, setForm] = useState<SupplierForm>(makeDefaultForm());
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const isErrorMessage = /失败|请|缺少|没有|错误/.test(message);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ suppliers: Supplier[] }>("/api/suppliers");
      setSuppliers(data.suppliers || []);
    } catch (error: any) {
      setMessage(error?.message || "供应商加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (!message || importOpen) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [importOpen, message]);

  const filteredSuppliers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      if (typeFilter && normalizeSupplierType(supplier.supplier_type) !== typeFilter) return false;
      if (statusFilter && (supplier.cooperation_status || "ACTIVE") !== statusFilter) return false;
      if (!keyword) return true;
      return [
        supplier.name,
        supplier.contact,
        supplier.phone,
        supplier.address,
        supplier.owner_name,
        supplier.main_categories,
        supplier.remark,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [search, statusFilter, suppliers, typeFilter]);
  const supplierPagination = useDataPagination(filteredSuppliers, [search, typeFilter, statusFilter].join("|"));

  const openCreate = () => {
    setForm(makeDefaultForm());
    setEditorOpen(true);
    setMessage("");
  };

  const openEdit = (supplier: Supplier) => {
    setForm(supplierToForm(supplier));
    setEditorOpen(true);
    setMessage("");
  };

	  const saveSupplier = async () => {
	    if (!form.name.trim()) {
	      setMessage("请填写供应商名称");
	      return;
	    }
	    const accounts = form.accounts
	      .map((account) => ({ ...account, login_account: normalizeMobile(account.login_account) }))
	      .filter((account) => account.login_account);
	    const invalidAccount = accounts.find((account) => account.login_account.length !== 11);
	    if (invalidAccount) {
	      setMessage("供应商账号联系电话必须为11位手机号");
	      return;
	    }
	    const duplicateAccount = accounts.find((account, index) => accounts.findIndex((item) => item.login_account === account.login_account) !== index);
	    if (duplicateAccount) {
	      setMessage(`供应商账号「${duplicateAccount.login_account}」重复`);
	      return;
	    }
	    setSaving(true);
	    setMessage("");
	    try {
	      await api.post("/api/suppliers", { ...form, accounts });
      setMessage(form.id ? "供应商已更新" : "供应商已新增");
      setEditorOpen(false);
      await loadSuppliers();
    } catch (error: any) {
      setMessage(error?.message || "保存供应商失败");
    } finally {
      setSaving(false);
    }
  };

  const pauseSupplier = async (supplier: Supplier) => {
    if ((supplier.cooperation_status || "ACTIVE") === "PAUSED") {
      setMessage("该供应商已是暂停合作状态");
      return;
    }
    if (!window.confirm(`确定将供应商「${supplier.name}」设为暂停合作吗？该供应商下的所有材料会同步下架。`)) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await api.post<{ pausedMaterialCount?: number }>("/api/suppliers", { action: "pause", id: supplier.id });
      setMessage(`供应商已暂停合作，已下架 ${Number(result.pausedMaterialCount || 0)} 个关联材料`);
      await loadSuppliers();
    } catch (error: any) {
      setMessage(error?.message || "暂停供应商失败");
    } finally {
      setSaving(false);
    }
  };

  const exportXlsx = async () => {
    const headers = ["供应商名称", "类型", "合作状态", "评级", "主营品类", "联系人", "电话", "内部负责人", "结算周期", "结算方式", "地址", "税号", "收款账户", "备注", "材料数", "订单数", "采购金额", "最近维护"];
    const rows = filteredSuppliers.map((supplier) => [
      supplier.name || "",
      supplierTypeLabels[normalizeSupplierType(supplier.supplier_type)] || "主材供应商",
      statusLabels[supplier.cooperation_status || "ACTIVE"] || "合作中",
      ratingLabels[supplier.rating || "UNRATED"] || "未评级",
      supplier.main_categories || "",
      supplier.contact || "",
      supplier.phone || "",
      supplier.owner_name || "",
      settlementCycleLabels[supplier.settlement_cycle || "MONTHLY"] || "月结",
      supplier.settlement_method || "",
      supplier.address || "",
      supplier.tax_no || "",
      supplier.bank_account || "",
      supplier.remark || "",
      supplier.material_count || 0,
      supplier.order_count || 0,
      formatAmount(supplier.order_amount),
      formatDateTime(supplier.updated_at),
    ]);
    await downloadXlsx(headers, rows, "供应商信息", `供应商信息_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadImportTemplate = async () => {
    await downloadXlsx(supplierImportHeaders, supplierImportExamples, "供应商导入模板", `供应商导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importXlsx = async (file: File) => {
    setSaving(true);
    setImportFileName(file.name);
    setMessage("");
    try {
      const rows = await parseXlsx(file);
      if (rows.length < 1) {
        setMessage("导入文件没有可识别的供应商数据");
        return;
      }
      let successCount = 0;
      let failCount = 0;

      for (const row of rows) {
        const { form: payload, errors } = buildSupplierImportForm(row);
        if (errors.length > 0) {
          failCount += 1;
          continue;
        }
        try {
          await api.post("/api/suppliers", { ...payload, action: "import" });
          successCount += 1;
        } catch {
          failCount += 1;
        }
      }

      setMessage(failCount > 0 ? `导入完成：成功 ${successCount} 条，失败 ${failCount} 条` : `导入完成：成功 ${successCount} 条`);
      if (successCount > 0) setImportOpen(false);
      await loadSuppliers();
    } catch (error: any) {
      setMessage(error?.message || "导入供应商失败，请检查表格格式");
    } finally {
      setSaving(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        供应商信息加载中...
      </div>
    );
  }

  return (
    <div className="app-page-surface admin-config-ui supplier-workbench-ui suppliers-design-ui suppliers-info-ui -m-5 flex h-[calc(100%+40px)] min-h-[calc(100%+40px)] flex-col gap-4 bg-[#F5F7FB] p-4 sm:p-5 lg:-m-7 lg:h-[calc(100%+56px)] lg:min-h-[calc(100%+56px)] lg:p-6">
      <section className="suppliers-toolbar shrink-0 border border-surface-200/90 bg-white/95 px-3 py-3">
        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="relative max-w-[520px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input-field w-full pl-9"
                placeholder="搜索供应商、联系人、电话、品类或地址"
              />
            </div>
          </div>
          <div className="suppliers-toolbar-actions flex flex-wrap items-center gap-2.5">
            <SystemSelect value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input-field min-h-10 w-36 py-2" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
              <option value="">全部类型</option>
              {Object.entries(supplierTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SystemSelect>
            <SystemSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field min-h-10 w-36 py-2" menuClassName="suppliers-select-menu" optionClassName="suppliers-select-option">
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SystemSelect>
            <button type="button" onClick={exportXlsx} className="btn-secondary">
              <FileDown className="h-4 w-4" />
              导出供应商
            </button>
            <button type="button" onClick={() => { setImportOpen(true); setMessage(""); }} className="btn-secondary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              导入供应商
            </button>
            <button type="button" onClick={openCreate} className="btn-primary">
              <Plus className="h-4 w-4" />
              新增供应商
            </button>
          </div>
        </div>
      </section>

      <section className="suppliers-list-panel flex min-h-0 flex-1 flex-col overflow-hidden border border-surface-200/90 bg-white/95">
        <ThinScrollArea className="min-h-0 flex-1" scrollClassName="h-full overflow-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-surface-50/85">
              <tr className="border-b border-surface-200 text-xs font-semibold text-surface-600">
                <th className="py-3 pl-5 pr-5">供应商</th>
                <th className="py-3 pr-5">类型</th>
                <th className="py-3 pr-5">状态</th>
                <th className="py-3 pr-5">主营品类</th>
                <th className="py-3 pr-5">联系人</th>
                <th className="py-3 pr-5">内部负责人</th>
                <th className="py-3 pr-5">结算</th>
                <th className="py-3 pr-5 text-right">订单/金额</th>
                <th className="py-3 pr-5">最近维护</th>
                <th className="py-3 pr-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {supplierPagination.pageItems.map((supplier) => {
                const status = supplier.cooperation_status || "ACTIVE";
                return (
                  <tr key={supplier.id} className="transition-colors hover:bg-surface-50/80">
                    <td className="py-3 pl-5 pr-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-semibold text-primary-700 ring-1 ring-primary-100">
                          {supplier.name?.[0] || "供"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-surface-900">{supplier.name}</p>
	                          <p className="mt-0.5 flex max-w-[260px] items-center gap-1 truncate text-xs text-surface-500">
	                            <MapPin className="h-3 w-3 shrink-0" />
	                            {supplier.address || "未填写地址"}
	                          </p>
	                          <p className="mt-0.5 flex items-center gap-1 text-xs text-surface-500">
	                            <Mail className="h-3 w-3 shrink-0" />
	                            {Number(supplier.account_count || supplier.accounts?.length || 0) > 0 ? `${supplier.account_count || supplier.accounts?.length} 个供应商账号` : "未配置供应商账号"}
	                          </p>
	                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-5 text-surface-700">{supplierTypeLabels[normalizeSupplierType(supplier.supplier_type)] || "主材供应商"}</td>
                    <td className="py-3 pr-5">
                      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusStyles[status] || statusStyles.ACTIVE)}>
                        {statusLabels[status] || "合作中"}
                      </span>
                      <span className="ml-2 text-xs text-surface-500">{ratingLabels[supplier.rating || "UNRATED"] || "未评级"}</span>
                    </td>
                    <td className="max-w-[160px] py-3 pr-5">
                      <span className="line-clamp-2 text-surface-700">{supplier.main_categories || "-"}</span>
                    </td>
                    <td className="py-3 pr-5">
                      <p className="font-medium text-surface-800">{supplier.contact || "-"}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-surface-500">
                        <Phone className="h-3 w-3" />
                        {supplier.phone || "未填写"}
                      </p>
                    </td>
                    <td className="py-3 pr-5 text-surface-700">{supplier.owner_name || "-"}</td>
                    <td className="py-3 pr-5">
                      <p className="text-surface-800">{settlementCycleLabels[supplier.settlement_cycle || "MONTHLY"] || "月结"}</p>
                      <p className="mt-0.5 text-xs text-surface-500">{supplier.settlement_method || "未填写方式"}</p>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <p className="font-semibold text-surface-900">{supplier.order_count || 0} 单</p>
                      <p className="mt-0.5 text-xs text-red-600">{formatAmount(supplier.order_amount)}</p>
                    </td>
                    <td className="py-3 pr-5 text-surface-600">{formatDateTime(supplier.updated_at)}</td>
                    <td className="py-3 pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => openEdit(supplier)} className="suppliers-icon-button rounded-md p-1.5 text-surface-500 transition hover:bg-primary-50 hover:text-primary-700" title="编辑">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => pauseSupplier(supplier)} className="suppliers-icon-button rounded-md p-1.5 text-surface-500 transition hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40" title="暂停合作" disabled={status === "PAUSED"}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSuppliers.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm text-surface-500">
                    暂无符合条件的供应商，调整筛选或新增供应商。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ThinScrollArea>
        <DataPagination
          total={filteredSuppliers.length}
          page={supplierPagination.page}
          pageSize={supplierPagination.pageSize}
          onPageChange={supplierPagination.setPage}
          onPageSizeChange={supplierPagination.setPageSize}
          itemName="个供应商"
        />
      </section>

      {editorOpen && (
        <SupplierEditor
          form={form}
          saving={saving}
          onClose={() => setEditorOpen(false)}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onSubmit={saveSupplier}
        />
      )}

      {importOpen && (
        <SupplierImportDialog
          saving={saving}
          message={message}
          fileName={importFileName}
          inputRef={importInputRef}
          onClose={() => setImportOpen(false)}
          onDownloadTemplate={downloadImportTemplate}
          onImport={importXlsx}
        />
      )}

      {message && !importOpen && (
        <div
          className={cn(
            "suppliers-toast fixed left-[calc(var(--active-sidebar-width,260px)+((100vw-var(--active-sidebar-width,260px))/2))] top-5 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(15,23,42,0.14)] max-md:left-1/2",
            isErrorMessage ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"
          )}
        >
          {isErrorMessage ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="ml-1 rounded p-0.5 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
            aria-label="关闭提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
