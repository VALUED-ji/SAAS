"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle, Camera, CheckCircle2, Download, FileText, FolderCheck, Image as ImageIcon, Images, Loader2, Trash2, Upload } from "lucide-react";
import { formatDate } from "@/lib/data";

const MEASURE_CATEGORY_BASE = "量房资料";
const DESIGN_CATEGORY_BASE = "设计方案";
const LEGACY_DESIGN_CATEGORY = "设计图纸";

function normalizeUploadCategory(value: string) {
  const category = String(value || "").trim();
  if (!category) return MEASURE_CATEGORY_BASE;
  if (category === LEGACY_DESIGN_CATEGORY) return DESIGN_CATEGORY_BASE;
  return category;
}

function getUploadScope(category: string) {
  if (category === DESIGN_CATEGORY_BASE || category === LEGACY_DESIGN_CATEGORY || category.startsWith(`${DESIGN_CATEGORY_BASE}/`)) return "design";
  if (category === MEASURE_CATEGORY_BASE || category.startsWith(`${MEASURE_CATEGORY_BASE}/`)) return "measure";
  return "other";
}

function getUploadTitle(category: string) {
  if (category === MEASURE_CATEGORY_BASE || category.startsWith(`${MEASURE_CATEGORY_BASE}/`)) return "上传量房资料";
  if (category === DESIGN_CATEGORY_BASE || category === LEGACY_DESIGN_CATEGORY || category.startsWith(`${DESIGN_CATEGORY_BASE}/`)) return "上传设计方案";
  return `上传${formatCategoryLabel(category) || "资料"}`;
}

function formatCategoryLabel(value: string) {
  return String(value || "")
    .replace(/^量房资料\//, "")
    .replace(/^设计方案\//, "")
    .replace(/^设计图纸\//, "");
}

function isSameUploadScope(file: any, uploadCategory: string) {
  const category = String(file?.category || "").trim();
  const scope = getUploadScope(uploadCategory);
  if (scope === "measure") return category === MEASURE_CATEGORY_BASE || category.startsWith(`${MEASURE_CATEGORY_BASE}/`);
  if (scope === "design") return category === DESIGN_CATEGORY_BASE || category === LEGACY_DESIGN_CATEGORY || category.startsWith(`${DESIGN_CATEGORY_BASE}/`);
  return category === uploadCategory;
}

function getClientAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zxgj_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fileIcon(mime: string) {
  if (mime?.startsWith("image")) return <ImageIcon className="h-5 w-5 text-[#407AFF]" />;
  return <FileText className="h-5 w-5 text-[#52647b]" />;
}

function ProjectUploadPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const targetId = params.id as string;
  const targetType = searchParams.get("target") === "customer" ? "customer" : "project";
  const uploadCategory = normalizeUploadCategory(searchParams.get("category") || MEASURE_CATEGORY_BASE);
  const uploadTitle = getUploadTitle(uploadCategory);
  const targetLabel = targetType === "customer" ? "客户资料" : "工地资料";
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [message, setMessage] = useState("");

  const visibleFiles = useMemo(
    () => files.filter((file) => isSameUploadScope(file, uploadCategory)),
    [files, uploadCategory],
  );

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const queryKey = targetType === "customer" ? "customer_id" : "project_id";
      const res = await fetch(`/api/upload?${queryKey}=${encodeURIComponent(targetId)}`, { headers: getClientAuthHeaders() });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "资料加载失败");
      setFiles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMessage(err?.message || "资料加载失败");
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const uploadFiles = async (fileList: FileList | null) => {
    const selectedFiles = Array.from(fileList || []);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setMessage("");
    let successCount = 0;
    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        setUploadProgress(`正在上传 ${index + 1}/${selectedFiles.length}`);
        const fd = new FormData();
        fd.append("file", file);
        fd.append(targetType === "customer" ? "customer_id" : "project_id", targetId);
        fd.append("category", uploadCategory);
        const res = await fetch("/api/upload", { method: "POST", headers: getClientAuthHeaders(), body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `${file.name} 上传失败`);
        }
        successCount += 1;
      }
      await loadFiles();
      setMessage(successCount === 1 ? "上传成功" : `已上传 ${successCount} 个文件`);
    } catch (err: any) {
      setMessage(err?.message || "上传失败");
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此文件？")) return;
    try {
      const res = await fetch(`/api/upload?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: getClientAuthHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "删除失败");
      }
      await loadFiles();
      setMessage("已删除");
    } catch (err: any) {
      setMessage(err?.message || "删除失败");
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col">
        <header className="sticky top-0 z-10 border-b border-[#e4ebf4] bg-[#f8fafc]/92 px-5 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-[#8a97a8]">着急科技</p>
              <h1 className="mt-1 truncate text-xl font-black text-[#111827]">{uploadTitle}</h1>
            </div>
            <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#dce6f2] bg-white px-3 text-xs font-bold text-[#52647b]">
              {visibleFiles.length} 个文件
            </span>
          </div>
        </header>

        <section className="flex-1 space-y-4 px-4 py-4 pb-[calc(96px+env(safe-area-inset-bottom))]">
          <div className="rounded-[20px] border border-[#e1e9f3] bg-white p-4 shadow-[0_10px_28px_rgba(31,49,77,0.06)]">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eef5ff] text-[#2f6feb] ring-1 ring-[#d8e7ff]">
                <FolderCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#8a97a8]">自动归档到</p>
                <p className="mt-0.5 truncate text-base font-black text-[#111827]">{targetLabel} · {formatCategoryLabel(uploadCategory) || "资料"}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-[#667085]">扫码链接仅用于本次资料上传，上传后电脑端会自动同步。</p>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dfe8f4] bg-white p-4 shadow-[0_12px_34px_rgba(31,49,77,0.07)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-[#111827]">上传资料</h2>
                <p className="mt-0.5 text-xs font-medium text-[#8a97a8]">支持多选，单个文件 20MB 内</p>
              </div>
              {uploading && <Loader2 className="h-5 w-5 animate-spin text-[#2f6feb]" />}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
                className="flex min-h-[112px] flex-col items-center justify-center rounded-[18px] border border-[#d7e5f8] bg-[#f7fbff] px-3 text-center transition active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2f6feb] text-white shadow-[0_10px_24px_rgba(47,111,235,0.24)]">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="mt-3 text-sm font-black text-[#111827]">拍照上传</span>
                <span className="mt-1 text-[11px] font-semibold text-[#8a97a8]">现场照片更方便</span>
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[112px] flex-col items-center justify-center rounded-[18px] border border-[#dde7f2] bg-[#fbfcfe] px-3 text-center transition active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#172033] text-white shadow-[0_10px_24px_rgba(23,32,51,0.18)]">
                  <Images className="h-5 w-5" />
                </span>
                <span className="mt-3 text-sm font-black text-[#111827]">选择文件</span>
                <span className="mt-1 text-[11px] font-semibold text-[#8a97a8]">图片、PDF、Word 等</span>
              </button>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(event) => uploadFiles(event.target.files)}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => uploadFiles(event.target.files)}
            />

            {uploading && (
              <div className="mt-3 overflow-hidden rounded-full bg-[#e7edf5]">
                <div className="h-1.5 w-2/3 animate-pulse rounded-full bg-[#2f6feb]" />
              </div>
            )}
            {message && (
              <div className={`mt-3 flex items-start gap-2 rounded-[14px] px-3 py-2 text-sm font-semibold ${
                message.includes("成功") || message.includes("已上传") || message.includes("已删除")
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
              }`}>
                {message.includes("成功") || message.includes("已上传") || message.includes("已删除")
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{uploading ? uploadProgress || message : message}</span>
              </div>
            )}
          </div>

          <div className="rounded-[22px] border border-[#dfe8f4] bg-white p-4 shadow-[0_12px_34px_rgba(31,49,77,0.06)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-[#111827]">已上传</h2>
              <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-black text-[#52647b]">{visibleFiles.length}</span>
            </div>
            {loading ? (
              <div className="flex min-h-28 items-center justify-center text-sm font-semibold text-[#7c8aa0]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在加载...
              </div>
            ) : visibleFiles.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-[18px] border border-dashed border-[#dce6f2] bg-[#f8fafc] px-4 text-center">
                <FileText className="h-9 w-9 text-[#b4c1d3]" />
                <p className="mt-2 text-sm font-black text-[#667085]">还没有上传文件</p>
                <p className="mt-1 text-xs font-medium text-[#98a2b3]">点击下方按钮，从手机相册或文件中选择</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleFiles.map((file: any) => (
                  <div key={file.id} className="flex items-center gap-3 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[#e1e9f3]">
                      {fileIcon(file.mime_type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-[#172033]">{file.file_name}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-[#8a98ad]">
                        {formatSize(file.file_size) || "未知大小"}
                        {file.created_at ? ` · ${formatDate(file.created_at)}` : ""}
                      </p>
                    </div>
                    <a href={file.file_url} download className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#7c8aa0] transition active:scale-95" aria-label="下载文件">
                      <Download className="h-4 w-4" />
                    </a>
                    <button type="button" onClick={() => handleDelete(file.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9aa7b8] transition active:scale-95" aria-label="删除文件">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[520px] border-t border-[#dfe8f4] bg-white/94 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#2f6feb] text-sm font-black text-white shadow-[0_12px_28px_rgba(47,111,235,0.24)] transition active:scale-[0.99] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? uploadProgress || "上传中..." : "继续上传资料"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ProjectUploadPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f4f7fb]" />}>
      <ProjectUploadPageContent />
    </Suspense>
  );
}
