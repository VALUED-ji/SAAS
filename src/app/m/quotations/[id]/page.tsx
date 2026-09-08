"use client";

import { api } from "@/lib/api";
import {
  calculateOtherFeeDetails,
  feeCalcMethodLabels,
  formatStableFeeFormula,
  getFeeBaseLabel,
  getFeeFormulaText,
  normalizeFeeCalcMethod,
  toMoney,
  toNumber,
  type FeeFormulaContext,
} from "@/lib/quotationFeeFormulas";
import {
  getCategoryKey,
  isBaseCategory,
  isCustomCabinetCategory,
  isMainMaterialCategory,
  isOtherCategory,
  type QuotationItem,
} from "@/app/quotations/[id]/quotation-shared";
import {
  ArrowLeft, CheckCircle2, ChevronDown, Eye, FileText, Layers3, MapPin, ReceiptText, ShieldCheck,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMobileBack } from "@/lib/mobileNavigation";
import styles from "./quotation-mobile.module.css";

type QuotationDetail = {
  id: string;
  title?: string | null;
  status?: string | null;
  version?: number | null;
  customer_name?: string | null;
  customer_address?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  project_area?: number | null;
  customer_area_size?: number | null;
  creator_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  terms?: string | null;
  notes?: string | null;
  customer_visible_note?: string | null;
  discount?: number | null;
  settings?: { taxRate?: number; discount?: number; quoteCategories?: string[]; quoteSpaces?: string[]; appendixNote?: string | null; quotationNote?: string | null };
  items?: QuotationItem[];
  totals?: {
    baseAmount?: number;
    materialAmount?: number;
    mainMaterialAmount?: number;
    customCategoryAmount?: number;
    otherAmount?: number;
    directAmount?: number;
    taxAmount?: number;
    discount?: number;
    finalAmount?: number;
  };
};

const categoryLabels: Record<string, string> = { base: "基装", main_material: "产品", custom_cabinet: "定制柜", other: "综合费用" };

function categoryLabel(category: string) {
  const key = getCategoryKey(category);
  return categoryLabels[key] || category;
}

function feeScopeCategoryKey(category: unknown) {
  const name = String(category || "").trim();
  if (name === "base" || name === "基装" || name === "基装项目") return "base";
  if (name === "main_material" || name === "主材" || name === "主材项目" || name === "产品" || name === "产品项目") return "main_material";
  if (name === "custom_cabinet" || name === "定制柜" || name === "定制柜项目") return "custom_cabinet";
  if (name === "other") return "other";
  return name;
}

function feeScopeCategoryLabel(category: unknown) {
  const key = feeScopeCategoryKey(category);
  return categoryLabels[key] || key;
}

function formatMoney(value: unknown) {
  const number = toNumber(value);
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function formatNumber(value: unknown) {
  const number = toNumber(value);
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(number);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(date);
}

function buildAppendixNoteParts(data: QuotationDetail) {
  const templateNote = String(data.settings?.appendixNote || data.settings?.quotationNote || "").trim();
  const customerNote = String(data.customer_visible_note || "").trim();
  return [
    templateNote ? { label: "", content: templateNote } : null,
    customerNote && customerNote !== templateNote ? { label: "报价备注", content: customerNote } : null,
  ].filter((part): part is { label: string; content: string } => Boolean(part));
}

function directUnitPrice(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return toNumber(item.unit_price);
  const material = toNumber(item.material_cost);
  const labor = toNumber(item.labor_cost);
  return material || labor ? material + labor : toNumber(item.unit_price);
}

function directItemTotal(item: QuotationItem) {
  if (isCustomCabinetCategory(item.category)) {
    const area = toMoney(toNumber(item.material_cost) * toNumber(item.labor_cost) / 1000000);
    return toMoney(toNumber(item.quantity) * (area > 0 ? area : 1) * toNumber(item.unit_price));
  }
  return toMoney(toNumber(item.quantity) * directUnitPrice(item));
}

function baseLaborSubtotal(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return 0;
  const material = toNumber(item.material_cost);
  const labor = toNumber(item.labor_cost);
  const laborUnit = material || labor ? labor : toNumber(item.unit_price);
  return toMoney(toNumber(item.quantity) * laborUnit);
}

function baseMaterialSubtotal(item: QuotationItem) {
  if (!isBaseCategory(item.category)) return 0;
  return toMoney(toNumber(item.quantity) * toNumber(item.material_cost));
}

function visibleItemRemark(value: unknown) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*定额编号\s*[:：]/.test(line))
    .join("\n")
    .trim();
}

function orderedCategories(items: QuotationItem[], configured: string[] = []) {
  const seen = new Set<string>();
  const values: string[] = [];
  [...configured, ...items.map((item) => item.category)].forEach((value) => {
    const category = String(value || "").trim();
    const key = getCategoryKey(category);
    if (!category || seen.has(key) || !items.some((item) => getCategoryKey(item.category) === key)) return;
    if (!["base", "main_material", "custom_cabinet", "other"].includes(key)) return;
    seen.add(key); values.push(key);
  });
  const builtIn = ["base", "main_material", "custom_cabinet"].filter((category) => values.some((value) => getCategoryKey(value) === category));
  return [...builtIn, ...(values.some((value) => getCategoryKey(value) === "other") ? ["other"] : [])];
}

function buildFeeContext(items: QuotationItem[], categories: string[], houseArea = 0): FeeFormulaContext {
  const mainMaterialAmount = items.filter((item) => isMainMaterialCategory(item.category)).reduce((sum, item) => sum + directItemTotal(item), 0);
  const categoryAmounts: Record<string, number> = {};
  categories.filter((category) => getCategoryKey(category) === "custom_cabinet").forEach((category) => { categoryAmounts[categoryLabel(category)] = 0; });
  items.forEach((item) => {
    if (isBaseCategory(item.category) || isMainMaterialCategory(item.category) || isOtherCategory(item.category)) return;
    const label = categoryLabel(item.category);
    categoryAmounts[label] = toMoney(toNumber(categoryAmounts[label]) + directItemTotal(item));
  });
  return {
    houseArea,
    mainMaterialAmount,
    directItemAmount: mainMaterialAmount + Object.values(categoryAmounts).reduce((sum, amount) => sum + amount, 0),
    laborAmount: items.reduce((sum, item) => sum + baseLaborSubtotal(item), 0),
    materialCostAmount: items.reduce((sum, item) => sum + baseMaterialSubtotal(item), 0),
    categoryAmounts,
    directItems: items
      .filter((item) => !isOtherCategory(item.category))
      .map((item) => ({
        category: feeScopeCategoryKey(item.category),
        categoryLabel: feeScopeCategoryLabel(item.category),
        space: String(item.space || "").trim(),
        total: directItemTotal(item),
        laborAmount: baseLaborSubtotal(item),
        materialCostAmount: baseMaterialSubtotal(item),
      })),
  };
}

function ItemRow({ item }: { item: QuotationItem }) {
  const isBase = isBaseCategory(item.category);
  const details = [item.spec, item.material_model].map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
  const remark = visibleItemRemark(item.remark);
  return <article className={styles.itemRow}>
    <div className={styles.itemHeading}><div><b>{item.name || "未命名项目"}</b>{details && <p>{details}</p>}</div><strong>¥{formatMoney(directItemTotal(item))}</strong></div>
    <div className={styles.itemMetrics}>
      <span><small>工程量</small><b>{formatNumber(item.quantity)}{item.unit || ""}</b></span>
      {isBase ? <><span><small>材料单价</small><b>¥{formatMoney(item.material_cost)}</b></span><span><small>人工单价</small><b>¥{formatMoney(item.labor_cost)}</b></span></> : <span><small>单价</small><b>¥{formatMoney(directUnitPrice(item))}</b></span>}
    </div>
    {remark && <p className={styles.itemRemark}>{remark}</p>}
  </article>;
}

export default function MobileQuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const quotationId = String(params.id || "");
  const mobileBack = useMobileBack("/m/customers");
  const [data, setData] = useState<QuotationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api.get<QuotationDetail>(`/api/quotations/${quotationId}`)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "报价加载失败"); }
    finally { setLoading(false); }
  }, [quotationId]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => Array.isArray(data?.items) ? data.items : [], [data?.items]);
  const categories = useMemo(() => orderedCategories(items, data?.settings?.quoteCategories || []), [data?.settings?.quoteCategories, items]);
  useEffect(() => { if (!activeCategory || !categories.some((category) => getCategoryKey(category) === getCategoryKey(activeCategory))) setActiveCategory(categories[0] || ""); }, [activeCategory, categories]);

  const activeItems = useMemo(() => items.filter((item) => getCategoryKey(item.category) === getCategoryKey(activeCategory)), [activeCategory, items]);
  const spaceGroups = useMemo(() => {
    const groups = new Map<string, QuotationItem[]>();
    activeItems.forEach((item) => { const space = String(item.space || "").trim() || "未指定空间"; groups.set(space, [...(groups.get(space) || []), item]); });
    return Array.from(groups.entries());
  }, [activeItems]);
  useEffect(() => { if (!isOtherCategory(activeCategory) && spaceGroups[0]) setExpandedSpaces(new Set([spaceGroups[0][0]])); }, [activeCategory, spaceGroups]);

  const baseAmount = toNumber(data?.totals?.baseAmount);
  const materialAmount = toNumber(data?.totals?.materialAmount);
  const houseArea = toNumber(data?.customer_area_size ?? data?.project_area);
  const feeContext = useMemo(() => buildFeeContext(items, categories, houseArea), [categories, houseArea, items]);
  const feeDetails = useMemo(() => calculateOtherFeeDetails(activeItems, baseAmount, materialAmount, feeContext), [activeItems, baseAmount, feeContext, materialAmount]);
  const status = String(data?.status || "DRAFT").toUpperCase();
  const statusLabel = status === "APPROVED" ? "正式报价" : status === "REJECTED" ? "已驳回" : "报价草稿";
  const address = data?.project_address || data?.customer_address || data?.project_name || "地址待完善";

  if (loading) return <div className={styles.screen}><div className={styles.state}><ReceiptText /><b>正在加载报价</b></div></div>;
  if (error || !data) return <div className={styles.screen}><header className={styles.header}><button type="button" onClick={mobileBack} aria-label="返回"><ArrowLeft /></button><div><h1>报价详情</h1><p>只读查看</p></div><span /></header><div className={styles.state}><FileText /><b>{error || "报价不存在"}</b><button type="button" onClick={load}>重新加载</button></div></div>;

  const appendixNoteParts = buildAppendixNoteParts(data);

  return <div className={styles.screen}>
    <header className={styles.header}><button type="button" onClick={mobileBack} aria-label="返回客户详情"><ArrowLeft /></button><div><h1>报价详情</h1><p>内容仅供查看，不支持修改</p></div><span className={styles.readonlyBadge}><Eye />只读</span></header>
    <main className={styles.content}>
      <section className={styles.hero}>
        <div className={styles.heroTop}><span className={styles.heroIcon}><ReceiptText /></span><span className={styles.heroCopy}><small>{statusLabel}{data.version ? ` · V${data.version}` : ""}</small><h2>{data.title || "装修报价单"}</h2><p><MapPin />{address}</p></span></div>
        <div className={styles.heroAmount}><span>报价总额</span><strong>¥{formatMoney(data.totals?.finalAmount)}</strong><small>{data.customer_name || "未绑定客户"}{data.project_area ? ` · ${formatNumber(data.project_area)}㎡` : ""}</small></div>
      </section>

      <section className={styles.amountGrid}>
        <div><span>基装</span><strong>¥{formatMoney(data.totals?.baseAmount)}</strong></div>
        <div><span>材料及其他大类</span><strong>¥{formatMoney(data.totals?.materialAmount)}</strong></div>
        <div><span>综合费用</span><strong>¥{formatMoney(data.totals?.otherAmount)}</strong></div>
      </section>

      {categories.length > 0 ? <>
        <nav className={styles.categoryTabs} aria-label="报价分类">{categories.map((category) => <button type="button" key={category} data-active={getCategoryKey(activeCategory) === getCategoryKey(category) || undefined} onClick={() => setActiveCategory(category)}>{categoryLabel(category)}</button>)}</nav>
        <section className={styles.detailSection}>
          <div className={styles.sectionHeading}><div><Layers3 /><span><b>{categoryLabel(activeCategory)}明细</b><small>仅查看</small></span></div><strong>¥{formatMoney(isOtherCategory(activeCategory) ? data.totals?.otherAmount : activeItems.reduce((sum, item) => sum + directItemTotal(item), 0))}</strong></div>
          {isOtherCategory(activeCategory) ? <div className={styles.feeList}>{activeItems.map((item, index) => {
            const method = normalizeFeeCalcMethod(item.fee_calc_method);
            const formula = getFeeFormulaText(item, activeItems) || (method === "reference" ? getFeeBaseLabel(formatStableFeeFormula(item.fee_calc_base, activeItems)) : "固定金额");
            return <article className={styles.feeRow} key={item.id || `${item.name}-${index}`}><div><span>{String.fromCharCode(65 + index)}</span><b>{item.name || "未命名费用"}</b><small>{feeCalcMethodLabels[method]} · {formula}</small></div><strong>¥{formatMoney(feeDetails[index]?.total)}</strong></article>;
          })}</div> : <div className={styles.spaceList}>{spaceGroups.map(([space, rows]) => {
            const expanded = expandedSpaces.has(space);
            return <section className={styles.spaceGroup} key={space}><button type="button" className={styles.spaceHeader} aria-expanded={expanded} onClick={() => setExpandedSpaces((current) => { const next = new Set(current); if (next.has(space)) next.delete(space); else next.add(space); return next; })}><span><b>{space}</b><small>¥{formatMoney(rows.reduce((sum, item) => sum + directItemTotal(item), 0))}</small></span><ChevronDown data-expanded={expanded || undefined} /></button>{expanded && <div className={styles.spaceItems}>{rows.map((item, index) => <ItemRow key={item.id || `${item.name}-${index}`} item={item} />)}</div>}</section>;
          })}</div>}
        </section>
      </> : <section className={styles.emptyItems}><FileText /><b>暂无报价明细</b></section>}

      <section className={styles.totalSection}>
        <div className={styles.totalTitle}><ShieldCheck /><span><b>费用汇总</b><small>系统核算结果</small></span></div>
        <div className={styles.totalRows}><span><em>项目及综合费用</em><b>¥{formatMoney(data.totals?.directAmount)}</b></span>{toNumber(data.totals?.discount) > 0 && <span><em>优惠金额</em><b>- ¥{formatMoney(data.totals?.discount)}</b></span>}{toNumber(data.totals?.taxAmount) > 0 && <span><em>税费</em><b>¥{formatMoney(data.totals?.taxAmount)}</b></span>}<span data-final><em>报价总额</em><b>¥{formatMoney(data.totals?.finalAmount)}</b></span></div>
      </section>

      {(appendixNoteParts.length > 0 || data.terms) && <section className={styles.notesSection}><div className={styles.notesTitle}><CheckCircle2 />报价说明</div>{appendixNoteParts.map((part, index) => <div key={part.label || `appendix-${index}`}>{part.label ? <b>{part.label}</b> : null}<p>{part.content}</p></div>)}{data.terms && <div><b>条款</b><p>{data.terms}</p></div>}</section>}
      <p className={styles.updateTime}>报价更新于 {formatDate(data.updated_at || data.created_at)}</p>
    </main>
  </div>;
}
