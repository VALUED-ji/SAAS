// 客户详情页共享工具模块
// 存放页面主体与展示组件共用的类型与纯计算函数，
// 避免 page.tsx 与 project-detail-bits.tsx 之间循环依赖。

export type CustomerAttachment = {
  id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  mime_type?: string | null;
  category?: string | null;
  created_at?: string | null;
  followup_id?: string | null;
};

export function formatFileSize(bytes?: number | null) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export function isImageAttachment(file?: CustomerAttachment | null) {
  if (!file) return false;
  if (file.mime_type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(file.file_name || file.file_url || "");
}

export function isPdfAttachment(file?: CustomerAttachment | null) {
  if (!file) return false;
  if (file.mime_type === "application/pdf") return true;
  return /\.pdf$/i.test(file.file_name || file.file_url || "");
}

export function isLinkAttachment(file?: CustomerAttachment | null) {
  return file?.mime_type === "text/uri-list" || /^https?:\/\//i.test(file?.file_url || "");
}

export function getAttachmentHostLabel(file?: CustomerAttachment | null) {
  try {
    const host = new URL(file?.file_url || "").hostname.replace(/^www\./, "");
    return host || "在线链接";
  } catch {
    return "在线链接";
  }
}
