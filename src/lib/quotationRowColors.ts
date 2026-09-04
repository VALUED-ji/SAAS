export const quotationRowColors = [
  { value: "", label: "无颜色", background: "", swatch: "#ffffff", border: "#cbd5e1" },
  { value: "special", label: "特价项目", background: "", swatch: "#f97316", border: "#ea580c" },
  { value: "yellow", label: "黄色", background: "#fef9c3", swatch: "#facc15", border: "#eab308" },
  { value: "green", label: "绿色", background: "#dcfce7", swatch: "#22c55e", border: "#16a34a" },
  { value: "blue", label: "蓝色", background: "#dbeafe", swatch: "#3b82f6", border: "#2563eb" },
  { value: "red", label: "红色", background: "#fee2e2", swatch: "#ef4444", border: "#dc2626" },
  { value: "purple", label: "紫色", background: "#ede9fe", swatch: "#8b5cf6", border: "#7c3aed" },
] as const;

export type QuotationRowColorValue = (typeof quotationRowColors)[number]["value"];

export function getQuotationRowColor(value?: string | null) {
  return quotationRowColors.find((color) => color.value === value) || quotationRowColors[0];
}
