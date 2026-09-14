"use client";

import { useMemo, useState } from "react";
import { Search, Store } from "lucide-react";
import { ShopCard } from "@/components/ShopCard";
import type { Shop, ShopReviewStats } from "@/lib/types";

export function ShopDirectory({
  shops,
  stats,
}: {
  shops: Shop[];
  stats: ShopReviewStats[];
}) {
  const [query, setQuery] = useState("");

  const statsByShop = useMemo(
    () => new Map(stats.map((s) => [s.shop_id, s])),
    [stats]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter((shop) =>
      [shop.shop_name, shop.city, shop.province, shop.barangay]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [shops, query]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input suppressHydrationWarning
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a shop name, city, or province..."
            className="w-full rounded-xl border border-ink-200 bg-white py-3 pl-11 pr-4 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>
        <p className="text-sm text-ink-500">
          {filtered.length} shop{filtered.length === 1 ? "" : "s"}
          {query && " found"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
            <Store size={20} />
          </span>
          <p className="mt-4 font-display text-base font-semibold text-ink-950">
            No shop found
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            We can&apos;t find &quot;{query}&quot;. Try another name or place.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((shop) => (
            <ShopCard key={shop.id} shop={shop} stats={statsByShop.get(shop.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
