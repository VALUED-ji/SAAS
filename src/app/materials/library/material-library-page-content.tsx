"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Edit3,
  Eye,
  FileDown,
  FileUp,
  Layers3,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import SystemSelect from "@/components/ui/SystemSelect";
import NativeImage from "@/components/ui/NativeImage";
import {
	  Category,
	  ImportErrorItem,
	  Material,
	  MaterialForm,
	  MaterialSku,
	  MaterialSkuForm,
	  Supplier,
  formatAmount,
  formatCategoryOption,
  getProductAttributeLabels,
  makeMaterialNameFromParts,
  makeProductMaterialNameFromParts,
  parseProductAttributes,
  settlementCycleLabels,
} from "./material-editor-shared";
import {
  MaterialEditor,
  MaterialImportDialog,
  PriceHistoryPreview,
} from "./material-editor";

type PendingMaterialImage = {
  file: File;
  previewUrl: string;
};

const materialTypeLabels: Record<string, string> = {
  AUXILIARY: "辅材",
  MAIN: "产品",
};

const supplyModeLabels: Record<string, string> = {
  WAREHOUSE: "公司仓库",
  MONTHLY_SETTLEMENT: "线下月结",
  SUPPLIER_ORDER: "供应商下单",
};

type FixedLibraryType = "AUXILIARY" | "MAIN";
type MaterialDisplayMode = "grid" | "table";
type MaterialSortMode = "default" | "sales" | "popular" | "priceAsc" | "priceDesc";

const GRID_DEFAULT_PAGE_SIZE = 35;
const TABLE_DEFAULT_PAGE_SIZE = 20;

const materialLibraryMeta: Record<FixedLibraryType, { label: string; itemLabel: string }> = {
  AUXILIARY: { label: "辅材库", itemLabel: "辅材" },
  MAIN: { label: "产品库", itemLabel: "产品" },
};

function getDefaultDisplayMode(libraryType: FixedLibraryType): MaterialDisplayMode {
  return libraryType === "MAIN" ? "grid" : "table";
}

function getDisplayModeStorageKey(libraryType: FixedLibraryType) {
  return `materials-library-display-mode:${libraryType}`;
}

function getStoredDisplayMode(libraryType: FixedLibraryType): MaterialDisplayMode | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(getDisplayModeStorageKey(libraryType));
    return value === "grid" || value === "table" ? value : null;
  } catch {
    return null;
  }
}

function storeDisplayMode(libraryType: FixedLibraryType, mode: MaterialDisplayMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDisplayModeStorageKey(libraryType), mode);
  } catch {
    // localStorage may be unavailable in some embedded browser modes.
  }
}

const exportHeaders = ["材料编码", "材料类别", "材料类型", "供应方式", "材料名称", "商品图片", "品牌", "品名", "型号", "颜色", "规格", "单位", "入库价/采购价", "市场价", "出库价/客户价", "内控价", "供应商", "库存", "最低库存", "仓库名称", "负责人", "结算周期", "备注"];
const importTemplateHeaders = ["材料编码", "材料类别", "材料类型", "供应方式", "商品图片", "品牌", "品名", "型号", "颜色", "规格", "单位", "入库价/采购价", "市场价", "出库价/客户价", "内控价", "供应商", "备注"];

function makeClientMaterialCode(materials: Material[] = []) {
  const now = new Date();
  const prefix = `XY${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const maxSequence = materials.reduce((max, material) => {
    const code = String(material.code || "");
    if (!code.startsWith(prefix)) return max;
    const sequence = Number(code.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(maxSequence + 1).padStart(4, "0")}`;
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

function makeDefaultSkuForm(material?: Partial<MaterialForm>): MaterialSkuForm {
  return {
    sku_code: "",
    sku_name: "默认规格",
    spec: material?.spec || "",
    color: material?.color || "",
    unit: material?.unit || "",
    unit_price: material?.unit_price || "0",
    market_price: material?.market_price || "",
    cost_price: material?.cost_price || "",
    internal_control_price: material?.internal_control_price || "",
    stock: "0",
    min_stock: "0",
    image: material?.image || "",
    is_active: true,
  };
}

function skuToForm(sku: MaterialSku): MaterialSkuForm {
  return {
    id: sku.id,
    sku_code: sku.sku_code || "",
    sku_name: sku.sku_name || "默认规格",
    spec: sku.spec || "",
    color: sku.color || "",
    unit: sku.unit || "",
    unit_price: String(sku.unit_price ?? 0),
    market_price: sku.market_price == null ? "" : String(sku.market_price),
    cost_price: sku.cost_price == null ? "" : String(sku.cost_price),
    internal_control_price: sku.internal_control_price == null ? "" : String(sku.internal_control_price),
    stock: String(sku.stock ?? 0),
    min_stock: String(sku.min_stock ?? 0),
    image: sku.image || "",
    is_active: Number(sku.is_active ?? 1) === 1,
  };
}

function makeDefaultForm(materials: Material[] = [], materialType = "AUXILIARY"): MaterialForm {
  const isProduct = materialType === "MAIN";
  return {
    code: makeClientMaterialCode(materials),
    name: "",
    category_parent_id: "",
    category_id: "",
    category_name: "",
    material_type: materialType,
    supply_mode: isProduct ? "SUPPLIER_ORDER" : "WAREHOUSE",
    brand: "",
    product_name: "",
    material_model: "",
    color: "",
    spec: "",
    unit: "",
    unit_price: "0",
    market_price: "",
    cost_price: "",
    internal_control_price: "",
    product_attributes: "{}",
    product_highlights: "",
    product_detail: "",
    supplier_id: "",
    stock: "0",
    min_stock: "0",
    warehouse_name: isProduct ? "" : "直营辅材仓",
    owner_name: "",
    settlement_cycle: "MONTHLY",
    image: "",
	    images: [],
	    skus: isProduct ? [makeDefaultSkuForm()] : [],
	    remark: "",
	  };
}

function materialToForm(material: Material): MaterialForm {
  const images = normalizeMaterialImages(material.images, material.image || "");
  return {
    id: material.id,
    code: material.code || "",
    name: material.name || "",
    category_parent_id: "",
    category_id: material.category_id || "",
    category_name: material.category_name || "",
    material_type: material.material_type || "AUXILIARY",
    supply_mode: material.supply_mode || "WAREHOUSE",
    brand: material.brand || "",
    product_name: material.product_name || "",
    material_model: material.material_model || "",
    color: material.color || "",
    spec: material.spec || "",
    unit: material.unit || "",
    unit_price: String(material.unit_price ?? 0),
    market_price: material.market_price == null ? "" : String(material.market_price),
    cost_price: material.cost_price == null ? "" : String(material.cost_price),
    internal_control_price: material.internal_control_price == null ? "" : String(material.internal_control_price),
    product_attributes: material.product_attributes || "{}",
    product_highlights: material.product_highlights || "",
    product_detail: material.product_detail || "",
    supplier_id: material.supplier_id || "",
    stock: String(material.stock ?? 0),
    min_stock: String(material.min_stock ?? 0),
    warehouse_name: material.warehouse_name || "",
    owner_name: material.owner_name || "",
    settlement_cycle: material.settlement_cycle || "MONTHLY",
	    image: images[0] || "",
	    images,
	    skus: material.material_type === "MAIN"
	      ? (material.skus && material.skus.length > 0
	        ? material.skus.map(skuToForm)
	        : [makeDefaultSkuForm({
	            spec: material.spec || "",
	            color: material.color || "",
	            unit: material.unit || "",
	            unit_price: String(material.unit_price ?? 0),
	            market_price: material.market_price == null ? "" : String(material.market_price),
	            cost_price: material.cost_price == null ? "" : String(material.cost_price),
	            internal_control_price: material.internal_control_price == null ? "" : String(material.internal_control_price),
	            image: images[0] || "",
	          })])
	      : [],
	    remark: material.remark || "",
	  };
}

function getStockWarning(material: Material) {
  const stock = Number(material.stock || 0);
  const minStock = Number(material.min_stock || 0);
  if (stock <= 0) {
    return {
      label: "缺货",
      className: "bg-red-50 text-red-700 ring-red-200",
    };
  }
  if (stock <= minStock) {
    return {
      label: "库存偏低",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }
  return {
    label: "库存正常",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
}

function getStockWarningKey(material: Material) {
  const stock = Number(material.stock || 0);
  const minStock = Number(material.min_stock || 0);
  if (stock <= 0) return "empty";
  if (stock <= minStock) return "low";
  return "normal";
}

function normalizeNumberText(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.max(0, number)) : "0";
}

function cellToText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") {
    const cellValue = value as any;
    if (cellValue.text != null) return String(cellValue.text).trim();
    if (cellValue.result != null) return String(cellValue.result).trim();
    if (Array.isArray(cellValue.richText)) return cellValue.richText.map((item: any) => item?.text || "").join("").trim();
  }
  return String(value).trim();
}

function resolveLabel(value: string, labels: Record<string, string>, fallback: string) {
  const input = value.trim();
  if (!input) return fallback;
  if (labels[input]) return input;
  const matched = Object.entries(labels).find(([, label]) => label === input);
  return matched?.[0] || fallback;
}

function isSupplierUnavailable(material: Material) {
  return !material.supplier_name || Number(material.supplier_is_active ?? 0) !== 1 || ["PAUSED", "BLACKLIST"].includes(material.supplier_cooperation_status || "");
}

function getCategoryMaterialType(category: Category) {
  return category.material_type || category.parent_material_type || "AUXILIARY";
}

const hiddenProductAttributeLabels = new Set(["安装方式"]);

function getVisibleProductAttributes(value?: string | null) {
  return Object.entries(parseProductAttributes(value))
    .map(([label, itemValue]) => [label, String(itemValue || "").trim()] as const)
    .filter(([label, itemValue]) => itemValue && !hiddenProductAttributeLabels.has(label));
}

function getActiveProductSkus(material: Material) {
  const skus = Array.isArray(material.skus) ? material.skus : [];
  const activeSkus = skus.filter((sku) => Number(sku.is_active ?? 1) === 1);
  return activeSkus.length > 0 ? activeSkus : skus;
}

function getMaterialPriceDisplay(material: Material) {
  const skus = material.material_type === "MAIN" ? getActiveProductSkus(material) : [];
  const prices = skus.map((sku) => Number(sku.unit_price || 0)).filter((value) => Number.isFinite(value));
  if (prices.length === 0) return { price: Number(material.unit_price || 0), suffix: "", skuCount: 0 };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { price: min, suffix: prices.length > 1 && min !== max ? "起" : "", skuCount: skus.length };
}

function getMaterialSpecText(material: Material) {
  return [material.brand, material.product_name, material.material_model, material.color, material.spec]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" / ");
}

function getMaterialOrigin(material: Material) {
  const attributes = parseProductAttributes(material.product_attributes);
  return String(attributes["产地"] || attributes["原产地"] || "").trim();
}

function getMaterialPackageCategory(material: Material) {
  const attributes = parseProductAttributes(material.product_attributes);
  const item = material as Material & {
    package_category?: string | null;
    package_type?: string | null;
    package_name?: string | null;
    packageCategory?: string | null;
  };
  return String(item.package_category || item.package_type || item.package_name || item.packageCategory || attributes["套餐类别"] || attributes["套餐类型"] || "").trim();
}

function getMaterialTaxRate(material: Material) {
  const attributes = parseProductAttributes(material.product_attributes);
  const item = material as Material & {
    tax_rate?: number | string | null;
    taxRate?: number | string | null;
  };
  const value = item.tax_rate ?? item.taxRate ?? attributes["税率"];
  if (value == null || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}%` : String(value);
}

function getMaterialDisplayName(material: Material) {
  if ((material.material_type || "AUXILIARY") !== "MAIN") return material.name;
  return makeProductMaterialNameFromParts(material) || material.name;
}

function getPriceTagCode(material: Material) {
  return material.code || material.id.slice(-8).toUpperCase();
}

function getPriceTagAttributes(material: Material) {
  return [
    ["品牌", material.brand],
    ["品名", material.product_name],
    ["型号", material.material_model],
    ["颜色", material.color],
    ["规格", material.spec],
    ["单位", material.unit],
  ].filter(([label]) => label !== "单位").map(([label, value]) => [label, String(value || "").trim() || "-"] as const);
}

function getPriceTagQrPayload(material: Material) {
  return `MAT:${getPriceTagCode(material)}`;
}

async function makePriceTagQrDataUrl(material: Material, size = 180) {
  return QRCode.toDataURL(getPriceTagQrPayload(material), {
    width: size,
    margin: 3,
    color: {
      dark: "#111827",
      light: "#f7f4ef",
    },
    errorCorrectionLevel: "H",
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadCanvasAsPng(canvas: HTMLCanvasElement, fileName: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function downloadDataUrlAsPng(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const chars = Array.from(text);
  const lines: string[] = [];
  let line = "";
  chars.forEach((char) => {
    const nextLine = `${line}${char}`;
    if (context.measureText(nextLine).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = nextLine;
    }
  });
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, maxLines);
  visibleLines.forEach((item, index) => {
    const isLast = index === maxLines - 1 && lines.length > maxLines;
    const finalText = isLast ? `${item.slice(0, Math.max(0, item.length - 1))}...` : item;
    context.fillText(finalText, x, y + index * lineHeight);
  });
  return visibleLines.length;
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function makeMaterialPriceTagCanvas(material: Material, brandLogoUrl: string, brandName: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 620;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const priceDisplay = getMaterialPriceDisplay(material);
  const specText = getMaterialSpecText(material);
  const code = getPriceTagCode(material);
  const tagAttributes = getPriceTagAttributes(material);
  const displayName = getMaterialDisplayName(material);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 18);
  context.clip();

  const scale = canvas.width / 760;
  const sx = (value: number) => Math.round(value * scale);
  const headerHeight = sx(70);
  const bodyPadding = sx(34);
  const bodyTop = headerHeight;
  const rightEdge = canvas.width - bodyPadding;

  context.fillStyle = "#f7f4ef";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111827";
  context.fillRect(0, 0, canvas.width, headerHeight);
  try {
    const logoImage = await loadImage(brandLogoUrl);
    context.save();
    context.beginPath();
    context.roundRect(sx(34), sx(18), sx(34), sx(34), sx(9));
    context.clip();
    context.fillStyle = "#ffffff";
    context.fillRect(sx(34), sx(18), sx(34), sx(34));
    drawContainedImage(context, logoImage, sx(34), sx(18), sx(34), sx(34));
    context.restore();
  } catch {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.roundRect(sx(34), sx(18), sx(34), sx(34), sx(9));
    context.fill();
  }
  context.textAlign = "left";
  context.fillStyle = "#ffffff";
  context.font = `800 ${sx(22)}px Arial, sans-serif`;
  context.fillText(brandName || "切尔东装饰", sx(80), sx(44));
  context.font = `800 ${sx(11)}px Arial, sans-serif`;
  context.fillStyle = "rgba(255,255,255,0.62)";
  context.textAlign = "right";
  context.fillText("MATERIAL PRICE LABEL", rightEdge, sx(44));

  context.fillStyle = "#9ca3af";
  context.font = `850 ${sx(12)}px Arial, sans-serif`;
  context.textAlign = "right";
  context.fillText(code, rightEdge, bodyTop + sx(40));
  context.textAlign = "left";

  context.fillStyle = "#ede6dc";
  context.fillRect(bodyPadding, bodyTop + sx(30), sx(120), sx(30));
  context.fillStyle = "#554b3f";
  context.font = `800 ${sx(13)}px Arial, sans-serif`;
  context.fillText(material.category_name || "未设置分类", bodyPadding + sx(14), bodyTop + sx(50));

  context.fillStyle = "#111827";
  context.font = `850 ${sx(24)}px Arial, sans-serif`;
  const titleLineCount = drawWrappedText(context, displayName || "未命名材料", bodyPadding, bodyTop + sx(126), sx(360), sx(30), 2);

  context.fillStyle = "#6b7280";
  context.font = `650 ${sx(14)}px Arial, sans-serif`;
  drawWrappedText(context, specText || "规格信息未维护", bodyPadding, bodyTop + sx(172), sx(440), sx(22), 1);

  tagAttributes.slice(0, 5).forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = bodyPadding + sx(column * 220);
    const y = bodyTop + sx(268 + row * 43);
    context.fillStyle = "#9ca3af";
    context.font = `800 ${sx(10)}px Arial, sans-serif`;
    context.fillText(`${label}`, x, y);
    context.fillStyle = "#4b5563";
    context.font = `800 ${sx(12)}px Arial, sans-serif`;
    drawWrappedText(context, value, x, y + sx(18), sx(190), sx(18), 1);
  });

  context.fillStyle = "#dc2626";
  context.font = `800 ${sx(51)}px "Avenir Next Condensed", "DIN Condensed", "Roboto Condensed", "Arial Narrow", Arial, sans-serif`;
  context.textAlign = "right";
  const priceBaseline = bodyTop + sx(titleLineCount > 1 ? 160 : 148);
  context.fillText(`¥${formatAmount(priceDisplay.price)}`, priceDisplay.suffix ? sx(610) : sx(645), priceBaseline);
  if (priceDisplay.suffix) {
    context.font = `800 ${sx(22)}px "Avenir Next Condensed", "DIN Condensed", "Roboto Condensed", "Arial Narrow", Arial, sans-serif`;
    context.fillText(priceDisplay.suffix, sx(654), priceBaseline);
  }
  context.fillStyle = "#6b7280";
  context.font = `800 ${sx(17)}px Arial, sans-serif`;
  context.fillText(`/${material.unit || "件"}`, rightEdge, priceBaseline);
  if (priceDisplay.skuCount > 1) {
    context.fillStyle = "#fff5f5";
    context.fillRect(rightEdge - sx(154), bodyTop + sx(286), sx(154), sx(34));
    context.strokeStyle = "#fecaca";
    context.strokeRect(rightEdge - sx(154), bodyTop + sx(286), sx(154), sx(34));
    context.fillStyle = "#dc2626";
    context.font = `850 ${sx(13)}px Arial, sans-serif`;
    context.fillText(`${priceDisplay.skuCount} 个规格可选`, rightEdge - sx(14), bodyTop + sx(308));
  }

  context.textAlign = "left";
  const qrDataUrl = await makePriceTagQrDataUrl(material, 160);
  const qrImage = await loadImage(qrDataUrl);
  const qrSize = sx(118);
  const qrX = rightEdge - qrSize;
  const qrY = bodyTop + sx(230);
  context.fillStyle = "#f7f4ef";
  context.fillRect(qrX, qrY, qrSize, qrSize);
  context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  context.fillStyle = "#6b7280";
  context.font = `700 ${sx(10)}px Arial, sans-serif`;
  context.textAlign = "center";
  drawWrappedText(context, "扫码查看材料信息，实际下单以系统为准", qrX + qrSize / 2, bodyTop + sx(366), sx(154), sx(16), 2);
  context.restore();
  return canvas;
}

function getProductDetailAttributes(material: Material) {
  const attributes = parseProductAttributes(material.product_attributes);
  const templateLabels = getProductAttributeLabels([material.category_name, material.product_name, material.name].filter(Boolean).join(" / "));
  const extraLabels = Object.keys(attributes).filter((label) => !templateLabels.includes(label) && !hiddenProductAttributeLabels.has(label));
  return [...templateLabels, ...extraLabels]
    .filter((label) => !hiddenProductAttributeLabels.has(label))
    .map((label) => {
      const value = String(attributes[label] || "").trim();
      return [label, value, !value] as const;
    });
}

async function parseXlsx(file: File) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map(cellToText);
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (!values.some((value) => cellToText(value))) return;
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = cellToText(values[index]);
    });
    rows.push(item);
  });
  return rows;
}

async function downloadXlsx(headers: string[], rows: any[][], sheetName: string, fileName: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows([headers, ...rows] as any[][]);
  sheet.columns.forEach((column, index) => {
    const maxLength = Math.max(...[headers, ...rows].map((row) => String(row[index] ?? "").replace(/[^\x00-\xff]/g, "aa").length), 10);
    column.width = Math.min(Math.max(maxLength + 4, 12), index === 15 ? 42 : 28);
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 22;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
      cell.alignment = { vertical: "middle", horizontal: row.number === 1 ? "center" : undefined, wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (row.number === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadImportTemplate(categories: Category[], suppliers: Supplier[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("材料导入模板");
  const selectableCategories = categories
    .filter((category) => Number(category.is_active ?? 1) === 1 && category.parent_id && Number(category.parent_is_active ?? 1) === 1)
    .map(formatCategoryOption);
  const selectableSuppliers = suppliers.map((supplier) => supplier.name).filter(Boolean);
  const selectableMaterialTypes = Object.values(materialTypeLabels);
  const selectableSupplyModes = Object.values(supplyModeLabels);
  const optionSheet = workbook.addWorksheet("选项");
  optionSheet.state = "hidden";
  selectableCategories.forEach((category, index) => {
    optionSheet.getCell(index + 1, 1).value = category;
  });
  selectableSuppliers.forEach((supplier, index) => {
    optionSheet.getCell(index + 1, 2).value = supplier;
  });
  selectableMaterialTypes.forEach((type, index) => {
    optionSheet.getCell(index + 1, 3).value = type;
  });
  selectableSupplyModes.forEach((mode, index) => {
    optionSheet.getCell(index + 1, 4).value = mode;
  });
  const blankRows = Array.from({ length: 50 }, () => importTemplateHeaders.map(() => ""));
  sheet.addRows([importTemplateHeaders, ...blankRows] as any[][]);
  sheet.columns.forEach((column, index) => {
    const widths = [18, 24, 28, 16, 16, 18, 14, 22, 12, 12, 12, 24, 12, 12, 32];
    column.width = widths[index] || 16;
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 22;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
      cell.alignment = { vertical: "middle", horizontal: row.number === 1 ? "center" : undefined, wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (row.number === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  });
  const categoryCol = importTemplateHeaders.indexOf("材料类别") + 1;
  const materialTypeCol = importTemplateHeaders.indexOf("材料类型") + 1;
  const supplyModeCol = importTemplateHeaders.indexOf("供应方式") + 1;
  const supplierCol = importTemplateHeaders.indexOf("供应商") + 1;
  for (let rowNumber = 2; rowNumber <= 51; rowNumber += 1) {
    if (selectableCategories.length > 0) {
      sheet.getCell(rowNumber, categoryCol).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'选项'!$A$1:$A$${selectableCategories.length}`],
        showErrorMessage: true,
        errorTitle: "请选择材料类别",
        error: "请从下拉列表选择已启用的二级材料类别。",
      };
    }
    sheet.getCell(rowNumber, materialTypeCol).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'选项'!$C$1:$C$${selectableMaterialTypes.length}`],
      showErrorMessage: true,
      errorTitle: "请选择材料类型",
      error: "请选择辅材或产品。",
    };
    sheet.getCell(rowNumber, supplyModeCol).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`'选项'!$D$1:$D$${selectableSupplyModes.length}`],
      showErrorMessage: true,
      errorTitle: "请选择供应方式",
      error: "请选择公司仓库、线下月结或供应商下单。",
    };
    if (selectableSuppliers.length > 0) {
      sheet.getCell(rowNumber, supplierCol).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`'选项'!$B$1:$B$${selectableSuppliers.length}`],
        showErrorMessage: true,
        errorTitle: "请选择供应商",
        error: "请从下拉列表选择已维护的供应商。",
      };
    }
  }

  const ruleSheet = workbook.addWorksheet("填写说明");
  ruleSheet.addRows([
    ["字段", "要求", "说明"],
    ["材料编码", "选填", "同公司内唯一；填写已有编码会更新原材料，留空则系统自动生成 XY 开头编码。"],
    ["材料类别", "必填", "请从下拉列表选择已启用的二级分类；没有二级分类的一级分类不会出现在模板中。"],
    ["材料类型", "必填", "辅材用于项目经理下单和仓库库存；产品用于报价选品，例如瓷砖、洁具、木门、灯具。"],
    ["供应方式", "选填", "辅材通常选公司仓库或线下月结；产品通常选供应商下单。"],
    ["品名", "必填", "说明这是什么材料，如：保护膜、PPR管、角阀、地漏。"],
    ["品牌/品名/型号/颜色/规格", "自动生成", "材料名称由系统自动按“品牌 品名 型号 颜色 规格”生成，空字段会自动跳过。"],
    ["商品图片", "选填", "导入时可填写主图地址；本地图片请在新增/编辑材料时多图上传。"],
    ["单位", "选填", "如：米、个、片、套；没有单位可留空。"],
    ["入库价/市场价/出库价", "数字", "非数字会按 0 处理；产品可维护市场价用于对比参考。"],
    ["库存", "不在材料库维护", "库存和预警库存请到「材料管理 / 库存管理」中调整，系统会自动生成出入库流水。"],
    ["供应商", "必填", "请从下拉列表选择已有供应商；负责人和结算周期会根据供应商自动带出。"],
  ]);
  ruleSheet.columns = [{ width: 18 }, { width: 16 }, { width: 78 }];
  ruleSheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 34;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (row.number === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `材料导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function MaterialLibraryPageContent({ fixedLibraryType = "AUXILIARY" }: { fixedLibraryType?: FixedLibraryType }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState("");
  const libraryType = fixedLibraryType;
  const [displayMode, setDisplayMode] = useState<MaterialDisplayMode>(() => getStoredDisplayMode(fixedLibraryType) || getDefaultDisplayMode(fixedLibraryType));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [stockWarningFilter, setStockWarningFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sortMode, setSortMode] = useState<MaterialSortMode>("default");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [activeParentCategoryId, setActiveParentCategoryId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importErrors, setImportErrors] = useState<ImportErrorItem[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<{ src: string; name: string; spec: string; x: number; y: number } | null>(null);
  const [pricePreview, setPricePreview] = useState<{ material: Material; type: "cost" | "sale"; x: number; y: number } | null>(null);
  const [productPreview, setProductPreview] = useState<Material | null>(null);
  const [priceTagPreview, setPriceTagPreview] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialForm>(makeDefaultForm([], "AUXILIARY"));
  const [pendingMaterialImages, setPendingMaterialImages] = useState<PendingMaterialImage[]>([]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllMaterialsRef = useRef<HTMLInputElement | null>(null);
  const categoryPickerRef = useRef<HTMLDivElement | null>(null);
  const isErrorMessage = /失败|请|缺少|没有|错误|不能|不存在|未找到|未上架/.test(message);
  const brandName = useMemo(() => {
    const orgBrandName = String(user?.sidebarBrandName || "").trim();
    if (orgBrandName) return orgBrandName;
    const shortName = String(user?.companyShortName || "").trim();
    return shortName ? Array.from(shortName).slice(0, 6).join("") : "切尔东装饰";
  }, [user?.companyShortName, user?.sidebarBrandName]);
  const brandLogoUrl = String(user?.sidebarBrandLogoUrl || "").trim();

  useEffect(() => {
    setDisplayMode(getStoredDisplayMode(libraryType) || getDefaultDisplayMode(libraryType));
  }, [libraryType]);

  const changeDisplayMode = (mode: MaterialDisplayMode) => {
    setDisplayMode(mode);
    storeDisplayMode(libraryType, mode);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ materials: Material[]; categories: Category[]; suppliers: Supplier[] }>("/api/materials?view=library");
      setMaterials(data.materials || []);
      setCategories(data.categories || []);
      setSuppliers(data.suppliers || []);
    } catch (error: any) {
      setMessage(error?.message || "材料库加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!message || importOpen) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [importOpen, message]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!categoryPickerRef.current?.contains(event.target as Node)) setCategoryPickerOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [categoryPickerOpen]);

  const activeCategories = useMemo(() => categories.filter((category) => (
    Number(category.is_active ?? 1) === 1 &&
    (!category.parent_id || Number(category.parent_is_active ?? 1) === 1) &&
    getCategoryMaterialType(category) === libraryType
  )), [categories, libraryType]);
  const categoryOptions = useMemo(() => {
    const parents = activeCategories.filter((category) => !category.parent_id);
    return parents.map((parent) => ({
      parent,
      children: activeCategories.filter((category) => category.parent_id === parent.id),
    }));
  }, [activeCategories]);
  const selectedCategory = useMemo(() => activeCategories.find((category) => category.id === categoryFilter), [activeCategories, categoryFilter]);
  const activeParentCategory = useMemo(() => {
    const selectedParentId = activeParentCategoryId || selectedCategory?.parent_id || selectedCategory?.id || categoryOptions[0]?.parent.id || "";
    return categoryOptions.find((item) => item.parent.id === selectedParentId) || categoryOptions[0] || null;
  }, [activeParentCategoryId, categoryOptions, selectedCategory]);
  const categoryFilterLabel = selectedCategory
    ? (selectedCategory.parent_id ? selectedCategory.name : `全部${selectedCategory.name}`)
    : "全部分类";
  const categoryFilterIds = useMemo(() => {
    if (!categoryFilter) return null;
    const selected = activeCategories.find((category) => category.id === categoryFilter);
    if (!selected) return new Set([categoryFilter]);
    if (selected.parent_id) return new Set([selected.id]);
    return new Set([selected.id, ...activeCategories.filter((category) => category.parent_id === selected.id).map((category) => category.id)]);
  }, [activeCategories, categoryFilter]);
  const brandOptions = useMemo(() => (
    Array.from(new Set(materials
      .filter((material) => (material.material_type || "AUXILIARY") === libraryType)
      .map((material) => String(material.brand || "").trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
  ), [libraryType, materials]);
  const normalizedPriceMin = useMemo(() => {
    if (!priceMin.trim()) return null;
    const value = Number(priceMin);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }, [priceMin]);
  const normalizedPriceMax = useMemo(() => {
    if (!priceMax.trim()) return null;
    const value = Number(priceMax);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }, [priceMax]);

  const filteredMaterials = useMemo(() => {
	    const keyword = search.trim().toLowerCase();
	    return materials.filter((material) => {
	      if ((material.material_type || "AUXILIARY") !== libraryType) return false;
	      const active = Number(material.is_active ?? 1) === 1;
	      if (statusFilter === "active" && !active) return false;
	      if (statusFilter === "inactive" && active) return false;
	      if (stockWarningFilter && getStockWarningKey(material) !== stockWarningFilter) return false;
	      if (categoryFilterIds && !categoryFilterIds.has(material.category_id || "")) return false;
	      if (brandFilter && String(material.brand || "").trim() !== brandFilter) return false;
	      const displayPrice = getMaterialPriceDisplay(material).price;
	      if (normalizedPriceMin != null && displayPrice < normalizedPriceMin) return false;
	      if (normalizedPriceMax != null && displayPrice > normalizedPriceMax) return false;
	      if (!keyword) return true;
	      return [
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
        material.warehouse_name,
        material.owner_name,
        material.remark,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword));
    });
	  }, [brandFilter, categoryFilterIds, libraryType, materials, normalizedPriceMax, normalizedPriceMin, search, statusFilter, stockWarningFilter]);
  const sortedMaterials = useMemo(() => {
    const items = [...filteredMaterials];
    if (sortMode === "default") return items;
    return items.sort((a, b) => {
      if (sortMode === "sales") {
        return Number(b.order_quantity || 0) - Number(a.order_quantity || 0);
      }
      if (sortMode === "popular") {
        return Number(b.order_count || 0) - Number(a.order_count || 0);
      }
      const aPrice = getMaterialPriceDisplay(a).price;
      const bPrice = getMaterialPriceDisplay(b).price;
      return sortMode === "priceAsc" ? aPrice - bPrice : bPrice - aPrice;
    });
  }, [filteredMaterials, sortMode]);
  const currentLibraryMeta = materialLibraryMeta[libraryType];
  const inactiveFilteredMaterials = useMemo(
    () => sortedMaterials.filter((material) => Number(material.is_active ?? 1) !== 1),
    [sortedMaterials],
  );
  const filteredMaterialIds = useMemo(() => sortedMaterials.map((material) => material.id), [sortedMaterials]);
  const activeFilteredMaterials = useMemo(
    () => sortedMaterials.filter((material) => Number(material.is_active ?? 1) === 1),
    [sortedMaterials],
  );
  const selectedFilteredMaterials = useMemo(
    () => sortedMaterials.filter((material) => selectedMaterialIds.includes(material.id)),
    [selectedMaterialIds, sortedMaterials],
  );
  const selectedActiveMaterials = useMemo(
    () => activeFilteredMaterials.filter((material) => selectedMaterialIds.includes(material.id)),
    [activeFilteredMaterials, selectedMaterialIds],
  );
  const selectedInactiveMaterials = useMemo(
    () => inactiveFilteredMaterials.filter((material) => selectedMaterialIds.includes(material.id)),
    [inactiveFilteredMaterials, selectedMaterialIds],
  );
  const selectedMaterialCount = selectedFilteredMaterials.length;
  const selectedActiveCount = selectedActiveMaterials.length;
  const selectedInactiveCount = selectedInactiveMaterials.length;
  const showBatchSelection = sortedMaterials.length > 0;
  const allFilteredSelected = showBatchSelection && selectedMaterialCount === sortedMaterials.length;
  const materialPagination = useDataPagination(
    sortedMaterials,
    [libraryType, search, statusFilter, stockWarningFilter, categoryFilter, brandFilter, sortMode, priceMin, priceMax].join("|"),
    displayMode === "grid" ? GRID_DEFAULT_PAGE_SIZE : TABLE_DEFAULT_PAGE_SIZE,
  );
  const materialPageSizeOptions = useMemo(() => (
    Array.from(new Set([displayMode === "grid" ? GRID_DEFAULT_PAGE_SIZE : TABLE_DEFAULT_PAGE_SIZE, 20, 50, 100])).sort((a, b) => a - b)
  ), [displayMode]);
  const canClearFilters = materials.length > 0 && Boolean(search.trim() || statusFilter || stockWarningFilter || categoryFilter || brandFilter || sortMode !== "default" || priceMin || priceMax);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setStockWarningFilter("");
    setCategoryFilter("");
    setBrandFilter("");
    setSortMode("default");
    setPriceMin("");
    setPriceMax("");
    setActiveParentCategoryId("");
    setCategoryPickerOpen(false);
  };

  const downloadPriceTag = async (material: Material, priceTagElement?: HTMLElement | null) => {
    const code = getPriceTagCode(material);
    const fileName = `商品价签-${getMaterialDisplayName(material) || code}.png`;
    if (priceTagElement) {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(priceTagElement, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#f7f4ef",
      });
      downloadDataUrlAsPng(dataUrl, fileName);
      return;
    }
    const canvas = await makeMaterialPriceTagCanvas(material, brandLogoUrl, brandName);
    downloadCanvasAsPng(canvas, fileName);
  };

  useEffect(() => {
    const visibleIds = new Set(filteredMaterialIds);
    setSelectedMaterialIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredMaterialIds]);

  useEffect(() => {
    if (!selectAllMaterialsRef.current) return;
    selectAllMaterialsRef.current.indeterminate = selectedMaterialCount > 0 && selectedMaterialCount < sortedMaterials.length;
  }, [selectedMaterialCount, sortedMaterials.length]);

  const clearPendingMaterialImages = () => {
    pendingMaterialImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingMaterialImages([]);
  };

  const closeEditor = () => {
    clearPendingMaterialImages();
    setEditorOpen(false);
  };

  const updateMaterialForm = (patch: Partial<MaterialForm>) => {
    if (patch.images) {
      const retainedImages = new Set(patch.images);
      setPendingMaterialImages((current) => current.filter((item) => {
        if (retainedImages.has(item.previewUrl)) return true;
        URL.revokeObjectURL(item.previewUrl);
        return false;
      }));
    }
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.material_type && patch.material_type !== current.material_type) {
        const isProduct = patch.material_type === "MAIN";
        next.supply_mode = isProduct ? "SUPPLIER_ORDER" : "WAREHOUSE";
        next.warehouse_name = isProduct ? "" : (current.warehouse_name || "直营辅材仓");
      }
      return next;
    });
  };

  const openCreate = () => {
    clearPendingMaterialImages();
    setForm(makeDefaultForm(materials, libraryType));
    setEditorOpen(true);
    setMessage("");
  };

  const openEdit = (material: Material) => {
    clearPendingMaterialImages();
    const category = categories.find((item) => item.id === material.category_id);
    setForm({
      ...materialToForm(material),
      category_parent_id: category?.parent_id || category?.id || "",
    });
    setEditorOpen(true);
    setMessage("");
  };

  const toggleSelectMaterial = (materialId: string, checked: boolean) => {
    setSelectedMaterialIds((current) => {
      if (checked) return current.includes(materialId) ? current : [...current, materialId];
      return current.filter((id) => id !== materialId);
    });
  };

  const toggleSelectAllMaterials = (checked: boolean) => {
    setSelectedMaterialIds((current) => {
      const visibleIds = new Set(filteredMaterialIds);
      if (!checked) return current.filter((id) => !visibleIds.has(id));
      return Array.from(new Set([...current, ...filteredMaterialIds]));
    });
  };

  const uploadImageFilesForMaterial = async (materialId: string, images: PendingMaterialImage[]) => {
    const uploadedByPreview = new Map<string, string>();
    for (const image of images) {
      const formData = new FormData();
      formData.append("file", image.file);
      formData.append("material_id", materialId);
      formData.append("category", "材料商品图");
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || "上传商品图片失败");
      if (result.file_url) uploadedByPreview.set(image.previewUrl, result.file_url);
    }
    return uploadedByPreview;
  };

  const makeMaterialPayload = (action: "add_material" | "update_material", images: string[], id?: string) => {
    const normalizedSkus = form.material_type === "MAIN"
      ? form.skus.map((sku, index) => ({
          ...sku,
          sort_order: index + 1,
          unit_price: normalizeNumberText(sku.unit_price),
          market_price: sku.market_price === "" ? "" : normalizeNumberText(sku.market_price),
          cost_price: sku.cost_price === "" ? "" : normalizeNumberText(sku.cost_price),
          internal_control_price: sku.internal_control_price === "" ? "" : normalizeNumberText(sku.internal_control_price),
          stock: normalizeNumberText(sku.stock),
          min_stock: normalizeNumberText(sku.min_stock),
          is_active: sku.is_active,
        }))
      : [];
    const firstSku = normalizedSkus.find((sku) => sku.is_active) || normalizedSkus[0];
    return {
      ...form,
      id: id || form.id,
      name: form.material_type === "MAIN" ? makeProductMaterialNameFromParts(form) : makeMaterialNameFromParts(form),
      action,
      unit: form.material_type === "MAIN" ? (firstSku?.unit || form.unit) : form.unit,
      unit_price: form.material_type === "MAIN" ? (firstSku?.unit_price || normalizeNumberText(form.unit_price)) : normalizeNumberText(form.unit_price),
      market_price: form.material_type === "MAIN" ? (firstSku?.market_price ?? form.market_price) : (form.market_price === "" ? "" : normalizeNumberText(form.market_price)),
      cost_price: form.material_type === "MAIN" ? (firstSku?.cost_price ?? form.cost_price) : (form.cost_price === "" ? "" : normalizeNumberText(form.cost_price)),
      internal_control_price: form.material_type === "MAIN" ? (firstSku?.internal_control_price ?? form.internal_control_price) : (form.internal_control_price === "" ? "" : normalizeNumberText(form.internal_control_price)),
      spec: form.material_type === "MAIN" ? "" : form.spec,
      color: form.material_type === "MAIN" ? "" : form.color,
      image: images[0] || "",
      images,
      skus: normalizedSkus,
    };
  };

  const saveMaterial = async () => {
    if (!form.product_name.trim()) {
      setMessage("请填写品名，例如保护膜、PPR管、角阀");
      return;
    }
    if (!form.supplier_id) {
      setMessage("请选择供应商");
      return;
    }
    if (!form.category_parent_id) {
      setMessage("请选择一级分类");
      return;
    }
	    if (!form.category_id) {
	      setMessage("请选择二级分类");
	      return;
	    }
    if (form.material_type === "MAIN") {
      const activeSkus = form.skus.filter((sku) => sku.is_active);
      if (activeSkus.length === 0) {
        setMessage("产品至少需要保留一个启用规格");
        return;
      }
      const invalidSku = activeSkus.find((sku) => !sku.sku_name.trim() || Number(sku.unit_price || 0) <= 0);
      if (invalidSku) {
        setMessage("请填写每个启用规格的规格名称和客户价");
        return;
      }
    }
    setSaving(true);
    setMessage("");
    let createdMaterialId = "";
    try {
      const pendingPreviewUrls = new Set(pendingMaterialImages.map((item) => item.previewUrl));
      const persistedImages = form.images.filter((image) => !pendingPreviewUrls.has(image));
      const action = form.id ? "update_material" : "add_material";
      const result = await api.post<{ id?: string }>("/api/materials", makeMaterialPayload(action, persistedImages));
      createdMaterialId = form.id ? "" : String(result?.id || "");

      if (!form.id && pendingMaterialImages.length > 0) {
        if (!createdMaterialId) throw new Error("材料已创建，但未返回材料ID");
        const uploadedByPreview = await uploadImageFilesForMaterial(createdMaterialId, pendingMaterialImages);
        const finalImages = form.images
          .map((image) => uploadedByPreview.get(image) || image)
          .filter((image) => !image.startsWith("blob:"));
        await api.post("/api/materials", makeMaterialPayload("update_material", finalImages, createdMaterialId));
      }

      setMessage(form.id ? "材料已更新" : "材料已新增");
      closeEditor();
      await loadData();
    } catch (error: any) {
      if (createdMaterialId) {
        setMessage("材料已新增，但图片上传失败，请打开该材料重新上传图片");
        closeEditor();
        await loadData();
      } else {
        setMessage(error?.message || "保存材料失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleMaterialStatus = async (material: Material) => {
    const active = Number(material.is_active ?? 1) === 1;
    if (!active && isSupplierUnavailable(material)) {
      setMessage(`供应商「${material.supplier_name || "未设置供应商"}」不是合作中状态，材料不能上架`);
      return;
    }
    const displayName = getMaterialDisplayName(material);
    if (!window.confirm(active ? `确定下架材料「${displayName}」吗？下架后不会出现在常规可用材料中。` : `确定重新上架材料「${displayName}」吗？`)) return;
    setSaving(true);
    setMessage("");
    try {
      await api.post("/api/materials", { action: "toggle_material_status", id: material.id, is_active: active ? 0 : 1 });
      setMessage(active ? "材料已下架" : "材料已重新上架");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || (active ? "下架材料失败" : "重新上架失败"));
    } finally {
      setSaving(false);
    }
  };

  const batchUpdateMaterialStatus = async (nextActive: boolean) => {
    const targetMaterials = nextActive ? selectedInactiveMaterials : selectedActiveMaterials;
    if (targetMaterials.length === 0) {
      setMessage(nextActive ? "请先勾选需要上架的已下架材料" : "请先勾选需要下架的在售材料");
      return;
    }
    const blockedCount = nextActive ? targetMaterials.filter(isSupplierUnavailable).length : 0;
    const confirmText = nextActive
      ? blockedCount > 0
        ? `确定上架已勾选的 ${targetMaterials.length} 个已下架材料吗？其中 ${blockedCount} 个因供应商非合作中状态将不会上架。`
        : `确定上架已勾选的 ${targetMaterials.length} 个已下架材料吗？`
      : `确定下架已勾选的 ${targetMaterials.length} 个在售材料吗？下架后不会出现在常规可用材料中。`;
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await api.post<{
        success: boolean;
        updatedCount: number;
        restoredCount?: number;
        archivedCount?: number;
        blockedCount: number;
        missingCount: number;
      }>("/api/materials", {
        action: "batch_update_material_status",
        ids: targetMaterials.map((material) => material.id),
        is_active: nextActive ? 1 : 0,
      });
      if (nextActive) {
        const restoredCount = result.restoredCount ?? result.updatedCount ?? 0;
        if (restoredCount > 0 && result.blockedCount > 0) {
          setMessage(`已上架 ${restoredCount} 个，${result.blockedCount} 个因供应商非合作中未上架`);
        } else if (restoredCount > 0) {
          setMessage(`已上架 ${restoredCount} 个材料`);
        } else if (result.blockedCount > 0) {
          setMessage("未上架材料：供应商不是合作中状态");
        } else {
          setMessage("当前没有可上架的材料");
        }
      } else if ((result.archivedCount ?? result.updatedCount ?? 0) > 0) {
        setMessage(`已下架 ${result.archivedCount ?? result.updatedCount} 个材料`);
      } else {
        setMessage("当前没有可下架的材料");
      }
      setSelectedMaterialIds([]);
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || (nextActive ? "批量上架失败" : "批量下架失败"));
    } finally {
      setSaving(false);
    }
  };

  const exportMaterials = async () => {
    const rows = sortedMaterials.map((material) => [
      material.code || "",
      material.category_name || "",
      materialTypeLabels[material.material_type || "AUXILIARY"] || "辅材",
      supplyModeLabels[material.supply_mode || "WAREHOUSE"] || "公司仓库",
      getMaterialDisplayName(material) || "",
      normalizeMaterialImages(material.images, material.image || "").join("；"),
      material.brand || "",
      material.product_name || "",
      material.material_model || "",
      material.color || "",
      material.spec || "",
      material.unit || "",
      formatAmount(material.cost_price),
      formatAmount(material.market_price),
      formatAmount(material.unit_price),
      formatAmount(material.internal_control_price),
      material.supplier_name || "",
      Number(material.stock || 0),
      Number(material.min_stock || 0),
      material.warehouse_name || "",
      material.owner_name || "",
      settlementCycleLabels[material.settlement_cycle || "MONTHLY"] || "月结",
      material.remark || "",
    ]);
    await downloadXlsx(exportHeaders, rows, currentLibraryMeta.label, `${currentLibraryMeta.label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadTemplate = async () => {
    await downloadImportTemplate(activeCategories, suppliers);
  };

  const importMaterials = async (file: File) => {
    setSaving(true);
    setImportFileName(file.name);
    setMessage("");
    setImportErrors([]);
    try {
      const rows = await parseXlsx(file);
      if (rows.length < 1) {
        setMessage("导入文件没有可识别的材料数据");
        return;
      }
      let successCount = 0;
      const errors: ImportErrorItem[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;
        const rowMaterialType = fixedLibraryType === "MAIN" ? "MAIN" : (row["材料类型"] || row["类型"] || fixedLibraryType || "AUXILIARY");
        const generatedName = rowMaterialType === "MAIN" ? makeProductMaterialNameFromParts({
          brand: row["品牌"] || "",
          product_name: row["品名"] || row["材料品名"] || "",
          material_model: row["型号"] || row["材料型号"] || "",
        }) : makeMaterialNameFromParts({
          brand: row["品牌"] || "",
          product_name: row["品名"] || row["材料品名"] || "",
          material_model: row["型号"] || row["材料型号"] || "",
          color: row["颜色"] || "",
          spec: row["规格"] || "",
        });
        if (!String(row["品名"] || row["材料品名"] || "").trim()) {
          errors.push({ rowNumber, name: generatedName || "-", reason: "品名不能为空" });
          continue;
        }
        try {
          await api.post("/api/materials", {
            action: "import_material",
            code: row["材料编码"] || row["编码"] || "",
            category_name: row["材料类别"] || row["类别"] || "",
            material_type: resolveLabel(row["材料类型"] || "", materialTypeLabels, libraryType),
            supply_mode: resolveLabel(row["供应方式"] || "", supplyModeLabels, libraryType === "MAIN" ? "SUPPLIER_ORDER" : "WAREHOUSE"),
            name: generatedName,
            image: row["商品图片"] || row["图片"] || "",
            brand: row["品牌"] || "",
            product_name: row["品名"] || row["材料品名"] || "",
            material_model: row["型号"] || row["材料型号"] || "",
            color: row["颜色"] || "",
            spec: row["规格"] || "",
            unit: row["单位"] || "",
            cost_price: normalizeNumberText(row["入库价/采购价"] || row["采购价"] || row["入库价"] || row["成本价"] || "0"),
            market_price: normalizeNumberText(row["市场价"] || ""),
            unit_price: normalizeNumberText(row["出库价/客户价"] || row["客户价"] || row["出库价"] || row["销售价"] || row["单价"] || "0"),
            internal_control_price: normalizeNumberText(row["内控价"] || ""),
            supplier_name: row["供应商"] || "",
            remark: row["备注"] || "",
          });
          successCount += 1;
        } catch (error: any) {
          errors.push({
            rowNumber,
            name: generatedName,
            reason: error?.message || "导入失败，请检查该行数据",
          });
        }
      }
      setImportErrors(errors);
      setMessage(errors.length > 0 ? `导入完成：成功 ${successCount} 条，失败 ${errors.length} 条` : `导入完成：成功 ${successCount} 条`);
      if (successCount > 0 && errors.length === 0) setImportOpen(false);
      await loadData();
    } catch (error: any) {
      const reason = error?.message || "导入材料失败，请检查表格格式";
      setMessage(reason);
      setImportErrors([{ rowNumber: 0, name: "文件解析", reason }]);
    } finally {
      setSaving(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const uploadMaterialImages = async (files?: FileList | File[] | null) => {
    const imageFiles = Array.from(files || []);
    if (imageFiles.length === 0) return;
    if (imageFiles.some((file) => !file.type.startsWith("image/"))) {
      setMessage("请上传图片文件");
      return;
    }
    setMessage("");
    if (!form.id) {
      const pendingImages = imageFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
      setPendingMaterialImages((current) => [...current, ...pendingImages]);
      setForm((current) => {
        const images = normalizeMaterialImages([...current.images, ...pendingImages.map((item) => item.previewUrl)]);
        return { ...current, images, image: images[0] || "" };
      });
      setMessage(pendingImages.length > 1 ? `已选择 ${pendingImages.length} 张图片，保存材料时上传` : "图片已选择，保存材料时上传");
      return;
    }

    const uploadItems = imageFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setUploadingImage(true);
    try {
      const uploadedByPreview = await uploadImageFilesForMaterial(form.id, uploadItems);
      const uploadedUrls = Array.from(uploadedByPreview.values());
      setForm((current) => {
        const images = normalizeMaterialImages([...current.images, ...uploadedUrls]);
        return { ...current, images, image: images[0] || "" };
      });
      setMessage(uploadedUrls.length > 1 ? `已上传 ${uploadedUrls.length} 张商品图片` : "商品图片已上传");
    } catch (error: any) {
      setMessage(error?.message || "上传商品图片失败");
    } finally {
      uploadItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page-surface material-workbench-ui materials-design-ui materials-library-ui flex h-full min-h-0 items-center justify-center bg-[#F5F7FB] text-surface-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {currentLibraryMeta.label}加载中...
      </div>
    );
  }

  return (
    <div className="app-page-surface enterprise-list-ui material-workbench-ui materials-design-ui materials-library-ui materials-library-page flex h-full min-h-0 flex-col bg-[#F5F7FB]">
      <section className="table-shell quota-list-shell materials-list-panel flex min-h-0 flex-1 flex-col overflow-hidden border border-surface-200/90 bg-white/95">
        <div className="quota-list-toolbar quota-library-toolbar materials-toolbar flex shrink-0 flex-col gap-2 border-b border-surface-200/90 bg-white/95 p-4">
          <div className="materials-toolbar-main flex min-w-0 items-center justify-between gap-3">
            <div className="quota-search-control materials-search-control flex min-h-10 min-w-0 flex-1 items-center gap-2 border border-surface-200 bg-white px-3 text-sm text-surface-500">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-surface-400"
                placeholder="搜索编码、材料、品牌、型号、类别或供应商"
              />
            </div>
            <div className="materials-toolbar-actions flex shrink-0 items-center gap-2">
              {showBatchSelection && (selectedActiveCount > 0 || statusFilter === "active") && (
                <button
                  type="button"
                  onClick={() => batchUpdateMaterialStatus(false)}
                  className="materials-batch-action inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={saving || selectedActiveCount === 0}
                  title={selectedActiveCount > 0 ? "下架已勾选材料" : "请先勾选在售材料"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  下架选中{selectedActiveCount > 0 ? ` ${selectedActiveCount}` : ""}
                </button>
              )}
              {showBatchSelection && (selectedInactiveCount > 0 || statusFilter === "inactive") && (
                <button
                  type="button"
                  onClick={() => batchUpdateMaterialStatus(true)}
                  className="materials-batch-action inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={saving || selectedInactiveCount === 0}
                  title={selectedInactiveCount > 0 ? "上架已勾选材料" : "请先勾选已下架材料"}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  上架选中{selectedInactiveCount > 0 ? ` ${selectedInactiveCount}` : ""}
                </button>
              )}
              <button type="button" onClick={exportMaterials} className="btn-secondary quota-toolbar-action">
                <FileDown className="h-4 w-4" />
                导出{currentLibraryMeta.label}
              </button>
              <button type="button" onClick={() => { setImportOpen(true); setMessage(""); setImportErrors([]); }} className="btn-secondary quota-toolbar-action" disabled={saving}>
                <FileUp className="h-4 w-4" />
                导入{currentLibraryMeta.label}
              </button>
              <button type="button" onClick={openCreate} className="btn-primary quota-toolbar-action">
                <Plus className="h-4 w-4" />
                新增{currentLibraryMeta.itemLabel}
              </button>
            </div>
          </div>
          <div className="quota-toolbar-compact materials-filter-bar flex min-w-0 items-center justify-between gap-3">
            <div className="quota-filter-group materials-filter-controls flex min-w-0 flex-wrap items-center gap-2">
              <span className="quota-filter-label inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                筛选
              </span>
              <div ref={categoryPickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCategoryPickerOpen((open) => !open)}
                  className="input-field materials-category-trigger flex min-h-10 w-44 items-center justify-between gap-2 py-2 text-left"
                >
                  <span className="min-w-0 truncate">{categoryFilterLabel}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-surface-400 transition-transform", categoryPickerOpen && "rotate-180")} />
                </button>
                {categoryPickerOpen && (
                  <div className="materials-filter-popover materials-category-popover absolute left-0 top-10 z-50 grid w-[460px] grid-cols-[160px_1fr] overflow-hidden border border-surface-200 bg-white">
                    <div className="materials-category-popover-parents max-h-[300px] overflow-y-auto border-r border-surface-200 bg-surface-50/80 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter("");
                          setActiveParentCategoryId("");
                          setCategoryPickerOpen(false);
                        }}
                        className={cn("materials-category-option mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-semibold", !categoryFilter && "is-active")}
                      >
                        全部分类
                        {!categoryFilter && <span className="text-xs">✓</span>}
                      </button>
                      {categoryOptions.map(({ parent }) => (
                        <button
                          key={parent.id}
                          type="button"
                          onClick={() => setActiveParentCategoryId(parent.id)}
                          className={cn("materials-category-option flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-semibold", activeParentCategory?.parent.id === parent.id && "is-current")}
                        >
                          <span className="min-w-0 truncate">{parent.name}</span>
                          {categoryFilter === parent.id && <span className="text-xs text-primary-600">✓</span>}
                        </button>
                      ))}
                    </div>
                    <div className="materials-category-popover-children max-h-[300px] overflow-y-auto p-2">
                      {activeParentCategory ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryFilter(activeParentCategory.parent.id);
                              setActiveParentCategoryId(activeParentCategory.parent.id);
                              setCategoryPickerOpen(false);
                            }}
                            className={cn("materials-category-option mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-semibold", categoryFilter === activeParentCategory.parent.id && "is-active")}
                          >
                            {`全部${activeParentCategory.parent.name}`}
                            {categoryFilter === activeParentCategory.parent.id && <span className="text-xs">✓</span>}
                          </button>
                          {activeParentCategory.children.length > 0 ? activeParentCategory.children.map((child) => (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => {
                                setCategoryFilter(child.id);
                                setActiveParentCategoryId(activeParentCategory.parent.id);
                                setCategoryPickerOpen(false);
                              }}
                              className={cn("materials-category-option flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-medium", categoryFilter === child.id && "is-active")}
                            >
                              <span className="min-w-0 truncate">{child.name}</span>
                              {categoryFilter === child.id && <span className="text-xs">✓</span>}
                            </button>
                          )) : (
                            <div className="rounded-md bg-surface-50 px-3 py-6 text-center text-sm text-surface-400">暂无二级分类</div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-md bg-surface-50 px-3 py-6 text-center text-sm text-surface-400">暂无分类</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <SystemSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field min-h-10 w-32 py-2">
                <option value="active">在售商品</option>
                <option value="inactive">已下架</option>
                <option value="">全部状态</option>
              </SystemSelect>
              <SystemSelect value={stockWarningFilter} onChange={(event) => setStockWarningFilter(event.target.value)} className="input-field min-h-10 w-32 py-2">
                <option value="">全部库存</option>
                <option value="empty">缺货</option>
                <option value="low">库存偏低</option>
                <option value="normal">库存正常</option>
              </SystemSelect>
              <SystemSelect value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className="input-field min-h-10 w-32 py-2">
                <option value="">全部品牌</option>
                {brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
              </SystemSelect>
              <div className="materials-sort-control inline-flex items-center gap-1">
                <span className="materials-filter-sub-label">排序</span>
                {[
                  ["default", "默认"],
                  ["sales", "销量"],
                  ["popular", "人气"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSortMode(value as MaterialSortMode)}
                    className={cn("materials-filter-chip", sortMode === value && "is-active")}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSortMode(sortMode === "priceAsc" ? "priceDesc" : "priceAsc")}
                  className={cn("materials-filter-chip", (sortMode === "priceAsc" || sortMode === "priceDesc") && "is-active")}
                >
                  价格{sortMode === "priceAsc" ? "↑" : sortMode === "priceDesc" ? "↓" : ""}
                </button>
              </div>
              <div className="materials-price-range inline-flex items-center gap-1.5">
                <span className="materials-filter-sub-label">价格区间</span>
                <input
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  className="input-field"
                  placeholder="最低"
                />
                <span className="text-xs text-surface-400">至</span>
                <input
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  className="input-field"
                  placeholder="最高"
                />
              </div>
            </div>
            <div className="materials-view-switcher inline-flex min-h-10 overflow-hidden rounded-lg border border-surface-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => changeDisplayMode("grid")}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition", displayMode === "grid" ? "bg-primary-50 text-primary-700" : "text-surface-500 hover:bg-surface-50 hover:text-surface-800")}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  平铺
                </button>
                <button
                  type="button"
                  onClick={() => changeDisplayMode("table")}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition", displayMode === "table" ? "bg-primary-50 text-primary-700" : "text-surface-500 hover:bg-surface-50 hover:text-surface-800")}
                >
                  <List className="h-3.5 w-3.5" />
                  列表
                </button>
              </div>
          </div>
        </div>
        <div className="materials-table-region relative min-h-0 flex-1 bg-white">
          {displayMode === "grid" ? (
            <ThinScrollArea className="quota-list-scroll h-full min-h-0" scrollClassName="h-full overflow-auto">
              <div className="materials-product-grid min-h-full bg-[#f6f8fb] p-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-4">
                  {materialPagination.pageItems.map((material) => {
                    const images = normalizeMaterialImages(material.images, material.image || "");
                    const active = Number(material.is_active ?? 1) === 1;
                    const selected = selectedMaterialIds.includes(material.id);
	                    const supplierUnavailable = isSupplierUnavailable(material);
	                    const stockWarning = getStockWarning(material);
	                    const priceDisplay = getMaterialPriceDisplay(material);
	                    const attributes = getVisibleProductAttributes(material.product_attributes)
	                      .slice(0, 2);
	                    const imageModelText = String(material.material_model || material.spec || "").trim();
	                    const displayName = getMaterialDisplayName(material);
                    return (
                      <article
                        key={material.id}
                        className={cn(
                          "materials-product-card group flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:border-primary-200 hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)]",
                          libraryType === "AUXILIARY" && "materials-auxiliary-card",
                          !active && "opacity-60",
                          selected && "border-primary-300 ring-2 ring-primary-100"
                        )}
                      >
                        <div className="materials-product-image relative bg-surface-50">
                          {images[0] ? (
                            <NativeImage src={images[0]} alt={displayName} className="block h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-primary-200">
                              <Layers3 className="h-12 w-12" />
                            </div>
                          )}
                          <label className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-white/92 shadow-sm ring-1 ring-surface-200">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => toggleSelectMaterial(material.id, event.target.checked)}
                              className="material-checkbox"
                              aria-label={`选择${displayName}`}
                            />
                          </label>
                          <span className={cn("absolute right-2 top-2 rounded-md px-2 py-1 text-[11px] font-semibold ring-1", stockWarning.className)}>
                            {stockWarning.label}
                          </span>
                          {!active && (
                            <span className="absolute inset-x-0 bottom-0 z-10 bg-surface-900/70 py-1.5 text-center text-xs font-semibold text-white">已下架</span>
                          )}
                          {active && imageModelText && (
                            <span className="absolute inset-x-0 bottom-0 z-10 truncate bg-surface-900/70 px-3 py-1.5 text-center text-xs font-semibold text-white">
                              {imageModelText}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-3 pb-2.5">
                          <button type="button" onClick={() => libraryType === "MAIN" ? setProductPreview(material) : openEdit(material)} className="line-clamp-2 min-h-[40px] text-left text-sm font-semibold leading-5 text-surface-900 hover:text-primary-700">
                            {displayName}
                          </button>
	                          <div className="mt-2 flex items-baseline gap-1">
	                            <span className="text-lg font-semibold text-red-600">¥{formatAmount(priceDisplay.price)}{priceDisplay.suffix && <span className="materials-price-suffix">起</span>}</span>
	                            <span className="text-xs font-medium text-surface-400">/{material.unit || "件"}</span>
	                            {libraryType === "MAIN" && priceDisplay.skuCount > 1 && <span className="materials-sku-count-badge ml-1">{priceDisplay.skuCount}规格</span>}
	                          </div>
                          <div className="mt-2 flex min-h-[42px] content-start flex-wrap gap-1.5">
                            {attributes.map(([label, value]) => (
                              <span key={label} className="max-w-full truncate rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{value}</span>
                            ))}
                          </div>
                          <div className="materials-product-category-row mt-2 flex min-h-6 items-center">
                            <span className="max-w-full truncate rounded-md bg-surface-100 px-2 py-1 text-[11px] font-semibold text-surface-600">
                              {material.category_name || "未分类"}
                            </span>
                          </div>
                          <div className="mt-auto flex min-h-9 items-center justify-between gap-2 border-t border-surface-100 pt-1.5">
                            <span className="min-w-0 truncate text-xs font-medium text-surface-500">{material.supplier_name || "未设置供应商"}</span>
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => setPriceTagPreview(material)} className="rounded-md p-1.5 text-surface-500 transition hover:bg-red-50 hover:text-red-600" title="商品价签">
                                <Tag className="h-4 w-4" />
                              </button>
                              {libraryType === "MAIN" && (
                                <button type="button" onClick={() => setProductPreview(material)} className="rounded-md p-1.5 text-surface-500 transition hover:bg-blue-50 hover:text-blue-700" title="商品详情">
                                  <Eye className="h-4 w-4" />
                                </button>
                              )}
                              <button type="button" onClick={() => openEdit(material)} className="rounded-md p-1.5 text-surface-500 transition hover:bg-primary-50 hover:text-primary-700" title="编辑">
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleMaterialStatus(material)}
                                className={cn(
                                  "rounded-md p-1.5 text-surface-500 transition",
                                  active
                                    ? "hover:bg-amber-50 hover:text-amber-600"
                                    : supplierUnavailable
                                      ? "hover:bg-red-50 hover:text-red-600"
                                      : "hover:bg-emerald-50 hover:text-emerald-600"
                                )}
                                title={active ? "下架" : supplierUnavailable ? "供应商不是合作中状态，不能上架" : "重新上架"}
                              >
                                {active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </ThinScrollArea>
          ) : (
              <ThinScrollArea className="quota-list-scroll h-full min-h-0" scrollClassName="h-full overflow-auto">
                <table
                  className={cn(
                    "materials-library-table min-w-[2360px] w-full table-fixed text-left",
                    libraryType === "AUXILIARY" && "materials-auxiliary-library-table"
                  )}
                >
                  <colgroup>
                    {showBatchSelection && <col className="w-[44px]" />}
                    <col className="w-[300px]" />
                    <col className="w-[110px]" />
                    <col className="w-[110px]" />
                    {libraryType === "MAIN" && <col className="w-[120px]" />}
                    <col className="w-[130px]" />
                    <col className="w-[130px]" />
                    {libraryType === "MAIN" && <col className="w-[110px]" />}
                    <col className="w-[52px]" />
                    {libraryType === "MAIN" && <col className="w-[76px]" />}
                    <col className="w-[76px]" />
                    <col className="w-[82px]" />
                    {libraryType === "MAIN" && <col className="w-[86px]" />}
                    {libraryType === "MAIN" && <col className="w-[72px]" />}
                    {libraryType === "MAIN" && <col className="w-[96px]" />}
                    <col className="w-[130px]" />
                    <col className="w-[96px]" />
                    <col className="w-[88px]" />
                    <col className="w-[72px]" />
                    <col className="w-[150px]" />
                    <col className="w-[128px]" />
                  </colgroup>
                  <thead className="bg-surface-50/85">
                    <tr className="border-b border-surface-200 text-xs font-semibold text-surface-700">
                      {showBatchSelection && (
                        <th className="w-12 py-3 pl-4 pr-2 text-center">
                          <input
                            ref={selectAllMaterialsRef}
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={(event) => toggleSelectAllMaterials(event.target.checked)}
                            className="material-checkbox"
                            aria-label="选择当前筛选的材料"
                          />
                        </th>
                      )}
                <th className={cn("py-3 pr-5", showBatchSelection ? "pl-2" : "pl-5")}>材料</th>
                <th className="py-3 pr-5 text-center">编码</th>
                <th className="py-3 pr-5 text-center">品牌</th>
                {libraryType === "MAIN" && <th className="py-3 pr-5 text-center">型号</th>}
                <th className="py-3 pr-5 text-center">规格</th>
                <th className="py-3 pr-5 text-center">类别</th>
                {libraryType === "MAIN" && <th className="py-3 pr-5 text-center">套餐类别</th>}
                <th className="py-3 pr-5 text-center">单位</th>
                {libraryType === "MAIN" && <th className="py-3 pr-5 text-center">市场价</th>}
                <th className="py-3 pr-5 text-center">{libraryType === "MAIN" ? "客户价" : "入库价"}</th>
                <th className="py-3 pr-5 text-center">{libraryType === "MAIN" ? "采购价" : "出库价"}</th>
                {libraryType === "MAIN" && <th className="py-3 pr-5 text-center">内控价</th>}
                {libraryType === "MAIN" && <th className="py-3 pr-5 text-center">税率</th>}
                {libraryType === "MAIN" && <th className="py-3 pr-5 text-center">产地</th>}
                <th className="py-3 pr-5 text-center">供应来源</th>
                <th className="py-3 pr-5 text-right">库存 / 预警值</th>
                <th className="py-3 pr-5 text-center">库存预警</th>
                <th className="py-3 pr-5 text-center">状态</th>
                <th className="py-3 pr-5 text-center">备注</th>
                <th className="py-3 pr-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {materialPagination.pageItems.map((material) => {
                const lowStock = (material.supply_mode || "WAREHOUSE") === "WAREHOUSE" && Number(material.stock || 0) <= Number(material.min_stock || 0);
	                const stockWarning = getStockWarning(material);
	                const active = Number(material.is_active ?? 1) === 1;
	                const supplierUnavailable = isSupplierUnavailable(material);
	                const selected = selectedMaterialIds.includes(material.id);
	                const priceDisplay = getMaterialPriceDisplay(material);
	                const displayName = getMaterialDisplayName(material);
                    const packageCategory = getMaterialPackageCategory(material);
                    const taxRate = getMaterialTaxRate(material);
                    const origin = getMaterialOrigin(material);
                return (
                  <tr key={material.id} className={cn("transition-colors hover:bg-surface-50/80", !active && "bg-surface-50/60 text-surface-500", selected && "bg-primary-50/70")}>
                    {showBatchSelection && (
                      <td className="py-3 pl-4 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => toggleSelectMaterial(material.id, event.target.checked)}
	                          className="material-checkbox"
                          aria-label={`选择${displayName}`}
                        />
                      </td>
                    )}
                    <td className={cn("py-3 pr-5", showBatchSelection ? "pl-2" : "pl-5")}>
                      <div className="flex items-center gap-3">
                        {material.image ? (
                          <NativeImage
                            src={material.image}
                            alt={displayName}
                            className="h-10 w-10 shrink-0 cursor-zoom-in rounded-lg border border-surface-200 object-cover"
                            onMouseEnter={(event) => setImagePreview({
                              src: material.image || "",
                              name: displayName,
                              spec: [material.brand, material.product_name, material.material_model, material.color, material.spec].filter(Boolean).join(" / "),
                              x: event.clientX,
                              y: event.clientY,
                            })}
                            onMouseMove={(event) => setImagePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                            onMouseLeave={() => setImagePreview(null)}
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                            <Layers3 className="h-4 w-4" />
                          </div>
                        )}
                        <div className="flex min-w-0 items-center">
                          <p className={cn("material-table-name-text font-semibold", !active && "opacity-70")}>
                            <span className="line-clamp-2 min-w-0 whitespace-normal break-words leading-5">{displayName}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-5 text-center">
                      <span className="font-mono text-xs font-semibold text-surface-700">{material.code || "-"}</span>
                    </td>
                    <td className="py-3 pr-5 text-center text-surface-700">
                      <span className="block truncate" title={material.brand || ""}>{material.brand || "-"}</span>
                    </td>
                    {libraryType === "MAIN" && (
                      <td className="py-3 pr-5 text-center text-surface-700">
                        <span className="block truncate" title={material.material_model || ""}>{material.material_model || "-"}</span>
                      </td>
                    )}
                    <td className="py-3 pr-5 text-center text-surface-700">
                      <span className="block truncate" title={material.spec || ""}>{material.spec || "-"}</span>
                    </td>
                    <td className="py-3 pr-5 text-center text-surface-700">{material.category_name || "-"}</td>
                    {libraryType === "MAIN" && (
                      <td className="py-3 pr-5 text-center text-surface-700">
                        <span className="block truncate" title={packageCategory}>{packageCategory || "-"}</span>
                      </td>
                    )}
                    <td className="py-3 pr-5 text-center text-surface-700">{material.unit || "-"}</td>
                    {libraryType === "MAIN" && (
                      <td className="py-3 pr-5 text-center text-surface-700">
                        {material.market_price == null ? "-" : formatAmount(material.market_price)}
                      </td>
                    )}
                    {libraryType === "MAIN" ? (
                      <>
                        <td className="py-3 pr-5 text-center">
                          <button
                            type="button"
                            className="rounded-md px-1.5 py-1 text-center font-semibold text-red-600 decoration-dotted underline-offset-4 transition hover:bg-red-50 hover:underline"
                            onMouseEnter={(event) => setPricePreview({ material, type: "sale", x: event.clientX, y: event.clientY })}
                            onMouseMove={(event) => setPricePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                            onMouseLeave={() => setPricePreview(null)}
                          >
                            {formatAmount(priceDisplay.price)}{priceDisplay.suffix}
                          </button>
                        </td>
                        <td className="py-3 pr-5 text-center">
                          <button
                            type="button"
                            className="rounded-md px-1.5 py-1 text-center text-surface-700 decoration-dotted underline-offset-4 transition hover:bg-primary-50 hover:text-primary-700 hover:underline"
                            onMouseEnter={(event) => setPricePreview({ material, type: "cost", x: event.clientX, y: event.clientY })}
                            onMouseMove={(event) => setPricePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                            onMouseLeave={() => setPricePreview(null)}
                          >
                            {formatAmount(material.cost_price)}
                          </button>
                        </td>
                        <td className="py-3 pr-5 text-center text-surface-700">
                          {material.internal_control_price == null ? "-" : formatAmount(material.internal_control_price)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-5 text-center">
                          <button
                            type="button"
                            className="rounded-md px-1.5 py-1 text-center text-surface-700 decoration-dotted underline-offset-4 transition hover:bg-primary-50 hover:text-primary-700 hover:underline"
                            onMouseEnter={(event) => setPricePreview({ material, type: "cost", x: event.clientX, y: event.clientY })}
                            onMouseMove={(event) => setPricePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                            onMouseLeave={() => setPricePreview(null)}
                          >
                            {formatAmount(material.cost_price)}
                          </button>
                        </td>
                        <td className="py-3 pr-5 text-center">
                          <button
                            type="button"
                            className="rounded-md px-1.5 py-1 text-center font-semibold text-red-600 decoration-dotted underline-offset-4 transition hover:bg-red-50 hover:underline"
                            onMouseEnter={(event) => setPricePreview({ material, type: "sale", x: event.clientX, y: event.clientY })}
                            onMouseMove={(event) => setPricePreview((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                            onMouseLeave={() => setPricePreview(null)}
                          >
                            {formatAmount(priceDisplay.price)}{priceDisplay.suffix}
                          </button>
                        </td>
                      </>
                    )}
                    {libraryType === "MAIN" && <td className="py-3 pr-5 text-center text-surface-700">{taxRate || "-"}</td>}
                    {libraryType === "MAIN" && (
                      <td className="py-3 pr-5 text-center text-surface-700">
                        <span className="block truncate" title={origin}>{origin || "-"}</span>
                      </td>
                    )}
                    <td className="py-3 pr-5 text-center">
                      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <span className="font-semibold text-surface-800">{material.supplier_name || material.warehouse_name || "-"}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="flex items-center justify-end whitespace-nowrap">
                        <span className={cn("font-semibold", lowStock ? "text-red-600" : "text-surface-900")}>{Number(material.stock || 0)}</span>
                        <span className="text-xs font-medium text-surface-500">/{Number(material.min_stock || 0)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-5 text-center">
                      <span className={cn("inline-flex min-w-[72px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1", stockWarning.className)}>
                        {stockWarning.label}
                      </span>
                    </td>
                    <td className="py-3 pr-5 text-center">
                      <span
                        className={cn(
                          "inline-flex min-w-[64px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1",
                          active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-surface-100 text-surface-600 ring-surface-200"
                        )}
                      >
                        {active ? "在售" : "已下架"}
                      </span>
                    </td>
                    <td className="py-3 pr-5 text-center text-surface-700">
                      <span className="block truncate" title={material.remark || ""}>{material.remark || "-"}</span>
                    </td>
                    <td className="py-3 pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setPriceTagPreview(material)} className="rounded-md p-1.5 text-surface-500 transition hover:bg-red-50 hover:text-red-600" title="商品价签">
                          <Tag className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openEdit(material)} className="rounded-md p-1.5 text-surface-500 transition hover:bg-primary-50 hover:text-primary-700" title="编辑">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        {libraryType === "MAIN" && (
                          <button type="button" onClick={() => setProductPreview(material)} className="rounded-md p-1.5 text-surface-500 transition hover:bg-blue-50 hover:text-blue-700" title="商品详情">
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleMaterialStatus(material)}
                          className={cn(
                            "rounded-md p-1.5 text-surface-500 transition",
                            active
                              ? "hover:bg-amber-50 hover:text-amber-600"
                              : supplierUnavailable
                                ? "hover:bg-red-50 hover:text-red-600"
                                : "hover:bg-emerald-50 hover:text-emerald-600"
                          )}
                          title={active ? "下架" : supplierUnavailable ? "供应商不是合作中状态，不能上架" : "重新上架"}
                        >
                          {active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
            </ThinScrollArea>
          )}
          {sortedMaterials.length === 0 && (
            <div className="materials-empty-state absolute inset-x-0 bottom-0 top-11 z-10 flex items-center justify-center bg-white px-6 text-center text-sm text-surface-500">
              <div>
                <div className="quota-empty-icon mx-auto flex h-10 w-10 items-center justify-center rounded-[10px]">
                  <Search className="h-4 w-4" />
                </div>
                <p className="mt-3 font-semibold text-surface-700">暂无符合条件的{currentLibraryMeta.itemLabel}</p>
                <p className="mt-1 text-xs text-surface-400">{canClearFilters ? "当前筛选条件下没有匹配结果" : `${currentLibraryMeta.label}暂无数据，可先新增`}</p>
                <button
                  type="button"
                  onClick={canClearFilters ? clearFilters : openCreate}
                  className={cn("mt-4 inline-flex min-h-9 items-center gap-2 px-3 text-sm font-semibold", canClearFilters ? "btn-secondary" : "btn-primary")}
                >
                  {canClearFilters ? <RotateCcw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {canClearFilters ? "清除筛选" : "新增材料"}
                </button>
              </div>
            </div>
          )}
        </div>
        <DataPagination
          total={sortedMaterials.length}
          page={materialPagination.page}
          pageSize={materialPagination.pageSize}
          onPageChange={materialPagination.setPage}
          onPageSizeChange={materialPagination.setPageSize}
          pageSizeOptions={materialPageSizeOptions}
          hidePageSizeSelect={displayMode === "grid"}
          itemName="个材料"
        />
      </section>

      {editorOpen && (
        <MaterialEditor
          form={form}
          categories={activeCategories}
          suppliers={suppliers}
          saving={saving}
          uploadingImage={uploadingImage}
          onClose={closeEditor}
	          onChange={updateMaterialForm}
	          onUploadImages={uploadMaterialImages}
          onSubmit={saveMaterial}
        />
      )}

      {importOpen && (
        <MaterialImportDialog
          saving={saving}
          message={message}
          errors={importErrors}
          fileName={importFileName}
          inputRef={importInputRef}
          onClose={() => { setImportOpen(false); setImportErrors([]); }}
          onDownloadTemplate={downloadTemplate}
          onImport={importMaterials}
        />
      )}

      {message && !importOpen && (
        <div
          className={cn(
            "fixed left-[calc(var(--active-sidebar-width,260px)+((100vw-var(--active-sidebar-width,260px))/2))] top-5 z-50 flex max-w-sm -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(15,23,42,0.14)] max-md:left-1/2",
            isErrorMessage ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"
          )}
        >
          {isErrorMessage ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage("")}
            className="ml-1 rounded-md p-1 text-surface-400 transition hover:bg-surface-100 hover:text-surface-700"
            aria-label="关闭提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {imagePreview && (
        <div
          className="pointer-events-none fixed z-[70] w-[240px] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-[0_24px_70px_rgba(31,41,53,0.22)]"
          style={{
            left: Math.min(imagePreview.x + 18, (typeof window === "undefined" ? 1200 : window.innerWidth) - 260),
            top: Math.min(imagePreview.y + 18, (typeof window === "undefined" ? 900 : window.innerHeight) - 300),
          }}
        >
          <div className="aspect-square bg-surface-50">
            <NativeImage src={imagePreview.src} alt={imagePreview.name} className="h-full w-full object-contain" loading="eager" />
          </div>
          <div className="border-t border-surface-200 px-3 py-2">
            <p className="text-xs font-semibold text-surface-900">{imagePreview.name}</p>
            <p className="mt-0.5 text-xs font-medium text-surface-500">{imagePreview.spec || "未填写品牌品名型号颜色规格"}</p>
          </div>
        </div>
      )}

      {pricePreview && (
        <PriceHistoryPreview
          material={pricePreview.material}
          type={pricePreview.type}
          x={pricePreview.x}
          y={pricePreview.y}
        />
      )}

      {productPreview && (
        <ProductDetailPreview
          material={productPreview}
          onClose={() => setProductPreview(null)}
        />
      )}

      {priceTagPreview && (
        <PriceTagPreview
          material={priceTagPreview}
          brandName={brandName}
          brandLogoUrl={brandLogoUrl}
          onClose={() => setPriceTagPreview(null)}
          onDownload={(element) => downloadPriceTag(priceTagPreview, element)}
        />
      )}
    </div>
  );
}

function PriceTagPreview({ material, brandName, brandLogoUrl, onClose, onDownload }: { material: Material; brandName: string; brandLogoUrl: string; onClose: () => void; onDownload: (element?: HTMLElement | null) => void }) {
  const priceDisplay = getMaterialPriceDisplay(material);
  const specText = getMaterialSpecText(material);
  const code = getPriceTagCode(material);
  const tagAttributes = getPriceTagAttributes(material);
  const displayName = getMaterialDisplayName(material);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const priceTagCardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let mounted = true;
    makePriceTagQrDataUrl(material, 180).then((dataUrl) => {
      if (mounted) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (mounted) setQrDataUrl("");
    });
    return () => {
      mounted = false;
    };
  }, [material]);
  return (
    <div className="materials-overlay fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/24 px-5 py-6 max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭商品价签" />
      <div className="materials-modal-shell price-tag-modal relative flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden border border-surface-200 bg-white">
        <header className="materials-modal-header flex min-h-16 items-center justify-between border-b border-surface-200 bg-surface-50/70 px-5">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-surface-900">商品价签预览</p>
            <p className="mt-0.5 truncate text-xs text-surface-500">{displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onDownload(priceTagCardRef.current)} className="btn-primary inline-flex min-h-9 items-center gap-2 px-3 text-sm font-semibold">
              <FileDown className="h-4 w-4" />
              下载价签
            </button>
            <button type="button" onClick={onClose} className="materials-icon-button p-2 text-surface-400 hover:bg-white hover:text-surface-700" aria-label="关闭商品价签">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="price-tag-preview-stage bg-[#f4f6f8] p-6">
          <div ref={priceTagCardRef} className="material-price-tag-card">
            <div className="price-tag-top">
              <span className="price-tag-brand">
                <i>
                  {brandLogoUrl ? (
                    <NativeImage src={brandLogoUrl} alt={`${brandName}标识`} loading="eager" />
                  ) : (
                    <span />
                  )}
                </i>
                <b>{brandName}</b>
              </span>
              <small>MATERIAL PRICE LABEL</small>
            </div>
            <div className="price-tag-body">
              <div className="price-tag-code">{code}</div>
              <div className="price-tag-category">{material.category_name || "未设置分类"}</div>
              <div className="price-tag-main">
                <div className="price-tag-copy">
                  <div className="price-tag-name">{displayName}</div>
                  <div className="price-tag-spec">{specText || "规格信息未维护"}</div>
                </div>
                <div className="price-tag-price">
                  <strong>
                    ¥{formatAmount(priceDisplay.price)}
                    {priceDisplay.suffix && <em>{priceDisplay.suffix}</em>}
                    <span>/{material.unit || "件"}</span>
                  </strong>
                </div>
              </div>
              <div className="price-tag-attributes">
                {tagAttributes.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {priceDisplay.skuCount > 1 && <div className="price-tag-sku">{priceDisplay.skuCount} 个规格可选</div>}
              <div className="price-tag-qr">
                {qrDataUrl ? <NativeImage src={qrDataUrl} alt="材料信息二维码" loading="eager" /> : <span />}
              </div>
              <p className="price-tag-note">扫码查看材料信息，实际下单以系统为准</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductDetailPreview({ material, onClose }: { material: Material; onClose: () => void }) {
		  const attributes = getProductDetailAttributes(material);
  const displayName = getMaterialDisplayName(material);
  const highlights = String(material.product_highlights || "")
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
		  const images = useMemo(() => normalizeMaterialImages(material.images, material.image || ""), [material.images, material.image]);
		  const productSkus = getActiveProductSkus(material);
		  const priceDisplay = getMaterialPriceDisplay(material);
  const skuSalePrices = productSkus.map((sku) => Number(sku.unit_price || 0)).filter((value) => Number.isFinite(value));
  const skuMinSalePrice = skuSalePrices.length > 0 ? Math.min(...skuSalePrices) : 0;
  const skuMaxSalePrice = skuSalePrices.length > 0 ? Math.max(...skuSalePrices) : 0;
  const [activeImage, setActiveImage] = useState(images[0] || "");
  const [zoomPosition, setZoomPosition] = useState<{ x: number; y: number; active: boolean }>({ x: 50, y: 50, active: false });
  useEffect(() => {
    setActiveImage(images[0] || "");
  }, [images]);
  const moveZoom = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    setZoomPosition({ x, y, active: true });
  };
		  return (
    <div className="materials-overlay fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-var(--active-sidebar-width,260px))] items-center justify-center bg-surface-900/24 px-5 py-6 max-md:inset-0 max-md:w-full">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭商品详情" />
      <div className="materials-modal-shell relative flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden border border-surface-200 bg-white">
        <header className="materials-modal-header flex min-h-16 items-center justify-between border-b border-surface-200 bg-surface-50/70 px-5">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-surface-900">商品详情预览</p>
            <p className="mt-0.5 truncate text-xs text-surface-500">{material.category_name || "未设置分类"}</p>
          </div>
          <button type="button" onClick={onClose} className="materials-icon-button p-2 text-surface-400 hover:bg-white hover:text-surface-700" aria-label="关闭商品详情">
            <X className="h-5 w-5" />
          </button>
        </header>
	        <div className="grid min-h-0 flex-1 overflow-y-auto bg-[#f6f8fb] p-5 lg:grid-cols-[360px_1fr]">
	          <section className="bg-white p-4">
	            <div
	              className="product-image-zoom-stage aspect-square overflow-hidden rounded-lg border border-surface-200 bg-surface-50"
	              onMouseEnter={moveZoom}
	              onMouseMove={moveZoom}
	              onMouseLeave={() => setZoomPosition((current) => ({ ...current, active: false }))}
	            >
	              {activeImage ? (
	                <>
	                  <NativeImage src={activeImage} alt={displayName} className="h-full w-full object-cover" />
	                  <div
	                    className="product-image-zoom-lens"
	                    style={{ left: `${zoomPosition.x}%`, top: `${zoomPosition.y}%` }}
	                  />
	                  <div
	                    className="product-image-zoom-pane"
	                    style={{
	                      backgroundImage: `url("${activeImage}")`,
	                      backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
	                    }}
	                  />
	                </>
	              ) : (
	                <div className="flex h-full items-center justify-center text-surface-300"><Layers3 className="h-10 w-10" /></div>
	              )}
	            </div>
		            {images.length > 0 && (
		              <div className="product-image-gallery">
		                <div className="product-image-gallery-head">
		                  <span>商品多图</span>
		                  <small>共 {images.length} 张</small>
		                </div>
		                <div className="product-image-gallery-grid">
		                  {images.map((image, index) => (
		                    <button
		                      type="button"
		                      key={`${image}-${index}`}
		                      onClick={() => setActiveImage(image)}
		                      className={cn("product-image-gallery-item", activeImage === image && "is-active")}
		                      aria-label={`查看商品图${index + 1}`}
		                    >
		                      <NativeImage src={image} alt={`商品图${index + 1}`} className="h-full w-full object-cover" />
		                      {index === 0 && <span>主图</span>}
		                    </button>
		                  ))}
		                </div>
		              </div>
		            )}
          </section>
          <section className="space-y-4 bg-white p-5">
            <div className="product-preview-hero">
              <div className="min-w-0 flex-1">
                <p className="product-preview-title">{displayName}</p>
                <p className="product-preview-subtitle">{[material.brand, material.product_name, material.material_model, material.color, material.spec].filter(Boolean).join(" / ") || "暂无规格信息"}</p>
              </div>
	              <div className="product-preview-price-card">
	                <span>客户价</span>
	                <strong><em>¥</em>{formatAmount(priceDisplay.price)}{priceDisplay.suffix && <i>{priceDisplay.suffix}</i>}</strong>
	                <small>/{material.unit || "件"}</small>
	              </div>
              <div className="product-preview-tags">
                <span>{material.unit || "未设置单位"}</span>
                <span>{material.category_name || "未设置分类"}</span>
                <span>{material.supplier_name || "未设置供应商"}</span>
	              </div>
	            </div>
	            {productSkus.length > 0 && (
	              <div className="product-sku-panel">
	                <div className="product-sku-panel-head">
	                  <div>
	                    <span>规格价格</span>
	                    <small>多规格商品，按规格分别维护价格</small>
	                  </div>
	                  <div className="product-sku-summary">
	                    <b>{productSkus.length} 个规格</b>
	                    <strong>
	                      ¥{formatAmount(skuMinSalePrice)}
	                      {skuMinSalePrice !== skuMaxSalePrice && <> - ¥{formatAmount(skuMaxSalePrice)}</>}
	                    </strong>
	                  </div>
	                </div>
	                <div className="product-sku-list">
	                  <div className="product-sku-table-head">
	                    <span>规格名称</span>
	                    <span>规格</span>
	                    <span>颜色</span>
	                    <span>单位</span>
	                    <span>市场价</span>
	                <span>客户价</span>
	                <span>采购价</span>
	                <span>内控价</span>
	                  </div>
	                  {productSkus.map((sku, index) => (
	                    <div key={sku.id || index} className="product-sku-row">
	                      <div className="product-sku-main">
	                        <div className="product-sku-info-grid">
	                          <span>{sku.sku_name || "默认规格"}</span>
	                          <span>{sku.spec || "-"}</span>
	                          <span>{sku.color || "-"}</span>
	                          <span>{sku.unit || material.unit || "-"}</span>
	                        </div>
	                      </div>
	                      <div className="product-sku-values">
	                        <div>
	                          <strong>{formatAmount(sku.market_price)}</strong>
	                        </div>
	                        <div className="is-sale">
	                          <strong>{formatAmount(sku.unit_price)}</strong>
	                        </div>
	                        <div>
	                          <strong>{formatAmount(sku.cost_price)}</strong>
	                        </div>
	                        <div>
	                          <strong>{sku.internal_control_price == null ? "-" : formatAmount(sku.internal_control_price)}</strong>
	                        </div>
	                      </div>
	                    </div>
	                  ))}
	                </div>
	              </div>
	            )}
	            {highlights.length > 0 && (
              <div className="rounded-lg border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500">商品卖点</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {highlights.map((item) => <span key={item} className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-surface-700 ring-1 ring-surface-200">{item}</span>)}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-surface-200">
              <div className="border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-500">商品参数</div>
              <div className="grid grid-cols-2 divide-x divide-y divide-surface-100 text-sm">
                {attributes.map(([label, value, empty]) => (
                  <div key={label} className="grid grid-cols-[88px_1fr]">
                    <span className="bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-500">{label}</span>
                    <span className={cn("px-3 py-2 font-medium", empty ? "text-surface-400" : "text-surface-800")}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-surface-200">
              <div className="border-b border-surface-200 bg-surface-50 px-3 py-2 text-xs font-semibold text-surface-500">详情说明</div>
              <div className="min-h-28 whitespace-pre-wrap px-3 py-3 text-sm leading-7 text-surface-700">
                {material.product_detail || material.remark || "暂无商品详情说明"}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
