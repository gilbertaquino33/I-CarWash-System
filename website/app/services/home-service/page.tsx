import { ServicePageTemplate } from "@/components/ServicePageTemplate";

export const metadata = { title: "Home Service" };
export const revalidate = 0;

export default function HomeServicePage() {
  return (
    <ServicePageTemplate
      serviceType="home-service"
      eyebrow="They come to you"
      title="Home Service"
      tagline="Get your car washed at your house, your office, or anywhere you like — same trusted shops, no driving needed."
      heroImage="https://images.unsplash.com/photo-1694025909289-fb9dd4660e97?auto=format&fit=crop&w=1600&q=80"
      included={[
        {
          title: "You pick the place",
          description:
            "Ask for a home service in the app and give the address where you want your car washed.",
        },
        {
          title: "The shop sends staff",
          description:
            "A shop takes your request and sends trained staff to handle it from start to finish.",
        },
        {
          title: "Same way of washing",
          description:
            "Home service follows the same steps and the same care as a wash inside the shop.",
        },
        {
          title: "Rate it after",
          description:
            "When they're done, tell others how it went by leaving a review on this website.",
        },
      ]}
      whyUs={[
        "No driving to the shop and no waiting for a free bay.",
        "Good for busy days — the wash happens where you are.",
        "Done by the same shops and staff people already trust.",
        "Booked and tracked through the same I-CarWash system.",
      ]}
      process={[
        { title: "Send a request", description: "Give your address and the time you want." },
        { title: "Shop confirms", description: "A shop accepts it and sends staff to you." },
        { title: "They wash it", description: "Staff arrive and clean your car on the spot." },
        { title: "Pay and rate", description: "Pay when they finish, then leave a review." },
      ]}
      midImage={{
        src: "https://images.unsplash.com/photo-1704796141009-5ed5cc8ca5f3?auto=format&fit=crop&w=1200&q=80",
        alt: "Car being dried with a soft cloth",
      }}
      faq={[
        {
          question: "Do they go to my area?",
          answer:
            "It depends on the shop. Most shops serve places near them. Send a request and they'll tell you if they can reach your address.",
        },
        {
          question: "Is it more expensive than going to the shop?",
          answer:
            "Each shop sets its own price, and some add a small fee for travel. Ask them for the final price when they reply to you.",
        },
        {
          question: "Do I need to provide water or electricity?",
          answer:
            "It depends on the shop. When you send your request, describe your place so the staff know what to bring.",
        },
        {
          question: "Can I cancel a home service?",
          answer:
            "Yes. The same rule for bookings applies — cancel in the app, and if you already paid, you get it back as credit.",
        },
      ]}
    />
  );
}
