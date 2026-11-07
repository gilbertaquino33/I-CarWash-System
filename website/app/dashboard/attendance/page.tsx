import { redirect } from "next/navigation";
import { AlertTriangle, Clock, UserCheck, Users } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/dashboard/ui";
import type { Profile } from "@/lib/types";
import {
  formatClock,
  formatLongDay,
  formatMinutes,
  minutesBetween,
  phDayRange,
  phToday,
  phWeekStart,
  SHIFT_COLUMNS,
  shiftMinutes,
  shiftYmd,
  timedOutAway,
  type Shift,
} from "@/lib/attendance";
import { AttendanceDateNav } from "./AttendanceControls";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { profile, shop } = await requireDashboardContext();
  if (profile.role !== "admin") redirect("/dashboard");

  const today = phToday();
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today ? params.date : today;
  const isToday = date === today;
  const { start: dayStart, end: dayEnd } = phDayRange(date);
  const weekStart = phWeekStart(date);

  if (!shop) {
    return (
      <div>
        <PageHeader title="Attendance" description="See who came to work and how long they worked." />
        <div className="mt-8">
          <EmptyState icon={Users} title="No shop yet" description="Set up your shop first before tracking attendance." />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const [staffRes, shiftRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email_address, mobile, role, shop_id, avatar_url, created_at")
      .eq("role", "staff")
      .eq("shop_id", shop.id)
      .order("full_name", { ascending: true }),
    // The whole week up to the end of the chosen day: covers the day view
    // and the "this week" totals.
    supabase
      .from("staff_attendance")
      .select(SHIFT_COLUMNS)
      .eq("shop_id", shop.id)
      .gte("time_in", weekStart.toISOString())
      .lt("time_in", dayEnd.toISOString())
      .order("time_in", { ascending: true }),
  ]);

  const staff = (staffRes.data ?? []) as Profile[];
  const shifts = (shiftRes.data ?? []) as Shift[];
  const loadError = Boolean(staffRes.error || shiftRes.error);

  const dayShifts = shifts.filter((s) => {
    const t = new Date(s.time_in).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });
  const nameOf = (id: string) => staff.find((m) => m.id === id)?.full_name ?? "Staff";
  const presentIds = new Set(dayShifts.map((s) => s.staff_id));
  const absent = staff.filter((m) => !presentIds.has(m.id));
  const totalDayMinutes = dayShifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
  const onDutyNow = shifts.filter((s) => !s.time_out).length;

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="See who came to work and how long they worked. Working hours: 7:00 AM – 7:00 PM."
        action={<AttendanceDateNav date={date} prev={shiftYmd(date, -1)} next={isToday ? null : shiftYmd(date, 1)} today={today} />}
      />

      <p className="mt-4 font-display text-lg font-semibold text-ink-950">
        {formatLongDay(date)}
        {isToday && <span className="ml-2 align-middle"><Badge tone="brand">Today</Badge></span>}
      </p>

      {loadError && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Some attendance data could not be loaded. Make sure the staff attendance SQL has been run in Supabase.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={UserCheck} label="Came to work" value={`${presentIds.size} / ${staff.length}`} />
        <StatCard icon={Clock} label="Total hours worked" value={formatMinutes(totalDayMinutes)} />
        {isToday ? (
          <StatCard icon={Users} label="On duty right now" value={onDutyNow} />
        ) : (
          <StatCard icon={Users} label="Did not time in" value={absent.length} />
        )}
      </div>

      {/* DAY LOG */}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Time in / time out
        </div>

        {dayShifts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">
            No one timed in on this day.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Staff</th>
                  <th className="px-5 py-3 font-semibold">Time in</th>
                  <th className="px-5 py-3 font-semibold">Time out</th>
                  <th className="px-5 py-3 font-semibold">Hours</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {dayShifts.map((s) => {
                  const away = timedOutAway(s);
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="px-5 py-4 font-semibold text-ink-950">{nameOf(s.staff_id)}</td>
                      <td className="px-5 py-4 text-ink-700">{formatClock(s.time_in)}</td>
                      <td className="px-5 py-4 text-ink-700">{s.time_out ? formatClock(s.time_out) : "—"}</td>
                      <td className="px-5 py-4 font-semibold text-ink-950">{formatMinutes(shiftMinutes(s))}</td>
                      <td className="px-5 py-4">
                        {!s.time_out ? (
                          <Badge tone="success">On duty</Badge>
                        ) : s.auto_closed ? (
                          <Badge tone="warning">Forgot to time out</Badge>
                        ) : s.edited_by_admin ? (
                          <Badge tone="brand">Fixed by you</Badge>
                        ) : away ? (
                          <Badge tone="warning">Timed out away</Badge>
                        ) : (
                          <Badge tone="neutral">Complete</Badge>
                        )}
                        {s.auto_closed && (
                          <p className="mt-1.5 max-w-[220px] text-xs text-ink-500">
                            Timed out automatically at 7:00 PM closing.
                          </p>
                        )}
                        {away && (
                          <p className="mt-1.5 max-w-[220px] text-xs text-ink-500">
                            {s.time_out_distance_m == null
                              ? "Timed out without a verified location."
                              : `Timed out ${(s.time_out_distance_m / 1000).toFixed(1)} km from the shop.`}
                          </p>
                        )}
                        {s.edited_by_admin && s.admin_note && (
                          <p className="mt-1.5 max-w-[220px] text-xs text-ink-500">Note: {s.admin_note}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {absent.length > 0 && dayShifts.length > 0 && (
          <div className="border-t border-ink-100 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Did not time in</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {absent.map((m) => (
                <Badge key={m.id} tone="neutral">
                  {m.full_name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* WEEK TOTALS */}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Hours this week (Monday to {isToday ? "today" : formatLongDay(date).split(",")[0]})
        </div>
        {staff.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">No staff yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {staff.map((m) => {
              const own = shifts.filter((s) => s.staff_id === m.id);
              const mins = minutesBetween(own, weekStart, dayEnd);
              const days = new Set(own.map((s) => phToday(new Date(s.time_in)))).size;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="font-semibold text-ink-950">{m.full_name}</span>
                  <span className="text-ink-500">
                    {days > 0 ? `${days} day${days === 1 ? "" : "s"} · ` : ""}
                    <span className="font-semibold text-ink-950">{formatMinutes(mins)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        Working hours are 7:00 AM – 7:00 PM. Staff can only time in at the shop (checked by GPS on the server)
        within those hours, and times come from the server, not their phone. If someone forgets to time out, the
        shift ends automatically at 7:00 PM and shows as “Forgot to time out”.
      </p>
    </div>
  );
}
