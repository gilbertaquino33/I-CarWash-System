"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface UpdateProfileState {
  status: "idle" | "success" | "error";
  message?: string;
}

// Same rules as the mobile app's src/lib/phone.ts (+63 9XXXXXXXXX).
function toPHMobileE164(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  return /^9\d{9}$/.test(digits) ? `+63${digits}` : null;
}

const fail = (message: string): UpdateProfileState => ({ status: "error", message });

// Updates the signed-in user's own name and mobile, and -- for a shop admin --
// their shop's name. Who the user is and which shop is theirs are re-checked
// on the server; nothing the browser sends decides that.
export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const mobileRaw = String(formData.get("mobile") ?? "").trim();
  const shopNameRaw = formData.get("shopName");
  const shopName = shopNameRaw == null ? null : String(shopNameRaw).trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  if (fullName.length < 2) return fail("Please enter your full name.");
  const mobile = mobileRaw ? toPHMobileE164(mobileRaw) : null;
  if (mobileRaw && !mobile) {
    return fail("Enter a valid Philippine mobile number, e.g. 0917 123 4567.");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, mobile })
    .eq("id", user.id);
  if (profileError) return fail("We couldn't save your details. Please try again.");

  if (profile?.role === "admin" && shopName !== null) {
    if (shopName.length < 2) return fail("Please enter your shop's name.");
    const { error: shopError } = await supabase
      .from("shop_profile_setup")
      .update({ shop_name: shopName })
      .eq("owner_id", user.id);
    if (shopError) return fail("Your details were saved, but the shop name couldn't be updated.");
  }

  // The name shows in the sidebar and page headers too.
  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Your changes have been saved." };
}
