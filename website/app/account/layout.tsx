import { AccountNav } from "@/components/account/AccountNav";
import { requireCustomer } from "@/lib/account";

export const metadata = { title: "My Account" };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await requireCustomer();
  const firstName = (customer.full_name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="min-h-screen bg-ink-50">
      <AccountNav name={firstName} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-16">{children}</main>
    </div>
  );
}
