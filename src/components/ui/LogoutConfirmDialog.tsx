"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, X } from "lucide-react";

type LogoutConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export default function LogoutConfirmDialog({ open, onClose, onConfirm }: LogoutConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, pending]);

  if (!open || typeof document === "undefined") return null;

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0f172a]/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        className="w-full max-w-[420px] overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.14)]"
      >
        <div className="flex items-start gap-3.5 px-5 pb-4 pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#fef2f2] text-[#dc2626]">
            <LogOut className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="text-[15px] font-semibold leading-6 text-[#182230]">确认退出登录？</h2>
            <p id={descriptionId} className="mt-1 text-[13px] leading-5 text-[#667085]">
              退出后需要重新登录才能继续访问系统。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#7c8aa0] transition-colors hover:bg-[#f6f8fb] hover:text-[#182230] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6feb]/40 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="关闭退出确认弹窗"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#edf2f8] bg-[#fafbfd] px-5 py-3.5">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 min-w-[76px] items-center justify-center rounded-[8px] border border-[#d9e1ec] bg-white px-4 text-[13px] font-semibold text-[#475467] transition-colors hover:bg-[#f6f8fb] hover:text-[#182230] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6feb]/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="inline-flex h-10 min-w-[96px] items-center justify-center gap-2 rounded-[8px] border border-[#dc2626] bg-[#dc2626] px-4 text-[13px] font-semibold text-white transition-colors hover:border-[#b91c1c] hover:bg-[#b91c1c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc2626]/35 disabled:cursor-wait disabled:opacity-65"
          >
            <LogOut className="h-4 w-4" />
            {pending ? "正在退出" : "退出登录"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
