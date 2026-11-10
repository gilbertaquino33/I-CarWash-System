"use client";

import { useEffect, useState } from "react";
import { BellRing, Download, MapPin, ShieldCheck, Smartphone, X, Zap } from "lucide-react";
import { APP_DOWNLOAD_URL } from "@/lib/app";

const HIDE_KEY = "icw-hide-app-tip";
const HIDE_DAYS = 7;

const perks = [
  { icon: BellRing, title: "Reminders", text: "1 hour and 30 minutes before your slot" },
  { icon: Zap, title: "Faster", text: "Your QR code and booking in one tap" },
  { icon: MapPin, title: "Automatic", text: "Finds the branches in your town for you" },
  { icon: ShieldCheck, title: "Safer", text: "GCash pays inside the app; you stay signed in" },
];

function useHidden() {
  const [hidden, setHidden] = useState(true); // avoid a flash before we know
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(HIDE_KEY) ?? 0);
      setHidden(Date.now() < until);
    } catch {
      setHidden(false);
    }
  }, []);
  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86400000));
    } catch {}
    setHidden(true);
  };
  return { hidden, hide };
}

// "Book faster and safer in the app" -- the website works fully, but the app
// is the better experience (push reminders, one-tap QR, GPS).
export function GetTheApp({ compact = false }: { compact?: boolean }) {
  const { hidden, hide } = useHidden();
  if (hidden) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
        <Smartphone size={20} className="shrink-0 text-brand-600" />
        <p className="flex-1 text-sm text-ink-700">
          <b className="text-ink-950">Tip:</b> booking is faster and safer in the I-CarWash app — and it reminds you before your slot.
        </p>
        <a href={APP_DOWNLOAD_URL} className="hidden shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600 sm:inline-flex">
          Get the app
        </a>
        <button type="button" aria-label="Hide this tip" onClick={hide} className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink-950 p-6 text-white sm:p-7">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
      <button
        type="button"
        aria-label="Hide this for a week"
        onClick={hide}
        className="absolute right-4 top-4 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
      >
        <X size={17} />
      </button>
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-200">
          <Smartphone size={12} /> Recommended
        </span>
        <h2 className="mt-3 font-display text-xl font-bold sm:text-2xl">Book faster and safer in the app</h2>
        <p className="mt-1.5 max-w-xl text-sm text-white/65">
          Everything here works, but the I-CarWash app gives you the best experience. Same account — just log in.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p) => (
            <li key={p.title} className="flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              <p.icon size={18} className="mt-0.5 shrink-0 text-brand-300" />
              <span>
                <span className="block text-sm font-bold">{p.title}</span>
                <span className="text-xs text-white/60">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <a
          href={APP_DOWNLOAD_URL}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:bg-brand-50"
        >
          <Download size={16} /> Download for Android
        </a>
      </div>
    </section>
  );
}
