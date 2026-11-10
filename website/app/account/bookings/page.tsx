"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpCircle,
  CalendarPlus,
  CircleX,
  ClipboardList,
  CreditCard,
  Loader2,
  MapPinHouse,
  QrCode,
  Store,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDay, isBasicWash, isCancelled, peso, premiumUpgradeCost, startGcashPayment } from "@/lib/customer";
import { useMyBookings, type Booking } from "@/components/account/useMyBookings";
import { EmptyCard, Modal, PaymentBadge, QrTicket, StatusBadge, checkInDeadline } from "@/components/account/ui";

const FILTERS = ["Upcoming", "Ongoing", "Completed", "Cancelled", "All"] as const;
type Filter = (typeof FILTERS)[number];

const isActive = (s: string) => s === "Waiting" || s === "Washing" || s === "On the Way";
const isOngoing = (b: Booking) =>
  !isCancelled(b.status) && b.status !== "Completed" && (!!b.arrived_at || b.status === "Washing" || b.status === "On the Way");

const REASONS: Record<string, string> = {
  reservation_voided: "Missed booking returned",
  reservation_cancelled: "Cancelled booking returned",
  reservation_redeemed: "Used on a booking",
  reservation_reinstated: "Booking restored",
};

export default function BookingsPage() {
  const { bookings, credit, creditTxns, loading, reload } = useMyBookings();
  const [filter, setFilter] = useState<Filter>("Upcoming");
  const [qr, setQr] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [upgradeTarget, setUpgradeTarget] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; text: string; ok: boolean } | null>(null);

  const list = useMemo(
    () =>
      bookings.filter((b) => {
        if (filter === "All") return true;
        if (filter === "Upcoming") return isActive(b.status) && !isOngoing(b);
        if (filter === "Ongoing") return isOngoing(b);
        if (filter === "Completed") return b.status === "Completed";
        return isCancelled(b.status);
      }),
    [bookings, filter]
  );

  const canCancel = (b: Booking) => b.kind === "reservation" && b.status === "Waiting" && !b.arrived_at;
  const upgradeCost = (b: Booking) =>
    b.kind === "reservation" && (b.status === "Waiting" || b.status === "Washing") && isBasicWash(b.service_type)
      ? premiumUpgradeCost(b.vehicle_type)
      : null;

  const doCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("cancel_my_reservation", { p_reservation_id: cancelTarget.id });
    setBusy(false);
    setCancelTarget(null);
    if (error) {
      setNotice({ title: "Couldn’t cancel", text: "Something went wrong. Please check your internet and try again.", ok: false });
      return;
    }
    const credited = Number(data?.[0]?.credited ?? 0);
    setNotice({
      title: "Booking cancelled",
      text: credited > 0 ? `${peso(credited)} was added to your store credit. Use it on your next booking.` : "Your booking was cancelled.",
      ok: true,
    });
    reload();
  };

  const doUpgrade = async () => {
    if (!upgradeTarget) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("upgrade_my_reservation_to_premium", { p_reservation_id: upgradeTarget.id });
    setBusy(false);
    setUpgradeTarget(null);
    if (error) {
      const m = error.message;
      setNotice({
        title: "Couldn’t upgrade",
        text: m.includes("ALREADY_FINISHED")
          ? "Your wash is already finished, so it can no longer be upgraded."
          : m.includes("NOT_BASIC_WASH")
            ? "This booking is already Premium Wash."
            : m.includes("NO_PREMIUM_FOR_VEHICLE")
              ? "Premium Wash isn’t available for this vehicle. Please ask the staff at the shop."
              : "Something went wrong. Please check your internet and try again.",
        ok: false,
      });
      return;
    }
    setNotice({
      title: "Upgraded to Premium Wash",
      text: `Pay the extra ${peso(Number(data?.[0]?.added ?? 0))} at the shop. The staff will mark it as collected.`,
      ok: true,
    });
    reload();
  };

  // Pay an unpaid booking with GCash (a shop booking held for payment, or a
  // home service that wasn't paid yet).
  const payNow = async (b: Booking) => {
    setBusy(true);
    const supabase = createClient();
    const table = b.kind === "reservation" ? "reservation" : "home_service";
    const amount = Math.max(0, Number(b.price ?? 0) - b.credit_applied);
    const { data: v } = await supabase.functions.invoke("verify-gcash-payment", {
      body: table === "reservation" ? { bookingId: b.id, table } : { bookingId: b.id },
    });
    if (v?.paymentStatus === "Paid") {
      window.location.href = `/account/payment-return?table=${table}&bookingId=${b.id}&status=success`;
      return;
    }
    const pay = await startGcashPayment(supabase, {
      bookingId: b.id,
      amount,
      table,
      returnUrl: `${window.location.origin}/account/payment-return?table=${table}`,
    });
    if (!pay.checkoutUrl) {
      setBusy(false);
      setNotice({ title: "Couldn’t open GCash", text: pay.error ?? "Please try again in a moment.", ok: false });
      return;
    }
    window.location.href = pay.checkoutUrl;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">My Bookings</h1>
          <p className="mt-1 text-ink-500">Shop bookings and home services — updated live.</p>
        </div>
        <Link href="/account/book" className="btn-primary">
          <CalendarPlus size={16} /> Book
        </Link>
      </div>

      {/* Store credit */}
      <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Wallet size={19} />
          </span>
          <div className="flex-1">
            <p className="text-sm text-ink-500">Store credit</p>
            <p className="font-display text-xl font-bold text-ink-950">{peso(credit)}</p>
          </div>
        </div>
        {creditTxns.length > 0 && (
          <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100 text-sm">
            {creditTxns.slice(0, 4).map((t, i) => (
              <li key={i} className="flex justify-between py-2">
                <span className="text-ink-600">
                  {REASONS[t.reason] ?? "Store credit"} · <span className="text-ink-400">{new Date(t.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
                </span>
                <span className={`font-bold ${t.amount < 0 ? "text-ink-700" : "text-emerald-700"}`}>
                  {t.amount < 0 ? "−" : "+"}
                  {peso(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div role="tablist" aria-label="Filter bookings" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f ? "bg-ink-950 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyCard
          icon={ClipboardList}
          title={`No ${filter.toLowerCase()} bookings`}
          text={filter === "Upcoming" ? "Book a slot and it’ll show up here with your QR code." : "Nothing here yet."}
          action={
            filter === "Upcoming" ? (
              <Link href="/account/book" className="btn-primary">
                Book
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((b) => {
            const unpaid = b.payment_status !== "paid";
            const cost = upgradeCost(b);
            const deadline = b.kind === "reservation" && b.status === "Waiting" && !b.arrived_at ? checkInDeadline(b.scheduled_at) : null;
            return (
              <li key={`${b.kind}-${b.id}`} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      {b.kind === "reservation" ? <Store size={18} /> : <MapPinHouse size={18} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink-950">{b.shop_name}</p>
                      <p className="text-sm text-ink-500">
                        {b.kind === "reservation" ? "Shop booking" : "Home service"} · {b.service_type} · {b.vehicle_type}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink-800">
                        {formatDay(b.scheduled_date)}
                        {b.scheduled_time ? ` · ${b.scheduled_time}` : ""} · {peso(b.price)}
                      </p>
                      {b.address && <p className="mt-0.5 truncate text-xs text-ink-500">{b.address}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={b.status} />
                    {!isCancelled(b.status) && <PaymentBadge status={b.payment_status} />}
                  </div>
                </div>

                {deadline && !unpaid && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Check in by {deadline}, or it’s cancelled automatically.
                  </p>
                )}
                {b.addon_amount > 0 && !isCancelled(b.status) && (
                  <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${b.addon_paid_at ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    Upgraded to Premium — {b.addon_paid_at ? `extra ${peso(b.addon_amount)} paid.` : `pay the extra ${peso(b.addon_amount)} at the shop.`}
                  </p>
                )}
                {b.kind === "reservation" && isCancelled(b.status) && !b.arrived_at && b.payment_status === "paid" && (
                  <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    What you paid was returned as store credit.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {b.kind === "reservation" && b.qr_token && !unpaid && b.status === "Waiting" && !b.arrived_at && (
                    <button type="button" onClick={() => setQr(b)} className="btn-primary h-10 py-0">
                      <QrCode size={15} /> Show QR
                    </button>
                  )}
                  {unpaid && isActive(b.status) && (
                    <button type="button" disabled={busy} onClick={() => payNow(b)} className="btn-primary h-10 py-0 disabled:opacity-50">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Pay with GCash
                    </button>
                  )}
                  {cost != null && cost > 0 && !b.upgraded_from && (
                    <button type="button" onClick={() => setUpgradeTarget(b)} className="btn-outline h-10 py-0">
                      <ArrowUpCircle size={15} /> Upgrade to Premium (+{peso(cost)})
                    </button>
                  )}
                  {canCancel(b) && (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(b)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      <CircleX size={15} /> Cancel booking
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!qr} onClose={() => setQr(null)} labelledBy="qr-title">
        {qr?.qr_token && (
          <QrTicket token={qr.qr_token} shopName={qr.shop_name} service={qr.service_type} vehicle={qr.vehicle_type} date={qr.scheduled_date} time={qr.scheduled_time} scheduledAt={qr.scheduled_at} />
        )}
      </Modal>

      <Modal open={!!cancelTarget} onClose={() => !busy && setCancelTarget(null)} labelledBy="cancel-title">
        <h2 id="cancel-title" className="pr-8 text-lg font-bold text-ink-950">
          Cancel this booking?
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          {cancelTarget?.shop_name} · {formatDay(cancelTarget?.scheduled_date)} · {cancelTarget?.scheduled_time}
        </p>
        <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">
          {cancelTarget?.payment_status === "paid"
            ? `Bookings are non-refundable — the ${peso(cancelTarget?.price)} you paid becomes store credit you can use on your next booking.`
            : "This booking isn’t paid yet, so nothing is charged."}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setCancelTarget(null)} disabled={busy} className="btn-outline">
            Keep booking
          </button>
          <button type="button" onClick={doCancel} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />} Yes, cancel
          </button>
        </div>
      </Modal>

      <Modal open={!!upgradeTarget} onClose={() => !busy && setUpgradeTarget(null)} labelledBy="up-title">
        <h2 id="up-title" className="pr-8 text-lg font-bold text-ink-950">
          Upgrade to Premium Wash?
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          Your {upgradeTarget?.vehicle_type} gets the Premium Wash instead of Basic. Pay the extra{" "}
          <b>{peso(upgradeCost(upgradeTarget ?? ({} as Booking)))}</b> at the shop.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          You can’t switch back to Basic after upgrading.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setUpgradeTarget(null)} disabled={busy} className="btn-outline">
            Not now
          </button>
          <button type="button" onClick={doUpgrade} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />} Upgrade
          </button>
        </div>
      </Modal>

      <Modal open={!!notice} onClose={() => setNotice(null)} labelledBy="notice-title">
        <h2 id="notice-title" className={`pr-8 text-lg font-bold ${notice?.ok ? "text-ink-950" : "text-red-700"}`}>
          {notice?.title}
        </h2>
        <p className="mt-2 text-sm text-ink-600">{notice?.text}</p>
        <button type="button" onClick={() => setNotice(null)} className="btn-primary mt-5 w-full">
          OK
        </button>
      </Modal>
    </div>
  );
}
