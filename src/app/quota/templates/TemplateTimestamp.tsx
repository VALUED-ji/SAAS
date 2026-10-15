import { formatDate, parseAppDate } from "@/lib/utils";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export default function TemplateTimestamp({ value }: { value?: string | null }) {
  const date = parseAppDate(value);
  if (!date) return <span>-</span>;

  const dateText = formatDate(date).replace(/\//g, "-");
  const timeText = /^\d{4}-\d{2}-\d{2}$/.test(value?.trim() || "") ? "" : timeFormatter.format(date);

  return (
    <span className="block whitespace-nowrap tabular-nums leading-5" title={[dateText, timeText].filter(Boolean).join(" ")}>
      <span className="block">{dateText}</span>
      {timeText && <span className="block">{timeText}</span>}
    </span>
  );
}
