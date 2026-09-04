"use client";

import {
  InfoLine,
  StatusBadge,
} from "./material-inbound-bits";



import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import { SystemResourceTable } from "@/components/ui/SystemResourceTable";
import SystemStatusFilter from "@/components/ui/SystemStatusFilter";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import SystemDateInput from "@/components/ui/SystemDateInput";

type InboundOrder = {
  id: string;
  company_id: string;
  supplier_id?: string | null;
  warehouse_id?: string | null;
  inbound_no: string;
  status: string;
  source_type?: string | null;
  total_amount?: number | null;
  inbound_date?: string | null;
  handler_name?: string | null;
  notes?: string | null;
  supplier_name?: string | null;
  supplier_contact?: string | null;
  supplier_phone?: string | null;
  warehouse_name?: string | null;
  created_by_name?: string | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  item_count?: number | null;
  total_quantity?: number | null;
  created_at?: string | null;
};

type InboundItem = {
  id: string;
  inbound_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  remark?: string | null;
  material_code?: string | null;
  material_name?: string | null;
  material_brand?: string | null;
  material_product_name?: string | null;
  material_model?: string | null;
  material_color?: string | null;
  material_spec?: string | null;
  material_unit?: string | null;
  material_image?: string | null;
  material_images?: string[] | string | null;
  material_stock?: number | null;
  material_min_stock?: number | null;
  material_cost_price?: number | null;
  material_unit_price?: number | null;
  category_name?: string | null;
  material_supplier_name?: string | null;
};

type MaterialOption = {
  id: string;
  code?: string | null;
  name: string;
  brand?: string | null;
  product_name?: string | null;
  material_model?: string | null;
  color?: string | null;
  spec?: string | null;
  unit?: string | null;
  cost_price?: number | null;
  unit_price?: number | null;
  stock?: number | null;
  min_stock?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  category_name?: string | null;
  image?: string | null;
  images?: string[] | string | null;
};

type SupplierOption = {
  id: string;
  name: string;
  supplier_type?: string | null;
  contact?: string | null;
  phone?: string | null;
  owner_name?: string | null;
  material_count?: number | null;
};

type InboundResponse = {
  orders: InboundOrder[];
  items: InboundItem[];
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  summary?: {
    totalCount: number;
    draftCount: number;
    confirmedCount: number;
    cancelledCount: number;
    totalAmount: number;
  };
};

type InboundLineForm = {
  material_id: string;
  quantity: string;
  unit_price: string;
  remark: string;
};

type InboundForm = {
  supplier_id: string;
  warehouse_id: string;
  source_type: "PURCHASE" | "RETURN" | "TRANSFER" | "OTHER";
  inbound_date: string;
  handler_name: string;
  notes: string;
  items: InboundLineForm[];
};


const sourceTypeLabels: Record<string, string> = {
  PURCHASE: "采购入库",
  RETURN: "退料入库",
  TRANSFER: "调拨入库",
  OTHER: "其他入库",
};

function todayText() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function makeDefaultForm(handlerName = ""): InboundForm {
  return {
    supplier_id: "",
    warehouse_id: "",
    source_type: "PURCHASE",
    inbound_date: todayText(),
    handler_name: handlerName,
    notes: "",
    items: [],
  };
}

function formatAmount(value?: number | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatQuantity(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function normalizeNumberInput(value: string) {
  const text = value.replace(/[^\d.]/g, "");
  const [integer, ...decimals] = text.split(".");
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

function getMaterialImage(item: MaterialOption | InboundItem) {
  const primaryImage = (item as InboundItem).material_image || (item as MaterialOption).image;
  if (primaryImage) return primaryImage;
  const images = (item as InboundItem).material_images || (item as MaterialOption).images;
  return normalizeMaterialImages(images)[0] || "";
}

function getMaterialSpec(item: MaterialOption | InboundItem) {
  return [
    (item as InboundItem).material_brand || (item as MaterialOption).brand,
    (item as InboundItem).material_product_name || (item as MaterialOption).product_name,
    item.material_model,
    (item as InboundItem).material_color || (item as MaterialOption).color,
    (item as InboundItem).material_spec || (item as MaterialOption).spec,
  ].filter(Boolean).join(" / ");
}

export default function MaterialInboundPage() {
  const { user } = useAuth();
  const [data, setData] = useState<InboundResponse>({
    orders: [],
    items: [],
    materials: [],
    suppliers: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [form, setForm] = useState<InboundForm>(makeDefaultForm());
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string; spec: string; x: number; y: number } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.get<InboundResponse>("/api/material-inbound");
      setData({
        orders: result.orders || [],
        items: result.items || [],
        materials: result.materials || [],
        suppliers: result.suppliers || [],
        summary: result.summary,
      });
    } catch (error: any) {
      setMessage(error?.message || "入库单加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!user?.name) return;
    setForm((current) => current.handler_name ? current : { ...current, handler_name: user.name });
  }, [user?.name]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const orderItemsByOrder = useMemo(() => {
    return data.items.reduce<Record<string, InboundItem[]>>((result, item) => {
      if (!result[item.inbound_id]) result[item.inbound_id] = [];
      result[item.inbound_id].push(item);
      return result;
    }, {});
  }, [data.items]);

  const selectedOrder = useMemo(
    () => data.orders.find((order) => order.id === selectedOrderId) || null,
    [data.orders, selectedOrderId],
  );

  const selectedOrderItems = useMemo(
    () => selectedOrder ? orderItemsByOrder[selectedOrder.id] || [] : [],
    [orderItemsByOrder, selectedOrder],
  );

  const supplierOptions = useMemo(() => {
    return data.suppliers
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [data.suppliers]);

  const warehouseSuppliers = useMemo(() => {
    const warehouseTypes = new Set(["COMPANY_WAREHOUSE", "WAREHOUSE"]);
    return data.suppliers.filter((supplier) => {
      const type = String(supplier.supplier_type || "");
      return warehouseTypes.has(type) || /仓|仓库/.test(supplier.name);
    });
  }, [data.suppliers]);

  const matchesSupplierWarehouseAndKeyword = useCallback((order: InboundOrder, keyword: string) => {
      if (supplierFilter && order.supplier_id !== supplierFilter) return false;
      if (warehouseFilter && (order.warehouse_id || "__EMPTY__") !== warehouseFilter) return false;
      if (!keyword) return true;
      const items = orderItemsByOrder[order.id] || [];
      const text = [
        order.inbound_no,
        order.supplier_name,
        order.warehouse_name,
        order.handler_name,
        order.created_by_name,
        order.notes,
        sourceTypeLabels[String(order.source_type || "")],
        ...items.flatMap((item) => [item.material_name, item.material_code, item.category_name, getMaterialSpec(item)]),
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(keyword);
  }, [orderItemsByOrder, supplierFilter, warehouseFilter]);

  const statusCountBaseOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.orders.filter((order) => matchesSupplierWarehouseAndKeyword(order, keyword));
  }, [data.orders, matchesSupplierWarehouseAndKeyword, search]);

  const statusTabs = [
    { key: "all", label: "全部", count: statusCountBaseOrders.filter((order) => order.status !== "CANCELLED").length },
    { key: "DRAFT", label: "草稿", count: statusCountBaseOrders.filter((order) => order.status === "DRAFT").length },
    { key: "CONFIRMED", label: "已入库", count: statusCountBaseOrders.filter((order) => order.status === "CONFIRMED").length },
    { key: "CANCELLED", label: "已作废", count: statusCountBaseOrders.filter((order) => order.status === "CANCELLED").length },
  ];

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.orders.filter((order) => {
      if (statusFilter === "all" && order.status === "CANCELLED") return false;
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      return matchesSupplierWarehouseAndKeyword(order, keyword);
    });
  }, [data.orders, matchesSupplierWarehouseAndKeyword, search, statusFilter]);
  const inboundPagination = useDataPagination(filteredOrders, [statusFilter, supplierFilter, warehouseFilter, search].join("|"));

  const selectableMaterials = useMemo(() => {
    return data.materials;
  }, [data.materials]);

  const materialCategories = useMemo(() => {
    const counts = selectableMaterials.reduce<Record<string, number>>((result, material) => {
      const category = material.category_name || "未分类";
      result[category] = (result[category] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [selectableMaterials]);

  const filteredSelectableMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();
    return selectableMaterials.filter((material) => {
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
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(keyword);
    });
  }, [materialCategoryFilter, materialSearch, selectableMaterials]);

  const selectedMaterialMap = useMemo(() => {
    return form.items.reduce<Record<string, InboundLineForm>>((result, item) => {
      if (item.material_id) result[item.material_id] = item;
      return result;
    }, {});
  }, [form.items]);

  const formTotalAmount = form.items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);
  }, 0);

  const defaultHandlerName = user?.name || "";

  const openCreate = () => {
    setForm(makeDefaultForm(defaultHandlerName));
    setMaterialSearch("");
    setMaterialCategoryFilter("all");
    setShowMaterialPicker(false);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setShowMaterialPicker(false);
    setImagePreview(null);
  };

  const updateLine = (index: number, patch: Partial<InboundLineForm>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const removeLine = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addMaterialToInbound = (material: MaterialOption) => {
    setForm((current) => {
      const currentIndex = current.items.findIndex((item) => item.material_id === material.id);
      if (currentIndex >= 0) {
        return {
          ...current,
          items: current.items.map((item, index) => {
            if (index !== currentIndex) return item;
            const nextQuantity = (Number(item.quantity || 0) || 0) + 1;
            return { ...item, quantity: formatQuantity(nextQuantity) };
          }),
        };
      }
      return {
        ...current,
        items: [
          ...current.items,
          {
            material_id: material.id,
            quantity: "1",
            unit_price: String(Number(material.cost_price ?? material.unit_price ?? 0)),
            remark: "",
          },
        ],
      };
    });
  };

  const showMaterialImagePreview = (
    event: MouseEvent,
    image: string,
    item: MaterialOption | InboundItem,
    fallbackName = "材料图片",
  ) => {
    if (!image) return;
    setImagePreview({
      src: image,
      name: (item as InboundItem).material_name || (item as MaterialOption).name || fallbackName,
      spec: getMaterialSpec(item),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const saveInbound = async (status: "DRAFT" | "CONFIRMED") => {
    const validItems = form.items.filter((item) => item.material_id && Number(item.quantity || 0) > 0);
    if (!form.supplier_id) {
      setMessage("请选择采购来源/供应商");
      return;
    }
    if (validItems.length === 0) {
      setMessage("请至少选择一个材料并填写入库数量");
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ success: boolean; id: string; inbound_no: string }>("/api/material-inbound", {
        action: "create_inbound_order",
        ...form,
        status,
        items: validItems.map((item) => ({
          material_id: item.material_id,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          remark: item.remark,
        })),
      });
      setMessage(status === "CONFIRMED" ? `入库单 ${result.inbound_no} 已确认入库` : `入库单 ${result.inbound_no} 已保存草稿`);
      closeCreate();
      setForm(makeDefaultForm(defaultHandlerName));
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "保存入库单失败");
    } finally {
      setSaving(false);
    }
  };

  const confirmInbound = async (order: InboundOrder) => {
    if (!window.confirm(`确认入库单 ${order.inbound_no} 入库？确认后会增加材料库存并生成入库流水。`)) return;
    setSaving(true);
    try {
      await api.post("/api/material-inbound", {
        action: "confirm_inbound_order",
        id: order.id,
      });
      setMessage("已确认入库，库存已增加");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "确认入库失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelInbound = async (order: InboundOrder) => {
    const text = order.status === "CONFIRMED"
      ? `确认作废入库单 ${order.inbound_no}？系统会生成反向出库流水冲回库存，库存不足时会拒绝。`
      : `确认作废入库单 ${order.inbound_no}？`;
    if (!window.confirm(text)) return;
    setSaving(true);
    try {
      await api.post("/api/material-inbound", {
        action: "cancel_inbound_order",
        id: order.id,
        reason: "入库单作废",
      });
      setMessage("入库单已作废");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "作废入库单失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page-surface material-workbench-ui materials-design-ui materials-inbound-ui flex h-full min-h-0 items-center justify-center bg-[#F5F7FB] text-[#6B7280]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary-600" />
        入库单加载中...
      </div>
    );
  }

  return (
    <div className="app-page-surface enterprise-list-ui auxiliary-orders-ui material-workbench-ui materials-design-ui materials-inbound-ui aux-orders-page flex h-full min-h-0 flex-col bg-[#F5F7FB]">
      {message && (
        <div className={cn(
          "fixed left-1/2 top-5 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium shadow-[0_18px_38px_rgba(31,41,53,0.16)]",
          /失败|缺少|请选择|不能|不存在|至少|不足|作废/.test(message) ? "border-red-100 text-red-600" : "border-emerald-100 text-emerald-700",
        )}>
          {/失败|缺少|请选择|不能|不存在|至少|不足|作废/.test(message) ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {message}
        </div>
      )}

      <section className="aux-orders-toolbar-panel aux-orders-list-toolbar system-status-toolbar-panel shrink-0 overflow-hidden bg-white">
        <SystemStatusFilter
          items={statusTabs.map((tab) => ({ value: tab.key, label: tab.label, count: tab.count }))}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="入库单状态筛选"
        />
        <div className="aux-orders-actions-row system-status-toolbar-actions">
              <label className="aux-orders-store-filter block">
                <span className="sr-only">采购来源筛选</span>
              <SystemSelect value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="input-field min-h-10 w-full py-2 sm:w-40">
                <option value="">全部采购来源</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </SystemSelect>
              </label>
              <label className="aux-orders-store-filter block">
                <span className="sr-only">入库仓库筛选</span>
              <SystemSelect value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} className="input-field min-h-10 w-full py-2 sm:w-40">
                <option value="">全部入库仓库</option>
                <option value="__EMPTY__">未指定仓库</option>
                {warehouseSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </SystemSelect>
              </label>
              <div className="aux-orders-search relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="input-field pl-9"
                  placeholder="搜索单号、材料、经办人"
                />
              </div>
              <button type="button" onClick={openCreate} className="aux-orders-toolbar-button btn-primary">
                <Plus className="h-4 w-4" />
                新建入库单
              </button>
        </div>
      </section>

      <SystemResourceTable.Panel className="auxiliary-orders-table aux-orders-list-panel flex-1">
        <SystemResourceTable.Scroll>
          <SystemResourceTable.Table minWidth={1580} fixed>
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[92px]" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[180px]" />
              <col className="w-[160px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[104px]" />
              <col className="w-[170px]" />
              <col className="w-[116px]" />
            </colgroup>
            <thead>
              <tr>
                <SystemResourceTable.HeaderCell align="center">序号</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">状态</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">入库单号</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">入库类型</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">采购来源</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">入库仓库</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">入库日期</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">经办人</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">材料项/数量</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">入库金额</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">备注</SystemResourceTable.HeaderCell>
                <SystemResourceTable.HeaderCell align="center">操作</SystemResourceTable.HeaderCell>
              </tr>
            </thead>
            <tbody>
              {inboundPagination.pageItems.map((order, index) => (
                <SystemResourceTable.Row
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <SystemResourceTable.Cell align="center" index>{(inboundPagination.page - 1) * inboundPagination.pageSize + index + 1}</SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center"><StatusBadge status={order.status} /></SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center" emphasis className="tabular-nums">{order.inbound_no}</SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center">{sourceTypeLabels[String(order.source_type || "PURCHASE")] || "-"}</SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center">
                    <span className="block truncate font-semibold text-surface-900" title={order.supplier_name || ""}>{order.supplier_name || "-"}</span>
                  </SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center">
                    <span className="block truncate text-surface-800" title={order.warehouse_name || ""}>{order.warehouse_name || "未指定"}</span>
                  </SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center" className="tabular-nums">{formatDate(order.inbound_date || order.created_at)}</SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center">
                    <span className="block truncate text-surface-800" title={order.handler_name || order.created_by_name || ""}>{order.handler_name || order.created_by_name || "-"}</span>
                  </SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center" className="tabular-nums">
                    {Number(order.item_count || 0)} 项 / {formatQuantity(order.total_quantity)}
                  </SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center" emphasis className="tabular-nums text-red-600">{formatAmount(order.total_amount)}</SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center">
                    <span className="block truncate text-surface-600" title={order.notes || ""}>{order.notes || "-"}</span>
                  </SystemResourceTable.Cell>
                  <SystemResourceTable.Cell align="center">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedOrderId(order.id);
                      }}
                      className="aux-orders-row-action inline-flex h-8 items-center gap-1 border border-[#DCE4F0] bg-white px-2.5 text-xs font-semibold text-[#34445A] hover:border-[#CFE0FF] hover:text-[#407AFF]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      查看
                    </button>
                  </SystemResourceTable.Cell>
                </SystemResourceTable.Row>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center text-surface-400">
                      <ClipboardCheck className="mb-3 h-10 w-10 text-surface-300" />
                      <p className="text-sm">暂无符合条件的入库单</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </SystemResourceTable.Table>
        </SystemResourceTable.Scroll>
        <SystemResourceTable.Pagination
          total={filteredOrders.length}
          page={inboundPagination.page}
          pageSize={inboundPagination.pageSize}
          onPageChange={inboundPagination.setPage}
          onPageSizeChange={inboundPagination.setPageSize}
          itemName="张入库单"
          className="aux-orders-pagination"
        />
      </SystemResourceTable.Panel>

      {showCreate && (
        <div className="materials-overlay fixed inset-y-0 right-0 z-50 bg-surface-950/25 md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="flex h-full items-center justify-center p-2 lg:p-3">
            <div className="materials-modal-shell materials-inbound-editor flex h-[96vh] w-full max-w-[1180px] flex-col overflow-hidden border border-surface-200 bg-surface-50">
              <div className="materials-modal-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-surface-900">新建入库单</p>
                  <p className="mt-0.5 text-xs text-surface-500">录入外采、退料或调拨入库材料，确认后自动增加库存</p>
                </div>
                <div className="ml-auto hidden items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-surface-500 sm:flex">
                  <span>当前合计</span>
                  <span className="text-base font-semibold tabular-nums text-red-600">{formatAmount(formTotalAmount)}</span>
                </div>
                <button type="button" onClick={closeCreate} className="materials-icon-button flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900" aria-label="关闭新建入库单">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="materials-modal-body flex-1 space-y-4 overflow-y-auto bg-surface-50/70 p-4 lg:p-5">
                <section className="materials-form-section border border-surface-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">基础信息</p>
                      <p className="mt-0.5 text-xs text-surface-500">采购来源用于对账，入库仓库用于明确库存归属</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
                      <Warehouse className="h-3.5 w-3.5" />
                      库存入库
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">入库类型</span>
                      <SystemSelect value={form.source_type} onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value as InboundForm["source_type"] }))} className="input-field min-h-10 py-2" disabled={saving}>
                        <option value="PURCHASE">采购入库</option>
                        <option value="RETURN">退料入库</option>
                        <option value="TRANSFER">调拨入库</option>
                        <option value="OTHER">其他入库</option>
                      </SystemSelect>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">入库日期</span>
                      <SystemDateInput value={form.inbound_date} onChange={(nextValue) => setForm((current) => ({ ...current, inbound_date: nextValue }))} className="input-field min-h-10 py-2" disabled={saving} />
                    </label>
                    <label className="block xl:col-span-2">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">采购来源/供应商</span>
                      <SystemSelect
                        value={form.supplier_id}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            supplier_id: event.target.value,
                          }));
                          setMaterialSearch("");
                          setMaterialCategoryFilter("all");
                        }}
                        className="input-field min-h-10 py-2"
                        disabled={saving}
                      >
                        <option value="">请选择供应商</option>
                        {supplierOptions.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                        ))}
                      </SystemSelect>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">入库仓库</span>
                      <SystemSelect value={form.warehouse_id} onChange={(event) => setForm((current) => ({ ...current, warehouse_id: event.target.value }))} className="input-field min-h-10 py-2" disabled={saving}>
                        <option value="">不指定仓库</option>
                        {warehouseSuppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                        ))}
                      </SystemSelect>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">经办人</span>
                      <input value={form.handler_name} onChange={(event) => setForm((current) => ({ ...current, handler_name: event.target.value }))} className="input-field min-h-10 py-2" placeholder="本次入库负责人" disabled={saving} />
                    </label>
                    <label className="block xl:col-span-2">
                      <span className="mb-1.5 block text-xs font-medium text-surface-600">入库备注</span>
                      <input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="input-field min-h-10 py-2" placeholder="采购单号、送货单号、异常说明" disabled={saving} />
                    </label>
                  </div>
                </section>

                <section className="materials-form-section materials-line-items overflow-hidden border border-surface-300 bg-white">
                  <div className="flex flex-col gap-3 border-b border-surface-300 bg-surface-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">入库材料</p>
                      <p className="mt-0.5 text-xs text-surface-500">
                        已选 {form.items.length} 项，公司材料库可选 {selectableMaterials.length} 项材料；采购来源只记录本次进货来源，不限制选品
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!form.supplier_id) {
                          setMessage("请先选择采购来源/供应商");
                          return;
                        }
                        setShowMaterialPicker(true);
                      }}
                      className="btn-primary min-h-9 justify-center px-3 py-1.5"
                      disabled={saving}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      选择商品
                    </button>
                  </div>
                  <ThinScrollArea>
                    <table className="w-full min-w-[1040px] table-fixed text-sm">
                      <colgroup>
                        <col className="w-[76px]" />
                        <col />
                        <col className="w-[76px]" />
                        <col className="w-[96px]" />
                        <col className="w-[110px]" />
                        <col className="w-[110px]" />
                        <col className="w-[120px]" />
                        <col className="w-[200px]" />
                        <col className="w-[64px]" />
                      </colgroup>
                      <thead className="bg-surface-100 text-xs font-semibold text-surface-700">
                        <tr className="border-b border-surface-300">
                          <th className="px-3 py-2.5 text-center">图片</th>
                          <th className="px-3 py-2.5 text-left">材料</th>
                          <th className="px-3 py-2.5 text-center">单位</th>
                          <th className="px-3 py-2.5 text-center">现库存</th>
                          <th className="px-3 py-2.5 text-center">入库数量</th>
                          <th className="px-3 py-2.5 text-center">入库价</th>
                          <th className="px-3 py-2.5 text-center">小计</th>
                          <th className="px-3 py-2.5 text-center">备注</th>
                          <th className="px-3 py-2.5 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-200 bg-white">
                        {form.items.map((line, index) => {
                          const material = data.materials.find((item) => item.id === line.material_id);
                          const lineQuantity = Number(line.quantity || 0) || 0;
                          const lineAmount = lineQuantity * (Number(line.unit_price || 0) || 0);
                          const materialImage = material ? getMaterialImage(material) : "";
                          return (
                            <tr key={index}>
                              <td className="px-3 py-2.5 text-center align-middle">
                                <div className="mx-auto flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                                  {materialImage ? (
                                    <NativeImage
                                      src={materialImage}
                                      alt={material?.name || "材料图片"}
                                      className="h-full w-full cursor-zoom-in object-cover"
                                      onMouseEnter={(event) => material && showMaterialImagePreview(event, materialImage, material)}
                                      onMouseMove={(event) => material && showMaterialImagePreview(event, materialImage, material)}
                                      onMouseLeave={() => setImagePreview(null)}
                                    />
                                  ) : (
                                    <Package className="h-5 w-5 text-surface-300" />
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <p className="truncate font-semibold text-surface-900" title={material?.name || ""}>{material?.name || "未知材料"}</p>
                                <p className="mt-1 truncate text-xs text-surface-500" title={material ? getMaterialSpec(material) : ""}>
                                  {material ? `${material.category_name || "未分类"} · ${getMaterialSpec(material) || "未填写规格"}` : "材料不存在或已下架"}
                                </p>
                                {material?.code && <p className="mt-1 truncate font-mono text-xs font-semibold text-surface-400">{material.code}</p>}
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle text-surface-600">{material?.unit || "-"}</td>
                              <td className="px-3 py-2.5 text-center align-middle font-semibold tabular-nums text-surface-700">{material ? formatQuantity(material.stock) : "-"}</td>
                              <td className="px-3 py-2.5 text-center align-middle">
                                <input
                                  value={line.quantity}
                                  onChange={(event) => updateLine(index, { quantity: normalizeNumberInput(event.target.value) })}
                                  className="input-field mx-auto min-h-9 max-w-28 py-1.5 text-center"
                                  inputMode="decimal"
                                  placeholder="0"
                                  disabled={saving}
                                />
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle">
                                <input
                                  value={line.unit_price}
                                  onChange={(event) => updateLine(index, { unit_price: normalizeNumberInput(event.target.value) })}
                                  className="input-field mx-auto min-h-9 max-w-28 py-1.5 text-center"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  disabled={saving}
                                />
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle font-semibold tabular-nums text-red-600">{formatAmount(lineAmount)}</td>
                              <td className="px-3 py-2.5 text-center align-middle">
                                <input value={line.remark} onChange={(event) => updateLine(index, { remark: event.target.value })} className="input-field mx-auto min-h-9 py-1.5 text-center" placeholder="批次、送货单、异常说明" disabled={saving} />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button type="button" onClick={() => removeLine(index)} className="rounded p-1.5 text-surface-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={saving}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {form.items.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-4 py-20 text-center">
                              <div className="mx-auto flex max-w-sm flex-col items-center text-surface-400">
                                <Package className="mb-3 h-10 w-10 text-surface-300" />
                                <p className="text-sm font-medium text-surface-600">还没有选择入库材料</p>
                                <p className="mt-1 text-xs text-surface-400">先选择供应商，再从商品页加入本次入库明细。</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ThinScrollArea>
                </section>
              </div>

              <div className="materials-modal-footer flex items-center justify-between gap-3 border-t border-surface-200 bg-white px-5 py-3">
                <div className="text-xs text-surface-500">
                  共 <span className="font-semibold text-surface-900">{form.items.length}</span> 行材料，
                  合计 <span className="font-semibold tabular-nums text-red-600">{formatAmount(formTotalAmount)}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={closeCreate} className="btn-secondary" disabled={saving}>关闭</button>
                  <button type="button" onClick={() => saveInbound("DRAFT")} className="btn-secondary disabled:opacity-50" disabled={saving || form.items.length === 0}>
                    保存草稿
                  </button>
                  <button type="button" onClick={() => saveInbound("CONFIRMED")} className="btn-primary disabled:opacity-50" disabled={saving || form.items.length === 0}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    确认入库
                  </button>
                </div>
              </div>
            </div>
          </div>

          {showMaterialPicker && (
            <div className="materials-overlay fixed inset-y-0 right-0 z-[70] bg-surface-950/30 md:left-[var(--active-sidebar-width)] max-md:left-0">
              <div className="flex h-full items-center justify-center p-2 lg:p-3">
                <div className="materials-modal-shell materials-picker-modal flex h-[96vh] w-full max-w-[1240px] flex-col overflow-hidden border border-surface-200 bg-surface-50">
                  <div className="materials-modal-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-surface-900">选择入库商品</p>
                        {form.supplier_id && (
                          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
                            来源：{data.suppliers.find((supplier) => supplier.id === form.supplier_id)?.name || "当前供应商"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-surface-500">从公司材料库选择实际入库材料，采购来源仅用于对账和追溯</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMaterialPicker(false);
                        setImagePreview(null);
                      }}
                      className="materials-icon-button flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900"
                      aria-label="关闭入库商品选择"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="materials-picker-toolbar border-b border-surface-200 bg-white px-5 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="relative w-full lg:max-w-[520px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                        <input
                          value={materialSearch}
                          onChange={(event) => setMaterialSearch(event.target.value)}
                          className="input-field min-h-10 pl-9"
                          placeholder="搜索材料名称、编码、品牌、规格、颜色"
                        />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-surface-500">
                        <span>可选 <b className="font-semibold text-surface-900">{selectableMaterials.length}</b> 项</span>
                        <span>当前筛选 <b className="font-semibold text-surface-900">{filteredSelectableMaterials.length}</b> 项</span>
                        <span>已选 <b className="font-semibold text-red-600">{form.items.length}</b> 项</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[190px_minmax(0,1fr)_260px]">
                    <aside className="materials-picker-categories border-b border-surface-200 bg-white p-3 lg:border-b-0 lg:border-r">
                      <div className="max-h-[180px] space-y-1 overflow-y-auto pr-1 lg:max-h-full">
                        <button
                          type="button"
                          onClick={() => setMaterialCategoryFilter("all")}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                            materialCategoryFilter === "all" ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100" : "text-surface-600 hover:bg-surface-50 hover:text-surface-900",
                          )}
                        >
                          <span>全部商品</span>
                          <span className="text-xs tabular-nums">{selectableMaterials.length}</span>
                        </button>
                        {materialCategories.map((category) => (
                          <button
                            key={category.name}
                            type="button"
                            onClick={() => setMaterialCategoryFilter(category.name)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                              materialCategoryFilter === category.name ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100" : "text-surface-600 hover:bg-surface-50 hover:text-surface-900",
                            )}
                          >
                            <span className="truncate" title={category.name}>{category.name}</span>
                            <span className="shrink-0 text-xs tabular-nums">{category.count}</span>
                          </button>
                        ))}
                      </div>
                    </aside>

                    <main className="materials-picker-results min-h-0 overflow-y-auto bg-surface-50/80 p-4">
                      {filteredSelectableMaterials.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {filteredSelectableMaterials.map((material) => {
                            const image = getMaterialImage(material);
                            const selectedLine = selectedMaterialMap[material.id];
                            const selectedQuantity = Number(selectedLine?.quantity || 0) || 0;
                            return (
                              <button
                                key={material.id}
                                type="button"
                                onClick={() => addMaterialToInbound(material)}
                                className={cn(
                                  "materials-product-card group flex min-h-[142px] flex-col overflow-hidden border bg-white text-left transition-all duration-150 hover:border-primary-200",
                                  selectedLine ? "border-primary-200 ring-1 ring-primary-100" : "border-surface-200",
                                )}
                              >
                                <div className="flex gap-3 p-3">
                                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
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
                                      <Package className="h-7 w-7 text-surface-300" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="overflow-hidden text-sm font-semibold leading-5 text-surface-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" title={material.name}>
                                        {material.name}
                                      </p>
                                      {selectedLine && (
                                        <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">
                                          已选 {formatQuantity(selectedQuantity)}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 truncate text-xs text-surface-500" title={getMaterialSpec(material)}>
                                      {getMaterialSpec(material) || "未填写规格"}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-surface-400" title={material.category_name || ""}>
                                      {material.category_name || "未分类"}
                                    </p>
                                    {material.code && (
                                      <p className="mt-1 font-mono text-xs font-semibold leading-4 text-surface-500" title={material.code}>
                                        {material.code}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-auto flex items-center justify-between border-t border-surface-100 bg-white px-3 py-2">
                                  <span className="text-xs text-surface-500">
                                    现库存 <b className="font-semibold text-surface-800">{formatQuantity(material.stock)}</b> {material.unit || ""}
                                  </span>
                                  <span className="text-sm font-semibold tabular-nums text-red-600">
                                    {formatAmount(material.cost_price ?? material.unit_price ?? 0)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed border-surface-300 bg-white">
                          <div className="text-center text-surface-400">
                            <Search className="mx-auto mb-3 h-9 w-9 text-surface-300" />
                            <p className="text-sm font-medium text-surface-600">没有找到匹配商品</p>
                            <p className="mt-1 text-xs">换个关键词或分类试试</p>
                          </div>
                        </div>
                      )}
                    </main>

                    <aside className="materials-picker-selection flex min-h-0 flex-col border-t border-surface-200 bg-white lg:border-l lg:border-t-0">
                      <div className="border-b border-surface-200 px-4 py-3">
                        <p className="text-sm font-semibold text-surface-900">已选材料</p>
                        <p className="mt-0.5 text-xs text-surface-500">加入后可回到明细表修改数量和入库价</p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {form.items.length > 0 ? (
                          <div className="space-y-2">
                            {form.items.map((line, index) => {
                              const material = data.materials.find((item) => item.id === line.material_id);
                              return (
                                <div key={`${line.material_id}-${index}`} className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-surface-900" title={material?.name || ""}>{material?.name || "未知材料"}</p>
                                      <p className="mt-0.5 text-xs text-surface-500">
                                        {formatQuantity(Number(line.quantity || 0))} {material?.unit || ""} × {formatAmount(Number(line.unit_price || 0))}
                                      </p>
                                    </div>
                                    <button type="button" onClick={() => removeLine(index)} className="shrink-0 rounded p-1 text-surface-400 hover:bg-red-50 hover:text-red-600">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[220px] items-center justify-center text-center text-xs text-surface-400">
                            点击左侧商品即可加入入库单
                          </div>
                        )}
                      </div>
                      <div className="border-t border-surface-200 bg-surface-50 px-4 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-surface-500">入库小计</span>
                          <span className="font-semibold tabular-nums text-red-600">{formatAmount(formTotalAmount)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMaterialPicker(false);
                            setImagePreview(null);
                          }}
                          className="mt-3 w-full rounded-lg bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800"
                        >
                          完成选品
                        </button>
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedOrder && (
        <div className="materials-overlay fixed inset-y-0 right-0 z-50 bg-surface-950/30 md:left-[var(--active-sidebar-width)] max-md:left-0">
          <div className="flex h-full items-center justify-center p-4">
            <div className="materials-modal-shell materials-inbound-detail flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden border border-surface-200 bg-surface-50">
              <div className="materials-modal-header flex items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-semibold text-surface-900">{selectedOrder.inbound_no}</p>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-surface-500">
                    {sourceTypeLabels[String(selectedOrder.source_type || "PURCHASE")]} · {selectedOrder.supplier_name || "未设置供应商"} · {formatDate(selectedOrder.inbound_date || selectedOrder.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedOrder.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={() => confirmInbound(selectedOrder)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                      disabled={saving}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      确认入库
                    </button>
                  )}
                  {selectedOrder.status !== "CANCELLED" && (
                    <button
                      type="button"
                      onClick={() => cancelInbound(selectedOrder)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                      disabled={saving}
                    >
                      <Ban className="h-4 w-4" />
                      作废
                    </button>
                  )}
                  <button type="button" onClick={() => {
                    setSelectedOrderId("");
                    setImagePreview(null);
                  }} className="materials-icon-button flex h-9 w-9 items-center justify-center border border-surface-200 bg-white text-surface-500 hover:text-surface-900" aria-label="关闭入库详情">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="materials-modal-body flex-1 space-y-4 overflow-y-auto p-5">
                <section className="materials-form-section border border-surface-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">入库概况</p>
                      <p className="mt-0.5 text-xs text-surface-500">来源、仓库、经办和确认信息</p>
                    </div>
                    <span className="text-2xl font-semibold tabular-nums text-red-600">{formatAmount(selectedOrder.total_amount)}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoLine label="入库类型" value={sourceTypeLabels[String(selectedOrder.source_type || "PURCHASE")] || "-"} />
                    <InfoLine label="采购来源" value={selectedOrder.supplier_name || "-"} />
                    <InfoLine label="入库仓库" value={selectedOrder.warehouse_name || "未指定"} />
                    <InfoLine label="入库日期" value={formatDate(selectedOrder.inbound_date || selectedOrder.created_at)} />
                    <InfoLine label="经办人" value={selectedOrder.handler_name || selectedOrder.created_by_name || "-"} />
                    <InfoLine label="确认人" value={selectedOrder.confirmed_by_name || "-"} />
                    <InfoLine label="确认时间" value={formatDateTime(selectedOrder.confirmed_at)} />
                    <InfoLine label="材料项/数量" value={`${Number(selectedOrder.item_count || 0)} 项 / ${formatQuantity(selectedOrder.total_quantity)}`} />
                    <InfoLine label="创建时间" value={formatDateTime(selectedOrder.created_at)} />
                    <InfoLine label="备注" value={selectedOrder.notes || "-"} span={3} />
                  </div>
                </section>

                <section className="materials-form-section materials-line-items overflow-hidden border border-surface-300 bg-white">
                  <div className="flex items-center justify-between border-b border-surface-300 bg-surface-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">材料明细</p>
                      <p className="mt-0.5 text-xs text-surface-500">确认入库后，每一行都会生成库存入库流水</p>
                    </div>
                    <span className="text-xs font-semibold text-surface-500">共 {selectedOrderItems.length} 项</span>
                  </div>
                  <ThinScrollArea>
                    <table className="w-full min-w-[980px] table-fixed text-sm">
                      <colgroup>
                        <col className="w-[72px]" />
                        <col />
                        <col className="w-[170px]" />
                        <col className="w-[76px]" />
                        <col className="w-[96px]" />
                        <col className="w-[104px]" />
                        <col className="w-[116px]" />
                        <col className="w-[170px]" />
                      </colgroup>
                      <thead className="bg-surface-50 text-xs font-semibold text-surface-700">
                        <tr className="border-b border-surface-300">
                          <th className="px-3 py-2.5 text-center">图片</th>
                          <th className="px-3 py-2.5 text-left">材料名称</th>
                          <th className="px-3 py-2.5 text-left">规格</th>
                          <th className="px-3 py-2.5 text-center">单位</th>
                          <th className="px-3 py-2.5 text-center">入库数量</th>
                          <th className="px-3 py-2.5 text-center">入库价</th>
                          <th className="px-3 py-2.5 text-center">小计</th>
                          <th className="px-3 py-2.5 text-center">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-200 bg-white">
                        {selectedOrderItems.map((item) => {
                          const image = getMaterialImage(item);
                          return (
                            <tr key={item.id} className="hover:bg-surface-50/80">
                              <td className="px-3 py-2.5 text-center align-middle">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-surface-200 bg-surface-50">
                                  {image ? (
                                    <NativeImage
                                      src={image}
                                      alt={item.material_name || "材料图片"}
                                      className="h-full w-full cursor-zoom-in object-cover"
                                      onMouseEnter={(event) => showMaterialImagePreview(event, image, item)}
                                      onMouseMove={(event) => showMaterialImagePreview(event, image, item)}
                                      onMouseLeave={() => setImagePreview(null)}
                                    />
                                  ) : (
                                    <Package className="h-5 w-5 text-surface-300" />
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <span className="block truncate font-semibold text-surface-900" title={item.material_name || ""}>{item.material_name || "未知材料"}</span>
                                {item.material_code && <span className="mt-0.5 block truncate font-mono text-xs text-surface-400">{item.material_code}</span>}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-surface-600">
                                <span className="block truncate" title={getMaterialSpec(item)}>{getMaterialSpec(item) || "-"}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center align-middle text-surface-600">{item.material_unit || "-"}</td>
                              <td className="px-3 py-2.5 text-center align-middle font-semibold tabular-nums text-surface-900">{formatQuantity(item.quantity)}</td>
                              <td className="px-3 py-2.5 text-center align-middle tabular-nums text-surface-700">{formatAmount(item.unit_price)}</td>
                              <td className="px-3 py-2.5 text-center align-middle font-semibold tabular-nums text-red-600">{formatAmount(item.total_price)}</td>
                              <td className="px-3 py-2.5 text-center align-middle text-surface-600">
                                <span className="block truncate" title={item.remark || ""}>{item.remark || "-"}</span>
                              </td>
                            </tr>
                          );
                        })}
                        {selectedOrderItems.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-10 text-center text-sm text-surface-400">当前入库单暂无材料明细</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ThinScrollArea>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {imagePreview && (
        <div
          className="pointer-events-none fixed z-[100] w-[240px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]"
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
    </div>
  );
}
