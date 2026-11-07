import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PageHero } from "@/components/PageHero";
import { createClient } from "@/lib/supabase/server";
import type { Shop, ShopReviewStats } from "@/lib/types";
import { AlertCircle } from "lucide-react";
import { ShopDirectory } from "./ShopDirectory";

export const metadata = {
  title: "Find a Shop",
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
        <PageHero
          eyebrow="All shops"
          title="Find a shop"
          description="Find a partner shop, read reviews, and share your own after your service."
          image="https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1920&q=80"
        />

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
