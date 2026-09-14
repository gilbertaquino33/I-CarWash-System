import { CalendarClock } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { ScheduleMonitor, type ScheduleRow } from "./ScheduleMonitor";

export const metadata = { title: "Today's Schedule" };
export const revalidate = 0;

export default async function SchedulePage() {
  const { shop } = await requireDashboardContext();

  if (!shop) {
    return (
      <div>
        <PageHeader
          title="Today's Schedule"
          description="The cars you need to wash today."
        />
        <div className="mt-8">
          <EmptyState
            icon={CalendarClock}
            title="No shop yet"
            description="Your account is not connected to a shop yet. Ask your shop owner to set it up."
          />
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  const { data } = await supabase
    .from("reservation")
    .select(
      "id, customer_name, vehicle_type, service_type, status, payment_status, price, scheduled_date, scheduled_time, scheduled_at, arrived_at, is_late"
    )
    .eq("shop_id", shop.id)
    .eq("scheduled_date", todayIso)
    .order("scheduled_time", { ascending: true });

  const rows = ((data ?? []) as ScheduleRow[]).filter(
    (r) => r.status !== "Voided" && r.status !== "Cancelled"
  );

  return (
    <ScheduleMonitor
      initialRows={rows}
      shopName={shop.shop_name}
      todayIso={todayIso}
      shopId={shop.id}
    />
  );
}
