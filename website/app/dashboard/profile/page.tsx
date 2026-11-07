import { Building2, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { Badge, Card, PageHeader } from "@/components/dashboard/ui";
import { ChangePasswordCard, EditProfileForm } from "./ProfileForms";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const { profile, shop } = await requireDashboardContext();

  const rows = [
    { icon: UserRound, label: "Full name", value: profile.full_name },
    { icon: Mail, label: "Email", value: profile.email_address },
    { icon: Phone, label: "Mobile", value: profile.mobile || "—" },
    { icon: Building2, label: "Shop", value: shop?.shop_name ?? "No shop yet" },
  ];

  const initials = profile.full_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div>
      <PageHeader title="My Profile" description="View and update your account details." />

      <Card className="mt-8 overflow-hidden">
        <div className="flex items-center gap-4 border-b border-ink-100 bg-ink-50/60 p-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-950 font-display text-xl font-bold text-white">
            {initials || "?"}
          </span>
          <div>
            <p className="font-display text-lg font-bold text-ink-950">
              {profile.full_name}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <Badge tone="brand">
                <ShieldCheck size={11} />
                {profile.role === "admin" ? "Shop Owner" : "Staff"}
              </Badge>
            </div>
          </div>
        </div>

        <dl className="divide-y divide-ink-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-6 py-4">
              <dt className="flex items-center gap-2.5 text-sm text-ink-500">
                <row.icon size={15} className="text-ink-400" />
                {row.label}
              </dt>
              <dd className="text-right text-sm font-semibold text-ink-950">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <EditProfileForm
        fullName={profile.full_name}
        email={profile.email_address}
        mobile={profile.mobile ?? null}
        shopName={shop?.shop_name ?? null}
        isAdmin={profile.role === "admin" && !!shop}
      />

      <ChangePasswordCard />
    </div>
  );
}
