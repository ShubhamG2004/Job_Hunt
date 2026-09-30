import { EMAIL_REGEX } from "@/lib/validation";
import type { ParsedContact } from "@/types/contact";

export function extractEmailsFromPdfText(text: string): string[] {
  const matches = (text || "").match(new RegExp(EMAIL_REGEX.source, "gi")) || [];
  const unique = Array.from(new Set(matches.map((item) => item.trim().toLowerCase())));
  return unique;
}

export function parsePdfText(text: string): ParsedContact[] {
  const rawLines = (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: ParsedContact[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine
      .replace(/\t/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!line) continue;
    if (/^(sno|sn|no|serial|name|email|title|company)/i.test(line)) continue;

    const cleanLine = line.replace(/^\d+[\s\-:.]+/, "").trim();
    if (!cleanLine) continue;

    const emailMatch = cleanLine.match(EMAIL_REGEX);
    if (!emailMatch) {
      parsed.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: "Needs Review",
        email: "",
        title: "",
        company: "",
        status: "REVIEW",
        action: "REVIEW",
        rawLine,
      });
      continue;
    }

    const email = emailMatch[0];
    const beforeEmail = cleanLine.slice(0, emailMatch.index ?? 0).trim();
    const afterEmail = cleanLine.slice((emailMatch.index ?? 0) + email.length).trim();

    const nameParts = beforeEmail
      .replace(/^\d+[\s\-.]*|\s*[-|–]\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const name = nameParts || "Needs Review";

    const suffixTokens = afterEmail
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    let title = "";
    let company = "";

    if (suffixTokens.length >= 2) {
      company = suffixTokens[suffixTokens.length - 1] || "";
      title = suffixTokens.slice(0, -1).join(" ");
    } else if (suffixTokens.length === 1) {
      company = suffixTokens[0];
    }

    const normalizedEmail = email.trim();

    parsed.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      email: normalizedEmail,
      title: title || "",
      company: company || "",
      status: "NEW",
      action: "ADD",
      rawLine,
    });
  }

  const deduped = new Map<string, ParsedContact>();
  for (const item of parsed) {
    const key = item.email.trim().toLowerCase();
    if (!key) continue;
    deduped.set(key, item);
  }

  return Array.from(deduped.values());
}
