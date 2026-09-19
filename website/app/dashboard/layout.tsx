import { DashboardSidebar } from "@/components/DashboardSidebar";
import { requireDashboardContext } from "@/lib/dashboard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, shop } = await requireDashboardContext();

  return (
    <div className="flex min-h-screen flex-col bg-ink-50/50 lg:flex-row">
      <DashboardSidebar
        role={profile.role}
        fullName={profile.full_name}
        email={profile.email_address}
        shopName={shop?.shop_name}
      />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
