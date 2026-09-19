"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, ListOrdered, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/dashboard/ui";
import { peso } from "@/lib/reports";

export interface QueueRow {
  id: number;
  customer_name: string | null;
  vehicle_type: string | null;
  service_type: string | null;
  status: string | null;
  payment_status: string | null;
  price: number | null;
  created_at: string;
  reservation_date: string;
  scheduled_time: string | null;
  arrived_at: string | null;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export function QueueMonitor({
  initialRows,
  shopName,
  today,
  shopId,
}: {
  initialRows: QueueRow[];
  shopName: string;
  today: string;
  shopId: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("reservation")
      .select(
        "id, customer_name, vehicle_type, service_type, status, payment_status, price, created_at, reservation_date, scheduled_time, arrived_at"
      )
      .eq("shop_id", shopId)
      .eq("reservation_date", today)
      .eq("status", "Waiting")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setRows(data as QueueRow[]);
      setLastSync(new Date());
    }
    setRefreshing(false);
  }, [shopId, today]);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div>
      <PageHeader
        title="Waiting Queue"
        description={`Customers waiting at ${shopName}. Oldest requests are shown first.`}
        action={
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <ListOrdered size={19} />
          </span>
          <div>
            <p className="font-display text-2xl font-bold text-ink-950">{rows.length}</p>
            <p className="text-xs text-ink-600">Waiting today</p>
          </div>
        </div>
        <p className="text-right text-xs text-ink-500">
          {lastSync
            ? `Updated ${lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Updates every minute"}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
            <Clock3 size={20} />
          </span>
          <p className="mt-4 font-display text-base font-semibold text-ink-950">
            No customers waiting
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            New reservations and walk-ins will appear here when they are waiting for a bay.
          </p>
        </div>
      ) : (
        <ol className="mt-5 space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-950 font-display text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-ink-950">
                      {row.customer_name || "Walk-in customer"}
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      {[row.vehicle_type, row.service_type].filter(Boolean).join(" · ") || "No service details"}
                    </p>
                    <p className="mt-2 text-xs text-ink-400">
                      Added {timeLabel(row.created_at)}
                      {row.scheduled_time ? ` · Slot ${row.scheduled_time}` : " · No time slot"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-base font-bold text-ink-950">{peso(row.price ?? 0)}</p>
                  <p className={`mt-1 text-xs font-semibold ${(row.payment_status ?? "").toLowerCase() === "paid" ? "text-emerald-700" : "text-ink-400"}`}>
                    {(row.payment_status ?? "unpaid").toLowerCase() === "paid" ? "Paid" : "Not yet paid"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
