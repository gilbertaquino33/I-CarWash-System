import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import type { QuoteRequest } from "@/lib/types";
import { InquiryList } from "./InquiryList";

export const metadata = { title: "Inquiries" };

export default async function InquiriesPage() {
  const { profile, shop } = await requireDashboardContext();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();

  const inquiries = shop
    ? (
        await supabase
          .from("quote_requests")
          .select("id, shop_id, full_name, email, phone, service_type, preferred_date, message, status, created_at")
          .eq("shop_id", shop.id)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  return (
    <div>
      <PageHeader
        title="Inquiries"
        description={`Messages from customers who asked for a price at ${shop?.shop_name ?? "your shop"}.`}
      />

      {!shop ? (
        <div className="mt-8">
          <EmptyState
            icon={Inbox}
            title="No shop linked"
            description="Set up your shop first before you can get messages."
          />
        </div>
      ) : (
        <InquiryList initialInquiries={inquiries as QuoteRequest[]} />
      )}
    </div>
  );
}
