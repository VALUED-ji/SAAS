// 报价合同列表页弹窗组件模块
// 从 page.tsx 渐进拆出的独立弹窗组件。

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Trash2, X } from "lucide-react";

export type QuotationDialogState = {
  title: string;
  message: string;
  tone?: "info" | "danger";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
};

export type QuotationTextDialogState = {
  title: string;
  description: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
};

export function QuotationSystemDialogModal({
  dialog,
  onClose,
}: {
  dialog: QuotationDialogState;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const isDanger = dialog.tone === "danger";
  const iconClassName = isDanger
    ? "border-red-100 bg-red-50 text-red-600"
    : "border-[#CFE0FF] bg-[#EDF4FF] text-[#407AFF]";
  const confirmClassName = isDanger
    ? "inline-flex h-10 min-w-[92px] items-center justify-center rounded-[10px] bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
    : "inline-flex h-10 min-w-[92px] items-center justify-center rounded-[10px] bg-[#407AFF] px-4 text-sm font-bold text-white transition hover:bg-[#2f66e8] focus:outline-none focus:ring-2 focus:ring-[#CFE0FF]";

  const handleConfirm = () => {
    const onConfirm = dialog.onConfirm;
    onClose();
    onConfirm?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0B1220]/35 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-[440px] overflow-hidden rounded-[14px] border border-[#D9E2EF] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.18)]">
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border ${iconClassName}`}>
            {isDanger ? <Trash2 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold tracking-tight text-[#162033]">{dialog.title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[#52647B]">{dialog.message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E7EFF9] bg-[#F8FAFC] px-5 py-4">
          {dialog.cancelText ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 min-w-[84px] items-center justify-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-bold text-[#52647B] transition hover:border-[#C9D6E8] hover:bg-[#F4F7FB] focus:outline-none focus:ring-2 focus:ring-[#DDE8FF]"
            >
              {dialog.cancelText}
            </button>
          ) : null}
          <button type="button" onClick={handleConfirm} className={confirmClassName}>
            {dialog.confirmText || "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function QuotationTextDialogModal({
  dialog,
  onClose,
}: {
  dialog: QuotationTextDialogState;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.defaultValue || "");

  useEffect(() => {
    setValue(dialog.defaultValue || "");
  }, [dialog.defaultValue]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const handleSubmit = () => {
    const onConfirm = dialog.onConfirm;
    onClose();
    onConfirm(value);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0B1220]/35 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[14px] border border-[#D9E2EF] bg-white shadow-[0_24px_72px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#E7EFF9] px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold tracking-tight text-[#162033]">{dialog.title}</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#6F7F96]">{dialog.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] p-2 text-[#8B9AAF] transition hover:bg-[#F4F8FF] hover:text-[#162033] focus:outline-none focus:ring-2 focus:ring-[#DDE8FF]"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="bg-[#F8FAFC] px-5 py-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#162033]">{dialog.label}</span>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="min-h-[132px] w-full resize-none rounded-[12px] border border-[#D9E2EF] bg-white px-3.5 py-3 text-sm font-medium leading-6 text-[#162033] outline-none transition placeholder:text-[#9AA8BA] focus:border-[#407AFF] focus:ring-2 focus:ring-[#DDE8FF]"
              placeholder={dialog.placeholder}
              autoFocus
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E7EFF9] bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 min-w-[84px] items-center justify-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-bold text-[#52647B] transition hover:border-[#C9D6E8] hover:bg-[#F4F7FB] focus:outline-none focus:ring-2 focus:ring-[#DDE8FF]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex h-10 min-w-[92px] items-center justify-center rounded-[10px] bg-[#407AFF] px-4 text-sm font-bold text-white transition hover:bg-[#2f66e8] focus:outline-none focus:ring-2 focus:ring-[#CFE0FF]"
          >
            {dialog.confirmText || "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
