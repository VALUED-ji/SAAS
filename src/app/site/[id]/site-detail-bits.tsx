// 工地详情页展示组件模块
// 从 page.tsx 渐进拆出的纯展示组件，共享工具来自 ./site-detail-shared。

import type { ReactNode } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import SystemSelect from "@/components/ui/SystemSelect";
import {
  ChangeOrderForm,
  ChangeOrderItemForm,
  changeOrderStatusLabels,
  contractStatusLabels,
  formatPlainAmount,
  getChangeOrderAddAmountFromItems,
  getChangeOrderDeductAmountFromItems,
  getChangeOrderFormDiscount,
  getChangeOrderFormSignedReceivable,
  getChangeOrderLineAmount,
  materialOrderStatusLabels,
  materialOrderTypeLabels,
  normalizeChangeLineType,
  phaseOptions,
} from "./site-detail-shared";
import materialOrderStyles from "./site-material-orders.module.css";
import paymentStyles from "./site-payments.module.css";
import changeOrderStyles from "./site-change-orders.module.css";
import costStyles from "./site-costs.module.css";
import checkinStyles from "./site-checkin.module.css";
import overviewStyles from "./site-overview.module.css";

export function EmptyText({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-surface-300 py-8 text-center text-sm text-surface-400">{text}</div>;
}

export function MaterialOrderInfoLine({ label, value, span = 1 }: { label: string; value: string; span?: 1 | 2 | 3 }) {
  const spanClass = span === 3 ? "md:col-span-3" : span === 2 ? "md:col-span-2" : "";
  return (
    <div className={`${materialOrderStyles.infoLine} ${spanClass}`}>
      <p className={materialOrderStyles.infoLabel}>{label}</p>
      <p className={materialOrderStyles.infoValue} title={value}>{value}</p>
    </div>
  );
}

type PaymentTone = "red" | "green" | "brand" | "amber" | "gray";

function getPaymentToneClass(tone?: PaymentTone) {
  return {
    red: "text-red-600",
    green: "text-emerald-600",
    brand: "text-[#407AFF]",
    amber: "text-amber-600",
    gray: "text-surface-500",
    default: "text-surface-900",
  }[tone || "default"];
}

export function PaymentLine({
  label,
  value,
  tone,
  emphasis,
  details = [],
}: {
  label: string;
  value: number;
  tone?: PaymentTone;
  emphasis?: "received" | "outstanding";
  details?: Array<{ label: string; value: number; tone?: PaymentTone }>;
}) {
  const textClass = getPaymentToneClass(tone);
  const detailGridClass = details.length <= 2
    ? "grid-cols-2"
    : details.length === 3
      ? "grid-cols-2 sm:grid-cols-3"
      : "grid-cols-2 md:grid-cols-4";
  const isSummary = Boolean(emphasis);
  return (
    <div className={paymentStyles.breakdownRow} data-summary={isSummary ? "true" : "false"}>
      <div className={paymentStyles.breakdownLead}>
        <span className={paymentStyles.breakdownLabel}>{label}</span>
        <span className={`${paymentStyles.breakdownAmount} ${textClass}`}>{formatPlainAmount(value)}</span>
      </div>
      {details.length > 0 && (
        <div className={`${paymentStyles.detailGrid} ${detailGridClass}`}>
          {details.map((detail) => (
            <div key={`${detail.label}-${detail.value}`} className={paymentStyles.detailCell}>
              <p className={paymentStyles.detailLabel} title={detail.label}>{detail.label}</p>
              <p className={`${paymentStyles.detailValue} ${getPaymentToneClass(detail.tone)}`} title={formatPlainAmount(detail.value)}>{formatPlainAmount(detail.value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChangeOrderItemsEditor({
  items,
  disabled,
  showPhase = false,
  showCostEstimate = false,
  onUpdate,
  onAdd,
  onRemove,
}: {
  items: ChangeOrderItemForm[];
  disabled?: boolean;
  showPhase?: boolean;
  showCostEstimate?: boolean;
  onUpdate: (index: number, patch: Partial<ChangeOrderItemForm>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className={changeOrderStyles.itemsEditor}>
      <div className={changeOrderStyles.editorHeader}>
        <div className="min-w-0">
          <p className={changeOrderStyles.editorTitle}>变更项目</p>
          <p className={changeOrderStyles.editorSubtitle}>逐项填写变更内容，金额将自动计算。</p>
        </div>
        <div className={changeOrderStyles.editorActions}>
          <button type="button" onClick={onAdd} disabled={disabled} className={changeOrderStyles.addItemButton}>
            <Plus className="h-3.5 w-3.5" />
            添加项目
          </button>
        </div>
      </div>
      <div className={changeOrderStyles.editorBody}>
        {items.map((item, index) => (
          <div key={index} className={changeOrderStyles.lineItem}>
            <div className={changeOrderStyles.lineItemHeader}>
              <span className={changeOrderStyles.lineItemIndex}>项目 {index + 1}</span>
              <div className={changeOrderStyles.lineItemActions}>
                <div className={changeOrderStyles.lineAmount} data-tone={normalizeChangeLineType(item.change_type) === "DEDUCT" ? "deduct" : "add"}>
                  <span>项目金额</span>
                  <strong>{normalizeChangeLineType(item.change_type) === "DEDUCT" ? "-" : ""}{formatPlainAmount(getChangeOrderLineAmount(item))}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={disabled || items.length <= 1}
                  className={changeOrderStyles.removeItemButton}
                  title={items.length <= 1 ? "至少保留一条项目" : "删除项目"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className={changeOrderStyles.titleFields}>
              <label className={changeOrderStyles.field}>
                <span className={changeOrderStyles.fieldLabel}>项目类型</span>
                <SystemSelect value={item.change_type} onChange={(event) => onUpdate(index, { change_type: normalizeChangeLineType(event.target.value) })} className={`${changeOrderStyles.formControl} ${normalizeChangeLineType(item.change_type) === "DEDUCT" ? "text-emerald-700" : "text-red-600"}`} menuClassName={changeOrderStyles.selectMenu} optionClassName={changeOrderStyles.selectOption} disabled={disabled}>
                  <option value="ADD">增项</option>
                  <option value="DEDUCT">减项</option>
                </SystemSelect>
              </label>
              <label className={changeOrderStyles.field}>
                <span className={changeOrderStyles.fieldLabel}>变更项目</span>
                <input value={item.title} onChange={(event) => onUpdate(index, { title: event.target.value })} className={changeOrderStyles.formControl} placeholder="如：客厅增加筒灯、卫生间防水加高" disabled={disabled} />
              </label>
            </div>
            <div className={`${changeOrderStyles.detailFields} ${showPhase ? changeOrderStyles.detailFieldsWithPhase : ""}`}>
              <label className={changeOrderStyles.field}>
                <span className={changeOrderStyles.fieldLabel}>空间</span>
                <input value={item.space} onChange={(event) => onUpdate(index, { space: event.target.value })} className={changeOrderStyles.formControl} placeholder="客厅/主卧/厨房" disabled={disabled} />
              </label>
              {showPhase && (
                <label className={changeOrderStyles.field}>
                  <span className={changeOrderStyles.fieldLabel}>施工阶段</span>
                  <SystemSelect value={item.phase} onChange={(event) => onUpdate(index, { phase: event.target.value })} className={changeOrderStyles.formControl} menuClassName={changeOrderStyles.selectMenu} optionClassName={changeOrderStyles.selectOption} disabled={disabled}>
                    <option value="">不关联阶段</option>
                    {phaseOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </SystemSelect>
                </label>
              )}
              <label className={changeOrderStyles.field}>
                <span className={changeOrderStyles.fieldLabel}>单价</span>
                <input value={item.unit_price} onChange={(event) => onUpdate(index, { unit_price: event.target.value, amount: formatPlainAmount(getChangeOrderLineAmount({ ...item, unit_price: event.target.value })) })} className={`${changeOrderStyles.formControl} text-right`} inputMode="decimal" placeholder="0.00" disabled={disabled} />
              </label>
              <label className={changeOrderStyles.field}>
                <span className={changeOrderStyles.fieldLabel}>数量</span>
                <input value={item.quantity} onChange={(event) => onUpdate(index, { quantity: event.target.value, amount: formatPlainAmount(getChangeOrderLineAmount({ ...item, quantity: event.target.value })) })} className={`${changeOrderStyles.formControl} text-right`} inputMode="decimal" placeholder="1" disabled={disabled} />
              </label>
              <label className={changeOrderStyles.field}>
                <span className={changeOrderStyles.fieldLabel}>单位</span>
                <input value={item.unit} onChange={(event) => onUpdate(index, { unit: event.target.value })} className={changeOrderStyles.formControl} placeholder="项/米/个" disabled={disabled} />
              </label>
            </div>
            {showCostEstimate && (
              <label className={`${changeOrderStyles.field} ${changeOrderStyles.costField}`}>
                <span className={changeOrderStyles.fieldLabel}>成本预估</span>
                <input value={item.cost_estimate} onChange={(event) => onUpdate(index, { cost_estimate: event.target.value })} className={`${changeOrderStyles.formControl} text-right`} inputMode="decimal" placeholder="0.00" disabled={disabled} />
              </label>
            )}
            <label className={changeOrderStyles.field}>
              <span className={changeOrderStyles.fieldLabel}>备注</span>
              <textarea value={item.description} onChange={(event) => onUpdate(index, { description: event.target.value })} className={`${changeOrderStyles.formControl} ${changeOrderStyles.textarea}`} placeholder="填写备注说明、材料品牌规格、数量口径或现场确认情况" disabled={disabled} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChangeOrderSettlementEditor({
  form,
  disabled,
  onChange,
}: {
  form: ChangeOrderForm;
  disabled?: boolean;
  onChange: (patch: Partial<Pick<ChangeOrderForm, "discount_amount" | "discount_reason">>) => void;
}) {
  const addAmount = getChangeOrderAddAmountFromItems(form.items);
  const deductAmount = getChangeOrderDeductAmountFromItems(form.items);
  const discountAmount = getChangeOrderFormDiscount(form);
  const receivableAmount = getChangeOrderFormSignedReceivable(form);
  const isInvalidDiscount = discountAmount > addAmount;
  const needsDiscountReason = discountAmount > 0 && !form.discount_reason.trim();
  return (
    <div className={changeOrderStyles.settlementEditor}>
      <div className={changeOrderStyles.settlementHeader}>
        <div>
          <p className={changeOrderStyles.editorTitle}>金额结算</p>
          <p className={changeOrderStyles.editorSubtitle}>核对增减项与优惠后确认最终应收。</p>
        </div>
      </div>
      <div className={changeOrderStyles.settlementBody}>
        <div className={changeOrderStyles.settlementGrid}>
          <div className={changeOrderStyles.settlementCell}>
            <p className={changeOrderStyles.settlementLabel}>增项合计</p>
            <p className={`${changeOrderStyles.settlementValue} text-red-600`}>{formatPlainAmount(addAmount)}</p>
          </div>
          <div className={changeOrderStyles.settlementCell}>
            <p className={changeOrderStyles.settlementLabel}>减项合计</p>
            <p className={`${changeOrderStyles.settlementValue} text-emerald-600`}>-{formatPlainAmount(deductAmount)}</p>
          </div>
          <div className={changeOrderStyles.settlementCell}>
            <p className={changeOrderStyles.settlementLabel}>优惠金额</p>
            <p className={`${changeOrderStyles.settlementValue} ${isInvalidDiscount ? "text-red-600" : "text-surface-900"}`}>{isInvalidDiscount ? "优惠超出增项" : formatPlainAmount(discountAmount)}</p>
          </div>
          <div className={changeOrderStyles.settlementCell}>
            <p className={changeOrderStyles.settlementLabel}>最终应收</p>
            <p className={`${changeOrderStyles.settlementValue} ${receivableAmount < 0 ? "text-emerald-600" : "text-red-600"}`}>{receivableAmount < 0 ? "-" : ""}{formatPlainAmount(Math.abs(receivableAmount))}</p>
          </div>
        </div>
        <div className={changeOrderStyles.settlementForm}>
          <label className={changeOrderStyles.field}>
            <span className={changeOrderStyles.fieldLabel}>优惠金额</span>
            <input value={form.discount_amount} onChange={(event) => onChange({ discount_amount: event.target.value })} className={`${changeOrderStyles.formControl} text-right`} inputMode="decimal" placeholder="0.00" disabled={disabled} />
          </label>
          <label className={changeOrderStyles.field}>
            <span className={changeOrderStyles.fieldLabel}>优惠原因</span>
            <input value={form.discount_reason} onChange={(event) => onChange({ discount_reason: event.target.value })} className={changeOrderStyles.formControl} placeholder="如：老客户回馈、套餐让利" disabled={disabled} />
          </label>
        </div>
        {needsDiscountReason && (
          <p className={changeOrderStyles.settlementHint}>请填写优惠原因后再提交。</p>
        )}
      </div>
    </div>
  );
}

export function PaymentStatusBadge({ tone, text }: { tone: "green" | "amber" | "red" | "gray"; text: string }) {
  return <span className={paymentStyles.statusBadge} data-tone={tone}>{text}</span>;
}

export function CostMetricCard({ label, value, helper, tone, displayValue, featured }: { label: string; value: number; helper: string; tone: "red" | "green" | "amber" | "blue" | "neutral"; displayValue?: string; featured?: boolean }) {
  return (
    <div className={costStyles.metric} data-tone={tone} data-featured={featured ? "true" : "false"}>
      <p className={costStyles.metricLabel}>{label}</p>
      <p className={costStyles.metricValue}>{displayValue ?? formatPlainAmount(value)}</p>
      <p className={costStyles.metricHelper}>{helper}</p>
    </div>
  );
}

export function ChangeMetricCard({ label, value, helper, tone, plain }: { label: string; value: number; helper: string; tone: "red" | "green" | "amber" | "primary"; plain?: boolean }) {
  return (
    <div className={changeOrderStyles.metric} data-tone={tone}>
      <p className={changeOrderStyles.metricLabel}>{label}</p>
      <p className={changeOrderStyles.metricValue}>{plain ? value : formatPlainAmount(value)}</p>
      <p className={changeOrderStyles.metricHelper}>{helper}</p>
    </div>
  );
}

export function ChangeOrderStatusBadge({ status }: { status?: string }) {
  const key = status === "PENDING_OWNER" ? "PENDING_APPROVAL" : status || "PENDING_APPROVAL";
  const tone = {
    PENDING_APPROVAL: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
  }[key] || "cancelled";
  return (
    <span className={changeOrderStyles.statusBadge} data-tone={tone}>
      {changeOrderStatusLabels[key] || key}
    </span>
  );
}

export function MaterialOrderStatusBadge({ status }: { status?: string }) {
  const key = status || "ORDERED";
  const className = {
    DRAFT: "bg-surface-100 text-surface-600",
    PENDING: "bg-amber-50 text-amber-700",
    ORDERED: "bg-primary-50 text-primary-700",
    PARTIAL: "bg-cyan-50 text-cyan-700",
    RECEIVED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-red-50 text-red-600",
  }[key] || "bg-surface-100 text-surface-600";
  return (
    <span className={`inline-flex min-w-[72px] justify-center rounded px-2 py-1 text-xs font-semibold ${className}`}>
      {materialOrderStatusLabels[key] || key}
    </span>
  );
}

export function MaterialOrderTypeBadge({ type }: { type?: string }) {
  const key = type || "MAIN_SUPPLIER";
  const className = {
    AUXILIARY_WAREHOUSE: "bg-emerald-50 text-emerald-700",
    AUXILIARY_MONTHLY: "bg-amber-50 text-amber-700",
    MAIN_SUPPLIER: "bg-red-50 text-red-600",
  }[key] || "bg-surface-100 text-surface-600";
  return (
    <span className={`inline-flex min-w-[72px] justify-center rounded px-2 py-1 text-xs font-semibold ${className}`}>
      {materialOrderTypeLabels[key] || key}
    </span>
  );
}

export function CheckinMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={checkinStyles.metric}>
      <p className={checkinStyles.metricLabel}>{label}</p>
      <p className={checkinStyles.metricValue} title={typeof value === "string" ? value : undefined}>{value}</p>
    </div>
  );
}

export function TimelineLogDetail({ label, value, danger, wide }: { label: string; value?: string | null; danger?: boolean; wide?: boolean }) {
  const content = String(value || "").trim();
  if (!content) return null;
  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2.5 ${
      danger ? "border-amber-100 bg-amber-50/60" : "border-surface-200 bg-surface-50"
    } ${wide ? "md:col-span-2" : ""}`}>
      <p className={`text-xs font-bold ${danger ? "text-amber-700" : "text-surface-500"}`}>{label}</p>
      <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${danger ? "font-medium text-amber-800" : "text-surface-800"}`}>{content}</p>
    </div>
  );
}

export function InfoRow({
  icon: Icon,
  label,
  value,
  wide = false,
  iconBadgeClassName = "",
}: {
  icon: any;
  label: string;
  value: string;
  wide?: boolean;
  iconBadgeClassName?: string;
}) {
  const displayValue = String(value || "-").trim() || "-";
  return (
    <div className={overviewStyles.infoField} data-empty={displayValue === "-" ? "true" : "false"} data-wide={wide ? "true" : "false"}>
      <span className={`customer-info-material-icon-badge ${iconBadgeClassName}`}>
        <Icon aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={1.85} />
      </span>
      <div className="min-w-0">
        <p className={overviewStyles.infoLabel}>{label}</p>
        <p className={overviewStyles.infoValue} title={displayValue}>{displayValue}</p>
      </div>
    </div>
  );
}

export function ContractNumberInfoRow({ contracts }: { contracts: any[] }) {
  const validContracts = contracts.filter((contract) => String(contract?.contract_no || "").trim());
  return (
    <div className={overviewStyles.contractRow}>
      <div className={overviewStyles.contractLabel}>
        <span className="customer-info-material-icon-badge material-category-icon-weak-box">
          <FileText aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={1.85} />
        </span>
        <span>合同编号</span>
        {validContracts.length > 1 && <span className={overviewStyles.countTag}>{validContracts.length}份</span>}
      </div>
      <div className={overviewStyles.contractValues}>
        {validContracts.length > 0 ? validContracts.map((contract, index) => {
            const status = contractStatusLabels[String(contract.status || "").toUpperCase()] || "";
            return (
              <span
                key={contract.id || `${contract.contract_no}-${index}`}
                className={overviewStyles.contractValue}
                title={[contract.contract_no, status].filter(Boolean).join(" ")}
              >
                <span>{contract.contract_no}</span>
                {validContracts.length > 1 && index === 0 && <span className={overviewStyles.latestTag}>最新</span>}
              </span>
            );
          }) : <span className={overviewStyles.contractValue}>-</span>}
      </div>
    </div>
  );
}

export function ContractTitleInfoRow({ contracts }: { contracts: any[] }) {
  const validContracts = contracts.filter((contract) => String(contract?.title || contract?.contract_no || "").trim());
  return (
    <div className={overviewStyles.contractRow}>
      <div className={overviewStyles.contractLabel}>
        <span className="customer-info-material-icon-badge material-category-icon-weak-box">
          <FileText aria-hidden="true" className="h-[17px] w-[17px]" strokeWidth={1.85} />
        </span>
        <span>合同名称</span>
        {validContracts.length > 1 && <span className={overviewStyles.countTag}>{validContracts.length}份</span>}
      </div>
      <div className={overviewStyles.contractValues}>
        {validContracts.length > 0 ? validContracts.map((contract, index) => {
            const title = String(contract.title || contract.contract_no || "-").trim();
            return (
              <span
                key={contract.id || `${title}-${index}`}
                className={overviewStyles.contractValue}
                title={title}
              >
                {title}
                {validContracts.length > 1 && index === 0 && <span className={overviewStyles.latestTag}>最新</span>}
              </span>
            );
          }) : <span className={overviewStyles.contractValue}>-</span>}
      </div>
    </div>
  );
}
