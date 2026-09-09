// Scheduled function -- runs every couple of minutes (pg_cron -> pg_net,
// see supabase/sql/2026-09_reservation_reminder.sql). Per run it does:
//
//   1) EARLY REMINDER (~60 min before): a gentle "your reservation is
//      coming up" heads-up so the customer can plan their trip.
//
//   2) FINAL ALERT (~30 min before): an urgent "head over now" email, with
//      the no-show -> store-credit warning.
//
//   3) THANK-YOU (after service): once a reservation is Completed, a
//      "thank you for choosing I-CarWash" email with the service summary.
//
//   4) CANCELLATION EMAIL: once a PAID reservation is Voided/Cancelled
//      (no-show sweep or the customer's own "Cancel booking"), a
//      "your reservation was cancelled -- store credit issued" email.
//
//   5) NO-SHOW SWEEP: calls sweep_no_show_reservations() (see
//      supabase/sql/2026-09_reservation_no_show_autocancel.sql) as a
//      backstop -- that function also has its own every-minute cron.
//
// Each email type has its own guard column on `reservation`
// (reminder_early_sent_at / reminder_sent_at / thank_you_sent_at /
// cancel_email_sent_at) so the same message never goes out twice.
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
//   REMINDER_LEAD_MINUTES        default 30   -- when the final alert fires
//   REMINDER_EARLY_LEAD_MINUTES  default 60   -- when the early heads-up fires
//
// The JSON response includes `providers` -- {brevo:bool, resend:bool} --
// so ONE manual curl tells you whether the email secrets are set.

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

const LEAD_MINUTES = Number(Deno.env.get("REMINDER_LEAD_MINUTES") ?? "30");
const EARLY_LEAD_MINUTES = Number(
  Deno.env.get("REMINDER_EARLY_LEAD_MINUTES") ?? "60",
);

const ROW_SELECT =
  "id, customer_id, customer_name, shop_name, service_type, vehicle_type, scheduled_date, scheduled_time, scheduled_at, completed_at, price, payment_reference, payment_method, voucher_applied";

// True when at least one email provider is configured -- surfaced in the
// response so a single curl reveals a missing-secrets problem.
const PROVIDERS = {
  brevo: !!Deno.env.get("BREVO_API_KEY") && !!Deno.env.get("BREVO_SENDER_EMAIL"),
  resend: !!Deno.env.get("RESEND_API_KEY") && !!Deno.env.get("RESEND_FROM"),
};
const ANY_PROVIDER = PROVIDERS.brevo || PROVIDERS.resend;

const BATCH_LIMIT = 50;

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
  completed_at: string | null;
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

function humanLeadLabel(minsLeft: number): string {
  if (minsLeft <= 0) return "right now";
  if (minsLeft < 60) {
    return `in about ${minsLeft} minute${minsLeft === 1 ? "" : "s"}`;
  }
  const hrs = Math.round(minsLeft / 60);
  return `in about ${hrs} hour${hrs === 1 ? "" : "s"}`;
}

function detailsTable(r: ReservationRow): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr><td style="padding:4px 0;color:#64748b">Reference No.</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.payment_reference ?? "—"}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Branch</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.shop_name ?? "—"}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Slot</td><td style="padding:4px 0;text-align:right;font-weight:700">${slotLabel(r)}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Package</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.service_type ?? "—"}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Vehicle</td><td style="padding:4px 0;text-align:right;font-weight:700">${r.vehicle_type ?? "—"}</td></tr>
    ${r.price != null ? `<tr><td style="padding:4px 0;color:#64748b">Amount</td><td style="padding:4px 0;text-align:right;font-weight:700">₱${r.price}</td></tr>` : ""}
  </table>`;
}

function emailShell(headline: string, inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#2563eb;color:#fff;border-radius:16px 16px 0 0;padding:22px 24px">
      <div style="font-size:13px;letter-spacing:1px;opacity:.85">I-CARWASH</div>
      <div style="font-size:20px;font-weight:800;margin-top:4px">${headline}</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:24px">
      ${inner}
    </div>
  </div>
</body></html>`;
}

function buildEarlyReminderHtml(r: ReservationRow, minsLeft: number): string {
  const when = humanLeadLabel(minsLeft);
  return emailShell(
    "Your reservation is coming up",
    `<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6">
        Hi ${r.customer_name ?? "Customer"}, just a heads up — your I-CarWash reservation
        ${r.shop_name ? `at <b>${r.shop_name}</b> ` : ""}is ${when} (${slotLabel(r)}).
        Please plan your trip so you arrive on time, and have our staff scan your QR code
        (in the app under <b>Transaction History</b>) when you get there.
      </p>
      ${detailsTable(r)}
      <div style="margin-top:16px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;color:#1e40af;font-size:12px;line-height:1.5">
        We'll send one more alert shortly before your slot. If you can't make it, note that a
        no-show is auto-cancelled after a short grace period and the amount becomes a
        <b>voucher (store credit)</b> for your next booking.
      </div>`,
  );
}

function buildFinalAlertHtml(r: ReservationRow, minsLeft: number): string {
  const when = minsLeft > 0
    ? `in about <b>${minsLeft} minute${minsLeft === 1 ? "" : "s"}</b>`
    : `<b>right now</b>`;
  return emailShell(
    `Your wash slot is ${minsLeft > 0 ? `in ${minsLeft} min` : "now"}`,
    `<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6">
        Hi ${r.customer_name ?? "Customer"}, this is a reminder that your reservation
        ${r.shop_name ? `at <b>${r.shop_name}</b> ` : ""}is coming up ${when}.
        Please head over now and have staff scan your QR code (in the app under
        <b>Transaction History</b>) so we can start your service on time.
      </p>
      ${detailsTable(r)}
      <div style="margin-top:16px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:12px;line-height:1.5">
        <b>Please don't be late.</b> If you don't arrive and check in, your reservation is
        cancelled automatically once the 15-minute grace period after your slot has passed —
        no action needed from you or our staff. It stays non-refundable, but the full amount is
        converted into a <b>voucher (store credit)</b> you can apply to your next booking —
        a ₱300 booking becomes ₱300 of credit. You can use it on the checkout screen under
        <b>Apply Voucher</b>.
      </div>`,
  );
}

function buildThankYouHtml(r: ReservationRow): string {
  return emailShell(
    "Thank you for choosing I-CarWash!",
    `<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6">
        Hi ${r.customer_name ?? "Customer"}, your ${r.service_type ?? "wash"}
        ${r.vehicle_type ? `for your <b>${r.vehicle_type}</b> ` : ""}
        ${r.shop_name ? `at <b>${r.shop_name}</b> ` : ""}is done — we hope it looks great!
        Thank you for trusting us with your ride.
      </p>
      ${detailsTable(r)}
      <div style="margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;color:#166534;font-size:12px;line-height:1.5">
        Book your next wash anytime in the I-CarWash app. We'd love to see you again soon!
      </div>`,
  );
}

function buildCancellationHtml(r: ReservationRow): string {
  const credit = r.price != null && r.price > 0 ? `₱${r.price}` : "The amount you paid";
  return emailShell(
    "Your reservation was cancelled",
    `<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6">
        Hi ${r.customer_name ?? "Customer"}, your reservation
        ${r.shop_name ? `at <b>${r.shop_name}</b> ` : ""}for
        <b>${slotLabel(r)}</b> has been cancelled and is now closed. This usually
        happens when the booking isn't checked in on time, or when you cancel it
        yourself from the app.
      </p>
      ${detailsTable(r)}
      <div style="margin-top:16px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;color:#1e40af;font-size:12px;line-height:1.5">
        Good news — your payment is not lost. ${credit} has been added to your
        <b>store credit</b> (no expiry). Apply it on your next booking at checkout
        under <b>Apply Store Credit</b>.
      </div>`,
  );
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

async function loadEmailsByCustomer(
  supabase: ReturnType<typeof createClient>,
  rows: ReservationRow[],
) {
  const ids = [
    ...new Set(rows.map((r) => r.customer_id).filter((v): v is string => !!v)),
  ];
  const map = new Map<string, { email: string | null; name: string | null }>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email_address, full_name")
      .in("id", ids);
    (data ?? []).forEach((p: any) => {
      map.set(p.id, { email: p.email_address ?? null, name: p.full_name ?? null });
    });
  }
  return map;
}

// Sends one email per row, then stamps `guardColumn` so it is never
// resent. A missing address is also stamped (nothing to retry); a
// transient provider error is left unstamped so the next run retries.
async function dispatchEmails(
  supabase: ReturnType<typeof createClient>,
  rows: ReservationRow[],
  guardColumn: string,
  subjectFor: (r: ReservationRow) => string,
  htmlFor: (r: ReservationRow) => string,
) {
  if (rows.length === 0) return { sent: 0, considered: 0, results: [] as unknown[] };

  const emailById = await loadEmailsByCustomer(supabase, rows);
  const results: unknown[] = [];
  let sent = 0;

  for (const r of rows) {
    const profile = r.customer_id ? emailById.get(r.customer_id) : undefined;
    const to = profile?.email ?? null;
    const name = r.customer_name ?? profile?.name ?? "Customer";

    if (!to) {
      // Permanently un-sendable -- stamp so we don't reconsider it forever.
      await supabase
        .from("reservation")
        .update({ [guardColumn]: new Date().toISOString() })
        .eq("id", r.id);
      results.push({ id: r.id, skipped: "no email on file" });
      continue;
    }

    if (!ANY_PROVIDER) {
      // No email provider configured yet -- do NOT stamp the guard, so the
      // next run (after BREVO_API_KEY / RESEND_API_KEY is set) retries.
      results.push({ id: r.id, email: to, skipped: "no email provider configured" });
      continue;
    }

    const outcome = await sendEmail(to, name, subjectFor(r), htmlFor(r));
    // Stamp only on a real send. A transient provider error is left
    // unstamped so the next cron run retries it.
    if (outcome.ok) {
      await supabase
        .from("reservation")
        .update({ [guardColumn]: new Date().toISOString() })
        .eq("id", r.id);
      sent += 1;
    }
    results.push({ id: r.id, email: to, outcome });
  }

  return { sent, considered: rows.length, results };
}

async function runReminders(supabase: ReturnType<typeof createClient>) {
  const nowMs = Date.now();
  // FINAL alert window: from a little before "now" (so someone right at
  // their slot still gets nudged) up to LEAD_MINUTES ahead.
  const finalStart = new Date(nowMs - 10 * 60000).toISOString();
  const finalEnd = new Date(nowMs + LEAD_MINUTES * 60000).toISOString();
  // EARLY heads-up window: strictly beyond the final window, up to
  // EARLY_LEAD_MINUTES ahead -- so a booking already inside the final
  // window just gets the one urgent email, not both back to back.
  const earlyStart = finalEnd;
  const earlyEnd = new Date(nowMs + EARLY_LEAD_MINUTES * 60000).toISOString();

  const commonFilter = (q: any) =>
    q
      .eq("status", "Waiting")
      .eq("payment_status", "paid")
      .is("arrived_at", null)
      .not("scheduled_at", "is", null);

  const [finalRes, earlyRes] = await Promise.all([
    commonFilter(supabase.from("reservation").select(ROW_SELECT))
      .is("reminder_sent_at", null)
      .gte("scheduled_at", finalStart)
      .lte("scheduled_at", finalEnd)
      .limit(BATCH_LIMIT),
    commonFilter(supabase.from("reservation").select(ROW_SELECT))
      .is("reminder_early_sent_at", null)
      .gt("scheduled_at", earlyStart)
      .lte("scheduled_at", earlyEnd)
      .limit(BATCH_LIMIT),
  ]);

  if (finalRes.error) return { error: finalRes.error.message };
  if (earlyRes.error) return { error: earlyRes.error.message };

  const finalOut = await dispatchEmails(
    supabase,
    (finalRes.data ?? []) as ReservationRow[],
    "reminder_sent_at",
    (r) => {
      const m = r.scheduled_at ? Math.max(0, minutesUntil(r.scheduled_at)) : 0;
      return `Reminder: your I-CarWash slot is in ${m || "a few"} minutes`;
    },
    (r) =>
      buildFinalAlertHtml(
        r,
        r.scheduled_at ? Math.max(0, minutesUntil(r.scheduled_at)) : 0,
      ),
  );

  const earlyOut = await dispatchEmails(
    supabase,
    (earlyRes.data ?? []) as ReservationRow[],
    "reminder_early_sent_at",
    () => "Your I-CarWash reservation is coming up",
    (r) =>
      buildEarlyReminderHtml(
        r,
        r.scheduled_at ? Math.max(0, minutesUntil(r.scheduled_at)) : 0,
      ),
  );

  return { early: earlyOut, final: finalOut };
}

async function runThankYous(supabase: ReturnType<typeof createClient>) {
  // Only real customer bookings (walk-ins created by camera.py have no
  // customer_id / email), completed in the last 2 days so a first deploy
  // doesn't email a huge backlog.
  const since = new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString();

  const { data, error } = await supabase
    .from("reservation")
    .select(ROW_SELECT)
    .eq("status", "Completed")
    .not("customer_id", "is", null)
    .is("thank_you_sent_at", null)
    .not("completed_at", "is", null)
    .gte("completed_at", since)
    .limit(BATCH_LIMIT);

  if (error) return { error: error.message };

  return await dispatchEmails(
    supabase,
    (data ?? []) as ReservationRow[],
    "thank_you_sent_at",
    () => "Thank you for choosing I-CarWash!",
    (r) => buildThankYouHtml(r),
  );
}

async function runCancellations(supabase: ReturnType<typeof createClient>) {
  // A paid reservation that was Voided/Cancelled (no-show sweep or the
  // customer's own "Cancel booking") and hasn't had the cancellation email
  // yet. Bounded to recent bookings so a first deploy doesn't email a big
  // backlog of old cancellations.
  const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("reservation")
    .select(ROW_SELECT)
    .in("status", ["Voided", "Cancelled"])
    .eq("payment_status", "paid")
    .not("customer_id", "is", null)
    .is("cancel_email_sent_at", null)
    .gte("reservation_date", recentDate)
    .limit(BATCH_LIMIT);

  if (error) return { error: error.message };

  return await dispatchEmails(
    supabase,
    (data ?? []) as ReservationRow[],
    "cancel_email_sent_at",
    () => "Your I-CarWash reservation was cancelled",
    (r) => buildCancellationHtml(r),
  );
}

async function runNoShowSweep(supabase: ReturnType<typeof createClient>) {
  // One authority for the rule: the SQL function. Setting status to
  // 'Voided' in there fires issue_voucher_on_void, which credits a paid
  // booking's amount back as store credit.
  const { data, error } = await supabase.rpc("sweep_no_show_reservations");
  if (error) return { error: error.message, voided: 0 };
  return { voided: Number(data ?? 0) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Sweep no-shows FIRST so any freshly-cancelled booking is picked up by
  // the cancellation-email pass in the same run.
  const noShow = await runNoShowSweep(supabase).catch((e) => ({ error: String(e) }));

  const [reminders, thankYous, cancellations] = await Promise.all([
    runReminders(supabase).catch((e) => ({ error: String(e) })),
    runThankYous(supabase).catch((e) => ({ error: String(e) })),
    runCancellations(supabase).catch((e) => ({ error: String(e) })),
  ]);

  const body = {
    providers: PROVIDERS,
    providerNote: ANY_PROVIDER
      ? undefined
      : "No email provider configured -- set BREVO_API_KEY + BREVO_SENDER_EMAIL (or RESEND_API_KEY + RESEND_FROM) as function secrets. Nothing will send until then.",
    reminders,
    thankYous,
    cancellations,
    noShow,
  };

  console.log("[send-reservation-reminders]", JSON.stringify(body));

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
