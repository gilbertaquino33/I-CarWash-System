"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ServiceType } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SERVICE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: "walk-in-wash", label: "Walk-In Wash" },
  { value: "online-reservation", label: "Book a Slot" },
  { value: "home-service", label: "Home Service" },
];

export function QuoteForm({
  shops,
  defaultServiceType,
}: {
  shops: { id: number; shop_name: string }[];
  defaultServiceType?: ServiceType;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shopId, setShopId] = useState<number | "">(shops[0]?.id ?? "");
  const [serviceType, setServiceType] = useState<ServiceType>(
    defaultServiceType ?? "online-reservation"
  );
  const [preferredDate, setPreferredDate] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: real visitors never see or fill this field. If it's filled,
  // the submission is silently dropped without hitting the database.
  const [company, setCompany] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (company.trim()) {
      setSubmitted(true);
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName) return setError("Please type your name.");
    if (!EMAIL_RE.test(trimmedEmail)) return setError("Please type a correct email address.");
    if (!trimmedPhone) return setError("Please type your phone number.");
    if (!shopId) return setError("Please choose a shop.");

    setSubmitting(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("quote_requests").insert({
      shop_id: shopId,
      full_name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      service_type: serviceType,
      preferred_date: preferredDate || null,
      message: message.trim() || null,
      status: "new",
    });
    setSubmitting(false);

    if (insertError) {
      setError("Sorry, we couldn't send your message. Please try again.");
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-ink-100 bg-white p-10 text-center shadow-lift">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <CheckCircle2 size={26} />
        </span>
        <h3 className="mt-5 font-display text-xl font-bold text-ink-950">
          Message sent!
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-500">
          The shop you picked will message you back soon about your wash.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-ink-100 bg-white p-6 shadow-lift sm:p-8"
    >
      {/* Honeypot field: hidden from real users, bots often fill every field. */}
      <div className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Company
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="label">Your name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="field"
            placeholder="Juan Dela Cruz"
            suppressHydrationWarning
          />
        </div>
        <div>
          <label className="label">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="field"
            placeholder="09xx xxx xxxx"
            suppressHydrationWarning
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="you@email.com"
            suppressHydrationWarning
          />
        </div>

        <div>
          <label className="label">Which shop?</label>
          <select
            value={shopId}
            onChange={(e) => setShopId(Number(e.target.value))}
            className="field"
            suppressHydrationWarning
          >
            {shops.length === 0 && <option value="">No shops yet</option>}
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.shop_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">What do you need?</label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType)}
            className="field"
            suppressHydrationWarning
          >
            {SERVICE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label">
            When do you want it? <span className="font-normal text-ink-400">(you can skip this)</span>
          </label>
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            className="field"
            suppressHydrationWarning
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label">
            Message <span className="font-normal text-ink-400">(you can skip this)</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={2000}
            className="field resize-none"
            placeholder="Anything the shop should know?"
            suppressHydrationWarning
          />
        </div>
      </div>

      {error && (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || shops.length === 0}
        className="btn-primary mt-6 w-full disabled:opacity-60"
        suppressHydrationWarning
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send size={15} />
            Send my message
          </>
        )}
      </button>

      <p className="mt-4 text-center text-xs text-ink-400">
        Only the shop you pick can see what you sent.
      </p>
    </form>
  );
}
