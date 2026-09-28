"use client";

import { useState } from "react";
import { AlertCircle, ExternalLink, Pencil, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/dashboard/ui";

export function LiveVideoView({
  shopId,
  initialUrl,
}: {
  shopId: number;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [editing, setEditing] = useState(!initialUrl);
  const [draft, setDraft] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every save so <img key={...}> remounts and reconnects to the
  // (possibly new) stream instead of quietly keeping the old connection.
  const [streamKey, setStreamKey] = useState(0);
  const [streamFailed, setStreamFailed] = useState(false);

  const openEditor = () => {
    setDraft(url);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim();
    if (!/^https?:\/\/.+/i.test(next)) {
      setError("Enter a full URL starting with http:// or https://");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("shop_profile_setup")
      .update({ cctv_stream_url: next })
      .eq("id", shopId);
    setSaving(false);

    if (updateError) {
      setError(`Could not save: ${updateError.message}`);
      return;
    }

    setUrl(next);
    setStreamFailed(false);
    setStreamKey((k) => k + 1);
    setEditing(false);
  };

  return (
    <div className="mt-8 max-w-2xl">
      <Card className="overflow-hidden">
        <div className="relative flex aspect-video items-center justify-center bg-ink-950">
          {url && !editing ? (
            <>
              {/* An <img> pointed at an MJPEG (multipart/x-mixed-replace)
                  endpoint streams live in every modern browser -- no player
                  library needed, unlike the mobile app's WebView workaround. */}
              <img
                key={streamKey}
                src={url}
                alt="Live CCTV feed"
                className="h-full w-full object-contain"
                onError={() => setStreamFailed(true)}
                onLoad={() => setStreamFailed(false)}
              />
              {streamFailed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/95 text-center">
                  <AlertCircle size={22} className="text-white/40" />
                  <p className="max-w-xs text-sm text-white/60">
                    Can&apos;t reach the stream right now. The Raspberry Pi or
                    its Tailscale connection may be offline.
                  </p>
                </div>
              )}
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-ink-950/85 px-2.5 py-1.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                LIVE
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-8 text-center">
              <Video size={26} className="text-white/30" />
              <p className="text-sm text-white/50">
                No stream URL set yet for this shop.
              </p>
            </div>
          )}
        </div>

        <div className="p-5">
          {editing ? (
            <div className="space-y-3">
              <label className="label">Stream URL</label>
              <input
                type="url"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="http://100.x.x.x:8001/video"
                className="field"
                autoFocus
                suppressHydrationWarning
              />
              <p className="text-xs text-ink-400">
                Use the Raspberry Pi&apos;s <strong>Tailscale IP</strong> (not its
                local network IP) so the stream keeps working from any
                network, e.g. <code>http://100.71.68.94:8001/video</code>.
              </p>
              {error && (
                <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  <AlertCircle size={15} className="shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="btn-primary disabled:opacity-60"
                  suppressHydrationWarning
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {url && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="btn-outline"
                    suppressHydrationWarning
                  >
                    <X size={15} />
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-ink-500">{url}</p>
              <div className="flex shrink-0 gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline"
                >
                  <ExternalLink size={15} />
                  Open full feed
                </a>
                <button type="button" onClick={openEditor} className="btn-outline" suppressHydrationWarning>
                  <Pencil size={15} />
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
