import { redirect } from "next/navigation";
import { Video } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { LiveVideoView } from "./LiveVideoView";

export const metadata = { title: "Live Video" };

export default async function LiveVideoPage() {
  const { profile, shop } = await requireDashboardContext();
  if (profile.role !== "admin") redirect("/dashboard");

  return (
    <div>
      <PageHeader
        title="Live Video"
        description="The YOLO-processed CCTV stream from your shop's Raspberry Pi backend."
      />

      {!shop ? (
        <div className="mt-8">
          <EmptyState
            icon={Video}
            title="No shop linked"
            description="Set up your shop first before you can view its live stream."
          />
        </div>
      ) : (
        <LiveVideoView shopId={shop.id} initialUrl={shop.cctv_stream_url} />
      )}
    </div>
  );
}
