// filepath: components/finance-toolkit/calculator-levers.tsx
"use client";

/**
 * Finance Toolkit · Targets Calculator — "Adjust the plan". What-if settings
 * on top of the data-based plan: team intensity or a fixed team size,
 * seniority (cost rates), hours per FTE, onboarding ramp, revenue timing, and
 * role-by-role mix and cost per hour. Each control shows the data value next
 * to it and resets to it.
 */

import { useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_LEVERS,
  FTE_HOURS_PER_MONTH,
  MODEL,
  RAMP_SETTINGS,
  changedLevers,
  type PlanLevers,
  type RampSetting,
  type StaffingPlan,
} from "../../lib/finance-toolkit/model";
import { Chip, Field, Segmented, selectClass, CardShell } from "./ft-ui";
import { fte, pct, rate } from "./ft-format";

/** A number field that keeps what the user is typing, and follows the value when it changes elsewhere. */
export function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  prefix,
  ariaLabel,
  className = "",
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  prefix?: string;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
}) {
  const fmt = (v: number | null) => (v === null ? "" : String(Math.round(v * 100) / 100));
  const [text, setText] = useState(fmt(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(text) !== value) setText(fmt(value));
  }
  return (
    <div className={`flex items-center border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-yellow-400 ${className}`}>
      {prefix && <span className="pl-2 text-xs text-gray-400">{prefix}</span>}
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const n = Number(raw.replace(/[^0-9.\-]/g, ""));
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
        }}
        onBlur={() => setText(fmt(value))}
        className="w-full min-w-0 bg-transparent px-2 py-1 text-right text-xs tabular-nums text-gray-900 focus:outline-none"
      />
      {suffix && <span className="pr-2 text-xs text-gray-400">{suffix}</span>}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  left,
  right,
  display,
  changed,
  onReset,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  left: string;
  right: string;
  display: string;
  changed: boolean;
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className={`text-sm font-bold tabular-nums ${changed ? "text-gray-900" : "text-gray-600"}`}>{display}</span>
          {changed && !disabled && (
            <button type="button" onClick={onReset} aria-label={`Reset ${label}`} className="text-gray-400 hover:text-gray-900">
              <RotateCcw size={13} />
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-gray-900"
        aria-label={label}
      />
      <div className="flex justify-between text-sm font-medium text-gray-600">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

export default function LeversCard({
  plan,
  levers,
  onChange,
  bare,
}: {
  plan: StaffingPlan;
  levers: PlanLevers;
  onChange: (l: PlanLevers) => void;
  /** Inside a Disclosure that already carries the title. */
  bare?: boolean;
}) {
  const [rolesOpen, setRolesOpen] = useState(false);
  const advancedChanged =
    levers.ramp !== "data" ||
    levers.fteHours !== FTE_HOURS_PER_MONTH ||
    levers.revenueTiming !== "even" ||
    Object.keys(levers.mix).length + Object.keys(levers.rates).length > 0;
  const [moreOpen, setMoreOpen] = useState(advancedChanged);
  const set = (patch: Partial<PlanLevers>) => onChange({ ...levers, ...patch });
  const changed = changedLevers(levers);
  const mixTotal = plan.roles.reduce((a, r) => a + (levers.mix[r.key] ?? r.dataShare), 0);

  return (
    <CardShell bare={bare}>
      <div className="flex items-center justify-between">
        {bare ? (
          <p className="text-xs text-gray-500">Change any setting and every figure updates. Changes are highlighted.</p>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <SlidersHorizontal size={16} className="text-primary" /> Adjust the plan
          </div>
        )}
        {changed > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_LEVERS })}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-900"
          >
            <RotateCcw size={11} /> Reset to data ({changed})
          </button>
        ) : (
          <Chip tone="dark">Data-based</Chip>
        )}
      </div>

      <Field label="Team size">
        <Segmented
          size="sm"
          ariaLabel="Team size"
          value={levers.fixedFte === null ? "scale" : "fixed"}
          onChange={(v) =>
            set({
              fixedFte: v === "fixed" ? Math.round(plan.runRateFte * 10) / 10 : null,
            })
          }
          options={[
            {
              id: "scale",
              label: "Scales with revenue",
              hint: "Team = revenue × hours per $ of the comparables",
            },
            {
              id: "fixed",
              label: "Fixed team",
              hint: "Hold the team at a size you choose",
            },
          ]}
        />
        {levers.fixedFte !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            <NumInput
              ariaLabel="Fixed team size in FTE"
              value={levers.fixedFte}
              min={0}
              max={500}
              step={0.5}
              suffix="FTE"
              className="w-28"
              onChange={(v) => set({ fixedFte: v ?? 0 })}
            />
            <span className="text-[11px] text-gray-500">at run rate</span>
          </div>
        )}
      </Field>

      <SliderRow
        label="Team size vs similar accounts"
        value={levers.hoursAdj}
        min={0.5}
        max={1.5}
        step={0.01}
        onChange={(v) => set({ hoursAdj: Math.round(v * 100) / 100 })}
        left="Leaner"
        right="Richer"
        display={`${pct(levers.hoursAdj, 0)} · ${(plan.dataHoursPerDollar * levers.hoursAdj * 1000).toFixed(1)} h per $1,000`}
        changed={levers.hoursAdj !== 1}
        onReset={() => set({ hoursAdj: 1 })}
        disabled={levers.fixedFte !== null}
      />

      <SliderRow
        label="Seniority (cost rates)"
        value={levers.rateAdj}
        min={0.7}
        max={1.3}
        step={0.01}
        onChange={(v) => set({ rateAdj: Math.round(v * 100) / 100 })}
        left="More junior"
        right="More senior"
        display={`${pct(levers.rateAdj, 0)} of data rates`}
        changed={levers.rateAdj !== 1}
        onReset={() => set({ rateAdj: 1 })}
      />

      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs font-semibold text-gray-600 hover:text-gray-900"
      >
        <span>
          More settings
          <span className="ml-1 font-normal text-gray-400">ramp-up, hours per person, revenue timing, roles</span>
          {advancedChanged && <span className="ml-1.5 bg-yellow-400 px-1 text-[10px] text-gray-900">changed</span>}
        </span>
        <ChevronDown size={14} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
      </button>

      {moreOpen && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Onboarding ramp" hint="How fast the team builds up. As observed = how real new clients were staffed in their first months.">
              <select
                aria-label="Onboarding ramp"
                className={`${selectClass} text-xs`}
                value={levers.ramp}
                onChange={(e) => set({ ramp: e.target.value as RampSetting })}
              >
                {RAMP_SETTINGS.map((r) => (
                  <option key={r.id} value={r.id} title={r.hint}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hours per FTE / month" hint="Client hours one full-time person works in a month. 140 matches what our people actually log.">
              <NumInput
                ariaLabel="Client hours per FTE per month"
                value={levers.fteHours}
                min={60}
                max={200}
                suffix="h"
                onChange={(v) => v !== null && v >= 60 && set({ fteHours: v })}
              />
            </Field>
          </div>
          <p className="-mt-2 text-[10px] leading-snug text-gray-400">
            Data: {FTE_HOURS_PER_MONTH} h per FTE (median full month {MODEL.source.fteMedianClientHours} h).
          </p>

          <Field
            label="Year-1 revenue timing"
            hint="Even = the full monthly revenue from month 1. Ramps with the team = revenue builds up the way the team does (more conservative)."
          >
            <Segmented
              size="sm"
              ariaLabel="Revenue timing"
              value={levers.revenueTiming}
              onChange={(v) => set({ revenueTiming: v })}
              options={[
                { id: "even", label: "Even from month 1" },
                {
                  id: "ramp",
                  label: "Ramps with the team",
                  hint: "Revenue follows the onboarding ramp in year 1",
                },
              ]}
            />
          </Field>

          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setRolesOpen((o) => !o)}
              aria-expanded={rolesOpen}
              className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900"
            >
              <span>
                Role mix &amp; cost per hour
                {Object.keys(levers.mix).length + Object.keys(levers.rates).length > 0 && (
                  <span className="ml-1.5 normal-case tracking-normal text-gray-900">
                    · {Object.keys(levers.mix).length + Object.keys(levers.rates).length} changed
                  </span>
                )}
              </span>
              <ChevronDown size={14} className={`transition-transform ${rolesOpen ? "rotate-180" : ""}`} />
            </button>
            {rolesOpen && (
              <div className="mt-2 space-y-1.5">
                <div className="grid grid-cols-[1fr_64px_76px_14px] gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                  <span>Role</span>
                  <span className="text-right">Mix</span>
                  <span className="text-right">Cost / h</span>
                  <span />
                </div>
                {plan.roles.map((r) => {
                  const rowChanged = levers.mix[r.key] !== undefined || levers.rates[r.key] !== undefined;
                  return (
                    <div key={r.key} className="grid grid-cols-[1fr_64px_76px_14px] items-center gap-1.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-gray-800" title={r.members?.join(", ") ?? r.label}>
                          {r.label}
                        </div>
                        <div className="text-[10px] tabular-nums text-gray-400">
                          data {pct(r.dataShare, 0)} · {rate(r.dataRate)} · now {fte(r.runRateFte)} FTE
                        </div>
                      </div>
                      <NumInput
                        ariaLabel={`${r.label} mix`}
                        value={Math.round((levers.mix[r.key] ?? r.dataShare) * 1000) / 10}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(v) => {
                          const mix = { ...levers.mix };
                          if (v === null) delete mix[r.key];
                          else mix[r.key] = v / 100;
                          set({ mix });
                        }}
                      />
                      <NumInput
                        ariaLabel={`${r.label} cost per hour`}
                        value={levers.rates[r.key] ?? null}
                        placeholder={String(Math.round(r.dataRate * levers.rateAdj))}
                        min={0}
                        max={1000}
                        prefix="$"
                        onChange={(v) => {
                          const rates = { ...levers.rates };
                          if (v === null) delete rates[r.key];
                          else rates[r.key] = v;
                          set({ rates });
                        }}
                      />
                      {rowChanged ? (
                        <button
                          type="button"
                          aria-label={`Reset ${r.label}`}
                          className="text-gray-400 hover:text-gray-900"
                          onClick={() => {
                            const mix = { ...levers.mix };
                            const rates = { ...levers.rates };
                            delete mix[r.key];
                            delete rates[r.key];
                            set({ mix, rates });
                          }}
                        >
                          <RotateCcw size={11} />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
                {Math.abs(mixTotal - 1) > 0.005 && (
                  <p className="text-[10px] text-gray-500">Mix entered totals {pct(mixTotal, 0)}; the plan scales it to 100%.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </CardShell>
  );
}
