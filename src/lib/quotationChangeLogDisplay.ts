export type QuotationChangeItem = {
  id: string;
  quotation_item_id?: string | null;
  item_name?: string | null;
  space?: string | null;
  category?: string | null;
  change_type: "created" | "updated" | "deleted";
  field_key?: string | null;
  field_label?: string | null;
  old_value?: string | null;
  new_value?: string | null;
};

export type QuotationChangeDisplayItem =
  | { kind: "replacement"; id: string; oldName: string; newName: string; space?: string | null; category?: string | null }
  | { kind: "change"; id: string; change: QuotationChangeItem };

export type QuotationChangeLog = {
  id: string;
  user_name?: string | null;
  user_avatar?: string | null;
  summary?: string | null;
  change_count?: number;
  created_at: string;
  changes: QuotationChangeItem[];
};

export function formatQuotationChangeDateTime(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatQuotationChangeValue(value: unknown) {
  return String(value ?? "").trim() || "空";
}

function getChangeGroupKey(change: QuotationChangeItem) {
  return String(change.quotation_item_id || change.item_name || change.id || "").trim();
}

function isQuotaReplacementGroup(group: QuotationChangeItem[]) {
  if (group.length < 2 || group.some((change) => change.change_type !== "updated")) return false;
  const fields = new Set(group.map((change) => String(change.field_key || "").trim()).filter(Boolean));
  if (!fields.has("name")) return false;
  return ["spec", "remark", "material_cost", "labor_cost", "unit_price", "unit"].some((field) => fields.has(field));
}

export function getQuotationChangeDisplayItems(changes: QuotationChangeItem[]): QuotationChangeDisplayItem[] {
  const grouped = new Map<string, QuotationChangeItem[]>();
  changes.forEach((change) => {
    const key = getChangeGroupKey(change);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(change);
  });

  const displayItems: QuotationChangeDisplayItem[] = [];
  const handledIds = new Set<string>();
  grouped.forEach((group, key) => {
    if (!isQuotaReplacementGroup(group)) return;
    group.forEach((change) => handledIds.add(change.id));
    const nameChange = group.find((change) => change.field_key === "name");
    const sample = nameChange || group[0];
    displayItems.push({
      kind: "replacement",
      id: `replacement-${key || sample.id}`,
      oldName: formatQuotationChangeValue(nameChange?.old_value || ""),
      newName: formatQuotationChangeValue(nameChange?.new_value || sample.item_name),
      space: sample.space,
      category: sample.category,
    });
  });

  changes.forEach((change) => {
    if (handledIds.has(change.id)) return;
    displayItems.push({ kind: "change", id: change.id, change });
  });
  return displayItems;
}

export function getQuotationChangeDisplaySummary(log: QuotationChangeLog, displayItems: QuotationChangeDisplayItem[]) {
  const replacementCount = displayItems.filter((item) => item.kind === "replacement").length;
  if (replacementCount > 0 && displayItems.length === replacementCount) {
    return replacementCount === 1 ? "替换定额" : `替换 ${replacementCount} 项定额`;
  }
  return log.summary || `修改 ${log.change_count || log.changes.length} 项内容`;
}

export function getQuotationChangeActionText(change: QuotationChangeItem) {
  const itemName = change.item_name || "未命名项目";
  if (change.change_type === "created") return `新增了「${itemName}」`;
  if (change.change_type === "deleted") return `删除了「${itemName}」`;
  return `修改了「${itemName}」的${change.field_label || "内容"}`;
}

export function getQuotationChangeCategoryLabel(value: unknown) {
  const category = String(value || "").trim();
  if (!category) return "";
  if (category === "base" || category === "基装" || category === "基装项目") return "基装";
  if (category === "main_material" || category === "产品" || category === "产品项目") return "产品";
  if (category === "custom_cabinet" || category === "定制柜" || category === "定制柜项目") return "定制柜";
  if (category === "other" || category === "综合费用") return "综合费用";
  return category;
}
