"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import costStyles from "./site-costs.module.css";

type CostCategoryRow = {
  key: string;
  name: string;
  value: number;
  color: string;
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row || row.key === "empty") return null;
  return (
    <div className={costStyles.categoryTooltip}>
      <span><i style={{ backgroundColor: row.color }} />{row.name}</span>
      <strong>{formatAmount(Number(row.value || 0))}</strong>
    </div>
  );
}

function ActiveDonutSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
  const sliceColor = fill || payload?.color;

  return (
    <g className={costStyles.categoryActiveSlice}>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 3}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={sliceColor}
        cornerRadius={6}
        stroke="#ffffff"
        strokeWidth={3}
        opacity={0.92}
      />
    </g>
  );
}

export default function CostCategoryDonut({ rows, total }: { rows: CostCategoryRow[]; total: number }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const pieRows = total > 0
    ? rows.filter((row) => row.value > 0)
    : [{ key: "empty", name: "暂无成本", value: 1, color: "#e3e9f0" }];
  const clearActiveIndex = () => setActiveIndex(null);

  return (
    <div
      className={costStyles.categoryDonutFigure}
      role="img"
      aria-label={`预算成本构成合计 ${formatAmount(total)}`}
      onMouseLeave={clearActiveIndex}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart onMouseLeave={clearActiveIndex}>
          <Pie
            data={pieRows}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="64%"
            outerRadius="88%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={pieRows.length > 1 ? 2 : 0}
            cornerRadius={pieRows.length > 1 ? 4 : 0}
            stroke="#ffffff"
            strokeWidth={3}
            isAnimationActive={false}
            activeIndex={activeIndex ?? undefined}
            activeShape={ActiveDonutSlice}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={clearActiveIndex}
          >
            {pieRows.map((row) => <Cell key={row.key} fill={row.color} />)}
          </Pie>
          {total > 0 && activeIndex !== null && (
            <Tooltip
              active
              content={<ChartTooltip />}
              cursor={false}
              position={{ x: 8, y: 8 }}
              wrapperStyle={{ pointerEvents: "none", zIndex: 4 }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className={costStyles.categoryDonutCenter}>
        <span>预算成本合计</span>
        <strong>{formatAmount(total)}</strong>
      </div>
    </div>
  );
}
