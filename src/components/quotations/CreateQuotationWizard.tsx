"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Loader2, MapPin, ReceiptText, UserRound, X } from "lucide-react";
import styles from "./CreateQuotationWizard.module.css";

type Props = {
  customerSelection: ReactNode;
  customerDetails: ReactNode;
  settings: ReactNode;
  notes: ReactNode;
  existingCustomer: boolean;
  locked: boolean;
  customerName: string;
  address: string;
  draftKey: string;
  notesFilled: boolean;
  creating: boolean;
  error: string;
  onValidateCustomer: () => boolean;
  onSubmit: () => void;
  onExit: (dirty: boolean) => void;
  onClearError: () => void;
};

export function CreateQuotationWizard(props: Props) {
  const boundCustomer = props.locked;
  const [step, setStep] = useState<1 | 2>(boundCustomer ? 2 : 1);
  const initialDraft = useRef(props.draftKey);
  const contentRef = useRef<HTMLDivElement>(null);
  const dirty = props.draftKey !== initialDraft.current;
  const { creating, onExit } = props;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const handleUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !creating) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [dirty, creating]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    contentRef.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [step]);

  useEffect(() => {
    if (props.error) contentRef.current?.querySelector('[role="alert"]')?.scrollIntoView({ block: "nearest" });
  }, [props.error]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`quotation-index-workbench ${styles.surface}`}>
      <div role="dialog" aria-modal="true" aria-labelledby="create-quotation-title" className={`quotation-create-modal ${styles.page} ${boundCustomer ? styles.boundPage : ""}`}>
        <header className={`${styles.header} ${boundCustomer ? styles.boundHeader : ""}`}>
          <div className={styles.title}><ReceiptText size={18} /><h1 id="create-quotation-title">新建报价</h1></div>
          {!boundCustomer && <nav aria-label="创建步骤" className={styles.steps}>
            <button type="button" aria-current={step === 1 ? "step" : undefined} disabled={creating} onClick={() => { props.onClearError(); setStep(1); }} className={step === 1 ? styles.activeStep : styles.completedStep}><span className={styles.stepNumber}>{step === 2 ? <Check size={14} /> : 1}</span>客户与工地</button>
            <span aria-hidden="true" className={`${styles.connector} ${step === 2 ? styles.completedConnector : ""}`} />
            <button type="button" aria-current={step === 2 ? "step" : undefined} disabled={creating || step === 1} className={step === 2 ? styles.activeStep : styles.step}><span className={styles.stepNumber}>2</span>报价与计价</button>
          </nav>}
          <button type="button" aria-label="关闭新建报价" title="关闭" className={styles.close} onClick={() => onExit(dirty)} disabled={creating}><X size={18} /></button>
        </header>
        <div ref={contentRef} className={styles.scroll}>
          <div className={styles.content}>
            {boundCustomer && <div className={styles.boundCustomer}>
              <div className={styles.customerIdentity}><span className={styles.customerIcon}><UserRound size={20} /></span><div><span className={styles.contextLabel}>当前客户</span><strong>{props.customerName || "未命名客户"}</strong></div></div>
              <div className={styles.siteIdentity}><MapPin size={16} /><div><span className={styles.contextLabel}>工地地址</span><p>{props.address || "未填写工地地址"}</p></div></div>
            </div>}
            <div className={styles.sectionHeading}><h2 tabIndex={-1}>{step === 1 ? "客户与工地" : "报价与计价"}</h2></div>
            <div className={step === 2 ? styles.settingsLayout : props.existingCustomer && !props.locked ? styles.customerLayout : styles.customerSingle}>
              <div className={styles.form}>
                {step === 1 ? <>
                  {(!props.locked || !props.existingCustomer) && <div className={styles.selection}>{props.customerSelection}</div>}
                  {props.locked && props.existingCustomer && <div className={styles.locked}><strong>{props.customerName || "未命名客户"}</strong><p>{props.address || "未填写工地地址"}</p></div>}
                </> : <div className={`quotation-create-right-stack ${styles.settings}`}>{props.settings}<details open className={styles.notes}><summary>备注与附注<span>{props.notesFilled ? "已填写" : "选填"}</span></summary>{props.notes}</details></div>}
              </div>
              {step === 1 && props.existingCustomer && !props.locked && <div className={styles.customerDetails}>{props.customerDetails}</div>}
            </div>
            {props.error && <div role="alert" className={styles.error}>{props.error}</div>}
          </div>
        </div>
        <footer className={styles.footer}>
          {step === 2 ? <span className={styles.customerContext} title={`${props.customerName || "未命名客户"} · ${props.address || "未填写工地"}`}>{props.customerName || "未命名客户"} · {props.address || "未填写工地"}</span> : <span className={styles.progress}>第 1 步，共 2 步</span>}
          <div className={styles.actions}><button type="button" className="btn-secondary" disabled={creating} onClick={() => { if (step === 2 && !boundCustomer) { props.onClearError(); setStep(1); } else onExit(dirty); }}>{step === 2 && !boundCustomer ? "上一步" : "取消"}</button><button type="button" className="btn-primary" disabled={creating} onClick={() => { if (step === 1) { if (props.onValidateCustomer()) { props.onClearError(); setStep(2); } } else if (!boundCustomer || props.onValidateCustomer()) props.onSubmit(); }}>{creating ? <Loader2 size={16} className="animate-spin" /> : step === 1 ? <ArrowRight size={16} /> : null}{step === 1 ? "下一步" : creating ? "正在创建" : "创建并编辑"}</button></div>
        </footer>
      </div>
    </div>, document.body,
  );
}
