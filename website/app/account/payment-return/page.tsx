import { Suspense } from "react";
import { PaymentReturn } from "./PaymentReturn";

export const metadata = { title: "Payment" };

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReturn />
    </Suspense>
  );
}
