"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  LogIn,
  Menu,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { Logo } from "./Logo";

const links = [
  { href: "/services", label: "Services" },
  { href: "/#why-us", label: "Why Us" },
  { href: "/#reviews", label: "Reviews" },
  { href: "/#faq", label: "FAQ" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Trust bar */}
      <div className="hidden bg-ink-950 py-2 text-white md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 text-xs">
          <span className="flex items-center gap-2 text-white/70">
            <Sparkles size={13} className="text-brand-400" />
            Car wash shops watched by smart cameras
          </span>
          <span className="flex items-center gap-5 text-white/70">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-brand-400" />
              Real, checked reviews
            </span>
            <span className="flex items-center gap-1.5">
              <Store size={13} className="text-brand-400" />
              Shops around the Philippines
            </span>
          </span>
        </div>
      </div>

      <header
        className={`sticky top-0 z-50 border-b transition-all duration-200 ${
          scrolled
            ? "border-ink-100 bg-white/90 shadow-sm backdrop-blur-md"
            : "border-transparent bg-white"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-950"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2.5 lg:flex">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              <LogIn size={15} />
              Staff Login
            </Link>
            <Link
              href="/shops"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-600"
            >
              Find a Shop
              <ArrowRight size={15} />
            </Link>
          </div>

          <button suppressHydrationWarning
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-200 text-ink-900 transition hover:bg-ink-50 lg:hidden"
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>

        {/* Mobile drawer */}
        <div
          className={`grid overflow-hidden border-ink-100 bg-white transition-all duration-300 lg:hidden ${
            open ? "grid-rows-[1fr] border-t" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <nav className="flex flex-col gap-0.5 px-5 py-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
                >
                  {link.label}
                  <ChevronDown size={15} className="-rotate-90 text-ink-300" />
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-4">
                <Link href="/shops" onClick={() => setOpen(false)} className="btn-primary w-full">
                  Find a Shop
                  <ArrowRight size={15} />
                </Link>
                <Link href="/login" onClick={() => setOpen(false)} className="btn-outline w-full">
                  <LogIn size={15} />
                  Staff / Admin Login
                </Link>
              </div>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
