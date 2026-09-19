import { Mail, Star } from "lucide-react";
import { StarRating } from "@/components/StarRating";
import { Badge, Card, EmptyState } from "@/components/dashboard/ui";
import type { ShopReview } from "@/lib/types";

// Read-only on purpose: every customer review is shown as it was written. The
// shop admin can't hide, edit or remove reviews, so no one can pick and choose.
export function ReviewList({ reviews }: { reviews: ShopReview[] }) {
  if (reviews.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={Star}
          title="No reviews yet"
          description="Reviews from your shop page show up here as soon as customers send them."
        />
      </div>
    );
  }

  return (
    <div className="mt-8">
      <Badge tone="neutral">
        <Star size={12} />
        {reviews.length} review{reviews.length === 1 ? "" : "s"}
      </Badge>

      <ul className="mt-5 space-y-4">
        {reviews.map((review) => (
          <Card key={review.id} className="p-5 transition hover:shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 font-display text-sm font-bold text-white">
                  {review.customer_name.trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-semibold text-ink-950">{review.customer_name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-400">
                    <Mail size={11} />
                    {review.customer_email}
                  </p>
                </div>
              </div>
              <StarRating rating={review.rating} />
            </div>

            <p className="mt-4 rounded-xl bg-ink-50/70 p-4 text-sm leading-relaxed text-ink-700">
              {review.comment}
            </p>

            <p className="mt-4 text-xs text-ink-400">
              {new Date(review.created_at).toLocaleString()}
            </p>
          </Card>
        ))}
      </ul>
    </div>
  );
}
