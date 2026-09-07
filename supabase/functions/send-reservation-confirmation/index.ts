// Sends the customer a confirmation EMAIL + automated SMS after a
// successful reservation. Invoked (fire-and-forget) from
// src/app/customer/checkout.tsx via supabase.functions.invoke(
// 'send-reservation-confirmation', { body: {...} }).
//
// Both channels are best-effort and independent: if one provider is not
// configured or fails, the other still goes out, and the function always
// returns 200 so the checkout receipt is never blocked.
//
// Required Supabase secrets (set with: supabase secrets set KEY=value):
//   EMAIL (use EITHER Brevo OR Resend -- Brevo is checked first):
//     Brevo  -> BREVO_API_KEY        https://app.brevo.com/settings/keys/api
//               BREVO_SENDER_EMAIL   a sender address you verified in Brevo
//                                    (Brevo -> Senders -- no domain needed,
//                                     just click the confirmation email)
//               BREVO_SENDER_NAME    optional, defaults to "I-CarWash"
//     Resend -> RESEND_API_KEY       https://resend.com  (needs a verified
//               RESEND_FROM          DOMAIN to email arbitrary addresses)
//   SMS   -> SEMAPHORE_API_KEY       https://semaphore.co  (Philippines)
//            SEMAPHORE_SENDER_NAME   optional
//
// Deploy:
//   supabase functions deploy send-reservation-confirmation --project-ref hybszzpgtbuubdotqkqq
// Then set at least the Brevo secrets:
//   supabase secrets set BREVO_API_KEY=xkeysib-... BREVO_SENDER_EMAIL=you@gmail.com --project-ref hybszzpgtbuubdotqkqq

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  email?: string | null;
  mobile?: string | null;
  customerName?: string;
  shopName?: string;
  packageName?: string;
  vehicleType?: string;
  scheduledDateLabel?: string;
  scheduledTime?: string;
  refNumber?: string;
  servicePrice?: string;
  voucherApplied?: number;
  amountPaid?: number;
  paymentMethod?: string;
}

// Normalize a PH mobile number to E.164 (+63XXXXXXXXXX). Accepts
// "09171234567", "9171234567", "+639171234567", "639171234567".
function toE164PH(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^09\d{9}$/.test(digits)) return "+63" + digits.slice(1);
  if (/^9\d{9}$/.test(digits)) return "+63" + digits;
  if (/^63\d{10}$/.test(digits)) return "+" + digits;
  if (/^\+63\d{10}$/.test(raw.trim())) return raw.trim();
  return null;
}

function buildEmailHtml(p: Payload): string {
  const voucherLine =
    p.voucherApplied && p.voucherApplied > 0
      ? `<tr><td style="padding:4px 0;color:#64748b">Store credit used</td><td style="padding:4px 0;text-align:right;color:#2563eb;font-weight:700">−₱${p.voucherApplied}</td></tr>`
      : "";
  const paidLine =
    p.amountPaid != null
      ? `<tr><td style="padding:4px 0;color:#64748b">Amount paid</td><td style="padding:4px 0;text-align:right;font-weight:700">₱${p.amountPaid}</td></tr>`
      : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#2563eb;color:#fff;border-radius:16px 16px 0 0;padding:22px 24px">
      <div style="font-size:13px;letter-spacing:1px;opacity:.85">I-CARWASH</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">You've successfully reserved a bay!</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:24px">
      <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6">
        Hi ${p.customerName ?? "Customer"}, your reservation is confirmed. Show your QR code
        (in the app under <b>Transaction History</b>) to our staff when you arrive to check in.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:4px 0;color:#64748b">Reference No.</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.refNumber ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Branch</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.shopName ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Slot</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.scheduledDateLabel ?? "—"}${p.scheduledTime ? " • " + p.scheduledTime : ""}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Package</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.packageName ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Vehicle</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.vehicleType ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Service fee</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.servicePrice ?? "—"}</td></tr>
        ${voucherLine}
        ${paidLine}
        <tr><td style="padding:4px 0;color:#64748b">Payment method</td><td style="padding:4px 0;text-align:right;font-weight:700">${p.paymentMethod ?? "—"}</td></tr>
      </table>
      <div style="margin-top:16px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:12px;line-height:1.5">
        Reservations are non-refundable. If you can't arrive on time or your booking doesn't push
        through, the amount is converted into a voucher (store credit) you can use on your next
        reservation — a ₱300 voucher stays worth ₱300.
      </div>
    </div>
  </div>
</body></html>`;
}

function buildSmsText(p: Payload): string {
  const slot = `${p.scheduledDateLabel ?? ""}${p.scheduledTime ? " " + p.scheduledTime : ""}`.trim();
  return `I-CarWash: You have successfully reserved a bay${p.shopName ? " at " + p.shopName : ""}. Ref ${p.refNumber ?? "-"}${slot ? ", slot " + slot : ""}. Show your QR on arrival. Non-refundable; unused bookings become store-credit vouchers.`;
}

type ChannelResult = { ok: boolean; skipped?: boolean; provider?: string; error?: string };

async function sendViaBrevo(p: Payload, subject: string): Promise<ChannelResult> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!apiKey || !senderEmail) {
    return { ok: false, skipped: true, provider: "brevo", error: "BREVO_API_KEY/BREVO_SENDER_EMAIL not set" };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: Deno.env.get("BREVO_SENDER_NAME") ?? "I-CarWash" },
        to: [{ email: p.email, name: p.customerName ?? "Customer" }],
        subject,
        htmlContent: buildEmailHtml(p),
      }),
    });
    if (!res.ok) return { ok: false, provider: "brevo", error: `brevo ${res.status}: ${await res.text()}` };
    return { ok: true, provider: "brevo" };
  } catch (e) {
    return { ok: false, provider: "brevo", error: String(e) };
  }
}

async function sendViaResend(p: Payload, subject: string): Promise<ChannelResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!apiKey || !from) {
    return { ok: false, skipped: true, provider: "resend", error: "RESEND_API_KEY/RESEND_FROM not set" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [p.email], subject, html: buildEmailHtml(p) }),
    });
    if (!res.ok) return { ok: false, provider: "resend", error: `resend ${res.status}: ${await res.text()}` };
    return { ok: true, provider: "resend" };
  } catch (e) {
    return { ok: false, provider: "resend", error: String(e) };
  }
}

async function sendEmail(p: Payload): Promise<ChannelResult> {
  if (!p.email) return { ok: false, skipped: true, error: "no email on file" };
  const subject = `Reservation confirmed — ${p.refNumber ?? "I-CarWash"}`;

  // Brevo first (works with just a verified sender email, no domain), then
  // Resend. Only fall through when the first provider isn't configured.
  const brevo = await sendViaBrevo(p, subject);
  if (brevo.ok || !brevo.skipped) return brevo;

  const resend = await sendViaResend(p, subject);
  if (resend.ok || !resend.skipped) return resend;

  return { ok: false, skipped: true, error: "no email provider configured (set BREVO_API_KEY + BREVO_SENDER_EMAIL)" };
}

async function sendSms(p: Payload): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const apiKey = Deno.env.get("SEMAPHORE_API_KEY");
  if (!apiKey) return { ok: false, skipped: true, error: "SEMAPHORE_API_KEY not set" };
  if (!p.mobile) return { ok: false, skipped: true, error: "no mobile on file" };

  const number = toE164PH(p.mobile);
  if (!number) return { ok: false, skipped: true, error: `unrecognized PH mobile: ${p.mobile}` };

  try {
    const form = new URLSearchParams({
      apikey: apiKey,
      number,
      message: buildSmsText(p),
    });
    const sender = Deno.env.get("SEMAPHORE_SENDER_NAME");
    if (sender) form.set("sendername", sender);

    const res = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) return { ok: false, error: `semaphore ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // NEW: i-log natin ang minimal na buod ng papasok na payload (walang
  // buong PII gaya ng buong mobile number sa logs, presensya lang) --
  // para makita sa Logs tab kung ANO talaga ang natanggap ng function.
  console.log(
    "[send-reservation-confirmation] incoming:",
    JSON.stringify({
      hasEmail: !!payload.email,
      email: payload.email,
      hasMobile: !!payload.mobile,
      refNumber: payload.refNumber,
    })
  );

  const [email, sms] = await Promise.all([sendEmail(payload), sendSms(payload)]);

  // NEW: i-log ang RESULTA ng email/SMS attempts -- ito na ang
  // pinakamahalagang bagay na dapat makita sa Logs tab, dahil dito
  // lalabas kung na-set ba nang tama ang secrets, tama ba ang RESEND_FROM,
  // o may error mula kay Resend/Semaphore.
  console.log("[send-reservation-confirmation] result:", JSON.stringify({ email, sms }));

  // Always 200 -- the checkout receipt must never be blocked by a
  // notification hiccup. Details are in the body for logging.
  return new Response(JSON.stringify({ email, sms }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});