import { CalendarClock } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { ReservationsView, type ReservationRow } from "./ReservationsView";

export const metadata = { title: "Reservations" };
export const revalidate = 0;

function localDateKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
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
  const { data } = await supabase
    .from("reservation")
    .select(
      "id, customer_name, vehicle_type, service_type, status, payment_status, price, reservation_date, scheduled_time, arrived_at, created_at"
    )
    .eq("shop_id", shop.id)
    .order("reservation_date", { ascending: false })
    .order("scheduled_time", { ascending: true })
    .limit(300);

  return (
    <ReservationsView
      initialRows={(data ?? []) as ReservationRow[]}
      shopName={shop.shop_name}
      today={localDateKey()}
    />
  );
}
