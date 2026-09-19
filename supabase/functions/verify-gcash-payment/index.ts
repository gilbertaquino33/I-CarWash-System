// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Self-healing na pagkumpirma ng bayad. HINDI ito umaasa sa webhook.
//
// Ang webhook (`paymongo-webhook`) pa rin ang pangunahing paraan para
// maging "Paid" ang booking, pero kapag hindi ito dumating -- hindi
// naka-register ang webhook, mali ang signing secret, o na-timeout lang --
// ang booking ay nananatiling "Unpaid" kahit bayad na talaga ang customer.
// Tinatanong ng function na ito ang PayMongo mismo kung ano ang totoong
// kalagayan ng source, at kung "chargeable" na ito ay siya na mismo ang
// gagawa ng Payment (ito talaga ang huling hakbang na kadalasang ginagawa
// ng webhook sa `source.chargeable`).
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { bookingId } = await req.json();
    if (!bookingId) return jsonResponse({ error: "bookingId is required" }, 400);
    if (!PAYMONGO_SECRET_KEY) {
      return jsonResponse({ error: "PAYMONGO_SECRET_KEY is not configured" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: booking, error: bookingError } = await supabase
      .from("home_service")
      .select("id, price, payment_status, paymongo_source_id, paymongo_payment_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return jsonResponse({ error: "Booking not found", details: bookingError?.message }, 404);
    }
    if (booking.payment_status === "Paid") {
      return jsonResponse({ paymentStatus: "Paid", via: "database" });
    }
    if (!booking.paymongo_source_id) {
      return jsonResponse({
        paymentStatus: booking.payment_status ?? "Unpaid",
        reason: "no_source",
      });
    }

    const authHeader = `Basic ${btoa(`${PAYMONGO_SECRET_KEY}:`)}`;

    const srcRes = await fetch(
      `https://api.paymongo.com/v1/sources/${booking.paymongo_source_id}`,
      { headers: { Authorization: authHeader } }
    );
    const srcJson = await srcRes.json();
    if (!srcRes.ok) {
      console.error("PayMongo source lookup failed", srcRes.status, JSON.stringify(srcJson));
      return jsonResponse({
        paymentStatus: booking.payment_status ?? "Unpaid",
        reason: "source_lookup_failed",
        detail: srcJson?.errors?.[0]?.detail ?? `HTTP ${srcRes.status}`,
      });
    }

    const sourceStatus = srcJson?.data?.attributes?.status ?? "unknown";
    const amount = srcJson?.data?.attributes?.amount;

    const markPaid = async (paymentId: string | null) => {
      await supabase
        .from("home_service")
        .update({
          payment_status: "Paid",
          ...(paymentId ? { paymongo_payment_id: paymentId } : {}),
        })
        .eq("id", booking.id);
    };

    // "chargeable" = inaprubahan na ng customer sa GCash pero wala pang
    // Payment na nagawa. Tayo na ang gagawa nito.
    if (sourceStatus === "chargeable") {
      const payRes = await fetch("https://api.paymongo.com/v1/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          data: {
            attributes: {
              amount,
              currency: "PHP",
              source: { id: booking.paymongo_source_id, type: "source" },
              description: `I-CarWash home service booking #${booking.id}`,
            },
          },
        }),
      });
      const payJson = await payRes.json();
      if (!payRes.ok) {
        console.error("PayMongo payment creation failed", payRes.status, JSON.stringify(payJson));
        return jsonResponse({
          paymentStatus: "Unpaid",
          sourceStatus,
          reason: "payment_creation_failed",
          detail: payJson?.errors?.[0]?.detail ?? `HTTP ${payRes.status}`,
        });
      }

      const paymentStatus = payJson?.data?.attributes?.status;
      if (paymentStatus === "paid") {
        await markPaid(payJson.data.id);
        return jsonResponse({ paymentStatus: "Paid", sourceStatus, via: "charged_now" });
      }
      return jsonResponse({
        paymentStatus: "Unpaid",
        sourceStatus,
        reason: "payment_not_paid",
        detail: paymentStatus,
      });
    }

    // "consumed" = may Payment nang nagawa mula sa source na ito (malamang
    // ng webhook, o ng naunang tawag dito). Hanapin natin ito para makumpirma.
    if (sourceStatus === "consumed") {
      const listRes = await fetch("https://api.paymongo.com/v1/payments?limit=100", {
        headers: { Authorization: authHeader },
      });
      const listJson = await listRes.json();
      const match = Array.isArray(listJson?.data)
        ? listJson.data.find(
            (p: any) => p?.attributes?.source?.id === booking.paymongo_source_id
          )
        : null;

      if (match?.attributes?.status === "paid") {
        await markPaid(match.id);
        return jsonResponse({ paymentStatus: "Paid", sourceStatus, via: "payment_lookup" });
      }
      return jsonResponse({
        paymentStatus: "Unpaid",
        sourceStatus,
        reason: match ? "payment_not_paid" : "payment_not_found",
        detail: match?.attributes?.status ?? null,
      });
    }

    // pending = hindi pa tapos mag-authorize sa GCash.
    // expired / cancelled = wala nang mababawi, kailangang mag-retry.
    return jsonResponse({
      paymentStatus: booking.payment_status ?? "Unpaid",
      sourceStatus,
      reason: "source_not_chargeable",
    });
  } catch (e) {
    console.error("verify-gcash-payment failed", e);
    return jsonResponse({ error: "Verification failed", details: String(e) }, 500);
  }
});
