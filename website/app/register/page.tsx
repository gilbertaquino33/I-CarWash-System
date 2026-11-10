import Link from "next/link";
import { AuthShell } from "@/components/account/AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <AuthShell
      back={{ href: "/login", label: "Back to log in" }}
      title="Create your account"
      subtitle="One account for the website and the I-CarWash app."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
