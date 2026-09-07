"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Columns3, Download, Loader2, Printer, X } from "lucide-react";
import { QuotationPrintDocument, type PrintableQuotationDetail, type PrintableQuotationItem, type PrintableQuotationSettings, type QuotationBaseColumnKey, type QuotationBaseColumnOptions, type QuotationOutputMode, type QuotationPrintScope } from "@/components/QuotationPrintDocument";
import type { CSSProperties } from "react";

type SharedQuotation = PrintableQuotationDetail & {
  settings?: PrintableQuotationSettings;
  items?: PrintableQuotationItem[];
};
type BaseExportColumnKey = QuotationBaseColumnKey;

const baseExportColumnOptions: { key: BaseExportColumnKey; label: string }[] = [
  { key: "materialUnit", label: "材料单价" },
  { key: "materialTotal", label: "材料合价" },
  { key: "laborUnit", label: "人工单价" },
  { key: "laborTotal", label: "人工合价" },
  { key: "subtotal", label: "小计" },
  { key: "description", label: "施工工艺及材料说明" },
];
const configurableExportScopes: QuotationPrintScope[] = ["all", "all_without_cover", "base"];

function hasReadableRichText(value: unknown) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0;
}

export default function QuotationSharePage() {
  const params = useParams<{ id: string }>();
  const shareToken = params.id;
  const [data, setData] = useState<SharedQuotation | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canUsePrintTools, setCanUsePrintTools] = useState(false);
  const [outputMode, setOutputMode] = useState<QuotationOutputMode>("list");
  const [printScope, setPrintScope] = useState<QuotationPrintScope>("all");
  const [exportColumnDialog, setExportColumnDialog] = useState<{ scope: QuotationPrintScope; selected: BaseExportColumnKey[]; action: "print" | "export"; includeBudgetCompilation: boolean } | null>(null);
  const [printBaseColumns, setPrintBaseColumns] = useState<QuotationBaseColumnOptions | undefined>(undefined);
  const [includeBudgetCompilation, setIncludeBudgetCompilation] = useState(true);
  const [mobileDocumentScale, setMobileDocumentScale] = useState(1);
  const printScopes: { value: QuotationPrintScope; label: string }[] = [
    { value: "all", label: "全部明细（带封面）" },
    { value: "all_without_cover", label: "全部明细（不带封面）" },
    { value: "base", label: "基装明细" },
    { value: "main_material", label: "主材明细" },
    { value: "custom_cabinet", label: "定制柜明细" },
    { value: "fees", label: "综合费用和总费用" },
  ];
  const selectScope = (scope: QuotationPrintScope) => {
    setOutputMode("list");
    setPrintScope(scope);
  };
  const hasBudgetCompilation = hasReadableRichText(data?.settings?.budgetCompilationHtml || data?.settings?.budgetCompilation);
  const supportsBudgetCompilation = (scope: QuotationPrintScope) => scope === "all" || scope === "all_without_cover" || scope === "fees";
  const printWithScope = (scope: QuotationPrintScope, nextIncludeBudgetCompilation = includeBudgetCompilation) => {
    setOutputMode("list");
    setPrintScope(scope);
    setIncludeBudgetCompilation(nextIncludeBudgetCompilation);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };
  const exportWithScope = (scope: QuotationPrintScope, columns?: BaseExportColumnKey[], nextIncludeBudgetCompilation = includeBudgetCompilation) => {
    if (!data?.id) {
      window.alert("当前报价缺少编号，暂时无法导出表格");
      return;
    }
    const url = new URL(`/api/quotations/${encodeURIComponent(data.id)}/export`, window.location.origin);
    url.searchParams.set("scope", scope);
    url.searchParams.set("share", shareToken);
    if (columns) url.searchParams.set("baseColumns", columns.join(","));
    if (hasBudgetCompilation && supportsBudgetCompilation(scope) && !nextIncludeBudgetCompilation) {
      url.searchParams.set("includeBudgetCompilation", "0");
    }
    window.location.href = url.toString();
  };
  const openExportColumnDialog = (scope: QuotationPrintScope) => {
    if (configurableExportScopes.includes(scope) || supportsBudgetCompilation(scope)) {
      setExportColumnDialog({ scope, selected: baseExportColumnOptions.map((option) => option.key), action: "export", includeBudgetCompilation: true });
      return;
    }
    exportWithScope(scope);
  };
  const openPrintColumnDialog = (scope: QuotationPrintScope) => {
    if (configurableExportScopes.includes(scope) || supportsBudgetCompilation(scope)) {
      setOutputMode("list");
      setPrintScope(scope);
      setExportColumnDialog({ scope, selected: baseExportColumnOptions.map((option) => option.key), action: "print", includeBudgetCompilation: true });
      return;
    }
    setPrintBaseColumns(undefined);
    printWithScope(scope);
  };
  const toggleExportColumn = (key: BaseExportColumnKey) => {
    setExportColumnDialog((current) => {
      if (!current) return current;
      const selected = current.selected.includes(key)
        ? current.selected.filter((item) => item !== key)
        : [...current.selected, key];
      return { ...current, selected };
    });
  };
  const confirmExportColumns = () => {
    if (!exportColumnDialog) return;
    if (exportColumnDialog.action === "print") {
      const nextColumns = Object.fromEntries(baseExportColumnOptions.map((option) => [option.key, exportColumnDialog.selected.includes(option.key)])) as QuotationBaseColumnOptions;
      setPrintBaseColumns(nextColumns);
      setOutputMode("list");
      setPrintScope(exportColumnDialog.scope);
      setIncludeBudgetCompilation(exportColumnDialog.includeBudgetCompilation);
      setExportColumnDialog(null);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.print());
      });
      return;
    }
    exportWithScope(exportColumnDialog.scope, exportColumnDialog.selected, exportColumnDialog.includeBudgetCompilation);
    setExportColumnDialog(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    setCanUsePrintTools(url.searchParams.get("print") === "1");
    url.searchParams.delete("print");
    setShareUrl(url.toString());
    fetch("/api/quotation-shares/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: shareToken }),
    })
      .then((res) => res.json().then((next) => ({ ok: res.ok, next })))
      .then(({ ok, next }) => {
        if (!ok || !next?.url) return;
        setShareUrl(new URL(String(next.url), window.location.origin).toString());
      })
      .catch(() => undefined);
  }, [shareToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateScale = () => {
      const viewportWidth = window.innerWidth || 1040;
      setMobileDocumentScale(viewportWidth <= 760 ? Math.min(1, Math.max(0.32, (viewportWidth - 16) / 1040)) : 1);
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/quotation-shares/${encodeURIComponent(shareToken)}`);
        const next = await res.json();
        if (!res.ok) throw new Error(next.message || "报价单不存在");
        setData(next);
      } catch (err: any) {
        setError(err.message || "报价单加载失败");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shareToken]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-100 text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在加载报价单...
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-100 px-6">
        <div className="rounded-lg border border-red-100 bg-white p-6 text-center shadow-[0_18px_50px_rgba(31,41,53,0.08)]">
          <p className="text-base font-semibold text-red-600">{error || "报价单不存在"}</p>
          <p className="mt-2 text-sm text-surface-500">请确认二维码链接是否完整，或联系报价人员重新发送。</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="quotation-share-page min-h-screen bg-[#f3f6fa] px-4 py-6"
      style={{ "--quotation-share-mobile-scale": mobileDocumentScale } as CSSProperties}
    >
      {canUsePrintTools && (
        <div className="quotation-output-mode-switch no-print" aria-label="报价显示方式">
          {([
            ["list", "清单式"],
            ["composition", "工种材料分类式"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setOutputMode(mode);
                if (mode === "composition") setPrintScope("all");
              }}
              aria-pressed={outputMode === mode}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {exportColumnDialog && (
        <div className="quotation-export-column-overlay no-print" onClick={() => setExportColumnDialog(null)}>
          <div className="quotation-export-column-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择导出列">
            <div className="quotation-export-column-head">
              <div>
                <div className="quotation-export-column-title">
                  <i><Columns3 className="h-4 w-4" /></i>
                  <strong>{exportColumnDialog.action === "print" ? "打印列设置" : "导出列设置"}</strong>
                </div>
                <span>
                  {configurableExportScopes.includes(exportColumnDialog.scope)
                    ? `选择基装明细中需要显示的列，确认后开始${exportColumnDialog.action === "print" ? "打印" : "导出"}。`
                    : `确认是否带上预算编制，确认后开始${exportColumnDialog.action === "print" ? "打印" : "导出"}。`}
                </span>
              </div>
              <button type="button" onClick={() => setExportColumnDialog(null)} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
            {configurableExportScopes.includes(exportColumnDialog.scope) && (
              <div className="quotation-export-column-grid">
                {baseExportColumnOptions.map((option) => {
                  const checked = exportColumnDialog.selected.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => toggleExportColumn(option.key)}
                      data-checked={checked || undefined}
                    >
                      <i><Check className="h-3.5 w-3.5" /></i>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {supportsBudgetCompilation(exportColumnDialog.scope) && (
              <button
                type="button"
                className="quotation-export-budget-option"
                data-checked={hasBudgetCompilation && exportColumnDialog.includeBudgetCompilation || undefined}
                disabled={!hasBudgetCompilation}
                onClick={() => setExportColumnDialog((current) => current ? { ...current, includeBudgetCompilation: !current.includeBudgetCompilation } : current)}
              >
                <i><Check className="h-3.5 w-3.5" /></i>
                <span>{exportColumnDialog.action === "print" ? "打印预算编制" : "导出预算编制"}</span>
                {!hasBudgetCompilation && <em>当前报价暂无预算编制内容</em>}
              </button>
            )}
            <div className="quotation-export-column-actions">
              <button type="button" onClick={() => setExportColumnDialog(null)}>取消</button>
                <button type="button" onClick={confirmExportColumns}>{exportColumnDialog.action === "print" ? "确认打印" : "确认导出"}</button>
            </div>
          </div>
        </div>
      )}

      {canUsePrintTools && outputMode === "list" && (
        <aside className="quotation-print-scope-panel no-print" aria-label="打印范围">
          <p>打印 / 导出范围</p>
          <div className="quotation-print-scope-list">
            {printScopes.map((scope) => (
              <div
                key={scope.value}
                className="quotation-print-scope-row"
                data-active={printScope === scope.value || undefined}
                role="button"
                tabIndex={0}
                onClick={() => selectScope(scope.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectScope(scope.value);
                  }
                }}
                aria-pressed={printScope === scope.value}
                title={`查看${scope.label}`}
              >
                <span>{scope.label}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openPrintColumnDialog(scope.value);
                  }}
                  aria-label={`打印${scope.label}`}
                  title={`打印${scope.label}`}
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openExportColumnDialog(scope.value);
                  }}
                  aria-label={`导出${scope.label}`}
                  title={`导出${scope.label}`}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className="quotation-share-document-viewer">
        <QuotationPrintDocument
          quotation={data}
          items={data.items || []}
          settings={data.settings}
          shareUrl={shareUrl}
          outputMode={canUsePrintTools ? outputMode : "list"}
          printScope={canUsePrintTools ? printScope : "all"}
          baseColumns={printBaseColumns}
          includeBudgetCompilation={includeBudgetCompilation}
        />
      </div>

      <style jsx global>{`
        .quotation-output-mode-switch {
          position: fixed;
          top: 18px;
          left: 50%;
          z-index: 35;
          display: inline-flex;
          transform: translateX(-50%);
          align-items: center;
          gap: 4px;
          border: 1px solid #dce4ef;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.94);
          padding: 4px;
          box-shadow: 0 14px 34px rgba(16, 24, 40, 0.12);
          backdrop-filter: blur(14px);
        }
        .quotation-output-mode-switch button {
          display: inline-flex;
          min-height: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          padding: 0 14px;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          color: #667085;
          white-space: nowrap;
          transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .quotation-output-mode-switch button:hover {
          color: #182230;
          background: #f7f9fc;
        }
        .quotation-output-mode-switch button[aria-pressed="true"] {
          background: #2f6feb;
          color: #ffffff;
          box-shadow: 0 8px 18px rgba(47, 111, 235, 0.22);
        }
        .quotation-export-column-overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.36);
          padding: 24px;
          backdrop-filter: blur(5px);
        }
        .quotation-export-column-dialog {
          width: min(500px, 100%);
          overflow: hidden;
          border: 1px solid rgba(204, 214, 226, 0.95);
          border-radius: 18px;
          background: #fbfcfd;
          box-shadow: 0 30px 80px rgba(18, 28, 45, 0.25), 0 1px 0 rgba(255, 255, 255, 0.9) inset;
        }
        .quotation-export-column-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid #e8edf3;
          background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
          padding: 18px 20px 15px;
        }
        .quotation-export-column-title {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .quotation-export-column-title i {
          display: inline-flex;
          height: 28px;
          width: 28px;
          align-items: center;
          justify-content: center;
          border: 1px solid #cfe2d8;
          border-radius: 9px;
          background: #f3faf6;
          color: #13875c;
          font-style: normal;
        }
        .quotation-export-column-head strong {
          display: block;
          font-size: 14px;
          font-weight: 700;
          line-height: 20px;
          color: #182230;
        }
        .quotation-export-column-head span {
          display: block;
          margin-top: 7px;
          font-size: 12px;
          font-weight: 500;
          line-height: 18px;
          color: #6b7789;
        }
        .quotation-export-column-head button {
          display: inline-flex;
          height: 30px;
          width: 30px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 8px;
          color: #7a8698;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }
        .quotation-export-column-head button:hover {
          border-color: #dce4ef;
          background: #f6f8fb;
          color: #182230;
        }
        .quotation-export-column-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          background: linear-gradient(180deg, #f5f7fa 0%, #f8fafc 100%);
          padding: 16px 20px 10px;
        }
        .quotation-export-column-grid button {
          display: flex;
          min-height: 40px;
          align-items: center;
          justify-content: flex-start;
          gap: 9px;
          border: 1px solid #dde5ef;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.92);
          padding: 0 11px;
          font-size: 12px;
          font-weight: 600;
          color: #26384c;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.03);
          transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
        }
        .quotation-export-column-grid button:hover {
          border-color: #b8c7d8;
          background: #ffffff;
          box-shadow: 0 6px 16px rgba(25, 43, 68, 0.07);
          transform: translateY(-1px);
        }
        .quotation-export-column-grid button[data-checked="true"] {
          border-color: #73c69a;
          background: linear-gradient(180deg, #fbfffd 0%, #f2fbf6 100%);
          box-shadow: 0 7px 18px rgba(20, 184, 114, 0.12), 0 0 0 1px rgba(20, 184, 114, 0.07) inset;
          color: #173426;
        }
        .quotation-export-column-grid i {
          display: inline-flex;
          height: 18px;
          width: 18px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border: 1px solid #c8d4e2;
          border-radius: 50%;
          color: transparent;
          font-style: normal;
          transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
        }
        .quotation-export-column-grid button[data-checked="true"] i {
          border-color: #14b872;
          background: #14b872;
          color: #ffffff;
        }
        .quotation-export-budget-option {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          width: calc(100% - 40px);
          margin: 16px 20px 18px;
          border: 1px solid #dde5ef;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.92);
          padding: 11px 12px;
          text-align: left;
          color: #26384c;
          box-shadow: 0 1px 1px rgba(16, 24, 40, 0.03);
          transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease;
        }
        .quotation-export-column-grid + .quotation-export-budget-option {
          margin-top: 0;
        }
        .quotation-export-budget-option:hover {
          border-color: #b8c7d8;
          background: #ffffff;
          box-shadow: 0 6px 16px rgba(25, 43, 68, 0.07);
        }
        .quotation-export-budget-option i {
          display: inline-flex;
          height: 18px;
          width: 18px;
          align-items: center;
          justify-content: center;
          border: 1px solid #c8d4e2;
          border-radius: 50%;
          color: transparent;
          font-style: normal;
        }
        .quotation-export-budget-option[data-checked="true"] {
          border-color: #73c69a;
          background: linear-gradient(180deg, #fbfffd 0%, #f2fbf6 100%);
          box-shadow: 0 7px 18px rgba(20, 184, 114, 0.12), 0 0 0 1px rgba(20, 184, 114, 0.07) inset;
        }
        .quotation-export-budget-option[data-checked="true"] i {
          border-color: #14b872;
          background: #14b872;
          color: #ffffff;
        }
        .quotation-export-budget-option span {
          font-size: 12px;
          font-weight: 600;
        }
        .quotation-export-budget-option em {
          font-size: 11px;
          font-style: normal;
          color: #7a8698;
        }
        .quotation-export-budget-option:disabled {
          cursor: not-allowed;
          border-color: #d5dfeb;
          background: rgba(255, 255, 255, 0.9);
          color: #334155;
          opacity: 1;
          box-shadow: 0 7px 18px rgba(100, 116, 139, 0.12), 0 0 0 1px rgba(100, 116, 139, 0.06);
        }
        .quotation-export-budget-option:disabled:hover {
          border-color: #d5dfeb;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 7px 18px rgba(100, 116, 139, 0.12), 0 0 0 1px rgba(100, 116, 139, 0.06);
        }
        .quotation-export-column-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          border-top: 1px solid #e8edf3;
          background: #ffffff;
          padding: 14px 20px 16px;
        }
        .quotation-export-column-actions button {
          display: inline-flex;
          height: 36px;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          padding: 0 17px;
          font-size: 12px;
          font-weight: 700;
          transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
        }
        .quotation-export-column-actions button:first-child {
          border: 1px solid #d9e2ef;
          background: #ffffff;
          color: #52647b;
        }
        .quotation-export-column-actions button:first-child:hover {
          border-color: #c9d5e4;
          background: #f7f9fd;
        }
        .quotation-export-column-actions button:last-child {
          border: 1px solid #159466;
          background: #159466;
          color: #ffffff;
          box-shadow: 0 8px 18px rgba(21, 148, 102, 0.18);
        }
        .quotation-export-column-actions button:last-child:hover {
          border-color: #0f8158;
          background: #0f8158;
          box-shadow: 0 10px 22px rgba(21, 148, 102, 0.22);
        }
        .quotation-print-scope-panel {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          z-index: 30;
          width: 258px;
          border: 1px solid rgba(203, 213, 225, 0.9);
          border-right: 0;
          border-radius: 16px 0 0 16px;
          background: rgba(248, 250, 252, 0.94);
          padding: 10px;
          box-shadow: -18px 22px 46px rgba(15, 23, 42, 0.12), 0 1px 0 rgba(255, 255, 255, 0.92) inset;
          backdrop-filter: blur(16px);
        }
        .quotation-print-scope-panel p {
          display: flex;
          margin: 0 0 9px;
          padding: 3px 3px 10px;
          align-items: center;
          gap: 7px;
          border-bottom: 1px solid #e8eef5;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
          color: #475569;
          letter-spacing: 0;
        }
        .quotation-print-scope-panel p::before {
          content: "";
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #159466;
          box-shadow: 0 0 0 4px rgba(21, 148, 102, 0.1);
        }
        .quotation-print-scope-list {
          display: grid;
          gap: 5px;
        }
        .quotation-print-scope-row {
          display: grid;
          min-height: 38px;
          grid-template-columns: minmax(0, 1fr) 30px 30px;
          align-items: center;
          gap: 6px;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          padding: 4px 5px 4px 10px;
          color: #64748b;
          cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .quotation-print-scope-row:hover {
          border-color: #92d2b2;
          background: linear-gradient(180deg, #ffffff 0%, #eef9f3 100%);
          color: #172033;
          box-shadow: 0 7px 18px rgba(15, 132, 85, 0.12), 0 0 0 1px rgba(15, 132, 85, 0.1) inset;
        }
        .quotation-print-scope-row:focus-visible {
          outline: 3px solid rgba(21, 148, 102, 0.15);
          outline-offset: 2px;
        }
        .quotation-print-scope-row span {
          min-width: 0;
          font-size: 12px;
          font-weight: 650;
          line-height: 1.2;
          color: currentColor;
          white-space: nowrap;
        }
        .quotation-print-scope-panel button {
          display: inline-flex;
          height: 30px;
          width: 30px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(203, 213, 225, 0.82);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.62);
          padding: 0;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          color: #5f7084;
          cursor: pointer;
          box-shadow: 0 1px 1px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.86);
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
        }
        .quotation-print-scope-panel button svg {
          stroke-width: 1.9;
        }
        .quotation-print-scope-panel button:hover {
          transform: translateY(-1px);
        }
        .quotation-print-scope-panel button:first-of-type:hover {
          border-color: #b8c8dc;
          background: #f8fbff;
          color: #315f89;
          box-shadow: 0 7px 16px rgba(49, 95, 137, 0.12);
        }
        .quotation-print-scope-panel button:last-of-type:hover {
          border-color: #a9d8c1;
          background: #f5fbf8;
          color: #159466;
          box-shadow: 0 7px 16px rgba(21, 148, 102, 0.13);
        }
        .quotation-print-scope-panel button:active {
          transform: translateY(0);
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
        }
        .quotation-print-scope-row[data-active="true"] button {
          border-color: rgba(203, 213, 225, 0.82);
          background: rgba(255, 255, 255, 0.62);
          color: #486174;
          box-shadow: 0 1px 1px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }
        .quotation-print-scope-row[data-active="true"] button:first-of-type:hover {
          color: #315f89;
        }
        .quotation-print-scope-row[data-active="true"] button:last-of-type:hover {
          color: #159466;
        }
        @media screen and (max-width: 1280px) {
          .quotation-output-mode-switch {
            top: auto;
            bottom: 18px;
          }
          .quotation-print-scope-panel {
            position: sticky;
            top: 12px;
            right: auto;
            transform: none;
            display: flex;
            width: min(1040px, calc(100vw - 32px));
            margin: 0 auto 12px;
            align-items: center;
            gap: 8px;
            border-right: 1px solid #dce4ef;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(16, 24, 40, 0.04);
          }
          .quotation-print-scope-panel p {
            margin: 0;
            padding: 0;
            border-bottom: 0;
            white-space: nowrap;
          }
          .quotation-print-scope-list {
            display: grid;
            flex: 1;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
        }
        @media screen and (max-width: 760px) {
          html,
          body {
            overflow-x: auto;
            background: #eef3f8;
          }
          .quotation-share-page {
            width: 100%;
            min-width: 100%;
            overflow-x: auto;
            padding: 8px !important;
            background: #eef3f8 !important;
            -webkit-overflow-scrolling: touch;
          }
          .quotation-share-document-viewer {
            width: fit-content;
            min-width: 100%;
            margin: 0 auto;
          }
          .quotation-share-page .quotation-print-document {
            width: 1040px !important;
            min-width: 1040px !important;
            max-width: none !important;
            margin: 0 auto !important;
            padding: 26px !important;
            border-radius: 14px !important;
            border-color: #e4e7ec !important;
            box-shadow: 0 18px 50px rgba(31, 41, 53, 0.08) !important;
            zoom: var(--quotation-share-mobile-scale);
          }
          .quotation-share-page .quotation-print-cover-page {
            min-height: 860px !important;
            margin: 0 !important;
            padding: 78px 88px 56px !important;
            border: 0 !important;
            border-radius: 0 !important;
            page-break-after: always;
            break-after: page;
          }
          .quotation-share-page .quotation-print-cover-main h1 {
            display: inline-flex !important;
            font-size: 36px !important;
            line-height: 1.25 !important;
          }
          .quotation-share-page .quotation-print-cover-main h1 em {
            white-space: nowrap !important;
          }
          .quotation-share-page .quotation-print-cover-main h2 {
            margin-top: 62px !important;
            font-size: 30px !important;
            line-height: 1.25 !important;
          }
          .quotation-share-page .quotation-print-cover-main p {
            margin-top: 54px !important;
            font-size: 18px !important;
            line-height: 1.4 !important;
          }
          .quotation-share-page .quotation-print-cover-fields {
            width: 430px !important;
            max-width: none !important;
            gap: 18px !important;
            margin: 110px auto 0 !important;
          }
          .quotation-share-page .quotation-print-cover-field {
            grid-template-columns: 126px minmax(0, 1fr) !important;
            align-items: start !important;
            gap: 14px !important;
          }
          .quotation-share-page .quotation-print-cover-field span,
          .quotation-share-page .quotation-print-cover-field strong {
            font-size: 16px !important;
            line-height: 22px !important;
          }
          .quotation-share-page .quotation-print-cover-field strong {
            min-height: 25px !important;
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          .quotation-share-page .quotation-print-cover-brand {
            position: absolute !important;
            right: 88px !important;
            bottom: 56px !important;
            left: 88px !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;
            gap: 36px !important;
            margin-top: 0 !important;
          }
          .quotation-share-page .quotation-print-cover-brand span {
            display: block !important;
          }
          .quotation-share-page .quotation-print-cover-brand-mark {
            max-width: 300px !important;
            gap: 12px !important;
          }
          .quotation-share-page .quotation-print-cover-brand-mark img {
            max-width: 172px !important;
            max-height: 42px !important;
          }
          .quotation-share-page .quotation-print-cover-brand-mark strong {
            max-width: 110px !important;
            font-size: 18px !important;
          }
          .quotation-share-page .quotation-print-head-block {
            border-radius: 12px !important;
          }
          .quotation-share-page .quotation-print-head-layout {
            grid-template-columns: 220px minmax(0, 1fr) 104px !important;
            gap: 18px !important;
            padding: 18px !important;
          }
          .quotation-share-page .quotation-print-cover {
            min-height: 0 !important;
            padding-left: 16px !important;
          }
          .quotation-share-page .quotation-print-cover h1 {
            font-size: 23px !important;
            line-height: 1.18 !important;
          }
          .quotation-share-page .quotation-print-head-total {
            margin-top: 14px !important;
          }
          .quotation-share-page .quotation-print-head-table {
            grid-template-columns: 34% repeat(3, minmax(0, 1fr)) 10% !important;
            grid-template-rows: repeat(2, 44px) !important;
          }
          .quotation-share-page .quotation-print-head-title-cell {
            grid-column: 1 !important;
            grid-row: 1 / span 2 !important;
            padding: 8px 14px !important;
          }
          .quotation-share-page .quotation-print-head-title-cell h1 {
            font-size: 15px !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          .quotation-share-page .quotation-print-head-field {
            min-height: 42px !important;
            padding: 7px 12px !important;
            border-right: 0 !important;
            border-bottom: 0 !important;
            border-left: var(--quotation-print-head-inner-line-width) solid #111111 !important;
          }
          .quotation-share-page .quotation-print-head-field-phone {
            grid-column: 2 !important;
            grid-row: 1 !important;
            border-top: 0 !important;
          }
          .quotation-share-page .quotation-print-head-field-area {
            grid-column: 3 !important;
            grid-row: 1 !important;
            border-top: 0 !important;
          }
          .quotation-share-page .quotation-print-head-field-date {
            grid-column: 4 !important;
            grid-row: 1 !important;
            border-top: 0 !important;
          }
          .quotation-share-page .quotation-print-head-field-designer {
            grid-column: 2 !important;
            grid-row: 2 !important;
            border-top: var(--quotation-print-head-inner-line-width) solid #111111 !important;
          }
          .quotation-share-page .quotation-print-head-field-creator {
            grid-column: 3 !important;
            grid-row: 2 !important;
            border-top: var(--quotation-print-head-inner-line-width) solid #111111 !important;
          }
          .quotation-share-page .quotation-print-head-field-company-phone {
            grid-column: 4 !important;
            grid-row: 2 !important;
            border-top: var(--quotation-print-head-inner-line-width) solid #111111 !important;
          }
          .quotation-share-page .quotation-print-qr {
            display: flex !important;
            grid-column: 5 !important;
            grid-row: 1 / span 2 !important;
            width: auto !important;
            justify-self: auto !important;
            border-left: var(--quotation-print-head-inner-line-width) solid #111111 !important;
            border-top: 0 !important;
          }
          .quotation-share-page .quotation-print-section {
            margin-top: 20px !important;
            overflow: visible !important;
          }
          .quotation-share-page .quotation-print-section-heading {
            position: static !important;
            width: auto !important;
          }
          .quotation-share-page .quotation-print-table,
          .quotation-share-page .quotation-print-fee-table,
          .quotation-share-page .quotation-print-material-table,
          .quotation-share-page .quotation-print-cabinet-table,
          .quotation-share-page .quotation-print-composition-table {
            min-width: 0 !important;
          }
          .quotation-share-page .quotation-print-appendix-note,
          .quotation-share-page .quotation-print-budget-compilation-content,
          .quotation-share-page .quotation-print-signature-grid,
          .quotation-share-page .quotation-print-composition,
          .quotation-share-page .quotation-print-composition-detail-grid {
            min-width: 0;
          }
          .quotation-share-page .quotation-print-budget-compilation-head span,
          .quotation-share-page .quotation-print-budget-compilation-content {
            border-color: #111111 !important;
          }
          .quotation-share-page .quotation-print-composition,
          .quotation-share-page .quotation-print-composition-detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .quotation-share-page .quotation-print-signature-grid {
            grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) !important;
            gap: 18px !important;
          }
        }
        @media print {
          html,
          body,
          .quotation-share-page {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .quotation-share-page {
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
