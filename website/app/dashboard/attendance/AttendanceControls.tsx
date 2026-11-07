"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// Prev / date picker / next / Today for the Attendance page (?date=YYYY-MM-DD).
export function AttendanceDateNav({
  date,
  prev,
  next,
  today,
}: {
  date: string;
  prev: string;
  next: string | null;
  today: string;
}) {
  const router = useRouter();
  const go = (d: string) => router.push(`/dashboard/attendance?date=${d}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/dashboard/attendance?date=${prev}`}
        aria-label="Previous day"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
      >
        <ChevronLeft size={17} />
      </Link>

      <label className="relative flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-900">
        <CalendarDays size={15} className="text-ink-400" />
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="bg-transparent outline-none"
          aria-label="Pick a date"
          suppressHydrationWarning
        />
      </label>

      {next ? (
        <Link
          href={`/dashboard/attendance?date=${next}`}
          aria-label="Next day"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-50"
        >
          <ChevronRight size={17} />
        </Link>
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-100 bg-ink-50 text-ink-300">
          <ChevronRight size={17} />
        </span>
      )}

      {date !== today && (
        <Link
          href="/dashboard/attendance"
          className="h-10 rounded-xl px-3 text-sm font-semibold leading-10 text-brand-600 transition hover:bg-brand-50"
        >
          Today
        </Link>
      )}
    </div>
  );
}
