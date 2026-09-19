import Link from "next/link";
import {
  Banknote,
  Building2,
  CarFront,
  Clock,
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
import { resolveRange } from "@/lib/reports";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile, shop } = await requireDashboardContext();
  const supabase = await createClient();

  let staffCount = 0;
  let newReviews = 0;
  let newInquiries = 0;
  let avgRating: number | null = null;
  let reviewCount = 0;
  let occupiedBays = 0;
  let waitingQueue = 0;
  let todayRevenue = 0;
  let todayReservations = 0;
  let todayWalkIns = 0;
  let todayHomeServices = 0;
  let salesLoadError = false;

  if (shop) {
    const today = resolveRange("today");
    const [
      { count: staffTotal },
      { count: newReviewTotal },
      { count: inquiryTotal },
      { data: stats },
      { count: occupied },
      { count: waitingTotal },
      walkinRes,
      homeServiceRes,
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
        .eq("status", "approved")
        // Reviews publish at once, so this counts the ones from the past week.
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
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
      supabase
        .from("reservation")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        .eq("reservation_date", today.from)
        .eq("status", "Waiting"),
      supabase
        .from("walkin_transactions")
        .select("price, reservation_id, reservation_date")
        .eq("shop_id", shop.id)
        .gte("reservation_date", today.from)
        .lte("reservation_date", today.to),
      supabase
        .from("home_service")
        .select("price, status, scheduled_date")
        .eq("shop_id", shop.id)
        .eq("status", "Completed")
        .gte("scheduled_date", today.from)
        .lte("scheduled_date", today.to),
    ]);

    staffCount = staffTotal ?? 0;
    newReviews = newReviewTotal ?? 0;
    newInquiries = inquiryTotal ?? 0;
    avgRating = stats?.avg_rating ?? null;
    reviewCount = stats?.review_count ?? 0;
    occupiedBays = occupied ?? 0;
    waitingQueue = waitingTotal ?? 0;

    salesLoadError = Boolean(walkinRes.error || homeServiceRes.error);
    const walkins = walkinRes.data ?? [];
    const homeServices = homeServiceRes.data ?? [];
    const reservationIds = walkins
      .map((row) => row.reservation_id)
      .filter((id): id is number => id != null);

    const sourceById = new Map<number, string | null>();
    if (reservationIds.length > 0 && !walkinRes.error) {
      const { data: reservations, error: reservationError } = await supabase
        .from("reservation")
        .select("id, source")
        .in("id", reservationIds);
      salesLoadError ||= Boolean(reservationError);
      (reservations ?? []).forEach((reservation: { id: number; source: string | null }) => {
        sourceById.set(reservation.id, reservation.source);
      });
    }

    walkins.forEach((row) => {
      const price = row.price ?? 0;
      todayRevenue += price;
      if (row.reservation_id != null && sourceById.get(row.reservation_id) === "walkin") {
        todayWalkIns += price;
      } else {
        todayReservations += price;
      }
    });
    homeServices.forEach((row) => {
      todayHomeServices += row.price ?? 0;
      todayRevenue += row.price ?? 0;
    });
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
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              icon={ParkingSquare}
              label="Bays in use"
              value={`${occupiedBays} / ${shop.total_bays}`}
            />
            <Link href="/dashboard/queue" className="block">
              <StatCard
                icon={Clock}
                label="Waiting queue"
                value={waitingQueue}
                hint="Reservations waiting today"
                accent={waitingQueue > 0}
              />
            </Link>
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

          <Card className="mt-6 border-emerald-200 bg-emerald-50/40 p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Banknote size={19} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Today&apos;s sales
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold text-ink-950">
                    ₱{todayRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {salesLoadError ? "Some sales data could not be loaded." : "Completed services today"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:min-w-[390px]">
                <div className="rounded-xl bg-white/80 px-3 py-3">
                  <p className="text-xs text-ink-500">Reservations</p>
                  <p className="mt-1 text-sm font-bold text-ink-950">
                    ₱{todayReservations.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-xl bg-white/80 px-3 py-3">
                  <p className="text-xs text-ink-500">Walk-ins</p>
                  <p className="mt-1 text-sm font-bold text-ink-950">
                    ₱{todayWalkIns.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-xl bg-white/80 px-3 py-3">
                  <p className="text-xs text-ink-500">Home service</p>
                  <p className="mt-1 text-sm font-bold text-ink-950">
                    ₱{todayHomeServices.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
            {profile.role === "admin" && (
              <Link
                href="/dashboard/reports"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
              >
                <CarFront size={15} />
                Open full sales reports
              </Link>
            )}
          </Card>

          {profile.role === "admin" && newReviews > 0 && (
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
                    {newReviews} new review{newReviews === 1 ? "" : "s"} this week
                  </p>
                  <p className="text-xs text-ink-500">
                    They&apos;re already showing on your shop page.
                  </p>
                </div>
              </div>
              <Badge tone="brand">See reviews</Badge>
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
