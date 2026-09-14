import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import type { ShopReview } from "@/lib/types";
import { ReviewModeration } from "./ReviewModeration";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const { profile, shop } = await requireDashboardContext();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();

  const reviews = shop
    ? (
        await supabase
          .from("shop_reviews")
          .select("id, shop_id, customer_name, customer_email, rating, comment, status, created_at")
          .eq("shop_id", shop.id)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  return (
    <div>
      <PageHeader
        title="Reviews"
        description={`Choose which reviews show up on your shop page. People can only see the ones you say yes to.`}
      />

      {!shop ? (
        <div className="mt-8">
          <EmptyState
            icon={Star}
            title="No shop linked"
            description="Set up your shop first before you can get reviews."
          />
        </div>
      ) : (
        <ReviewModeration initialReviews={reviews as ShopReview[]} />
      )}
    </div>
  );
}
