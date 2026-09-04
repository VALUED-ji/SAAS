"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as THREE from "three";
import { Check, Copy, Link as LinkIcon, Loader2, MapPin, Maximize2, QrCode, Share2, X } from "lucide-react";
import NativeImage from "@/components/ui/NativeImage";

type VrScene = {
  id: string;
  name: string;
  image_url: string;
  file_name?: string;
  sort_order?: number;
};

type VrTour = {
  id: string;
  title: string;
  project_name?: string;
  customer_name?: string;
  customer_address?: string;
  customer_house_address?: string;
  project_address?: string;
  scenes: VrScene[];
  share?: {
    token?: string;
    expires_at?: string | null;
  };
};

type ShareMode = "create" | "current" | "none";

const SHARE_OPTIONS = [
  { value: "1d", label: "1天" },
  { value: "7d", label: "7天" },
  { value: "30d", label: "30天" },
  { value: "forever", label: "永久" },
];

function makeQrCodeUrl(target: string, size = 260) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(target)}`;
}

function formatShareExpiresAt(value?: string | null) {
  if (!value) return "永久有效";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "永久有效";
  return date
    .toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "-");
}

function PanoramaViewer({ imageUrl }: { imageUrl: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    if (!hostRef.current || !imageUrl) return;
    setWebglUnavailable(false);
    const host = hostRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, host.clientWidth / Math.max(host.clientHeight, 1), 1, 1100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 80, 48);
    geometry.scale(-1, 1, 1);
    const texture = new THREE.TextureLoader().load(imageUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let lon = 0;
    let lat = 0;
    let pointerDown = false;
    let pointerX = 0;
    let pointerY = 0;
    let pointerLon = 0;
    let pointerLat = 0;
    let frameId = 0;

    const clampLat = (value: number) => Math.max(-85, Math.min(85, value));
    const render = () => {
      lat = clampLat(lat);
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta),
      );
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerLon = lon;
      pointerLat = lat;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      lon = (pointerX - event.clientX) * 0.12 + pointerLon;
      lat = (event.clientY - pointerY) * 0.12 + pointerLat;
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerDown = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.fov = Math.max(45, Math.min(95, camera.fov + event.deltaY * 0.035));
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      texture.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [imageUrl]);

  return (
    <div ref={hostRef} className="h-full w-full cursor-grab active:cursor-grabbing">
      {webglUnavailable && (
        <NativeImage
          src={imageUrl}
          alt="VR全景图片"
          className="h-full w-full object-cover"
          loading="eager"
        />
      )}
    </div>
  );
}

export default function VrTourExperience({
  loadUrl,
  shareMode = "none",
  shareTourId,
}: {
  loadUrl: string;
  shareMode?: ShareMode;
  shareTourId?: string;
}) {
  const [tour, setTour] = useState<VrTour | null>(null);
  const [activeSceneId, setActiveSceneId] = useState("");
  const [sceneFading, setSceneFading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareExpiresIn, setShareExpiresIn] = useState("7d");
  const [shareLink, setShareLink] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLookupLoading, setShareLookupLoading] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const sceneFadeOutTimerRef = useRef<number | null>(null);
  const sceneFadeInTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(loadUrl);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "VR全景不存在");
        setTour(result);
        setActiveSceneId(result.scenes?.[0]?.id || "");
        if (result.share?.expires_at) setShareExpiresAt(result.share.expires_at);
      } catch (err: any) {
        setError(err.message || "VR全景加载失败");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loadUrl]);

  useEffect(() => {
    return () => {
      if (sceneFadeOutTimerRef.current) window.clearTimeout(sceneFadeOutTimerRef.current);
      if (sceneFadeInTimerRef.current) window.clearTimeout(sceneFadeInTimerRef.current);
    };
  }, []);

  const scenes = useMemo(() => tour?.scenes || [], [tour?.scenes]);
  const activeScene = useMemo(
    () => scenes.find((scene) => scene.id === activeSceneId) || scenes[0],
    [activeSceneId, scenes],
  );
  const address = tour?.customer_house_address || tour?.project_address || tour?.customer_address || "";
  const canShare = shareMode !== "none";
  const qrUrl = shareLink ? makeQrCodeUrl(shareLink) : "";

  const switchScene = (sceneId: string) => {
    if (!sceneId || sceneId === activeSceneId) return;
    if (sceneFadeOutTimerRef.current) window.clearTimeout(sceneFadeOutTimerRef.current);
    if (sceneFadeInTimerRef.current) window.clearTimeout(sceneFadeInTimerRef.current);

    setSceneFading(true);
    sceneFadeOutTimerRef.current = window.setTimeout(() => {
      setActiveSceneId(sceneId);
      sceneFadeInTimerRef.current = window.setTimeout(() => {
        setSceneFading(false);
      }, 70);
    }, 190);
  };

  const openShareModal = async () => {
    setShareOpen(true);
    setShareMessage("");
    if (shareMode === "current" && typeof window !== "undefined") {
      setShareLink(window.location.href);
      setShareExpiresAt(tour?.share?.expires_at || null);
      return;
    }
    if (shareMode === "create" && shareTourId) {
      setShareLookupLoading(true);
      try {
        const response = await fetch(`/api/vr-tours/${encodeURIComponent(shareTourId)}/share`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "读取上一次分享失败");
        if (result.share?.share_url) {
          const nextLink = result.share.share_url.startsWith("http")
            ? result.share.share_url
            : `${window.location.origin}${result.share.share_url}`;
          setShareLink(nextLink);
          setShareExpiresAt(result.share.expires_at || null);
        } else {
          setShareLink("");
          setShareExpiresAt(null);
        }
      } catch (err: any) {
        setShareMessage(err.message || "读取上一次分享失败");
      } finally {
        setShareLookupLoading(false);
      }
    }
  };

  const createShareLink = async () => {
    if (!shareTourId) return;
    setShareLoading(true);
    setShareMessage("");
    try {
      const response = await fetch(`/api/vr-tours/${encodeURIComponent(shareTourId)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: shareExpiresIn }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "生成分享链接失败");
      const nextLink = result.share_url?.startsWith("http")
        ? result.share_url
        : `${window.location.origin}${result.share_url || ""}`;
      setShareLink(nextLink);
      setShareExpiresAt(result.expires_at || null);
      setShareMessage(shareLink ? "新的分享链接已生成" : "分享链接已生成");
    } catch (err: any) {
      setShareMessage(err.message || "生成分享链接失败");
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareMessage("链接已复制");
    } catch {
      setShareMessage("当前浏览器不支持自动复制，请手动复制链接");
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101216] text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在加载VR全景...
      </main>
    );
  }

  if (error || !tour || !activeScene) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101216] px-6 text-white">
        <div className="rounded-lg border border-white/10 bg-white/8 p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <p className="text-base font-semibold">{error || "VR全景不存在"}</p>
          <p className="mt-2 text-sm text-white/55">请确认链接是否完整，或联系工作人员重新生成。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#101216] text-white">
      <div
        className={`absolute inset-0 transform-gpu transition-[opacity,transform,filter] duration-500 ease-out will-change-[opacity,transform,filter] ${
          sceneFading ? "scale-[1.045] opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0"
        }`}
      >
        <PanoramaViewer imageUrl={activeScene.image_url} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/65 via-black/20 to-transparent px-4 pb-16 pt-4">
        <div className="flex w-full flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Image
              src="/brand/xingyi-decoration-logo.png"
              alt="星艺装饰"
              width={156}
              height={36}
              className="h-8 w-auto rounded bg-white/95 px-2 py-1 shadow-[0_10px_24px_rgba(0,0,0,0.2)] sm:h-9"
            />
            <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
              <span className="rounded bg-white/10 px-2 py-1">VR全景</span>
              {address && (
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{address}</span>
                </span>
              )}
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-normal">{tour.title}</h1>
            <p className="mt-1 text-sm text-white/65">{activeScene.name}</p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {canShare && (
              <button
                type="button"
                onClick={openShareModal}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-black/25 px-3 text-sm font-semibold text-white/85 backdrop-blur hover:bg-white/10"
              >
                <Share2 className="h-4 w-4" />
                分享
              </button>
            )}
            <button
              type="button"
              onClick={() => document.documentElement.requestFullscreen?.()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-black/25 px-3 text-sm font-semibold text-white/85 backdrop-blur hover:bg-white/10"
            >
              <Maximize2 className="h-4 w-4" />
              全屏
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pb-5 pt-20">
        <div className="pointer-events-auto mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 px-3 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {scenes.map((scene) => {
              const active = scene.id === activeScene.id;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => switchScene(scene.id)}
                  className={`group relative h-[72px] w-[132px] shrink-0 overflow-hidden rounded-lg border-2 text-left transition duration-200 active:scale-[0.97] ${
                    active ? "border-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.65)]" : "border-transparent hover:border-white/55"
                  }`}
                  title={scene.name}
                >
                  <NativeImage src={scene.image_url} alt={scene.name} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 flex min-h-[30px] items-end bg-gradient-to-t from-black/80 via-black/42 to-transparent px-2 pb-1.5">
                    <span className="block w-full truncate text-center text-sm font-semibold text-white drop-shadow" title={scene.name}>
                      {scene.name}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/58 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-white/12 bg-[#f7f8fa] text-surface-900 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-surface-200 bg-white px-5 py-4">
              <div>
                <p className="text-base font-semibold text-surface-950">分享VR全景</p>
                <p className="mt-0.5 text-xs text-surface-500">{tour.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {shareMode === "create" ? (
                <div className="rounded-lg border border-surface-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-surface-900">设置有效期</p>
                      <p className="mt-0.5 text-xs text-surface-500">过期后，分享出去的新链接将无法继续查看。</p>
                    </div>
                    <button
                      type="button"
                      onClick={createShareLink}
                      disabled={shareLoading}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary-700 px-3 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                    >
                      {shareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                      {shareLink ? "重新生成" : "生成分享"}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {SHARE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setShareExpiresIn(option.value);
                          setShareMessage("");
                        }}
                        className={`h-9 rounded-lg border text-sm font-semibold transition ${
                          shareExpiresIn === option.value
                            ? "border-primary-300 bg-primary-50 text-primary-700"
                            : "border-surface-200 bg-white text-surface-600 hover:border-primary-200 hover:text-primary-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-surface-200 bg-white p-3">
                  <p className="text-sm font-semibold text-surface-900">当前分享链接</p>
                  <p className="mt-1 text-xs text-surface-500">有效期：{formatShareExpiresAt(shareExpiresAt)}</p>
                </div>
              )}

              {shareLink ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_172px]">
                  <div className="min-w-0 space-y-3 rounded-lg border border-surface-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-surface-900">
                        <LinkIcon className="h-4 w-4 text-primary-600" />
                        分享链接
                      </p>
                      <span className="text-xs text-surface-500">有效期：{formatShareExpiresAt(shareExpiresAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-surface-700" title={shareLink}>
                        {shareLink}
                      </span>
                      <button
                        type="button"
                        onClick={copyShareLink}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary-700 px-2.5 text-xs font-semibold text-white hover:bg-primary-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </button>
                    </div>
                    {shareMessage && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-primary-700">
                        <Check className="h-3.5 w-3.5" />
                        {shareMessage}
                      </p>
                    )}
                  </div>
                  <div className="min-w-[172px] rounded-lg border border-surface-200 bg-white p-3 text-center">
                    <p className="mb-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-surface-900">
                      <QrCode className="h-4 w-4 text-primary-600" />
                      二维码
                    </p>
                    <NativeImage src={qrUrl} alt="VR全景分享二维码" className="mx-auto h-[132px] w-[132px] rounded-md border border-surface-100 bg-white p-1" />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-surface-300 bg-white px-4 py-5 text-center">
                  {shareLookupLoading ? (
                    <>
                      <Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin text-primary-600" />
                      <p className="text-sm font-semibold text-surface-700">正在读取上一次分享...</p>
                    </>
                  ) : (
                    <>
                      <QrCode className="mx-auto mb-2 h-7 w-7 text-surface-300" />
                      <p className="text-sm font-semibold text-surface-700">选择有效期后生成分享链接</p>
                      <p className="mt-1 text-xs text-surface-500">生成后可复制链接，也可以让客户直接扫码查看。</p>
                      {shareMessage && <p className="mt-2 text-xs font-medium text-red-600">{shareMessage}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
