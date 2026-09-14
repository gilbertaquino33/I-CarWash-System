import Link from "next/link";
import { ArrowRight, MapPin, ParkingSquare } from "lucide-react";
import { StarRating } from "./StarRating";
import type { Shop, ShopReviewStats } from "@/lib/types";

export function ShopCard({
  shop,
  stats,
}: {
  shop: Shop;
  stats?: ShopReviewStats;
}) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="group flex flex-col justify-between rounded-3xl border border-ink-100 bg-white p-6 transition duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lift"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink-950 font-display text-base font-bold text-white">
            {shop.shop_name.trim().charAt(0).toUpperCase()}
          </span>
          {stats && stats.review_count > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {stats.avg_rating}
              <StarRating rating={5} size={11} />
            </span>
          )}
        </div>

        <h3 className="mt-4 font-display text-lg font-semibold text-ink-950 transition group-hover:text-brand-600">
          {shop.shop_name}
        </h3>
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-500">
          <MapPin size={14} className="mt-0.5 shrink-0 text-ink-400" />
          {[shop.barangay, shop.city, shop.province].filter(Boolean).join(", ")}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-4">
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <ParkingSquare size={13} className="text-ink-400" />
            {shop.total_bays} bay{shop.total_bays === 1 ? "" : "s"}
          </span>
          <span className="text-ink-200">·</span>
          <span>
            {stats && stats.review_count > 0
              ? `${stats.review_count} review${stats.review_count === 1 ? "" : "s"}`
              : "No reviews yet"}
          </span>
        </div>
        <ArrowRight
          size={16}
          className="text-ink-300 transition group-hover:translate-x-1 group-hover:text-brand-600"
        />
      </div>
    </Link>
  );
}
