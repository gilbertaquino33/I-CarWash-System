// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY")!;

serve(async (req) => {
  try {
    const { bookingId, amount } = await req.json();
    if (!bookingId || !amount) {
      return new Response(
        JSON.stringify({ error: "bookingId and amount required" }),
        { status: 400 }
      );
    }

    const authHeader = `Basic ${btoa(`${PAYMONGO_SECRET_KEY}:`)}`;

    const pmRes = await fetch("https://api.paymongo.com/v1/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100), // centavos
            currency: "PHP",
            type: "gcash",
            redirect: {
              success: `https://hybszzpgtbuubdotqkqq.supabase.co/functions/v1/payment-redirect?bookingId=${bookingId}&status=success`,
              failed: `https://hybszzpgtbuubdotqkqq.supabase.co/functions/v1/payment-redirect?bookingId=${bookingId}&status=failed`,
            },
          },
        },
      }),
    });

    const pmJson = await pmRes.json();
    if (!pmRes.ok) {
      return new Response(JSON.stringify({ error: pmJson }), { status: 400 });
    }

    const sourceId = pmJson.data.id;
    const checkoutUrl = pmJson.data.attributes.redirect.checkout_url;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase
      .from("home_service")
      .update({ paymongo_source_id: sourceId })
      .eq("id", bookingId);

    return new Response(JSON.stringify({ checkoutUrl, sourceId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
