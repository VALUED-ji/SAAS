"use client";

import { useId } from "react";
import { HelpCircle } from "lucide-react";

export default function CustomerPriceLabel() {
  const tooltipId = useId();
  return (
    <span className="flex items-center gap-1.5">
      客户单价
      <button
        type="button"
        aria-label="客户单价设置说明"
        aria-describedby={tooltipId}
        className="group relative inline-flex items-center text-surface-400 hover:text-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-2 block w-[280px] max-w-[70vw] whitespace-normal rounded-md border border-surface-200 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-surface-600 shadow-lg group-hover:visible group-focus-within:visible"
        >
          如需区分或不区分人工与材料，请前往「设置 → 分公司设置 → 对应分公司 → 报价设置」，调整「客户单价区分人工与材料」开关。
        </span>
      </button>
    </span>
  );
}
