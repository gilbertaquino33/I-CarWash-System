"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarPlus, ClipboardList, Home, Loader2, LogOut, MapPinHouse, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Modal } from "@/components/account/ui";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/account", label: "Home", icon: Home },
  { href: "/account/book", label: "Book Now", icon: CalendarPlus },
  { href: "/account/home-service", label: "Home Service", icon: MapPinHouse },
  { href: "/account/bookings", label: "My Bookings", icon: ClipboardList },
  { href: "/account/profile", label: "Profile", icon: UserRound },
];

export function AccountNav({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/account" ? pathname === href : pathname.startsWith(href));

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8 xl:gap-4">
          <Link href="/" aria-label="I-CarWash home" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Account">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={isActive(t.href) ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold transition xl:px-3 ${
                  isActive(t.href) ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-50 hover:text-ink-950"
                }`}
              >
                <t.icon size={15} />
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {/* The name only fits beside the tabs on wide screens (and on phones, where the tabs move to the bottom bar). */}
            <span className="hidden max-w-[160px] truncate text-sm text-ink-500 sm:block lg:hidden xl:block">Hi, {name}</span>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label="Log out"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 transition hover:bg-ink-50 hover:text-ink-950"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Phone: bottom tab bar, like the app */}
      <nav
        aria-label="Account"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive(t.href) ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
              isActive(t.href) ? "text-brand-600" : "text-ink-400"
            }`}
          >
            <t.icon size={20} />
            <span className="truncate">{t.label.replace("Book Now", "Book")}</span>
          </Link>
        ))}
      </nav>

      <Modal open={confirmOpen} onClose={() => !signingOut && setConfirmOpen(false)} labelledBy="logout-title">
        <h2 id="logout-title" className="pr-8 text-lg font-bold text-ink-950">
          Log out?
        </h2>
        <p className="mt-2 text-sm text-ink-600">You’ll need to sign in again to book or see your bookings.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} disabled={signingOut} className="btn-outline">
            Stay signed in
          </button>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {signingOut && <Loader2 size={15} className="animate-spin" />} Log out
          </button>
        </div>
      </Modal>
    </>
  );
}
