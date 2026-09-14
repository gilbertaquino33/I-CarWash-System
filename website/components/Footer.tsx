import Link from "next/link";
import { ArrowUpRight, Lock, MapPin, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";

const serviceLinks = [
  { href: "/services/walk-in-wash", label: "Walk-In Wash" },
  { href: "/services/online-reservation", label: "Book a Slot" },
  { href: "/services/home-service", label: "Home Service" },
];

const quickLinks = [
  { href: "/shops", label: "Find a Shop" },
  { href: "/#reviews", label: "Reviews" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#for-owners", label: "Add Your Shop" },
  { href: "/login", label: "Shop Owner Login" },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid bg-[size:44px_44px] opacity-[0.35]" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
              Smart cameras that help car wash shops work better — live bay
              tracking, easy booking, and real customer reviews.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70">
                <Lock size={11} className="text-brand-400" />
                Safe connection
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70">
                <ShieldCheck size={11} className="text-brand-400" />
                Checked reviews
              </span>
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-white">Services</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {serviceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/55 transition hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-white">Quick Links</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/55 transition hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-white">
              Need a wash?
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              Tell the shop what you need and they&apos;ll message you back.
            </p>
            <Link
              href="/#quote"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Ask for a Price
              <ArrowUpRight size={15} />
            </Link>
            <p className="mt-5 flex items-start gap-2 text-xs text-white/45">
              <MapPin size={13} className="mt-0.5 shrink-0" />
              We serve car wash shops around the Philippines
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} I-CarWash. All rights reserved.</span>
          <span>Made for car wash shops · Powered by smart cameras</span>
        </div>
      </div>
    </footer>
  );
}
