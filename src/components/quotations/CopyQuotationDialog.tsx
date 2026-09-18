"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Loader2,
  ReceiptText,
  Search,
  X,
} from "lucide-react";
import { getCustomerContactText, getCustomerHouseText } from "@/app/quotations/quotation-list-shared";

type CopyQuotationContentMode = "full" | "items_only";

type CopyQuotationDialogProps = {
  source: any | null;
  currentCustomerName?: string;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (payload: {
    contentMode: CopyQuotationContentMode;
    targetCustomerId?: string;
  }) => Promise<void> | void;
};

export function CopyQuotationDialog({
  source,
  currentCustomerName,
  loading = false,
  error = "",
  onClose,
  onConfirm,
}: CopyQuotationDialogProps) {
  const [targetMode, setTargetMode] = useState<"current" | "other">("current");
  const [contentMode, setContentMode] = useState<CopyQuotationContentMode | "">("");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const sourceId = source?.id;
  const sourceCustomerId = source?.customer_id ?? "";

  useEffect(() => {
    if (!sourceId) return;
    setTargetMode("current");
    setContentMode("");
    setSearch("");
    setCustomers([]);
    setHasMore(false);
    setSelectedCustomer(null);
    setAttemptedConfirm(false);
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId || targetMode !== "other") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCustomersLoading(true);
      const params = new URLSearchParams({ mode: "picker", usage: "quotation-copy-target", limit: "1000" });
      const keyword = search.trim();
      if (keyword) params.set("search", keyword);
      const token = localStorage.getItem("zxgj_token");

      fetch(`/api/customers?${params.toString()}`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
        .then((response) => {
          if (!response.ok) throw new Error("客户搜索失败");
          return response.json();
        })
        .then((payload) => {
          setCustomers(
            (Array.isArray(payload?.customers) ? payload.customers : []).filter((customer: any) => {
              if (String(customer.id) === String(sourceCustomerId)) return false;
              return String(customer?.status || "").toUpperCase() !== "LOST";
            }),
          );
          setHasMore(Boolean(payload?.hasMore));
        })
        .catch((requestError) => {
          if (requestError?.name !== "AbortError") {
            setCustomers([]);
            setHasMore(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCustomersLoading(false);
        });
    }, search.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [targetMode, search, sourceCustomerId, sourceId]);

  if (!source) return null;

  const sourceCustomerName = source.customer_name || currentCustomerName || "当前客户";
  const sourceStore = source.store_name || source.store || "-";
  const missingTarget = targetMode === "other" && !selectedCustomer;
  const missingContent = !contentMode;
  const canConfirm = !missingTarget && !missingContent;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/28 p-3 backdrop-blur-[2px] sm:p-5">
      <div className="copy-quotation-redesign relative flex h-[min(680px,calc(100dvh-24px))] w-full max-w-[920px] flex-col overflow-hidden rounded-[16px] border border-[#dfe6ef] bg-white">
        <div className="flex shrink-0 items-center justify-between gap-4 px-7 py-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-[#edf4ff] text-[#356df3]">
              <Copy className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="truncate text-[17px] font-semibold text-[#172033]">复制报价</h2>
                <span className="shrink-0 rounded-full bg-[#edf9f2] px-2.5 py-1 text-[10px] font-semibold text-[#067647]">生成新草稿</span>
              </div>
              <p className="mt-1.5 truncate text-[12px] text-[#667085]">
                {source.title || "装修报价单"}
                <span className="mx-1.5 text-[#c1c8d3]">·</span>
                {sourceCustomerName}
                <span className="mx-1.5 text-[#c1c8d3]">·</span>
                {sourceStore}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[#667085] transition hover:bg-[#f2f4f7] hover:text-[#182230] disabled:opacity-50"
            aria-label="关闭复制报价弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-8 px-7 pb-6 sm:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#172033] text-[10px] font-semibold text-white">1</span>
              <h3 className="text-[14px] font-semibold text-[#182230]">复制到</h3>
            </div>
            {attemptedConfirm && missingTarget ? <p className="mb-2 text-[10px] font-semibold text-red-600">请选择接收客户</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setTargetMode("current");
                  setSelectedCustomer(null);
                }}
                className={`relative min-h-[76px] rounded-[12px] border py-3.5 pl-4 pr-12 text-left transition ${targetMode === "current" ? "border-[#87afff] bg-[#f3f7ff]" : "border-[#dfe6ef] bg-white hover:border-[#c5d3e7]"}`}
              >
                <span className="block text-[13px] font-semibold text-[#182230]">当前客户</span>
                <span className="mt-2 block truncate text-[11px] text-[#667085]">{sourceCustomerName}</span>
                <span className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border ${targetMode === "current" ? "border-[#407aff] bg-[#407aff]" : "border-[#cfd7e3] bg-white"}`} />
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("other")}
                className={`relative min-h-[76px] rounded-[12px] border py-3.5 pl-4 pr-12 text-left transition ${attemptedConfirm && missingTarget ? "border-[#fda29b] bg-[#fffbfa] ring-1 ring-[#fee4e2]" : targetMode === "other" ? "border-[#87afff] bg-[#f3f7ff]" : "border-[#dfe6ef] bg-white hover:border-[#c5d3e7]"}`}
              >
                <span className="block text-[13px] font-semibold text-[#182230]">其他客户</span>
                <span className="mt-2 block text-[11px] text-[#667085]">重新选择接收客户</span>
                <span className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border ${targetMode === "other" ? "border-[#407aff] bg-[#407aff]" : "border-[#cfd7e3] bg-white"}`} />
              </button>
            </div>

            <div className={`mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] px-4 py-4 ${attemptedConfirm && missingTarget ? "bg-[#fffbfa] ring-2 ring-[#fee4e2]" : "bg-[#f7f9fc]"}`}>
              {targetMode === "current" ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-[15px] font-semibold text-[#356df3]">
                      {sourceCustomerName.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-[#7a8798]">接收客户</p>
                      <p className="mt-1 truncate text-[13px] font-semibold text-[#182230]">{sourceCustomerName}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-[#067647]">当前客户</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-[10px] bg-white px-3.5 py-3">
                      <p className="text-[10px] text-[#7a8798]">报价名称</p>
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-[#182230]">{source.title || "装修报价单"}</p>
                    </div>
                    <div className="rounded-[10px] bg-white px-3.5 py-3">
                      <p className="text-[10px] text-[#7a8798]">归属门店</p>
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-[#182230]">{sourceStore}</p>
                    </div>
                    <div className="rounded-[10px] bg-white px-3.5 py-3">
                      <p className="text-[10px] text-[#7a8798]">客户姓名</p>
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-[#182230]">{sourceCustomerName}</p>
                    </div>
                    <div className="rounded-[10px] bg-white px-3.5 py-3">
                      <p className="text-[10px] text-[#7a8798]">联系方式</p>
                      <p className="mt-1.5 truncate text-[12px] font-semibold tabular-nums text-[#182230]">{source.customer_phone || source.phone || source.customer_weixin || "-"}</p>
                    </div>
                    <div className="rounded-[10px] bg-white px-3.5 py-3">
                      <p className="text-[10px] text-[#7a8798]">设计师</p>
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-[#182230]">{source.designer_name || "-"}</p>
                    </div>
                    <div className="rounded-[10px] bg-white px-3.5 py-3">
                      <p className="text-[10px] text-[#7a8798]">家装顾问</p>
                      <p className="mt-1.5 truncate text-[12px] font-semibold text-[#182230]">{source.advisor_name || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[10px] bg-white px-3.5 py-3">
                    <p className="text-[10px] text-[#7a8798]">复制说明</p>
                    <div className="mt-2 grid gap-2 text-[11px] text-[#667085]">
                      <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#407aff]" />保留当前客户归属</span>
                      <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#407aff]" />创建一份独立报价草稿</span>
                      <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#407aff]" />不影响原报价和发送记录</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="relative shrink-0">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#98a2b3]" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-12 w-full rounded-[12px] border border-[#d6deea] bg-[#fbfcfe] pl-11 pr-4 text-[13px] font-semibold text-[#182230] outline-none transition placeholder:text-[#9aa6b7] focus:border-[#7aa6ff] focus:bg-white focus:ring-4 focus:ring-[#407aff]/10"
                      placeholder="搜索客户姓名、手机号、小区、房号"
                    />
                  </div>
                  {hasMore ? <p className="mt-2 shrink-0 text-[10px] text-[#667085]">已显示前 1000 条，可输入关键词继续定位。</p> : null}
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto bg-white px-1 pb-2">
                    {customersLoading ? (
                      <div className="flex h-28 items-center justify-center text-[12px] font-medium text-[#52647b]"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407aff]" />正在搜索客户...</div>
                    ) : customers.length > 0 ? (
                      <div className="space-y-2">
                        {customers.map((customer) => {
                          const active = selectedCustomer?.id === customer.id;
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => setSelectedCustomer(customer)}
                              className={`grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border px-3.5 py-3 text-left transition ${active ? "border-[#9dbcfb] bg-[#f4f8ff]" : "border-[#e4eaf2] bg-white hover:border-[#cbd8e8] hover:bg-[#fbfcfe]"}`}
                            >
                              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold ${active ? "bg-[#407aff] text-white" : "bg-[#eef2f7] text-[#52647b]"}`}>
                                {(customer.name || "客").slice(0, 1)}
                              </span>
                              <div className="min-w-0">
                                <p className="break-words text-[13px] font-semibold leading-4 text-[#162033]" title={getCustomerHouseText(customer)}>{getCustomerHouseText(customer) || "-"}</p>
                                <p className="mt-1 truncate text-[11px] font-medium text-[#667085]">{customer.name || "未命名客户"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="truncate text-right text-[11px] font-semibold tabular-nums text-[#52647b]">{getCustomerContactText(customer) || "-"}</span>
                                {active ? <Check className="h-4 w-4 shrink-0 text-[#407aff]" /> : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mx-2 mt-2 flex min-h-[220px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[#cfd7e3] bg-[#fbfcfe] px-5 text-center">
                        <p className="text-[14px] font-semibold text-[#162033]">没有找到客户</p>
                        <p className="mt-1 text-[12px] font-medium text-[#667085]">请先在客户管理中创建客户。</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#172033] text-[10px] font-semibold text-white">2</span>
              <h3 className="text-[14px] font-semibold text-[#182230]">复制内容</h3>
            </div>
            {attemptedConfirm && missingContent ? <p className="mb-2 text-[10px] font-semibold text-red-600">请选择复制内容</p> : null}
            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => setContentMode("full")}
                className={`relative min-h-[96px] rounded-[12px] border py-4 pl-4 pr-12 text-left transition ${attemptedConfirm && missingContent ? "border-[#fda29b] bg-[#fffbfa] ring-1 ring-[#fee4e2]" : contentMode === "full" ? "border-[#87afff] bg-[#f3f7ff]" : "border-[#dfe6ef] bg-white hover:border-[#c5d3e7]"}`}
              >
                <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#182230]"><ReceiptText className="h-4 w-4 text-[#356df3]" />完整报价</span>
                <span className="mt-2 block text-[11px] leading-5 text-[#667085]">项目、数量、单价、金额和优惠全部保留。</span>
                <span className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border ${contentMode === "full" ? "border-[#407aff] bg-[#407aff]" : "border-[#cfd7e3] bg-white"}`} />
              </button>
              <button
                type="button"
                onClick={() => setContentMode("items_only")}
                className={`relative min-h-[96px] rounded-[12px] border py-4 pl-4 pr-12 text-left transition ${attemptedConfirm && missingContent ? "border-[#fda29b] bg-[#fffbfa] ring-1 ring-[#fee4e2]" : contentMode === "items_only" ? "border-[#87afff] bg-[#f3f7ff]" : "border-[#dfe6ef] bg-white hover:border-[#c5d3e7]"}`}
              >
                <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[#182230]"><FileText className="h-4 w-4 text-[#356df3]" />只复制项目</span>
                <span className="mt-2 block text-[11px] leading-5 text-[#667085]">保留项目、单位、说明和单价，数量和金额清空。</span>
                <span className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border ${contentMode === "items_only" ? "border-[#407aff] bg-[#407aff]" : "border-[#cfd7e3] bg-white"}`} />
              </button>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 flex-col gap-3 px-7 pb-6 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {error ? <p className="mb-2 text-[11px] font-semibold text-red-600">{error}</p> : null}
            <p className="truncate text-[11px] text-[#667085]">
              复制到
              <span className="mx-1 font-semibold text-[#182230]">{targetMode === "other" ? selectedCustomer?.name || "未选择客户" : sourceCustomerName}</span>
              · {contentMode === "items_only" ? "只复制项目" : contentMode === "full" ? "完整报价" : "未选择内容"}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={loading} className="inline-flex h-10 min-w-[92px] items-center justify-center rounded-[10px] border border-[#d0d8e4] bg-white px-4 text-[12px] font-semibold text-[#475467] transition hover:bg-[#f8fafc] disabled:opacity-50">取消</button>
            <button
              type="button"
              disabled={loading}
              aria-disabled={!canConfirm}
              onClick={() => {
                setAttemptedConfirm(true);
                if (!canConfirm || !contentMode) return;
                onConfirm({
                  contentMode,
                  targetCustomerId: targetMode === "other" ? selectedCustomer?.id : undefined,
                });
              }}
              className={`inline-flex h-10 min-w-[108px] items-center justify-center gap-2 rounded-[10px] border px-4 text-[12px] font-semibold transition ${canConfirm ? "border-[#407aff] bg-[#407aff] text-white hover:bg-[#2f66e8]" : "border-[#c7d2e0] bg-[#c7d2e0] text-white"} ${loading ? "cursor-not-allowed opacity-70" : ""}`}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              确认复制
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
