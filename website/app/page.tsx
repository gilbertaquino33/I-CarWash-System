import { FaqAccordion } from "@/components/FaqAccordion";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { QuoteForm } from "@/components/QuoteForm";
import { ServiceCard } from "@/components/ServiceCard";
import { Testimonials } from "@/components/Testimonials";
import { OWNER_AGENT_EMAIL } from "@/lib/site-config";
import { createClient } from "@/lib/supabase/server";
import type { ShopReview } from "@/lib/types";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Camera,
  CheckCircle2,
  Headset,
  Lock,
  Mail,
  QrCode,
  ShieldCheck,
  Star,
  Ticket,
  Timer,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 0;

const services = [
  {
    href: "/services/walk-in-wash",
    title: "Walk-In Wash",
    description:
      "Just drive in — no booking needed. Our cameras follow your wash from start to finish.",
    image:
      "https://images.unsplash.com/photo-1608506375591-b90e1f955e4b?auto=format&fit=crop&w=800&q=80",
    badge: "No booking needed",
  },
  {
    href: "/services/online-reservation",
    title: "Book a Slot",
    description:
      "Pick a time in the app, get a reminder, then show your QR code when you arrive.",
    image:
      "https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&w=800&q=80",
    badge: "Most picked",
  },
  {
    href: "/services/home-service",
    title: "Home Service",
    description:
      "Can't go to the shop? Book a wash at your house or office and they'll come to you.",
    image:
      "https://images.unsplash.com/photo-1694025909289-fb9dd4660e97?auto=format&fit=crop&w=800&q=80",
    badge: "They come to you",
  },
];

const whyUs = [
  {
    icon: Camera,
    title: "We watch every bay",
    description:
      "Cameras check each wash bay, so the shop always knows which ones are free, busy, or taken.",
  },
  {
    icon: Timer,
    title: "No double booking",
    description:
      "Walk-ins and online bookings go into one list, so two cars never get the same slot.",
  },
  {
    icon: BellRing,
    title: "We remind you",
    description:
      "You get an email 1 hour and 30 minutes before your booking, so you won't forget it.",
  },
  {
    icon: Ticket,
    title: "Cancel anytime",
    description:
      "Changed your mind? Cancel it yourself. If you already paid, you get it back as credit.",
  },
  {
    icon: QrCode,
    title: "Fast check-in",
    description:
      "Just show your QR code. Staff scan it and the system knows it's your turn.",
  },
  {
    icon: ShieldCheck,
    title: "Real reviews only",
    description:
      "The shop checks every review before it shows up, so the ratings you read are honest.",
  },
];

const steps = [
  {
    title: "Find a shop",
    description: "Look for a shop near you and see what other people said about it.",
  },
  {
    title: "Book or drive in",
    description: "Book a slot in the app to be sure of your time, or just drive in.",
  },
  {
    title: "We follow your wash",
    description: "Cameras see when your wash starts and when it's done.",
  },
  {
    title: "Tell us how it went",
    description: "Leave a review. No account needed — just your name and email.",
  },
];

const homeFaq = [
  {
    question: "Do I need an account to leave a review?",
    answer:
      "No. Just type your name, email, and what you think. The shop checks it first, then it shows up on their page.",
  },
  {
    question: "Can I log in here as a customer?",
    answer:
      "This login is only for shop owners and their staff. If you're a customer, use the I-CarWash app to book your wash.",
  },
  {
    question: "What if I'm late or can't come?",
    answer:
      "If you don't arrive on time, your booking is cancelled so another car can use the bay. You can also cancel it yourself in the app.",
  },
  {
    question: "Can I get my money back if I cancel?",
    answer:
      "Yes, but as credit. Cancel in the app and what you paid comes back as a voucher you can use on your next wash.",
  },
  {
    question: "Is my information safe here?",
    answer:
      "Yes. Everything you type is sent through a safe, locked connection, and we block spam and bad data.",
  },
];

async function getHomeData() {
  const supabase = await createClient();

  const [{ count: shopCount }, { data: shops }, { data: reviews }, { data: stats }] =
    await Promise.all([
      supabase.from("shop_profile_setup").select("id", { count: "exact", head: true }),
      supabase
        .from("shop_profile_setup")
        .select("id, shop_name")
        .order("shop_name", { ascending: true }),
      supabase
        .from("shop_reviews")
        .select(
          "id, shop_id, customer_name, customer_email, rating, comment, status, created_at, shop_profile_setup(shop_name)"
        )
        .eq("status", "approved")
        .order("rating", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6),
      supabase.from("shop_review_stats").select("review_count, avg_rating"),
    ]);

  const testimonials = (reviews ?? []).map((r) => {
    const raw = r as unknown as ShopReview & {
      shop_profile_setup: { shop_name: string } | { shop_name: string }[] | null;
    };
    const shopRel = raw.shop_profile_setup;
    const shop_name = Array.isArray(shopRel) ? shopRel[0]?.shop_name : shopRel?.shop_name;
    return { ...raw, shop_name };
  });

  const totalReviews = (stats ?? []).reduce((sum, s) => sum + (s.review_count ?? 0), 0);
  const weighted = (stats ?? []).reduce(
    (sum, s) => sum + (s.avg_rating ?? 0) * (s.review_count ?? 0),
    0
  );
  const networkRating = totalReviews > 0 ? (weighted / totalReviews).toFixed(1) : null;

  return {
    shopCount: shopCount ?? 0,
    shops: shops ?? [],
    testimonials,
    totalReviews,
    networkRating,
  };
}

export default async function HomePage() {
  const { shopCount, shops, testimonials, totalReviews, networkRating } =
    await getHomeData();

  // Rating/review stats only make sense once reviews exist; until then show
  // facts that are always true so the hero never renders empty placeholders.
  const heroStats = [
    { value: `${shopCount}`, label: shopCount === 1 ? "Car wash shop" : "Car wash shops" },
    { value: "Live", label: "Bay tracking" },
    ...(totalReviews > 0
      ? [
          { value: networkRating!, label: "Star rating" },
          { value: `${totalReviews}`, label: "Real reviews" },
        ]
      : [
          { value: "3", label: "Ways to book" },
          { value: "QR", label: "Fast check-in" },
        ]),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-ink-950">
          <Image
            src="https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&w=1920&q=80"
            alt="Car covered in soap during a wash"
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-[0.28]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-950/85 to-brand-900/70" />
          <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-30" />
          <div className="absolute -right-32 top-10 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
                <Camera size={13} className="text-brand-300" />
                Watched by smart cameras
              </span>

              <h1 className="mt-6 max-w-2xl text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Make your reservation now.
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
                We use smart cameras to watch every wash bay. So you can see
                which shops are free, book your time, and tell others how your
                wash went.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/services/online-reservation" className="btn-primary">
                  Make a Reservation
                  <ArrowRight size={16} />
                </Link>
                <Link href="/shops" className="btn-ghost-light">
                  Find a Shop
                </Link>
              </div>

              <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/10 pt-8 sm:grid-cols-4">
                {heroStats.map((stat) => (
                  <div key={stat.label}>
                    <p className="font-display text-2xl font-bold text-white">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-white/50">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating visual card */}
            <div className="relative hidden lg:block">
              <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1694678505383-676d78ea3b96?auto=format&fit=crop&w=900&q=80"
                  alt="Staff washing a car by hand"
                  width={900}
                  height={1100}
                  className="h-[460px] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
              </div>

              <div className="absolute -left-8 bottom-10 w-60 rounded-2xl border border-ink-100 bg-white p-4 shadow-lift">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <CheckCircle2 size={16} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-ink-950">Bay 2 · Busy</p>
                    <p className="text-[11px] text-ink-400">Seen by the camera</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full w-2/3 rounded-full bg-brand-500" />
                </div>
              </div>

              <div className="absolute -right-4 top-8 rounded-2xl border border-ink-100 bg-white px-4 py-3 shadow-lift">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={13} className="fill-brand-500 text-brand-500" />
                  ))}
                </div>
                <p className="mt-1 text-[11px] font-medium text-ink-500">
                  Reviews from real customers
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Services ─────────────────────────────────────── */}
        <section id="services" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <span className="eyebrow">
                <span className="h-px w-6 bg-brand-500" />
                What we offer
              </span>
              <h2 className="section-title">Three easy ways to get a wash</h2>
              <p className="mt-4 text-ink-500">
                Pick the one that fits your day. All three use the same camera
                tracking.
              </p>
            </div>
            <Link
              href="/services"
              className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-600"
            >
              See all
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.href} {...service} />
            ))}
          </div>
        </section>

        {/* ── Why us ───────────────────────────────────────── */}
        <section id="why-us" className="border-y border-ink-100 bg-ink-50/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <span className="eyebrow">
                <span className="h-px w-6 bg-brand-500" />
                Why us
              </span>
              <h2 className="section-title">Why people pick I-CarWash</h2>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {whyUs.map((item) => (
                <div
                  key={item.title}
                  className="group rounded-2xl border border-ink-100 bg-white p-6 transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
                    <item.icon size={19} />
                  </span>
                  <h3 className="mt-5 font-display text-base font-semibold text-ink-950">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────── */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <span className="eyebrow">
                <span className="h-px w-6 bg-brand-500" />
                How it works
              </span>
              <h2 className="section-title">Four easy steps</h2>

              <ol className="mt-10 space-y-7">
                {steps.map((step, i) => (
                  <li key={step.title} className="relative flex gap-5">
                    {i < steps.length - 1 && (
                      <span className="absolute left-[19px] top-11 h-[calc(100%+0.75rem)] w-px bg-ink-200" />
                    )}
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-950 font-display text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="pt-1">
                      <h3 className="font-display text-base font-semibold text-ink-950">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative col-span-2 h-56 overflow-hidden rounded-3xl sm:h-64">
                <Image
                  src="https://images.unsplash.com/photo-1565689876697-e467b6c54da2?auto=format&fit=crop&w=1000&q=80"
                  alt="Car wheel being cleaned"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="relative h-44 overflow-hidden rounded-3xl sm:h-52">
                <Image
                  src="https://images.unsplash.com/photo-1732357624591-f2137085659b?auto=format&fit=crop&w=600&q=80"
                  alt="Car being wiped with a cloth"
                  fill
                  sizes="25vw"
                  className="object-cover"
                />
              </div>
              <div className="relative h-44 overflow-hidden rounded-3xl sm:h-52">
                <Image
                  src="https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=600&q=80"
                  alt="Water rinsing a car"
                  fill
                  sizes="25vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Reviews ──────────────────────────────────────── */}
        <section id="reviews" className="border-y border-ink-100 bg-ink-50/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div className="max-w-xl">
                <span className="eyebrow">
                  <span className="h-px w-6 bg-brand-500" />
                  Reviews
                </span>
                <h2 className="section-title">What customers say</h2>
                <p className="mt-4 text-ink-500">
                  Every review here was written by a customer and checked by the
                  shop before it went up.
                </p>
              </div>
              <Link
                href="/shops"
                className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-600"
              >
                See all shops
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="mt-8">
              <Testimonials reviews={testimonials} />
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <span className="eyebrow">
                <span className="h-px w-6 bg-brand-500" />
                Questions
              </span>
              <h2 className="section-title">Common questions</h2>
              <p className="mt-4 text-ink-500">
                Can&apos;t find your answer? Send a message below and the shop
                will reply to you.
              </p>
              <Link href="#quote" className="btn-outline mt-6">
                Ask a question
                <ArrowRight size={15} />
              </Link>
            </div>
            <FaqAccordion items={homeFaq} />
          </div>
        </section>

        {/* ── Quote form ───────────────────────────────────── */}
        <section id="quote" className="scroll-mt-24 relative overflow-hidden bg-ink-950 py-16 sm:py-20">
          <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-25" />
          <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-brand-600/20 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
                <span className="h-px w-6 bg-brand-400" />
                Get started
              </span>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Ask for a price
              </h2>
              <p className="mt-4 text-white/60">
                Tell the shop what you need and they&apos;ll message you back.
                You don&apos;t need an account.
              </p>

              <ul className="mt-8 space-y-4">
                {[
                  { icon: CalendarCheck, text: "Pick the service and day you want" },
                  { icon: ShieldCheck, text: "Only the shop you pick can see it" },
                  { icon: Lock, text: "Sent through a safe connection" },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-3 text-sm text-white/70">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-brand-300">
                      <item.icon size={16} />
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>

            <QuoteForm shops={shops} />
          </div>
        </section>

        {/* ── For shop owners: talk to an agent ───────────── */}
        <section id="for-owners" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="overflow-hidden rounded-3xl border border-ink-100 bg-ink-50/60">
            <div className="grid lg:grid-cols-2">
              <div className="p-9 sm:p-12">
                <span className="eyebrow">
                  <span className="h-px w-6 bg-brand-500" />
                  For shop owners
                </span>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                  Want your car wash on{" "}
                  <span className="whitespace-nowrap">I-CarWash</span>?
                </h2>
                <p className="mt-4 text-ink-500">
                  Talk to our agent. They will walk you through it, set up your
                  shop account, and show you how the cameras and booking work.
                </p>

                <ol className="mt-7 space-y-4">
                  {[
                    "Message our agent using the details on the right.",
                    "The agent will call you and explain how it works.",
                    "We set up your shop, your bays, and your staff accounts.",
                    "You log in here and start taking bookings.",
                  ].map((step, i) => (
                    <li key={step} className="flex items-start gap-3.5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed text-ink-700">{step}</span>
                    </li>
                  ))}
                </ol>

                <Link href="/login" className="btn-outline mt-8">
                  I already have an account
                  <ArrowRight size={15} />
                </Link>
              </div>

              {/* Agent contact card */}
              <div className="relative flex flex-col justify-center bg-ink-950 p-9 sm:p-12">
                <div className="absolute inset-0 bg-grid bg-[size:44px_44px] opacity-25" />
                <div className="absolute -right-16 top-0 h-64 w-64 rounded-full bg-brand-600/25 blur-3xl" />

                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
                    <Headset size={13} className="text-brand-300" />
                    Talk to our agent
                  </span>

                  <h3 className="mt-6 font-display text-xl font-bold text-white">
                    We&apos;ll help you get started
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Send us a message and our agent will get back to you about
                    putting your shop on I-CarWash.
                  </p>

                  <a
                    href={`mailto:${OWNER_AGENT_EMAIL}?subject=${encodeURIComponent(
                      "I want to add my car wash to I-CarWash"
                    )}&body=${encodeURIComponent(
                      "Hi I-CarWash team,\n\nI own a car wash and I want to join I-CarWash.\n\nShop name:\nAddress:\nNumber of bays:\nMy contact number:\n\nThank you!"
                    )}`}
                    className="mt-7 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                      <Mail size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] uppercase tracking-wide text-white/45">
                        Email our agent
                      </span>
                      <span className="block truncate text-sm font-semibold text-white">
                        {OWNER_AGENT_EMAIL}
                      </span>
                    </span>
                  </a>

                  <a
                    href={`mailto:${OWNER_AGENT_EMAIL}?subject=${encodeURIComponent(
                      "I want to add my car wash to I-CarWash"
                    )}`}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
                  >
                    <Mail size={15} />
                    Message the agent
                  </a>

                  <p className="mt-4 text-xs text-white/45">
                    Our agent usually replies within one working day.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
