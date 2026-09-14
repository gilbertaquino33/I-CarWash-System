import Link from "next/link";
import {
  Building2,
  ExternalLink,
  Inbox,
  MapPin,
  ParkingSquare,
  Star,
  Users,
} from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { StarRating } from "@/components/StarRating";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/dashboard/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile, shop } = await requireDashboardContext();
  const supabase = await createClient();

  let staffCount = 0;
  let pendingReviews = 0;
  let newInquiries = 0;
  let avgRating: number | null = null;
  let reviewCount = 0;
  let occupiedBays = 0;

  if (shop) {
    const [
      { count: staffTotal },
      { count: pendingTotal },
      { count: inquiryTotal },
      { data: stats },
      { count: occupied },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "staff")
        .eq("shop_id", shop.id),
      supabase
        .from("shop_reviews")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        .eq("status", "pending"),
      supabase
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        .eq("status", "new"),
      supabase
        .from("shop_review_stats")
        .select("avg_rating, review_count")
        .eq("shop_id", shop.id)
        .maybeSingle(),
      supabase
        .from("bays")
        .select("bay_name", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        // Only bays where the CCTV actually detects a vehicle -- `occupied`
        // is also set by staff actions / QR bay claims before the car parks.
        .eq("cv_occupied", true),
    ]);

    staffCount = staffTotal ?? 0;
    pendingReviews = pendingTotal ?? 0;
    newInquiries = inquiryTotal ?? 0;
    avgRating = stats?.avg_rating ?? null;
    reviewCount = stats?.review_count ?? 0;
    occupiedBays = occupied ?? 0;
  }

  const firstName = profile.full_name.trim().split(/\s+/)[0];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          shop
            ? `Here is how ${shop.shop_name} is doing today.`
            : "Your account is not connected to a shop yet."
        }
        action={
          shop && (
            <Link
              href={`/shops/${shop.id}`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-50"
            >
              <ExternalLink size={15} />
              See my shop page
            </Link>
          )
        }
      />

      {!shop ? (
        <div className="mt-8">
          <EmptyState
            icon={Building2}
            title="No shop yet"
            description="Your account is not connected to a shop yet. Ask your shop owner to set it up for you."
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={ParkingSquare}
              label="Bays in use"
              value={`${occupiedBays} / ${shop.total_bays}`}
              hint="Seen by the cameras"
            />
            <StatCard icon={Users} label="Staff" value={staffCount} />
            <StatCard
              icon={Star}
              label="Star rating"
              value={avgRating ? avgRating.toFixed(1) : "—"}
              hint={`${reviewCount} review${reviewCount === 1 ? "" : "s"}`}
            />
            {profile.role === "admin" ? (
              <Link href="/dashboard/inquiries" className="block">
                <StatCard
                  icon={Inbox}
                  label="New messages"
                  value={newInquiries}
                  hint="From your website"
                  accent={newInquiries > 0}
                />
              </Link>
            ) : (
              <StatCard icon={MapPin} label="Location" value={shop.city} />
            )}
          </div>

          {profile.role === "admin" && pendingReviews > 0 && (
            <Link
              href="/dashboard/reviews"
              className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4 transition hover:border-brand-300"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
                  <Star size={17} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-950">
                    {pendingReviews} review{pendingReviews === 1 ? "" : "s"} waiting for you
                  </p>
                  <p className="text-xs text-ink-500">
                    People can only see reviews after you say yes to them.
                  </p>
                </div>
              </div>
              <Badge tone="brand">Check these</Badge>
            </Link>
          )}

          <Card className="mt-6 p-6 sm:p-7">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-950 text-white">
                <Building2 size={16} />
              </span>
              <h2 className="font-display text-base font-semibold text-ink-950">
                My shop
              </h2>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Shop name
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink-950">{shop.shop_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Address
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink-950">
                  {[shop.barangay, shop.city, shop.province].filter(Boolean).join(", ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  All bays
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink-950">{shop.total_bays}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Star rating
                </dt>
                <dd className="mt-1.5 flex items-center gap-2">
                  {avgRating ? (
                    <>
                      <StarRating rating={avgRating} />
                      <span className="text-sm font-semibold text-ink-950">{avgRating}</span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-500">No reviews yet</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
