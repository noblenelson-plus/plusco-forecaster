// components/forecaster/editable-cell.tsx
"use client";

/**
 * Famille de cellules du grid de prévision — réutilisée par les 3 axes.
 *
 * <EditableCell/>  — saisie monétaire d'un mois :
 *   — affichage formaté (12 500) au repos, valeur brute pendant l'édition
 *   — fond jaune pâle si dirty (modifiée, non sauvegardée)
 *   — read-only (RFQ locked, ou ADMIN_INPUT pour un BL)
 *   — mode comparaison : valeur du RFQ de référence en gris dessous
 *     + variance (+2 500 / +10%) colorée
 *
 * <TotalCell/>     — total read-only (ligne, bucket, grand total) avec la
 *                    même mécanique de comparaison/variance.
 */

import { useEffect, useState } from "react";
import { computeVariance } from "../../lib/types/forecaster.types";

// ─── Formatage ────────────────────────────────────────────────────────────────

/** 12500.5 → "12 501" (arrondi à l'unité — saisie en $ entiers de fait). */
export function formatMoney(value: number): string {
  if (value === 0) return "—";
  return Math.round(value).toLocaleString("en-CA");
}

function formatSigned(value: number): string {
  const formatted = Math.round(Math.abs(value)).toLocaleString("en-CA");
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

/** "12,500.50" / "12 500,5" / "$12500" → 12500.5 ; invalide → 0. */
export function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,\-]/g, "").replace(/,/g, ".");
  // Garde uniquement le dernier "." comme séparateur décimal
  const lastDot = cleaned.lastIndexOf(".");
  const normalized =
    lastDot === -1
      ? cleaned
      : cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? 0 : num;
}

// ─── Variance badge (partagé EditableCell / TotalCell) ───────────────────────

function VarianceLine({
  current,
  reference,
}: {
  current: number;
  reference: number;
}) {
  const v = computeVariance(current, reference);

  return (
    <div className="mt-0.5 leading-tight">
      {/* Valeur de référence — gris muted */}
      <p className="text-[11px] text-gray-400 tabular-nums">
        {formatMoney(reference)}
      </p>
      {/* Variance — masquée si nulle */}
      {v.absolute !== 0 && (
        <p
          className={`text-[10px] font-medium tabular-nums ${
            v.absolute > 0 ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {formatSigned(v.absolute)}
          {v.relative !== null && (
            <span className="opacity-70">
              {" "}
              ({v.relative > 0 ? "+" : ""}
              {Math.round(v.relative)}%)
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// ─── EditableCell ─────────────────────────────────────────────────────────────

interface EditableCellProps {
  value: number;
  onChange: (value: number) => void;
  /** Valeur du RFQ de référence — null = pas de comparaison active. */
  reference: number | null;
  dirty: boolean;
  readOnly: boolean;
}

export function EditableCell({
  value,
  onChange,
  reference,
  dirty,
  readOnly,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Si la valeur change de l'extérieur (discard, rechargement), on suit
  useEffect(() => {
    if (!editing) setDraft(value === 0 ? "" : String(value));
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const parsed = parseMoney(draft);
    if (parsed !== value) onChange(parsed);
  }

  return (
    <td
      className={`px-0 py-0 border-b border-gray-100 align-top ${
        dirty ? "bg-yellow-50" : ""
      }`}
    >
      <div className="px-1 py-1">
        {readOnly ? (
          <p
            className={`w-full px-1.5 py-1 text-right text-sm tabular-nums ${
              value === 0 ? "text-gray-300" : "text-gray-700"
            }`}
          >
            {formatMoney(value)}
          </p>
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={editing ? draft : value === 0 ? "" : formatMoney(value)}
            placeholder="—"
            onFocus={(e) => {
              setEditing(true);
              setDraft(value === 0 ? "" : String(value));
              // Sélectionne tout pour remplacer d'un coup (usage Excel-like)
              requestAnimationFrame(() => e.target.select());
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(value === 0 ? "" : String(value));
                setEditing(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={`w-full px-1.5 py-1 text-right text-sm tabular-nums rounded-md border
              focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent
              focus:bg-white transition-colors
              ${dirty
                ? "border-yellow-300 bg-yellow-50 text-gray-900 font-medium"
                : "border-transparent bg-transparent text-gray-700 hover:border-gray-200 hover:bg-white"
              }
              ${value === 0 && !editing ? "placeholder:text-gray-300" : ""}
            `}
          />
        )}

        {/* Mode comparaison */}
        {reference !== null && (
          <div className="px-1.5">
            <VarianceLine current={value} reference={reference} />
          </div>
        )}
      </div>
    </td>
  );
}

// ─── TotalCell ────────────────────────────────────────────────────────────────

interface TotalCellProps {
  value: number;
  /** Total correspondant dans le RFQ de référence — null = pas de comparaison. */
  reference: number | null;
  /** "row" = total de ligne, "bucket" = sous-total, "grand" = total général. */
  emphasis?: "row" | "bucket" | "grand";
}

export function TotalCell({ value, reference, emphasis = "row" }: TotalCellProps) {
  const styles = {
    row: "text-sm font-medium text-gray-900",
    bucket: "text-sm font-semibold text-gray-900",
    grand: "text-sm font-bold text-gray-900",
  }[emphasis];

  return (
    <td className="px-2.5 py-1.5 border-b border-gray-100 text-right align-top">
      <p className={`tabular-nums ${styles} ${value === 0 ? "!text-gray-300" : ""}`}>
        {formatMoney(value)}
      </p>
      {reference !== null && (
        <VarianceLine current={value} reference={reference} />
      )}
    </td>
  );
}