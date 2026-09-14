import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, MessageSquareQuote, ParkingSquare } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { StarRating } from "@/components/StarRating";
import { ReviewForm } from "@/components/ReviewForm";
import { createClient } from "@/lib/supabase/server";
import type { Shop, ShopReview, ShopReviewStats } from "@/lib/types";

export const revalidate = 0;

export default async function ShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shopId = Number(id);
  if (!Number.isFinite(shopId)) notFound();

  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("shop_profile_setup")
    .select("id, shop_name, province, city, barangay, total_bays, owner_id")
    .eq("id", shopId)
    .single();

  if (!shop) notFound();

  const [{ data: reviews }, { data: statsRow }] = await Promise.all([
    supabase
      .from("shop_reviews")
      .select("id, shop_id, customer_name, customer_email, rating, comment, status, created_at")
      .eq("shop_id", shopId)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_review_stats")
      .select("shop_id, review_count, avg_rating")
      .eq("shop_id", shopId)
      .maybeSingle(),
  ]);

  const typedShop = shop as Shop;
  const typedReviews = (reviews ?? []) as ShopReview[];
  const stats = statsRow as ShopReviewStats | null;

  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: typedReviews.filter((r) => r.rating === star).length,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        {/* Header */}
        <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950">
          <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-25" />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />

          <div className="relative mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
            <nav className="flex items-center gap-1.5 text-xs text-white/50">
              <Link href="/" className="transition hover:text-white">
                Home
              </Link>
              <ChevronRight size={12} />
              <Link href="/shops" className="transition hover:text-white">
                Shops
              </Link>
              <ChevronRight size={12} />
              <span className="text-white/80">{typedShop.shop_name}</span>
            </nav>

            <div className="mt-6 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {typedShop.shop_name}
                </h1>
                <p className="mt-2.5 flex items-center gap-2 text-white/60">
                  <MapPin size={15} />
                  {[typedShop.barangay, typedShop.city, typedShop.province]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>

              <div className="flex items-center gap-4">
                {stats && stats.review_count > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-2xl font-bold text-white">
                        {stats.avg_rating}
                      </span>
                      <StarRating rating={stats.avg_rating} size={15} />
                    </div>
                    <p className="mt-0.5 text-xs text-white/50">
                      {stats.review_count} review{stats.review_count === 1 ? "" : "s"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/60 backdrop-blur">
                    No reviews yet
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center backdrop-blur">
                  <p className="flex items-center justify-center gap-1.5 font-display text-2xl font-bold text-white">
                    <ParkingSquare size={18} className="text-brand-300" />
                    {typedShop.total_bays}
                  </p>
                  <p className="mt-0.5 text-xs text-white/50">
                    wash bay{typedShop.total_bays === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <h2 className="font-display text-xl font-bold text-ink-950">
              Customer reviews
            </h2>

            {typedReviews.length > 0 && (
              <div className="mt-5 space-y-2 rounded-2xl border border-ink-100 bg-ink-50/50 p-5">
                {distribution.map(({ star, count }) => {
                  const pct = typedReviews.length
                    ? (count / typedReviews.length) * 100
                    : 0;
                  return (
                    <div key={star} className="flex items-center gap-3 text-xs">
                      <span className="w-6 font-medium text-ink-600">{star}★</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-ink-500">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {typedReviews.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <MessageSquareQuote size={20} />
                </span>
                <p className="mt-4 font-display text-base font-semibold text-ink-950">
                  No published reviews yet
                </p>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-500">
                  Be the first to share your experience at this shop.
                </p>
              </div>
            ) : (
              <ul className="mt-5 space-y-4">
                {typedReviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-2xl border border-ink-100 bg-white p-5 transition hover:shadow-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 font-display text-sm font-bold text-white">
                          {review.customer_name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold text-ink-950">
                            {review.customer_name}
                          </p>
                          <p className="text-xs text-ink-400">
                            {new Date(review.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <StarRating rating={review.rating} />
                    </div>
                    <p className="mt-3.5 text-sm leading-relaxed text-ink-600">
                      {review.comment}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:sticky lg:top-28 lg:self-start">
            <ReviewForm shopId={typedShop.id} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
