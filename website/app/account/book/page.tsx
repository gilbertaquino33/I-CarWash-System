import { Suspense } from "react";
import { BookingFlow } from "./BookingFlow";

export const metadata = { title: "Book Now" };

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookingFlow />
    </Suspense>
  );
}
