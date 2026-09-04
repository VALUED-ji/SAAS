import type { ElementType } from "react";
import { cn } from "@/lib/utils";

type DetailInfoFieldProps = {
  icon: ElementType;
  label: string;
  value: string;
  iconBadgeClassName?: string;
};

export default function DetailInfoField({ icon: Icon, label, value, iconBadgeClassName }: DetailInfoFieldProps) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 border-b border-surface-100 bg-transparent px-1 py-3" data-detail-info-field>
      <span className={cn("customer-info-material-icon-badge", iconBadgeClassName)} data-detail-info-icon>
        <Icon aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={1.85} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-surface-500">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-surface-800" title={value}>{value}</p>
      </div>
    </div>
  );
}
