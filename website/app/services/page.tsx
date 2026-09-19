import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ServiceCard } from "@/components/ServiceCard";

export const metadata = { title: "Services" };

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
      "Can't go to the shop? Book and they'll come to your house or office.",
    image:
      "https://images.unsplash.com/photo-1694025909289-fb9dd4660e97?auto=format&fit=crop&w=800&q=80",
    badge: "They come to you",
  },
];

export default function ServicesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-ink-100 bg-ink-950">
          <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-25" />
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />

          <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
              What we offer
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Three ways to get a wash
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/65">
              Whichever one you pick, the same cameras follow your wash from
              start to finish.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.href} {...service} />
            ))}
          </div>

          <div className="mt-14 overflow-hidden rounded-3xl border border-ink-100 bg-ink-50/60 px-8 py-12 text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-950">
              Not sure which one to pick?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-ink-500">
              Send a message and the shop will help you choose what your car
              needs.
            </p>
            <Link href="/#quote" className="btn-primary mt-7">
              Ask for a Price
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
