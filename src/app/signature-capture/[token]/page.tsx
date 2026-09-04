"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, Loader2, RotateCcw } from "lucide-react";

type Point = { x: number; y: number };
type Stroke = Point[];

function drawStrokes(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(ratio, ratio);
  context.strokeStyle = "#111827";
  context.lineWidth = 3;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (stroke.length === 0) return;
    context.beginPath();
    context.moveTo(stroke[0].x * rect.width, stroke[0].y * rect.height);
    stroke.slice(1).forEach((point) => context.lineTo(point.x * rect.width, point.y * rect.height));
    if (stroke.length === 1) context.lineTo(stroke[0].x * rect.width + 0.1, stroke[0].y * rect.height + 0.1);
    context.stroke();
  });
  context.restore();
}

function exportSignatureImage(source: HTMLCanvasElement, strokes: Stroke[]) {
  const points = strokes.flat();
  const sourceRect = source.getBoundingClientRect();
  const minX = Math.max(0, Math.min(...points.map((point) => point.x)) - 0.04);
  const maxX = Math.min(1, Math.max(...points.map((point) => point.x)) + 0.04);
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)) - 0.06);
  const maxY = Math.min(1, Math.max(...points.map((point) => point.y)) + 0.06);
  const sourceWidth = Math.max(1, (maxX - minX) * sourceRect.width);
  const sourceHeight = Math.max(1, (maxY - minY) * sourceRect.height);
  const output = document.createElement("canvas");
  output.width = 900;
  output.height = 300;
  const context = output.getContext("2d");
  if (!context) throw new Error("签名图片生成失败");
  const scale = Math.min(820 / sourceWidth, 240 / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const offsetX = (900 - width) / 2;
  const offsetY = (300 - height) / 2;
  context.strokeStyle = "#111827";
  context.lineWidth = 7;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (stroke.length === 0) return;
    const x = (stroke[0].x - minX) * sourceRect.width * scale + offsetX;
    const y = (stroke[0].y - minY) * sourceRect.height * scale + offsetY;
    context.beginPath();
    context.moveTo(x, y);
    stroke.slice(1).forEach((point) => context.lineTo(
      (point.x - minX) * sourceRect.width * scale + offsetX,
      (point.y - minY) * sourceRect.height * scale + offsetY,
    ));
    if (stroke.length === 1) context.lineTo(x + 0.5, y + 0.5);
    context.stroke();
  });
  return output.toDataURL("image/png");
}

export default function SignatureCapturePage({ params }: { params: Promise<{ token: string }> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const [token, setToken] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState("loading");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    params.then(({ token: value }) => setToken(value));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/signature-capture/${token}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "二维码无效");
        setStatus(data.status || "expired");
      })
      .catch((error) => {
        setStatus("invalid");
        setMessage(error.message || "二维码无效");
      });
  }, [token]);

  const redraw = useCallback(() => {
    if (canvasRef.current) drawStrokes(canvasRef.current, strokes);
  }, [strokes]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (activePointerRef.current !== null) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    setMessage("");
    setStrokes((current) => [...current, [point]]);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (activePointerRef.current !== event.pointerId) return;
    const point = pointFromEvent(event);
    setStrokes((current) => {
      if (current.length === 0) return [[point]];
      const next = [...current];
      next[next.length - 1] = [...next[next.length - 1], point];
      return next;
    });
  };

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointerRef.current = null;
  };

  const submit = async () => {
    if (!canvasRef.current || strokes.flat().length < 8) {
      setMessage("签名笔迹过短，请重新签写");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/signature-capture/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: exportSignatureImage(canvasRef.current, strokes), strokes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "提交失败");
      setStatus("submitted");
    } catch (error: any) {
      setMessage(error.message || "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return <div className="flex min-h-dvh items-center justify-center bg-[#f3f7fc] text-[#52647b]"><Loader2 className="mr-2 h-5 w-5 animate-spin text-[#407AFF]" />正在打开签名板...</div>;
  }

  if (status === "submitted" || status === "confirmed") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f3f7fc] p-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"><Check className="h-7 w-7" /></span>
          <h1 className="mt-5 text-xl font-black text-[#162033]">签名已提交</h1>
          <p className="mt-2 text-sm font-semibold text-[#7c8aa0]">请返回电脑确认并保存。</p>
        </div>
      </main>
    );
  }

  if (status !== "pending") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f3f7fc] p-6 text-center">
        <div><h1 className="text-xl font-black text-[#162033]">二维码已失效</h1><p className="mt-2 text-sm font-semibold text-[#7c8aa0]">{message || "请在电脑端重新生成二维码。"}</p></div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#f3f7fc]">
      <header className="border-b border-[#dce8f8] bg-white px-5 py-4">
        <h1 className="text-lg font-black text-[#162033]">手写签名</h1>
        <p className="mt-1 text-xs font-semibold text-[#7c8aa0]">请在下方横向签名框内，从左向右签写</p>
      </header>
      <div className="flex flex-1 flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-[#cbd9eb] bg-white shadow-[0_8px_24px_rgba(37,74,122,0.06)]">
          <canvas
            ref={canvasRef}
            aria-label="横向手写签名区域"
            className="absolute inset-0 block h-full w-full touch-none select-none"
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
          {strokes.length === 0 && <span className="pointer-events-none absolute inset-x-8 top-1/2 border-b border-dashed border-[#d6e0ec] text-center text-xs font-semibold text-[#a3afbf]"><span className="relative top-5 bg-white px-2">请横向签写</span></span>}
        </div>
        <div className="mt-4 grid grid-cols-[44px_44px_minmax(0,1fr)] gap-3 landscape:mx-auto landscape:w-full landscape:max-w-2xl">
          <button type="button" title="撤销" onClick={() => setStrokes((current) => current.slice(0, -1))} disabled={strokes.length === 0 || submitting} className="flex h-11 items-center justify-center rounded-lg border border-[#d6e0ec] bg-white text-[#52647b] disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" title="清空" onClick={() => setStrokes([])} disabled={strokes.length === 0 || submitting} className="flex h-11 items-center justify-center rounded-lg border border-[#d6e0ec] bg-white text-[#52647b] disabled:opacity-40"><Eraser className="h-4 w-4" /></button>
          <button type="button" onClick={submit} disabled={submitting} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#407AFF] px-5 text-sm font-bold text-white disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{submitting ? "提交中..." : "确认提交"}</button>
        </div>
        {message && <p className="mt-3 text-center text-sm font-semibold text-red-600">{message}</p>}
      </div>
    </main>
  );
}
