// 材料库存页展示组件模块
// 从 page.tsx 渐进拆出的表头提示与指标组件。

"use client";

import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

export function HeaderHelp({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <span>{label}</span>
      <span className="group relative inline-flex">
        <CircleHelp className="h-3.5 w-3.5 cursor-help text-surface-400 transition-colors group-hover:text-primary-600" />
        <span className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-56 -translate-x-1/2 rounded-lg border border-surface-200 bg-white px-3 py-2 text-left text-xs font-medium leading-5 text-surface-700 shadow-[0_16px_42px_rgba(15,23,42,0.16)] group-hover:block">
          {help}
        </span>
      </span>
    </span>
  );
}

export function AdjustMetric({ label, value, tone }: { label: string; value: string | number; tone: "neutral" | "strong" | "success" | "warning" | "danger" }) {
  const toneClass = {
    neutral: "text-surface-700",
    strong: "text-surface-950",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-600",
  }[tone];
  return (
    <div className="materials-metric border border-surface-200 bg-surface-50/70 px-3 py-3">
      <p className="text-xs font-semibold text-surface-500">{label}</p>
      <p className={cn("mt-1 truncate text-base font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}
