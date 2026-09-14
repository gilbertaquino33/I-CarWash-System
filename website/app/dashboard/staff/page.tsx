import { redirect } from "next/navigation";
import { Mail, Phone, UserRound, Users } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/dashboard/ui";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const { profile, shop } = await requireDashboardContext();
  if (profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();

  const staff = shop
    ? (
        await supabase
          .from("profiles")
          .select("id, full_name, email_address, mobile, role, shop_id, avatar_url, created_at")
          .eq("role", "staff")
          .eq("shop_id", shop.id)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  const typedStaff = staff as Profile[];

  return (
    <div>
      <PageHeader
        title="Staff"
        description={`People who work at ${shop?.shop_name ?? "your shop"}.`}
        action={
          typedStaff.length > 0 && (
            <Badge tone="neutral">
              <Users size={12} />
              {typedStaff.length} member{typedStaff.length === 1 ? "" : "s"}
            </Badge>
          )
        }
      />

      {!shop ? (
        <div className="mt-8">
          <EmptyState
            icon={Users}
            title="No shop yet"
            description="Set up your shop first before you add staff."
          />
        </div>
      ) : typedStaff.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Users}
            title="No staff yet"
            description="Your staff can sign up in the I-CarWash app and pick this shop."
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="mt-8 hidden overflow-hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/70 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Name</th>
                  <th className="px-5 py-3.5 font-semibold">Email</th>
                  <th className="px-5 py-3.5 font-semibold">Mobile</th>
                  <th className="px-5 py-3.5 font-semibold">Date added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {typedStaff.map((member) => (
                  <tr key={member.id} className="transition hover:bg-ink-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-950 font-display text-xs font-bold text-white">
                          {member.full_name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="font-semibold text-ink-950">
                          {member.full_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-ink-600">{member.email_address}</td>
                    <td className="px-5 py-4 text-ink-600">{member.mobile || "—"}</td>
                    <td className="px-5 py-4 text-ink-500">
                      {member.created_at
                        ? new Date(member.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="mt-8 space-y-3 sm:hidden">
            {typedStaff.map((member) => (
              <Card key={member.id} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 font-display text-sm font-bold text-white">
                    {member.full_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-950">{member.full_name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-ink-500">
                      <UserRound size={11} />
                      Staff
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm text-ink-600">
                  <p className="flex items-center gap-2">
                    <Mail size={13} className="text-ink-400" />
                    {member.email_address}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone size={13} className="text-ink-400" />
                    {member.mobile || "—"}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
