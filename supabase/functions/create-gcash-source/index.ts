// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMONGO_PUBLIC_KEY = Deno.env.get("PAYMONGO_PUBLIC_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const { bookingId, amount, returnUrl } = await req.json();
    if (!bookingId || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "bookingId and a positive numeric amount are required" }, 400);
    }
    if (!PAYMONGO_PUBLIC_KEY) {
      console.error("PAYMONGO_PUBLIC_KEY is not configured");
      return jsonResponse({ error: "PayMongo public key is not configured" }, 500);
    }

    const amountInCentavos = Math.round(amount * 100);
    if (amountInCentavos < 10000) {
      return jsonResponse({ error: "GCash payments must be at least PHP 100" }, 400);
    }
    if (
      typeof returnUrl !== "string" ||
      !/^(exp|exps|carwashapp|icarwash):\/\//.test(returnUrl)
    ) {
      return jsonResponse({ error: "A valid app return URL is required" }, 400);
    }

    const encodedReturnUrl = encodeURIComponent(returnUrl);
    const paymentRedirectBase =
      "https://hybszzpgtbuubdotqkqq.supabase.co/functions/v1/payment-redirect";

    const authHeader = `Basic ${btoa(`${PAYMONGO_PUBLIC_KEY}:`)}`;

    const pmRes = await fetch("https://api.paymongo.com/v1/sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountInCentavos,
            currency: "PHP",
            type: "gcash",
            redirect: {
              success: `${paymentRedirectBase}?bookingId=${bookingId}&status=success&returnUrl=${encodedReturnUrl}`,
              failed: `${paymentRedirectBase}?bookingId=${bookingId}&status=failed&returnUrl=${encodedReturnUrl}`,
            },
          },
        },
      }),
    });

    const pmJson = await pmRes.json();
    if (!pmRes.ok) {
      console.error("PayMongo source creation failed", JSON.stringify(pmJson));
      return jsonResponse({
        error: "PayMongo could not create the GCash payment source",
        details: pmJson?.errors ?? pmJson,
      }, 400);
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

    return jsonResponse({ checkoutUrl, sourceId });
  } catch (e) {
    console.error("create-gcash-source failed", e);
    return jsonResponse({ error: "Unable to start GCash payment", details: String(e) }, 500);
  }
});