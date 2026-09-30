import type { ProfileData } from "@/types/contact";
import { getSupabaseAuthHeaders } from "@/lib/supabase-browser";

export function renderEmailTemplate(template: { subject: string; body: string }, data: {
  name: string;
  company: string;
  title: string;
  profile: ProfileData;
}) {
  const replacements = {
    "{{name}}": data.name,
    "{{company}}": data.company,
    "{{title}}": data.title,
    "{{myName}}": data.profile.name,
    "{{phone}}": data.profile.phone || "",
    "{{linkedin}}": data.profile.linkedin || "",
    "{{github}}": data.profile.github || "",
    "{{resume}}": data.profile.resume || "",
  };

  let subject = template.subject;
  let body = template.body;

  Object.entries(replacements).forEach(([key, value]) => {
    subject = subject.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value || "");
    body = body.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value || "");
  });

  return { subject, body };
}

export function openGmailCompose(to: string, subject: string, body: string) {
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.open(gmailUrl, "_blank", "noopener,noreferrer");
}

export async function sendDirectEmail(to: string, subject: string, body: string) {
  const headers = await getSupabaseAuthHeaders();
  headers["Content-Type"] = "application/json";
  const response = await fetch("/api/send-email", {
    method: "POST",
    headers,
    body: JSON.stringify({ to, subject, body }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Email could not be sent.");
  }

  return payload;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getCurrentTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}
