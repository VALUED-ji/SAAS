"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import styles from "./SystemDateInput.module.css";

type SystemDateInputType = "date" | "datetime-local";

type SystemDateInputProps = {
  id?: string;
  name?: string;
  value: string;
  onChange?: (value: string) => void;
  type?: SystemDateInputType;
  className?: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  "aria-label"?: string;
  "data-contract-required-field"?: string;
};

type CalendarDay = {
  date: Date;
  value: string;
  day: number;
  outside: boolean;
  today: boolean;
  selected: boolean;
};

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateValue(value?: string) {
  const dateText = String(value || "").split("T")[0];
  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimeValue(value?: string) {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  return "09:00";
}

function formatDisplayValue(value: string, type: SystemDateInputType) {
  const date = parseDateValue(value);
  if (!date) return "";
  const dateText = `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`;
  if (type === "datetime-local") return `${dateText} ${getTimeValue(value)}`;
  return dateText;
}

function buildCalendarDays(monthDate: Date, selectedValue: string) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());
  const todayValue = toDateValue(new Date());
  const selectedDateValue = parseDateValue(selectedValue);
  const selectedText = selectedDateValue ? toDateValue(selectedDateValue) : "";

  return Array.from({ length: 42 }, (_, index): CalendarDay => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = toDateValue(date);
    return {
      date,
      value,
      day: date.getDate(),
      outside: date.getMonth() !== month,
      today: value === todayValue,
      selected: value === selectedText,
    };
  });
}

export default function SystemDateInput({
  id,
  name,
  value,
  onChange,
  type = "date",
  className,
  placeholder,
  title,
  disabled,
  readOnly,
  required,
  "aria-label": ariaLabel,
  "data-contract-required-field": contractRequiredField,
}: SystemDateInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [monthDate, setMonthDate] = useState(() => parseDateValue(value) || new Date());
  const [popoverStyle, setPopoverStyle] = useState({ top: 0, left: 0, width: 292 });

  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const displayValue = useMemo(() => formatDisplayValue(value, type), [type, value]);
  const calendarDays = useMemo(() => buildCalendarDays(monthDate, value), [monthDate, value]);
  const timeValue = getTimeValue(value);

  const updatePopoverPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 292;
    const viewportPadding = 12;
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );
    const estimatedHeight = type === "datetime-local" ? 412 : 366;
    const top = rect.bottom + 6 + estimatedHeight > window.innerHeight
      ? Math.max(viewportPadding, rect.top - estimatedHeight - 6)
      : rect.bottom + 6;
    setPopoverStyle({ top, left, width });
  }, [type]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMonthDate(selectedDate || new Date());
    updatePopoverPosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, selectedDate, updatePopoverPosition]);

  const commitDate = (dateValue: string) => {
    if (type === "datetime-local") {
      onChange?.(`${dateValue}T${timeValue}`);
      return;
    }
    onChange?.(dateValue);
    setOpen(false);
  };

  const commitToday = () => {
    const today = toDateValue(new Date());
    setMonthDate(new Date());
    commitDate(today);
  };

  const commitTime = (nextTime: string) => {
    const dateValue = selectedDate ? toDateValue(selectedDate) : toDateValue(monthDate);
    onChange?.(`${dateValue}T${nextTime}`);
  };

  const shiftMonth = (offset: number) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const popover = open && mounted ? createPortal(
    <div
      ref={popoverRef}
      className={styles.calendarPopover}
      style={popoverStyle}
      data-system-date-picker
      role="dialog"
      aria-label="日期选择"
    >
      <div className={styles.calendarHeader}>
        <button
          type="button"
          className={styles.calendarMonthButton}
          onClick={() => setMonthDate(new Date())}
        >
          {monthDate.getFullYear()}年{pad(monthDate.getMonth() + 1)}月
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className={styles.calendarNav}>
          <button type="button" className={styles.calendarIconButton} onClick={() => shiftMonth(-1)} aria-label="上个月">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={styles.calendarIconButton} onClick={() => shiftMonth(1)} aria-label="下个月">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={styles.calendarBody}>
        <div className={styles.weekdayGrid}>
          {weekdays.map((weekday) => (
            <div key={weekday} className={styles.weekdayCell}>{weekday}</div>
          ))}
        </div>
        <div className={styles.dateGrid}>
          {calendarDays.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                styles.dateCell,
                item.outside && styles.dateCellOutside,
                item.today && styles.dateCellToday,
                item.selected && styles.dateCellSelected,
              )}
              onClick={() => commitDate(item.value)}
            >
              {item.day}
            </button>
          ))}
        </div>
        {type === "datetime-local" && (
          <div className={styles.timeRow}>
            <span className={styles.timeLabel}>具体时间</span>
            <input
              type="time"
              value={timeValue}
              onChange={(event) => commitTime(event.target.value)}
              className={styles.timeInput}
            />
          </div>
        )}
      </div>
      <div className={styles.calendarFooter}>
        <button
          type="button"
          className={styles.calendarFooterButton}
          onClick={() => {
            onChange?.("");
            setOpen(false);
          }}
        >
          清除
        </button>
        <button type="button" className={styles.calendarFooterButton} onClick={commitToday}>
          今天
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className={styles.dateInputRoot}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        ref={buttonRef}
        id={id}
        title={title}
        type="button"
        disabled={disabled}
        className={cn(styles.dateInputButton, className, open && styles.dateInputButtonOpen)}
        aria-label={ariaLabel || placeholder || "选择日期"}
        data-contract-required-field={contractRequiredField}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled || readOnly) return;
          setOpen((current) => !current);
        }}
      >
        <span className={cn(styles.dateInputValue, !displayValue && styles.dateInputPlaceholder)}>
          {displayValue || placeholder || (type === "datetime-local" ? "选择日期和时间" : "选择日期")}
        </span>
        <CalendarDays className={styles.dateInputIcon} aria-hidden="true" />
      </button>
      {popover}
    </div>
  );
}
