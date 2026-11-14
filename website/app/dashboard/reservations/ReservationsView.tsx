"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, Droplets, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/ui";
import { peso } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export const RESERVATION_COLUMNS =
  "id, customer_name, vehicle_type, service_type, status, payment_status, price, reservation_date, scheduled_time, arrived_at, created_at";

const phToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export interface ReservationRow {
  id: number;
  customer_name: string | null;
  vehicle_type: string | null;
  service_type: string | null;
  status: string | null;
  payment_status: string | null;
  price: number | null;
  reservation_date: string | null;
  scheduled_time: string | null;
  arrived_at: string | null;
  created_at: string;
  manual_mode?: boolean;
}

// The database stores a cancelled reservation as "Voided" (older rows say
// "Cancelled"). Staff only ever see the word "Cancelled".
const FILTERS = ["All", "Waiting", "Washing", "Completed", "Cancelled"] as const;
type Filter = (typeof FILTERS)[number];

const statusStyle: Record<string, string> = {
  Waiting: "bg-amber-50 text-amber-700",
  Washing: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-red-50 text-red-700",
};

const isCancelled = (status: string | null) => status === "Voided" || status === "Cancelled";

function statusIcon(status: string | null) {
  if (status === "Completed") return CheckCircle2;
  if (status === "Washing") return Droplets;
  if (isCancelled(status)) return XCircle;
  return Clock3;
}

function timeToMinutes(value: string | null) {
  if (!value) return null;
  const match = value.trim().toUpperCase().match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3] === "PM" && hours < 12) hours += 12;
  if (match[3] === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function ReservationsView({
  initialRows,
  shopId,
  shopName,
  today: initialToday,
}: {
  initialRows: ReservationRow[];
  shopId: number;
  shopName: string;
  today: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [today, setToday] = useState(initialToday);
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [rowsByDate, setRowsByDate] = useState<Record<string, ReservationRow[]>>({ [initialToday]: initialRows });
  const [loadingDate, setLoadingDate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // After midnight, move to the new day -- but only if staff were looking at
  // "today". A history date they picked stays put.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = phToday();
      if (now === today) return;
      setToday(now);
      setSelectedDate((d) => (d === today ? now : d));
    }, 30_000);
    return () => clearInterval(interval);
  }, [today]);

  // Fetch a day the first time it is picked.
  useEffect(() => {
    if (!selectedDate || rowsByDate[selectedDate]) return;
    let cancelled = false;
    setLoadingDate(true);
    setLoadError(null);
    (async () => {
      const supabase = createClient();
      const run = (columns: string) =>
        supabase
          .from("reservation")
          .select(columns)
          .eq("shop_id", shopId)
          .eq("reservation_date", selectedDate)
          .order("scheduled_time", { ascending: true });
      let res = await run(`${RESERVATION_COLUMNS}, manual_mode`);
      if (res.error?.code === "42703") res = await run(RESERVATION_COLUMNS);
      if (cancelled) return;
      setLoadingDate(false);
      if (res.error) {
        setLoadError("Couldn’t load that day. Please try again.");
        return;
      }
      setRowsByDate((m) => ({ ...m, [selectedDate]: (res.data ?? []) as unknown as ReservationRow[] }));
    })();
    return () => {
      cancelled = true;
    };
  }, [rowsByDate, selectedDate, shopId]);

  const dayRows = useMemo(() => rowsByDate[selectedDate] ?? [], [rowsByDate, selectedDate]);

  const matchesFilter = (row: ReservationRow, status: Filter) => {
    const from = fromTime ? timeToMinutes(fromTime) : null;
    const to = toTime ? timeToMinutes(toTime) : null;
    const rowDate = row.reservation_date?.slice(0, 10);
    if (rowDate !== selectedDate) return false;
    if (status === "Cancelled" ? !isCancelled(row.status) : status !== "All" && row.status !== status) return false;
    const rowTime = timeToMinutes(row.scheduled_time);
    if (from != null && (rowTime == null || rowTime < from)) return false;
    if (to != null && (rowTime == null || rowTime > to)) return false;
    return true;
  };

  const rows = useMemo(
    () => dayRows.filter((row) => matchesFilter(row, filter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, fromTime, dayRows, selectedDate, toTime]
  );

  const visibleCount = (item: Filter) =>
    dayRows.filter((row) => matchesFilter(row, item)).length;

  return (
    <div>
      <PageHeader title="Reservations" description={`Bookings at ${shopName}. The list resets to the current day after 24 hours.`} />

      <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px] flex-1 text-sm font-medium text-ink-700">
            Date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || today)}
              className="field"
            />
          </label>
          <label className="min-w-[130px] flex-1 text-sm font-medium text-ink-700">
            From time
            <input type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} className="field" />
          </label>
          <label className="min-w-[130px] flex-1 text-sm font-medium text-ink-700">
            To time
            <input type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} className="field" />
          </label>
          <button
            type="button"
            onClick={() => {
              setSelectedDate(today);
              setFromTime("");
              setToTime("");
              setFilter("All");
            }}
            className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Today
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          {selectedDate === today
            ? "Showing today only. Older records are hidden — pick a date above to see past days."
            : `Showing records for ${selectedDate}. Tap Today to go back.`}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              filter === item ? "bg-ink-950 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            {item}
            <span className="ml-1.5 text-xs opacity-60">
              {visibleCount(item)}
            </span>
          </button>
        ))}
      </div>

      {loadingDate ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-ink-100 bg-white px-6 py-16 text-sm text-ink-500">
          <Loader2 size={16} className="animate-spin" /> Loading {selectedDate}...
        </div>
      ) : loadError ? (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center text-sm text-red-700">{loadError}</div>
      ) : rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <CalendarClock className="mx-auto text-ink-300" size={22} />
          <p className="mt-4 font-display font-semibold text-ink-950">No reservations in this view</p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <div className="divide-y divide-ink-100">
            {rows.map((row) => {
              const Icon = statusIcon(row.status);
              return (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-950">{row.customer_name || "Walk-in customer"}</p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {[row.vehicle_type, row.service_type].filter(Boolean).join(" · ") || "No details"}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        {row.reservation_date || "No date"}{row.scheduled_time ? ` · ${row.scheduled_time}` : ""}
                        {row.arrived_at ? " · Arrived" : " · Not arrived"}
                        {row.manual_mode ? (
                          <span className="font-semibold text-amber-600"> · Manual (CCTV offline)</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[isCancelled(row.status) ? "Cancelled" : row.status ?? ""] ?? "bg-ink-100 text-ink-600"}`}>
                      {isCancelled(row.status) ? "Cancelled" : row.status || "Unknown"}
                    </span>
                    <span className="text-sm font-semibold text-ink-950">{peso(row.price ?? 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
