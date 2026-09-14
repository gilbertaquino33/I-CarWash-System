"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATING_LABELS: Record<number, string> = {
  1: "Bad",
  2: "Just okay",
  3: "Good",
  4: "Very good",
  5: "The best",
};

export function ReviewForm({ shopId }: { shopId: number }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  // Honeypot: hidden from real users; bots that fill it get silently dropped.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (website.trim()) {
      setSubmitted(true);
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedComment = comment.trim();

    if (!trimmedName) return setError("Please type your name.");
    if (!EMAIL_RE.test(trimmedEmail)) return setError("Please type a correct email address.");
    if (!trimmedComment) return setError("Please tell us how your wash went.");

    setSubmitting(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("shop_reviews").insert({
      shop_id: shopId,
      customer_name: trimmedName,
      customer_email: trimmedEmail,
      rating,
      comment: trimmedComment,
      status: "pending",
    });
    setSubmitting(false);

    if (insertError) {
      setError("Sorry, we couldn't send your review. Please try again.");
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <CheckCircle2 size={26} />
        </span>
        <h3 className="mt-5 font-display text-lg font-bold text-ink-950">
          Salamat for your review!
        </h3>
        <p className="mt-2 text-sm text-ink-500">
          The shop will check it first. After that, it will show up on this page.
        </p>
      </div>
    );
  }

  const activeRating = hoverRating ?? rating;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-7"
    >
      <h3 className="font-display text-lg font-bold text-ink-950">
        How was your wash?
      </h3>
      <p className="mt-1.5 text-sm text-ink-500">
        Tell others about it. We ask for your email so we know you&apos;re a
        real person — it never shows on the page.
      </p>

      <div className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6 rounded-2xl bg-ink-50/70 p-4">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const value = i + 1;
            return (
              <button
                key={value}
                type="button"
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                onMouseEnter={() => setHoverRating(value)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => setRating(value)}
                className="p-0.5 transition hover:scale-110"
                suppressHydrationWarning
              >
                <Star
                  size={28}
                  className={
                    value <= activeRating
                      ? "fill-brand-500 text-brand-500"
                      : "fill-ink-200 text-ink-200"
                  }
                />
              </button>
            );
          })}
          <span className="ml-2 text-sm font-semibold text-ink-700">
            {RATING_LABELS[activeRating]}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            placeholder="Juan Dela Cruz"
            suppressHydrationWarning
          />
        </div>
        <div>
          <label className="label">Your email</label>
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
          <label className="label">What happened?</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={2000}
            className="field resize-none"
            placeholder="Was the shop fast? Was your car clean? Tell us about it."
            suppressHydrationWarning
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary mt-5 w-full disabled:opacity-60"
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
            Send my review
          </>
        )}
      </button>
    </form>
  );
}
