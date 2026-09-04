// 定额库自定义项目面板共享工具模块
// 存放自定义定额面板与页面主体共用的类型与纯计算函数。

export type CustomQuotaItem = {
  id: string;
  source?: "custom";
  code?: string;
  scope: string;
  storeName: string;
  category: string;
  workTypeId?: string;
  workTypeName?: string;
  materialCategoryId?: string;
  materialCategoryName?: string;
  name: string;
  constructionDescription: string;
  unit: string;
  laborPrice: number;
  materialPrice: number;
  totalPrice: number;
  isSpecialPrice: boolean;
  status: "enabled" | "disabled" | "promoted";
  sourceQuotationId?: string;
  sourceQuotationTitle?: string;
  sourceQuotationItemId?: string;
  createdById?: string;
  createdByName?: string;
  sourceEmployeeName?: string;
  promotedQuotaCode?: string;
  promotedAt?: string;
  updatedAt: string;
  createdAt: string;
};

export type PromoteConfirmState = {
  item: CustomQuotaItem;
  targetScope: string;
  duplicateName?: string;
  resolve: () => void;
  reject: (error: Error) => void;
};

export function formatAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(value);
}

export function parsePriceInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, "");
  if (!sanitized) return 0;
  const [integerPart, ...decimalParts] = sanitized.split(".");
  const integerText = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const decimalText = decimalParts.length > 0 ? `.${decimalParts.join("").slice(0, 2)}` : "";
  const amount = Number(`${integerText}${decimalText}`);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export async function requestCustomQuotaLibrary(path = "", init?: RequestInit) {
  const response = await fetch(`/api/quota/custom-library${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "自定义库操作失败");
  return data;
}
