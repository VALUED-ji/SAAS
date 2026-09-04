// 辅材订单页共享工具模块
// 存放订单状态常量与规范化函数。

export const orderStatusLabels: Record<string, string> = {
  PENDING: "待处理",
  PARTIAL: "部分出库",
  RECEIVED: "已出库",
  CANCELLED: "已取消",
};

export const orderStatusStyles: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  PARTIAL: "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
  RECEIVED: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  CANCELLED: "bg-surface-100 text-surface-500 ring-1 ring-surface-200",
};

export function normalizeOrderStatus(status?: string | null) {
  const key = String(status || "PENDING").toUpperCase();
  if (key === "ORDERED" || key === "DRAFT") return "PENDING";
  return orderStatusLabels[key] ? key : "PENDING";
}
