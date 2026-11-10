import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CustomerProfile {
  id: string;
  full_name: string | null;
  email_address: string | null;
  mobile: string | null;
}

// Loads the signed-in CUSTOMER for an /account page. Shop owners and staff
// are sent to their own dashboard; nobody signed in -> /login.
export async function requireCustomer(): Promise<CustomerProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email_address, mobile, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin" || profile?.role === "staff") redirect("/dashboard");

  return {
    id: user.id,
    full_name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
    email_address: profile?.email_address ?? user.email ?? null,
    mobile: profile?.mobile ?? null,
  };
}
