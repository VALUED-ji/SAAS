"use client";

import { useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Calculator, Link2, MousePointerClick, X } from "lucide-react";
import {
  formatQuotationQuantityFormulaRows,
  parseQuotationQuantityFormula,
  type QuotationQuantityFormula,
  type QuotationQuantityLinkItem,
} from "@/lib/quotationQuantityLinks";
import type { TemplateSpaceQuota, TemplateSpaceQuotaScope } from "./quota-templates-shared";

export type TemplateQuantityEditorState = {
  spaceId: string;
  itemId: string;
  scope: TemplateSpaceQuotaScope;
  text: string;
  lastInsertedRange: { start: number; end: number } | null;
};

function formatQuantityPreview(
  items: QuotationQuantityLinkItem[],
  formula: QuotationQuantityFormula,
) {
  return formatQuotationQuantityFormulaRows(items, formula)
    .replace(/^=/, "")
    .replace(/\[(\d+)\]/g, (match, rowText: string) => {
      const item = items[Number(rowText) - 1];
      const name = String(item?.name || "").trim();
      return name || match;
    });
}

export function TemplateQuantityInput({
  item,
  onChange,
  onOpenFormula,
}: {
  item: TemplateSpaceQuota;
  onChange: (quantity: number) => void;
  onOpenFormula: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const hasFormula = Boolean(parseQuotationQuantityFormula(item.quantityFormula));
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = Number(item.quantity || 0).toFixed(2);

  const commit = () => {
    if (draft === null) return;
    const nextValue = draft.trim() === "" ? 0 : Number(draft);
    setDraft(null);
    if (!Number.isFinite(nextValue)) return;
    onChange(Number(Math.max(0, nextValue).toFixed(2)));
  };

  return (
    <div className="quota-template-quantity-cell">
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? displayValue}
        onFocus={(event) => {
          const input = event.currentTarget;
          setDraft(displayValue);
          window.requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (!/^\d*(?:\.\d*)?$/.test(nextValue)) return;
          setDraft(nextValue);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className="quota-template-quantity-input"
        aria-label="预设数量"
      />
      <button
        type="button"
        data-template-quantity-formula-button
        data-linked={hasFormula || undefined}
        onClick={onOpenFormula}
        className="quota-template-quantity-formula-button"
        title={hasFormula ? "查看或修改数量公式" : "设置数量公式"}
        aria-label={hasFormula ? "查看或修改数量公式" : "设置数量公式"}
      >
        {hasFormula ? <Link2 /> : <span>fx</span>}
      </button>
    </div>
  );
}

export function TemplateQuantityFormulaEditor({
  targetName,
  text,
  formula,
  preview,
  error,
  allItems,
  hasExistingFormula,
  panelRef,
  inputRef,
  onTextChange,
  onCancel,
  onConfirm,
  onRemove,
}: {
  targetName: string;
  text: string;
  formula: QuotationQuantityFormula | null;
  preview: number | null;
  error: string;
  allItems: QuotationQuantityLinkItem[];
  hasExistingFormula: boolean;
  panelRef: RefObject<HTMLDivElement>;
  inputRef: RefObject<HTMLInputElement>;
  onTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onRemove: () => void;
}) {
  if (typeof document === "undefined") return null;
  const width = 430;

  return createPortal(
    <div
      className="quota-template-quantity-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="预设数量公式"
        className="quota-template-quantity-popover"
        style={{ width }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="quota-template-quantity-popover-head">
          <div className="quota-template-quantity-popover-title">
            <span><Link2 /></span>
            <div>
              <small>预设数量公式</small>
              <strong title={targetName}>{targetName || "未命名项目"}</strong>
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="关闭预设数量公式">
            <X />
          </button>
        </div>
        <div className="quota-template-quantity-popover-body">
          <label className="quota-template-quantity-formula-field">
            <span>数量公式</span>
            <div className={`quota-template-quantity-formula-shell${error ? " is-error" : ""}`}>
              <b>fx</b>
              <em>=</em>
              <input
                ref={inputRef}
                autoFocus
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                    && !event.shiftKey
                    && !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    onConfirm();
                  }
                }}
                placeholder="输入 [1]+[2]"
                aria-label="输入预设数量公式"
              />
            </div>
            <small>直接点击表格中的项目插入 [编号]；支持 + - * / 和括号，普通数字直接输入</small>
          </label>

          <div className="quota-template-quantity-rules">
            <span>同空间</span>
            <span>同类别</span>
            <span>同单位</span>
            <span>结果不小于 0</span>
            <span>不能引用自己</span>
          </div>

          <div className="quota-template-quantity-pick-hint">
            <MousePointerClick />
            <span>直接点击表格中的项目，插入对应编号</span>
          </div>

          <div className={`quota-template-quantity-preview${error ? " is-error" : ""}`}>
            {formula ? (
              <>
                <span>{formatQuantityPreview(allItems, formula)}</span>
                <em>=</em>
                <strong>{error ? "--" : Number(preview ?? 0).toFixed(2)}</strong>
              </>
            ) : (
              <span className="is-empty"><Calculator />输入公式后自动显示计算结果</span>
            )}
          </div>
          {error ? <p className="quota-template-quantity-error"><AlertTriangle />{error}</p> : null}
        </div>
        <div className="quota-template-quantity-popover-footer">
          <div>
            {hasExistingFormula ? <button type="button" onClick={onRemove} className="is-remove">解除公式</button> : null}
          </div>
          <div>
            <button type="button" onClick={onCancel}>取消</button>
            <button type="button" onClick={onConfirm} disabled={!formula || Boolean(error)} className="is-primary">确认</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
