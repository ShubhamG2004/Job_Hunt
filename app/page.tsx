"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { StatusBadge } from "@/components/StatusBadge";
import {
  buildContactSummary,
  contactsToWorkbook,
  createNewTrackerWorkbook,
  downloadWorkbook,
  workbookToContacts,
} from "@/lib/excel";
import {
  getCurrentTimeString,
  getTodayDateString,
  openGmailCompose,
  renderEmailTemplate,
  sendDirectEmail,
} from "@/lib/email";
import { extractEmailsFromPdfText, parsePdfText } from "@/lib/parser";
import { loadCloudState, loadProfile, loadTemplate, loadTracker, saveProfile, saveTemplate, saveTracker } from "@/lib/storage";
import { detectMissingColumns, isValidEmail, normalizeEmail } from "@/lib/validation";
import type { Contact, ContactStatus, EmailTemplate, ParsedContact, ProfileData } from "@/types/contact";

const MAX_DAILY_OUTREACH = 15;

export default function HomePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [pdfText, setPdfText] = useState("");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [profile, setProfile] = useState<ProfileData>(loadProfile());
  const [template, setTemplate] = useState<EmailTemplate>(loadTemplate());
  const [trackerFileName, setTrackerFileName] = useState("HR_Outreach_Tracker.xlsx");
  const [trackerLoaded, setTrackerLoaded] = useState(false);
  const [cloudStateLoaded, setCloudStateLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string; to: string } | null>(null);
  const [allContactsFilter, setAllContactsFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [extractedEmails, setExtractedEmails] = useState<string[]>([]);
  const [visibleContactCount, setVisibleContactCount] = useState(30);

  useEffect(() => {
    if (cloudStateLoaded) saveProfile(profile);
  }, [cloudStateLoaded, profile]);
  useEffect(() => {
    if (cloudStateLoaded) saveTemplate(template);
  }, [cloudStateLoaded, template]);
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cloudState = await loadCloudState();
      if (cancelled) return;
      if (cloudState) {
        setProfile(cloudState.profile);
        setTemplate(cloudState.template);
        setContacts(cloudState.contacts);
        setTrackerFileName(cloudState.trackerFileName);
        setTrackerLoaded(true);
        setCloudStateLoaded(true);
        return;
      }

      const saved = await loadTracker();
      if (!cancelled && saved) {
        setContacts(saved.contacts);
        setTrackerFileName(saved.trackerFileName);
        setTrackerLoaded(true);
      }
      setCloudStateLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!trackerLoaded || !cloudStateLoaded) return;
    void saveTracker({ contacts, trackerFileName });
  }, [cloudStateLoaded, contacts, trackerFileName, trackerLoaded]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const summary = useMemo(() => buildContactSummary(contacts), [contacts]);
  const todaySentCount = useMemo(
    () => contacts.filter((contact) => contact.status === "Sent" && contact.sentDate === getTodayDateString()).length,
    [contacts]
  );
  const pendingToday = useMemo(
    () => contacts.filter((contact) => contact.status === "Pending").slice(0, MAX_DAILY_OUTREACH),
    [contacts]
  );
  const filteredContacts = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return contacts.filter((contact) => {
      const filterMatch = allContactsFilter === "All" || contact.status === allContactsFilter;
      const queryMatch =
        !query ||
        [contact.name, contact.email, contact.company, contact.title].some((value) =>
          value.toLowerCase().includes(query)
        );
      return filterMatch && queryMatch;
    });
  }, [allContactsFilter, contacts, searchTerm]);

  const visibleContacts = useMemo(
    () => filteredContacts.slice(0, visibleContactCount),
    [filteredContacts, visibleContactCount]
  );

  const hasMoreContacts = visibleContactCount < filteredContacts.length;

  const showToast = (message: string) => setToast(message);

  const importExcelFile = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets["Contacts"] || workbook.Sheets[Object.keys(workbook.Sheets)[0]];
      if (!sheet) {
        showToast("Excel file is missing the Contacts sheet.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
      const headers = Array.isArray(rows[0]) ? rows[0].map((item) => String(item)) : [];
      const missing = detectMissingColumns(headers);
      if (missing.length) {
        const missingList = missing.join(", ");
        showToast(`Your Excel file is missing the ${missingList} column${missing.length > 1 ? "s" : ""}.`);
        return;
      }

      const imported = workbookToContacts(workbook);
      setContacts(imported);
      setTrackerLoaded(true);
      setTrackerFileName(file.name || "HR_Outreach_Tracker.xlsx");
      const savedToCloud = await saveTracker({ contacts: imported, trackerFileName: file.name || "HR_Outreach_Tracker.xlsx" });
      showToast(savedToCloud ? "Tracker loaded and saved to the database" : "Tracker saved locally, but database sync failed. Check Supabase settings.");
    } catch {
      showToast("Invalid Excel file.");
    }
  };

  const createTracker = () => {
    const workbook = createNewTrackerWorkbook();
    downloadWorkbook(workbook, "HR_Outreach_Tracker.xlsx");
    setTrackerFileName("HR_Outreach_Tracker.xlsx");
    setTrackerLoaded(true);
    setContacts([]);
    showToast("New tracker created. Download and save it locally.");
  };

  const handleExtractEmails = () => {
    if (!pdfText.trim()) {
      showToast("Paste HR contacts from a PDF to continue.");
      return;
    }

    const emails = extractEmailsFromPdfText(pdfText);
    if (!emails.length) {
      showToast("No email IDs found in the pasted PDF text.");
      setExtractedEmails([]);
      return;
    }

    setExtractedEmails(emails);
    showToast(`${emails.length} unique email IDs extracted.`);
  };

  const handlePdfParse = () => {
    if (!pdfText.trim()) {
      showToast("Paste HR contacts from a PDF to continue.");
      return;
    }

    const parsed = parsePdfText(pdfText);
    const existingMap = new Map<string, Contact>();
    contacts.forEach((contact) => existingMap.set(normalizeEmail(contact.email), contact));

    const reviewRows = parsed.map((item) => {
      const key = normalizeEmail(item.email);
      if (!key) {
        return { ...item, status: "INVALID" as const, action: "REVIEW" as const };
      }

      const existing = existingMap.get(key);
      if (existing) {
        if (existing.status === "Sent") {
          return { ...item, status: "ALREADY SENT" as const, action: "DO NOT ADD" as const };
        }
        if (existing.status === "Pending") {
          return { ...item, status: "ALREADY EXISTS" as const, action: "UPDATE / SKIP" as const };
        }
      }

      if (!isValidEmail(item.email)) {
        return { ...item, status: "INVALID" as const, action: "REVIEW" as const };
      }

      return { ...item, status: "NEW" as const, action: "ADD" as const };
    });

    setParsedContacts(reviewRows);
  };

  const addSelectedContacts = () => {
    const selected = parsedContacts.filter((item) => selectedRows[item.id] && item.action === "ADD");
    const newContacts: Contact[] = selected.map((item) => ({
      id: `ID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name || "Needs Review",
      email: item.email,
      title: item.title,
      company: item.company,
      status: "Pending",
      sentDate: "",
      sentTime: "",
      subject: "",
      notes: "",
    }));

    const merged = [...contacts, ...newContacts];
    setContacts(merged);
    setParsedContacts([]);
    setPdfText("");
    setSelectedRows({});
    showToast(`${newContacts.length} new contacts added`);
  };

  const previewForContact = (contact: Contact) => {
    const rendered = renderEmailTemplate(template, {
      name: contact.name,
      company: contact.company,
      title: contact.title,
      profile,
    });
    setEmailPreview({ subject: rendered.subject, body: rendered.body, to: contact.email });
  };

  const sendDirectToContact = async (contact: Contact) => {
    const rendered = renderEmailTemplate(template, {
      name: contact.name,
      company: contact.company,
      title: contact.title,
      profile,
    });

    try {
      await sendDirectEmail(contact.email, rendered.subject, rendered.body);
      setEmailPreview({ subject: rendered.subject, body: rendered.body, to: contact.email });
      showToast("Email sent successfully.");
      setContacts((current) =>
        current.map((item) =>
          normalizeEmail(item.email) === normalizeEmail(contact.email)
            ? {
                ...item,
                status: "Sent" as ContactStatus,
                sentDate: getTodayDateString(),
                sentTime: getCurrentTimeString(),
                subject: rendered.subject,
              }
            : item
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Direct email failed.";
      showToast(message);
      openGmailCompose(contact.email, rendered.subject, rendered.body);
      setEmailPreview({ subject: rendered.subject, body: rendered.body, to: contact.email });
    }
  };

  const markSent = (contact: Contact) => {
    const confirmed = window.confirm("Did you send this email?");
    if (!confirmed) return;

    const updated = contacts.map((item) => {
      if (normalizeEmail(item.email) !== normalizeEmail(contact.email)) return item;
      return {
        ...item,
        status: "Sent" as ContactStatus,
        sentDate: getTodayDateString(),
        sentTime: getCurrentTimeString(),
        subject: emailPreview?.subject || item.subject || "",
      };
    });

    setContacts(updated);
    setEmailPreview(null);
    showToast("Tracker updated in memory. Download the updated Excel file to save your changes.");
  };

  const skipContact = (contact: Contact) => {
    const confirmed = window.confirm("Skip this contact?");
    if (!confirmed) return;

    setContacts((current) =>
      current.map((item) =>
        normalizeEmail(item.email) === normalizeEmail(contact.email) ? { ...item, status: "Skipped" } : item
      )
    );
    showToast("Contact skipped and removed from today's outreach.");
  };

  const unskipContact = (contact: Contact) => {
    setContacts((current) =>
      current.map((item) =>
        normalizeEmail(item.email) === normalizeEmail(contact.email) ? { ...item, status: "Pending" } : item
      )
    );
  };

  const triggerDownload = () => {
    const workbook = contactsToWorkbook(contacts);
    downloadWorkbook(workbook, "HR_Outreach_Tracker.xlsx");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void importExcelFile(file);
    }
    event.target.value = "";
  };

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">HR Outreach Manager</h1>
            <p className="text-sm text-slate-500">15 Emails / Day</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
              Import Excel
            </label>
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={createTracker}>
              Create New Tracker
            </button>
          </div>
        </div>
      </header>

      {!trackerLoaded ? (
        <section className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-5 px-4 py-20 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
            <h2 className="text-3xl font-bold text-slate-900">Upload your HR Outreach Excel Tracker</h2>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <label className="cursor-pointer rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-700">
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                Upload Excel
              </label>
              <button onClick={createTracker} className="rounded-xl border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                Create New Tracker
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-500">Today&apos;s progress</p>
                <h2 className="text-3xl font-bold text-slate-900">
                  {todaySentCount} / {MAX_DAILY_OUTREACH}
                </h2>
              </div>
              <div className="w-full max-w-md">
                <div className="mb-2 flex justify-between text-xs font-medium text-slate-500">
                  <span>Progress</span>
                  <span>{Math.min((todaySentCount / MAX_DAILY_OUTREACH) * 100, 100).toFixed(0)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${Math.min((todaySentCount / MAX_DAILY_OUTREACH) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Total Contacts", value: summary.total },
              { label: "Pending", value: summary.pending },
              { label: "Sent", value: summary.sent },
              { label: "Skipped", value: summary.skipped },
              { label: "Invalid", value: summary.invalid },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-slate-900">Paste HR contacts from PDF</h3>
                <div className="flex gap-2">
                  <button onClick={handleExtractEmails} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Extract Email IDs
                  </button>
                  <button onClick={handlePdfParse} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Parse Contacts
                  </button>
                </div>
              </div>
              <textarea
                value={pdfText}
                onChange={(e) => setPdfText(e.target.value)}
                className="min-h-[220px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-400"
                placeholder="Paste HR rows from your PDF here..."
              />
              {extractedEmails.length > 0 && (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <div className="mb-2 font-semibold">Extracted email IDs</div>
                  <div className="max-h-28 overflow-auto break-all">{extractedEmails.join(", ")}</div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">Excel Tracker Status</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-900">Tracker:</span> Loaded</p>
                <p><span className="font-semibold text-slate-900">File:</span> {trackerFileName}</p>
                <p><span className="font-semibold text-slate-900">Last imported:</span> {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={triggerDownload} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Download Updated Excel</button>
                <button onClick={() => { const workbook = contactsToWorkbook(contacts); downloadWorkbook(workbook, `HR_Outreach_Backup_${getTodayDateString()}.xlsx`); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Download Backup</button>
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                  Reload Excel
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          </section>

          {parsedContacts.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Parsed Contact Review</h3>
                <button onClick={addSelectedContacts} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  Add Selected Contacts to Tracker
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-3">Select</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Job Title</th>
                      <th className="p-3">Company</th>
                      <th className="p-3">Excel Status</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedContacts.map((contact) => (
                      <tr key={contact.id} className="border-t border-slate-200">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={!!selectedRows[contact.id]}
                            onChange={() =>
                              setSelectedRows((current) => ({ ...current, [contact.id]: !current[contact.id] }))
                            }
                          />
                        </td>
                        <td className="p-3">{contact.name}</td>
                        <td className="p-3">{contact.email || "—"}</td>
                        <td className="p-3">{contact.title || "—"}</td>
                        <td className="p-3">{contact.company || "—"}</td>
                        <td className="p-3">{contact.status}</td>
                        <td className="p-3">{contact.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Today&apos;s Outreach</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {Math.min(pendingToday.length, MAX_DAILY_OUTREACH)} / {MAX_DAILY_OUTREACH}
              </span>
            </div>

            <div className="space-y-3">
              {pendingToday.length === 0 ? (
                <p className="text-slate-500">No pending contacts available.</p>
              ) : (
                pendingToday.map((contact) => (
                  <div key={contact.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-semibold text-slate-900">{contact.name}</h4>
                        <StatusBadge status={contact.status} />
                      </div>
                      <p className="text-sm text-slate-600">{contact.company} • {contact.title}</p>
                      <p className="text-sm text-slate-500">{contact.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => previewForContact(contact)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Preview</button>
                      <button onClick={() => sendDirectToContact(contact)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Send Direct</button>
                      <button onClick={() => markSent(contact)} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">Mark Sent</button>
                      <button onClick={() => skipContact(contact)} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600">Skip</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {emailPreview && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">Email Preview</h3>
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p><span className="font-semibold">To:</span> {emailPreview.to}</p>
                <p><span className="font-semibold">Subject:</span> {emailPreview.subject}</p>
                <div>
                  <p className="font-semibold">Body:</p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans">{emailPreview.body}</pre>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">All Contacts</h3>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setVisibleContactCount(30);
                }}
                placeholder="Search by name, email, company, title"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 md:max-w-xs"
              />
              <select
                value={allContactsFilter}
                onChange={(e) => {
                  setAllContactsFilter(e.target.value);
                  setVisibleContactCount(30);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Sent">Sent</option>
                <option value="Skipped">Skipped</option>
                <option value="Invalid">Invalid</option>
              </select>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Job Title</th>
                    <th className="p-3">Company</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Sent Date</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContacts.map((contact) => (
                    <tr key={contact.id} className="border-t border-slate-200">
                      <td className="p-3">{contact.id}</td>
                      <td className="p-3">{contact.name}</td>
                      <td className="p-3">{contact.email}</td>
                      <td className="p-3">{contact.title}</td>
                      <td className="p-3">{contact.company}</td>
                      <td className="p-3"><StatusBadge status={contact.status} /></td>
                      <td className="p-3">{contact.sentDate || "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {contact.status === "Skipped" ? (
                            <button onClick={() => unskipContact(contact)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">Move to Pending</button>
                          ) : (
                            <button onClick={() => setSelectedContact(contact)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">Details</button>
                          )}
                          <button onClick={() => sendDirectToContact(contact)} className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white">Send Direct</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMoreContacts && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setVisibleContactCount((count) => count + 30)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Load 30 More
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Email Template</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Subject</label>
                <input
                  value={template.subject}
                  onChange={(e) => setTemplate((current) => ({ ...current, subject: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Profile</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={profile.phone} onChange={(e) => setProfile((current) => ({ ...current, phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  <input value={profile.linkedin} onChange={(e) => setProfile((current) => ({ ...current, linkedin: e.target.value }))} placeholder="LinkedIn" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  <input value={profile.github} onChange={(e) => setProfile((current) => ({ ...current, github: e.target.value }))} placeholder="GitHub" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                  <input value={profile.resume} onChange={(e) => setProfile((current) => ({ ...current, resume: e.target.value }))} placeholder="Resume" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <label className="mt-4 mb-2 block text-sm font-medium text-slate-700">Body</label>
            <textarea
              value={template.body}
              onChange={(e) => setTemplate((current) => ({ ...current, body: e.target.value }))}
              className="min-h-[220px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Profile</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <input value={profile.name} onChange={(e) => setProfile((current) => ({ ...current, name: e.target.value }))} placeholder="Name" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              <input value={profile.phone} onChange={(e) => setProfile((current) => ({ ...current, phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              <input value={profile.linkedin} onChange={(e) => setProfile((current) => ({ ...current, linkedin: e.target.value }))} placeholder="LinkedIn" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              <input value={profile.github} onChange={(e) => setProfile((current) => ({ ...current, github: e.target.value }))} placeholder="GitHub" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              <input value={profile.resume} onChange={(e) => setProfile((current) => ({ ...current, resume: e.target.value }))} placeholder="Resume" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm md:col-span-2" />
            </div>
          </section>

          {selectedContact && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">Contact Detail</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <input value={selectedContact.name} onChange={(e) => setSelectedContact({ ...selectedContact, name: e.target.value })} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <input value={selectedContact.email} onChange={(e) => setSelectedContact({ ...selectedContact, email: e.target.value })} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <input value={selectedContact.title} onChange={(e) => setSelectedContact({ ...selectedContact, title: e.target.value })} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <input value={selectedContact.company} onChange={(e) => setSelectedContact({ ...selectedContact, company: e.target.value })} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <textarea value={selectedContact.notes || ""} onChange={(e) => setSelectedContact({ ...selectedContact, notes: e.target.value })} className="md:col-span-2 min-h-[100px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={() => {
                  if (!isValidEmail(selectedContact.email)) {
                    showToast("Invalid email");
                    return;
                  }
                  const duplicate = contacts.some((contact) =>
                    contact.id !== selectedContact.id && normalizeEmail(contact.email) === normalizeEmail(selectedContact.email)
                  );
                  if (duplicate) {
                    showToast("Duplicate email detected.");
                    return;
                  }
                  setContacts((current) => current.map((item) => item.id === selectedContact.id ? { ...selectedContact } : item));
                  setSelectedContact(null);
                }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Save Changes</button>
                <button onClick={() => setSelectedContact(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Close</button>
              </div>
            </section>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
