import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/server-env";

export function getSupabaseAdmin() {
  const url = getServerEnv("SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey || serviceRoleKey.startsWith("sb_publishable_")) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}