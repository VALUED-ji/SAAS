"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Indent,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Outdent,
  Plus,
  Redo2,
  Save,
  Share2,
  Star,
  Table2,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
  Upload,
} from "lucide-react";
import {
  contractTemplateDynamicBlocks,
  contractTemplateVariableGroups,
  getDefaultContractTemplateHtml,
} from "@/lib/contractTemplates";

type TemplateItem = {
  id: string;
  name: string;
  contract_type: string;
  status: "draft" | "published" | "disabled";
  is_default: number;
  current_version: number;
  version_id?: string | null;
  html?: string | null;
  updated_at?: string | null;
  has_published_history?: number;
};

const contractTypes = ["装修施工合同", "设计合同", "主材合同", "增补合同", "整装合同", "软装合同", "其他"];
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
const shareExpireOptions = [
  { label: "1天", value: "1d" },
  { label: "7天", value: "7d" },
  { label: "30天", value: "30d" },
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

function stripPaginationMarkers(html: string) {
  return String(html || "").replace(/<div\b[^>]*data-contract-page-break=(?:"true"|'true')[\s\S]*?<\/div>/gi, "");
}

function makeLocalTemplate(contractType = "装修施工合同"): TemplateItem {
  return {
    id: "",
    name: `${contractType}模板`,
    contract_type: contractType,
    status: "draft",
    is_default: 0,
    current_version: 1,
    html: getDefaultContractTemplateHtml(contractType),
  };
}

function getStatusText(status: string) {
  if (status === "published") return "已发布";
  if (status === "disabled") return "已停用";
  return "草稿";
}

function getStatusBadgeClass(status: string) {
  if (status === "published") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "disabled") return "bg-red-50 text-red-600 ring-red-100";
  return "bg-amber-50 text-amber-700 ring-amber-100";
}

export default function ContractTemplatesSection({ branchId, disabled = false }: { branchId: string; disabled?: boolean }) {
  const templateNameInputRef = useRef<HTMLInputElement>(null);
  const wordFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<TemplateItem>(() => makeLocalTemplate());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingWord, setImportingWord] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [message, setMessage] = useState("");
  const [typeFilter, setTypeFilter] = useState("装修施工合同");
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [shareExpiresIn, setShareExpiresIn] = useState("7d");
  const [shareLink, setShareLink] = useState("");
  const [creatingShare, setCreatingShare] = useState(false);
  const [showInsertPanel, setShowInsertPanel] = useState(false);
  const [, setEditorUiVersion] = useState(0);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ContractTemplateImage.configure({
        allowBase64: true,
        HTMLAttributes: { class: "word-import-image contract-template-inline-image" },
        resize: {
          enabled: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
          minWidth: 80,
          minHeight: 40,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Table.configure({
        HTMLAttributes: { class: "contract-table word-import-table" },
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: stripPaginationMarkers(draft.html || ""),
    editorProps: {
      attributes: {
        class: "contract-template-page w-full bg-white px-12 py-10 text-sm leading-7 text-[#182230] shadow-[0_18px_40px_rgba(15,23,42,.10)] outline-none focus:ring-2 focus:ring-[#407AFF]/20",
        style: `min-height: ${PAGE_HEIGHT}px`,
      },
    },
    onUpdate: () => {
      setHasUnsavedChanges(true);
      setEditorUiVersion((version) => version + 1);
      updatePagePreview();
    },
    onSelectionUpdate: () => {
      setEditorUiVersion((version) => version + 1);
      updatePagePreview();
    },
  });

  const filteredItems = useMemo(
    () => items.filter((item) => item.contract_type === typeFilter),
    [items, typeFilter],
  );
  const isUnsavedDraft = !draft.id && !selectedId;
  const canDeleteDraft = Boolean(draft.id && draft.status === "draft" && !draft.has_published_history);
  const editorState = isUnsavedDraft
    ? {
        title: "正在新建模板",
        tone: "amber",
        description: "当前模板还没有保存。先点击“保存”进入左侧列表，再点击“发布启用”给客户合同使用。",
      }
    : hasUnsavedChanges
      ? {
          title: "有未保存修改",
          tone: "amber",
          description: "当前编辑内容还没保存。请先点击“保存”，再点击“发布启用”。",
        }
    : draft.status === "published"
      ? {
        title: "已发布，可用于客户合同",
        tone: "green",
          description: "这是当前合同类型正在使用的模板。修改内容后需要先保存，再重新发布启用。",
        }
      : draft.status === "disabled"
        ? {
            title: "已停用，不再用于新合同",
            tone: "red",
            description: "历史合同不受影响。如需重新使用，可直接点击“发布启用”。",
          }
        : {
            title: "草稿模板，尚未启用",
            tone: "blue",
            description: "草稿只会保存在模板列表里。发布启用前会提示确认，并停用同类型当前已发布模板。",
          };
  const editorDisabled = disabled || !editor;

  const loadTemplates = async (nextType = typeFilter, preferredId = selectedId) => {
    if (!branchId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/contract-templates?org_unit_id=${encodeURIComponent(branchId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "读取合同模板失败");
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      const current = nextItems.find((item: TemplateItem) => item.id === preferredId)
        || nextItems.find((item: TemplateItem) => item.contract_type === nextType && item.is_default)
        || nextItems.find((item: TemplateItem) => item.contract_type === nextType)
        || makeLocalTemplate(nextType);
      setSelectedId(current.id || "");
      setDraft({ ...current, html: current.html || getDefaultContractTemplateHtml(current.contract_type) });
      setSetAsDefault(!current.id || Boolean(current.is_default));
      setHasUnsavedChanges(false);
    } catch (err: any) {
      setMessage(err.message || "读取合同模板失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates(typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    if (!editor) return;
    const nextHtml = stripPaginationMarkers(draft.html || "");
    if (editor.getHTML() !== nextHtml) editor.commands.setContent(nextHtml, { emitUpdate: false });
    window.requestAnimationFrame(updatePagePreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, draft.id, draft.current_version, draft.html]);

  useEffect(() => {
    if (!editor) return;
    const observer = new ResizeObserver(() => updatePagePreview());
    observer.observe(editor.view.dom);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!isEditorFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsEditorFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => editor?.commands.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor, isEditorFullscreen]);

  const updatePagePreview = () => {
    window.requestAnimationFrame(() => {
      if (!editor) return;
      const editorDom = editor.view.dom as HTMLElement;
      const contentBottom = Array.from(editorDom.children).reduce((max, child) => {
        if (!(child instanceof HTMLElement)) return max;
        return Math.max(max, child.offsetTop + child.offsetHeight);
      }, editorDom.scrollHeight);
      const nextCount = Math.max(1, Math.ceil(contentBottom / PAGE_HEIGHT));
      setPageCount((prev) => (prev === nextCount ? prev : nextCount));
    });
  };

  const selectTemplate = (template: TemplateItem) => {
    setSelectedId(template.id);
    setDraft({ ...template, html: template.html || getDefaultContractTemplateHtml(template.contract_type) });
    setSetAsDefault(Boolean(template.is_default));
    setHasUnsavedChanges(false);
    setMessage("");
  };

  const newTemplate = (contractType = typeFilter) => {
    const template = makeLocalTemplate(contractType);
    setSelectedId("");
    setDraft(template);
    setSetAsDefault(items.filter((item) => item.contract_type === contractType).length === 0);
    setHasUnsavedChanges(true);
    setMessage("已创建空白模板，请编辑内容后先点击“保存”，再按需要“发布启用”");
    window.setTimeout(() => {
      editor?.commands.setContent(template.html || "", { emitUpdate: false });
      updatePagePreview();
      templateNameInputRef.current?.focus();
      templateNameInputRef.current?.select();
    });
  };

  const getEditorHtml = () => {
    const html = editor?.getHTML() || draft.html || "";
    updatePagePreview();
    return stripPaginationMarkers(html);
  };

  const runEditorCommand = (command: () => boolean) => {
    if (!editor || disabled) return;
    command();
    setEditorUiVersion((version) => version + 1);
    setHasUnsavedChanges(true);
    updatePagePreview();
  };

  const insertText = (text: string) => {
    runEditorCommand(() => editor?.chain().focus().insertContent(text).run() || false);
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

  const insertTable = () => {
    runEditorCommand(() => editor?.chain().focus().insertTable({ rows: 4, cols: 3, withHeaderRow: false }).run() || false);
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
    if (disabled) {
      setMessage("该分公司已停用，不能插入图片");
      return;
    }
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
      setMessage(trimmed ? "图片已插入，并已自动裁掉外圈空白" : "图片已插入，点击图片四角可拖拽缩放，也可用工具栏调整宽度");
    } catch {
      setMessage("图片读取失败，请换一张图片重试");
    }
  };

  const importWord = async (file?: File | null) => {
    if (!file) return;
    if (disabled) {
      setMessage("该分公司已停用，不能导入合同模板");
      return;
    }
    if (!/\.docx$/i.test(file.name)) {
      setMessage("请上传 .docx 格式的 Word 文件；旧版 .doc 请先另存为 .docx");
      return;
    }
    const currentHtml = getEditorHtml().replace(/<br\s*\/?>|&nbsp;|\s|<[^>]+>/gi, "");
    if (isUnsavedDraft && currentHtml && !window.confirm("导入 Word 会替换当前未保存模板内容，确定继续吗？")) return;
    setImportingWord(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("org_unit_id", branchId);
      formData.append("file", file);
      const res = await fetch("/api/contract-templates/import-word", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "导入 Word 失败");
      const html = String(data.html || "");
      if (!html) throw new Error("未读取到 Word 正文内容");
      const importedName = String(data.file_name || file.name || "").replace(/\.docx$/i, "");
      setSelectedId("");
      setDraft((prev) => ({
        ...makeLocalTemplate(typeFilter),
        name: importedName || prev.name,
        html,
      }));
      setSetAsDefault(items.filter((item) => item.contract_type === typeFilter).length === 0);
      setHasUnsavedChanges(true);
      editor?.commands.setContent(html, { emitUpdate: false });
      window.requestAnimationFrame(() => {
        updatePagePreview();
        templateNameInputRef.current?.focus();
        templateNameInputRef.current?.select();
      });
      const warnings = Array.isArray(data.warnings) && data.warnings.length > 0 ? `，有 ${data.warnings.length} 条格式提示` : "";
      setMessage(`Word 已导入，可继续编辑后先点击“保存”，再按需要“发布启用”${warnings}`);
    } catch (err: any) {
      setMessage(err.message || "导入 Word 失败");
    } finally {
      setImportingWord(false);
    }
  };

  const saveTemplate = async (action: "save" | "disable" | "set_default") => {
    if (disabled) {
      setMessage("该分公司已停用，不能修改合同模板");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        action,
        org_unit_id: branchId,
        id: draft.id || selectedId || "",
        name: draft.name,
        contract_type: draft.contract_type,
        html: getEditorHtml(),
        is_default: setAsDefault,
      };
      const res = await fetch("/api/contract-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "保存合同模板失败");
      const nextId = String(data.id || draft.id || selectedId || "");
      await loadTemplates(draft.contract_type, nextId);
      setHasUnsavedChanges(false);
      setMessage(action === "disable" ? "合同模板已停用" : action === "set_default" ? "已设为默认模板" : "合同模板已保存；如需给客户合同使用，请点击“发布启用”");
    } catch (err: any) {
      setMessage(err.message || "保存合同模板失败");
    } finally {
      setSaving(false);
    }
  };

  const publishTemplate = async () => {
    if (disabled) {
      setMessage("该分公司已停用，不能发布合同模板");
      return;
    }
    if (!draft.id && !selectedId) {
      setMessage("请先保存模板，再发布启用");
      return;
    }
    if (hasUnsavedChanges) {
      setMessage("当前有未保存修改，请先点击“保存”，再发布启用");
      return;
    }
    const currentId = draft.id || selectedId;
    const publishedConflict = items.find((item) => (
      item.contract_type === draft.contract_type && item.status === "published" && item.id !== currentId
    ));
    if (publishedConflict && !window.confirm(`当前“${draft.contract_type}”已有已发布模板：${publishedConflict.name}。\n\n继续发布后，该模板会自动停用，当前模板会成为可用模板。历史合同不受影响。\n\n确定继续发布吗？`)) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/contract-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish_saved",
          org_unit_id: branchId,
          id: currentId,
          is_default: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "发布合同模板失败");
      const nextId = String(data.id || currentId || "");
      await loadTemplates(draft.contract_type, nextId);
      setMessage(publishedConflict ? "合同模板已发布启用，原同类型已发布模板已停用" : "合同模板已发布启用");
    } catch (err: any) {
      setMessage(err.message || "发布合同模板失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteDraftTemplate = async () => {
    if (disabled) {
      setMessage("该分公司已停用，不能删除合同模板");
      return;
    }
    if (!canDeleteDraft) {
      setMessage("只有从未发布过的草稿模板可以删除");
      return;
    }
    if (!window.confirm(`确定删除草稿模板“${draft.name}”吗？\n\n删除后不会出现在模板列表中，此操作只允许用于未发布草稿。`)) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/contract-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_draft",
          org_unit_id: branchId,
          id: draft.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "删除草稿模板失败");
      await loadTemplates(draft.contract_type, "");
      setMessage("草稿模板已删除");
    } catch (err: any) {
      setMessage(err.message || "删除草稿模板失败");
    } finally {
      setSaving(false);
    }
  };

  const createShareLink = async () => {
    if (disabled) {
      setMessage("该分公司已停用，不能分享合同模板");
      return;
    }
    const html = getEditorHtml();
    if (!draft.name.trim()) {
      setMessage("请先填写模板名称");
      templateNameInputRef.current?.focus();
      return;
    }
    if (!html.trim()) {
      setMessage("请先填写合同模板内容");
      return;
    }
    setCreatingShare(true);
    setMessage("");
    setShareLink("");
    try {
      const res = await fetch("/api/contract-template-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_unit_id: branchId,
          template_id: draft.id || selectedId || "",
          name: draft.name,
          contract_type: draft.contract_type,
          html,
          expiresIn: shareExpiresIn,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "生成分享链接失败");
      const url = String(data.share_url || "");
      setShareLink(url);
      setMessage("分享链接已生成，朋友只能访问该合同模板编辑页");
      if (url && navigator.clipboard) {
        await navigator.clipboard.writeText(url).catch(() => undefined);
      }
    } catch (err: any) {
      setMessage(err.message || "生成分享链接失败");
    } finally {
      setCreatingShare(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setMessage("分享链接已复制");
    } catch {
      setMessage("当前浏览器不支持自动复制，请手动复制链接");
    }
  };

  return (
    <section className="branch-settings-panel branch-contract-workbench contract-template-workbench flex h-[calc(100dvh-258px)] min-h-[680px] flex-col overflow-hidden rounded-[16px] border border-[#dfe6ef] bg-[#f4f7fb] shadow-none">
      <div className="contract-template-header flex shrink-0 flex-col gap-3 border-b border-[#dfe6ef] bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#407AFF]" />
            <h3 className="text-base font-semibold text-[#182230]">合同模板</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#667085]">选择模板、编辑合同正文，并发布为客户合同可用版本。</p>
        </div>
        <div className="contract-template-actions flex flex-wrap items-center gap-2">
          <div className="contract-template-action-group">
            <button type="button" onClick={() => newTemplate()} className="btn-primary" disabled={saving || disabled}>
              <Plus className="h-4 w-4" />新建空白模板
            </button>
            <button type="button" onClick={() => wordFileInputRef.current?.click()} className="btn-secondary" disabled={saving || importingWord || disabled}>
              {importingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importingWord ? "导入中..." : "导入 Word 创建"}
            </button>
          </div>
          <input
            ref={wordFileInputRef}
            type="file"
            className="hidden"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              importWord(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
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
          <div className="contract-template-action-group">
            <button type="button" onClick={() => setShowInsertPanel(true)} className="btn-secondary" disabled={disabled}>
              <Plus className="h-4 w-4" />插入内容
            </button>
            <button type="button" onClick={() => saveTemplate("save")} className="btn-secondary" disabled={saving || disabled}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存
            </button>
            <button type="button" onClick={publishTemplate} className="btn-primary" disabled={saving || disabled}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}发布启用
            </button>
          </div>
          <div className="contract-template-action-group contract-template-share-actions">
            <select
              aria-label="分享有效期"
              value={shareExpiresIn}
              onChange={(event) => setShareExpiresIn(event.target.value)}
              className="contract-template-share-expire-select"
              disabled={creatingShare || disabled}
            >
              {shareExpireOptions.map((option) => <option key={option.value} value={option.value}>有效期{option.label}</option>)}
            </select>
            <button type="button" onClick={createShareLink} className="btn-secondary" disabled={creatingShare || disabled}>
              {creatingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              生成分享
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className={`mx-5 mt-4 rounded-[10px] border px-3.5 py-2.5 text-sm font-semibold ${
          message.includes("已") ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"
        }`}>
          {message}
        </div>
      )}

      {shareLink && (
        <div className="contract-template-share-result mx-5 mt-3 flex flex-col gap-2 rounded-[10px] border border-[#cfe0ff] bg-[#f5f8ff] px-3.5 py-3 text-sm lg:flex-row lg:items-center">
          <span className="shrink-0 font-semibold text-[#407aff]">分享链接</span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#344054]" title={shareLink}>{shareLink}</span>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={copyShareLink} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#cfe0ff] bg-white px-2.5 text-xs font-semibold text-[#407aff] hover:bg-[#edf4ff]">
              <Copy className="h-3.5 w-3.5" />复制
            </button>
            <a href={shareLink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#cfe0ff] bg-white px-2.5 text-xs font-semibold text-[#407aff] hover:bg-[#edf4ff]">
              <ExternalLink className="h-3.5 w-3.5" />打开
            </a>
          </div>
        </div>
      )}

      <div className="contract-template-layout relative grid min-h-0 flex-1 gap-3 bg-[#f4f7fb] p-3 lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="contract-template-panel contract-template-sidebar min-h-0 overflow-y-auto rounded-[12px] border border-[#dfe6ef] bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#182230]">模板列表</p>
              <p className="mt-0.5 text-[11px] text-[#7a8699]">{filteredItems.length} 个当前类型模板</p>
            </div>
            <FileText className="h-4 w-4 text-[#98a2b3]" />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[#667085]">合同类型</span>
            <select
              value={typeFilter}
              onChange={(event) => {
                const value = event.target.value;
                setTypeFilter(value);
                const next = items.find((item) => item.contract_type === value && item.is_default) || items.find((item) => item.contract_type === value);
                if (next) selectTemplate(next);
                else newTemplate(value);
              }}
              className="input-field"
            >
              {contractTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-sm font-semibold text-[#667085]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#407AFF]" />读取模板
              </div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTemplate(item)}
                  data-active={selectedId === item.id ? "true" : "false"}
                  className={`contract-template-list-item w-full rounded-[10px] border px-3 py-2.5 text-left transition ${
                    selectedId === item.id ? "border-[#407AFF] bg-[#f0f6ff]" : "border-[#e4eaf2] bg-white hover:border-[#b8ccff] hover:bg-[#fbfdff]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-[#182230]">{item.name}</span>
                    {item.is_default ? <Star className="h-3.5 w-3.5 fill-[#407AFF] text-[#407AFF]" /> : null}
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-[#eef2f6] pt-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${getStatusBadgeClass(item.status)}`}>
                      {getStatusText(item.status)}
                    </span>
                    <span className="text-xs font-semibold text-[#98a2b3]">v{item.current_version || 1}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[12px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-8 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-[#98a2b3]" />
                <p className="text-sm font-semibold text-[#475467]">暂无该类型模板</p>
                <p className="mx-auto mt-2 max-w-[180px] text-xs leading-5 text-[#667085]">请点击右上角“新建空白模板”或“导入 Word 创建”。</p>
              </div>
            )}
          </div>
        </aside>

        <main className={`contract-template-editor-pane flex min-w-0 flex-col overflow-hidden ${isEditorFullscreen ? "contract-template-editor-pane-fullscreen fixed inset-0 z-[100] bg-[#f4f7fb] p-4" : ""}`}>
          {isEditorFullscreen ? (
            <div className="contract-template-fullscreen-header mb-3 flex shrink-0 items-center justify-between gap-4 rounded-[12px] border border-[#dce4ef] bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#182230]">合同模板全屏编辑</p>
                <p className="mt-1 truncate text-xs text-[#667085]" title={draft.name}>{draft.name || "未命名模板"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => saveTemplate("save")} className="btn-primary" disabled={saving || disabled}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存模板
                </button>
                <button type="button" onClick={() => setIsEditorFullscreen(false)} className="btn-secondary" title="退出全屏编辑（Esc）">
                  <Minimize2 className="h-4 w-4" />
                  退出全屏
                </button>
              </div>
            </div>
          ) : null}

          {!isEditorFullscreen ? <div className={`contract-template-state-banner contract-template-state-${editorState.tone} mb-2 shrink-0 rounded-[10px] border px-3 py-2`}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs font-bold" title={editorState.description}>{editorState.title}</p>
              <span className="shrink-0 text-[11px] font-semibold opacity-80">未保存时请先保存再发布</span>
            </div>
          </div> : null}
          <div className="contract-template-meta mb-2 grid shrink-0 gap-2 rounded-[10px] border border-[#dfe6ef] bg-white p-2 xl:grid-cols-[minmax(0,1fr)_190px]">
            <label className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-[#667085]">
                模板名称
                {isUnsavedDraft ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-100">未保存模板</span>
                ) : null}
              </span>
              <input
                ref={templateNameInputRef}
                value={draft.name}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, name: event.target.value }));
                  setHasUnsavedChanges(true);
                }}
                className="input-field bg-[#fbfcfe]"
                placeholder="例如：标准施工合同模板"
              />
            </label>
            <div className="contract-template-default-field flex items-center rounded-[10px] border border-[#e4eaf2] bg-[#f8fafc] px-3 py-2.5">
              <span className="text-xs font-semibold leading-5 text-[#475467]">发布后作为默认模板</span>
            </div>
          </div>

          <div className="contract-template-editor-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#dce4ef] bg-white">
            <div className="contract-template-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e2e7ee] bg-[#f8fafc] px-3 py-2">
              <div className="contract-template-toolbar-group contract-template-toolbar-group-wide">
                <span className="contract-template-toolbar-label">格式</span>
                <select
                  aria-label="段落样式"
                  className="contract-template-toolbar-select"
                  defaultValue=""
                  disabled={editorDisabled}
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
                  className="contract-template-toolbar-select contract-template-font-select"
                  defaultValue=""
                  disabled={editorDisabled}
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
                  className="contract-template-toolbar-select contract-template-size-select"
                  defaultValue=""
                  disabled={editorDisabled}
                  onChange={(event) => {
                    if (event.target.value) runEditorCommand(() => editor?.chain().focus().setFontSize(`${event.target.value}px`).run() || false);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="" disabled>字号</option>
                  {fontSizes.map((size) => <option key={size} value={size}>{size}px</option>)}
                </select>
              </div>
              <div className="contract-template-toolbar-group">
                <span className="contract-template-toolbar-label">文字</span>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("bold") ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().toggleBold().run() || false)} title="加粗"><strong>B</strong></button>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("italic") ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().toggleItalic().run() || false)} title="斜体"><Italic className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("underline") ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().toggleUnderline().run() || false)} title="下划线"><u>U</u></button>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().unsetAllMarks().clearNodes().run() || false)} title="清除格式"><Type className="h-4 w-4" /></button>
                <select
                  aria-label="文字颜色"
                  className="contract-template-toolbar-select contract-template-color-select"
                  defaultValue=""
                  disabled={editorDisabled}
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
                  className="contract-template-toolbar-select contract-template-color-select"
                  defaultValue=""
                  disabled={editorDisabled}
                  onChange={(event) => {
                    if (event.target.value) applyHighlight(event.target.value);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="" disabled>高亮</option>
                  {highlightColors.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                </select>
              </div>
              <div className="contract-template-toolbar-group">
                <span className="contract-template-toolbar-label">对齐</span>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("image", { align: "left" }) || editor?.isActive({ textAlign: "left" }) ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => applyAlignment("left")} title="左对齐"><AlignLeft className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("image", { align: "center" }) || editor?.isActive({ textAlign: "center" }) ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => applyAlignment("center")} title="居中"><AlignCenter className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("image", { align: "right" }) || editor?.isActive({ textAlign: "right" }) ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => applyAlignment("right")} title="右对齐"><AlignRight className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive({ textAlign: "justify" }) ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => applyAlignment("justify")} title="两端对齐"><AlignJustify className="h-4 w-4" /></button>
              </div>
              <div className="contract-template-toolbar-group">
                <span className="contract-template-toolbar-label">列表</span>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("bulletList") ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().toggleBulletList().run() || false)} title="项目符号"><List className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} data-active={editor?.isActive("orderedList") ? "true" : undefined} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().toggleOrderedList().run() || false)} title="编号列表"><ListOrdered className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().liftListItem("listItem").run() || false)} title="减少缩进"><Outdent className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().sinkListItem("listItem").run() || false)} title="增加缩进"><Indent className="h-4 w-4" /></button>
              </div>
              <div className="contract-template-toolbar-group">
                <span className="contract-template-toolbar-label">插入</span>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={insertTable} title="插入表格"><Table2 className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => imageFileInputRef.current?.click()} title="插入图片"><ImageIcon className="h-4 w-4" /></button>
                <select
                  aria-label="图片宽度"
                  className="contract-template-toolbar-select contract-template-image-size-select"
                  defaultValue=""
                  disabled={editorDisabled || !editor?.isActive("image")}
                  onChange={(event) => {
                    if (event.target.value) applyImageWidth(Number(event.target.value));
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="" disabled>图片宽度</option>
                  {imageWidths.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().setHorizontalRule().run() || false)} title="插入分页参考线"><Minus className="h-4 w-4" /></button>
              </div>
              <div className="contract-template-toolbar-group">
                <span className="contract-template-toolbar-label">历史</span>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().undo().run() || false)} title="撤销"><Undo2 className="h-4 w-4" /></button>
                <button type="button" disabled={editorDisabled} className="contract-template-tool-button flex h-8 w-8 items-center justify-center rounded-[8px] hover:bg-white" onClick={() => runEditorCommand(() => editor?.chain().focus().redo().run() || false)} title="重做"><Redo2 className="h-4 w-4" /></button>
              </div>
              <div className="contract-template-toolbar-end ml-auto flex items-center gap-2">
                <span className="contract-template-page-count rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#667085] ring-1 ring-[#e2e7ee]">分页预览 · {pageCount} 页</span>
                <button
                  type="button"
                  onClick={() => setIsEditorFullscreen((current) => !current)}
                  className="contract-template-fullscreen-button inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[#dce4ef] bg-white px-2.5 text-xs font-semibold text-[#475467] transition hover:border-[#cfe0ff] hover:bg-[#edf4ff] hover:text-[#407aff]"
                  title={isEditorFullscreen ? "退出全屏编辑（Esc）" : "全屏编辑合同正文"}
                >
                  {isEditorFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {isEditorFullscreen ? "退出全屏" : "全屏编辑"}
                </button>
              </div>
            </div>
            <div className="contract-template-canvas min-h-0 flex-1 overflow-auto bg-[#eef2f7] px-4 py-6">
              <div className="contract-template-page-frame mx-auto w-full max-w-[794px]">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        </main>

        {showInsertPanel ? (
          <div className="contract-template-drawer-backdrop absolute inset-0 z-20 flex justify-end bg-[#0f172a]/10" onClick={() => setShowInsertPanel(false)}>
            <aside
              className="contract-template-panel contract-template-inspector contract-template-insert-drawer h-full w-[320px] max-w-[calc(100%-24px)] overflow-y-auto rounded-l-[14px] border border-[#dfe6ef] bg-white p-3"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 border-b border-[#eef2f6] pb-3">
            <div>
              <h4 className="text-xs font-bold text-[#182230]">插入内容</h4>
              <p className="mt-1 text-[11px] leading-5 text-[#667085]">展开后点击插入</p>
            </div>
            <button
              type="button"
              onClick={() => setShowInsertPanel(false)}
              className="inline-flex h-8 items-center justify-center rounded-[8px] border border-[#dfe6ef] bg-[#f8fafc] px-2.5 text-xs font-bold text-[#475467] hover:bg-[#eef4ff] hover:text-[#2563eb]"
            >
              收起
            </button>
              </div>

              <div className="mt-3 space-y-2">
            {contractTemplateVariableGroups.map((group, index) => (
              <details key={group.name} open={index === 0} className="contract-template-token-section rounded-[10px] border border-[#e4eaf2] bg-[#fbfcfe]">
                <summary className="contract-template-section-summary flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold text-[#344054]">
                  <span>{group.name}</span>
                  <span className="text-[11px] font-semibold text-[#98a2b3]">{group.variables.length}项</span>
                </summary>
                <div className="flex flex-wrap gap-1.5">
                  {group.variables.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => insertText(`<span>{{${variable.key}}}</span>`)}
                      className="contract-template-token rounded-[7px] border border-[#dce4ef] bg-white px-2 py-1 text-xs font-semibold text-[#475467] hover:border-[#b8ccff] hover:bg-[#edf4ff] hover:text-[#2563eb]"
                    >
                      {variable.label}
                    </button>
                  ))}
                </div>
              </details>
            ))}

            <details open className="contract-template-token-section rounded-[10px] border border-[#d9e5d7] bg-[#f7fbf6]">
              <summary className="contract-template-section-summary flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold text-[#31533a]">
                <span>动态块</span>
                <span className="text-[11px] font-semibold text-[#7a9f7a]">{contractTemplateDynamicBlocks.length}项</span>
              </summary>
              <div className="space-y-2">
                {contractTemplateDynamicBlocks.map((block) => (
                  <button
                    key={block.key}
                    type="button"
                    onClick={() => insertText(`<p>[[${block.key}]]</p>`)}
                    className="contract-template-block-button flex w-full items-center justify-between rounded-[8px] border border-[#d9e5d7] bg-white px-3 py-2 text-left text-xs font-semibold text-[#3f5645] hover:border-[#9fc59f] hover:bg-[#eef8ef] hover:text-[#246b34]"
                  >
                    {block.label}
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </details>

            {draft.id && draft.status === "published" && !draft.is_default ? (
              <button type="button" onClick={() => saveTemplate("set_default")} className="btn-secondary w-full justify-center" disabled={saving || disabled}>
                <ToggleLeft className="h-4 w-4" />设为该类型默认模板
              </button>
            ) : null}
              </div>

              <div className="mt-3 border-t border-[#eef2f6] pt-3">
                {draft.id && draft.status === "published" ? (
                  <button
                    type="button"
                    onClick={() => saveTemplate("disable")}
                    className="contract-template-danger-button flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-red-100 bg-red-50 px-2.5 text-xs font-bold text-red-600 hover:border-red-200 hover:bg-red-100"
                    title="停用后，新合同不能再使用该模板，历史合同不受影响"
                  >
                    <ToggleLeft className="h-4 w-4" />
                    停用模板
                  </button>
                ) : canDeleteDraft ? (
                  <button
                    type="button"
                    onClick={deleteDraftTemplate}
                    className="contract-template-danger-button flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-red-100 bg-red-50 px-2.5 text-xs font-bold text-red-600 hover:border-red-200 hover:bg-red-100"
                    title="仅草稿模板可删除，已发布或曾发布过的模板不能删除"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除草稿
                  </button>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
