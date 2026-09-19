import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = {
  title: "Set your password",
};

// Landing page for staff registered by an admin: they can't reach the
// dashboard until they replace the temporary password (see requireDashboardContext).
export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  // Nothing to do here for accounts that already chose their own password.
  if (user.user_metadata?.must_change_password !== true) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-white px-5 py-8 sm:px-10">
      <Link href="/" className="self-start">
        <Logo />
      </Link>

      <div className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-md py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
            <KeyRound size={12} />
            One more step
          </span>

          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink-950">
            Set your password
          </h1>
          <p className="mt-2 text-ink-500">
            Your shop admin created your account with a temporary password. Choose
            your own password to continue to the dashboard.
          </p>

          <ChangePasswordForm email={user.email ?? ""} />
        </div>
      </div>
    </div>
  );
}
