import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { defaultProfile, defaultTemplate, type CloudState } from "@/lib/storage";

const STATE_ID = "default";

function unavailableResponse() {
  return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailableResponse();

  const { data, error } = await supabase.from("app_state").select("profile, template, contacts, tracker_file_name").eq("id", STATE_ID).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json(null);

  return NextResponse.json({
    profile: data.profile || defaultProfile(),
    template: data.template || defaultTemplate(),
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    trackerFileName: data.tracker_file_name || "HR_Outreach_Tracker.xlsx",
  } satisfies CloudState);
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return unavailableResponse();

  const body = (await request.json()) as Partial<CloudState>;
  const update: Record<string, unknown> = { id: STATE_ID };
  if (body.profile) update.profile = body.profile;
  if (body.template) update.template = body.template;
  if (body.contacts) update.contacts = body.contacts;
  if (body.trackerFileName) update.tracker_file_name = body.trackerFileName;

  const { error } = await supabase.from("app_state").upsert(update, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}