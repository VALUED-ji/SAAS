"use client";

import { useEffect } from "react";

type SavedBodyScrollState = {
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyOverscrollBehavior: string;
};

let lockCount = 0;
let savedState: SavedBodyScrollState | null = null;

function lockBodyScroll() {
  if (typeof window === "undefined") return;
  lockCount += 1;
  if (lockCount > 1) return;

  const { body, documentElement } = document;
  savedState = {
    scrollY: window.scrollY,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    htmlOverflow: documentElement.style.overflow,
    htmlOverscrollBehavior: documentElement.style.overscrollBehavior,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
  };

  documentElement.style.overflow = "hidden";
  documentElement.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.top = `-${savedState.scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function unlockBodyScroll() {
  if (typeof window === "undefined" || lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount > 0 || !savedState) return;

  const { body, documentElement } = document;
  const scrollY = savedState.scrollY;
  documentElement.style.overflow = savedState.htmlOverflow;
  documentElement.style.overscrollBehavior = savedState.htmlOverscrollBehavior;
  body.style.overflow = savedState.bodyOverflow;
  body.style.overscrollBehavior = savedState.bodyOverscrollBehavior;
  body.style.position = savedState.bodyPosition;
  body.style.top = savedState.bodyTop;
  body.style.left = savedState.bodyLeft;
  body.style.right = savedState.bodyRight;
  body.style.width = savedState.bodyWidth;
  savedState = null;
  window.scrollTo(0, scrollY);
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);
}
