"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ThinScrollAreaProps = {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  orientation?: "horizontal" | "vertical";
};

export default function ThinScrollArea({ children, className, scrollClassName, orientation = "horizontal" }: ThinScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isVertical = orientation === "vertical";
  const [scrollbar, setScrollbar] = useState({ visible: false, offset: 0, size: 100 });

  const syncScrollbar = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const scrollPosition = isVertical ? element.scrollTop : element.scrollLeft;
    const scrollSize = isVertical ? element.scrollHeight : element.scrollWidth;
    const clientSize = isVertical ? element.clientHeight : element.clientWidth;
    const visible = scrollSize > clientSize + 1;
    if (!visible) {
      setScrollbar({ visible: false, offset: 0, size: 100 });
      return;
    }

    const size = Math.max(8, (clientSize / scrollSize) * 100);
    const offset = (scrollPosition / Math.max(1, scrollSize - clientSize)) * (100 - size);
    setScrollbar({ visible: true, offset, size });
  }, [isVertical]);

  useEffect(() => {
    const element = scrollRef.current;
    syncScrollbar();
    if (!element) return;

    element.addEventListener("scroll", syncScrollbar, { passive: true });
    window.addEventListener("resize", syncScrollbar);

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncScrollbar) : null;
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);

    return () => {
      element.removeEventListener("scroll", syncScrollbar);
      window.removeEventListener("resize", syncScrollbar);
      observer?.disconnect();
    };
  }, [syncScrollbar]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    const track = event.currentTarget;
    if (!element || !scrollbar.visible) return;

    event.preventDefault();
    const rect = track.getBoundingClientRect();
    const startPointer = isVertical ? event.clientY : event.clientX;
    const startScroll = isVertical ? element.scrollTop : element.scrollLeft;
    const maxScroll = isVertical ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth;
    const trackSize = isVertical ? rect.height : rect.width;
    const thumbSizePx = (scrollbar.size / 100) * trackSize;
    const movableSize = Math.max(1, trackSize - thumbSizePx);
    const scrollPerPixel = maxScroll / movableSize;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentPointer = isVertical ? moveEvent.clientY : moveEvent.clientX;
      const delta = currentPointer - startPointer;
      const nextScroll = Math.max(0, Math.min(maxScroll, startScroll + delta * scrollPerPixel));
      if (isVertical) {
        element.scrollTop = nextScroll;
      } else {
        element.scrollLeft = nextScroll;
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className={cn(isVertical && "relative", className)}>
      <div ref={scrollRef} className={cn("thin-scroll-area max-w-full", isVertical ? "overflow-y-auto" : "overflow-x-auto", scrollClassName)}>
        {children}
      </div>
      {scrollbar.visible && isVertical && (
        <div
          className="absolute bottom-2 right-1 top-2 w-3 cursor-grab touch-none px-[5px] active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          aria-hidden="true"
        >
          <div className="relative h-full w-px rounded-full bg-surface-200">
            <div
              className="absolute left-0 w-px rounded-full bg-surface-500"
              style={{ top: `${scrollbar.offset}%`, height: `${scrollbar.size}%` }}
            />
          </div>
        </div>
      )}
      {scrollbar.visible && !isVertical && (
        <div
          className="mx-2 h-3 cursor-grab touch-none py-[5px] active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          aria-hidden="true"
        >
          <div className="relative h-px rounded-full bg-surface-200">
            <div
              className="absolute top-0 h-px rounded-full bg-surface-500"
              style={{ left: `${scrollbar.offset}%`, width: `${scrollbar.size}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
