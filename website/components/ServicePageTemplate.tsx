import Image from "next/image";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { FaqAccordion, type FaqItem } from "./FaqAccordion";

export interface ServicePageContent {
  eyebrow: string;
  title: string;
  tagline: string;
  heroImage: string;
  included: { title: string; description: string }[];
  whyUs: string[];
  process: { title: string; description: string }[];
  midImage: { src: string; alt: string };
  faq: FaqItem[];
}

export async function ServicePageTemplate(content: ServicePageContent) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-ink-950">
          <Image
            src={content.heroImage}
            alt={content.title}
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-[0.3]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-950/85 to-brand-900/60" />
          <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-25" />

          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <nav className="flex items-center gap-1.5 text-xs text-white/50">
              <Link href="/" className="transition hover:text-white">
                Home
              </Link>
              <ChevronRight size={12} />
              <Link href="/services" className="transition hover:text-white">
                Services
              </Link>
              <ChevronRight size={12} />
              <span className="text-white/80">{content.title}</span>
            </nav>

            <span className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
              {content.eyebrow}
            </span>

            <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
              {content.title}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              {content.tagline}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/shops" className="btn-primary">
                Find a Shop
              </Link>
            </div>
          </div>
        </section>

        {/* ── What's included ──────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-xl">
            <span className="eyebrow">
              <span className="h-px w-6 bg-brand-500" />
              What you get
            </span>
            <h2 className="section-title">What You Get</h2>
            <p className="mt-4 text-ink-500">
              Everything you need for a smoother car wash experience.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {content.included.map((item, i) => (
              <div
                key={item.title}
                className="group rounded-2xl border border-ink-100 bg-white p-6 transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 font-display text-sm font-bold text-white">
                  {String(i + 1).padStart(2, "0")}
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
        </section>

        {/* ── Why us + image ───────────────────────────────── */}
        <section className="border-y border-ink-100 bg-ink-50/60 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
            <div>
              <span className="eyebrow">
                <span className="h-px w-6 bg-brand-500" />
                Why us
              </span>
              <h2 className="section-title">Why people like this</h2>
              <ul className="mt-9 space-y-5">
                {content.whyUs.map((point) => (
                  <li key={point} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="text-sm leading-relaxed text-ink-700">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative h-80 w-full overflow-hidden rounded-3xl shadow-lift sm:h-[26rem]">
              <Image
                src={content.midImage.src}
                alt={content.midImage.alt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ── Process ──────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-xl">
            <span className="eyebrow">
              <span className="h-px w-6 bg-brand-500" />
              How it works
            </span>
            <h2 className="section-title">Four easy steps</h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {content.process.map((step, i) => (
              <div key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  {i < content.process.length - 1 && (
                    <span className="hidden h-px flex-1 bg-ink-200 lg:block" />
                  )}
                </div>
                <h3 className="mt-5 font-display text-base font-semibold text-ink-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section className="border-y border-ink-100 bg-ink-50/60 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <span className="eyebrow">
                <span className="h-px w-6 bg-brand-500" />
                Questions
              </span>
              <h2 className="section-title">Common questions</h2>
              <p className="mt-4 text-ink-500">
                Still not sure? Send a message below and the shop will answer you.
              </p>
            </div>
            <FaqAccordion items={content.faq} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
