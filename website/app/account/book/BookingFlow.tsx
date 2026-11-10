"use client";

import { AreaBanner } from "@/components/account/AreaBanner";
import { GetTheApp } from "@/components/account/GetTheApp";
import { EmptyCard } from "@/components/account/ui";
import { useNearbyBranches } from "@/components/account/useNearbyBranches";
import {
  PACKAGES,
  VEHICLE_TYPES,
  chargeable,
  formatDay,
  formatPriceEntry,
  nextDays,
  openSlots,
  peso,
  pricingFor,
  slotIso,
  startGcashPayment,
  type PackageType,
} from "@/lib/customer";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, Check, Droplets, Loader2, ShieldCheck, Sparkles, Store, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const GCASH_MIN = 100; // PayMongo won't take a GCash payment below ₱100

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-2.5 font-bold text-ink-950">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            done ? "bg-emerald-500 text-white" : "bg-brand-50 text-brand-700"
          }`}
        >
          {done ? <Check size={14} /> : n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BookingFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { branches, nearby, area, locate, chooseTown, towns, loading: branchesLoading } = useNearbyBranches();

  const [shopId, setShopId] = useState<number | null>(params.get("shop") ? Number(params.get("shop")) : null);
  const days = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState(days[0].iso);
  const [time, setTime] = useState("");
  const [booked, setBooked] = useState<string[]>([]);
  const [checkingSlots, setCheckingSlots] = useState(false);
  const [pkg, setPkg] = useState<PackageType | null>(null);
  const [vehicle, setVehicle] = useState<string | null>(null);

  const [profile, setProfile] = useState<{ id: string; name: string; email: string; mobile: string } | null>(null);
  const [credit, setCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shop = branches.find((b) => b.id === shopId) ?? null;
  const shopAllowed = !!shop && nearby.some((b) => b.id === shop.id);

  // Profile + store credit
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from("profiles").select("full_name, email_address, mobile").eq("id", user.id).maybeSingle(),
        supabase.from("customer_voucher").select("balance").eq("customer_id", user.id).maybeSingle(),
      ]);
      setProfile({ id: user.id, name: p?.full_name ?? "Customer", email: p?.email_address ?? user.email ?? "", mobile: p?.mobile ?? "" });
      setCredit(Number(v?.balance ?? 0));
    });
  }, []);

  // Taken time slots for this branch + day (one booking per slot).
  const loadBooked = useCallback(async () => {
    if (!shopId) return;
    setCheckingSlots(true);
    const { data } = await createClient().rpc("get_booked_slots", { p_shop_id: shopId, p_scheduled_date: date });
    const taken = ((data ?? []) as { scheduled_time: string }[]).map((r) => r.scheduled_time);
    setBooked(taken);
    setTime((t) => (t && taken.includes(t) ? "" : t));
    setCheckingSlots(false);
  }, [shopId, date]);

  useEffect(() => {
    loadBooked();
  }, [loadBooked]);

  const slots = openSlots(date);
  useEffect(() => {
    if (time && !slots.includes(time)) setTime("");
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = pricingFor(pkg);
  const entry = vehicle ? table[vehicle] : undefined;
  const price = entry !== undefined ? chargeable(entry) : null;

  // Store credit: all of it if it covers the price; otherwise leave at least
  // ₱100 for GCash (its minimum).
  const creditApplied =
    useCredit && price != null
      ? credit >= price
        ? price
        : Math.max(0, Math.min(credit, price - GCASH_MIN))
      : 0;
  const toPay = price != null ? Math.max(0, price - creditApplied) : null;

  const ready = shopAllowed && !!time && !!pkg && price != null && !!profile;

  const placeBooking = async () => {
    if (!ready || !shop || !profile || price == null || toPay == null || !pkg || !vehicle) return;
    if (!agreed) {
      setError("Please tick the box to confirm you understand bookings are non-refundable.");
      return;
    }
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const fullyCredit = toPay === 0;
    const ref = `ICW-${Date.now().toString(36).toUpperCase()}`;

    const { data, error: rpcError } = await supabase.rpc("create_customer_reservation", {
      p_customer_id: profile.id,
      p_shop_id: shop.id,
      p_shop_name: shop.shop_name,
      p_customer_name: profile.name,
      p_vehicle_type: vehicle,
      p_service_type: pkg,
      p_price: price,
      p_payment_method: fullyCredit ? "Store Credit" : "GCash",
      p_payment_status: fullyCredit ? "paid" : "unpaid",
      p_scheduled_date: date,
      p_scheduled_time: time,
      p_scheduled_at: slotIso(date, time),
      p_payment_reference: ref,
      p_voucher_amount: creditApplied,
    });

    if (rpcError) {
      setBusy(false);
      if (rpcError.message?.includes("NO_SLOT_AVAILABLE")) {
        setError("Another customer just booked this time. Please choose a different time.");
        loadBooked();
      } else {
        setError(/fetch|network/i.test(rpcError.message) ? "We couldn’t connect. Please check your internet and try again." : rpcError.message);
      }
      return;
    }

    const id = data?.[0]?.id as number;
    if (fullyCredit) {
      router.replace(`/account/payment-return?table=reservation&bookingId=${id}&status=success`);
      return;
    }

    // Pay the rest with GCash (PayMongo). The slot is held as unpaid until then.
    const pay = await startGcashPayment(supabase, {
      bookingId: id,
      amount: toPay,
      table: "reservation",
      returnUrl: `${window.location.origin}/account/payment-return?table=reservation`,
    });
    if (!pay.checkoutUrl) {
      await supabase.rpc("cancel_my_reservation", { p_reservation_id: id });
      setBusy(false);
      setError(`We couldn’t start the GCash payment: ${pay.error}`);
      return;
    }
    window.location.href = pay.checkoutUrl;
  };

  // ---------- Branch picker (no ?shop or a branch outside the town) ----------
  if (!shopId || (shop && area.status === "ok" && !shopAllowed)) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Book Now</h1>
          <p className="mt-1 text-ink-500">Choose a branch in your town.</p>
        </div>
        {shop && area.status === "ok" && !shopAllowed && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {shop.shop_name} is in {shop.city || shop.province || "another town"}. You can only book branches in{" "}
            {area.area.townLabel}, where you are right now.
          </p>
        )}
        <AreaBanner area={area} towns={towns} onRetry={locate} onChooseTown={chooseTown} />
        {branchesLoading || area.status === "checking" ? (
          <div className="h-24 animate-pulse rounded-2xl bg-white" />
        ) : area.status === "ok" && nearby.length === 0 ? (
          <EmptyCard icon={Store} title={`No I-CarWash branch in ${area.area.townLabel} yet`} text="Please check back soon." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {nearby.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setShopId(b.id)}
                className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 text-left shadow-card transition hover:border-brand-300"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Store size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink-950">{b.shop_name}</span>
                  <span className="block truncate text-sm text-ink-500">{[b.barangay, b.city, b.province].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- Booking form ----------
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="space-y-5">
        <div>
          <button type="button" onClick={() => setShopId(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900">
            <ArrowLeft size={15} /> Change branch
          </button>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink-950">{shop?.shop_name ?? "Book Now"}</h1>
          <p className="text-sm text-ink-500">{shop ? [shop.barangay, shop.city, shop.province].filter(Boolean).join(", ") : ""}</p>
        </div>

        <GetTheApp compact />

        {area.status !== "ok" && <AreaBanner area={area} towns={towns} onRetry={locate} onChooseTown={chooseTown} />}

        <Step n={1} title="Choose a date" done={!!date}>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => (
              <button
                key={d.iso}
                type="button"
                onClick={() => setDate(d.iso)}
                aria-pressed={date === d.iso}
                className={`flex min-w-[72px] flex-col items-center rounded-2xl border px-3 py-2.5 text-sm transition ${
                  date === d.iso ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"
                }`}
              >
                <span className="text-xs font-semibold opacity-80">{d.label}</span>
                <span className="font-bold">{d.day}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step n={2} title="Choose a time" done={!!time}>
          {slots.length === 0 ? (
            <p className="text-sm text-ink-500">No more slots today. Please pick another date.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {slots.map((s) => {
                const taken = booked.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={taken || checkingSlots}
                    onClick={() => setTime(s)}
                    aria-pressed={time === s}
                    className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${
                      taken
                        ? "cursor-not-allowed border-ink-100 bg-ink-50 text-ink-300"
                        : time === s
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"
                    }`}
                  >
                    <span className={taken ? "line-through" : ""}>{s}</span>
                    {taken && <span className="block text-[10px] font-bold">Booked</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Step>

        <Step n={3} title="Choose a package" done={!!pkg}>
          <div className="grid grid-cols-2 gap-3">
            {PACKAGES.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!time}
                onClick={() => {
                  setPkg(p);
                  setVehicle(null);
                }}
                aria-pressed={pkg === p}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition disabled:opacity-40 ${
                  pkg === p ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-brand-300"
                }`}
              >
                {p === "Premium Wash" ? <Sparkles size={20} className="text-brand-600" /> : <Droplets size={20} className="text-brand-600" />}
                <span className="font-bold text-ink-900">{p}</span>
              </button>
            ))}
          </div>
          {!time && <p className="mt-2 text-xs text-ink-400">Pick a time first.</p>}
        </Step>

        {pkg && (
          <Step n={4} title="Choose your vehicle" done={!!vehicle}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {VEHICLE_TYPES.filter((v) => table[v] !== undefined).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVehicle(v)}
                  aria-pressed={vehicle === v}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-sm transition ${
                    vehicle === v ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"
                  }`}
                >
                  <span className="font-semibold">{v}</span>
                  <span className="font-bold">{formatPriceEntry(table[v])}</span>
                </button>
              ))}
            </div>
          </Step>
        )}
      </div>

      {/* Summary + pay -- sticky on desktop */}
      <aside className="space-y-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-24">
        <h2 className="font-bold text-ink-950">Summary</h2>
        <dl className="space-y-2 text-sm">
          <Line k="Branch" v={shop?.shop_name ?? "—"} />
          <Line k="Date & time" v={time ? `${formatDay(date)} · ${time}` : "—"} />
          <Line k="Service" v={pkg ? `${pkg}${vehicle ? ` · ${vehicle}` : ""}` : "—"} />
          <Line k="Price" v={price != null ? peso(price) : "—"} />
          {creditApplied > 0 && <Line k="Store credit" v={`−${peso(creditApplied)}`} accent />}
        </dl>

        {credit > 0 && price != null && (
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
            <Wallet size={18} className="text-emerald-600" />
            <span className="flex-1 text-sm">
              <span className="block font-bold text-emerald-900">Use store credit</span>
              <span className="text-emerald-800">{peso(credit)} available</span>
            </span>
            <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="h-5 w-5 accent-emerald-600" />
          </label>
        )}
        {useCredit && creditApplied < Math.min(credit, price ?? 0) && (
          <p className="text-xs text-ink-500">GCash needs at least ₱100, so we used {peso(creditApplied)} of your credit.</p>
        )}

        <div className="flex items-end justify-between border-t border-ink-100 pt-4">
          <span className="text-sm font-semibold text-ink-500">{creditApplied > 0 ? "To pay" : "Total"}</span>
          <span className="font-display text-2xl font-bold text-ink-950">{toPay != null ? peso(toPay) : "—"}</span>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink-600">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
          I understand bookings are non-refundable. If I cancel or don’t check in within 15 minutes of my time,
          what I paid becomes store credit.
        </label>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button type="button" disabled={!ready || busy} onClick={placeBooking} className="btn-primary w-full disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {busy ? "Please wait…" : toPay === 0 ? "Book with store credit" : "Pay with GCash"}
        </button>
        {!ready && <p className="text-center text-xs text-ink-400">Fill in the steps on the left to continue.</p>}
      </aside>
    </div>
  );
}

function Line({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{k}</dt>
      <dd className={`text-right font-semibold ${accent ? "text-emerald-700" : "text-ink-900"}`}>{v}</dd>
    </div>
  );
}
