import type { ContactStatus } from "@/types/contact";

const STATUS_STYLES: Record<ContactStatus, string> = {
  Pending: "bg-blue-100 text-blue-700",
  Sent: "bg-green-100 text-green-700",
  Skipped: "bg-orange-100 text-orange-700",
  Invalid: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: ContactStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
