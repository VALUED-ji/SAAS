"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectChangeEvent = {
  target: { value: string };
  currentTarget: { value: string };
};

type ParsedOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type MenuStyle = Pick<CSSProperties, "bottom" | "left" | "maxHeight" | "top" | "width">;

type SystemSelectProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "onKeyDown"> & {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  onKeyDown?: (event: any) => void;
  menuPlacement?: "auto" | "top" | "bottom";
  menuClassName?: string;
  optionClassName?: string;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  children: ReactNode;
};

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children);
  return "";
}

function parseOptions(children: ReactNode): ParsedOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; disabled?: boolean; label?: string; value?: string | number }>(child)) return [];
    if (child.type !== "option") return parseOptions(child.props.children);
    const label = child.props.label || nodeToText(child.props.children).trim();
    const value = child.props.value == null ? label : String(child.props.value);
    return [{ value, label, disabled: child.props.disabled }];
  });
}

function isStarRatingLabel(label: string) {
  return /^★{1,5}$/.test(label);
}

export default function SystemSelect({
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  required,
  children,
  className,
  menuClassName,
  optionClassName,
  onKeyDown,
  menuPlacement = "auto",
  tabIndex,
  ...props
}: SystemSelectProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const controlledValue = value == null ? undefined : String(value);
  const [internalValue, setInternalValue] = useState(defaultValue == null ? "" : String(defaultValue));
  const currentValue = controlledValue ?? internalValue;
  const selected = options.find((option) => option.value === currentValue) || options[0];
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuStyle>({ left: 0, top: 0, width: 180, maxHeight: 300 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const enabledOptions = options.filter((option) => !option.disabled);

  const updateMenuPosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 6;
    const viewportPadding = 12;
    const width = Math.max(rect.width, 168);
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    const belowTop = rect.bottom + gap;
    const belowSpace = window.innerHeight - belowTop - viewportPadding;
    const aboveSpace = rect.top - viewportPadding - gap;
    const preferredMaxHeight = Math.min(300, Math.max(180, window.innerHeight - viewportPadding * 2));
    const autoUseAbove = belowSpace < 180 && aboveSpace > belowSpace;
    const useAbove = menuPlacement === "top" ? true : menuPlacement === "bottom" ? false : autoUseAbove;
    const availableSpace = Math.max(120, useAbove ? aboveSpace : belowSpace);
    const maxHeight = Math.min(preferredMaxHeight, availableSpace);
    setMenuStyle(
      useAbove
        ? { bottom: window.innerHeight - rect.top + gap, left, maxHeight, top: undefined, width }
        : { bottom: undefined, left, maxHeight, top: belowTop, width },
    );
  }, [menuPlacement]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === currentValue));
    setActiveIndex(selectedIndex);

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleReposition = () => updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [currentValue, open, options, updateMenuPosition]);

  const commitValue = (nextValue: string) => {
    if (controlledValue == null) setInternalValue(nextValue);
    if (nextValue !== currentValue) {
      onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } });
    }
    setOpen(false);
  };

  const moveActive = (direction: 1 | -1) => {
    if (enabledOptions.length === 0) return;
    const currentOption = options[activeIndex];
    const enabledIndex = Math.max(0, enabledOptions.findIndex((option) => option.value === currentOption?.value));
    const nextEnabled = enabledOptions[(enabledIndex + direction + enabledOptions.length) % enabledOptions.length];
    const nextIndex = options.findIndex((option) => option.value === nextEnabled.value);
    setActiveIndex(Math.max(0, nextIndex));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveActive(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = options[activeIndex];
      if (option && !option.disabled) commitValue(option.value);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const menu = open && mounted ? createPortal(
    <div
      id={menuId}
      ref={menuRef}
      className={cn(
        "system-select-menu fixed z-[1200] overflow-hidden rounded-[10px] border border-[#dce8f8] bg-white p-1.5 shadow-[0_18px_44px_rgba(27,51,88,0.14),0_4px_14px_rgba(27,51,88,0.06)]",
        menuClassName
      )}
      style={menuStyle}
      role="listbox"
    >
      <div className="max-h-[inherit] overflow-y-auto pr-1">
        {options.map((option, index) => {
          const selectedOption = option.value === currentValue;
          const active = index === activeIndex;
          return (
            <button
              key={`${option.value}-${index}`}
              type="button"
              disabled={option.disabled}
              role="option"
              aria-selected={selectedOption}
              data-active={active ? "true" : undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => !option.disabled && commitValue(option.value)}
              className={cn(
                "flex min-h-9 w-full items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-sm font-semibold transition-colors",
                selectedOption
                  ? "bg-[#407AFF] text-white"
                  : active
                    ? "bg-[#edf4ff] text-[#162033]"
                    : "text-[#34445a] hover:bg-[#f4f8ff]",
                option.disabled && "cursor-not-allowed opacity-45",
                optionClassName
              )}
            >
              <span className={cn("min-w-0 truncate", isStarRatingLabel(option.label) && "text-[#FBCD08]")}>{option.label}</span>
              {selectedOption && <Check className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div
        ref={rootRef}
        className={cn(
          "system-select relative flex items-center",
          className || "input-field",
          focused && !disabled && "border-[#407AFF] ring-4 ring-[#407AFF]/10",
          disabled && "cursor-not-allowed opacity-60"
        )}
        tabIndex={disabled ? undefined : tabIndex ?? 0}
        role="combobox"
        aria-controls={menuId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((current) => !current)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        {...props}
      >
        <div className="flex min-h-0 w-full min-w-0 items-center justify-between gap-2 bg-transparent text-left text-inherit leading-none outline-none">
          <span className={cn("min-w-0 truncate", selected?.label && isStarRatingLabel(selected.label) && "text-[#FBCD08]")}>{selected?.label || ""}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-current opacity-55 transition-transform duration-200", open && "rotate-180")} />
        </div>
        {name && <input type="hidden" name={name} value={currentValue} required={required} />}
      </div>
      {menu}
    </>
  );
}
