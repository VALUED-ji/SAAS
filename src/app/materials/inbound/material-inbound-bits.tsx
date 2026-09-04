// 材料入库单页展示组件模块
// 从 page.tsx 渐进拆出的状态标签与信息行组件。

"use client";

import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已入库",
  CANCELLED: "已作废",
};

const statusStyles: Record<string, string> = {
  DRAFT: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  CONFIRMED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  CANCELLED: "bg-surface-100 text-surface-500 ring-1 ring-surface-200",
};

export function StatusBadge({ status }: { status?: string | null }) {
  const key = status || "DRAFT";
  return (
    <span className={cn("inline-flex min-w-[70px] items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold", statusStyles[key] || statusStyles.DRAFT)}>
      {statusLabels[key] || key}
    </span>
  );
}

export function InfoLine({ label, value, span = 1 }: { label: string; value: string; span?: 1 | 2 | 3 }) {
  return (
    <div className={cn(
      "materials-info-line min-w-0 border border-surface-200 bg-surface-50 px-3 py-2",
      span === 2 && "md:col-span-2",
      span === 3 && "md:col-span-3",
    )}>
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-surface-900" title={value}>{value}</p>
    </div>
  );
}
