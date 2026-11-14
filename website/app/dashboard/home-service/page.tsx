import { Home } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { HOME_SERVICE_COLUMNS, HomeServiceView, type HomeServiceRow } from "./HomeServiceView";

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

  // Default view: today, upcoming, and anything still in progress. Past
  // finished jobs are loaded only when a date is picked.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const supabase = await createClient();
  const { data } = await supabase
    .from("home_service")
    .select(HOME_SERVICE_COLUMNS)
    .eq("shop_id", shop.id)
    .or(`scheduled_date.gte.${today},status.in.(Waiting,Pending,"On the Way",Washing,"In Progress")`)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  return (
    <HomeServiceView
      initialRows={(data ?? []) as HomeServiceRow[]}
      shopId={shop.id}
      shopName={shop.shop_name}
      today={today}
    />
  );
}
