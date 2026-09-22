import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Banknote, BarChart3, ShieldCheck, Star } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Shop Login",
};

const highlights = [
  { icon: BarChart3, text: "See which bays are free or busy" },
  { icon: Star, text: "Check reviews before they show up" },
  { icon: Banknote, text: "Track today's sales in real time" },
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Form side */}
      <div className="flex w-full flex-col px-5 py-8 sm:px-10 lg:w-[52%] lg:px-16">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
          >
            <ArrowLeft size={15} />
            Back to website
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-md py-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <ShieldCheck size={12} />
              Staff only
            </span>

            <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink-950">
              Welcome back
            </h1>
            <p className="mt-2 text-ink-500">
              Sign in to manage your shop. This login is only for shop{" "}
              <span className="font-medium text-ink-700">owners and staff</span>.
            </p>

            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>

            <p className="mt-8 border-t border-ink-100 pt-6 text-center text-sm text-ink-500">
              Want to find a shop or leave a review?{" "}
              <Link href="/shops" className="font-semibold text-brand-600 hover:text-brand-700">
                See all shops
              </Link>
            </p>
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
            Everything for your shop, in one place.
          </h2>
          <p className="mt-4 max-w-sm text-white/60">
            See how your shop is doing, check reviews, and read messages from
            customers.
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
