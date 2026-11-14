import { CalendarClock } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { RESERVATION_COLUMNS, ReservationsView, type ReservationRow } from "./ReservationsView";

export const metadata = { title: "Reservations" };
export const revalidate = 0;

// The shop's "today" -- the server runs in UTC, so use Philippine time.
function localDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export default async function ReservationsPage() {
  const { shop } = await requireDashboardContext();

  if (!shop) {
    return (
      <div>
        <PageHeader title="Reservations" description="Bookings for your shop." />
        <div className="mt-8">
          <EmptyState icon={CalendarClock} title="No shop yet" description="Set up your shop before managing reservations." />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const today = localDateKey();
  // Only today's rows on first load; older days are fetched on demand when
  // staff pick a date, so the list never grows with the whole history.
  const fetchRows = (columns: string) =>
    supabase
      .from("reservation")
      .select(columns)
      .eq("shop_id", shop.id)
      .eq("reservation_date", today)
      .order("scheduled_time", { ascending: true });

  // manual_mode = wash tracked by staff, not the CCTV
  // (supabase/sql/2026-11_offline_manual_checkin.sql). Fall back if not applied yet.
  let result = await fetchRows(`${RESERVATION_COLUMNS}, manual_mode`);
  if (result.error?.code === "42703") result = await fetchRows(RESERVATION_COLUMNS);
  const { data } = result;

  return (
    <ReservationsView
      initialRows={(data ?? []) as unknown as ReservationRow[]}
      shopId={shop.id}
      shopName={shop.shop_name}
      today={today}
    />
  );
}
