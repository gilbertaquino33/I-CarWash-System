"use client";

import { BreakdownBars } from "@/components/charts/BreakdownBars";
import { ProfitChart } from "@/components/charts/ProfitChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { PageHeader } from "@/components/dashboard/ui";
import { peso, RANGE_PRESETS, type RangeKey } from "@/lib/reports";
import {
  CalendarRange,
  Car,
  Receipt,
  Table2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface SeriesPoint {
  label: string;
  fullLabel: string;
  earnings: number;
  expenses: number;
  profit: number;
  count: number;
}

export function ReportsView({
  rangeKey,
  rangeLabel,
  from,
  to,
  series,
  totals,
  breakdown,
  expenseCategories,
  loadError = false,
}: {
  rangeKey: RangeKey;
  rangeLabel: string;
  from: string;
  to: string;
  series: SeriesPoint[];
  totals: { earnings: number; expenses: number; profit: number; washes: number };
  breakdown: { label: string; value: number; count: number }[];
  expenseCategories: { label: string; value: number }[];
  loadError?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showTable, setShowTable] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [showCustom, setShowCustom] = useState(rangeKey === "custom");

  const setRange = (key: RangeKey) => {
    if (key === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", key);
    next.delete("from");
    next.delete("to");
    router.push(`/dashboard/reports?${next.toString()}`);
  };

  const applyCustom = () => {
    const next = new URLSearchParams();
    next.set("range", "custom");
    next.set("from", customFrom);
    next.set("to", customTo);
    router.push(`/dashboard/reports?${next.toString()}`);
  };

  const hasAnything = totals.earnings > 0 || totals.expenses > 0;
  const profitPositive = totals.profit >= 0;

  const best = series.reduce(
    (b, p) => (p.earnings > (b?.earnings ?? -1) ? p : b),
    series[0]
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        description="See how much your shop earned, what you spent, and your net income."
      />

      {loadError && (
        <p className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          Some numbers could not be loaded, so the totals below may be
          incomplete. This usually means your database is blocking this account
          from reading the sales tables.
        </p>
      )}

      {/* Filters — one row, above everything they scope */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {RANGE_PRESETS.map((preset) => {
          const active =
            preset.key === "custom" ? rangeKey === "custom" : rangeKey === preset.key;
          return (
            <button
              key={preset.key}
              suppressHydrationWarning
              onClick={() => setRange(preset.key)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-ink-950 text-white"
                  : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {preset.key === "custom" && <CalendarRange size={14} />}
              {preset.label}
            </button>
          );
        })}
        <span className="ml-auto text-sm text-ink-500">{rangeLabel}</span>
      </div>

      {showCustom && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-ink-100 bg-white p-4">
          <div>
            <label className="label">From</label>
            <input
              suppressHydrationWarning
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              suppressHydrationWarning
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="field"
            />
          </div>
          <button
            suppressHydrationWarning
            onClick={applyCustom}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Show it
          </button>
          <p className="text-xs text-ink-400">
            Pick the same day twice to see just that one day.
          </p>
        </div>
      )}

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Wallet size={18} />
          </span>
          <p className="mt-4 font-display text-2xl font-bold text-ink-950">
            {peso(totals.earnings)}
          </p>
          <p className="mt-1 text-sm font-medium text-ink-600">Earned</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 text-ink-600">
            <Receipt size={18} />
          </span>
          <p className="mt-4 font-display text-2xl font-bold text-ink-950">
            {peso(totals.expenses)}
          </p>
          <p className="mt-1 text-sm font-medium text-ink-600">Spent</p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            profitPositive ? "border-brand-200 bg-brand-50/50" : "border-red-200 bg-red-50/50"
          }`}
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${
              profitPositive ? "bg-brand-500" : "bg-red-600"
            }`}
          >
            {profitPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </span>
          <p className="mt-4 font-display text-2xl font-bold text-ink-950">
            {totals.profit < 0
              ? `−${peso(Math.abs(totals.profit))}`
              : peso(totals.profit)}
          </p>
          <p className="mt-1 text-sm font-medium text-ink-600">
            Net income
          </p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 text-ink-600">
            <Car size={18} />
          </span>
          <p className="mt-4 font-display text-2xl font-bold text-ink-950">
            {totals.washes}
          </p>
          <p className="mt-1 text-sm font-medium text-ink-600">Cleaned</p>
        </div>
      </div>

      {!hasAnything ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
            <Wallet size={20} />
          </span>
          <p className="mt-4 font-display text-base font-semibold text-ink-950">
            Nothing to show for {rangeLabel.toLowerCase()}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            Once your shop finishes a service or you record an expense, the numbers
            will show up here.
          </p>
        </div>
      ) : (
        <>
          {/* Earnings trend */}
          <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-ink-950">
                  Money earned over time
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  The ups and downs of your earnings for {rangeLabel.toLowerCase()}.
                </p>
              </div>
              {best && best.earnings > 0 && (
                <p className="text-xs text-ink-400">
                  Best: <span className="font-semibold text-ink-700">{best.fullLabel}</span>{" "}
                  · {peso(best.earnings)}
                </p>
              )}
            </div>

            {series.length > 1 ? (
              <div className="mt-5">
                <TrendChart
                  points={series.map((s) => ({
                    label: s.label,
                    fullLabel: s.fullLabel,
                    value: s.earnings,
                  }))}
                />
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-ink-50/70 p-4 text-sm text-ink-500">
                Pick a longer range (like Last 7 days) to see the rise and fall of
                your earnings.
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Net income per period */}
            <div className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
              <h2 className="font-display text-base font-semibold text-ink-950">
                Net income
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                What you earned minus what you spent. Above the line means you
                earned more than you spent.
              </p>
              <div className="mt-4 flex items-center gap-5 text-xs text-ink-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />
                  Earned more than spent
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-600" />
                  Spent more than earned
                </span>
              </div>
              <div className="mt-3">
                <ProfitChart
                  points={series.map((s) => ({
                    label: s.label,
                    fullLabel: s.fullLabel,
                    value: s.profit,
                  }))}
                />
              </div>
            </div>

            {/* Where earnings came from */}
            <div className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
              <h2 className="font-display text-base font-semibold text-ink-950">
                Where the money came from
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Earnings split by how the customer booked.
              </p>
              <div className="mt-6">
                <BreakdownBars rows={breakdown} />
              </div>

              {expenseCategories.length > 0 && (
                <div className="mt-8 border-t border-ink-100 pt-6">
                  <h3 className="font-display text-sm font-semibold text-ink-950">
                    What you spent on
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {expenseCategories.map((c) => (
                      <li
                        key={c.label}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="capitalize text-ink-600">{c.label}</span>
                        <span
                          className="font-semibold text-ink-950"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {peso(c.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Table view — every charted value reachable without hovering */}
          <div className="mt-5 rounded-2xl border border-ink-100 bg-white">
            <button
              suppressHydrationWarning
              onClick={() => setShowTable((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span className="flex items-center gap-2 font-display text-sm font-semibold text-ink-950">
                <Table2 size={15} className="text-ink-400" />
                See the numbers in a list
              </span>
              <span className="text-xs text-ink-400">{showTable ? "Hide" : "Show"}</span>
            </button>

            {showTable && (
              <div className="overflow-x-auto border-t border-ink-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-50/70 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 text-right font-semibold">Earned</th>
                      <th className="px-5 py-3 text-right font-semibold">Spent</th>
                      <th className="px-5 py-3 text-right font-semibold">Net income</th>
                      <th className="px-5 py-3 text-right font-semibold">Cars</th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y divide-ink-100"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {series.map((s) => (
                      <tr key={s.fullLabel}>
                        <td className="px-5 py-3 text-ink-700">{s.fullLabel}</td>
                        <td className="px-5 py-3 text-right text-ink-700">
                          {peso(s.earnings)}
                        </td>
                        <td className="px-5 py-3 text-right text-ink-700">
                          {peso(s.expenses)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-semibold ${
                            s.profit < 0 ? "text-red-600" : "text-ink-950"
                          }`}
                        >
                          {s.profit < 0
                            ? `−${peso(Math.abs(s.profit))}`
                            : peso(s.profit)}
                        </td>
                        <td className="px-5 py-3 text-right text-ink-700">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
