"use client";

import { PageHeader } from "@/components/dashboard/ui";
import { peso } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Droplets,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ScheduleRow {
  id: number;
  customer_name: string | null;
  vehicle_type: string | null;
  service_type: string | null;
  status: string | null;
  payment_status: string | null;
  price: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_at: string | null;
  arrived_at: string | null;
  is_late: boolean | null;
}

type Urgency = "washing" | "late" | "now" | "soon" | "later" | "done";

const URGENCY: Record<
  Urgency,
  { label: string; card: string; chip: string; dot: string; order: number }
> = {
  washing: {
    label: "Washing now",
    card: "border-brand-300 bg-brand-50/60",
    chip: "bg-brand-500 text-white",
    dot: "bg-brand-500",
    order: 0,
  },
  late: {
    label: "Late",
    card: "border-red-300 bg-red-50/60",
    chip: "bg-red-600 text-white",
    dot: "bg-red-600",
    order: 1,
  },
  now: {
    label: "Up next",
    card: "border-emerald-300 bg-emerald-50/60",
    chip: "bg-emerald-600 text-white",
    dot: "bg-emerald-600",
    order: 2,
  },
  soon: {
    label: "Coming soon",
    card: "border-amber-300 bg-amber-50/50",
    chip: "bg-amber-500 text-white",
    dot: "bg-amber-500",
    order: 3,
  },
  later: {
    label: "Later today",
    card: "border-ink-100 bg-white",
    chip: "bg-ink-100 text-ink-700",
    dot: "bg-ink-300",
    order: 4,
  },
  done: {
    label: "Done",
    card: "border-ink-100 bg-ink-50/60",
    chip: "bg-ink-200 text-ink-600",
    dot: "bg-ink-300",
    order: 5,
  },
};

/** Turns "2:30 PM" / "14:30" into minutes since midnight. */
function parseTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const text = value.trim().toUpperCase();
  const m = text.match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?/);
  if (!m) return null;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  const period = m[3];
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function minutesUntil(row: ScheduleRow, now: Date): number | null {
  if (row.scheduled_at) {
    const at = new Date(row.scheduled_at).getTime();
    if (!Number.isNaN(at)) return Math.round((at - now.getTime()) / 60000);
  }
  const mins = parseTimeToMinutes(row.scheduled_time);
  if (mins == null) return null;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return mins - nowMins;
}

function classify(row: ScheduleRow, now: Date): { urgency: Urgency; delta: number | null } {
  const delta = minutesUntil(row, now);
  const status = (row.status ?? "").toLowerCase();

  if (status === "completed") return { urgency: "done", delta };
  if (status === "washing") return { urgency: "washing", delta };
  if (row.is_late || (delta != null && delta < -10)) return { urgency: "late", delta };
  if (delta != null && delta <= 30) return { urgency: "now", delta };
  if (delta != null && delta <= 120) return { urgency: "soon", delta };
  return { urgency: "later", delta };
}

function countdownText(delta: number | null, urgency: Urgency): string {
  if (urgency === "washing") return "In the bay now";
  if (urgency === "done") return "Finished";
  if (delta == null) return "No time set";
  if (delta < 0) {
    const late = Math.abs(delta);
    return late >= 60
      ? `${Math.floor(late / 60)}h ${late % 60}m late`
      : `${late} min late`;
  }
  if (delta === 0) return "Starting now";
  if (delta < 60) return `In ${delta} min`;
  return `In ${Math.floor(delta / 60)}h ${delta % 60}m`;
}

export function ScheduleMonitor({
  initialRows,
  shopName,
  todayIso,
  shopId,
}: {
  initialRows: ScheduleRow[];
  shopName: string;
  todayIso: string;
  shopId: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [now, setNow] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Clock starts on the client only — rendering a live time during SSR would
  // produce a hydration mismatch.
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("reservation")
      .select(
        "id, customer_name, vehicle_type, service_type, status, payment_status, price, scheduled_date, scheduled_time, scheduled_at, arrived_at, is_late"
      )
      .eq("shop_id", shopId)
      .eq("scheduled_date", todayIso)
      .order("scheduled_time", { ascending: true });

    if (!error && data) {
      setRows(
        (data as ScheduleRow[]).filter(
          (r) => r.status !== "Voided" && r.status !== "Cancelled"
        )
      );
      setLastSync(new Date());
    }
    setRefreshing(false);
  }, [shopId, todayIso]);

  // Keep the board fresh without anyone touching it.
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const sorted = useMemo(() => {
    const reference = now ?? new Date();
    return rows
      .map((row) => ({ row, ...classify(row, reference) }))
      .sort((a, b) => {
        const byUrgency = URGENCY[a.urgency].order - URGENCY[b.urgency].order;
        if (byUrgency !== 0) return byUrgency;
        return (a.delta ?? 99999) - (b.delta ?? 99999);
      });
  }, [rows, now]);

  const counts = useMemo(() => {
    const c = { washing: 0, late: 0, now: 0, soon: 0, later: 0, done: 0 };
    sorted.forEach((s) => (c[s.urgency] += 1));
    return c;
  }, [sorted]);

  const waiting = counts.washing + counts.late + counts.now + counts.soon + counts.later;

  return (
    <div>
      <PageHeader
        title="Today's Schedule"
        description={`Cars booked at ${shopName} today. This board updates by itself.`}
        action={
          <button
            suppressHydrationWarning
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {/* Summary strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: "washing", label: "Washing now", value: counts.washing, icon: Droplets },
          { key: "now", label: "Up next", value: counts.now, icon: Clock },
          { key: "late", label: "Late", value: counts.late, icon: TriangleAlert },
          { key: "done", label: "Finished", value: counts.done, icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.key} className="rounded-2xl border border-ink-100 bg-white p-4">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${URGENCY[s.key as Urgency].dot}`}
              />
              <s.icon size={14} className="text-ink-400" />
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-ink-950">{s.value}</p>
            <p className="text-xs text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Legend — colour is never the only channel; each card is labelled too */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-xs text-ink-500">
        {(["washing", "now", "soon", "later", "late", "done"] as Urgency[]).map((u) => (
          <span key={u} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${URGENCY[u].dot}`} />
            {URGENCY[u].label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-ink-400">
          <RefreshCw size={11} />
          {lastSync
            ? `Updated ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Updates every minute"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
            <CalendarClock size={20} />
          </span>
          <p className="mt-4 font-display text-base font-semibold text-ink-950">
            No Reservations Today

          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              Reservations made for today will appear here.          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-500">
            <span className="font-semibold text-ink-950">{waiting}</span> car
            {waiting === 1 ? "" : "s"} still to wash today
          </p>

          <ul className="mt-3 space-y-3">
            {sorted.map(({ row, urgency, delta }) => {
              const tone = URGENCY[urgency];
              const isDone = urgency === "done";
              return (
                <li
                  key={row.id}
                  className={`rounded-2xl border p-5 transition ${tone.card}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      {/* Time block — the thing staff scan for */}
                      <div className="shrink-0 text-center">
                        <p
                          className={`font-display text-xl font-bold ${
                            isDone ? "text-ink-400" : "text-ink-950"
                          }`}
                        >
                          {row.scheduled_time || "—"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-400">
                          {countdownText(delta, urgency)}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p
                          className={`font-display text-base font-semibold ${
                            isDone ? "text-ink-500" : "text-ink-950"
                          }`}
                        >
                          {row.customer_name || "Walk-in customer"}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-ink-500">
                          {[row.vehicle_type, row.service_type]
                            .filter(Boolean)
                            .join(" · ") || "No details"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${tone.chip}`}
                      >
                        {tone.label}
                      </span>
                      <span className="text-sm font-semibold text-ink-900">
                        {peso(row.price ?? 0)}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          (row.payment_status ?? "").toUpperCase() === "PAID"
                            ? "text-emerald-700"
                            : "text-ink-400"
                        }`}
                      >
                        {(row.payment_status ?? "").toUpperCase() === "PAID"
                          ? "Already paid"
                          : "Not yet paid"}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
