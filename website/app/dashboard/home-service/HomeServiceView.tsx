"use client";

import { useMemo, useState } from "react";
import { Home, MapPin, Phone } from "lucide-react";
import { PageHeader } from "@/components/dashboard/ui";
import { peso } from "@/lib/reports";

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

const FILTERS = ["All", "Pending", "On the Way", "In Progress", "Completed"] as const;
type Filter = (typeof FILTERS)[number];

export function HomeServiceView({
  initialRows,
  shopName,
}: {
  initialRows: HomeServiceRow[];
  shopName: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const rows = useMemo(
    () => initialRows.filter((row) => filter === "All" || row.status === filter),
    [filter, initialRows]
  );

  return (
    <div>
      <PageHeader title="Home Service" description={`Home-service bookings for ${shopName}.`} />
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${filter === item ? "bg-ink-950 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
          >
            {item}
            <span className="ml-1.5 text-xs opacity-60">{item === "All" ? initialRows.length : initialRows.filter((row) => row.status === item).length}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
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
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{row.status || "Unknown"}</span>
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
