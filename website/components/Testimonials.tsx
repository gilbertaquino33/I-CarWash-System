"use client";

import { useRef } from "react";
import { ArrowLeft, ArrowRight, MessageSquareQuote, Quote } from "lucide-react";
import { StarRating } from "./StarRating";
import type { ShopReview } from "@/lib/types";

export function Testimonials({
  reviews,
}: {
  reviews: (ShopReview & { shop_name?: string })[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  if (reviews.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <MessageSquareQuote size={20} />
        </span>
        <p className="mt-4 font-display text-base font-semibold text-ink-950">
          No reviews yet
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
          Once customers start rating their washes, their feedback will
          appear right here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2"
      >
        {reviews.map((review) => (
          <figure
            key={review.id}
            className="flex w-[290px] shrink-0 snap-start flex-col rounded-3xl border border-ink-100 bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-lift sm:w-[360px]"
          >
            <div className="flex items-center justify-between">
              <StarRating rating={review.rating} />
              <Quote size={22} className="text-ink-100" />
            </div>

            <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-700">
              &ldquo;{review.comment}&rdquo;
            </blockquote>

            <figcaption className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-950 font-display text-xs font-bold text-white">
                {review.customer_name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-950">
                  {review.customer_name}
                </p>
                {review.shop_name && (
                  <p className="truncate text-xs text-ink-400">{review.shop_name}</p>
                )}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {reviews.length > 2 && (
        <div className="mt-6 flex justify-end gap-2">
          <button suppressHydrationWarning
            type="button"
            aria-label="Previous reviews"
            onClick={() => scrollBy(-380)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
          >
            <ArrowLeft size={16} />
          </button>
          <button suppressHydrationWarning
            type="button"
            aria-label="Next reviews"
            onClick={() => scrollBy(380)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
