import { Loader2 } from "lucide-react";

export default function RouteLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-surface-500 shadow-[0_10px_24px_rgba(31,41,53,0.06)]">
        <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
        <span>加载中</span>
      </div>
    </div>
  );
}
