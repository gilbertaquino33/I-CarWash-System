"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { APP_DOWNLOAD_URL } from "@/lib/app";

const DISMISS_KEY = "icarwash-app-promo-dismissed-at";
const SHOW_AFTER_MS = 6000;
const HIDE_FOR_DAYS = 3;

// Small card that slides in on the public pages to tell visitors about the
// app. "Not now" hides it for a few days (remembered in this browser only).
export function AppPromoPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < HIDE_FOR_DAYS * 86400000) return;
    } catch {
      // Storage blocked (private mode): still fine to show it.
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Get the I-CarWash app"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm animate-[fadeUp_0.35s_ease-out] rounded-2xl border border-ink-100 bg-white p-5 shadow-lift sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-3 top-3 rounded-lg p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Smartphone size={20} />
        </span>
        <div>
          <p className="font-display text-base font-bold text-ink-950">Book faster with the app</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            Reserve a slot, get reminders before your wash, and check in with a QR code. It&apos;s free.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <a href={APP_DOWNLOAD_URL} onClick={dismiss} className="btn-primary flex-1 justify-center">
          Download the app
        </a>
        <button type="button" onClick={dismiss} className="btn-outline">
          Not now
        </button>
      </div>
    </div>
  );
}
