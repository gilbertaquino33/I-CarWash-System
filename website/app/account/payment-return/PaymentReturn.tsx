"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDay, peso } from "@/lib/customer";
import { QrTicket } from "@/components/account/ui";

type Stage = "checking" | "paid" | "failed";

// After GCash (PayMongo) sends the customer back -- or straight after a
// booking paid fully with store credit. Confirms the payment the same way the
// app does (DB status, then verify-gcash-payment as a fallback), then shows
// the receipt + QR. An unpaid shop booking is cancelled so the slot frees up.
export function PaymentReturn() {
  const params = useSearchParams();
  const table = params.get("table") === "reservation" ? "reservation" : "home_service";
  const bookingId = Number(params.get("bookingId"));
  const returned = params.get("status");
  const [stage, setStage] = useState<Stage>("checking");
  const [row, setRow] = useState<any>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !bookingId) return;
    started.current = true;
    const supabase = createClient();

    const fetchRow = async () => {
      const { data } =
        table === "reservation"
          ? await supabase
              .from("reservation")
              .select("id, shop_id, shop_name, service_type, vehicle_type, scheduled_date, scheduled_time, scheduled_at, price, voucher_applied, payment_status, payment_method, payment_reference, qr_token, status")
              .eq("id", bookingId)
              .maybeSingle()
          : await supabase
              .from("home_service")
              .select("id, shop_name, service_type, vehicle_type, scheduled_date, scheduled_time, price, payment_status, payment_method, paymongo_payment_id, address, status")
              .eq("id", bookingId)
              .maybeSingle();
      return data as any;
    };
    const isPaid = (r: any) => String(r?.payment_status ?? "").toLowerCase() === "paid";

    (async () => {
      let r = await fetchRow();
      // Poll ~15 s: the PayMongo webhook usually lands within a few seconds.
      for (let i = 0; i < 10 && !isPaid(r) && returned !== "failed"; i++) {
        const { data: v } = await supabase.functions.invoke("verify-gcash-payment", {
          body: table === "reservation" ? { bookingId, table: "reservation" } : { bookingId },
        });
        if (v?.paymentStatus === "Paid") {
          r = await fetchRow();
          if (!isPaid(r)) r = { ...r, payment_status: "paid" };
          break;
        }
        await new Promise((res) => setTimeout(res, 1500));
        r = await fetchRow();
      }

      setRow(r);
      if (isPaid(r)) {
        setStage("paid");
        // Confirmation email -- once per booking.
        const key = `icw-confirm-${table}-${bookingId}`;
        if (table === "reservation" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const { data: p } = await supabase
            .from("profiles")
            .select("full_name, email_address, mobile")
            .eq("id", user?.id ?? "")
            .maybeSingle();
          supabase.functions
            .invoke("send-reservation-confirmation", {
              body: {
                email: p?.email_address ?? null,
                mobile: p?.mobile ?? null,
                customerName: p?.full_name ?? "Customer",
                shopName: r.shop_name,
                packageName: r.service_type,
                vehicleType: r.vehicle_type,
                scheduledDateLabel: formatDay(r.scheduled_date),
                scheduledTime: r.scheduled_time,
                refNumber: r.payment_reference,
                servicePrice: peso(r.price),
                voucherApplied: Number(r.voucher_applied ?? 0),
                amountPaid: Math.max(0, Number(r.price ?? 0) - Number(r.voucher_applied ?? 0)),
                paymentMethod: r.payment_method,
              },
            })
            .catch(() => {});
        }
      } else {
        // Not paid: free the shop slot (same as the app). A home-service
        // booking stays so the customer can pay again from My Bookings.
        if (table === "reservation" && r && r.status === "Waiting") {
          await supabase.rpc("cancel_my_reservation", { p_reservation_id: bookingId });
        }
        setStage("failed");
      }
    })();
  }, [bookingId, table, returned]);

  if (stage === "checking") {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <Loader2 size={32} className="mx-auto animate-spin text-brand-500" />
        <h1 className="mt-4 text-lg font-bold text-ink-950">Confirming your payment…</h1>
        <p className="mt-1 text-sm text-ink-500">This takes a few seconds. Please don’t close this page.</p>
      </div>
    );
  }

  if (stage === "failed") {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <XCircle size={40} className="mx-auto text-red-500" />
        <h1 className="mt-4 text-lg font-bold text-ink-950">Payment not completed</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {table === "reservation"
            ? "Your GCash payment was cancelled or didn’t go through, so the time slot was released. You weren’t charged."
            : "Your GCash payment was cancelled or didn’t go through. Your home-service booking is saved — you can pay for it from My Bookings."}
        </p>
        <div className="mt-6 grid gap-2">
          <Link href={table === "reservation" ? `/account/book${row?.shop_id ? `?shop=${row.shop_id}` : ""}` : "/account/bookings"} className="btn-primary w-full">
            {table === "reservation" ? "Try again" : "Go to My Bookings"}
          </Link>
          <Link href="/account" className="btn-outline w-full">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const credit = Number(row?.voucher_applied ?? 0);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-3xl border border-ink-100 bg-white p-6 text-center shadow-card">
        <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
        <h1 className="mt-3 text-lg font-bold text-ink-950">
          {table === "reservation" ? "You’re booked!" : "Home service booked!"}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {table === "reservation" ? "We emailed you a copy. Show the QR code below when you arrive." : "The shop will contact you before they head over."}
        </p>
        <dl className="mt-5 space-y-1.5 rounded-2xl bg-ink-50 p-4 text-left text-sm">
          <R k="Paid" v={peso(Math.max(0, Number(row?.price ?? 0) - credit))} />
          {credit > 0 && <R k="Store credit used" v={peso(credit)} />}
          <R k="Payment" v={row?.payment_method ?? "—"} />
          <R k="Reference" v={row?.payment_reference ?? row?.paymongo_payment_id ?? "—"} />
          {row?.address && <R k="Address" v={row.address} />}
        </dl>
      </div>
      {table === "reservation" && row?.qr_token && (
        <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
          <QrTicket
            token={row.qr_token}
            shopName={row.shop_name}
            service={row.service_type}
            vehicle={row.vehicle_type}
            date={row.scheduled_date}
            time={row.scheduled_time}
            scheduledAt={row.scheduled_at}
          />
        </div>
      )}
      <Link href="/account/bookings" className="btn-primary w-full">
        Go to My Bookings
      </Link>
    </div>
  );
}

function R({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-right font-semibold text-ink-900">{v}</dd>
    </div>
  );
}
