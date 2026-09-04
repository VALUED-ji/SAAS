// 客户详情页展示组件模块
// 从 page.tsx 渐进拆出的展示组件，共享工具来自 ./project-detail-shared。

import { CheckCircle2, Download, Eye, FileText, X } from "lucide-react";
import DetailInfoField from "@/components/ui/DetailInfoField";
import NativeImage from "@/components/ui/NativeImage";
import { formatDateTime } from "@/lib/utils";
import {
  CustomerAttachment,
  formatFileSize,
  getAttachmentHostLabel,
  isImageAttachment,
  isLinkAttachment,
  isPdfAttachment,
} from "./project-detail-shared";

export function InfoRow({
  icon: Icon,
  label,
  value,
  iconBadgeClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconBadgeClassName?: string;
}) {
  return <DetailInfoField icon={Icon} label={label} value={value} iconBadgeClassName={iconBadgeClassName} />;
}

export function RequirementGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[8px] border border-[#e2e7ee] bg-white px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#f0fdf4] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /></span>
        <p className="text-sm font-semibold text-[#344054]">{title}</p>
      </div>
      <ul className="space-y-2 text-sm text-[#667085]">
        {items.map((item) => (
          <li key={item} className="flex gap-2 leading-5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#98a2b3]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AttachmentLinkPreviewFrame({ file }: { file: CustomerAttachment }) {
  const canPreviewImage = isImageAttachment(file);
  const host = getAttachmentHostLabel(file);

  if (canPreviewImage) {
    return (
      <NativeImage
        src={file.file_url}
        alt={file.file_name || "效果图链接预览"}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <iframe
        src={file.file_url}
        title={`${file.file_name || "效果图链接"}预览`}
        className="pointer-events-none absolute left-0 top-0 h-[280px] w-[480px] origin-top-left scale-[0.4] border-0 bg-white"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        tabIndex={-1}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#162033]/55 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-[#52647b] shadow-sm">
        <span className="truncate">{host}</span>
        <span className="shrink-0 text-[#407AFF]">链接</span>
      </div>
    </div>
  );
}

export function AttachmentPreviewModal({ file, onClose }: { file: CustomerAttachment; onClose: () => void }) {
  const canPreviewLink = isLinkAttachment(file);
  const canPreviewImage = isImageAttachment(file);
  const canPreviewPdf = isPdfAttachment(file);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#111827]/45 px-4 py-6">
      <button type="button" className="fixed inset-0 cursor-default" onClick={onClose} aria-label="关闭附件预览" />
      <div role="dialog" aria-modal="true" aria-label="附件预览" className="relative z-10 flex h-[86vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[12px] border border-[#e2e7ee] bg-white shadow-[0_8px_32px_rgba(17,24,39,0.15)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#e2e7ee] bg-white px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[#182230]">{file.file_name}</h3>
            <p className="mt-1 text-xs text-[#667085]">
              {file.category || "附件"}
              <span className="mx-2">·</span>
              {canPreviewLink ? "在线链接" : formatFileSize(file.file_size) || "文件"}
              {file.created_at ? <span className="mx-2">·</span> : null}
              {file.created_at ? formatDateTime(file.created_at) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={file.file_url} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
              <Eye className="h-4 w-4" />
              新窗口打开
            </a>
            {!canPreviewLink && (
              <a href={file.file_url} download className="btn-primary text-sm">
                <Download className="h-4 w-4" />
                下载
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#667085] hover:bg-[#f2f4f7] hover:text-[#182230]"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f2f4f7] p-5">
          {canPreviewImage ? (
            <NativeImage
              src={file.file_url}
              alt={file.file_name}
              className="max-h-full max-w-full rounded-[8px] bg-white object-contain"
            />
          ) : canPreviewLink ? (
            <div className="flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-[#e2e7ee] bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-[#e2e7ee] bg-[#f8fafc] px-4 py-2 text-xs text-[#667085]">
                <span>正在在线预览效果图链接</span>
                <span>如页面无法显示，说明原平台限制嵌入，可点击右上角新窗口打开</span>
              </div>
              <iframe
                src={file.file_url}
                title={file.file_name}
                className="min-h-0 flex-1 bg-white"
              />
            </div>
          ) : canPreviewPdf ? (
            <iframe
              src={file.file_url}
              title={file.file_name}
              className="h-full w-full rounded-[8px] border border-[#e2e7ee] bg-white"
            />
          ) : (
            <div className="flex w-full max-w-md flex-col items-center rounded-[12px] border border-[#e2e7ee] bg-white px-6 py-10 text-center">
              <FileText className="mb-4 h-12 w-12 text-[#98a2b3]" />
              <h4 className="text-base font-semibold text-[#182230]">该文件暂不支持系统内预览</h4>
              <p className="mt-2 text-sm leading-6 text-[#667085]">可以在新窗口打开，或下载到本地查看。</p>
              <div className="mt-5 flex items-center gap-3">
                <a href={file.file_url} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
                  新窗口打开
                </a>
                <a href={file.file_url} download className="btn-primary text-sm">
                  下载文件
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
