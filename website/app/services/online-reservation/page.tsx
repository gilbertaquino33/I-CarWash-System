import { ServicePageTemplate } from "@/components/ServicePageTemplate";

export const metadata = { title: "Book a Slot" };
export const revalidate = 0;

export default function OnlineReservationPage() {
  return (
    <ServicePageTemplate
      serviceType="online-reservation"
      eyebrow="Skip the line"
      title="Book a Slot"
      tagline="Pick your time in the I-CarWash app, get a reminder before it starts, and just show your QR code when you arrive."
      heroImage="https://images.unsplash.com/photo-1633014041037-f5446fb4ce99?auto=format&fit=crop&w=1600&q=80"
      included={[
        {
          title: "Pick your own time",
          description:
            "Choose the shop, the wash you want, and the time that works for you — right in the app.",
        },
        {
          title: "We remind you",
          description:
            "You get an email 1 hour and 30 minutes before your booking, so you won't forget it.",
        },
        {
          title: "Show your QR code",
          description:
            "Staff scan your code when you arrive, and the cameras know right away that it's your turn.",
        },
        {
          title: "Cancel by yourself",
          description:
            "Changed your mind? Cancel it in the app. If you already paid, you get it back as credit.",
        },
      ]}
      whyUs={[
        "Your bay is saved for you, so you don't wait in line.",
        "You get reminded before your time, so you don't miss it.",
        "The cameras know exactly when your wash starts and ends.",
        "You can cancel on your own — no need to call the shop.",
      ]}
      process={[
        { title: "Book it", description: "Pick a shop, a wash, and your time in the app." },
        { title: "Get reminded", description: "We email you 1 hour and 30 minutes before." },
        { title: "Show your code", description: "Staff scan your QR code when you arrive." },
        { title: "Rate the shop", description: "After your wash, tell others how it went." },
      ]}
      midImage={{
        src: "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1200&q=80",
        alt: "Water rinsing a freshly washed car",
      }}
      faq={[
        {
          question: "What if I don't show up?",
          answer:
            "If you don't arrive in time, your booking is cancelled on its own so another car can use the bay.",
        },
        {
          question: "Can I cancel my own booking?",
          answer:
            "Yes. Just cancel it in the app. If you already paid, the money comes back to you as a voucher you can use next time.",
        },
        {
          question: "Can I get cash back instead?",
          answer:
            "No, paid bookings are not refunded in cash. You get a voucher instead, which you can use on your next wash.",
        },
        {
          question: "How does the shop know I'm there?",
          answer:
            "When staff scan your QR code, the cameras match your car to your booking and start tracking your wash.",
        },
      ]}
    />
  );
}
