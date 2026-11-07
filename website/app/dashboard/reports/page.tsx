import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import {
  bucketKeyFor,
  buildBuckets,
  collectedAmount,
  keepPaidWalkins,
  resolveRange,
  type Bucket,
} from "@/lib/reports";
import { ReportsView } from "./ReportsView";

export const metadata = { title: "Reports" };
export const revalidate = 0;

interface WalkinRow {
  id: number;
  reservation_id: number | null;
  price: number | null;
  reservation_date: string;
  service_type: string | null;
}

interface HomeServiceRow {
  id: number;
  price: number | null;
  scheduled_date: string;
  status: string | null;
  payment_status: string | null;
}

interface ExpenseRow {
  amount: number | null;
  category: string | null;
  expense_date: string;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { profile, shop } = await requireDashboardContext();
  if (profile.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const range = resolveRange(params.range, params.from, params.to);
  const buckets = buildBuckets(range);
  const monthly = buckets.length > 0 && buckets[0].from !== buckets[0].to;

  if (!shop) {
    return (
      <div>
        <PageHeader title="Reports" description="Your earnings and expenses." />
        <div className="mt-8">
          <EmptyState
            icon={BarChart3}
            title="No shop yet"
            description="Set up your shop first before you can see reports."
          />
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const [walkinRes, homeRes, expenseRes, appRes] = await Promise.all([
    supabase
      .from("walkin_transactions")
      .select("id, reservation_id, price, reservation_date, service_type")
      .eq("shop_id", shop.id)
      .gte("reservation_date", range.from)
      .lte("reservation_date", range.to),
    supabase
      .from("home_service")
      .select("id, price, scheduled_date, status, payment_status")
      .eq("shop_id", shop.id)
      .gte("scheduled_date", range.from)
      .lte("scheduled_date", range.to),
    supabase
      .from("expenses")
      .select("amount, category, expense_date")
      .eq("shop_id", shop.id)
      .gte("expense_date", range.from)
      .lte("expense_date", range.to),
    // App bookings never reach walkin_transactions (its sync trigger only
    // copies walk-ins), so read completed ones from `reservation`. `price`
    // already includes a Premium upgrade paid at the shop.
    supabase
      .from("reservation")
      .select("id, price, addon_amount, addon_paid_at, reservation_date")
      .eq("shop_id", shop.id)
      .eq("status", "Completed")
      .eq("payment_status", "paid")
      .not("customer_id", "is", null)
      .gte("reservation_date", range.from)
      .lte("reservation_date", range.to),
  ]);

  // Earnings only count once PAID -- unpaid / cancelled walk-ins and unpaid
  // home services are left out until staff mark them paid.
  const paidWalkins = await keepPaidWalkins(supabase, (walkinRes.data ?? []) as WalkinRow[]);

  // Surface a blocked/failed query instead of silently reporting ₱0.
  const loadError = [walkinRes.error, homeRes.error, expenseRes.error, appRes.error, paidWalkins.error].some(Boolean);

  const walkins = paidWalkins.rows;
  const homeServices = ((homeRes.data ?? []) as HomeServiceRow[]).filter(
    (h) => h.status === "Completed" && (h.payment_status ?? "").toLowerCase() === "paid"
  );
  const expenses = (expenseRes.data ?? []) as ExpenseRow[];

  // walkin_transactions rows are synced from `reservation`, so the original
  // `source` tells us whether it was a staff-encoded walk-in or an app booking.
  const reservationIds = walkins
    .map((w) => w.reservation_id)
    .filter((id): id is number => id != null);

  const sourceById = new Map<number, string>();
  if (reservationIds.length > 0) {
    const { data } = await supabase
      .from("reservation")
      .select("id, source")
      .in("id", reservationIds);
    (data ?? []).forEach((r: { id: number; source: string | null }) =>
      sourceById.set(r.id, r.source ?? "app")
    );
  }

  const zero = () => ({ earnings: 0, expenses: 0, count: 0 });
  const byBucket = new Map<string, ReturnType<typeof zero>>();
  buckets.forEach((b: Bucket) => byBucket.set(b.key, zero()));

  const add = (date: string, field: "earnings" | "expenses", amount: number, washes = 0) => {
    const key = bucketKeyFor(date, monthly);
    const slot = byBucket.get(key);
    if (!slot) return;
    slot[field] += amount;
    slot.count += washes;
  };

  let walkinEarnings = 0;
  let walkinCount = 0;
  let appEarnings = 0;
  let appCount = 0;

  walkins.forEach((w) => {
    const price = Number(w.price) || 0;
    add(w.reservation_date, "earnings", price, 1);
    const isWalkin =
      w.reservation_id != null && sourceById.get(w.reservation_id) === "walkin";
    if (isWalkin) {
      walkinEarnings += price;
      walkinCount += 1;
    } else {
      appEarnings += price;
      appCount += 1;
    }
  });

  // Skip any booking already counted through walkin_transactions above.
  const countedIds = new Set(walkins.map((w) => w.reservation_id));
  ((appRes.data ?? []) as {
    id: number;
    price: number | null;
    addon_amount: number | null;
    addon_paid_at: string | null;
    reservation_date: string;
  }[])
    .filter((r) => !countedIds.has(r.id))
    .forEach((r) => {
      // An upgrade only counts once staff marked it Collected.
      const price = collectedAmount(r);
      add(r.reservation_date, "earnings", price, 1);
      appEarnings += price;
      appCount += 1;
    });

  let homeEarnings = 0;
  homeServices.forEach((h) => {
    const price = Number(h.price) || 0;
    homeEarnings += price;
    add(h.scheduled_date, "earnings", price, 1);
  });

  const expenseByCategory = new Map<string, number>();
  expenses.forEach((e) => {
    const amount = Number(e.amount) || 0;
    add(e.expense_date, "expenses", amount);
    const cat = e.category?.trim() || "Other";
    expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) + amount);
  });

  const series = buckets.map((b) => {
    const slot = byBucket.get(b.key) ?? zero();
    return {
      label: b.label,
      fullLabel: b.fullLabel,
      earnings: slot.earnings,
      expenses: slot.expenses,
      profit: slot.earnings - slot.expenses,
      count: slot.count,
    };
  });

  const totalEarnings = walkinEarnings + appEarnings + homeEarnings;
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWashes = walkinCount + appCount + homeServices.length;

  return (
    <ReportsView
      rangeKey={range.key}
      rangeLabel={range.label}
      from={range.from}
      to={range.to}
      series={series}
      totals={{
        earnings: totalEarnings,
        expenses: totalExpenses,
        profit: totalEarnings - totalExpenses,
        washes: totalWashes,
      }}
      breakdown={[
        { label: "Walk-in", value: walkinEarnings, count: walkinCount },
        { label: "Booked in the app", value: appEarnings, count: appCount },
        { label: "Home service", value: homeEarnings, count: homeServices.length },
      ]}
      expenseCategories={[...expenseByCategory.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)}
      loadError={loadError}
    />
  );
}
