"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Mail, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StarRating } from "@/components/StarRating";
import { Badge, Card, EmptyState } from "@/components/dashboard/ui";
import type { ReviewStatus, ShopReview } from "@/lib/types";

const TABS: { key: ReviewStatus; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Showing" },
  { key: "rejected", label: "Hidden" },
];

const TAB_WORDS: Record<ReviewStatus, string> = {
  pending: "waiting",
  approved: "showing",
  rejected: "hidden",
};

const STATUS_TONE: Record<ReviewStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export function ReviewModeration({
  initialReviews,
}: {
  initialReviews: ShopReview[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const [busyId, setBusyId] = useState<number | null>(null);

  const counts = useMemo(
    () => ({
      pending: reviews.filter((r) => r.status === "pending").length,
      approved: reviews.filter((r) => r.status === "approved").length,
      rejected: reviews.filter((r) => r.status === "rejected").length,
    }),
    [reviews]
  );

  const filtered = reviews.filter((r) => r.status === tab);

  const updateStatus = async (id: number, status: ReviewStatus) => {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("shop_reviews").update({ status }).eq("id", id);
    if (!error) {
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    }
    setBusyId(null);
  };

  const deleteReview = async (id: number) => {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("shop_reviews").delete().eq("id", id);
    if (!error) {
      setReviews((prev) => prev.filter((r) => r.id !== id));
    }
    setBusyId(null);
  };

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-ink-100 bg-white p-1.5">
        {TABS.map((t) => (
          <button suppressHydrationWarning
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-ink-950 text-white"
                : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            {t.label}
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                tab === t.key ? "bg-white/15 text-white" : "bg-ink-100 text-ink-600"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Star}
            title={`No ${TAB_WORDS[tab]} reviews`}
            description={
              tab === "pending"
                ? "Reviews from your shop page will show up here first, so you can check them."
                : `You have no ${TAB_WORDS[tab]} reviews right now.`
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {filtered.map((review) => (
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
                <div className="flex items-center gap-3">
                  <StarRating rating={review.rating} />
                  <Badge tone={STATUS_TONE[review.status]}>
                    {TAB_WORDS[review.status]}
                  </Badge>
                </div>
              </div>

              <p className="mt-4 rounded-xl bg-ink-50/70 p-4 text-sm leading-relaxed text-ink-700">
                {review.comment}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-400">
                  {new Date(review.created_at).toLocaleString()}
                </p>

                <div className="flex flex-wrap gap-2">
                  {review.status !== "approved" && (
                    <button suppressHydrationWarning
                      disabled={busyId === review.id}
                      onClick={() => updateStatus(review.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
                    >
                      {busyId === review.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Show it
                    </button>
                  )}
                  {review.status !== "rejected" && (
                    <button suppressHydrationWarning
                      disabled={busyId === review.id}
                      onClick={() => updateStatus(review.id, "rejected")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
                    >
                      <X size={13} />
                      Hide it
                    </button>
                  )}
                  <button suppressHydrationWarning
                    disabled={busyId === review.id}
                    onClick={() => deleteReview(review.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
