"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Edit3, Loader2, PenLine, Plus, Power, QrCode, RefreshCw, Star, Trash2, X } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";

type SignatureItem = {
  id: string;
  name: string;
  image_url: string;
  is_default: number;
  is_active: number;
  usage_count: number;
  last_used_at?: string | null;
};

type CaptureSession = {
  id: string;
  expires_at: string;
  qr_data_url: string;
  status?: string;
  preview_url?: string | null;
};

function authHeaders(extra?: Record<string, string>) {
  const token = typeof window !== "undefined" ? localStorage.getItem("zxgj_token") : "";
  return { ...(extra || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function SignatureSettings() {
  const [items, setItems] = useState<SignatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [capture, setCapture] = useState<CaptureSession | null>(null);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureName, setCaptureName] = useState("");
  const [captureDefault, setCaptureDefault] = useState(false);

  const activeItems = useMemo(() => items.filter((item) => Number(item.is_active) === 1), [items]);

  const loadItems = async () => {
    try {
      const response = await fetch("/api/profile/signatures", { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "签名加载失败");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (loadError: any) {
      setError(loadError.message || "签名加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (!capture?.id || capture.status !== "pending") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/profile/signatures/capture-sessions/${capture.id}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setCapture((current) => current?.id === capture.id ? { ...current, ...data } : current);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [capture?.id, capture?.status]);

  const createCapture = async () => {
    setCaptureLoading(true);
    setError("");
    try {
      const response = await fetch("/api/profile/signatures/capture-sessions", { method: "POST", headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "二维码生成失败");
      setCapture({ ...data, status: "pending" });
      setCaptureName(`我的签名 ${activeItems.length + 1}`);
      setCaptureDefault(activeItems.length === 0);
    } catch (createError: any) {
      setError(createError.message || "二维码生成失败");
    } finally {
      setCaptureLoading(false);
    }
  };

  const closeCapture = async () => {
    if (capture?.id && capture.status !== "confirmed") {
      await fetch(`/api/profile/signatures/capture-sessions/${capture.id}`, { method: "DELETE", headers: authHeaders() }).catch(() => null);
    }
    setCapture(null);
  };

  const confirmCapture = async () => {
    if (!capture?.id || !captureName.trim()) return;
    setCaptureLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/profile/signatures/capture-sessions/${capture.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: captureName.trim(), make_default: captureDefault }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "签名保存失败");
      setCapture(null);
      await loadItems();
    } catch (confirmError: any) {
      setError(confirmError.message || "签名保存失败");
    } finally {
      setCaptureLoading(false);
    }
  };

  const updateSignature = async (item: SignatureItem, changes: Record<string, unknown>) => {
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch("/api/profile/signatures", {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: item.id, ...changes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "保存失败");
      setEditingId("");
      await loadItems();
    } catch (updateError: any) {
      setError(updateError.message || "保存失败");
    } finally {
      setSavingId("");
    }
  };

  const removeSignature = async (item: SignatureItem) => {
    const used = Number(item.usage_count || 0) > 0;
    if (!window.confirm(used ? "删除后不能再用于新的审批，已完成审批中的签名不受影响。确认删除吗？" : "确认删除这个签名吗？")) return;
    setSavingId(item.id);
    try {
      const response = await fetch(`/api/profile/signatures?id=${encodeURIComponent(item.id)}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "操作失败");
      await loadItems();
    } catch (removeError: any) {
      setError(removeError.message || "操作失败");
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="profile-signature-manager">
      <div className="profile-signature-header">
        <div>
          <p className="profile-signature-title">审批签名</p>
          <p className="profile-signature-caption">审批通过时可直接选择，历史记录保留当时的签名。</p>
        </div>
        <button type="button" onClick={createCapture} disabled={captureLoading} className="btn-primary profile-signature-add">
          {captureLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          扫码添加签名
        </button>
      </div>

      {error && <p className="profile-signature-error">{error}</p>}

      <div className="profile-signature-list">
        {loading ? (
          <div className="profile-signature-loading"><Loader2 className="h-4 w-4 animate-spin" />正在加载...</div>
        ) : items.length === 0 ? (
          <button type="button" onClick={createCapture} className="profile-signature-empty">
            <span><PenLine className="h-5 w-5" /></span>
            <strong>添加第一条签名</strong>
          </button>
        ) : (
          <div className="profile-signature-rows">
            {items.map((item) => {
              const active = Number(item.is_active) === 1;
              const saving = savingId === item.id;
              return (
                <div key={item.id} className={`profile-signature-row ${active ? "" : "is-disabled"}`}>
                  <div className="profile-signature-preview">
                    <NativeImage src={item.image_url} alt={item.name} className="h-full w-full object-contain" />
                  </div>
                  <div className="profile-signature-info">
                    {editingId === item.id ? (
                      <div className="profile-signature-edit">
                        <input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={30} autoFocus className="input-field" />
                        <button type="button" title="保存名称" aria-label="保存名称" onClick={() => updateSignature(item, { name: editingName })} className="profile-icon-button is-primary"><Check className="h-4 w-4" /></button>
                        <button type="button" title="取消" aria-label="取消重命名" onClick={() => setEditingId("")} className="profile-icon-button"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="profile-signature-name-row">
                        <p>{item.name}</p>
                        {Number(item.is_default) === 1 && <span className="profile-signature-tag is-default"><Star className="h-3 w-3 fill-current" />默认</span>}
                        {!active && <span className="profile-signature-tag is-disabled">已停用</span>}
                      </div>
                    )}
                    <p className="profile-signature-usage">已用于 {Number(item.usage_count || 0)} 次审批</p>
                  </div>
                  <div className="profile-signature-actions">
                    {active && Number(item.is_default) !== 1 && <button type="button" title="设为默认" aria-label="设为默认签名" disabled={saving} onClick={() => updateSignature(item, { make_default: true })} className="profile-icon-button"><Star className="h-4 w-4" /></button>}
                    {active && <button type="button" title="重命名" aria-label="重命名签名" disabled={saving} onClick={() => { setEditingId(item.id); setEditingName(item.name); }} className="profile-icon-button"><Edit3 className="h-4 w-4" /></button>}
                    {!active && (
                      <button type="button" disabled={saving} onClick={() => updateSignature(item, { is_active: true })} className="profile-enable-button"><Power className="h-4 w-4" />启用</button>
                    )}
                    <button type="button" title="删除" aria-label="删除签名" disabled={saving} onClick={() => removeSignature(item)} className="profile-icon-button is-danger"><Trash2 className="h-4 w-4" /></button>
                    {saving && <Loader2 className="profile-signature-saving h-4 w-4 animate-spin" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {capture && (
        <div className="profile-signature-overlay" role="dialog" aria-modal="true" aria-label="扫码添加签名">
          <div className="profile-signature-modal">
            <div className="profile-signature-modal-header">
              <div><h2>扫码添加签名</h2><p>二维码 5 分钟内有效</p></div>
              <button type="button" title="关闭" aria-label="关闭弹窗" onClick={closeCapture} className="profile-icon-button"><X className="h-4 w-4" /></button>
            </div>
            <div className="profile-signature-modal-body">
              {capture.status === "submitted" ? (
                <div className="profile-signature-submitted">
                  <div className="profile-signature-captured-preview">
                    {capture.preview_url && <NativeImage src={capture.preview_url} alt="待保存签名" className="h-full w-full object-contain" />}
                  </div>
                  <label className="profile-signature-field">签名名称<input value={captureName} onChange={(event) => setCaptureName(event.target.value)} maxLength={30} className="input-field" /></label>
                  <label className="profile-signature-checkbox"><input type="checkbox" checked={captureDefault} onChange={(event) => setCaptureDefault(event.target.checked)} />设为默认签名</label>
                </div>
              ) : capture.status === "expired" || capture.status === "cancelled" ? (
                <div className="profile-signature-expired"><span><RefreshCw className="h-5 w-5" /></span><p>二维码已失效</p><button type="button" onClick={createCapture} className="btn-primary"><RefreshCw className="h-4 w-4" />重新生成</button></div>
              ) : (
                <div className="profile-signature-qr-state">
                  <div className="profile-signature-qr"><NativeImage src={capture.qr_data_url} alt="手机签名二维码" className="h-[220px] w-[220px]" /></div>
                  <p>请使用手机扫码签名</p>
                  <small>提交后将在这里显示预览</small>
                  <span><Loader2 className="h-3.5 w-3.5 animate-spin" />等待手机提交...</span>
                </div>
              )}
            </div>
            <div className="profile-signature-modal-footer">
              <button type="button" onClick={closeCapture} className="btn-secondary">取消</button>
              {capture.status === "submitted" && <button type="button" onClick={confirmCapture} disabled={captureLoading || !captureName.trim()} className="btn-primary">{captureLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}保存签名</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
