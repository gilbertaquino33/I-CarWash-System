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
  return hex === parts.li || hex === parts.te;
}

serve(async (req) => {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("Paymongo-Signature") ?? "";

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
    // I-charge na ang source na na-authorize na
    await fetch("https://api.paymongo.com/v1/payments", {
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
  }

  if (type === "payment.paid") {
    const payment = event.data.attributes.data;
    const sourceId = payment.attributes.source.id;
    await supabase
      .from("home_service")
      .update({ payment_status: "Paid", paymongo_payment_id: payment.id })
      .eq("paymongo_source_id", sourceId);
  }

  if (type === "payment.failed") {
    const payment = event.data.attributes.data;
    const sourceId = payment.attributes.source?.id;
    if (sourceId) {
      await supabase
        .from("home_service")
        .update({ payment_status: "Unpaid" })
        .eq("paymongo_source_id", sourceId);
    }
  }

  return new Response("ok");
});