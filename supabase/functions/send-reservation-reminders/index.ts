// Scheduled function -- runs every couple of minutes (pg_cron -> pg_net,
// see supabase/sql/2026-09_reservation_reminder.sql). Two jobs per run:
//
//   1) REMINDER EMAIL: for every still-Waiting, not-yet-arrived paid
//      reservation whose slot is ~15 minutes away and that hasn't been
//      reminded yet, send the customer an "alert" email telling them to
//      head over now, and warning that a no-show is auto-cancelled and the
//      amount turned into store credit (a voucher).
//
//   2) NO-SHOW SWEEP: a reservation that is never scanned in is set to
//      'Voided' NO_SHOW_CUTOFF_MINUTES after its slot. The existing
//      issue_voucher_on_void trigger then credits the full amount back to
//      the customer as a voucher balance -- "no refund, but not lost".
//
// Manual test:
//   curl -i -X POST \
//     https://hybszzpgtbuubdotqkqq.supabase.co/functions/v1/send-reservation-reminders \
//     -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
//
// Deploy:
//   supabase functions deploy send-reservation-reminders --project-ref hybszzpgtbuubdotqkqq
//
// Email providers are the SAME secrets as send-reservation-confirmation
// (Brevo is tried first, then Resend):
//   BREVO_API_KEY + BREVO_SENDER_EMAIL (+ optional BREVO_SENDER_NAME)
//   RESEND_API_KEY + RESEND_FROM
//
// Optional tuning secrets:
//   REMINDER_LEAD_MINUTES   default 15   -- how early the alert goes out
//   NO_SHOW_CUTOFF_MINUTES  default 120  -- when a never-arrived booking
//                                           is auto-cancelled to credit

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const LEAD_MINUTES = Number(Deno.env.get("REMINDER_LEAD_MINUTES") ?? "15");
const NO_SHOW_CUTOFF_MINUTES = Number(
  Deno.env.get("NO_SHOW_CUTOFF_MINUTES") ?? "120",
);

interface ReservationRow {
  id: number;
  customer_id: string | null;
  customer_name: string | null;
  shop_name: string | null;
  service_type: string | null;
  vehicle_type: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_at: string | null;
  price: number | null;
  payment_reference: string | null;
  payment_method: string | null;
  voucher_applied: number | null;
}

function slotLabel(r: ReservationRow): string {
  const timePart = r.scheduled_time ?? "";
  if (!r.scheduled_date) return timePart || "your scheduled time";
  try {
    const d = new Date(`${r.scheduled_date}T00:00:00`);
    const datePart = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return timePart ? `${datePart} • ${timePart}` : datePart;
  } catch {
    return timePart || r.scheduled_date;
  }
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

function buildReminderHtml(r: ReservationRow, minsLeft: number): string {
  const when = minsLeft > 0
    ? `in about <b>${minsLeft} minute${minsLeft === 1 ? "" : "s"}</b>`
    : `<b>right now</b>`;

  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#2563eb;color:#fff;border-radius:16px 16px 0 0;padding:22px 24px">
      <div style="font-size:13px;letter-spacing:1px;opacity:.85">I-CARWASH</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">Your wash slot is ${when}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:24px">
      <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6">
        Hi ${r.customer_name ?? "Customer"}, this is a reminder that your reservation
        ${r.shop_name ? `at <b>${r.shop_name}</b> ` : ""}is coming up ${when}.
        Please head over now and have staff scan your QR code (in the app under
        <b>Transaction History</b>) so we can start your service on time.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:4px 0;color:#64748b">Reference No.</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.payment_reference ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Branch</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.shop_name ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Slot</td><td style="padding:4px 0;text-align:right;font-weight:700">${slotLabel(r)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Package</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.service_type ?? "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Vehicle</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.vehicle_type ?? "—"}</td></tr>
        ${r.price != null ? `<tr><td style="padding:4px 0;color:#64748b">Amount</td><td style="padding:4px 0;text-align:right;font-weight:700">₱${r.price}</td></tr>` : ""}
      </table>
      <div style="margin-top:16px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:12px;line-height:1.5">
        <b>Please don't be late.</b> If you don't arrive and check in, your reservation is
        automatically cancelled ${NO_SHOW_CUTOFF_MINUTES >= 60
          ? `about ${Math.round(NO_SHOW_CUTOFF_MINUTES / 60)} hour${NO_SHOW_CUTOFF_MINUTES >= 120 ? "s" : ""}`
          : `${NO_SHOW_CUTOFF_MINUTES} minutes`} after your slot. It stays non-refundable, but
        the full amount is converted into a <b>voucher (store credit)</b> you can apply to your
        next booking — a ₱300 booking becomes ₱300 of credit. You can use it on the checkout
        screen under <b>Apply Voucher</b>.
      </div>
    </div>
  </div>
</body></html>`;
}

type ChannelResult = {
  ok: boolean;
  skipped?: boolean;
  provider?: string;
  error?: string;
};

async function sendViaBrevo(
  to: string,
  name: string,
  subject: string,
  html: string,
): Promise<ChannelResult> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!apiKey || !senderEmail) {
    return {
      ok: false,
      skipped: true,
      provider: "brevo",
      error: "BREVO_API_KEY/BREVO_SENDER_EMAIL not set",
    };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: Deno.env.get("BREVO_SENDER_NAME") ?? "I-CarWash",
        },
        to: [{ email: to, name }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        provider: "brevo",
        error: `brevo ${res.status}: ${await res.text()}`,
      };
    }
    return { ok: true, provider: "brevo" };
  } catch (e) {
    return { ok: false, provider: "brevo", error: String(e) };
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<ChannelResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!apiKey || !from) {
    return {
      ok: false,
      skipped: true,
      provider: "resend",
      error: "RESEND_API_KEY/RESEND_FROM not set",
    };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      return {
        ok: false,
        provider: "resend",
        error: `resend ${res.status}: ${await res.text()}`,
      };
    }
    return { ok: true, provider: "resend" };
  } catch (e) {
    return { ok: false, provider: "resend", error: String(e) };
  }
}

async function sendEmail(
  to: string,
  name: string,
  subject: string,
  html: string,
): Promise<ChannelResult> {
  const brevo = await sendViaBrevo(to, name, subject, html);
  if (brevo.ok || !brevo.skipped) return brevo;

  const resend = await sendViaResend(to, subject, html);
  if (resend.ok || !resend.skipped) return resend;

  return {
    ok: false,
    skipped: true,
    error: "no email provider configured (set BREVO_API_KEY + BREVO_SENDER_EMAIL)",
  };
}

async function runReminders(supabase: ReturnType<typeof createClient>) {
  const nowMs = Date.now();
  // A slot counts as "due for a reminder" once it is LEAD_MINUTES (or less)
  // away. The small look-back keeps someone who is right at their slot time
  // -- but hasn't been swept as a no-show yet -- from missing the nudge.
  const windowStart = new Date(nowMs - 10 * 60000).toISOString();
  const windowEnd = new Date(nowMs + LEAD_MINUTES * 60000).toISOString();

  const { data, error } = await supabase
    .from("reservation")
    .select(
      "id, customer_id, customer_name, shop_name, service_type, vehicle_type, scheduled_date, scheduled_time, scheduled_at, price, payment_reference, payment_method, voucher_applied",
    )
    .eq("status", "Waiting")
    .eq("payment_status", "paid")
    .is("arrived_at", null)
    .is("reminder_sent_at", null)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd);

  if (error) return { error: error.message, sent: 0, considered: 0 };

  const rows = (data ?? []) as ReservationRow[];
  if (rows.length === 0) return { sent: 0, considered: 0, results: [] };

  // One batched profile lookup for every customer we're about to remind.
  const customerIds = [
    ...new Set(rows.map((r) => r.customer_id).filter((v): v is string => !!v)),
  ];
  const emailById = new Map<string, { email: string | null; name: string | null }>();
  if (customerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email_address, full_name")
      .in("id", customerIds);
    (profiles ?? []).forEach((p: any) => {
      emailById.set(p.id, { email: p.email_address ?? null, name: p.full_name ?? null });
    });
  }

  const results: unknown[] = [];
  let sent = 0;

  for (const r of rows) {
    const profile = r.customer_id ? emailById.get(r.customer_id) : undefined;
    const to = profile?.email ?? null;
    const name = r.customer_name ?? profile?.name ?? "Customer";
    const minsLeft = r.scheduled_at ? Math.max(0, minutesUntil(r.scheduled_at)) : 0;

    if (!to) {
      // No address on file -- nothing to retry, mark it done so we don't
      // reconsider this row on every single run.
      await supabase
        .from("reservation")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", r.id);
      results.push({ id: r.id, skipped: "no email on file" });
      continue;
    }

    const subject = `Reminder: your I-CarWash slot is in ${minsLeft || "a few"} minutes`;
    const outcome = await sendEmail(to, name, subject, buildReminderHtml(r, minsLeft));

    // Only stamp reminder_sent_at when the send actually went out or is
    // permanently un-sendable. A transient provider error is left unstamped
    // so the next cron run retries it.
    if (outcome.ok || outcome.skipped) {
      await supabase
        .from("reservation")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", r.id);
    }
    if (outcome.ok) sent += 1;
    results.push({ id: r.id, email: to, outcome });
  }

  return { sent, considered: rows.length, results };
}

async function runNoShowSweep(supabase: ReturnType<typeof createClient>) {
  const cutoff = new Date(Date.now() - NO_SHOW_CUTOFF_MINUTES * 60000)
    .toISOString();

  // Setting status to 'Voided' fires issue_voucher_on_void, which credits
  // the full amount back to the customer as store credit.
  const { data, error } = await supabase
    .from("reservation")
    .update({ status: "Voided" })
    .eq("status", "Waiting")
    .eq("payment_status", "paid")
    .is("arrived_at", null)
    .not("scheduled_at", "is", null)
    .lt("scheduled_at", cutoff)
    .select("id");

  if (error) return { error: error.message, voided: 0 };
  return { voided: (data ?? []).length, ids: (data ?? []).map((r: any) => r.id) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const [reminders, noShow] = await Promise.all([
    runReminders(supabase).catch((e) => ({ error: String(e) })),
    runNoShowSweep(supabase).catch((e) => ({ error: String(e) })),
  ]);

  console.log(
    "[send-reservation-reminders]",
    JSON.stringify({ reminders, noShow }),
  );

  return new Response(JSON.stringify({ reminders, noShow }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
