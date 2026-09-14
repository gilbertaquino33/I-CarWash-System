import { AlertCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import type { Shop, ShopReviewStats } from "@/lib/types";
import { ShopDirectory } from "./ShopDirectory";

export const metadata = {
  title: "Find a Car Wash",
};

export const revalidate = 0;

export default async function ShopsPage() {
  const supabase = await createClient();

  const { data: shops, error } = await supabase
    .from("shop_profile_setup")
    .select("id, shop_name, province, city, barangay, total_bays, owner_id")
    .order("shop_name", { ascending: true });

  const { data: stats } = await supabase
    .from("shop_review_stats")
    .select("shop_id, review_count, avg_rating");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950">
          <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-25" />
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />

          <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
              All shops
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Find a car wash shop
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/65">
              See all the car wash shops we work with, read what other people
              said, and leave your own review after your wash.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          {error ? (
            <p className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              We can&apos;t show the shops right now. Please try again later.
            </p>
          ) : (
            <ShopDirectory
              shops={(shops ?? []) as Shop[]}
              stats={(stats ?? []) as ShopReviewStats[]}
            />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
