import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET")!;

async function verifySignature(rawBody: string, sigHeader: string) {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const signedPayload = `${parts.t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const hex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

 console.log("=== SIGNATURE DEBUG ===");
  console.log("sigHeader received:", sigHeader);
  console.log("parts parsed:", JSON.stringify(parts));
  console.log("computed hex:", hex);
  console.log("expected te:", parts.te);
  console.log("expected li:", parts.li);
  console.log("WEBHOOK_SECRET length:", WEBHOOK_SECRET?.length ?? "undefined");
  console.log("=======================");

  return hex === parts.li || hex === parts.te;
}

serve(async (req) => {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("Paymongo-Signature") ?? "";
  console.log("Received webhook. sigHeader:", sigHeader || "(EMPTY)");

  if (!(await verifySignature(rawBody, sigHeader))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const type = event.data.attributes.type;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const authHeader = `Basic ${btoa(`${PAYMONGO_SECRET_KEY}:`)}`;

  if (type === "source.chargeable") {
    const source = event.data.attributes.data;

    const res = await fetch("https://api.paymongo.com/v1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: source.attributes.amount,
            currency: "PHP",
            source: { id: source.id, type: "source" },
          },
        },
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error("PayMongo payment creation failed", res.status, errorBody);
      return new Response("Payment creation failed", { status: 500 });
    }
  }

  // Walang paraan ang PayMongo na malaman kung `home_service` o
  // `reservation` ang pinagmulan ng source na ito -- server-to-server na
  // webhook call ito, walang extra context na maipapasa. Subukan muna sa
  // home_service; kung walang na-update na row doon (.select() pagkatapos
  // ng .update() ay walang laman), doon lang subukan sa reservation.
  // Magkaiba ang casing ng payment_status sa bawat table (home_service =
  // "Paid"/"Unpaid", reservation = "paid"/"unpaid" -- tingnan
  // src/app/staff/reservation.tsx at ang create_customer_reservation RPC).
  if (type === "payment.paid") {
    const payment = event.data.attributes.data;
    const sourceId = payment.attributes.source.id;

    const { data: updatedHomeService } = await supabase
      .from("home_service")
      .update({ payment_status: "Paid", paymongo_payment_id: payment.id })
      .eq("paymongo_source_id", sourceId)
      .select("id");

    if (!updatedHomeService || updatedHomeService.length === 0) {
      await supabase
        .from("reservation")
        .update({
          payment_status: "paid",
          paymongo_payment_id: payment.id,
          paid_at: new Date().toISOString(),
        })
        .eq("paymongo_source_id", sourceId);
    }
  }

  if (type === "payment.failed") {
    const payment = event.data.attributes.data;
    const sourceId = payment.attributes.source?.id;
    if (sourceId) {
      const { data: updatedHomeService } = await supabase
        .from("home_service")
        .update({ payment_status: "Unpaid" })
        .eq("paymongo_source_id", sourceId)
        .select("id");

      if (!updatedHomeService || updatedHomeService.length === 0) {
        await supabase
          .from("reservation")
          .update({ payment_status: "unpaid" })
          .eq("paymongo_source_id", sourceId);
      }
    }
  }

  return new Response("ok");
});