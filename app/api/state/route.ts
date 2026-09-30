import { NextResponse } from "next/server";
import { getAuthenticatedRequest } from "@/lib/auth-server";
import { defaultProfile, defaultTemplate, type CloudState } from "@/lib/storage";

const MAX_CONTACTS = 10000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isValidPatch(body: unknown): body is Partial<CloudState> {
  if (!isRecord(body)) return false;

  if (body.profile !== undefined) {
    if (!isRecord(body.profile)) return false;
    if (!isString(body.profile.name, 200) || !isString(body.profile.phone, 100) || !isString(body.profile.linkedin, 500) || !isString(body.profile.github, 500) || !isString(body.profile.resume, 500)) return false;
  }

  if (body.template !== undefined) {
    if (!isRecord(body.template) || !isString(body.template.subject, 500) || !isString(body.template.body, 20000)) return false;
  }

  if (body.trackerFileName !== undefined && !isString(body.trackerFileName, 255)) return false;
  if (body.contacts !== undefined && (!Array.isArray(body.contacts) || body.contacts.length > MAX_CONTACTS)) return false;
  return body.profile !== undefined || body.template !== undefined || body.contacts !== undefined || body.trackerFileName !== undefined;
}

export async function GET(request: Request) {
  const authenticated = await getAuthenticatedRequest(request);
  if (authenticated instanceof NextResponse) return authenticated;
  const { supabase, user } = authenticated;

  const { data, error } = await supabase.from("app_state").select("profile, template, contacts, tracker_file_name").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("Supabase state read failed:", error);
    return NextResponse.json({ error: "Could not load application state." }, { status: 500 });
  }
  if (!data) return NextResponse.json(null);

  return NextResponse.json({
    profile: data.profile || defaultProfile(),
    template: data.template || defaultTemplate(),
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    trackerFileName: data.tracker_file_name || "HR_Outreach_Tracker.xlsx",
  } satisfies CloudState);
}

export async function PATCH(request: Request) {
  const authenticated = await getAuthenticatedRequest(request);
  if (authenticated instanceof NextResponse) return authenticated;
  const { supabase, user } = authenticated;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isValidPatch(body)) return NextResponse.json({ error: "Invalid application state." }, { status: 400 });

  const update: Record<string, unknown> = { id: user.id, user_id: user.id };
  if (body.profile !== undefined) update.profile = body.profile;
  if (body.template !== undefined) update.template = body.template;
  if (body.contacts !== undefined) update.contacts = body.contacts;
  if (body.trackerFileName !== undefined) update.tracker_file_name = body.trackerFileName;
  update.updated_at = new Date().toISOString();

  const { error } = await supabase.from("app_state").upsert(update, { onConflict: "id" });
  if (error) {
    console.error("Supabase state write failed:", error);
    return NextResponse.json({ error: "Could not save application state." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}