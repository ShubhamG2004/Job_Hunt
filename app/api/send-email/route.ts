import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getAuthenticatedRequest } from "@/lib/auth-server";
import { getServerEnv } from "@/lib/server-env";
import { isValidEmail } from "@/lib/validation";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export async function POST(request: Request) {
  try {
    const authenticated = await getAuthenticatedRequest(request);
    if (authenticated instanceof NextResponse) return authenticated;

    const payload = await request.json();
    const { to, subject, body } = payload || {};

    if (
      typeof to !== "string" ||
      !isValidEmail(to) ||
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.length > 500 ||
      typeof body !== "string" ||
      !body.trim() ||
      body.length > 20000
    ) {
      return NextResponse.json({ error: "Missing email fields." }, { status: 400 });
    }

    const host = getServerEnv("SMTP_HOST");
    const port = Number(getServerEnv("SMTP_PORT") || 587);
    const secure = getServerEnv("SMTP_SECURE") === "true";
    const user = getServerEnv("SMTP_USER");
    const pass = getServerEnv("SMTP_PASS");
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass) {
      return NextResponse.json({ error: "Email service is not configured." }, { status: 503 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: getServerEnv("SMTP_FROM") || user,
      to,
      subject,
      text: body,
      html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(body)}</pre>`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
