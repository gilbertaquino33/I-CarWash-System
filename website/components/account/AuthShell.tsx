import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, QrCode, Wallet } from "lucide-react";
import { Logo } from "@/components/Logo";

const highlights = [
  { icon: CalendarCheck, text: "Reserve a date and time at a shop near you" },
  { icon: QrCode, text: "Show your QR code when you arrive" },
  { icon: Wallet, text: "Use your store credit on your next booking" },
];

// One look for Log in, Create account and Forgot password: the form on the
// left, the car-wash photo with what you can do on the right (desktop).
export function AuthShell({
  badge,
  title,
  subtitle,
  children,
  footer,
  back = { href: "/", label: "Back to website" },
}: {
  badge?: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Form side */}
      <div className="flex w-full flex-col px-5 py-8 sm:px-10 lg:w-[52%] lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link
            href={back.href}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
          >
            <ArrowLeft size={15} />
            {back.label}
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-md py-10">
            {badge}
            <h1 className={`${badge ? "mt-5" : ""} font-display text-3xl font-bold tracking-tight text-ink-950`}>{title}</h1>
            <div className="mt-2 text-ink-500">{subtitle}</div>
            {children}
            {footer && <div className="mt-8 border-t border-ink-100 pt-6 text-center text-sm text-ink-500">{footer}</div>}
          </div>
        </div>
      </div>

      {/* Visual side */}
      <div className="relative hidden lg:block lg:w-[48%]">
        <Image
          src="https://images.unsplash.com/photo-1608506375591-b90e1f955e4b?auto=format&fit=crop&w=1200&q=80"
          alt="Foam being sprayed onto a car during a professional wash"
          fill
          priority
          sizes="48vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-ink-950/95 via-ink-950/80 to-brand-900/70" />
        <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-25" />

        <div className="relative flex h-full flex-col justify-end p-12">
          <h2 className="max-w-sm font-display text-3xl font-bold leading-tight text-white">
            Your car wash, booked in a minute.
          </h2>
          <p className="mt-4 max-w-sm text-white/60">
            Same account as the I-CarWash app — your bookings, QR codes and store credit are here too.
          </p>
          <ul className="mt-9 space-y-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm text-white/75">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-brand-300 backdrop-blur">
                  <item.icon size={17} />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
      {children}
    </p>
  );
}

export function FormSuccess({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">{children}</p>;
}
