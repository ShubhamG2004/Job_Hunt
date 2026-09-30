import * as XLSX from "xlsx";
import { normalizeEmail, safeText } from "@/lib/validation";
import type { Contact, ContactStatus } from "@/types/contact";

export const CONTACT_SHEET_NAME = "Contacts";
export const CONTACT_COLUMNS = [
  "ID",
  "Name",
  "Email",
  "Job Title",
  "Company",
  "Status",
  "Sent Date",
  "Sent Time",
  "Subject",
  "Notes",
] as const;

export function workbookToContacts(workbook: XLSX.WorkBook): Contact[] {
  const sheet = workbook.Sheets[CONTACT_SHEET_NAME] || workbook.Sheets[Object.keys(workbook.Sheets)[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows
    .map((row, index) => {
      const normalizedRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/\s+/g, " "), value])
      );
      const readCell = (...keys: string[]) => keys.map((key) => normalizedRow[key]).find((value) => value !== undefined);
      const name = safeText(readCell("name"));
      const email = safeText(readCell("email"));
      const title = safeText(readCell("job title", "jobtitle", "title"));
      const company = safeText(readCell("company", "company name", "organization"));
      const statusValue = safeText(readCell("status"));
      const status: ContactStatus = ["Pending", "Sent", "Skipped", "Invalid"].includes(statusValue)
        ? (statusValue as ContactStatus)
        : "Pending";

      return {
        id: safeText(readCell("id") || index + 1),
        name,
        email,
        title,
        company,
        status,
        sentDate: safeText(readCell("sent date", "sentdate")),
        sentTime: safeText(readCell("sent time", "senttime")),
        subject: safeText(readCell("subject")),
        notes: safeText(readCell("notes")),
      };
    })
    .filter((contact) => contact.email || contact.name || contact.company);
}

export function contactsToWorkbook(contacts: Contact[]): XLSX.WorkBook {
  const worksheet = XLSX.utils.json_to_sheet(
    contacts.map((contact) => ({
      ID: contact.id,
      Name: contact.name,
      Email: contact.email,
      "Job Title": contact.title || "",
      Company: contact.company || "",
      Status: contact.status,
      "Sent Date": contact.sentDate || "",
      "Sent Time": contact.sentTime || "",
      Subject: contact.subject || "",
      Notes: contact.notes || "",
    })),
    { skipHeader: false }
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, CONTACT_SHEET_NAME);
  return workbook;
}

export function exportWorkbookAsBlob(workbook: XLSX.WorkBook): Blob {
  const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([fileBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const blob = exportWorkbookAsBlob(workbook);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function createNewTrackerWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      ID: "",
      Name: "",
      Email: "",
      "Job Title": "",
      Company: "",
      Status: "Pending",
      "Sent Date": "",
      "Sent Time": "",
      Subject: "",
      Notes: "",
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, CONTACT_SHEET_NAME);
  return workbook;
}

export function buildContactSummary(contacts: Contact[]) {
  const summary = {
    total: contacts.length,
    sent: contacts.filter((c) => c.status === "Sent").length,
    pending: contacts.filter((c) => c.status === "Pending").length,
    skipped: contacts.filter((c) => c.status === "Skipped").length,
    invalid: contacts.filter((c) => c.status === "Invalid").length,
  };

  return summary;
}

export function dedupeContacts(contacts: Contact[]): Contact[] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = normalizeEmail(contact.email);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
