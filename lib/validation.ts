export const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
export const REQUIRED_COLUMNS = ["Name", "Email", "Company"];

export function normalizeEmail(value: string): string {
  return (value || "").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test((value || "").trim());
}

export function detectMissingColumns(headers: string[]): string[] {
  const normalized = new Set(headers.map((header) => String(header).trim().toLowerCase().replace(/\s+/g, " ")));
  return REQUIRED_COLUMNS.filter((column) => !normalized.has(column.toLowerCase()));
}

export function safeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function createId(): string {
  return `HR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
