"use client";

import { createPortal } from "react-dom";
import { Clock3, FileDiff, Loader2, X } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";
import {
  formatQuotationChangeDateTime,
  formatQuotationChangeValue,
  getQuotationChangeActionText,
  getQuotationChangeCategoryLabel,
  getQuotationChangeDisplayItems,
  getQuotationChangeDisplaySummary,
  type QuotationChangeLog,
} from "@/lib/quotationChangeLogDisplay";

type QuotationChangeLogModalProps = {
  open: boolean;
  title: string;
  logs: QuotationChangeLog[];
  loading: boolean;
  error: string;
  onClose: () => void;
};

export default function QuotationChangeLogModal({
  open,
  title,
  logs,
  loading,
  error,
  onClose,
}: QuotationChangeLogModalProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0f172a]/25 p-4 backdrop-blur-[2px] md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="报价变更记录"
        className="flex h-[min(780px,calc(100dvh-48px))] w-full max-w-[920px] flex-col overflow-hidden rounded-[16px] border border-[#d8e1ec] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#e4eaf2] bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#d8e6ff] bg-[#f3f7ff] text-[#3f72e8]">
              <FileDiff className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold leading-6 text-[#172033]">报价变更记录</h2>
              <p className="mt-0.5 truncate text-[12px] font-medium leading-5 text-[#667085]">{title || "当前报价"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[#738096] transition hover:bg-[#f2f5f9] hover:text-[#172033]"
            aria-label="关闭报价变更记录"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f9fc] px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[14px] border border-[#e2e8f0] bg-white text-[14px] font-medium text-[#52647b]">
              <Loader2 className="mb-3 h-5 w-5 animate-spin text-[#3f72e8]" />
              正在读取变更记录...
            </div>
          ) : error ? (
            <div className="rounded-[12px] border border-red-100 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</div>
          ) : logs.length > 0 ? (
            <div className="space-y-2.5">
              {logs.map((log) => {
                const displayChanges = getQuotationChangeDisplayItems(log.changes);
                const displaySummary = getQuotationChangeDisplaySummary(log, displayChanges);
                return (
                  <section key={log.id} className="overflow-hidden rounded-[14px] border border-[#dfe6ef] bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-[#edf1f6] bg-white px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#182230] text-[11px] font-semibold text-white ring-2 ring-[#eef2f7]">
                          {log.user_avatar ? (
                            <NativeImage src={log.user_avatar} alt={`${log.user_name || "操作人"}头像`} className="h-full w-full object-cover" loading="eager" />
                          ) : (
                            (log.user_name || "用").slice(0, 1)
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold leading-5 text-[#172033]">{log.user_name || "未知用户"}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium leading-4 text-[#7b8797]">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatQuotationChangeDateTime(log.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full bg-[#f2f5f9] px-2 py-1 text-[11px] font-semibold text-[#52647b]">{displaySummary}</span>
                        <span className="rounded-full border border-[#e1e8f1] bg-white px-2 py-1 text-[11px] font-semibold tabular-nums text-[#667085]">{displayChanges.length} 条</span>
                      </div>
                    </div>

                    <div className="divide-y divide-[#edf1f6]">
                      {displayChanges.map((displayChange) => {
                        if (displayChange.kind === "replacement") {
                          return (
                            <article key={displayChange.id} className="grid gap-2.5 px-4 py-3.5 md:grid-cols-[minmax(0,0.8fr)_minmax(340px,1.2fr)] md:items-center">
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold leading-5 text-[#172033]">替换定额</p>
                                <p className="mt-1 break-words text-[12px] leading-5 text-[#52647b]">
                                  由「{displayChange.oldName}」替换为「{displayChange.newName}」
                                </p>
                                <ChangeMeta space={displayChange.space} category={displayChange.category} />
                              </div>
                              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] gap-2">
                                <ValueCard label="原项目" value={displayChange.oldName} />
                                <span className="flex items-center justify-center text-[14px] text-[#b0bac8]">→</span>
                                <ValueCard label="新项目" value={displayChange.newName} highlight />
                              </div>
                            </article>
                          );
                        }

                        const change = displayChange.change;
                        return (
                          <article key={displayChange.id} className="grid gap-2.5 px-4 py-3.5 md:grid-cols-[minmax(0,0.8fr)_minmax(340px,1.2fr)] md:items-center">
                            <div className="min-w-0">
                              <p className="break-words text-[13px] font-semibold leading-5 text-[#172033]">{getQuotationChangeActionText(change)}</p>
                              <ChangeMeta space={change.space} category={change.category} />
                            </div>
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] gap-2">
                              <ValueCard
                                label="原值"
                                value={change.change_type === "created" ? "-" : formatQuotationChangeValue(change.old_value)}
                              />
                              <span className="flex items-center justify-center text-[13px] text-[#b0bac8]">→</span>
                              <ValueCard
                                label="新值"
                                value={change.change_type === "deleted" ? "-" : formatQuotationChangeValue(change.new_value)}
                                highlight={change.change_type !== "deleted"}
                              />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cfd7e3] bg-white px-6 text-center">
              <FileDiff className="mb-3 h-9 w-9 text-[#98a2b3]" />
              <h3 className="text-[15px] font-semibold text-[#172033]">暂无变更记录</h3>
              <p className="mt-2 max-w-sm text-[13px] leading-5 text-[#667085]">报价明细里的数量、单价、名称、工艺说明等内容变化会记录在这里。</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChangeMeta({ space, category }: { space?: string | null; category?: string | null }) {
  const categoryLabel = getQuotationChangeCategoryLabel(category);
  if (!space && !categoryLabel) return null;
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-medium leading-4 text-[#7b8797]">
      {space ? <span className="rounded-md bg-[#f6f8fb] px-2 py-0.5">{space}</span> : null}
      {categoryLabel ? <span className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[#3f72e8]">{categoryLabel}</span> : null}
    </div>
  );
}

function ValueCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[9px] border px-2.5 py-2 ${highlight ? "border-[#cfdfff] bg-[#f7faff]" : "border-[#e5eaf1] bg-[#fbfcfe]"}`}>
      <p className={`text-[11px] font-semibold leading-4 ${highlight ? "text-[#3f72e8]" : "text-[#8a96a8]"}`}>{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] font-medium leading-5 text-[#26364a]">{value}</p>
    </div>
  );
}
