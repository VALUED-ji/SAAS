"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type DragEvent, type MutableRefObject } from "react";
import { GripVertical } from "lucide-react";

type DropPosition = "before" | "after";
type Reorder = (source: string, target: string, position: DropPosition) => void;
const SpaceOrderContext = createContext<{ source: MutableRefObject<string | null>; onReorder?: Reorder } | null>(null);

export function PackageSpaceOrderProvider({ children, onReorder }: { children: ReactNode; onReorder?: Reorder }) {
  const source = useRef<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const pending = useRef<{ source: string; positions: Map<string, number> } | null>(null);
  const animations = useRef<Animation[]>([]);
  const getRowKey = (row: HTMLElement) => row.dataset.spaceOrder != null
    ? `space:${row.dataset.spaceOrder}`
    : `item:${row.dataset.itemKey}`;

  const reorder: Reorder = (from, to, position) => {
    if (!onReorder || from === to) return;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    const rows = root.current?.querySelectorAll<HTMLElement>("tr[data-space-order], tr[data-item-key]");
    pending.current = {
      source: from,
      positions: new Map(Array.from(rows || [], (row) => [getRowKey(row), row.getBoundingClientRect().top])),
    };
    onReorder(from, to, position);
  };

  useLayoutEffect(() => {
    const snapshot = pending.current;
    if (!snapshot || !root.current) return;
    pending.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = root.current.querySelectorAll<HTMLElement>("tr[data-space-order], tr[data-item-key]");
    let space = "";
    rows.forEach((row) => {
      if (row.dataset.spaceOrder != null) space = row.dataset.spaceOrder;
      const oldTop = snapshot.positions.get(getRowKey(row));
      const rect = row.getBoundingClientRect();
      const scale = row.offsetHeight > 0 ? rect.height / row.offsetHeight : 1;
      const distance = oldTop == null ? 0 : (oldTop - rect.top) / (scale || 1);
      if (Math.abs(distance) > 1) {
        animations.current.push(row.animate([
          { transform: `translateY(${distance}px)` },
          { transform: "translateY(0)" },
        ], { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }));
      }
      if (space === snapshot.source) {
        row.querySelectorAll<HTMLElement>("td").forEach((cell) => {
          const background = window.getComputedStyle(cell).backgroundColor;
          animations.current.push(cell.animate([
            { backgroundColor: "#e8f0ff" },
            { backgroundColor: "#e8f0ff", offset: 0.3 },
            { backgroundColor: background },
          ], { duration: 700, easing: "ease-out" }));
        });
      }
    });
  });

  useEffect(() => () => {
    animations.current.forEach((animation) => animation.cancel());
  }, []);

  return <SpaceOrderContext.Provider value={{ source, onReorder: onReorder ? reorder : undefined }}>
    <div ref={root} className="contents">{children}</div>
  </SpaceOrderContext.Provider>;
}

export function PackageSpaceOrderRow({ space, columns }: { space: string; columns: number }) {
  const context = useContext(SpaceOrderContext);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const enabled = !!context?.onReorder;
  const getPosition = (event: DragEvent<HTMLTableRowElement>): DropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  return (
    <tr
      className="quote-package-group-row"
      data-space-order={space}
      onDragOver={(event) => {
        if (!enabled || !context?.source.current || context.source.current === space) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropPosition(getPosition(event));
      }}
      onDragLeave={() => setDropPosition(null)}
      onDrop={(event) => {
        const source = context?.source.current;
        setDropPosition(null);
        if (!enabled || !source) return;
        event.preventDefault();
        event.stopPropagation();
        context.source.current = null;
        context.onReorder?.(source, space, getPosition(event));
      }}
    >
      <td colSpan={columns} style={dropPosition ? { boxShadow: `inset 0 ${dropPosition === "before" ? "2" : "-2"}px 0 #407aff` } : undefined}>
        <div className="flex items-center gap-2">
          {enabled && <button
            type="button"
            draggable
            title="拖动调整空间顺序"
            aria-label={`拖动调整${space}顺序`}
            className="inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-surface-400 hover:text-surface-600 active:cursor-grabbing"
            onDragStart={(event) => {
              event.stopPropagation();
              context.source.current = space;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", space);
            }}
            onDragEnd={() => {
              context.source.current = null;
              setDropPosition(null);
            }}
          ><GripVertical className="h-3.5 w-3.5" /></button>}
          <strong>{space}</strong>
        </div>
      </td>
    </tr>
  );
}
