export type PersonalizedTemplateCategory = "base" | "main_material" | "custom_cabinet";

export type PersonalizedTemplateItem = {
  id: string;
  category: PersonalizedTemplateCategory;
  source?: "standard" | "custom" | "manual";
  quota_source_id?: string | null;
  quota_source_type?: string | null;
  work_type_id?: string | null;
  work_type_name?: string | null;
  material_category_id?: string | null;
  material_category_name?: string | null;
  name: string;
  spec: string;
  material_model: string;
  remark: string;
  unit: string;
  quantity: number;
  unit_price: number;
  material_cost: number;
  labor_cost: number;
  total_price: number;
};

export type PersonalizedQuotationTemplate = {
  id: string;
  name: string;
  remark: string;
  status: "enabled" | "disabled";
  storeId: string;
  storeName: string;
  createdByName: string;
  items: PersonalizedTemplateItem[];
  createdAt: string;
  updatedAt: string;
};

const categories: PersonalizedTemplateCategory[] = ["base", "main_material", "custom_cabinet"];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizePersonalizedTemplateItem(value: any, index = 0): PersonalizedTemplateItem | null {
  if (!value || typeof value !== "object") return null;
  const name = text(value.name);
  if (!name) return null;
  const category = categories.includes(value.category) ? value.category : "base";
  const quantity = amount(value.quantity);
  const materialCost = amount(value.material_cost ?? value.materialCost);
  const laborCost = amount(value.labor_cost ?? value.laborCost);
  const unitPrice = amount(value.unit_price ?? value.unitPrice ?? (materialCost + laborCost));
  return {
    id: text(value.id) || `template-item-${Date.now()}-${index}`,
    category,
    source: value.source === "standard" || value.source === "custom" ? value.source : "manual",
    quota_source_id: text(value.quota_source_id ?? value.quotaSourceId) || null,
    quota_source_type: text(value.quota_source_type ?? value.quotaSourceType) || null,
    work_type_id: text(value.work_type_id ?? value.workTypeId) || null,
    work_type_name: text(value.work_type_name ?? value.workTypeName) || null,
    material_category_id: text(value.material_category_id ?? value.materialCategoryId) || null,
    material_category_name: text(value.material_category_name ?? value.materialCategoryName) || null,
    name,
    spec: text(value.spec),
    material_model: text(value.material_model ?? value.materialModel),
    remark: text(value.remark),
    unit: text(value.unit),
    quantity,
    unit_price: unitPrice,
    material_cost: materialCost,
    labor_cost: laborCost,
    total_price: amount(value.total_price ?? value.totalPrice ?? quantity * unitPrice),
  };
}

export function normalizePersonalizedTemplate(value: any): PersonalizedQuotationTemplate | null {
  if (!value || typeof value !== "object") return null;
  const id = text(value.id);
  const name = text(value.name);
  const storeId = text(value.storeId ?? value.store_id);
  if (!id || !name || !storeId) return null;
  const items = Array.isArray(value.items)
    ? value.items.map((item: any, index: number) => normalizePersonalizedTemplateItem(item, index)).filter(Boolean) as PersonalizedTemplateItem[]
    : [];
  return {
    id,
    name,
    remark: text(value.remark),
    status: value.status === "disabled" ? "disabled" : "enabled",
    storeId,
    storeName: text(value.storeName ?? value.store_name),
    createdByName: text(value.createdByName ?? value.created_by_name),
    items,
    createdAt: text(value.createdAt ?? value.created_at),
    updatedAt: text(value.updatedAt ?? value.updated_at),
  };
}

export function getPersonalizedTemplateCategoryLabel(category: PersonalizedTemplateCategory) {
  if (category === "main_material") return "产品";
  if (category === "custom_cabinet") return "定制柜";
  return "基装";
}
