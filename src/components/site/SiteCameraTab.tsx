"use client";

import { CSSProperties, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle, Loader2, MonitorPlay, Pencil, Plus, ShieldCheck, Trash2, Video, X } from "lucide-react";
import styles from "./site-camera-tab.module.css";

type SiteCamera = {
  id: string;
  project_id: string;
  provider: string;
  name: string;
  location: string;
  device_serial: string;
  channel_no: number;
  status: string;
  owner_visible: number;
  has_verify_code: boolean;
  verify_code_masked?: string;
  updated_at?: string;
};

type CameraForm = {
  name: string;
  location: string;
  device_serial: string;
  channel_no: string;
  verify_code: string;
  owner_visible: boolean;
};

function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function makeCameraForm(camera?: SiteCamera | null): CameraForm {
  return {
    name: camera?.name || "",
    location: camera?.location || "",
    device_serial: camera?.device_serial || "",
    channel_no: String(camera?.channel_no || 1),
    verify_code: "",
    owner_visible: Boolean(camera?.owner_visible),
  };
}

function formatExpireText(value?: number | string) {
  const time = Number(value || 0);
  if (!time) return "-";
  return new Date(time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default function SiteCameraTab({
  contentRef,
  contentStyle,
  contentHeightClass,
  project,
  siteDisplayName,
  siteAddress,
  cameras,
  isVirtualSite,
  onRefresh,
}: {
  contentRef: RefObject<HTMLElement | null>;
  contentStyle?: CSSProperties;
  contentHeightClass: string;
  project: any;
  siteDisplayName: string;
  siteAddress: string;
  cameras: SiteCamera[];
  isVirtualSite: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const ezvizPlayerRef = useRef<any>(null);
  const autoPlayAttemptedCameraRef = useRef("");
  const playerContainerId = useMemo(() => `ezviz-player-${Math.random().toString(36).slice(2)}`, []);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState("");
  const [form, setForm] = useState<CameraForm>(makeCameraForm());
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [playUrl, setPlayUrl] = useState("");
  const [playAccessToken, setPlayAccessToken] = useState("");
  const [playExpireAt, setPlayExpireAt] = useState<number | string>("");
  const [playMessage, setPlayMessage] = useState("");
  const [playLoading, setPlayLoading] = useState(false);

  const sortedCameras = useMemo(
    () => cameras.slice().sort((a, b) => (Number(a?.channel_no || 0) - Number(b?.channel_no || 0)) || String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN")),
    [cameras],
  );
  const cameraIdsKey = sortedCameras.map((camera) => camera.id).join("|");
  const selectedCamera = sortedCameras.find((camera) => camera.id === selectedCameraId) || sortedCameras[0] || null;
  const activeCameraCount = sortedCameras.filter((camera) => camera.status === "active").length;
  const canManage = Boolean(project?.id && !isVirtualSite);

  useEffect(() => {
    if (selectedCameraId && sortedCameras.some((camera) => camera.id === selectedCameraId)) return;
    setSelectedCameraId(sortedCameras[0]?.id || "");
  }, [cameraIdsKey, selectedCameraId, sortedCameras]);

  useEffect(() => {
    autoPlayAttemptedCameraRef.current = "";
    setPlayUrl("");
    setPlayAccessToken("");
    setPlayMessage("");
    setPlayExpireAt("");
  }, [selectedCameraId]);

  useEffect(() => {
    const host = playerHostRef.current;
    if (!host || !playUrl || !playAccessToken) return;
    let cancelled = false;
    if (ezvizPlayerRef.current) {
      ezvizPlayerRef.current.stop?.().catch?.(() => {});
      ezvizPlayerRef.current.destroy?.();
      ezvizPlayerRef.current = null;
    }
    host.innerHTML = `<div id="${playerContainerId}" class="h-full w-full"></div>`;
    setPlayMessage("");

    void import("ezuikit-js").then((module: any) => {
      if (cancelled) return;
      const container = document.getElementById(playerContainerId);
      if (!container) return;
      const rect = host.getBoundingClientRect();
      const Player = module.EZUIKitPlayer || module.default?.EZUIKitPlayer || module.default;
      if (!Player) {
        setPlayMessage("萤石播放器加载失败，请刷新页面重试。");
        return;
      }
      const player = new Player({
        id: playerContainerId,
        accessToken: playAccessToken,
        url: playUrl,
        template: "pcLive",
        audio: false,
        width: Math.max(320, Math.floor(rect.width || 800)),
        height: Math.max(240, Math.floor(rect.height || 480)),
        staticPath: "/ezuikit_static",
        handleError: (error: any) => {
          const errorCode = error?.data?.nErrorCode || error?.code || "";
          setPlayMessage(errorCode ? `萤石播放器报错：${errorCode}` : "萤石播放器加载失败，请检查设备在线状态。");
        },
      });
      ezvizPlayerRef.current = player;
    }).catch(() => setPlayMessage("萤石播放器加载失败，请刷新页面重试。"));
    return () => {
      cancelled = true;
      if (ezvizPlayerRef.current) {
        ezvizPlayerRef.current.stop?.().catch?.(() => {});
        ezvizPlayerRef.current.destroy?.();
        ezvizPlayerRef.current = null;
      }
    };
  }, [playAccessToken, playUrl, playerContainerId]);

  const openCreateModal = () => {
    setEditingCameraId("");
    setForm(makeCameraForm());
    setMessage("");
    setModalOpen(true);
  };

  const openEditModal = (camera: SiteCamera) => {
    setEditingCameraId(camera.id);
    setForm(makeCameraForm(camera));
    setMessage("");
    setModalOpen(true);
  };

  const saveCamera = async () => {
    if (!project?.id || saving) return;
    if (!form.name.trim()) {
      setMessage("请输入摄像头名称");
      return;
    }
    if (!form.device_serial.trim()) {
      setMessage("请输入萤石设备序列号");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/site/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({
          action: editingCameraId ? "update" : "create",
          camera_id: editingCameraId,
          project_id: project.id,
          name: form.name,
          location: form.location,
          device_serial: form.device_serial,
          channel_no: form.channel_no,
          verify_code: form.verify_code,
          owner_visible: form.owner_visible,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result?.message || "保存摄像头失败");
        return;
      }
      await onRefresh();
      setModalOpen(false);
      const nextId = result?.camera?.id || editingCameraId;
      if (nextId) setSelectedCameraId(nextId);
    } finally {
      setSaving(false);
    }
  };

  const deleteCamera = async (camera: SiteCamera) => {
    if (!camera?.id || saving) return;
    const confirmed = window.confirm(`确认删除摄像头「${camera.name || "未命名"}」吗？删除后不会影响萤石平台里的设备。`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const response = await fetch("/api/site/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({ action: "delete", camera_id: camera.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPlayMessage(result?.message || "删除摄像头失败");
        return;
      }
      await onRefresh();
      setSelectedCameraId("");
    } finally {
      setSaving(false);
    }
  };

  const playCamera = useCallback(async (camera: SiteCamera | null) => {
    if (!camera?.id || playLoading) return;
    setPlayLoading(true);
    setPlayMessage("");
    setPlayUrl("");
    setPlayAccessToken("");
    try {
      const response = await fetch("/api/site/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getClientAuthHeaders() },
        body: JSON.stringify({ action: "play", camera_id: camera.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.live?.url) {
        setPlayMessage(result?.message || "获取实时画面失败");
        return;
      }
      setPlayUrl(result.live.url);
      setPlayAccessToken(result.live.accessToken || "");
      setPlayExpireAt(result.live.expireTime || "");
    } finally {
      setPlayLoading(false);
    }
  }, [playLoading]);

  useEffect(() => {
    if (!selectedCameraId || !selectedCamera?.id || playUrl || playLoading) return;
    if (autoPlayAttemptedCameraRef.current === selectedCamera.id) return;
    autoPlayAttemptedCameraRef.current = selectedCamera.id;
    void playCamera(selectedCamera);
  }, [playCamera, playLoading, playUrl, selectedCamera, selectedCameraId]);

  return (
    <section
      ref={contentRef as any}
      className={`${styles.workspace} ${contentHeightClass}`}
      style={contentStyle}
    >
      <header className={styles.commandBar}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon}><Camera size={17} /></span>
          <div className={styles.titleCopy}>
            <h3>工地摄像头</h3>
            <p>{siteDisplayName || "当前工地"} · {siteAddress || "未记录工地地址"}</p>
          </div>
        </div>
        <div className={styles.commandActions}>
          <div className={styles.summaryStrip} aria-label="摄像头接入概况">
            <div className={styles.summaryItem}><span>设备</span><strong>{sortedCameras.length} 台</strong></div>
            <div className={styles.summaryItem}><span>启用</span><strong>{activeCameraCount} 台</strong></div>
            <div className={styles.summaryItem}><span>业主可见</span><strong>{sortedCameras.filter((camera) => camera.owner_visible).length} 台</strong></div>
            <div className={styles.summaryItem}><span>播放凭证</span><strong>{playUrl ? formatExpireText(playExpireAt) : "未生成"}</strong></div>
          </div>
          <button type="button" onClick={openCreateModal} disabled={!canManage} className={styles.primaryButton}>
            <Plus size={15} /> 添加摄像头
          </button>
        </div>
      </header>

      <div className={styles.monitorGrid}>
        <div className={styles.videoPane}>
          <div className={styles.paneHeader}>
            <div className={styles.paneTitle}>
              <h4>{selectedCamera?.name || "实时画面"}</h4>
              <p>{selectedCamera ? selectedCamera.location || "未设置安装位置" : "选择设备后查看实时画面"}</p>
            </div>
            <div className={styles.playerStatus}>
              <span className={styles.statusDot} data-state={playUrl ? "playing" : selectedCamera ? "waiting" : "empty"} />
              {playUrl ? `播放中 · 凭证至 ${formatExpireText(playExpireAt)}` : selectedCamera ? "待连接" : "未接入"}
            </div>
          </div>

          <div className={styles.videoStage}>
            {playUrl ? (
              <div ref={playerHostRef} className={styles.playerHost} />
            ) : (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}><MonitorPlay size={25} /></span>
                <p>{selectedCamera ? "获取设备实时画面" : "暂未绑定摄像头"}</p>
                <p>{selectedCamera ? "点击设备栏下方的播放按钮开始连接。" : "添加萤石设备后即可在此查看。"}</p>
              </div>
            )}
            {(playLoading || playMessage) && (
              <div className={styles.playNotice} data-tone={playMessage ? "warning" : "loading"}>
                {playLoading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                <span>{playLoading ? "正在连接萤石摄像头..." : playMessage}</span>
              </div>
            )}
          </div>
        </div>

        <aside className={styles.deviceRail}>
          <div className={styles.deviceHeader}>
            <div>
              <h4>设备列表</h4>
              <p>选择设备以查看和维护</p>
            </div>
            <span className={styles.deviceCount}>{sortedCameras.length}</span>
          </div>
          <div className={styles.deviceList}>
            {sortedCameras.map((camera) => {
              const selected = selectedCamera?.id === camera.id;
              const active = camera.status === "active";
              return (
                <button
                  key={camera.id}
                  type="button"
                  onClick={() => setSelectedCameraId(camera.id)}
                  className={styles.deviceRow}
                  data-selected={selected}
                  aria-pressed={selected}
                >
                  <div className={styles.deviceTop}>
                    <div className={styles.deviceIdentity}>
                      <p className={styles.deviceName}>{camera.name || "工地摄像头"}</p>
                      <p className={styles.deviceLocation}>{camera.location || "未设置安装位置"}</p>
                    </div>
                    <span className={styles.statusTag} data-state={active ? "active" : "inactive"}>
                      <span className={styles.statusDot} data-state={active ? "active" : "empty"} />
                      {active ? "启用" : "停用"}
                    </span>
                  </div>
                  <div className={styles.deviceMeta}>
                    <span className={styles.metaItem}><span>序列号</span>{camera.device_serial}</span>
                    <span className={styles.metaItem}><span>通道</span>{camera.channel_no || 1}</span>
                    <span className={styles.metaItem}><span>验证码</span>{camera.has_verify_code ? "已保存" : "未保存"}</span>
                    <span className={styles.metaItem}><span>权限</span>{camera.owner_visible ? "业主可见" : "内部可见"}</span>
                  </div>
                </button>
              );
            })}
            {sortedCameras.length === 0 && (
              <div className={styles.emptyDevices}>
                <Camera size={26} />
                <strong>暂无摄像头</strong>
                <span>添加萤石设备后即可查看实时画面。</span>
              </div>
            )}
          </div>
          <div className={styles.deviceActions}>
            <button type="button" onClick={() => playCamera(selectedCamera)} disabled={!selectedCamera || playLoading} className={styles.primaryButton}>
              {playLoading ? <Loader2 size={15} className="animate-spin" /> : <Video size={15} />}
              查看实时画面
            </button>
            {selectedCamera && (
              <div className={styles.secondaryActions}>
                <button type="button" onClick={() => openEditModal(selectedCamera)} disabled={!canManage} className={styles.secondaryButton}>
                  <Pencil size={14} /> 编辑
                </button>
                <button type="button" onClick={() => deleteCamera(selectedCamera)} disabled={!canManage || saving} className={styles.dangerButton}>
                  <Trash2 size={14} /> 删除
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className={styles.noteBar}>
        <div className={styles.noteCopy}>
          <ShieldCheck size={15} />
          <p><strong>安全接入：</strong>设备验证码仅由服务端换取临时播放地址，需配置萤石开放平台 AppKey 和 AppSecret。</p>
        </div>
        <span className={styles.platformTag}>萤石开放平台</span>
      </footer>

      {modalOpen && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="camera-dialog-title">
          <div className={styles.dialog}>
            <div className={styles.dialogHeader}>
              <div className={styles.dialogTitle}>
                <h3 id="camera-dialog-title">{editingCameraId ? "编辑摄像头" : "添加摄像头"}</h3>
                <p>填写萤石开放平台设备信息，C8c 通常使用通道 1。</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className={styles.closeButton} aria-label="关闭弹窗" title="关闭">
                <X size={17} />
              </button>
            </div>
            <div className={styles.dialogBody}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>摄像头名称</span>
                <input value={form.name} onChange={(event) => setForm((next) => ({ ...next, name: event.target.value }))} placeholder="如：客厅全景摄像头" />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>安装位置</span>
                <input value={form.location} onChange={(event) => setForm((next) => ({ ...next, location: event.target.value }))} placeholder="如：客厅吊顶角落" />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>设备序列号</span>
                <input value={form.device_serial} onChange={(event) => setForm((next) => ({ ...next, device_serial: event.target.value }))} placeholder="萤石设备序列号" />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>通道号</span>
                <input value={form.channel_no} onChange={(event) => setForm((next) => ({ ...next, channel_no: event.target.value }))} inputMode="numeric" placeholder="1" />
              </label>
              <label className={styles.field} data-wide="true">
                <span className={styles.fieldLabel}>设备验证码</span>
                <input
                  value={form.verify_code}
                  onChange={(event) => setForm((next) => ({ ...next, verify_code: event.target.value }))}
                  type="password"
                  placeholder={editingCameraId ? "不修改可留空" : "摄像头机身或萤石 App 中的验证码"}
                />
                <p className={styles.fieldHelp}>开启视频加密的设备需要填写，保存后不会在页面明文显示。</p>
              </label>
              <label className={styles.toggleField}>
                <span className={styles.toggleCopy}>
                  <strong>允许业主查看</strong>
                  <span>默认关闭，开放业主端查看时再启用。</span>
                </span>
                <span className={styles.toggleControl}>
                  <input type="checkbox" checked={form.owner_visible} onChange={(event) => setForm((next) => ({ ...next, owner_visible: event.target.checked }))} />
                  <span className={styles.toggleTrack} />
                </span>
              </label>
              {message && <p className={styles.formError}><AlertTriangle size={14} />{message}</p>}
            </div>
            <div className={styles.dialogFooter}>
              <button type="button" onClick={() => setModalOpen(false)} className={styles.secondaryButton} disabled={saving}>取消</button>
              <button type="button" onClick={saveCamera} className={styles.primaryButton} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
