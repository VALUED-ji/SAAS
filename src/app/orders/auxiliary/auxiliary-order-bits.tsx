// 辅材订单页展示组件模块
// 从 page.tsx 渐进拆出的状态标签与信息行组件。

"use client";

import { cn } from "@/lib/utils";
import {
  normalizeOrderStatus,
  orderStatusLabels,
  orderStatusStyles,
} from "./auxiliary-order-shared";

export function StatusBadge({ status }: { status?: string | null }) {
  const key = normalizeOrderStatus(status);
  return (
    <span className={cn("aux-order-status-tag inline-flex min-w-[68px] items-center justify-center px-2.5 py-1 text-xs font-semibold", orderStatusStyles[key] || orderStatusStyles.PENDING)}>
      {orderStatusLabels[key] || key}
    </span>
  );
}

export function InfoLine({ label, value, span = 1 }: { label: string; value: string; span?: 1 | 2 | 3 }) {
  return (
    <div className={cn(
      "aux-orders-info-line min-w-0 px-4 py-3",
      span === 2 && "md:col-span-2",
      span === 3 && "md:col-span-3"
    )}>
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className={cn(
        "mt-1 text-sm font-semibold text-surface-900",
        span === 3 ? "whitespace-normal leading-5" : "truncate"
      )} title={value}>{value}</p>
    </div>
  );
}
