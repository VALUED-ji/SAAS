export function getTemporaryQuotationCustomerKey(record: any) {
  const phone = String(record?.customer_phone || record?.temp_customer_phone || "").trim();
  if (phone) return `phone:${phone}`;
  const weixin = String(record?.customer_weixin || record?.temp_customer_weixin || "").trim();
  if (weixin) return `weixin:${weixin}`;
  const name = String(record?.customer_name || record?.temp_customer_name || "").trim();
  const address = String(
    record?.customer_address
    || record?.customer_house_address
    || record?.temp_customer_address
    || record?.temp_customer_house_address
    || "",
  ).trim();
  if (name || address) return `profile:${name}:${address}`;
  return `quote:${record?.id || ""}`;
}

export function getQuotationCustomerGroupKey(record: any) {
  if (record?.is_unbound) return `unbound:${getTemporaryQuotationCustomerKey(record)}`;
  return record?.customer_id || record?.customer_name || record?.customer_phone || record?.project_id || "";
}
