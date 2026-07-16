// components/forecaster/row-actions-menu.tsx
"use client";

/**
 * Per-row action menu — a small always-visible kebab (⋮) that opens a dropdown
 * of row actions (Distribute / Note / Remove…). Replaces the old hover-overlay
 * icons that painted over the row label.
 *
 * The panel is portalled to <body> in fixed position so it escapes both the
 * grid's scroll-container clipping (overflow) and the stacking contexts created
 * by the sticky first-column cells — same trick as CommissionTooltip.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Destructive action — rendered in red. */
  danger?: boolean;
}

export default function RowActionsMenu({
  actions,
  ariaLabel = "Row actions",
  inverse = false,
}: {
  actions: RowAction[];
  ariaLabel?: string;
  /** Trigger rendered on a dark row — light icon colors (the panel is unchanged). */
  inverse?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = anchor !== null;

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        // Stop mousedown from reaching the document click-outside handler, which
        // would close-then-reopen the menu on the same toggle click.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(open ? null : btnRef.current?.getBoundingClientRect() ?? null);
        }}
        className={`p-0.5 rounded transition-colors flex-shrink-0 ${
          open
            ? inverse
              ? "text-white bg-gray-700"
              : "text-gray-700 bg-gray-200"
            : inverse
            ? "text-gray-300 hover:text-white hover:bg-gray-700"
            : "text-gray-300 hover:text-gray-600 hover:bg-gray-100"
        }`}
      >
        <MoreVertical size={14} />
      </button>
      {open && anchor && (
        <MenuPanel anchor={anchor} actions={actions} onClose={() => setAnchor(null)} />
      )}
    </>
  );
}

function MenuPanel({
  anchor,
  actions,
  onClose,
}: {
  anchor: DOMRect;
  actions: RowAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    // The anchor rect is captured once, so any scroll/resize invalidates it —
    // close rather than render a detached menu. Capture phase catches the
    // grid's internal scroll container too.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const WIDTH = 184;
  // Align the menu's right edge to the button, clamped to the viewport.
  const left = Math.max(
    8,
    Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - 8)
  );
  const estHeight = actions.length * 34 + 8;
  const below = anchor.bottom + 4;
  const placeAbove = below + estHeight > window.innerHeight && anchor.top > estHeight;
  const style: React.CSSProperties = {
    position: "fixed",
    left,
    width: WIDTH,
    zIndex: 50,
    ...(placeAbove ? { bottom: window.innerHeight - anchor.top + 4 } : { top: below }),
  };

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
    >
      {actions.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            a.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
            a.danger ? "text-red-600 hover:bg-gray-100" : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          <span className={`flex-shrink-0 ${a.danger ? "text-red-500" : "text-gray-400"}`}>
            {a.icon}
          </span>
          {a.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
