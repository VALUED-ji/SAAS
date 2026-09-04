import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  lead: "bg-surface-100 text-surface-700 ring-1 ring-surface-200",
  designed: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
  quoted: "bg-amber-100 text-amber-700",
  signed: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",
  construction: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
  completed: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",
  closed: "bg-surface-100 text-surface-600 ring-1 ring-surface-200",
  new: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
  contacted: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
  invited: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  measured: "bg-surface-100 text-surface-700 ring-1 ring-surface-200",
  deposited: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",
  proposal: "bg-amber-100 text-amber-700",
  visited: "bg-surface-100 text-surface-700 ring-1 ring-surface-200",
  lost: "bg-red-100 text-red-700",
  pending: "bg-surface-100 text-surface-600 ring-1 ring-surface-200",
  in_progress: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
  review: "bg-amber-100 text-amber-700",
  active: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",
  busy: "bg-amber-100 text-amber-700",
  vacation: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 text-xs font-medium",
        statusStyles[status] || "bg-surface-100 text-surface-600",
        className
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label || status}
    </span>
  );
}
