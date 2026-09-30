import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function getAuthenticatedRequest(request: Request): Promise<{ supabase: SupabaseClient; user: User } | NextResponse> {
  const supabase = getSupabaseAdmin();
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!supabase || !token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  return { supabase, user: data.user };
}