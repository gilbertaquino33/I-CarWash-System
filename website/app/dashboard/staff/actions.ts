"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RegisterStaffState {
  status: "idle" | "success" | "error";
  message?: string;
  // Set on success so the admin can hand the login details to the new staff.
  created?: { fullName: string; email: string };
}

const MIN_PASSWORD_LENGTH = 8;

// Same rules as the mobile app's src/lib/phone.ts (+63 9XXXXXXXXX).
function toPHMobileE164(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  return /^9\d{9}$/.test(digits) ? `+63${digits}` : null;
}

function fail(message: string): RegisterStaffState {
  return { status: "error", message };
}

// Lets a shop admin register a staff account. The admin's identity and shop are
// re-checked here on the server on every call -- nothing the browser sends
// (including the shop) is trusted.
export async function registerStaff(
  _prev: RegisterStaffState,
  formData: FormData
): Promise<RegisterStaffState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const mobileRaw = String(formData.get("mobile") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // ---- 1. Only a signed-in admin may do this ------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "admin") {
    return fail("Only the shop admin can register staff.");
  }

  // The new staff always belongs to the admin's OWN shop.
  const { data: shop } = await supabase
    .from("shop_profile_setup")
    .select("id, shop_name")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!shop) return fail("Set up your shop first before you add staff.");

  // ---- 2. Validate input --------------------------------------------------
  if (fullName.length < 2) return fail("Enter the staff's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Enter a valid email address.");
  }
  const mobile = toPHMobileE164(mobileRaw);
  if (!mobile) {
    return fail("Enter a valid Philippine mobile number, e.g. 0917 123 4567.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  // ---- 3. Create the login + profile with the service role ----------------
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail(
      "Staff registration isn't set up on the server yet: SUPABASE_SERVICE_ROLE_KEY is missing from website/.env.local."
    );
  }

  // The metadata mirrors what the mobile app sent on sign-up, so any existing
  // profile-creating trigger on auth.users keeps working unchanged.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // the admin vouches for this address; no confirm email
    user_metadata: {
      full_name: fullName,
      email_address: email,
      role: "staff",
      mobile,
      shop_id: shop.id,
      shop_name: shop.shop_name,
      // Temporary password from the admin: the staff must choose their own
      // on first login (enforced by the mobile app and by /dashboard here).
      must_change_password: true,
    },
  });

  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return fail("That email is already registered to another account.");
    }
    return fail(msg || "We couldn't create the account. Please try again.");
  }

  // Upsert (not insert): if a trigger already made the profile row this fixes
  // it up to role=staff + this shop; if not, it creates it.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: created.user.id,
      full_name: fullName,
      email_address: email,
      mobile,
      role: "staff",
      shop_id: shop.id,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    // Don't leave a login behind that has no usable profile.
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(`We couldn't save the staff profile: ${profileError.message}`);
  }

  revalidatePath("/dashboard/staff");
  return { status: "success", created: { fullName, email } };
}
