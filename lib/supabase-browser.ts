import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseBrowser = url && publishableKey ? createClient(url, publishableKey) : null;

export async function getSupabaseAuthHeaders(): Promise<Record<string, string>> {
	if (!supabaseBrowser) return {};
	const { data } = await supabaseBrowser.auth.getSession();
	return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}