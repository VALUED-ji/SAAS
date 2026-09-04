"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, PenLine, X } from "lucide-react";
import { useRouter } from "next/navigation";
import NativeImage from "@/components/ui/NativeImage";
import styles from "./approval-signature-modal.module.css";

type SignatureItem = {
  id: string;
  name: string;
  image_url: string;
  is_default: number;
  is_active: number;
};

type Props = {
  open: boolean;
  title?: string;
  action?: "approve" | "reject";
  processing?: boolean;
  onClose: () => void;
  onConfirm: (signatureId: string, comment: string) => Promise<void>;
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ApprovalSignatureModal({ open, title, action = "approve", processing, onClose, onConfirm }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<SignatureItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setComment("");
    fetch("/api/profile/signatures", { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "签名加载失败");
        const activeItems = (Array.isArray(data.items) ? data.items : []).filter((item: SignatureItem) => Number(item.is_active) === 1);
        setItems(activeItems);
        const defaultItem = activeItems.find((item: SignatureItem) => Number(item.is_default) === 1) || activeItems[0];
        setSelectedId(defaultItem?.id || "");
      })
      .catch((loadError) => setError(loadError.message || "签名加载失败"))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const isReject = action === "reject";
  const modalTitle = title || (isReject ? "确认审批驳回" : "确认审批通过");
  const helperText = isReject ? "请填写驳回原因，并选择本次审批使用的签名" : "请选择本次审批使用的签名";
  const confirmText = isReject ? "确认驳回" : "确认通过";

  const submit = async () => {
    if (!selectedId) {
      setError("请选择一条签名");
      return;
    }
    if (isReject && !comment.trim()) {
      setError("驳回时请填写审批意见，方便后续追溯");
      return;
    }
    setError("");
    try {
      await onConfirm(selectedId, comment.trim());
    } catch (submitError: any) {
      setError(submitError.message || "审批处理失败");
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={modalTitle}>
      <div className={`approval-signature-modal-shell ${styles.shell}`} data-action={isReject ? "reject" : "approve"}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2>{modalTitle}</h2>
            <p>{helperText}</p>
          </div>
          <button type="button" title="关闭" aria-label="关闭" onClick={onClose} disabled={processing} className={styles.closeButton}><X className="h-4 w-4" /></button>
        </header>

        <div className={`approval-signature-modal-scroll ${styles.scrollArea}`}>
          {loading ? (
            <div className={styles.signatureSection} aria-label="签名加载中">
              <p className={styles.sectionLabel}>审批签名</p>
              <div className={styles.signatureList}>
              {[0, 1, 2].map((item) => (
                <div key={item} className={`${styles.signatureSkeleton} animate-pulse`}>
                  <span className={styles.skeletonCheck} />
                  <span className={styles.skeletonPreview} />
                  <span className={styles.skeletonName} />
                </div>
              ))}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><PenLine className="h-5 w-5" /></span>
              <p className={styles.emptyTitle}>还没有可用签名</p>
              <p className={styles.emptyText}>请先在个人设置中创建审批签名</p>
              <button type="button" onClick={() => router.push("/profile")} className={styles.profileButton}>前往个人设置</button>
            </div>
          ) : (
            <section className={styles.signatureSection}>
              <p className={styles.sectionLabel}>审批签名</p>
              <div className={styles.signatureList}>
              {items.map((item) => {
                const selected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={selected}
                    className={styles.signatureOption}
                    data-selected={selected ? "true" : "false"}
                  >
                    <span className={styles.selectionMark}><Check className="h-3 w-3" /></span>
                    <span className={styles.signaturePreview}><NativeImage src={item.image_url} alt={item.name} className="h-full w-full object-contain p-2" /></span>
                    <span className={styles.signatureName}>{item.name}</span>
                  </button>
                );
              })}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <label className={styles.commentField}>
              <span className={styles.sectionLabel}>审批意见{isReject ? <strong> *</strong> : <em>选填</em>}</span>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={300} rows={3} placeholder={isReject ? "请填写驳回原因" : "填写本次审批意见"} className={styles.commentInput} />
            </label>
          )}
          {error && <p className={styles.errorMessage}>{error}</p>}
        </div>

        <footer className={styles.footer}>
          <button type="button" onClick={onClose} disabled={processing} className={styles.cancelButton}>取消</button>
          <button type="button" onClick={submit} disabled={processing || loading || items.length === 0 || !selectedId} className={`${styles.confirmButton} ${isReject ? styles.rejectButton : styles.approveButton}`}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {processing ? "处理中..." : confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
}
