import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. It BYPASSES row-level security and can create
// auth users, so it must only ever be imported from server code (Server
// Actions / Route Handlers) -- never from a "use client" file. The key has no
// NEXT_PUBLIC_ prefix on purpose so Next.js never ships it to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
