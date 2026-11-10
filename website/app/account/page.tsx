"use client";

import { AreaBanner } from "@/components/account/AreaBanner";
import { GetTheApp } from "@/components/account/GetTheApp";
import { EmptyCard, Modal, QrTicket, StatusBadge, checkInDeadline } from "@/components/account/ui";
import { useMyBookings } from "@/components/account/useMyBookings";
import { useNearbyBranches } from "@/components/account/useNearbyBranches";
import { formatDay, isCancelled, localDateKey, peso } from "@/lib/customer";
import { ArrowRight, CalendarPlus, ChevronRight, MapPinHouse, QrCode, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function AccountHome() {
  const { bookings, credit, loading } = useMyBookings();
  const { nearby, loading: branchesLoading, area, locate, chooseTown, towns } = useNearbyBranches();
  const [qrOpen, setQrOpen] = useState(false);

  // Next shop booking that still needs the customer to show up (same as the
  // app's "Your Next Booking").
  const next = useMemo(() => {
    const today = localDateKey();
    return bookings
      .filter(
        (b) =>
          b.kind === "reservation" &&
          b.status === "Waiting" &&
          !b.arrived_at &&
          !isCancelled(b.status) &&
          (b.scheduled_date ?? "") >= today
      )
      .sort((a, b) => +new Date(a.scheduled_at ?? a.created_at) - +new Date(b.scheduled_at ?? b.created_at))[0];
  }, [bookings]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-glow sm:p-8">
        <p className="text-sm font-medium text-white/70">{greeting()}</p>
        <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">Ready for a clean car?</h1>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/account/book" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50">
            <CalendarPlus size={16} /> Book Now
          </Link>
          <Link href="/account/home-service" className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/25">
            <MapPinHouse size={16} /> Home Service
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        {/* Next booking */}
        <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink-950">Your next booking</h2>
            <Link href="/account/bookings" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              All bookings
            </Link>
          </div>
          {loading ? (
            <div className="mt-4 h-24 animate-pulse rounded-2xl bg-ink-50" />
          ) : next ? (
            <div className="mt-4 rounded-2xl bg-ink-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-ink-950">{next.shop_name}</p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {next.service_type} · {next.vehicle_type}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink-800">
                    {formatDay(next.scheduled_date)} · {next.scheduled_time}
                  </p>
                  {checkInDeadline(next.scheduled_at) && (
                    <p className="mt-1 text-xs text-amber-700">Check in by {checkInDeadline(next.scheduled_at)}</p>
                  )}
                </div>
                <StatusBadge status={next.status} />
              </div>
              {next.qr_token && next.payment_status === "paid" ? (
                <button type="button" onClick={() => setQrOpen(true)} className="btn-primary mt-4 w-full">
                  <QrCode size={16} /> Show my QR code
                </button>
              ) : (
                <Link href="/account/bookings" className="btn-outline mt-4 w-full">
                  Finish payment <ArrowRight size={15} />
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyCard icon={CalendarPlus} title="No upcoming booking" text="Book a slot at a shop near you — it only takes a minute." />
            </div>
          )}
        </section>

        {/* Store credit */}
        <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet size={19} />
            </span>
            <h2 className="font-bold text-ink-950">Store credit</h2>
          </div>
          <p className="mt-4 font-display text-3xl font-bold text-ink-950">{loading ? "…" : peso(credit)}</p>
          <p className="mt-1.5 text-sm text-ink-500">
            {credit > 0
              ? "Applied automatically"
              : "A paid booking you cancel or miss comes back here as credit."}
          </p>
        </section>
      </div>

      <GetTheApp />

      {/* Branches in the customer's town */}
      <section className="space-y-3">
        <h2 className="font-bold text-ink-950">Car wash branches near you</h2>
        <AreaBanner area={area} towns={towns} onRetry={locate} onChooseTown={chooseTown} />
        {branchesLoading || area.status === "checking" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : area.status === "ok" && nearby.length === 0 ? (
          <EmptyCard icon={Store} title={`No I-CarWash branch in ${area.area.townLabel} yet`} text="Please check back soon — new branches are added all the time." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {nearby.map((b) => (
              <Link
                key={b.id}
                href={`/account/book?shop=${b.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Store size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink-950">{b.shop_name}</span>
                  <span className="block truncate text-sm text-ink-500">
                    {[b.barangay, b.city, b.province].filter(Boolean).join(", ")}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-bold text-brand-600">
                  Book <ChevronRight size={16} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Modal open={qrOpen && !!next?.qr_token} onClose={() => setQrOpen(false)} labelledBy="qr-title">
        {next?.qr_token && (
          <QrTicket
            token={next.qr_token}
            shopName={next.shop_name}
            service={next.service_type}
            vehicle={next.vehicle_type}
            date={next.scheduled_date}
            time={next.scheduled_time}
            scheduledAt={next.scheduled_at}
          />
        )}
      </Modal>
    </div>
  );
}
