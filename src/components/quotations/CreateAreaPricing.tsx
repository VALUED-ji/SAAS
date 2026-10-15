import { formatPricingAmount } from "@/lib/quotaTemplatePricing";
import { sanitizeCreateAreaInput } from "@/app/quotations/quotation-list-shared";
import type { AreaOverageRule, calculateAreaQuotePrice } from "@/lib/quotationPackageArea";
import styles from "./CreateAreaPricing.module.css";

type Props = {
  preview: ReturnType<typeof calculateAreaQuotePrice>;
  rules: AreaOverageRule[];
  areaText: string;
  hasArea: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onAreaChange: (value: string) => void;
  actuals: Record<string, string>;
  onActualChange: (id: string, value: string) => void;
};

export function CreateAreaPricing({ preview, rules, areaText, hasArea, editing, onEditingChange, onAreaChange, actuals, onActualChange }: Props) {
  return (
    <section aria-label="套餐平方计价" className={styles.root}>
      <div className={styles.heading}>
        <h3>套餐平方计价</h3>
        {!hasArea && <span className="text-xs font-medium text-amber-700">请确认计价面积</span>}
      </div>
      <div className={styles.pricing}>
        <div className="min-w-0">
          <div className="mb-1 text-xs text-[#667085]">计价面积</div>
          <div className="flex h-8 items-center gap-1">
            {editing ? (
              <input
                aria-label="计价面积"
                type="text"
                inputMode="decimal"
                value={areaText}
                autoFocus
                onBlur={() => onEditingChange(false)}
                onChange={(event) => onAreaChange(sanitizeCreateAreaInput(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
                }}
                style={{ width: areaText ? `${Math.max(areaText.length + 0.5, 2.5)}ch` : "7.5rem", maxWidth: "100%" }}
                className="area-package-number-input min-w-0 bg-transparent tabular-nums outline-none"
                placeholder="请输入面积"
              />
            ) : (
              <button type="button" onClick={() => onEditingChange(true)} title="点击修改计价面积" className="min-w-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#407aff]/25">
                <span className={areaText ? "area-package-number" : "area-package-placeholder"}>{areaText || "请输入面积"}</span>
              </button>
            )}
            <span className="area-package-unit">㎡</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs text-[#667085]">套餐单价</div>
          <div className="flex h-8 flex-wrap items-center gap-1">
            <strong className="package-price-number tabular-nums">{formatPricingAmount(preview.unitPrice)}</strong>
            <span className="package-price-unit text-[#667085]">元/㎡</span>
          </div>
        </div>
      </div>
      {rules.length > 0 && (
        <div className={styles.overages}>
          <h4 className={styles.subheading}>超标加价</h4>
          <div className={styles.ruleList}>
                {rules.map((rule, index) => {
                  const id = String(rule.id || `area-overage-${index}`);
                  const row = preview.overageRows.find((item) => item.id === id);
                  const name = rule.name || `超标加价${index + 1}`;
                  const unit = rule.unit || "个";
                  return (
                    <div key={id} className={styles.rule}>
                      <div className={styles.ruleInfo}>
                        <div className={styles.ruleName}>{name}</div>
                        <p>套餐包含 {formatPricingAmount(Number(rule.includedQuantity || 0), 0)} {unit} · 超出按 {formatPricingAmount(Number(rule.unitPrice || 0))} 元/{unit}</p>
                      </div>
                      <div className={styles.actual}>
                        <label className={styles.actualLabel}>
                          <span>实际数量</span>
                          <span className={styles.inputGroup}>
                            <input aria-label={`${name}实际数量`} type="text" inputMode="decimal" value={actuals[id] ?? ""} onChange={(event) => onActualChange(id, sanitizeCreateAreaInput(event.target.value))} className={styles.quantity} />
                            <span>{unit}</span>
                          </span>
                        </label>
                        <p className={row?.amount ? styles.charged : styles.included}>
                          {row?.overageQuantity ? `超出 ${formatPricingAmount(row.overageQuantity, 0)} ${unit}，加价 ${formatPricingAmount(row.amount)} 元` : "标配范围内，无加价"}
                        </p>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      )}
      <div className={styles.summary}>
        <div className={styles.summaryInfo}>
          <div className={styles.totalLabel}>预计套餐价</div>
          <p className={styles.breakdown}>基础价 {hasArea ? formatPricingAmount(preview.baseAmount) : "待确认"} 元{rules.length > 0 && ` + 超标加价 ${formatPricingAmount(preview.overageAmount)} 元`}</p>
        </div>
        <div className={styles.total}><strong>{hasArea ? formatPricingAmount(preview.totalAmount) : "待确认"}</strong>{hasArea && <span>元</span>}</div>
      </div>
    </section>
  );
}
