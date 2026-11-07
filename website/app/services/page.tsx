import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PageHero } from "@/components/PageHero";
import { ServiceCard } from "@/components/ServiceCard";

export const metadata = { title: "Services" };

const services = [
  {
    href: "/services/walk-in-wash",
    title: "Walk-In",
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
        <PageHero
          eyebrow="What we offer"
          title="3 ways to get your car clean."
          description="Choose how you want your car cleaned."
          image="https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1920&q=80"
        />

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.href} {...service} />
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
