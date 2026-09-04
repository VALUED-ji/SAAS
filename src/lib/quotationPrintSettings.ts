export const defaultQuotationSignatureLabels = ["客户签字", "设计师/报价人签字", "公司代表签字/盖章"];

const maxSignatureLabels = 8;

export function hasQuotationSignatureLabels(value: unknown) {
  return Array.isArray(value) && value.some((label) => String(label || "").trim());
}

export function normalizeQuotationSignatureLabels(value: unknown, fallback: string[] = defaultQuotationSignatureLabels) {
  const labels = Array.isArray(value)
    ? value.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
  const fallbackLabels = fallback.map((label) => String(label || "").trim()).filter(Boolean);
  return (labels.length ? labels : fallbackLabels.length ? fallbackLabels : defaultQuotationSignatureLabels).slice(0, maxSignatureLabels);
}
