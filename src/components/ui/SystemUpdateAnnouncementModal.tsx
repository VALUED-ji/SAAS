"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronRight, Megaphone, Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

type SystemUpdateAnnouncement = {
  id: string;
  version: string;
  title: string;
  summary: string;
  details?: string[];
  sections?: Array<{
    module: string;
    items: string[];
  }>;
  publishedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function SystemUpdateAnnouncementModal() {
  const { user, loading } = useAuth();
  const [announcement, setAnnouncement] = useState<SystemUpdateAnnouncement | null>(null);
  const [pending, setPending] = useState(false);
  const [dismissedInSession, setDismissedInSession] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    fetch("/api/system-updates/latest", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : { announcement: null }))
      .then((data) => {
        if (cancelled) return;
        const nextAnnouncement = data?.announcement || null;
        if (!nextAnnouncement || dismissedInSession === nextAnnouncement.id) return;
        setAnnouncement(nextAnnouncement);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dismissedInSession, loading, user]);

  useEffect(() => {
    if (!announcement) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setDismissedInSession(announcement.id);
        setAnnouncement(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => confirmButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [announcement, pending]);

  if (!announcement || typeof document === "undefined") return null;

  const publishedDate = formatDate(announcement.publishedAt);
  const sections = announcement.sections?.length
    ? announcement.sections.filter((section) => section.items.length)
    : announcement.details?.length
      ? [{ module: "系统更新", items: announcement.details }]
      : [{ module: "系统更新", items: ["系统已完成更新，建议刷新后继续使用。"] }];
  const updateCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  const markRead = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/system-updates/latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ announcementId: announcement.id }),
      });
      setAnnouncement(null);
    } finally {
      setPending(false);
    }
  };

  const closeTemporarily = () => {
    if (pending) return;
    setDismissedInSession(announcement.id);
    setAnnouncement(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#101828]/42 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeTemporarily();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-[680px] overflow-hidden rounded-[14px] border border-[#d9e2ee] bg-white shadow-[0_26px_70px_rgba(15,23,42,0.22)]"
      >
        <div className="relative overflow-hidden border-b border-[#e8edf5] bg-[#fbfcff]">
          <div className="absolute right-0 top-0 h-28 w-44 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_62%)]" />
          <div className="relative flex items-start gap-5 px-7 pb-6 pt-7">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-[#dbeafe] bg-white text-[#2563eb] shadow-[0_12px_26px_rgba(37,99,235,0.12)]">
              <Megaphone className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold text-[#2563eb]">
                  <Sparkles className="h-3.5 w-3.5" />
                  更新公告
                </span>
                {announcement.version ? (
                  <span className="rounded-full border border-[#e4eaf2] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#667085]">
                    {announcement.version}
                  </span>
                ) : null}
                {publishedDate ? (
                  <span className="text-[12px] text-[#98a2b3]">{publishedDate}</span>
                ) : null}
              </div>
              <h2 id={titleId} className="text-[21px] font-semibold leading-7 text-[#111827]">
                {announcement.title || "系统更新"}
              </h2>
              <p id={descriptionId} className="mt-2 max-w-[520px] text-[13px] leading-6 text-[#667085]">
                {announcement.summary || "本次更新已完成，以下内容可能会影响您的日常使用。"}
              </p>
            </div>
            <button
              type="button"
              onClick={closeTemporarily}
              disabled={pending}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#7c8aa0] transition-colors hover:bg-white hover:text-[#182230] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6feb]/40 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="关闭系统更新弹窗"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="bg-white px-7 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-[#182230]">本次更新内容</p>
              <p className="mt-1 text-[12px] text-[#98a2b3]">请留意以下变化，便于团队继续使用系统。</p>
            </div>
            <div className="hidden rounded-full border border-[#edf1f6] bg-[#fbfcfe] px-3 py-1.5 text-[12px] font-semibold text-[#667085] sm:block">
              共 {updateCount} 项
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {sections.map((section, sectionIndex) => (
              <section key={`${section.module}-${sectionIndex}`} className="overflow-hidden rounded-[12px] border border-[#e8edf5] bg-white">
                <div className="flex items-center justify-between gap-4 border-b border-[#edf1f6] bg-[#fbfcfe] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563eb]" />
                    <h3 className="truncate text-[13px] font-semibold text-[#182230]">{section.module}</h3>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#e4eaf2] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#667085]">
                    {section.items.length} 项
                  </span>
                </div>
                {section.items.map((item, index) => (
                  <div
                    key={`${section.module}-${item}-${index}`}
                    className="group flex items-center gap-3 border-b border-[#edf1f6] bg-white px-4 py-3.5 last:border-b-0 hover:bg-[#fbfcfe]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#039855]">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <span className="w-4 shrink-0 text-right text-[12px] font-semibold text-[#98a2b3]">{index + 1}</span>
                    <p className="min-w-0 flex-1 text-[13px] leading-5 text-[#344054]">{item}</p>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#c5cfdd] transition-colors group-hover:text-[#98a2b3]" />
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#edf1f6] bg-[#fbfcff] px-7 py-4">
          <p className="text-[12px] leading-5 text-[#98a2b3]">确认后，本次更新提醒不会再次弹出。</p>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={markRead}
            disabled={pending}
            className="inline-flex h-10 min-w-[108px] items-center justify-center rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]/35 disabled:cursor-wait disabled:opacity-65"
          >
            {pending ? "处理中" : "我知道了"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
