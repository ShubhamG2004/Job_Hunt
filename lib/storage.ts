import type { Contact, EmailTemplate, ProfileData } from "@/types/contact";
import { getSupabaseAuthHeaders } from "@/lib/supabase-browser";

const DB_NAME = "hr-outreach-manager";
const STORE_NAME = "app-state";

export const PROFILE_KEY = "hr-outreach-profile";
export const TEMPLATE_KEY = "hr-outreach-template";
export const TRACKER_KEY = "hr-outreach-tracker";

export interface CloudState {
  profile: ProfileData;
  template: EmailTemplate;
  contacts: Contact[];
  trackerFileName: string;
}

export function defaultProfile(): ProfileData {
  return {
    name: "Shubham Gavade",
    phone: "",
    linkedin: "",
    github: "",
    resume: "",
  };
}

export async function loadCloudState(): Promise<CloudState | null> {
  try {
    const headers = await getSupabaseAuthHeaders();
    const response = await fetch("/api/state", { cache: "no-store", headers });
    if (!response.ok) return null;
    return (await response.json()) as CloudState | null;
  } catch {
    return null;
  }
}

async function updateCloudState(patch: Partial<CloudState>): Promise<boolean> {
  try {
    const headers = await getSupabaseAuthHeaders();
    headers["Content-Type"] = "application/json";
    const response = await fetch("/api/state", {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });
    return response.ok;
  } catch {
    // Local persistence remains available if Supabase is not configured.
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Database open failed."));
  });
}

async function readStoreValue<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return await new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Read failed."));
    });
  } catch {
    return null;
  }
}

async function writeStoreValue<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Write failed."));
    });
  } catch {
    // Fail quietly so the app still works even without IndexedDB support.
  }
}

export function loadProfile(): ProfileData {
  if (typeof window === "undefined") {
    return defaultProfile();
  }

  const fallback = defaultProfile();

  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (raw) {
    try {
      return { ...fallback, ...JSON.parse(raw) };
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export function saveProfile(profile: ProfileData) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    void writeStoreValue(PROFILE_KEY, profile);
  }
  void updateCloudState({ profile });
}

export function loadTemplate(): EmailTemplate {
  if (typeof window === "undefined") {
    return defaultTemplate();
  }

  const raw = window.localStorage.getItem(TEMPLATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as EmailTemplate;
      return {
        subject: parsed.subject || defaultTemplate().subject,
        body: parsed.body || defaultTemplate().body,
      };
    } catch {
      return defaultTemplate();
    }
  }

  return defaultTemplate();
}

export function saveTemplate(template: EmailTemplate) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
    void writeStoreValue(TEMPLATE_KEY, template);
  }
  void updateCloudState({ template });
}

export async function loadTracker(): Promise<{ contacts: Contact[]; trackerFileName: string } | null> {
  const value = await readStoreValue<{ contacts: Contact[]; trackerFileName: string }>(TRACKER_KEY);
  if (!value || !Array.isArray(value.contacts)) return null;
  return value;
}

export async function saveTracker(tracker: { contacts: Contact[]; trackerFileName: string }): Promise<boolean> {
  await writeStoreValue(TRACKER_KEY, tracker);
  return updateCloudState(tracker);
}

export function defaultTemplate(): EmailTemplate {
  return {
    subject: "Application for Software / AI Engineer – 2026 Graduate | {{company}}",
    body: `Hi {{name}},\n\nI’m Shubham Gavade, a recent Electronics & Computer Engineering graduate with experience in Java, Python, React/Next.js, Node.js, MongoDB, Machine Learning and Generative AI.\n\nI’m currently looking for Software Developer, Full-Stack or AI/ML Engineer opportunities and would be grateful if you could consider my profile for any relevant openings at {{company}}.\n\nI’ve worked on projects involving RAG, computer vision, REST APIs and full-stack applications, and I’m also strong in DSA.\n\nI’ve attached my resume for your consideration.\n\nThank you for your time.\n\nRegards,\n{{myName}}\n{{phone}}\n{{linkedin}}\n{{github}}\n{{resume}}`,
  };
}
