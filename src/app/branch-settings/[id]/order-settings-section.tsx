// 分公司设置-下单设置区块组件
// 从 page.tsx 渐进拆出的辅材下单模板配置区块。

"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Package, Plus, Search, Trash2 } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";
import SystemSelect from "@/components/ui/SystemSelect";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import { cn } from "@/lib/utils";
import type { OrderTemplate, OrderTemplateItem } from "@/lib/branchSettings";
import {
  BranchMaterialOption,
  BranchSupplierOption,
  formatQuantity,
  getMaterialImage,
  getMaterialSpec,
  makeLocalId,
} from "./branch-settings-approval-shared";
export function OrderSettingsSection({
  templates,
  materials,
  suppliers,
  onTemplatesChange,
}: {
  templates: OrderTemplate[];
  materials: BranchMaterialOption[];
  suppliers: BranchSupplierOption[];
  onTemplatesChange: (templates: OrderTemplate[]) => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || "");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("all");
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string; spec: string; x: number; y: number } | null>(null);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;

  useEffect(() => {
    if (selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId(templates[0]?.id || "");
  }, [selectedTemplateId, templates]);

  const materialMap = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const selectedItemIds = useMemo(() => new Set(selectedTemplate?.items.map((item) => item.materialId) || []), [selectedTemplate]);
  const templateMaterials = useMemo(() => {
    if (!selectedTemplate) return [];
    return materials.filter((material) => !selectedTemplate.warehouseSupplierId || material.supplier_id === selectedTemplate.warehouseSupplierId);
  }, [materials, selectedTemplate]);
  const materialCategories = useMemo(() => {
    const counts = templateMaterials.reduce<Record<string, number>>((result, material) => {
      const category = material.category_name || "未分类";
      result[category] = (result[category] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [templateMaterials]);
  const filteredMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();
    return templateMaterials.filter((material) => {
      if (materialCategoryFilter !== "all" && (material.category_name || "未分类") !== materialCategoryFilter) return false;
      if (!keyword) return true;
      const text = [
        material.code,
        material.name,
        material.brand,
        material.product_name,
        material.material_model,
        material.color,
        material.spec,
        material.unit,
        material.category_name,
        material.supplier_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(keyword);
    }).slice(0, 80);
  }, [materialCategoryFilter, materialSearch, templateMaterials]);

  const updateTemplate = (templateId: string, patch: Partial<OrderTemplate>) => {
    onTemplatesChange(templates.map((template) => template.id === templateId ? { ...template, ...patch } : template));
  };

  const addTemplate = () => {
    const nextTemplate: OrderTemplate = {
      id: makeLocalId("ORDER_TEMPLATE"),
      name: `辅材下单模板 ${templates.length + 1}`,
      warehouseSupplierId: suppliers[0]?.id || "",
      isEnabled: true,
      items: [],
    };
    onTemplatesChange([...templates, nextTemplate]);
    setSelectedTemplateId(nextTemplate.id);
    setMaterialSearch("");
    setMaterialCategoryFilter("all");
  };

  const duplicateTemplate = (template: OrderTemplate) => {
    const nextTemplate: OrderTemplate = {
      ...template,
      id: makeLocalId("ORDER_TEMPLATE"),
      name: `${template.name} 副本`,
      items: template.items.map((item) => ({ ...item, id: makeLocalId("ORDER_TEMPLATE_ITEM") })),
    };
    onTemplatesChange([...templates, nextTemplate]);
    setSelectedTemplateId(nextTemplate.id);
    setMaterialSearch("");
    setMaterialCategoryFilter("all");
  };

  const removeTemplate = (templateId: string) => {
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    onTemplatesChange(nextTemplates);
    setSelectedTemplateId(nextTemplates[0]?.id || "");
    setMaterialSearch("");
    setMaterialCategoryFilter("all");
  };

  const addMaterialToTemplate = (material: BranchMaterialOption) => {
    if (!selectedTemplate || selectedItemIds.has(material.id)) return;
    const nextItem: OrderTemplateItem = {
      id: makeLocalId("ORDER_TEMPLATE_ITEM"),
      materialId: material.id,
      defaultQuantity: 0,
      remark: "",
    };
    updateTemplate(selectedTemplate.id, { items: [...selectedTemplate.items, nextItem] });
  };

  const updateTemplateItem = (itemId: string, patch: Partial<OrderTemplateItem>) => {
    if (!selectedTemplate) return;
    updateTemplate(selectedTemplate.id, {
      items: selectedTemplate.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    });
  };

  const removeTemplateItem = (itemId: string) => {
    if (!selectedTemplate) return;
    updateTemplate(selectedTemplate.id, {
      items: selectedTemplate.items.filter((item) => item.id !== itemId),
    });
  };

  const showMaterialImagePreview = (event: React.MouseEvent, image: string, material: BranchMaterialOption) => {
    if (!image) return;
    setImagePreview({
      src: image,
      name: material.name,
      spec: getMaterialSpec(material),
      x: event.clientX,
      y: event.clientY,
    });
  };

  return (
    <>
	    <div className="branch-settings-panel branch-order-workbench space-y-4 rounded-lg border border-surface-200/90 bg-white/95 p-4 shadow-[0_10px_24px_rgba(31,41,53,0.035)]">
	      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	        <div className="flex min-w-0 gap-3">
	          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
	            <Package className="h-4 w-4" />
	          </span>
	          <div className="min-w-0">
	            <p className="font-semibold text-surface-900">下单设置</p>
	            <p className="mt-0.5 text-xs leading-5 text-surface-500">维护辅材常用下单模板，实际下单时可一键带入材料清单。</p>
	          </div>
	        </div>
	        <button type="button" onClick={addTemplate} className="btn-secondary shrink-0">
	          <Plus className="h-4 w-4" />
	          新增模板
	        </button>
	      </div>

	      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
	        <aside className="rounded-lg border border-[#dce8f8] bg-white p-3">
	          <div className="mb-3 flex items-center justify-between gap-3">
	            <p className="text-sm font-semibold text-surface-900">模板</p>
	            <span className="text-xs font-semibold text-surface-500">{templates.length} 套</span>
	          </div>
	          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
	            {templates.map((template) => {
	              const active = selectedTemplate?.id === template.id;
	              const warehouse = template.warehouseSupplierId ? supplierMap.get(template.warehouseSupplierId)?.name : "未指定仓库";
	              return (
	                <button
	                  key={template.id}
	                  type="button"
	                  onClick={() => {
	                    setSelectedTemplateId(template.id);
	                    setMaterialSearch("");
	                    setMaterialCategoryFilter("all");
	                  }}
	                  className={cn(
	                    "relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left shadow-none transition-colors",
	                    active ? "border-[#dce8f8] bg-white" : "border-transparent bg-white hover:border-[#dce8f8] hover:bg-[#f8fbff]",
	                  )}
	                >
	                  {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-[#407AFF]" />}
	                  <div className="flex items-center justify-between gap-2">
	                    <span className="min-w-0 truncate text-sm font-semibold text-surface-900" title={template.name}>{template.name}</span>
	                    <span className={cn(
	                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
	                      template.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-surface-100 text-surface-500",
	                    )}>
	                      {template.isEnabled ? "启用" : "停用"}
	                    </span>
	                  </div>
	                  <p className="mt-1 truncate text-xs text-surface-500" title={warehouse}>{warehouse} · {template.items.length} 项材料</p>
	                </button>
	              );
	            })}
            {templates.length === 0 && (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-white px-4 text-center">
                <Package className="mb-3 h-9 w-9 text-surface-300" />
                <p className="text-sm font-semibold text-surface-700">暂无下单模板</p>
                <p className="mt-1 text-xs text-surface-400">点击右上角新增模板后维护常用材料。</p>
              </div>
            )}
          </div>
        </aside>

        {selectedTemplate ? (
          <main className="min-w-0 space-y-4">
            <section className="rounded-lg border border-surface-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.9fr)_120px_96px_88px] md:items-end">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-surface-600">模板名称</span>
                  <input
                    value={selectedTemplate.name}
                    onChange={(event) => updateTemplate(selectedTemplate.id, { name: event.target.value })}
                    className="input-field min-h-10 py-2"
                    placeholder="例如：水电开工常用辅材"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-surface-600">适用仓库</span>
                  <SystemSelect
                    value={selectedTemplate.warehouseSupplierId}
                    onChange={(event) => {
                      const nextWarehouseId = event.target.value;
                      updateTemplate(selectedTemplate.id, {
                        warehouseSupplierId: nextWarehouseId,
                        items: selectedTemplate.items.filter((item) => materialMap.get(item.materialId)?.supplier_id === nextWarehouseId),
                      });
                      setMaterialSearch("");
                      setMaterialCategoryFilter("all");
                    }}
                    className="input-field min-h-10 py-2"
                  >
                    <option value="">请选择仓库</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </SystemSelect>
                </label>
                <button
                  type="button"
                  onClick={() => updateTemplate(selectedTemplate.id, { isEnabled: !selectedTemplate.isEnabled })}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors",
                    selectedTemplate.isEnabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-surface-200 bg-surface-50 text-surface-500"
                  )}
                >
                  {selectedTemplate.isEnabled ? "已启用" : "已停用"}
                </button>
                <button type="button" onClick={() => duplicateTemplate(selectedTemplate)} className="btn-secondary min-h-10 justify-center px-3">
                  <Copy className="h-4 w-4" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => removeTemplate(selectedTemplate.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-lg border border-surface-300 bg-white">
                <div className="flex items-center justify-between border-b border-surface-300 bg-surface-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">模板材料</p>
                    <p className="mt-0.5 text-xs text-surface-500">套用模板后，材料会带入订单，数量默认从这里读取。</p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-surface-500">{selectedTemplate.items.length} 项</span>
                </div>
                <ThinScrollArea>
                  <table className="w-full min-w-[840px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[72px]" />
                      <col />
                      <col className="w-[120px]" />
                      <col className="w-[92px]" />
                      <col className="w-[108px]" />
                      <col className="w-[150px]" />
                      <col className="w-[58px]" />
                    </colgroup>
                    <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
                      <tr className="border-b border-surface-300">
                        <th className="px-3 py-2.5 text-center">图片</th>
                        <th className="px-3 py-2.5 text-left">材料</th>
                        <th className="px-3 py-2.5 text-center">编码</th>
                        <th className="px-3 py-2.5 text-center">单位</th>
                        <th className="px-3 py-2.5 text-right">默认数量</th>
                        <th className="px-3 py-2.5 text-left">备注</th>
                        <th className="px-3 py-2.5 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-200 bg-white">
                      {selectedTemplate.items.map((item) => {
                        const material = materialMap.get(item.materialId);
                        const image = getMaterialImage(material);
                        return (
                          <tr key={item.id}>
                            <td className="px-3 py-2.5 text-center align-middle">
                              <div className="mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                                {image && material ? (
                                  <NativeImage
                                    src={image}
                                    alt={material.name}
                                    className="h-full w-full cursor-zoom-in object-cover"
                                    onMouseEnter={(event) => showMaterialImagePreview(event, image, material)}
                                    onMouseMove={(event) => showMaterialImagePreview(event, image, material)}
                                    onMouseLeave={() => setImagePreview(null)}
                                  />
                                ) : (
                                  <Package className="h-5 w-5 text-surface-300" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              <p className="truncate font-semibold text-surface-900" title={material?.name || ""}>{material?.name || "材料不存在或已下架"}</p>
                              <p className="mt-1 truncate text-xs text-surface-500" title={material ? getMaterialSpec(material) : ""}>
                                {material?.category_name || "未分类"}{material ? ` · ${getMaterialSpec(material) || "未填写规格"}` : ""}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-center align-middle text-surface-600">{material?.code || "-"}</td>
                            <td className="px-3 py-2.5 text-center align-middle text-surface-600">{material?.unit || "-"}</td>
                            <td className="px-3 py-2.5 align-middle">
                              <input
                                value={String(item.defaultQuantity ?? 0)}
                                onChange={(event) => updateTemplateItem(item.id, { defaultQuantity: Math.max(0, Number(event.target.value || 0)) })}
                                className="input-field min-h-9 py-1.5 text-right"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              <input
                                value={item.remark}
                                onChange={(event) => updateTemplateItem(item.id, { remark: event.target.value })}
                                className="input-field min-h-9 py-1.5"
                                placeholder="备注"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-center align-middle">
                              <button type="button" onClick={() => removeTemplateItem(item.id)} className="rounded p-1.5 text-surface-400 hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {selectedTemplate.items.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-16 text-center text-sm text-surface-400">
                            右侧搜索材料并加入模板
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </ThinScrollArea>
              </div>

              <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-surface-300 bg-white">
                <div className="border-b border-surface-300 bg-surface-100 px-4 py-3">
                  <p className="text-sm font-semibold text-surface-900">添加材料</p>
                  <p className="mt-0.5 text-xs text-surface-500">
                    {selectedTemplate.warehouseSupplierId ? `当前仓库 ${templateMaterials.length} 项可选` : "请先选择适用仓库"}
                  </p>
                </div>
                <div className="border-b border-surface-200 p-3">
                  <div className="space-y-2">
                    <label className="block">
                      <span className="sr-only">材料分类</span>
                      <SystemSelect
                        value={materialCategoryFilter}
                        onChange={(event) => setMaterialCategoryFilter(event.target.value)}
                        className="input-field min-h-10 py-2 text-sm"
                        disabled={!selectedTemplate.warehouseSupplierId}
                      >
                        <option value="all">全部分类（{templateMaterials.length}）</option>
                        {materialCategories.map((category) => (
                          <option key={category.name} value={category.name}>
                            {category.name}（{category.count}）
                          </option>
                        ))}
                      </SystemSelect>
                    </label>
                    <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                    <input
                      value={materialSearch}
                      onChange={(event) => setMaterialSearch(event.target.value)}
                      className="input-field min-h-10 pl-9"
                      placeholder="搜索材料名称、编码、规格"
                      disabled={!selectedTemplate.warehouseSupplierId}
                    />
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {filteredMaterials.length > 0 ? (
                    <div className="space-y-2">
                      {filteredMaterials.map((material) => {
                        const added = selectedItemIds.has(material.id);
                        const image = getMaterialImage(material);
                        return (
                          <button
                            key={material.id}
                            type="button"
                            onClick={() => addMaterialToTemplate(material)}
                            className={cn(
                              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                              added ? "border-primary-100 bg-primary-50/70" : "border-surface-200 bg-white hover:border-primary-200 hover:bg-primary-50/40"
                            )}
                            disabled={added}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-1 gap-2.5">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                                  {image ? (
                                    <NativeImage
                                      src={image}
                                      alt={material.name}
                                      className="h-full w-full cursor-zoom-in object-cover"
                                      onMouseEnter={(event) => showMaterialImagePreview(event, image, material)}
                                      onMouseMove={(event) => showMaterialImagePreview(event, image, material)}
                                      onMouseLeave={() => setImagePreview(null)}
                                      onClick={(event) => event.stopPropagation()}
                                    />
                                  ) : (
                                    <Package className="h-5 w-5 text-surface-300" />
                                  )}
                                </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-surface-900" title={material.name}>{material.name}</p>
                                <p className="mt-1 truncate text-xs text-surface-500" title={getMaterialSpec(material)}>
                                  {material.category_name || "未分类"} · {getMaterialSpec(material) || "未填写规格"}
                                </p>
                                <p className="mt-1 text-xs tabular-nums text-surface-400">
                                  库存 {formatQuantity(material.stock)} {material.unit || ""}
                                </p>
                              </div>
                              </div>
                              <span className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                                added ? "bg-primary-600 text-white" : "bg-surface-100 text-surface-500"
                              )}>
                                {added ? "已加" : "加入"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 text-center">
                      <Search className="mb-3 h-8 w-8 text-surface-300" />
                      <p className="text-sm font-medium text-surface-600">{selectedTemplate.warehouseSupplierId ? "没有找到材料" : "未选择仓库"}</p>
                      <p className="mt-1 text-xs text-surface-400">{selectedTemplate.warehouseSupplierId ? "换个关键词试试" : "先在模板信息中选择适用仓库"}</p>
                    </div>
                  )}
                </div>
              </aside>
            </section>
          </main>
        ) : (
          <main className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-surface-300 bg-white text-center text-surface-400">
            <div>
              <Package className="mx-auto mb-3 h-10 w-10 text-surface-300" />
              <p className="text-sm font-semibold text-surface-700">先创建一个下单模板</p>
            </div>
          </main>
        )}
      </div>
    </div>
    {imagePreview && (
      <div
        className="pointer-events-none fixed z-[90] w-[240px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]"
        style={{
          left: Math.min(imagePreview.x + 18, (typeof window === "undefined" ? 1200 : window.innerWidth) - 260),
          top: Math.min(imagePreview.y + 18, (typeof window === "undefined" ? 900 : window.innerHeight) - 300),
        }}
      >
        <div className="aspect-square bg-surface-50">
          <NativeImage src={imagePreview.src} alt={imagePreview.name} className="h-full w-full object-contain" loading="eager" />
        </div>
        <div className="border-t border-surface-200 px-3 py-2">
          <p className="truncate text-xs font-semibold text-surface-900">{imagePreview.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs font-medium text-surface-500">{imagePreview.spec || "未填写规格"}</p>
        </div>
      </div>
    )}
    </>
  );
}

