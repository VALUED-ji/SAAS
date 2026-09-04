"use client";

import {
  AdjustMetric,
  HeaderHelp,
} from "./inventory-bits";



import { Suspense, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import { useDataPagination } from "@/components/ui/DataPagination";
import { SystemResourceTable } from "@/components/ui/SystemResourceTable";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";

type Material = {
  id: string;
  code?: string | null;
  name: string;
  brand?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  color?: string | null;
  spec?: string | null;
  unit?: string | null;
  stock?: number | null;
  min_stock?: number | null;
  cost_price?: number | null;
  unit_price?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  warehouse_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  material_type?: string | null;
  supply_mode?: string | null;
  image?: string | null;
  images?: string[] | string | null;
  is_active?: number | null;
  updated_at?: string | null;
};

type Category = {
  id: string;
  name: string;
  parent_id?: string | null;
  parent_name?: string | null;
  is_active?: number | null;
};

type MaterialResponse = {
  materials: Material[];
  categories: Category[];
  suppliers?: Supplier[];
  orderItems?: MaterialOrderItem[];
  stockMovements?: StockMovement[];
};

type Supplier = {
  id: string;
  name: string;
  is_active?: number | null;
};

type AdjustmentForm = {
  stock: string;
  min_stock: string;
  reason: string;
  remark: string;
};

type MaterialOrderItem = {
  material_id: string;
  order_type?: string | null;
  order_status?: string | null;
  quantity?: number | null;
  received_qty?: number | null;
  stock_deducted_qty?: number | null;
};

type StockMovement = {
  id: string;
  material_id: string;
  movement_type?: string | null;
  quantity?: number | null;
  before_stock?: number | null;
  after_stock?: number | null;
  source_type?: string | null;
  source_id?: string | null;
  source_no?: string | null;
  order_no?: string | null;
  operator_name?: string | null;
  reason?: string | null;
  remark?: string | null;
  created_at?: string | null;
};

const warningOptions = [
  { key: "", label: "全部库存" },
  { key: "empty", label: "缺货" },
  { key: "low", label: "库存偏低" },
  { key: "normal", label: "库存正常" },
];

function formatQuantity(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function normalizeNumberInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [integer, ...decimals] = cleaned.split(".");
  return decimals.length > 0 ? `${integer}.${decimals.join("")}` : integer;
}

function normalizeMaterialImages(value?: string[] | string | null, fallback?: string | null) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        })()
      : value
        ? [value]
        : [];
  return Array.from(new Set([...rawValues, fallback || ""].map((item) => String(item || "").trim()).filter(Boolean)));
}

function getStockWarning(material: Material) {
  const stock = Number(material.stock || 0);
  const minStock = Number(material.min_stock || 0);
  if (stock <= 0) return { key: "empty", label: "缺货", className: "bg-red-50 text-red-700 ring-red-200" };
  if (stock <= minStock) return { key: "low", label: "库存偏低", className: "bg-amber-50 text-amber-700 ring-amber-200" };
  return { key: "normal", label: "库存正常", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

function getRemainingQuantity(item: MaterialOrderItem) {
  if (item.order_type === "AUXILIARY_WAREHOUSE") {
    return Math.max(0, Number(item.quantity || 0) - Number(item.stock_deducted_qty || 0));
  }
  return Math.max(0, Number(item.quantity || 0) - Number(item.received_qty || 0));
}

function isActiveOrder(status?: string | null) {
  return ["PENDING", "ORDERED", "PARTIAL"].includes(String(status || ""));
}

function getMovementTypeMeta(type?: string | null) {
  const value = String(type || "").toUpperCase();
  if (value === "IN") return { label: "入库", sign: "+", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (value === "OUT") return { label: "出库", sign: "-", className: "bg-red-50 text-red-700 ring-red-200" };
  return { label: "调整", sign: "", className: "bg-surface-100 text-surface-700 ring-surface-200" };
}

function getSourceTypeLabel(type?: string | null) {
  const value = String(type || "");
  if (value === "manual") return "手动调整";
  if (value === "order") return "订单出库";
  if (value === "order_restore") return "订单恢复";
  if (value === "material_order") return "订单出库";
  if (value === "material_order_cancel") return "订单恢复";
  if (value === "material_inbound") return "采购入库";
  if (value === "material_inbound_cancel") return "入库作废冲回";
  if (value === "purchase") return "采购入库";
  return value || "-";
}

function MaterialInventoryPageContent() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orderItems, setOrderItems] = useState<MaterialOrderItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [warningFilter, setWarningFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [adjustingMaterial, setAdjustingMaterial] = useState<Material | null>(null);
  const [movementMaterial, setMovementMaterial] = useState<Material | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string; x: number; y: number } | null>(null);
  const [form, setForm] = useState<AdjustmentForm>({
    stock: "0",
    min_stock: "0",
    reason: "库存盘点",
    remark: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.get<MaterialResponse>("/api/materials?view=inventory");
      setMaterials(data.materials || []);
      setCategories(data.categories || []);
      setSuppliers(data.suppliers || []);
      setOrderItems(data.orderItems || []);
      setStockMovements(data.stockMovements || []);
    } catch (error: any) {
      setMessage(error?.message || "库存数据加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const activeCategories = useMemo(
    () => categories.filter((category) => Number(category.is_active ?? 1) === 1),
    [categories],
  );

  const supplierOptions = useMemo(() => {
    const byId = new Map<string, Supplier>();
    suppliers
      .filter((supplier) => Number(supplier.is_active ?? 1) === 1)
      .forEach((supplier) => byId.set(supplier.id, supplier));
    materials.forEach((material) => {
      if (!material.supplier_id || byId.has(material.supplier_id) || !material.supplier_name) return;
      byId.set(material.supplier_id, { id: material.supplier_id, name: material.supplier_name });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [materials, suppliers]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((material) => {
      const active = Number(material.is_active ?? 1) === 1;
      if (!active) return false;
      if (supplierFilter && material.supplier_id !== supplierFilter) return false;
      if (warningFilter && getStockWarning(material).key !== warningFilter) return false;
      if (categoryFilter && material.category_id !== categoryFilter) return false;
      if (!q) return true;
      return [
        material.code,
        material.name,
        material.brand,
        material.product_name,
        material.material_model,
        material.color,
        material.spec,
        material.category_name,
        material.supplier_name,
        material.warehouse_name,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [categoryFilter, materials, search, supplierFilter, warningFilter]);
  const materialPagination = useDataPagination(filteredMaterials, [search, supplierFilter, categoryFilter, warningFilter].join("|"));

  const inventoryMetricsByMaterial = useMemo(() => {
    const result: Record<string, { purchaseTransit: number; locked: number }> = {};
    materials.forEach((material) => {
      result[material.id] = {
        purchaseTransit: 0,
        locked: 0,
      };
    });
    orderItems.forEach((item) => {
      if (!item.material_id || !isActiveOrder(item.order_status)) return;
      const current = result[item.material_id];
      if (!current) return;
      const remaining = getRemainingQuantity(item);
      if (remaining <= 0) return;
      if (item.order_type === "AUXILIARY_WAREHOUSE") {
        current.locked += remaining;
      } else {
        current.purchaseTransit += remaining;
      }
    });
    return result;
  }, [materials, orderItems]);

  const selectedMovementRows = useMemo(() => {
    if (!movementMaterial) return [];
    return stockMovements
      .filter((movement) => movement.material_id === movementMaterial.id)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [movementMaterial, stockMovements]);

  const selectedMovementSummary = useMemo(() => {
    return selectedMovementRows.reduce(
      (summary, movement) => {
        const type = String(movement.movement_type || "").toUpperCase();
        const quantity = Number(movement.quantity || 0);
        if (type === "IN") summary.inbound += quantity;
        if (type === "OUT") summary.outbound += quantity;
        return summary;
      },
      { inbound: 0, outbound: 0 },
    );
  }, [selectedMovementRows]);

  const adjustmentPreview = useMemo(() => {
    if (!adjustingMaterial) return null;
    const currentStock = Number(adjustingMaterial.stock || 0);
    const nextStock = Number(form.stock || 0);
    const minStock = Number(form.min_stock || 0);
    const difference = nextStock - currentStock;
    return {
      currentStock,
      nextStock,
      minStock,
      difference,
      movementType: difference > 0 ? "IN" : difference < 0 ? "OUT" : "NONE",
      warning: nextStock <= 0 ? "缺货" : nextStock <= minStock ? "库存偏低" : "库存正常",
    };
  }, [adjustingMaterial, form.min_stock, form.stock]);

  const adjustingMovementRows = useMemo(() => {
    if (!adjustingMaterial) return [];
    return stockMovements
      .filter((movement) => movement.material_id === adjustingMaterial.id)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 5);
  }, [adjustingMaterial, stockMovements]);

  const openAdjust = (material: Material) => {
    setAdjustingMaterial(material);
    setForm({
      stock: formatQuantity(material.stock),
      min_stock: formatQuantity(material.min_stock),
      reason: "库存盘点",
      remark: "",
    });
  };

  const saveAdjustment = async () => {
    if (!adjustingMaterial) return;
    setSaving(true);
    setMessage("");
    try {
      await api.post("/api/materials", {
        action: "adjust_stock",
        id: adjustingMaterial.id,
        stock: Number(form.stock || 0),
        min_stock: Number(form.min_stock || 0),
        reason: form.reason,
        remark: form.remark,
      });
      setMessage("库存已调整");
      setAdjustingMaterial(null);
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "库存调整失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page-surface material-workbench-ui materials-design-ui materials-inventory-ui flex h-full min-h-0 items-center justify-center bg-[#F5F7FB] text-[#6B7280]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary-600" />
        库存数据加载中...
      </div>
    );
  }

  return (
    <div className="app-page-surface material-workbench-ui materials-design-ui materials-inventory-ui flex h-full min-h-0 flex-col gap-3 bg-[#F5F7FB]">
      {message && (
        <div
          className={cn(
            "fixed left-[calc(var(--active-sidebar-width,260px)+((100vw-var(--active-sidebar-width,260px))/2))] top-5 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(15,23,42,0.14)] max-md:left-1/2",
            /失败|缺少|请选择|不能|不存在/.test(message) ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"
          )}
        >
          {/失败|缺少|请选择|不能|不存在/.test(message) ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {message}
        </div>
      )}

      <SystemResourceTable.Panel className="inventory-filter-panel system-status-toolbar-panel shrink-0">
        <div className="system-status-toolbar-actions shrink-0 bg-white px-3 py-3">
          <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full min-w-0 xl:max-w-[480px] xl:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input-field w-full pl-9"
                placeholder="搜索材料编码、名称、品牌、规格、分类或供应商"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SystemSelect value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="input-field min-h-10 w-44 py-2">
                <option value="">全部供应商</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </SystemSelect>
              <SystemSelect value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="input-field min-h-10 w-44 py-2">
                <option value="">全部分类</option>
                {activeCategories.filter((category) => category.parent_id).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.parent_name ? `${category.parent_name} / ${category.name}` : category.name}
                  </option>
                ))}
              </SystemSelect>
              <SystemSelect value={warningFilter} onChange={(event) => setWarningFilter(event.target.value)} className="input-field min-h-10 w-32 py-2">
                {warningOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </SystemSelect>
            </div>
          </div>
        </div>
      </SystemResourceTable.Panel>

      <SystemResourceTable.Panel className="inventory-list-panel flex-1">
        {filteredMaterials.length > 0 ? (
          <>
            <SystemResourceTable.Scroll>
              <SystemResourceTable.Table className="site-list-table">
            <colgroup>
              <col className="w-[19%]" />
              <col className="w-[116px]" />
              <col className="w-[10%]" />
              <col className="w-[64px]" />
              <col className="w-[86px]" />
              <col className="w-[86px]" />
              <col className="w-[118px]" />
              <col className="w-[92px]" />
              <col className="w-[92px]" />
              <col className="w-[104px]" />
              <col className="w-[96px]" />
              <col className="w-[190px]" />
            </colgroup>
            <thead>
              <tr>
                <SystemResourceTable.HeaderCell>材料</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">材料编码</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">分类</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">单位</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="right">入库价</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="right">出库价</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="right">可用库存/预警库存</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">
                  <HeaderHelp label="采购在途" help="下单成功的采购单，发货到仓库的物料数量" />
                </SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">
                  <HeaderHelp label="锁定库存" help="提交下单后系统锁定的库存" />
                </SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">库存状态</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="right">库存金额</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">操作</SystemResourceTable.HeaderCell>
              </tr>
            </thead>
            <tbody>
              {materialPagination.pageItems.map((material) => {
                const warning = getStockWarning(material);
                const image = normalizeMaterialImages(material.images, material.image || "")[0];
                const inventoryMetrics = inventoryMetricsByMaterial[material.id] || {
                  purchaseTransit: 0,
                  locked: 0,
                };
                return (
                  <SystemResourceTable.Row
                    key={material.id}
                    interactive={false}
                  >
                    <SystemResourceTable.Cell>
                      <div className="flex min-w-0 items-center gap-3">
                        {image ? (
                          <NativeImage
                            src={image}
                            alt={material.name}
                            className="h-10 w-10 shrink-0 cursor-zoom-in rounded-lg border border-surface-200 object-cover"
                            onMouseEnter={(event) => setImagePreview({ src: image, name: material.name, x: event.clientX, y: event.clientY })}
                            onMouseMove={(event) => setImagePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                            onMouseLeave={() => setImagePreview(null)}
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-surface-900">{material.name}</p>
                          <p className="mt-0.5 truncate text-xs text-surface-500">
                            {[material.brand, material.product_name, material.material_model, material.color, material.spec].filter(Boolean).join(" / ") || "未填写规格信息"}
                          </p>
                        </div>
                      </div>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center" emphasis className="font-mono text-xs">{material.code || "-"}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">
                      <span className="block truncate" title={material.category_name || ""}>{material.category_name || "-"}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">{material.unit || "-"}</SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="right" emphasis className="tabular-nums">
                      {formatAmount(material.cost_price)}
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="right" emphasis className="tabular-nums">
                      {formatAmount(material.unit_price)}
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="right">
                      <span className={cn("font-semibold tabular-nums", warning.key === "empty" ? "text-red-600" : warning.key === "low" ? "text-amber-700" : "text-surface-900")}>
                        {formatQuantity(material.stock)}
                      </span>
                      <span className="text-xs font-medium text-surface-500">/{formatQuantity(material.min_stock)}</span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">
                      <span className={cn("font-semibold tabular-nums", inventoryMetrics.purchaseTransit > 0 ? "text-primary-700" : "text-surface-500")}>
                        {formatQuantity(inventoryMetrics.purchaseTransit)}
                      </span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">
                      <span className={cn("font-semibold tabular-nums", inventoryMetrics.locked > 0 ? "text-amber-700" : "text-surface-500")}>
                        {formatQuantity(inventoryMetrics.locked)}
                      </span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">
                      <span className={cn("inline-flex min-w-[74px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1", warning.className)}>
                        {warning.label}
                      </span>
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="right" emphasis className="tabular-nums">
                      {formatAmount(Number(material.stock || 0) * Number(material.cost_price || 0))}
                    </SystemResourceTable.Cell>
                    <SystemResourceTable.Cell align="center">
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMovementMaterial(material);
                          }}
                          className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-surface-200 bg-white px-2.5 text-xs font-semibold text-surface-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                        >
                          出入库明细
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openAdjust(material);
                          }}
                          className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-surface-200 bg-white px-2.5 text-xs font-semibold text-surface-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                        >
                          调整库存
                        </button>
                      </div>
                    </SystemResourceTable.Cell>
                  </SystemResourceTable.Row>
                );
              })}
            </tbody>
              </SystemResourceTable.Table>
            </SystemResourceTable.Scroll>
            <SystemResourceTable.Pagination
              total={filteredMaterials.length}
              page={materialPagination.page}
              pageSize={materialPagination.pageSize}
              onPageChange={materialPagination.setPage}
              onPageSizeChange={materialPagination.setPageSize}
              itemName="个材料"
            />
          </>
        ) : (
          <SystemResourceTable.EmptyState icon={<Package />}>
            暂无符合条件的库存材料
          </SystemResourceTable.EmptyState>
        )}
      </SystemResourceTable.Panel>

      {movementMaterial && (
        <div className="materials-overlay fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-950/25 px-6 py-7 max-md:inset-0 max-md:w-full max-md:px-4">
          <div className="materials-modal-shell materials-movement-modal flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden border border-surface-200 bg-white">
            <div className="materials-modal-header flex items-start justify-between border-b border-surface-200 bg-surface-50 px-5 py-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-surface-900">出入库明细</p>
                <p className="mt-1 truncate text-xs text-surface-500">
                  {movementMaterial.name} · {movementMaterial.code || "无编码"} · 当前库存 {formatQuantity(movementMaterial.stock)} {movementMaterial.unit || ""}
                </p>
              </div>
              <button type="button" onClick={() => setMovementMaterial(null)} className="materials-icon-button flex h-9 w-9 shrink-0 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900" aria-label="关闭出入库明细">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="materials-metric-strip grid grid-cols-3 gap-3 border-b border-surface-200 bg-white px-5 py-4">
              <div className="materials-metric border border-surface-200 bg-surface-50/70 px-3 py-2">
                <p className="text-xs font-semibold text-surface-500">累计入库</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">{formatQuantity(selectedMovementSummary.inbound)}</p>
              </div>
              <div className="materials-metric border border-surface-200 bg-surface-50/70 px-3 py-2">
                <p className="text-xs font-semibold text-surface-500">累计出库</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-red-600">{formatQuantity(selectedMovementSummary.outbound)}</p>
              </div>
              <div className="materials-metric border border-surface-200 bg-surface-50/70 px-3 py-2">
                <p className="text-xs font-semibold text-surface-500">流水次数</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-surface-900">{selectedMovementRows.length}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <table className="w-full min-w-[900px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[150px]" />
                  <col className="w-[80px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col className="w-[120px]" />
                  <col className="w-[120px]" />
                  <col className="w-[120px]" />
                  <col />
                </colgroup>
                <thead className="bg-surface-50">
                  <tr className="border-y border-surface-200 text-xs font-semibold text-surface-700">
                    <th className="px-3 py-3 text-left">时间</th>
                    <th className="px-3 py-3 text-center">类型</th>
                    <th className="px-3 py-3 text-center">数量</th>
                    <th className="px-3 py-3 text-center">调整前</th>
                    <th className="px-3 py-3 text-center">调整后</th>
                    <th className="px-3 py-3 text-center">来源</th>
                    <th className="px-3 py-3 text-center">订单号</th>
                    <th className="px-3 py-3 text-center">操作人</th>
                    <th className="px-3 py-3 text-left">原因/备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {selectedMovementRows.map((movement) => {
                    const typeMeta = getMovementTypeMeta(movement.movement_type);
                    return (
                      <tr key={movement.id} className="h-12 hover:bg-surface-50/70">
                        <td className="px-3 py-3 align-middle text-xs tabular-nums text-surface-600">{formatDateTime(movement.created_at)}</td>
                        <td className="px-3 py-3 text-center align-middle">
                          <span className={cn("inline-flex min-w-[48px] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold ring-1", typeMeta.className)}>
                            {typeMeta.label}
                          </span>
                        </td>
                        <td className={cn("px-3 py-3 text-center align-middle font-semibold tabular-nums", typeMeta.sign === "+" ? "text-emerald-700" : typeMeta.sign === "-" ? "text-red-600" : "text-surface-800")}>
                          {typeMeta.sign}{formatQuantity(movement.quantity)}
                        </td>
                        <td className="px-3 py-3 text-center align-middle tabular-nums text-surface-700">{formatQuantity(movement.before_stock)}</td>
                        <td className="px-3 py-3 text-center align-middle font-semibold tabular-nums text-surface-900">{formatQuantity(movement.after_stock)}</td>
                        <td className="px-3 py-3 text-center align-middle text-surface-700">{getSourceTypeLabel(movement.source_type)}</td>
                        <td className="px-3 py-3 text-center align-middle font-mono text-xs text-surface-600">{movement.order_no || movement.source_no || "-"}</td>
                        <td className="px-3 py-3 text-center align-middle text-surface-700">{movement.operator_name || "-"}</td>
                        <td className="px-3 py-3 align-middle text-surface-700">
                          <div className="line-clamp-2" title={[movement.reason, movement.remark].filter(Boolean).join(" / ")}>
                            {[movement.reason, movement.remark].filter(Boolean).join(" / ") || "-"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {selectedMovementRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-surface-500">
                        暂无出入库流水
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {adjustingMaterial && (
        <div className="materials-overlay fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-950/25 px-6 py-7 max-md:inset-0 max-md:w-full max-md:px-4">
          <div className="materials-modal-shell materials-adjust-modal flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden border border-surface-200 bg-white">
            <div className="materials-modal-header flex items-center justify-between border-b border-surface-200 bg-surface-50 px-6 py-4">
              <div>
                <p className="text-base font-semibold text-surface-900">调整库存</p>
                <p className="mt-0.5 text-xs text-surface-500">{adjustingMaterial.name} · {adjustingMaterial.code || "无编码"}</p>
              </div>
              <button type="button" onClick={() => setAdjustingMaterial(null)} className="materials-icon-button flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900" aria-label="关闭库存调整">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="materials-modal-body min-h-0 flex-1 overflow-auto bg-surface-50/45 px-6 py-6">
              <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
                <aside className="space-y-4">
                  <div className="rounded-lg border border-surface-200 bg-white p-4">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const image = normalizeMaterialImages(adjustingMaterial.images, adjustingMaterial.image || "")[0];
                        return image ? (
                          <NativeImage src={image} alt={adjustingMaterial.name} className="h-16 w-16 rounded-lg border border-surface-200 object-cover" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                            <Package className="h-5 w-5" />
                          </div>
                        );
                      })()}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-surface-900">{adjustingMaterial.name}</p>
                        <p className="mt-1 truncate text-xs text-surface-500">{adjustingMaterial.category_name || "未设置分类"}</p>
                        <p className="mt-1 font-mono text-xs font-semibold text-surface-600">{adjustingMaterial.code || "-"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-surface-200 bg-white p-4">
                    <p className="text-sm font-semibold text-surface-900">当前库存信息</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <AdjustMetric label="当前库存" value={`${formatQuantity(adjustingMaterial.stock)} ${adjustingMaterial.unit || ""}`} tone="strong" />
                      <AdjustMetric label="预警库存" value={`${formatQuantity(adjustingMaterial.min_stock)} ${adjustingMaterial.unit || ""}`} tone="neutral" />
                      <AdjustMetric label="入库价" value={formatAmount(adjustingMaterial.cost_price)} tone="neutral" />
                      <AdjustMetric label="出库价" value={formatAmount(adjustingMaterial.unit_price)} tone="neutral" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-surface-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-surface-900">最近出入库</p>
                      <span className="text-xs font-medium text-surface-400">最近5条</span>
                    </div>
                    <div className="mt-3 divide-y divide-surface-100">
                      {adjustingMovementRows.map((movement) => {
                        const typeMeta = getMovementTypeMeta(movement.movement_type);
                        return (
                          <div key={movement.id} className="flex items-center gap-3 py-2.5">
                            <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1", typeMeta.className)}>
                              {typeMeta.sign === "+" ? <TrendingUp className="h-3.5 w-3.5" /> : typeMeta.sign === "-" ? <TrendingDown className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-surface-800">
                                {typeMeta.label} {typeMeta.sign}{formatQuantity(movement.quantity)}
                                {movement.order_no || movement.source_no ? ` · ${movement.order_no || movement.source_no}` : ""}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-surface-400">{formatDateTime(movement.created_at)}</p>
                            </div>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-surface-700">{formatQuantity(movement.after_stock)}</span>
                          </div>
                        );
                      })}
                      {adjustingMovementRows.length === 0 && (
                        <div className="py-7 text-center text-xs text-surface-400">暂无出入库记录</div>
                      )}
                    </div>
                  </div>
                </aside>

                <section className="space-y-4">
                  <div className="rounded-lg border border-surface-200 bg-white p-4">
                    <p className="text-sm font-semibold text-surface-900">本次调整预览</p>
                    <div className="mt-4 grid grid-cols-4 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
                      <AdjustMetric label="调整前" value={formatQuantity(adjustmentPreview?.currentStock)} tone="neutral" />
                      <AdjustMetric label="调整后" value={formatQuantity(adjustmentPreview?.nextStock)} tone="strong" />
                      <AdjustMetric
                        label="库存变化"
                        value={`${(adjustmentPreview?.difference || 0) > 0 ? "+" : ""}${formatQuantity(adjustmentPreview?.difference)}`}
                        tone={(adjustmentPreview?.difference || 0) > 0 ? "success" : (adjustmentPreview?.difference || 0) < 0 ? "danger" : "neutral"}
                      />
                      <AdjustMetric
                        label="调整后状态"
                        value={adjustmentPreview?.warning || "-"}
                        tone={adjustmentPreview?.warning === "库存正常" ? "success" : adjustmentPreview?.warning === "缺货" ? "danger" : "warning"}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-surface-200 bg-white p-4">
                    <p className="text-sm font-semibold text-surface-900">调整信息</p>
                    <div className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-surface-500">调整后库存</span>
                        <input value={form.stock} onChange={(event) => setForm((current) => ({ ...current, stock: normalizeNumberInput(event.target.value) }))} className="input-field min-h-11" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-surface-500">库存预警数量</span>
                        <input value={form.min_stock} onChange={(event) => setForm((current) => ({ ...current, min_stock: normalizeNumberInput(event.target.value) }))} className="input-field min-h-11" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-surface-500">调整原因</span>
                        <SystemSelect value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="input-field min-h-11">
                          <option value="库存盘点">库存盘点</option>
                          <option value="采购入库">采购入库</option>
                          <option value="退料入库">退料入库</option>
                          <option value="损耗报废">损耗报废</option>
                          <option value="数据修正">数据修正</option>
                        </SystemSelect>
                      </label>
                    </div>
                  </div>
                  <label className="block rounded-lg border border-surface-200 bg-white p-4">
                    <span className="mb-2 block text-sm font-semibold text-surface-900">备注</span>
                    <textarea
                      value={form.remark}
                      onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
                      className="input-field min-h-32 resize-none"
                      placeholder="填写本次库存变化说明，方便后续查账"
                    />
                  </label>
                  <div className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-xs text-primary-700">
                    系统会根据调整前后库存自动生成入库或出库流水。
                  </div>
                </section>
              </div>
            </div>
            <div className="materials-modal-footer flex items-center justify-end gap-3 border-t border-surface-200 bg-white px-6 py-4">
              <button type="button" onClick={() => setAdjustingMaterial(null)} className="btn-secondary" disabled={saving}>取消</button>
              <button type="button" onClick={saveAdjustment} className="btn-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />}
                保存调整
              </button>
            </div>
          </div>
        </div>
      )}

      {imagePreview && (
        <div
          className="pointer-events-none fixed z-[80] w-56 rounded-lg border border-surface-200 bg-white p-2 shadow-[0_22px_60px_rgba(15,23,42,0.22)]"
          style={{ left: Math.min(imagePreview.x + 18, window.innerWidth - 250), top: Math.min(imagePreview.y + 18, window.innerHeight - 250) }}
        >
          <NativeImage src={imagePreview.src} alt={imagePreview.name} className="h-44 w-full rounded-md object-cover" loading="eager" />
          <p className="mt-2 truncate text-xs font-semibold text-surface-800">{imagePreview.name}</p>
        </div>
      )}
    </div>
  );
}

export default function MaterialInventoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-50" />}>
      <MaterialInventoryPageContent />
    </Suspense>
  );
}
