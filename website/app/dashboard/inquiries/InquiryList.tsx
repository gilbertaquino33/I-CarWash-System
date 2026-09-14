"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Inbox,
  Loader2,
  Mail,
  Phone,
  PhoneCall,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card, EmptyState } from "@/components/dashboard/ui";
import type { QuoteRequest, QuoteStatus } from "@/lib/types";

const TABS: { key: QuoteStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Replied" },
  { key: "closed", label: "Done" },
];

const TAB_WORDS: Record<QuoteStatus, string> = {
  new: "new",
  contacted: "replied",
  closed: "finished",
};

const SERVICE_LABELS: Record<string, string> = {
  "walk-in-wash": "Walk-In Wash",
  "online-reservation": "Book a Slot",
  "home-service": "Home Service",
};

const STATUS_TONE: Record<QuoteStatus, "brand" | "success" | "neutral"> = {
  new: "brand",
  contacted: "success",
  closed: "neutral",
};

export function InquiryList({ initialInquiries }: { initialInquiries: QuoteRequest[] }) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [tab, setTab] = useState<QuoteStatus>("new");
  const [busyId, setBusyId] = useState<number | null>(null);

  const counts = useMemo(
    () => ({
      new: inquiries.filter((r) => r.status === "new").length,
      contacted: inquiries.filter((r) => r.status === "contacted").length,
      closed: inquiries.filter((r) => r.status === "closed").length,
    }),
    [inquiries]
  );

  const filtered = inquiries.filter((r) => r.status === tab);

  const updateStatus = async (id: number, status: QuoteStatus) => {
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("quote_requests").update({ status }).eq("id", id);
    if (!error) {
      setInquiries((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    }
    setBusyId(null);
  };

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-ink-100 bg-white p-1.5">
        {TABS.map((t) => (
          <button suppressHydrationWarning
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key ? "bg-ink-950 text-white" : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            {t.label}
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                tab === t.key ? "bg-white/15 text-white" : "bg-ink-100 text-ink-600"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Inbox}
            title={`No ${TAB_WORDS[tab]} messages`}
            description={
              tab === "new"
                ? "When someone asks for a price on your website, their message shows up here."
                : `You have no ${TAB_WORDS[tab]} messages right now.`
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {filtered.map((inquiry) => (
            <Card key={inquiry.id} className="p-5 transition hover:shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 font-display text-sm font-bold text-white">
                    {inquiry.full_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold text-ink-950">{inquiry.full_name}</p>
                    <p className="text-xs text-ink-400">
                      {new Date(inquiry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {SERVICE_LABELS[inquiry.service_type] ?? inquiry.service_type}
                  </Badge>
                  <Badge tone={STATUS_TONE[inquiry.status]}>
                    {TAB_WORDS[inquiry.status]}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
                <a
                  href={`mailto:${inquiry.email}`}
                  className="flex items-center gap-2 text-ink-600 transition hover:text-brand-600"
                >
                  <Mail size={14} className="text-ink-400" />
                  {inquiry.email}
                </a>
                <a
                  href={`tel:${inquiry.phone}`}
                  className="flex items-center gap-2 text-ink-600 transition hover:text-brand-600"
                >
                  <Phone size={14} className="text-ink-400" />
                  {inquiry.phone}
                </a>
                {inquiry.preferred_date && (
                  <p className="flex items-center gap-2 text-ink-600">
                    <CalendarDays size={14} className="text-ink-400" />
                    Wants it on {new Date(inquiry.preferred_date).toLocaleDateString()}
                  </p>
                )}
              </div>

              {inquiry.message && (
                <p className="mt-4 rounded-xl bg-ink-50/70 p-4 text-sm leading-relaxed text-ink-700">
                  {inquiry.message}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {inquiry.status !== "contacted" && (
                  <button suppressHydrationWarning
                    disabled={busyId === inquiry.id}
                    onClick={() => updateStatus(inquiry.id, "contacted")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
                  >
                    {busyId === inquiry.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <PhoneCall size={13} />
                    )}
                    I replied
                  </button>
                )}
                {inquiry.status !== "closed" && (
                  <button suppressHydrationWarning
                    disabled={busyId === inquiry.id}
                    onClick={() => updateStatus(inquiry.id, "closed")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-60"
                  >
                    <Check size={13} />
                    Mark as done
                  </button>
                )}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
