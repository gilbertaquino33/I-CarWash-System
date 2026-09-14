"use client";

import { peso } from "@/lib/reports";

export interface BreakdownRow {
  label: string;
  value: number;
  count: number;
}

/**
 * Nominal categories — bar length already encodes the value, so every bar
 * wears the same brand hue instead of spending the identity channel.
 */
export function BreakdownBars({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const pct = total > 0 ? (row.value / total) * 100 : 0;
        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink-700">{row.label}</span>
              <span className="flex items-baseline gap-2">
                <span
                  className="text-sm font-semibold text-ink-950"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {peso(row.value)}
                </span>
                <span className="text-xs text-ink-400">{pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {row.count} wash{row.count === 1 ? "" : "es"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
