import { ServicePageTemplate } from "@/components/ServicePageTemplate";

export const metadata = { title: "Walk-In Wash" };
export const revalidate = 0;

export default function WalkInWashPage() {
  return (
    <ServicePageTemplate
      serviceType="walk-in-wash"
      eyebrow="No booking needed"
      title="Walk-In Wash"
      tagline="Just drive in, get checked in by the staff, and let our cameras follow your wash from start to finish."
      heroImage="https://images.unsplash.com/photo-1608506375591-b90e1f955e4b?auto=format&fit=crop&w=1600&q=80"
      included={[
        {
          title: "We find you a free bay",
          description:
            "Staff can see which bays are open right now, so you go straight to one instead of guessing.",
        },
        {
          title: "You get a QR code",
          description:
            "Your visit gets its own code, so the shop and the system can follow your car through the wash.",
        },
        {
          title: "Cameras follow your wash",
          description:
            "The cameras see when your wash starts and when it's done, so the timing is fair for everyone.",
        },
        {
          title: "Rate it after",
          description:
            "Once your car is clean, leave a review on this website. No account needed.",
        },
      ]}
      whyUs={[
        "No booking and no app needed — just drive in.",
        "Staff can see free bays right away, so you wait less.",
        "Cameras watch every bay, so the service stays the same each time.",
        "The shop sets clear prices, with nothing hidden.",
      ]}
      process={[
        { title: "Drive in", description: "Go to any I-CarWash shop. No booking needed." },
        { title: "Check in", description: "Staff log your visit and give you a QR code." },
        { title: "Get washed", description: "Cameras follow your car from start to finish." },
        { title: "Pay and rate", description: "Pay at the shop, then tell others how it went." },
      ]}
      midImage={{
        src: "https://images.unsplash.com/photo-1694678505383-676d78ea3b96?auto=format&fit=crop&w=1200&q=80",
        alt: "Staff washing a car with a sponge",
      }}
      faq={[
        {
          question: "Do I need to book first?",
          answer:
            "No. Walk-ins are served first come, first served, based on which bays are free when you arrive.",
        },
        {
          question: "How long will I wait?",
          answer:
            "Staff can check which bays are free the moment you arrive, so they can tell you right away if you can go in or how many cars are ahead of you.",
        },
        {
          question: "Can I get my money back?",
          answer:
            "Once the wash has started, it can't be refunded. If something looks wrong, tell the staff right away so they can fix it on the spot.",
        },
        {
          question: "How do I leave a review?",
          answer:
            "Go to the shop's page on this website and write your review. You only need your name and email.",
        },
      ]}
    />
  );
}
