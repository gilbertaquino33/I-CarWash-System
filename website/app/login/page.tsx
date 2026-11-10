import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/account/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Log In",
};

export default function LoginPage() {
  return (
    <AuthShell
      badge={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
          <ShieldCheck size={12} />
          Customers, shop owners &amp; staff
        </span>
      }
      title="Welcome back"
      subtitle="Log in to reserve a date and time and see your bookings. Shop owners and staff use the same login to open their dashboard."
      footer={
        <>
          New to I-CarWash?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
