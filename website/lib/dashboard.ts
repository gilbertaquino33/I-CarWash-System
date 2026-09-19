import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Shop } from "@/lib/types";

export interface DashboardContext {
  profile: Profile;
  shop: Shop | null;
}

// Loads the signed-in profile for a dashboard page and enforces that only
// admin/staff accounts may proceed. Customers (or accounts with no profile
// row) are signed out and bounced back to /login, matching the mobile app's
// "this portal is strictly for staff and admin accounts" rule.
export async function requireDashboardContext(): Promise<DashboardContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Staff registered by an admin start with a temporary password and must set
  // their own before they can see anything in the dashboard.
  if (user.user_metadata?.must_change_password === true) redirect("/change-password");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email_address, mobile, role, shop_id, avatar_url, created_at")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  let shop: Shop | null = null;
  if (profile.role === "admin") {
    const { data: shopRow } = await supabase
      .from("shop_profile_setup")
      .select("id, shop_name, province, city, barangay, total_bays, owner_id")
      .eq("owner_id", user.id)
      .maybeSingle();
    shop = (shopRow as Shop | null) ?? null;
  } else if (profile.shop_id) {
    const { data: shopRow } = await supabase
      .from("shop_profile_setup")
      .select("id, shop_name, province, city, barangay, total_bays, owner_id")
      .eq("id", profile.shop_id)
      .maybeSingle();
    shop = (shopRow as Shop | null) ?? null;
  }

  return { profile: profile as Profile, shop };
}
