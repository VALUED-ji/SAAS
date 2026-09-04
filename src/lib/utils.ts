import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_UTC_OFFSET_HOURS = 8;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function toUtcSqlDateTime(date: Date) {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join("-") + " " + [
    padDatePart(date.getUTCHours()),
    padDatePart(date.getUTCMinutes()),
    padDatePart(date.getUTCSeconds()),
  ].join(":");
}

export function utcNowSql() {
  return toUtcSqlDateTime(new Date());
}

export function beijingLocalDateTimeToUtcSql(value?: string | Date | null) {
  if (value instanceof Date) return toUtcSqlDateTime(value);
  const text = String(value || "").trim();
  if (!text) return utcNowSql();
  const normalized = text.replace("T", " ");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  if (hasTimezone) {
    const parsed = parseAppDate(text);
    return parsed ? toUtcSqlDateTime(parsed) : utcNowSql();
  }
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    const parsed = parseAppDate(text);
    return parsed ? toUtcSqlDateTime(parsed) : utcNowSql();
  }
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - BEIJING_UTC_OFFSET_HOURS,
    Number(minute),
    Number(second),
  );
  return toUtcSqlDateTime(new Date(utcMs));
}

export function parseAppDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const isLocalInputValue = text.includes("T") && !hasTimezone;
  const date = new Date(hasTimezone || isDateOnly || isLocalInputValue ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(date?: string | Date | null): string {
  const d = parseAppDate(date);
  if (!d) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatDateTime(date?: string | Date | null): string {
  const d = parseAppDate(date);
  if (!d) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatMonthDay(date?: string | Date | null): string {
  const d = parseAppDate(date);
  if (!d) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function toDatetimeLocalValue(date?: string | Date | null): string {
  const d = parseAppDate(date) || new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
