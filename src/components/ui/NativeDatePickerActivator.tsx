"use client";

import { useEffect } from "react";

const pickerInputSelector = [
  'input[type="date"]',
  'input[type="datetime-local"]',
  'input[type="time"]',
  'input[type="month"]',
  'input[type="week"]',
].join(",");

function openNativePicker(input: HTMLInputElement) {
  if (input.disabled || input.readOnly) return;
  input.focus({ preventScroll: true });
  try {
    input.showPicker?.();
  } catch {
    // Some browsers only allow showPicker during specific user gestures.
  }
}

export default function NativeDatePickerActivator() {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const input = target.closest<HTMLInputElement>(pickerInputSelector);
      if (!input) return;
      openNativePicker(input);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const input = target.closest<HTMLInputElement>(pickerInputSelector);
      if (!input) return;
      openNativePicker(input);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
