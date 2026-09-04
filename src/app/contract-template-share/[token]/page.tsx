"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import TiptapImage from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Check, Eye, FileText, Image as ImageIcon, Indent, Italic, List, ListOrdered, Loader2, Minus, Outdent, Redo2, Save, Table2, Type, Undo2 } from "lucide-react";

const PAGE_HEIGHT = 1123;
const MAX_INLINE_IMAGE_SIZE = 4 * 1024 * 1024;
const DEFAULT_IMAGE_WIDTH = 360;
const IMAGE_TRIM_TOLERANCE = 22;
const fontFamilies = ["宋体", "微软雅黑", "黑体", "仿宋", "楷体", "Arial", "Times New Roman"];
const fontSizes = [12, 14, 16, 18, 20, 22, 24, 28, 32];
const imageWidths = [
  { label: "小图 240", value: 240 },
  { label: "适中 360", value: 360 },
  { label: "大图 480", value: 480 },
  { label: "通栏 640", value: 640 },
];
const textColors = [
  { label: "黑色", value: "#182230" },
  { label: "蓝色", value: "#407AFF" },
  { label: "红色", value: "#DC2626" },
  { label: "灰色", value: "#667085" },
];
const highlightColors = [
  { label: "无底色", value: "transparent" },
  { label: "浅黄", value: "#FEF3C7" },
  { label: "浅蓝", value: "#DBEAFE" },
  { label: "浅绿", value: "#DCFCE7" },
];

const ContractTemplateImage = TiptapImage.extend({
  addAttributes() {
    const parentAttributes = this.parent?.() || {};
    return {
      ...parentAttributes,
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") || element.getAttribute("align") || "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align || "center" }),
      },
    };
  },
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败，请换一张图片重试"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败，请换一张图片重试"));
    image.src = src;
  });
}

async function trimImageBlankEdges(src: string): Promise<{ src: string; trimmed: boolean }> {
  if (!src.startsWith("data:image/")) return { src, trimmed: false };
  const image = await loadImageFromDataUrl(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return { src, trimmed: false };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { src, trimmed: false };
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const samplePoints = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  const bg = samplePoints.reduce(
    (acc, index) => {
      acc.r += data[index];
      acc.g += data[index + 1];
      acc.b += data[index + 2];
      acc.a += data[index + 3];
      return acc;
    },
    { r: 0, g: 0, b: 0, a: 0 },
  );
  bg.r /= samplePoints.length;
  bg.g /= samplePoints.length;
  bg.b /= samplePoints.length;
  bg.a /= samplePoints.length;

  const isBackground = (index: number) => {
    const alpha = data[index + 3];
    if (alpha < 12) return true;
    return (
      Math.abs(data[index] - bg.r) <= IMAGE_TRIM_TOLERANCE &&
      Math.abs(data[index + 1] - bg.g) <= IMAGE_TRIM_TOLERANCE &&
      Math.abs(data[index + 2] - bg.b) <= IMAGE_TRIM_TOLERANCE &&
      Math.abs(alpha - bg.a) <= IMAGE_TRIM_TOLERANCE
    );
  };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (!isBackground(index)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return { src, trimmed: false };

  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  if (cropWidth >= width * 0.96 && cropHeight >= height * 0.96) return { src, trimmed: false };

  const output = document.createElement("canvas");
  output.width = cropWidth;
  output.height = cropHeight;
  const outputCtx = output.getContext("2d");
  if (!outputCtx) return { src, trimmed: false };
  outputCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return { src: output.toDataURL("image/png"), trimmed: true };
}

function formatExpiresAt(value?: string | null) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function ContractTemplateSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("合同模板");
  const [contractType, setContractType] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [, setEditorUiVersion] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ContractTemplateImage.configure({
        allowBase64: true,
        HTMLAttributes: { class: "contract-template-share-image" },
        resize: {
          enabled: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          minWidth: 80,
          minHeight: 40,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Table.configure({
        HTMLAttributes: { class: "contract-template-share-table" },
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "contract-template-share-editor",
        style: `min-height: ${PAGE_HEIGHT}px`,
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      setHtml(nextEditor.getHTML());
      setEditorUiVersion((version) => version + 1);
      setMessage("");
    },
    onSelectionUpdate: () => setEditorUiVersion((version) => version + 1),
  });

  const previewHtml = useMemo(() => editor?.getHTML() || html, [editor, html]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/contract-template-shares/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "分享链接无效");
        setName(String(data.name || "合同模板"));
        setContractType(String(data.contract_type || ""));
        setExpiresAt(String(data.expires_at || ""));
        setHtml(String(data.html || ""));
        editor?.commands.setContent(String(data.html || ""), { emitUpdate: false });
      } catch (err: any) {
        setError(err.message || "分享链接加载失败");
      } finally {
        setLoading(false);
      }
    };
    if (editor && token) load();
  }, [editor, token]);

  const runEditorCommand = (command: () => boolean) => {
    if (!editor) return;
    command();
    setHtml(editor.getHTML());
    setEditorUiVersion((version) => version + 1);
  };

  const applyBlockType = (value: string) => {
    runEditorCommand(() => {
      if (!editor) return false;
      if (value === "p") return editor.chain().focus().setParagraph().run();
      if (value === "h1") return editor.chain().focus().toggleHeading({ level: 1 }).run();
      if (value === "h2") return editor.chain().focus().toggleHeading({ level: 2 }).run();
      if (value === "h3") return editor.chain().focus().toggleHeading({ level: 3 }).run();
      return false;
    });
  };

  const applyHighlight = (value: string) => {
    runEditorCommand(() => {
      if (!editor) return false;
      return value === "transparent"
        ? editor.chain().focus().unsetHighlight().run()
        : editor.chain().focus().setHighlight({ color: value }).run();
    });
  };

  const applyImageWidth = (width: number) => {
    runEditorCommand(() => editor?.chain().focus().updateAttributes("image", { width, height: null }).run() || false);
  };

  const applyAlignment = async (align: "left" | "center" | "right" | "justify") => {
    if (editor?.isActive("image")) {
      const imageAttrs = editor.getAttributes("image");
      const imageAlign = align === "justify" ? "center" : align;
      const trimmed = await trimImageBlankEdges(String(imageAttrs.src || "")).catch(() => ({ src: String(imageAttrs.src || ""), trimmed: false }));
      runEditorCommand(() => editor.chain().focus().updateAttributes("image", { align: imageAlign, src: trimmed.src }).run());
      if (trimmed.trimmed) {
        setMessage("已裁掉图片外圈空白，现在可以正常左右对齐");
      }
      return;
    }
    runEditorCommand(() => editor?.chain().focus().setTextAlign(align).run() || false);
  };

  const insertImageFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("请选择图片文件");
      return;
    }
    if (file.size > MAX_INLINE_IMAGE_SIZE) {
      setMessage("图片不能超过 4MB，请先压缩后再插入");
      return;
    }
    try {
      const originalSrc = await readFileAsDataUrl(file);
      const { src, trimmed } = await trimImageBlankEdges(originalSrc);
      if (!src.startsWith("data:image/")) {
        setMessage("图片读取失败，请换一张图片重试");
        return;
      }
      runEditorCommand(() => editor?.chain().focus().insertContent({
        type: "image",
        attrs: { src, alt: file.name, width: DEFAULT_IMAGE_WIDTH, align: "center" },
      }).run() || false);
      setMessage(trimmed ? "图片已插入，并已自动裁掉外圈空白" : "图片已插入，点击图片四角可拖拽缩放");
    } catch {
      setMessage("图片读取失败，请换一张图片重试");
    }
  };

  const saveShareDraft = async () => {
    if (!editor) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/contract-template-shares/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: editor.getHTML() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "保存失败");
      setHtml(String(data.html || editor.getHTML()));
      setExpiresAt(String(data.expires_at || expiresAt));
      setMessage("已保存到该分享链接");
    } catch (err: any) {
      setMessage(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="contract-template-share-page flex min-h-screen items-center justify-center bg-[#eef3f8] text-[#667085]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#407aff]" />
        正在打开合同模板编辑页...
      </main>
    );
  }

  if (error) {
    return (
      <main className="contract-template-share-page flex min-h-screen items-center justify-center bg-[#eef3f8] px-6">
        <div className="w-full max-w-[420px] rounded-[12px] border border-red-100 bg-white p-6 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-base font-semibold text-red-600">{error}</p>
          <p className="mt-2 text-sm leading-6 text-[#667085]">请确认链接是否完整，或联系分享人重新生成有效链接。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="contract-template-share-page min-h-screen bg-[#edf2f7]">
      <header className="sticky top-0 z-10 border-b border-[#dce4ef] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-[#407aff]" />
              <h1 className="truncate text-sm font-semibold text-[#182230]">{name}</h1>
              {contractType ? <span className="rounded-full bg-[#eef5ff] px-2 py-0.5 text-[11px] font-bold text-[#407aff]">{contractType}</span> : null}
            </div>
            <p className="mt-1 text-xs text-[#667085]">仅可编辑该分享页面内容，有效期至 {formatExpiresAt(expiresAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-[10px] bg-[#f2f4f7] p-1">
              <button type="button" onClick={() => setMode("edit")} className={`h-8 rounded-[8px] px-3 text-xs font-semibold ${mode === "edit" ? "bg-white text-[#182230] shadow-sm" : "text-[#667085]"}`}>编辑</button>
              <button type="button" onClick={() => setMode("preview")} className={`inline-flex h-8 items-center gap-1 rounded-[8px] px-3 text-xs font-semibold ${mode === "preview" ? "bg-white text-[#182230] shadow-sm" : "text-[#667085]"}`}>
                <Eye className="h-3.5 w-3.5" />预览
              </button>
            </div>
            <button type="button" onClick={saveShareDraft} disabled={saving} className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-[#407aff] bg-[#407aff] px-3 text-sm font-semibold text-white transition hover:bg-[#2f66dc] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : message.startsWith("已") ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              保存
            </button>
          </div>
        </div>
        {message ? <p className={`mx-auto mt-2 max-w-[1180px] text-xs font-semibold ${message.startsWith("已") ? "text-emerald-600" : "text-red-600"}`}>{message}</p> : null}
      </header>

      {mode === "edit" ? (
        <>
          <div className="contract-template-share-toolbar mx-auto mt-4 flex w-[calc(100vw-32px)] max-w-[1680px] flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden rounded-[12px] border border-[#dce4ef] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <select
              aria-label="段落样式"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) applyBlockType(event.target.value);
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>段落</option>
              <option value="p">正文</option>
              <option value="h1">标题一</option>
              <option value="h2">标题二</option>
              <option value="h3">标题三</option>
            </select>
            <select
              aria-label="字体"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) runEditorCommand(() => editor?.chain().focus().setFontFamily(event.target.value).run() || false);
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>字体</option>
              {fontFamilies.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
            <select
              aria-label="字号"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) runEditorCommand(() => editor?.chain().focus().setFontSize(`${event.target.value}px`).run() || false);
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>字号</option>
              {fontSizes.map((size) => <option key={size} value={size}>{size}px</option>)}
            </select>
            <span className="h-5 w-px bg-[#dce4ef]" />
            <button type="button" data-active={editor?.isActive("bold") ? "true" : undefined} onClick={() => runEditorCommand(() => editor?.chain().focus().toggleBold().run() || false)} title="加粗"><strong>B</strong></button>
            <button type="button" data-active={editor?.isActive("italic") ? "true" : undefined} onClick={() => runEditorCommand(() => editor?.chain().focus().toggleItalic().run() || false)} title="斜体"><Italic className="h-4 w-4" /></button>
            <button type="button" data-active={editor?.isActive("underline") ? "true" : undefined} onClick={() => runEditorCommand(() => editor?.chain().focus().toggleUnderline().run() || false)} title="下划线"><span className="underline">U</span></button>
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().unsetAllMarks().clearNodes().run() || false)} title="清除格式"><Type className="h-4 w-4" /></button>
            <select
              aria-label="文字颜色"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) runEditorCommand(() => editor?.chain().focus().setColor(event.target.value).run() || false);
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>文字色</option>
              {textColors.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
            </select>
            <select
              aria-label="高亮底色"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) applyHighlight(event.target.value);
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>高亮</option>
              {highlightColors.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
            </select>
            <span className="h-5 w-px bg-[#dce4ef]" />
            <button type="button" data-active={editor?.isActive("image", { align: "left" }) || editor?.isActive({ textAlign: "left" }) ? "true" : undefined} onClick={() => applyAlignment("left")} title="左对齐"><AlignLeft className="h-4 w-4" /></button>
            <button type="button" data-active={editor?.isActive("image", { align: "center" }) || editor?.isActive({ textAlign: "center" }) ? "true" : undefined} onClick={() => applyAlignment("center")} title="居中"><AlignCenter className="h-4 w-4" /></button>
            <button type="button" data-active={editor?.isActive("image", { align: "right" }) || editor?.isActive({ textAlign: "right" }) ? "true" : undefined} onClick={() => applyAlignment("right")} title="右对齐"><AlignRight className="h-4 w-4" /></button>
            <button type="button" data-active={editor?.isActive({ textAlign: "justify" }) ? "true" : undefined} onClick={() => applyAlignment("justify")} title="两端对齐"><AlignJustify className="h-4 w-4" /></button>
            <span className="h-5 w-px bg-[#dce4ef]" />
            <button type="button" data-active={editor?.isActive("bulletList") ? "true" : undefined} onClick={() => runEditorCommand(() => editor?.chain().focus().toggleBulletList().run() || false)} title="项目符号"><List className="h-4 w-4" /></button>
            <button type="button" data-active={editor?.isActive("orderedList") ? "true" : undefined} onClick={() => runEditorCommand(() => editor?.chain().focus().toggleOrderedList().run() || false)} title="编号列表"><ListOrdered className="h-4 w-4" /></button>
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().liftListItem("listItem").run() || false)} title="减少缩进"><Outdent className="h-4 w-4" /></button>
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().sinkListItem("listItem").run() || false)} title="增加缩进"><Indent className="h-4 w-4" /></button>
            <span className="h-5 w-px bg-[#dce4ef]" />
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().insertTable({ rows: 4, cols: 3, withHeaderRow: false }).run() || false)} title="插入表格"><Table2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => imageFileInputRef.current?.click()} title="插入图片"><ImageIcon className="h-4 w-4" /></button>
            <select
              aria-label="图片宽度"
              defaultValue=""
              disabled={!editor?.isActive("image")}
              onChange={(event) => {
                if (event.target.value) applyImageWidth(Number(event.target.value));
                event.currentTarget.value = "";
              }}
            >
              <option value="" disabled>图片宽度</option>
              {imageWidths.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().setHorizontalRule().run() || false)} title="插入分隔线"><Minus className="h-4 w-4" /></button>
            <span className="h-5 w-px bg-[#dce4ef]" />
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().undo().run() || false)} title="撤销"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => runEditorCommand(() => editor?.chain().focus().redo().run() || false)} title="重做"><Redo2 className="h-4 w-4" /></button>
            <input
              ref={imageFileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(event) => {
                insertImageFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <section className="contract-template-share-canvas px-4 py-6">
            <div className="mx-auto w-full max-w-[820px]">
              <EditorContent editor={editor} />
            </div>
          </section>
        </>
      ) : (
        <section className="contract-template-share-canvas px-4 py-6">
          <article className="contract-template-share-preview mx-auto w-full max-w-[820px]" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </section>
      )}

      <style jsx global>{`
        .contract-template-share-toolbar button {
          display: inline-flex;
          flex: 0 0 auto;
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          color: #475467;
          transition: background 0.16s ease, color 0.16s ease;
        }
        .contract-template-share-toolbar select {
          flex: 0 0 auto;
          height: 32px;
          min-width: 82px;
          border: 1px solid #dce4ef;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0 28px 0 10px;
          color: #344054;
          font-size: 12px;
          font-weight: 700;
          outline: none;
        }
        .contract-template-share-toolbar select[aria-label="字体"] {
          min-width: 128px;
        }
        .contract-template-share-toolbar select[aria-label="文字颜色"],
        .contract-template-share-toolbar select[aria-label="高亮底色"],
        .contract-template-share-toolbar select[aria-label="图片宽度"] {
          min-width: 96px;
        }
        .contract-template-share-toolbar > span {
          flex: 0 0 auto;
        }
        .contract-template-share-toolbar::-webkit-scrollbar {
          height: 4px;
        }
        .contract-template-share-toolbar::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #c9d4e5;
        }
        .contract-template-share-toolbar select:hover {
          background: #edf4ff;
        }
        .contract-template-share-toolbar select:focus {
          border-color: #407aff;
          box-shadow: 0 0 0 3px rgba(64, 122, 255, 0.12);
        }
        .contract-template-share-toolbar button:hover,
        .contract-template-share-toolbar button[data-active="true"] {
          background: #407aff;
          color: #fff;
        }
        .contract-template-share-toolbar button:disabled,
        .contract-template-share-toolbar select:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .contract-template-share-canvas {
          background:
            radial-gradient(circle at 24px 24px, rgba(148, 163, 184, 0.13) 1px, transparent 1px),
            linear-gradient(180deg, #eef3f8 0%, #e9eef5 100%);
          background-size: 20px 20px, auto;
        }
        .contract-template-share-editor,
        .contract-template-share-preview {
          background: #fff;
          border: 1px solid rgba(203, 213, 225, 0.72);
          box-shadow: 0 22px 52px rgba(15, 23, 42, 0.14);
          color: #182230;
          font-size: 14px;
          line-height: 1.75;
          outline: none;
          padding: 40px 48px;
        }
        .contract-template-share-editor:focus {
          box-shadow: 0 22px 52px rgba(15, 23, 42, 0.14), 0 0 0 4px rgba(64, 122, 255, 0.12);
        }
        .contract-template-share-editor h1,
        .contract-template-share-preview h1 {
          margin: 0 0 12px;
          font-size: 24px;
          font-weight: 700;
          line-height: 1.45;
          text-align: center;
        }
        .contract-template-share-editor h2,
        .contract-template-share-preview h2 {
          margin: 0 0 12px;
          font-size: 20px;
          font-weight: 700;
        }
        .contract-template-share-editor h3,
        .contract-template-share-preview h3 {
          margin: 0 0 12px;
          font-size: 17px;
          font-weight: 700;
        }
        .contract-template-share-editor p,
        .contract-template-share-preview p {
          margin: 0 0 10px;
          min-height: 1em;
        }
        .contract-template-share-editor ul,
        .contract-template-share-editor ol,
        .contract-template-share-preview ul,
        .contract-template-share-preview ol {
          margin: 0 0 12px 24px;
          padding: 0;
        }
        .contract-template-share-editor table,
        .contract-template-share-preview table {
          width: 100%;
          margin: 12px 0 16px;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .contract-template-share-editor th,
        .contract-template-share-editor td,
        .contract-template-share-preview th,
        .contract-template-share-preview td {
          border: 1px solid #d0d7e2;
          padding: 8px 10px;
          vertical-align: top;
          word-break: break-word;
        }
        .contract-template-share-editor img,
        .contract-template-share-preview img {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 10px auto;
        }
        .contract-template-share-editor img[data-align="left"],
        .contract-template-share-preview img[data-align="left"] {
          margin-left: 0;
          margin-right: auto;
        }
        .contract-template-share-editor img[data-align="right"],
        .contract-template-share-preview img[data-align="right"] {
          margin-left: auto;
          margin-right: 0;
        }
        .contract-template-share-editor [data-resize-container][data-node="image"] {
          display: flex !important;
          width: max-content !important;
          max-width: 100% !important;
          justify-content: center;
          margin: 10px auto;
        }
        .contract-template-share-editor [data-resize-container][data-node="image"]:has(img[data-align="left"]) {
          justify-content: flex-start;
          margin-left: 0;
          margin-right: auto;
        }
        .contract-template-share-editor [data-resize-container][data-node="image"]:has(img[data-align="right"]) {
          justify-content: flex-end;
          margin-left: auto;
          margin-right: 0;
        }
        .contract-template-share-editor [data-resize-container][data-node="image"] [data-resize-wrapper] {
          max-width: 100%;
        }
        .contract-template-share-editor [data-resize-handle] {
          z-index: 3;
          width: 10px;
          height: 10px;
          border: 2px solid #fff;
          border-radius: 999px;
          background: #407aff;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22);
        }
        @media print {
          .contract-template-share-page header,
          .contract-template-share-toolbar {
            display: none !important;
          }
          .contract-template-share-canvas {
            padding: 0 !important;
            background: #fff !important;
          }
          .contract-template-share-preview {
            border: 0;
            box-shadow: none;
          }
        }
      `}</style>
    </main>
  );
}
