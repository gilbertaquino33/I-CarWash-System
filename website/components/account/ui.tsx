"use client";

import { useEffect } from "react";
import QRCode from "react-qr-code";
import { CheckCircle2, Clock3, Droplets, Truck, X, XCircle } from "lucide-react";
import { GRACE_MINUTES, formatDay, isCancelled } from "@/lib/customer";

// Same wording as the app: "Voided" shows as "Cancelled".
export function displayStatus(status: string) {
  return isCancelled(status) ? "Cancelled" : status;
}

export function StatusBadge({ status }: { status: string }) {
  const s = displayStatus(status);
  const style =
    s === "Completed"
      ? { cls: "bg-emerald-50 text-emerald-700", Icon: CheckCircle2 }
      : s === "Cancelled"
        ? { cls: "bg-red-50 text-red-700", Icon: XCircle }
        : s === "Washing"
          ? { cls: "bg-brand-50 text-brand-700", Icon: Droplets }
          : s === "On the Way"
            ? { cls: "bg-violet-50 text-violet-700", Icon: Truck }
            : { cls: "bg-ink-100 text-ink-600", Icon: Clock3 };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${style.cls}`}>
      <style.Icon size={12} />
      {s}
    </span>
  );
}

export function PaymentBadge({ status }: { status: string | null }) {
  const paid = status === "paid";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {paid ? "PAID" : "UNPAID"}
    </span>
  );
}

// Slot + 15-minute grace, e.g. 8:00 PM -> "8:15 PM".
export function checkInDeadline(scheduledAt: string | null) {
  if (!scheduledAt) return null;
  return new Date(new Date(scheduledAt).getTime() + GRACE_MINUTES * 60000).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:max-w-md sm:rounded-3xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-ink-500 hover:bg-ink-100"
        >
          <X size={17} />
        </button>
        {children}
      </div>
    </div>
  );
}

// The QR the staff scans at the shop. Same value format as the app.
export function QrTicket({
  token,
  shopName,
  service,
  vehicle,
  date,
  time,
  scheduledAt,
}: {
  token: string;
  shopName: string | null;
  service: string | null;
  vehicle: string | null;
  date: string | null;
  time: string | null;
  scheduledAt: string | null;
}) {
  const deadline = checkInDeadline(scheduledAt);
  return (
    <div className="text-center">
      <h2 id="qr-title" className="text-lg font-bold text-ink-950">
        Show this at the shop
      </h2>
      <p className="mt-1 text-sm text-ink-500">The staff scans it to check you in.</p>
      <div className="mx-auto mt-5 w-fit rounded-2xl border border-ink-100 bg-white p-4 shadow-card">
        <QRCode value={`ICW-RES:${token}`} size={196} />
      </div>
      <dl className="mt-5 space-y-1.5 rounded-2xl bg-ink-50 p-4 text-left text-sm">
        <Row k="Branch" v={shopName ?? "—"} />
        <Row k="Service" v={`${service ?? "—"} · ${vehicle ?? ""}`} />
        <Row k="Schedule" v={`${formatDay(date)}${time ? ` · ${time}` : ""}`} />
      </dl>
      {deadline && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
          Check in by {deadline}, or the booking is cancelled automatically.
        </p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-right font-semibold text-ink-900">{v}</dd>
    </div>
  );
}

export function EmptyCard({ icon: Icon, title, text, action }: { icon: React.ElementType; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
      <Icon size={28} className="mx-auto text-ink-300" />
      <p className="mt-3 font-semibold text-ink-800">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
