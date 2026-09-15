function normalizeShareUrlForCurrentOrigin(value: string) {
  const url = new URL(value, window.location.origin);
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  const current = new URL(window.location.origin);
  const isSharePath = url.pathname.startsWith("/quotation-share/") || url.pathname.startsWith("/q/");
  if (isSharePath) {
    if (localHosts.has(current.hostname) || localHosts.has(url.hostname)) {
      url.protocol = current.protocol;
      url.host = current.host;
    }
  }
  return url.toString();
}

export type QuotationShareBaseColumnKey = "materialUnit" | "materialTotal" | "laborUnit" | "laborTotal" | "subtotal" | "description";
export type QuotationShareProductColumnKey = "unitPrice" | "quantity" | "subtotal" | "remark";
export type QuotationShareCabinetColumnKey = "quantity" | "area" | "unitPrice" | "amount";

type QuotationShareDisplayOptions = {
  baseColumns?: QuotationShareBaseColumnKey[];
  productColumns?: QuotationShareProductColumnKey[];
  cabinetColumns?: QuotationShareCabinetColumnKey[];
  quotationValidUntil?: string;
};

const baseColumnShortCodes: Record<QuotationShareBaseColumnKey, string> = {
  materialUnit: "mu",
  materialTotal: "mt",
  laborUnit: "lu",
  laborTotal: "lt",
  subtotal: "st",
  description: "ds",
};

const productColumnShortCodes: Record<QuotationShareProductColumnKey, string> = {
  unitPrice: "up",
  quantity: "qt",
  subtotal: "st",
  remark: "rm",
};

const cabinetColumnShortCodes: Record<QuotationShareCabinetColumnKey, string> = {
  quantity: "qt",
  area: "ar",
  unitPrice: "up",
  amount: "am",
};

function applyQuotationShareDisplayOptions(value: string, options?: QuotationShareDisplayOptions) {
  if (!options) return value;
  const url = new URL(value, window.location.origin);
  if (options.baseColumns) url.searchParams.set("bc", options.baseColumns.map((key) => baseColumnShortCodes[key]).join("."));
  if (options.productColumns) url.searchParams.set("pc", options.productColumns.map((key) => productColumnShortCodes[key]).join("."));
  if (options.cabinetColumns) url.searchParams.set("cc", options.cabinetColumns.map((key) => cabinetColumnShortCodes[key]).join("."));
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(options.quotationValidUntil || ""))) url.searchParams.set("vu", String(options.quotationValidUntil));
  return url.toString();
}

export async function createQuotationShareUrl(quotationId: string, expiresInDays?: number | "24h" | null, displayOptions?: QuotationShareDisplayOptions) {
  const body: Record<string, string | number | null> = { quotation_id: quotationId };
  if (expiresInDays === "24h") body.expires_in_hours = 24;
  else if (expiresInDays !== undefined) body.expires_in_days = expiresInDays;
  const response = await fetch("/api/quotation-shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) throw new Error(data?.message || "生成报价分享链接失败");
  return applyQuotationShareDisplayOptions(normalizeShareUrlForCurrentOrigin(String(data.url)), displayOptions);
}

export async function createQuotationPrintPreviewUrl(quotationId: string) {
  const url = new URL(await createQuotationShareUrl(quotationId));
  url.searchParams.set("print", "1");
  return url.toString();
}
