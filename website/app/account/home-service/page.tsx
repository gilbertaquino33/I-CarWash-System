"use client";

import { AreaBanner } from "@/components/account/AreaBanner";
import { GetTheApp } from "@/components/account/GetTheApp";
import { EmptyCard } from "@/components/account/ui";
import { useNearbyBranches } from "@/components/account/useNearbyBranches";
import {
  HOME_SERVICE_FEE,
  HS_SERVICE_TYPES,
  HS_VEHICLE_TYPES,
  formatDay,
  hsPrice,
  nextDays,
  openSlots,
  peso,
  slotIso,
  startGcashPayment,
  toPHMobile,
} from "@/lib/customer";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, Check, Loader2, MapPinHouse, ShieldCheck, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function Card({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-2.5 font-bold text-ink-950">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-brand-50 text-brand-700"}`}>
          {done ? <Check size={14} /> : n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const chip = (on: boolean) =>
  `rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${
    on ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"
  }`;

export default function HomeServicePage() {
  const { nearby, area, locate, chooseTown, towns, loading } = useNearbyBranches();
  const days = useMemo(() => nextDays(14), []);

  const [shopId, setShopId] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [date, setDate] = useState(days[0].iso);
  const [time, setTime] = useState("");
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [contact, setContact] = useState("");
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: p } = await supabase.from("profiles").select("full_name, mobile").eq("id", user.id).maybeSingle();
      setProfile({ id: user.id, name: p?.full_name ?? "Customer" });
      if (p?.mobile) setContact((c) => c || String(p.mobile).replace(/^\+63/, "0"));
    });
  }, []);

  // One branch in town -> pick it for the customer.
  useEffect(() => {
    if (nearby.length === 1 && !shopId) setShopId(nearby[0].id);
  }, [nearby, shopId]);

  // Prefill the town from the location.
  useEffect(() => {
    if (area.status === "ok" && !city && area.area.townLabel !== "your area") setCity(area.area.townLabel);
  }, [area, city]);

  const slots = openSlots(date);
  useEffect(() => {
    if (time && !slots.includes(time)) setTime("");
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const shop = nearby.find((b) => b.id === shopId) ?? null;
  const base = vehicle && service ? hsPrice(service, vehicle) : null;
  const total = base != null ? base + HOME_SERVICE_FEE : null;
  const addressOk = street.trim() && barangay.trim() && city.trim();
  const ready = !!shop && total != null && !!time && !!addressOk && !!profile;

  const submit = async () => {
    if (!ready || !shop || !profile || total == null || !vehicle || !service) return;
    const mobile = toPHMobile(contact);
    if (!mobile) {
      setError("Enter a valid Philippine mobile number so the shop can reach you, e.g. 0917 123 4567.");
      return;
    }
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const address = [street.trim(), `Brgy. ${barangay.trim()}`, city.trim(), province.trim()].filter(Boolean).join(", ");

    const { data: inserted, error: insertError } = await supabase
      .from("home_service")
      .insert({
        user_id: profile.id,
        shop_id: shop.id,
        shop_name: shop.shop_name,
        customer_name: profile.name,
        contact_number: mobile,
        address,
        vehicle_type: vehicle,
        service_type: service,
        status: "Waiting",
        scheduled_date: date,
        scheduled_time: time,
        scheduled_at: slotIso(date, time),
        payment_method: "GCash",
        payment_status: "Unpaid",
        price: total,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setBusy(false);
      setError(insertError?.message ?? "We couldn’t save your booking. Please try again.");
      return;
    }

    const pay = await startGcashPayment(supabase, {
      bookingId: inserted.id,
      amount: total,
      table: "home_service",
      returnUrl: `${window.location.origin}/account/payment-return?table=home_service`,
    });
    if (!pay.checkoutUrl) {
      setBusy(false);
      setError(`Your booking was saved, but GCash didn’t open (${pay.error}). You can pay for it from My Bookings.`);
      return;
    }
    window.location.href = pay.checkoutUrl;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Home Service</h1>
          <p className="mt-1 text-ink-500">We come to you. A {peso(HOME_SERVICE_FEE)} home-service fee is added automatically.</p>
        </div>

        <GetTheApp compact />

        <AreaBanner area={area} towns={towns} onRetry={locate} onChooseTown={chooseTown} />

        <Card n={1} title="Branch" done={!!shop}>
          {loading || area.status === "checking" ? (
            <div className="h-16 animate-pulse rounded-2xl bg-ink-50" />
          ) : area.status !== "ok" ? (
            <p className="text-sm text-ink-500">Tell us where you are first (above).</p>
          ) : nearby.length === 0 ? (
            <EmptyCard icon={Store} title={`No I-CarWash branch in ${area.area.townLabel} yet`} text="Home service isn’t available where you are yet." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {nearby.map((b) => (
                <button key={b.id} type="button" onClick={() => setShopId(b.id)} aria-pressed={shopId === b.id} className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${shopId === b.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-brand-300"}`}>
                  <Store size={18} className="text-brand-600" />
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink-900">{b.shop_name}</span>
                    <span className="block truncate text-xs text-ink-500">{[b.barangay, b.city].filter(Boolean).join(", ")}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card n={2} title="Vehicle and service" done={base != null}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Vehicle</p>
          <div className="flex flex-wrap gap-2">
            {HS_VEHICLE_TYPES.map((v) => (
              <button key={v} type="button" onClick={() => setVehicle(v)} aria-pressed={vehicle === v} className={chip(vehicle === v)}>
                {v}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-400">Service</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {HS_SERVICE_TYPES.map((s) => {
              const p = vehicle ? hsPrice(s, vehicle) : null;
              const off = !!vehicle && p == null;
              return (
                <button key={s} type="button" disabled={!vehicle || off} onClick={() => setService(s)} aria-pressed={service === s} className={`rounded-2xl border p-3.5 text-left transition disabled:opacity-40 ${service === s ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-brand-300"}`}>
                  <span className="block text-sm font-bold text-ink-900">{s}</span>
                  <span className="text-sm text-ink-500">{!vehicle ? "Pick a vehicle" : off ? "Not offered" : peso(p)}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card n={3} title="Date and time" done={!!time}>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => (
              <button key={d.iso} type="button" onClick={() => setDate(d.iso)} aria-pressed={date === d.iso} className={`flex min-w-[72px] flex-col items-center rounded-2xl border px-3 py-2.5 text-sm transition ${date === d.iso ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"}`}>
                <span className="text-xs font-semibold opacity-80">{d.label}</span>
                <span className="font-bold">{d.day}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {slots.length === 0 ? (
              <p className="col-span-full text-sm text-ink-500">No more slots today. Please pick another date.</p>
            ) : (
              slots.map((s) => (
                <button key={s} type="button" onClick={() => setTime(s)} aria-pressed={time === s} className={chip(time === s)}>
                  {s}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card n={4} title="Where should we go?" done={!!addressOk}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">House no. / Street / Landmark</label>
              <input className="field" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="e.g. 123 Rizal St., near the chapel" />
            </div>
            <div>
              <label className="label">Barangay</label>
              <input className="field" value={barangay} onChange={(e) => setBarangay(e.target.value)} placeholder="e.g. Poblacion" />
            </div>
            <div>
              <label className="label">City / Municipality</label>
              <input className="field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Nasugbu" />
            </div>
            <div>
              <label className="label">Province</label>
              <input className="field" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="e.g. Batangas" />
            </div>
            <div>
              <label className="label">Contact number</label>
              <input type="tel" className="field" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="0917 123 4567" />
            </div>
          </div>
        </Card>
      </div>

      <aside className="space-y-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-24">
        <h2 className="flex items-center gap-2 font-bold text-ink-950">
          <MapPinHouse size={18} className="text-brand-600" /> Summary
        </h2>
        <dl className="space-y-2 text-sm">
          <L k="Branch" v={shop?.shop_name ?? "—"} />
          <L k="Service" v={service && vehicle ? `${service} · ${vehicle}` : "—"} />
          <L k="When" v={time ? `${formatDay(date)} · ${time}` : "—"} />
          <L k="Wash" v={base != null ? peso(base) : "—"} />
          <L k="Home-service fee" v={peso(HOME_SERVICE_FEE)} />
        </dl>
        <div className="flex items-end justify-between border-t border-ink-100 pt-4">
          <span className="text-sm font-semibold text-ink-500">Total</span>
          <span className="font-display text-2xl font-bold text-ink-950">{total != null ? peso(total) : "—"}</span>
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        <button type="button" disabled={!ready || busy} onClick={submit} className="btn-primary w-full disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {busy ? "Please wait…" : "Pay with GCash"}
        </button>
        {!ready && <p className="text-center text-xs text-ink-400">Fill in the steps on the left to continue.</p>}
      </aside>
    </div>
  );
}

function L({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-right font-semibold text-ink-900">{v}</dd>
    </div>
  );
}
