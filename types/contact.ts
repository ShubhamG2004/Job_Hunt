export type ContactStatus = "Pending" | "Sent" | "Skipped" | "Invalid";

export interface Contact {
  id: string;
  name: string;
  email: string;
  title: string;
  company: string;
  status: ContactStatus;
  sentDate?: string;
  sentTime?: string;
  subject?: string;
  notes?: string;
}

export interface ParsedContact {
  id: string;
  name: string;
  email: string;
  title: string;
  company: string;
  status: "NEW" | "ALREADY SENT" | "ALREADY EXISTS" | "INVALID" | "REVIEW";
  action: "ADD" | "DO NOT ADD" | "UPDATE / SKIP" | "REVIEW";
  rawLine?: string;
}

export interface ProfileData {
  name: string;
  phone: string;
  linkedin: string;
  github: string;
  resume: string;
}

export interface EmailTemplate {
  subject: string;
  body: string;
}
