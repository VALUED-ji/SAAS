// 材料库页编辑/导入/价格预览组件模块
// 从 page.tsx 渐进拆出，共享工具来自 ./material-editor-shared。

"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, FileDown, FileUp, Loader2, PackagePlus, Plus, Trash2, Upload, X } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";
import SystemSelect from "@/components/ui/SystemSelect";
import { cn } from "@/lib/utils";
import {
  Category,
  formatAmount,
  formatBeijingDate,
  formatBeijingDateTime,
  formatCategoryOption,
  formatQuantityText,
  ImportErrorItem,
  getProductAttributeLabels,
  makeMaterialNameFromParts,
  makeProductMaterialNameFromParts,
	  Material,
	  MaterialForm,
	  MaterialSkuForm,
	  normalizeDecimalInput,
  normalizeMaterialCodeInput,
  parseProductAttributes,
  settlementCycleLabels,
  Supplier,
} from "./material-editor-shared";

export function MaterialEditor({
  form,
  categories,
  suppliers,
  saving,
  uploadingImage,
  onClose,
  onChange,
  onUploadImages,
  onSubmit,
}: {
  form: MaterialForm;
  categories: Category[];
  suppliers: Supplier[];
  saving: boolean;
  uploadingImage: boolean;
  onClose: () => void;
  onChange: (patch: Partial<MaterialForm>) => void;
  onUploadImages: (files?: FileList | File[] | null) => void;
  onSubmit: () => void;
}) {
  const hasSupplier = Boolean(form.supplier_id);
  const isProduct = form.material_type === "MAIN";
  const generatedMaterialName = isProduct ? makeProductMaterialNameFromParts(form) : makeMaterialNameFromParts(form);
  const parentCategories = useMemo(() => categories.filter((category) => !category.parent_id), [categories]);
  const selectedCategory = useMemo(() => categories.find((category) => category.id === form.category_id), [categories, form.category_id]);
  const selectedParentId = form.category_parent_id || selectedCategory?.parent_id || "";
  const childCategories = useMemo(
    () => categories.filter((category) => category.parent_id === selectedParentId),
    [categories, selectedParentId]
  );
  const selectedCategoryPath = selectedCategory ? formatCategoryOption(selectedCategory) : "";
  const productAttributeLabels = useMemo(
    () => getProductAttributeLabels(selectedCategoryPath || form.category_name || form.product_name),
    [form.category_name, form.product_name, selectedCategoryPath]
  );
  const productExtraAttributeLabels = useMemo(
    () => productAttributeLabels.filter((label) => !["套餐类别", "税率", "产地", "原产地"].includes(label)),
    [productAttributeLabels]
  );
  const productAttributes = useMemo(() => parseProductAttributes(form.product_attributes), [form.product_attributes]);
  const updateProductAttribute = (label: string, value: string) => {
    onChange({ product_attributes: JSON.stringify({ ...productAttributes, [label]: value }) });
  };
  const updateSupplier = (supplierId: string) => {
    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
    onChange({
      supplier_id: supplierId,
      owner_name: selectedSupplier?.owner_name || form.owner_name,
      settlement_cycle: selectedSupplier?.settlement_cycle || form.settlement_cycle,
    });
  };
  const setPrimaryImage = (image: string) => {
    const images = [image, ...form.images.filter((item) => item !== image)];
    onChange({ images, image: images[0] || "" });
  };
	  const removeImage = (image: string) => {
	    const images = form.images.filter((item) => item !== image);
	    onChange({ images, image: images[0] || "" });
	  };
  const updateSku = (index: number, patch: Partial<MaterialSkuForm>) => {
    onChange({ skus: form.skus.map((sku, skuIndex) => skuIndex === index ? { ...sku, ...patch } : sku) });
  };
  const addSku = () => {
    onChange({
      skus: [
        ...form.skus,
        {
          sku_code: "",
          sku_name: `规格${form.skus.length + 1}`,
          spec: "",
          color: "",
          unit: form.unit || form.skus[0]?.unit || "",
          unit_price: form.unit_price || form.skus[0]?.unit_price || "0",
          market_price: form.market_price || form.skus[0]?.market_price || "",
          cost_price: form.cost_price || form.skus[0]?.cost_price || "",
          internal_control_price: form.internal_control_price || form.skus[0]?.internal_control_price || "",
          stock: "0",
          min_stock: "0",
          image: form.image || "",
          is_active: true,
        },
      ],
    });
  };
  const removeSku = (index: number) => {
    if (form.skus.length <= 1) return;
    onChange({ skus: form.skus.filter((_, skuIndex) => skuIndex !== index) });
  };

  return (
    <div className="materials-overlay fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/18 px-5 py-6 max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭" />
      <div className="materials-modal-shell materials-editor-modal relative flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden border border-surface-200 bg-white">
        <header className="materials-modal-header flex min-h-16 items-center justify-between border-b border-surface-200 px-5">
          <div>
            <p className="text-base font-semibold text-surface-900">{form.id ? (isProduct ? "编辑产品" : "编辑辅材") : (isProduct ? "新增产品" : "新增辅材")}</p>
            <p className="mt-0.5 text-xs text-surface-500">{isProduct ? "维护主材商品信息、分类属性和详情，供报价选品使用。" : "维护辅材基础信息，供项目下单、库存和工地成本使用。"}</p>
          </div>
          <button type="button" onClick={onClose} className="materials-icon-button p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-700" aria-label="关闭材料编辑">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="materials-modal-body flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <EditorSection title="商品图片">
            <div className="space-y-3">
              <div className="flex min-h-9 items-center justify-between gap-3">
                <p className="text-xs font-medium text-surface-500">
                  {form.images.length > 0 ? `已上传 ${form.images.length} 张，拖动顺序暂未开放` : "支持一次选择多张图片上传"}
                </p>
                <div className="flex items-center gap-2">
                  {form.images.length > 0 && (
                    <button type="button" className="px-2 text-xs font-semibold text-surface-400 hover:text-red-600" onClick={() => onChange({ images: [], image: "" })}>
                      清空
                    </button>
                  )}
                  <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 text-xs font-semibold text-surface-700 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700">
                    {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploadingImage ? "上传中" : "上传"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        onUploadImages(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="grid items-start gap-4 md:grid-cols-[132px_1fr]">
                <div className="space-y-2">
                  <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                    {form.images[0] ? (
                      <>
                        <NativeImage src={form.images[0]} alt={generatedMaterialName || "商品主图"} className="h-full w-full object-cover" />
                        <span className="absolute left-2 top-2 rounded bg-primary-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">主图</span>
                      </>
                    ) : (
                      <PackagePlus className="h-8 w-8 text-surface-300" />
                    )}
                  </div>
                  <p className="w-32 text-center text-xs text-surface-500">首图为商品主图</p>
                </div>
                {form.images.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {form.images.map((image, index) => (
                      <div key={`${image}-${index}`} className="group relative h-32 w-32 overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                        <NativeImage src={image} alt={`商品图片${index + 1}`} className="h-full w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-surface-200 bg-white px-1.5 py-1">
                          <button
                            type="button"
                            className={cn("text-[11px] font-semibold", index === 0 ? "text-primary-600" : "text-surface-500 hover:text-primary-600")}
                            onClick={() => setPrimaryImage(image)}
                          >
                            {index === 0 ? "主图" : "设为主图"}
                          </button>
                          <button type="button" className="text-[11px] font-semibold text-surface-400 hover:text-red-600" onClick={() => removeImage(image)}>
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-surface-200 bg-surface-50 text-sm text-surface-400">
                    暂无商品图片，可一次选择多张上传
                  </div>
                )}
              </div>
            </div>
          </EditorSection>

          <EditorSection title={isProduct ? "商品基础信息" : "基础信息"}>
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <Field label={isProduct ? "商品编码" : "材料编码"}>
                <input
                  value={form.code}
                  onChange={(event) => onChange({ code: normalizeMaterialCodeInput(event.target.value) })}
                  className="input-field font-mono"
                  placeholder="留空则系统自动生成"
                />
              </Field>
              <Field label={isProduct ? "商品标题" : "材料名称"}>
                <div className="flex min-h-10 items-center rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm font-semibold text-surface-900">
                  {generatedMaterialName || "填写品名后自动生成"}
                </div>
              </Field>
            </div>
            <p className="text-xs leading-5 text-surface-500">{isProduct ? "商品标题按“品牌 商品名称 型号 颜色 规格”生成；不同分类的详细参数在下方分类属性中维护。" : "材料名称自动按“品牌 品名 型号 颜色 规格”生成，空字段会自动跳过；品名用于说明这是什么材料，例如保护膜、PPR管、角阀。"}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="一级分类" required>
                <SystemSelect
                  value={selectedParentId}
                  onChange={(event) => {
                    onChange({ category_parent_id: event.target.value, category_id: "", category_name: "" });
                  }}
                  className="input-field"
                >
                  <option value="">请选择一级分类</option>
                  {parentCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </SystemSelect>
              </Field>
              <Field label="二级分类" required>
                <SystemSelect
                  value={form.category_id}
                  onChange={(event) => {
                    const category = categories.find((item) => item.id === event.target.value);
                    onChange({ category_id: event.target.value, category_name: category ? formatCategoryOption(category) : "" });
                  }}
                  className={cn("input-field", !selectedParentId && "cursor-not-allowed bg-surface-100 text-surface-500")}
                  disabled={!selectedParentId}
                >
                  <option value="">{selectedParentId ? "请选择二级分类" : "请先选择一级分类"}</option>
                  {childCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </SystemSelect>
              </Field>
              <Field label="品牌">
                <input value={form.brand} onChange={(event) => onChange({ brand: event.target.value })} className="input-field" placeholder="品牌" />
              </Field>
              <Field label={isProduct ? "商品名称" : "品名"} required>
                <input value={form.product_name} onChange={(event) => onChange({ product_name: event.target.value })} className="input-field" placeholder={isProduct ? "如：瓷砖、马桶、木门、衣柜" : "如：保护膜、PPR管、角阀"} />
              </Field>
              <Field label="型号">
                <input value={form.material_model} onChange={(event) => onChange({ material_model: event.target.value })} className="input-field" placeholder="型号" />
              </Field>
	              {!isProduct && (
	                <>
	                  <Field label="颜色">
	                    <input value={form.color} onChange={(event) => onChange({ color: event.target.value })} className="input-field" placeholder="颜色" />
	                  </Field>
	                  <Field label="规格">
	                    <input value={form.spec} onChange={(event) => onChange({ spec: event.target.value })} className="input-field" placeholder="如：dn25*20" />
	                  </Field>
	                  <Field label="单位">
	                    <input value={form.unit} onChange={(event) => onChange({ unit: event.target.value })} className="input-field" placeholder="米、个、片、套" />
	                  </Field>
	                </>
	              )}
            </div>
          </EditorSection>

          {isProduct && (
            <EditorSection title="分类属性">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="套餐类别">
                  <input
                    value={productAttributes["套餐类别"] || ""}
                    onChange={(event) => updateProductAttribute("套餐类别", event.target.value)}
                    className="input-field"
                    placeholder="如：标准套餐、升级套餐"
                  />
                </Field>
                <Field label="税率">
                  <input
                    value={productAttributes["税率"] || ""}
                    onChange={(event) => updateProductAttribute("税率", normalizeDecimalInput(event.target.value))}
                    className="input-field"
                    inputMode="decimal"
                    placeholder="如：13"
                  />
                </Field>
                <Field label="产地">
                  <input
                    value={productAttributes["产地"] || productAttributes["原产地"] || ""}
                    onChange={(event) => updateProductAttribute("产地", event.target.value)}
                    className="input-field"
                    placeholder="如：佛山、广东"
                  />
                </Field>
                {productExtraAttributeLabels.map((label) => (
                  <Field key={label} label={label}>
                    <input
                      value={productAttributes[label] || ""}
                      onChange={(event) => updateProductAttribute(label, event.target.value)}
                      className="input-field"
                      placeholder={`填写${label}`}
                    />
                  </Field>
                ))}
              </div>
            </EditorSection>
          )}

	          {isProduct ? (
	            <EditorSection title="规格与价格">
	              <div className="overflow-hidden rounded-lg border border-surface-200">
	                <div className="grid grid-cols-[1.1fr_0.8fr_0.75fr_0.48fr_0.62fr_0.62fr_0.62fr_0.62fr_64px] items-center gap-2 border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-500">
	                  <span>规格名称</span>
	                  <span>规格</span>
	                  <span>颜色/属性</span>
	                  <span>单位</span>
	                  <span>市场价</span>
	                  <span>客户价</span>
	                  <span>采购价</span>
	                  <span>内控价</span>
	                  <span className="text-center">操作</span>
	                </div>
	                <div className="divide-y divide-surface-100 bg-white">
	                  {form.skus.map((sku, index) => (
	                    <div key={sku.id || index} className={cn("grid grid-cols-[1.1fr_0.8fr_0.75fr_0.48fr_0.62fr_0.62fr_0.62fr_0.62fr_64px] items-center gap-2 px-3 py-2.5", !sku.is_active && "bg-surface-50/70 opacity-70")}>
	                      <input value={sku.sku_name} onChange={(event) => updateSku(index, { sku_name: event.target.value })} className="input-field min-h-9" placeholder="如：800x800亮光" />
	                      <input value={sku.spec} onChange={(event) => updateSku(index, { spec: event.target.value })} className="input-field min-h-9" placeholder="规格" />
	                      <input value={sku.color} onChange={(event) => updateSku(index, { color: event.target.value })} className="input-field min-h-9" placeholder="可不填" />
	                      <input value={sku.unit} onChange={(event) => updateSku(index, { unit: event.target.value })} className="input-field min-h-9" placeholder="片" />
	                      <input value={sku.market_price} onChange={(event) => updateSku(index, { market_price: normalizeDecimalInput(event.target.value) })} className="input-field min-h-9 text-right text-surface-700" inputMode="decimal" placeholder="0.00" />
	                      <input value={sku.unit_price} onChange={(event) => updateSku(index, { unit_price: normalizeDecimalInput(event.target.value) })} className="input-field min-h-9 text-right font-semibold text-red-600" inputMode="decimal" placeholder="0.00" />
	                      <input value={sku.cost_price} onChange={(event) => updateSku(index, { cost_price: normalizeDecimalInput(event.target.value) })} className="input-field min-h-9 text-right" inputMode="decimal" placeholder="0.00" />
	                      <input value={sku.internal_control_price} onChange={(event) => updateSku(index, { internal_control_price: normalizeDecimalInput(event.target.value) })} className="input-field min-h-9 text-right" inputMode="decimal" placeholder="0.00" />
	                      <div className="flex items-center justify-center gap-1">
	                        <button type="button" onClick={() => updateSku(index, { is_active: !sku.is_active })} className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", sku.is_active ? "bg-emerald-50 text-emerald-700" : "bg-surface-100 text-surface-500")}>
	                          {sku.is_active ? "启用" : "停用"}
	                        </button>
	                        <button type="button" onClick={() => removeSku(index)} disabled={form.skus.length <= 1} className="rounded-md p-1.5 text-surface-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35" title="删除规格">
	                          <Trash2 className="h-3.5 w-3.5" />
	                        </button>
	                      </div>
	                    </div>
	                  ))}
	                </div>
	              </div>
	              <button type="button" onClick={addSku} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 text-xs font-semibold text-surface-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700">
	                <Plus className="h-3.5 w-3.5" />
	                新增规格
	              </button>
	            </EditorSection>
	          ) : (
	            <EditorSection title="价格信息">
	              <div className="grid gap-3 md:grid-cols-2">
	                <Field label="入库价">
	                  <input
	                    value={form.cost_price}
	                    onChange={(event) => onChange({ cost_price: normalizeDecimalInput(event.target.value) })}
	                    className="input-field"
	                    inputMode="decimal"
	                    placeholder="0.00"
	                  />
	                </Field>
	                <Field label="出库价">
	                  <input
	                    value={form.unit_price}
	                    onChange={(event) => onChange({ unit_price: normalizeDecimalInput(event.target.value) })}
	                    className="input-field"
	                    inputMode="decimal"
	                    placeholder="0.00"
	                  />
	                </Field>
	              </div>
	              <div className="mt-3 grid gap-3 rounded-lg border border-surface-200 bg-surface-50/80 p-3 text-sm md:grid-cols-[1fr_1fr_2fr]">
	                <div>
	                  <p className="text-xs font-semibold text-surface-500">当前库存</p>
	                  <p className="mt-1 font-semibold tabular-nums text-surface-900">{formatQuantityText(form.stock)} {form.unit || ""}</p>
	                </div>
	                <div>
	                  <p className="text-xs font-semibold text-surface-500">预警库存</p>
	                  <p className="mt-1 font-semibold tabular-nums text-surface-900">{formatQuantityText(form.min_stock)} {form.unit || ""}</p>
	                </div>
	                <div className="text-xs leading-5 text-surface-500">
	                  库存数量不能在材料库直接修改，请到「材料管理 / 库存管理」中调整，系统会自动记录出入库流水。
	                </div>
	              </div>
	            </EditorSection>
	          )}

          {isProduct && (
            <EditorSection title="商品详情">
              <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
                <Field label="商品卖点">
                  <textarea
                    value={form.product_highlights}
                    onChange={(event) => onChange({ product_highlights: event.target.value })}
                    className="input-field min-h-[96px] resize-none py-2"
                    placeholder="一行一个卖点，例如：防滑耐磨、易清洁、适合厨卫空间"
                  />
                </Field>
                <Field label="详情说明">
                  <textarea
                    value={form.product_detail}
                    onChange={(event) => onChange({ product_detail: event.target.value })}
                    className="input-field min-h-[96px] resize-none py-2"
                    placeholder="填写商品详情、适用场景、安装说明、售后说明等"
                  />
                </Field>
              </div>
            </EditorSection>
          )}

          <EditorSection title="供应与结算">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="供应商" required>
                <SystemSelect value={form.supplier_id} onChange={(event) => updateSupplier(event.target.value)} className="input-field">
                  <option value="">请选择供应商</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </SystemSelect>
              </Field>
              <Field label="负责人">
                <input
                  value={form.owner_name}
                  onChange={(event) => onChange({ owner_name: event.target.value })}
                  className={cn("input-field", hasSupplier && "cursor-not-allowed bg-surface-100 text-surface-500")}
                  placeholder="材料负责人/仓库负责人"
                  disabled={hasSupplier}
                />
              </Field>
              <Field label="结算周期">
                <SystemSelect
                  value={form.settlement_cycle}
                  onChange={(event) => onChange({ settlement_cycle: event.target.value })}
                  className={cn("input-field", hasSupplier && "cursor-not-allowed bg-surface-100 text-surface-500")}
                  disabled={hasSupplier}
                >
                  {Object.entries(settlementCycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </SystemSelect>
              </Field>
            </div>
            {hasSupplier && (
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                已选择供应商，负责人和结算周期将自动同步供应商资料；如需修改，请到供应商管理中维护，或先清空供应商后手动填写。
              </p>
            )}
          </EditorSection>

          <EditorSection title="备注">
            <textarea value={form.remark} onChange={(event) => onChange({ remark: event.target.value })} className="input-field min-h-[86px] resize-none py-2" placeholder="配送、对账、替代品、使用限制等" />
          </EditorSection>
        </div>

        <footer className="materials-modal-footer flex items-center justify-end gap-2 border-t border-surface-200 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>取消</button>
          <button type="button" onClick={onSubmit} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}

export function PriceHistoryPreview({ material, type, x, y }: { material: Material; type: "cost" | "sale"; x: number; y: number }) {
  const key = type === "cost" ? "cost_price" : "unit_price";
  const isProduct = (material.material_type || "AUXILIARY") === "MAIN";
  const title = type === "cost" ? (isProduct ? "采购价走势" : "入库价走势") : (isProduct ? "客户价走势" : "出库价走势");
  const accent = type === "cost" ? "#2563EB" : "#DC2626";
  const fallbackValue = type === "cost" ? material.cost_price : material.unit_price;
  const rawHistory = (material.price_history || [])
    .filter((point) => {
      const changedFields = String(point.changed_fields || "")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
      return changedFields.length === 0 || changedFields.includes(key);
    })
    .map((point) => ({
      value: Number(point[key] ?? 0),
      date: point.changed_at || "",
      changedByName: point.changed_by_name || (point.source === "initial" ? "系统初始化" : "未知"),
    }))
    .filter((point) => Number.isFinite(point.value));
  const history = rawHistory.filter((point, index, list) => index === 0 || point.value !== list[index - 1].value);
  const points = history.length > 0 ? history.slice(-5) : [{ value: Number(fallbackValue || 0), date: material.updated_at || "", changedByName: "当前记录" }];
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 260;
  const height = 86;
  const paddingX = 12;
  const paddingY = 10;
  const chartPoints = points.map((point, index) => {
    const px = points.length === 1 ? width / 2 : paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
    const py = height - paddingY - ((point.value - min) / range) * (height - paddingY * 2);
    return { ...point, x: px, y: py };
  });
  const path = chartPoints.reduce((result, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previousPoint = chartPoints[index - 1];
    const controlDistance = (point.x - previousPoint.x) / 2;
    return `${result} C ${(previousPoint.x + controlDistance).toFixed(1)} ${previousPoint.y.toFixed(1)}, ${(point.x - controlDistance).toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");
  const current = values[values.length - 1] || 0;
  const previous = values.length > 1 ? values[values.length - 2] : current;
  const diff = current - previous;
  const trendText = diff === 0 ? "持平" : `${diff > 0 ? "+" : ""}${formatAmount(diff)}`;
  const startDate = points[0]?.date ? formatBeijingDate(points[0].date) || "起始" : "起始";
  const endDate = points[points.length - 1]?.date ? formatBeijingDate(points[points.length - 1].date) || "当前" : "当前";
  const recentPoints = [...points].slice(-5).reverse();

  return (
    <div
      className="pointer-events-none fixed z-[75] w-[412px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]"
      style={{
        left: Math.min(x + 18, (typeof window === "undefined" ? 1200 : window.innerWidth) - 432),
        top: Math.min(y + 18, (typeof window === "undefined" ? 900 : window.innerHeight) - 380),
      }}
    >
      <div className="border-b border-surface-200 bg-surface-50/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-surface-900">{title}</p>
            <p className="mt-0.5 truncate text-xs text-surface-500">{material.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-surface-900">{formatAmount(current)}</p>
            <p className={cn("mt-0.5 text-xs font-semibold", diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-surface-500")}>
              {trendText}
            </p>
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[86px] w-full">
          <line x1="0" y1={height - 10} x2={width} y2={height - 10} stroke="#E5E7EB" strokeWidth="1" />
          <line x1="0" y1="10" x2={width} y2="10" stroke="#F1F5F9" strokeWidth="1" />
          <path d={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {chartPoints.map((point, index) => (
            <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r={index === chartPoints.length - 1 ? 3.5 : 2.5} fill="#fff" stroke={accent} strokeWidth="2" />
          ))}
        </svg>
        <div className="mt-2 flex items-center justify-between text-xs font-medium text-surface-500">
          <span>{startDate}</span>
          <span>{points.length} 次记录</span>
          <span>{endDate}</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-surface-200 bg-surface-50/70">
          <div className="grid grid-cols-[132px_64px_72px_68px] items-center gap-1.5 border-b border-surface-200 px-3 py-1.5 text-[11px] font-semibold text-surface-400">
            <span>时间</span>
            <span>修改人</span>
            <span className="text-right">价格</span>
            <span className="text-right">变化</span>
          </div>
          {recentPoints.map((point, index) => {
            const originalIndex = points.length - 1 - index;
            const previousPoint = points[originalIndex - 1];
            const itemDiff = previousPoint ? point.value - previousPoint.value : 0;
            return (
              <div key={`${point.date}-${index}`} className={cn("grid grid-cols-[132px_64px_72px_68px] items-center gap-1.5 px-3 py-2 text-xs", index > 0 && "border-t border-surface-200")}>
                <span className="whitespace-nowrap font-medium tabular-nums text-surface-500">{point.date ? formatBeijingDateTime(point.date) || "当前记录" : "当前记录"}</span>
                <span className="min-w-0 truncate text-surface-600">{point.changedByName}</span>
                <span className="shrink-0 text-right font-semibold text-surface-900">{formatAmount(point.value)}</span>
                <span className={cn("shrink-0 text-right font-semibold", itemDiff > 0 ? "text-red-600" : itemDiff < 0 ? "text-emerald-600" : "text-surface-400")}>
                  {previousPoint ? (itemDiff === 0 ? "持平" : `${itemDiff > 0 ? "+" : ""}${formatAmount(itemDiff)}`) : "起始"}
                </span>
              </div>
            );
          })}
        </div>
        {points.length <= 1 && (
          <p className="mt-2 rounded-md bg-surface-50 px-2 py-1.5 text-xs text-surface-500">暂无更多历史变动，后续修改价格会自动记录。</p>
        )}
      </div>
    </div>
  );
}

export function MaterialImportDialog({
  saving,
  message,
  errors,
  fileName,
  inputRef,
  onClose,
  onDownloadTemplate,
  onImport,
}: {
  saving: boolean;
  message: string;
  errors: ImportErrorItem[];
  fileName: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onImport: (file: File) => void;
}) {
  const isError = /失败|请|缺少|没有/.test(message);
  return (
    <div className="materials-overlay fixed inset-y-0 right-0 z-40 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/18 px-5 py-6 max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭" />
      <div className="materials-modal-shell materials-import-modal relative flex max-h-[88vh] w-full max-w-[920px] flex-col overflow-hidden border border-surface-200 bg-white">
        <header className="materials-modal-header flex min-h-16 items-center justify-between border-b border-surface-200 bg-surface-50/70 px-5">
          <div>
            <p className="text-base font-semibold text-surface-900">导入材料</p>
            <p className="mt-0.5 text-xs text-surface-500">先下载模板填写，再上传 Excel；材料名称会按品牌、品名、型号、颜色、规格自动生成。</p>
          </div>
          <button type="button" onClick={onClose} className="materials-icon-button p-2 text-surface-400 hover:bg-white hover:text-surface-700" aria-label="关闭材料导入">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="grid gap-0 md:grid-cols-[250px_1fr]">
          <aside className="border-b border-surface-200 bg-surface-50/60 p-5 md:border-b-0 md:border-r">
            <div className="rounded-lg border border-primary-100 bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <FileDown className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-surface-900">材料导入模板</p>
              <p className="mt-1 text-xs leading-5 text-surface-500">模板为空白表格，分类和供应商可直接下拉选择。</p>
              <button type="button" onClick={onDownloadTemplate} className="btn-secondary mt-4 w-full justify-center">
                <FileDown className="h-4 w-4" />
                下载模板
              </button>
            </div>
          </aside>
          <main className="space-y-4 p-5">
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg bg-surface-50 p-3">
                <p className="font-semibold text-surface-900">文件格式</p>
                <p className="mt-1 text-xs leading-5 text-surface-500">仅支持 Excel `.xlsx`。</p>
              </div>
              <div className="rounded-lg bg-surface-50 p-3">
                <p className="font-semibold text-surface-900">必填字段</p>
                <p className="mt-1 text-xs leading-5 text-surface-500">材料类别、供应商、品名必填。</p>
              </div>
              <div className="rounded-lg bg-surface-50 p-3">
                <p className="font-semibold text-surface-900">重复处理</p>
                <p className="mt-1 text-xs leading-5 text-surface-500">优先按材料编码更新，未填编码则按材料名称、品牌、品名、型号、颜色、规格匹配。</p>
              </div>
            </div>
            <div className="space-y-2 text-xs leading-5 text-surface-600">
              <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />模板不会填充默认材料数据，下载后从第二行开始录入。</p>
              <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />材料类别只支持已启用的二级分类，没有二级分类的一级分类不会进入下拉。</p>
              <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />供应商需要先在供应商管理中维护，负责人和结算周期会按供应商自动带出。</p>
            </div>
            <section className="rounded-lg border border-dashed border-primary-200 bg-primary-50/35 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-surface-900">选择已填写的材料 Excel</p>
                  <p className="mt-1 text-xs text-surface-500">{fileName || "请上传按模板填写后的 .xlsx 文件"}</p>
                </div>
                <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary justify-center" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  选择文件并导入
                </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onImport(file);
                }}
              />
              {message && (
                <div className={cn(
                  "mt-3 rounded-lg px-3 py-2 text-xs font-semibold",
                  isError ? "bg-red-50 text-red-600 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                )}>
                  {message}
                </div>
              )}
              {errors.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-red-200 bg-white">
                  <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-3 py-2">
                    <p className="text-xs font-semibold text-red-700">失败原因</p>
                    <span className="text-xs font-medium text-red-500">{errors.length} 条</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {errors.map((item) => (
                      <div key={`${item.rowNumber}-${item.name}`} className="grid grid-cols-[64px_1fr_1.4fr] gap-3 border-b border-surface-100 px-3 py-2 text-xs last:border-b-0">
                        <span className="font-semibold text-surface-700">{item.rowNumber > 0 ? `第 ${item.rowNumber} 行` : "文件"}</span>
                        <span className="min-w-0 truncate text-surface-700">{item.name || "-"}</span>
                        <span className="text-red-600">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>
        <footer className="materials-modal-footer flex items-center justify-end gap-2 border-t border-surface-200 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>关闭</button>
        </footer>
      </div>
    </div>
  );
}

export function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="materials-form-section space-y-3 border border-surface-200 bg-surface-50/50 p-4">
      <p className="text-sm font-semibold text-surface-900">{title}</p>
      {children}
    </section>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-surface-600">
        {label}
        {required && <b className="font-semibold text-red-500">*</b>}
      </span>
      {children}
    </label>
  );
}
