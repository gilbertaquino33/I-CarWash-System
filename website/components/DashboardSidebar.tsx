"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  ListOrdered,
  ExternalLink,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  Star,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { LogoMark } from "./Logo";
import type { ProfileRole } from "@/lib/types";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function DashboardSidebar({
  role,
  fullName,
  email,
  shopName,
}: {
  role: ProfileRole;
  fullName: string;
  email: string;
  shopName?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const links: NavLink[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/queue", label: "Waiting Queue", icon: ListOrdered },
    { href: "/dashboard/reservations", label: "Reservations", icon: CalendarClock },
    { href: "/dashboard/home-service", label: "Home Service", icon: Home },
    { href: "/dashboard/schedule", label: "Today's Schedule", icon: CalendarClock },
    ...(role === "admin"
      ? [
          { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
          { href: "/dashboard/staff", label: "Staff", icon: Users },
          { href: "/dashboard/reviews", label: "Reviews", icon: Star },
          { href: "/dashboard/inquiries", label: "Messages", icon: Inbox },
        ]
      : []),
    { href: "/dashboard/profile", label: "My Account", icon: UserRound },
  ];

  const handleSignOut = async () => {
    setSigningOut(true);
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Manage
      </p>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-white/10 text-white"
                : "text-white/55 hover:bg-white/5 hover:text-white"
            }`}
          >
            <link.icon
              size={17}
              className={active ? "text-brand-300" : "text-white/40 group-hover:text-white/70"}
            />
            {link.label}
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" />}
          </Link>
        );
      })}

      <div className="mt-5 border-t border-white/10 pt-4">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/55 transition hover:bg-white/5 hover:text-white"
        >
          <ExternalLink size={17} className="text-white/40" />
          See my website
        </Link>
      </div>
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-4">
      <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-xs font-bold text-white">
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{fullName}</p>
          <p className="truncate text-[11px] text-white/45">{email}</p>
        </div>
      </div>
      <button suppressHydrationWarning
        onClick={handleSignOut}
        disabled={signingOut}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
      >
        <LogOut size={15} />
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <LogoMark className="h-9 w-9" />
      <div className="min-w-0">
        <p className="font-display text-sm font-bold text-white">I-CarWash</p>
        <p className="truncate text-[11px] text-white/45">
          {shopName || (role === "admin" ? "Shop owner" : "Staff")}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-ink-100 bg-white px-5 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="font-display text-sm font-bold text-ink-950">I-CarWash</span>
        </div>
        <button suppressHydrationWarning
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 text-ink-900"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-ink-950">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button suppressHydrationWarning
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-950 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>
    </>
  );
}
