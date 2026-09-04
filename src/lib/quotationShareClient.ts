export async function createQuotationShareUrl(quotationId: string, expiresInDays?: number | "24h" | null) {
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
  return new URL(String(data.url), window.location.origin).toString();
}

export async function createQuotationPrintPreviewUrl(quotationId: string) {
  const url = new URL(await createQuotationShareUrl(quotationId));
  url.searchParams.set("print", "1");
  return url.toString();
}
