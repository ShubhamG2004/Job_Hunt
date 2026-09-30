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
      const name = safeText(row.Name || row.name || row["Name"]);
      const email = safeText(row.Email || row.email || row["Email"]);
      const title = safeText(row["Job Title"] || row.title || row["job title"] || row["JobTitle"] || row["Title"] || "");
      const company = safeText(row.Company || row.company || row["Company"] || row["Company Name"] || row["Organization"] || "");
      const statusValue = safeText(row.Status || row.status || row["Status"]);
      const status: ContactStatus = ["Pending", "Sent", "Skipped", "Invalid"].includes(statusValue)
        ? (statusValue as ContactStatus)
        : "Pending";

      return {
        id: safeText(row.ID || row.id || index + 1),
        name,
        email,
        title,
        company,
        status,
        sentDate: safeText(row["Sent Date"] || row.sentDate || ""),
        sentTime: safeText(row["Sent Time"] || row.sentTime || ""),
        subject: safeText(row.Subject || row.subject || ""),
        notes: safeText(row.Notes || row.notes || ""),
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

export function exportWorkbookAsBlob(workbook: XLSX.WorkBook, filename: string): Blob {
  const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([fileBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const blob = exportWorkbookAsBlob(workbook, filename);
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
