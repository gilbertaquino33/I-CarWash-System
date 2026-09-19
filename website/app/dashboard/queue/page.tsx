import { ListOrdered } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { QueueMonitor, type QueueRow } from "./QueueMonitor";

export const metadata = { title: "Waiting Queue" };
export const revalidate = 0;

function localDateKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
}

export default async function QueuePage() {
  const { shop } = await requireDashboardContext();

  if (!shop) {
    return (
      <div>
        <PageHeader title="Waiting Queue" description="Customers waiting for a wash today." />
        <div className="mt-8">
          <EmptyState
            icon={ListOrdered}
            title="No shop yet"
            description="Your account is not connected to a shop yet. Ask your shop owner to set it up."
          />
        </div>
      </div>
    );
  }

  const today = localDateKey();
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservation")
    .select(
      "id, customer_name, vehicle_type, service_type, status, payment_status, price, created_at, reservation_date, scheduled_time, arrived_at"
    )
    .eq("shop_id", shop.id)
    .eq("reservation_date", today)
    .eq("status", "Waiting")
    .order("created_at", { ascending: true });

  return (
    <QueueMonitor
      initialRows={(data ?? []) as QueueRow[]}
      shopName={shop.shop_name}
      today={today}
      shopId={shop.id}
    />
  );
}
