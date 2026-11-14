"use client";

import { useEffect, useMemo, useState } from "react";
import { Home, Loader2, MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/dashboard/ui";
import { peso } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export interface HomeServiceRow {
  id: number;
  customer_name: string | null;
  contact_number: string | null;
  address: string | null;
  vehicle_type: string | null;
  service_type: string | null;
  status: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  payment_status: string | null;
  price: number | null;
}

export const HOME_SERVICE_COLUMNS =
  "id, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_status, price";

// Filter label -> the status values the database actually stores.
const FILTERS = {
  All: null,
  Pending: ["Waiting", "Pending"],
  "On the Way": ["On the Way"],
  Washing: ["Washing", "In Progress"],
  Completed: ["Completed"],
  Cancelled: ["Cancelled", "Voided"],
} as const satisfies Record<string, readonly string[] | null>;
type Filter = keyof typeof FILTERS;

const STATUS_LABEL: Record<string, string> = { Waiting: "Pending", Voided: "Cancelled", "In Progress": "Washing" };
const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  "On the Way": "bg-violet-50 text-violet-700",
  Washing: "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-red-50 text-red-700",
};
const label = (s: string | null) => (s ? STATUS_LABEL[s] ?? s : "Unknown");
const matches = (row: HomeServiceRow, f: Filter) => {
  const allowed = FILTERS[f] as readonly string[] | null;
  return !allowed || allowed.includes(row.status ?? "");
};

const phToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export function HomeServiceView({
  initialRows,
  shopId,
  shopName,
  today,
}: {
  initialRows: HomeServiceRow[];
  shopId: number;
  shopName: string;
  today: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  // "" = default view (today, upcoming, and anything still in progress).
  const [historyDate, setHistoryDate] = useState("");
  const [historyRows, setHistoryRows] = useState<Record<string, HomeServiceRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!historyDate || historyRows[historyDate]) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await createClient()
        .from("home_service")
        .select(HOME_SERVICE_COLUMNS)
        .eq("shop_id", shopId)
        .eq("scheduled_date", historyDate)
        .order("scheduled_time", { ascending: true });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError("Couldn’t load that day. Please try again.");
        return;
      }
      setHistoryRows((m) => ({ ...m, [historyDate]: (data ?? []) as HomeServiceRow[] }));
    })();
    return () => {
      cancelled = true;
    };
  }, [historyDate, historyRows, shopId]);

  // In the default view, hide jobs finished before today (the page may have
  // been left open past midnight).
  const baseRows = useMemo(() => {
    if (historyDate) return historyRows[historyDate] ?? [];
    const now = phToday();
    return initialRows.filter(
      (r) => (r.scheduled_date ?? "") >= now || !(matches(r, "Completed") || matches(r, "Cancelled"))
    );
  }, [historyDate, historyRows, initialRows]);

  const rows = useMemo(() => baseRows.filter((r) => matches(r, filter)), [baseRows, filter]);

  return (
    <div>
      <PageHeader title="Home Service" description={`Home-service bookings for ${shopName}.`} />

      <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px] flex-1 text-sm font-medium text-ink-700">
            View a past or specific date
            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="field"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setHistoryDate("");
              setFilter("All");
            }}
            className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Today &amp; upcoming
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          {historyDate
            ? `Showing bookings for ${historyDate}.`
            : `Showing today (${today}), upcoming bookings, and jobs still in progress. Finished jobs from past days are hidden — pick a date to see them.`}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as Filter[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${filter === item ? "bg-ink-950 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
          >
            {item}
            <span className="ml-1.5 text-xs opacity-60">{baseRows.filter((r) => matches(r, item)).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-ink-100 bg-white px-6 py-16 text-sm text-ink-500">
          <Loader2 size={16} className="animate-spin" /> Loading {historyDate}...
        </div>
      ) : loadError ? (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-6 py-10 text-center text-sm text-red-700">{loadError}</div>
      ) : rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <Home className="mx-auto text-ink-300" size={22} />
          <p className="mt-4 font-display font-semibold text-ink-950">No home-service bookings in this view</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-ink-100 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-display text-base font-semibold text-ink-950">{row.customer_name || "Customer"}</p>
                  <p className="mt-1 text-sm text-ink-500">{[row.vehicle_type, row.service_type].filter(Boolean).join(" · ") || "No service details"}</p>
                  <p className="mt-3 flex items-start gap-2 text-sm text-ink-600"><MapPin size={15} className="mt-0.5 shrink-0 text-ink-400" />{row.address || "No address"}</p>
                  {row.contact_number && <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-500"><Phone size={14} className="text-ink-400" />{row.contact_number}</p>}
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[label(row.status)] ?? "bg-ink-100 text-ink-600"}`}>{label(row.status)}</span>
                  <p className="mt-3 font-display text-base font-bold text-ink-950">{peso(row.price ?? 0)}</p>
                  <p className="mt-1 text-xs text-ink-400">{row.scheduled_date || "No date"}{row.scheduled_time ? ` · ${row.scheduled_time}` : ""}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
