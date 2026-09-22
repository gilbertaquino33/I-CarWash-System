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
    const { bookingId, amount, returnUrl, table } = await req.json();
    const bookingTable = table === "reservation" ? "reservation" : "home_service";
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
    // MAHALAGA: kailangang i-check ang error dito. Kung hindi na-save ang
    // sourceId (hal. wala pang paymongo_source_id column sa `bookingTable`
    // -- hindi pa na-apply ang SQL migration), tuloy pa rin bubuksan ang
    // GCash checkout at makakapagbayad ang customer, pero walang paraan ang
    // webhook/verify-gcash-payment na mahanap ang row na ito pabalik dahil
    // walang naka-save na sourceId -- KAILANGAN palaging "Payment Not
    // Completed" ang lalabas kahit gaano katagal hintayin. Mas mabuting
    // sabihin agad ito ngayon, malinaw, kaysa maghintay lang ng maling
    // timeout sa client.
    const { data: updatedRows, error: updateError } = await supabase
      .from(bookingTable)
      .update({ paymongo_source_id: sourceId })
      .eq("id", bookingId)
      .select("id");

    if (updateError || !updatedRows || updatedRows.length === 0) {
      console.error(
        "Failed to save paymongo_source_id",
        bookingTable,
        bookingId,
        updateError?.message ?? "no row matched"
      );
      return jsonResponse({
        error: `Could not link the payment to this booking (${bookingTable}.paymongo_source_id): ${
          updateError?.message ?? "no matching row"
        }. Has the SQL migration for this table been applied?`,
      }, 500);
    }

    return jsonResponse({ checkoutUrl, sourceId });
  } catch (e) {
    console.error("create-gcash-source failed", e);
    return jsonResponse({ error: "Unable to start GCash payment", details: String(e) }, 500);
  }
});