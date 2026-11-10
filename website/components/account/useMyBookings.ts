"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Booking {
  id: number;
  kind: "reservation" | "home_service";
  shop_id: number | null;
  shop_name: string | null;
  vehicle_type: string | null;
  service_type: string | null;
  status: string;
  price: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_at: string | null;
  created_at: string;
  arrived_at: string | null;
  completed_at: string | null;
  paid_at: string | null;
  payment_status: string | null; // lowercase: 'paid' | 'unpaid'
  payment_method: string | null;
  payment_reference: string | null;
  qr_token: string | null;
  address: string | null;
  addon_amount: number;
  credit_applied: number; // store credit used on this booking
  addon_paid_at: string | null;
  upgraded_from: string | null;
}

export interface CreditTxn {
  amount: number;
  reason: string;
  created_at: string;
}

// The customer's bookings (shop + home service) and store credit, kept live
// with realtime -- same data as the app's History screen.
export function useMyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [credit, setCredit] = useState(0);
  const [creditTxns, setCreditTxns] = useState<CreditTxn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const base =
      "id, shop_id, shop_name, vehicle_type, service_type, status, price, scheduled_date, scheduled_time, scheduled_at, created_at, arrived_at, completed_at, paid_at, payment_method, payment_status, payment_reference, qr_token, voucher_applied";
    const fetchRes = (cols: string) =>
      supabase.from("reservation").select(cols).eq("customer_id", user.id).order("created_at", { ascending: false }).limit(200);

    let resRes = await fetchRes(`${base}, addon_amount, addon_paid_at, upgraded_from`);
    if (resRes.error?.code === "42703") resRes = await fetchRes(base);

    const [hsRes, creditRes, txnRes] = await Promise.all([
      supabase
        .from("home_service")
        .select("id, shop_id, shop_name, vehicle_type, service_type, status, price, scheduled_date, scheduled_time, created_at, address, payment_method, payment_status, paid_at, paymongo_payment_id, paymongo_source_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("customer_voucher").select("balance").eq("customer_id", user.id).maybeSingle(),
      supabase.from("voucher_transaction").select("amount, reason, created_at").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);

    const reservations: Booking[] = ((resRes.data ?? []) as any[]).map((r) => ({
      ...r,
      kind: "reservation" as const,
      address: null,
      payment_status: r.payment_status ? String(r.payment_status).toLowerCase() : null,
      addon_amount: Number(r.addon_amount ?? 0),
      credit_applied: Number(r.voucher_applied ?? 0),
      addon_paid_at: r.addon_paid_at ?? null,
      upgraded_from: r.upgraded_from ?? null,
    }));
    const homeServices: Booking[] = ((hsRes.data ?? []) as any[]).map((h) => ({
      id: h.id,
      kind: "home_service" as const,
      shop_id: h.shop_id ?? null,
      shop_name: h.shop_name,
      vehicle_type: h.vehicle_type,
      service_type: h.service_type,
      status: h.status,
      price: h.price,
      scheduled_date: h.scheduled_date,
      scheduled_time: h.scheduled_time ?? null,
      scheduled_at: null,
      created_at: h.created_at,
      arrived_at: null,
      completed_at: null,
      paid_at: h.paid_at ?? null,
      payment_status: h.payment_status ? String(h.payment_status).toLowerCase() : null,
      payment_method: h.payment_method ?? null,
      payment_reference: h.paymongo_payment_id ?? h.paymongo_source_id ?? null,
      qr_token: null,
      address: h.address,
      addon_amount: 0,
      credit_applied: 0,
      addon_paid_at: null,
      upgraded_from: null,
    }));

    setBookings(
      [...reservations, ...homeServices].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    );
    setCredit(Number(creditRes.data?.balance ?? 0));
    setCreditTxns(((txnRes.data ?? []) as CreditTxn[]).map((t) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    // Same catch-up as the app: void no-shows first so they show as Cancelled.
    supabase.rpc("sweep_no_show_reservations").then(() => load(), () => load());
    const channel = supabase
      .channel(`web-customer-bookings-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservation" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "home_service" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { bookings, credit, creditTxns, loading, reload: load };
}
