import { Home } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { HomeServiceView, type HomeServiceRow } from "./HomeServiceView";

export const metadata = { title: "Home Service" };
export const revalidate = 0;

export default async function HomeServicePage() {
  const { shop } = await requireDashboardContext();

  if (!shop) {
    return (
      <div>
        <PageHeader title="Home Service" description="Home-service bookings for your shop." />
        <div className="mt-8">
          <EmptyState icon={Home} title="No shop yet" description="Set up your shop before managing home-service bookings." />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("home_service")
    .select("id, customer_name, contact_number, address, vehicle_type, service_type, status, scheduled_date, scheduled_time, payment_status, price")
    .eq("shop_id", shop.id)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  return <HomeServiceView initialRows={(data ?? []) as HomeServiceRow[]} shopName={shop.shop_name} />;
}
