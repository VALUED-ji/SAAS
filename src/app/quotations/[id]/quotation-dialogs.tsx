// 报价详情页弹窗组件模块
// 从 page.tsx 渐进拆出的独立弹窗组件。

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Trash2, X } from "lucide-react";

export type QuoteNameDialogKind = "space" | "category";

export type QuoteNameDialogState = {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  confirmText?: string;
  kind: QuoteNameDialogKind;
  lockKind?: boolean;
  onConfirm: (value: string, kind: QuoteNameDialogKind) => boolean | void;
};

export type QuoteSystemDialogState = {
  title: string;
  message: string;
  tone?: "info" | "danger";
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
};

export function FeeFormulaHelp() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tips = [
    ["直接费", "基装直接费 + 产品直接费 + 定制柜"],
    ["基装", "基装直接费"],
    ["产品", "产品直接费"],
    ["定制柜", "定制柜小计"],
    ["A、B、C", "引用综合费用对应编号的小计"],
    ["A+B", "多个金额相加"],
    ["(基装+定制柜)*0.1", "可用加减乘除和括号"],
  ];

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button || typeof window === "undefined") return;

    const rect = button.getBoundingClientRect();
    const tooltipWidth = 288;
    const tooltipHeight = 224;
    const gap = 10;
    const left = Math.min(
      Math.max(12, rect.right - tooltipWidth),
      Math.max(12, window.innerWidth - tooltipWidth - 12),
    );
    const hasBottomSpace = rect.bottom + gap + tooltipHeight <= window.innerHeight - 12;
    const top = hasBottomSpace
      ? rect.bottom + gap
      : Math.max(12, rect.top - tooltipHeight - gap);

    setPosition({ top, left });
  }, []);

  const showHelp = () => {
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <div
      className="relative flex h-full items-center pr-1"
      onMouseEnter={showHelp}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        onFocus={showHelp}
        onBlur={() => setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-surface-400 transition hover:bg-primary-50 hover:text-primary-700"
        aria-label="查看基础公式填写说明"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-72 rounded-md border border-surface-200 bg-white p-3 text-xs text-surface-600 shadow-[0_18px_40px_rgba(31,41,53,0.18)]"
          style={{ top: position.top, left: position.left }}
        >
          <div className="mb-2 font-semibold text-surface-900">基础公式填写说明</div>
          <div className="space-y-1.5">
            {tips.map(([label, description]) => (
              <div key={label} className="flex gap-2">
                <span className="w-16 shrink-0 font-semibold text-surface-700">{label}</span>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function QuoteNameDialogModal({
  dialog,
  onClose,
}: {
  dialog: QuoteNameDialogState;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.defaultValue || "");
  const [kind, setKind] = useState<QuoteNameDialogKind>(dialog.kind);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue(dialog.defaultValue || "");
    setKind(dialog.kind);
    setError("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [dialog]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const submit = () => {
    const nextValue = value.trim();
    if (!nextValue) {
      setError(kind === "category" ? "请输入类别名称" : "请输入空间名称");
      return;
    }
    const confirmed = dialog.onConfirm(nextValue, kind);
    if (confirmed === false) return;
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-[14px] border border-[#d9e2ef] bg-white shadow-[0_24px_72px_rgba(15,35,70,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e8eef6] px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold leading-6 text-[#182230]">{dialog.title}</div>
            <div className="mt-1 text-xs leading-5 text-[#667085]">{dialog.description}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#407AFF]"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 bg-[#f8fbff] px-5 py-4">
          {!dialog.lockKind && (
            <div className="grid grid-cols-2 gap-2 rounded-[12px] border border-[#d9e2ef] bg-white p-1">
              {([
                ["space", "空间"],
                ["category", "类别"],
              ] as const).map(([itemKind, label]) => {
                const active = kind === itemKind;
                return (
                  <button
                    key={itemKind}
                    type="button"
                    onClick={() => {
                      setKind(itemKind);
                      setError("");
                    }}
                    className={`inline-flex h-9 items-center justify-center rounded-[10px] text-sm font-semibold transition ${active ? "bg-[#407AFF] text-white" : "text-[#52647b] hover:bg-[#edf4ff] hover:text-[#407AFF]"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#34445a]">{dialog.lockKind ? dialog.label : kind === "category" ? "类别名称" : "空间名称"}</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submit();
              }}
              className={`h-11 w-full rounded-[10px] border bg-white px-3 text-sm font-medium text-[#182230] outline-none transition placeholder:text-[#98a2b3] focus:border-[#407AFF] focus:ring-2 focus:ring-[#407AFF]/10 ${error ? "border-red-300 ring-2 ring-red-100" : "border-[#d9e2ef]"}`}
              placeholder={dialog.lockKind ? dialog.placeholder : kind === "category" ? "基装、产品或定制柜" : "如：客餐厅及过道、卧室"}
            />
            {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#e8eef6] bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white px-4 text-sm font-semibold text-[#52647b] transition hover:bg-[#f7f9fd]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#407AFF] bg-[#407AFF] px-5 text-sm font-semibold text-white transition hover:bg-[#2f66e8]"
          >
            {dialog.confirmText || "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function QuoteSystemDialogModal({
  dialog,
  onClose,
}: {
  dialog: QuoteSystemDialogState;
  onClose: () => void;
}) {
  const isDanger = dialog.tone === "danger";

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const confirm = () => {
    onClose();
    dialog.onConfirm?.();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0b1220]/35 px-4 py-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-[14px] border border-[#d9e2ef] bg-white shadow-[0_24px_72px_rgba(15,35,70,0.22)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
      >
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          <div className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${isDanger ? "bg-red-50 text-red-600" : "bg-[#edf4ff] text-[#407AFF]"}`}>
            {isDanger ? <Trash2 className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-6 text-[#182230]">{dialog.title}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#667085]">{dialog.message}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#667085] transition hover:bg-[#edf4ff] hover:text-[#407AFF]"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#e8eef6] bg-[#fbfcff] px-5 py-3">
          {dialog.cancelText && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#d9e2ef] bg-white px-4 text-sm font-semibold text-[#52647b] transition hover:bg-[#f7f9fd]"
            >
              {dialog.cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={confirm}
            className={`inline-flex h-10 items-center justify-center rounded-[10px] border px-5 text-sm font-semibold text-white transition ${isDanger ? "border-red-500 bg-red-500 hover:bg-red-600" : "border-[#407AFF] bg-[#407AFF] hover:bg-[#2f66e8]"}`}
          >
            {dialog.confirmText || "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
