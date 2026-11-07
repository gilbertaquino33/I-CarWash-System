import { APP_DOWNLOAD_URL } from "@/lib/app";

// Android robot head -- marks the download as the Android app.
function AndroidIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.13a11.4 11.4 0 0 0-4.92 1.01L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

// Store-style "Download for Android" badge (used in the footer).
export function AppDownloadBadge({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <a
      href={APP_DOWNLOAD_URL}
      className={`inline-flex items-center gap-3 rounded-xl px-4 py-2.5 transition ${
        dark
          ? "bg-ink-950 text-white ring-1 ring-ink-800 hover:bg-ink-800"
          : "bg-white text-ink-950 ring-1 ring-white/20 hover:bg-ink-50"
      }`}
      aria-label="Download the I-CarWash app for Android"
    >
      <span className={dark ? "text-[#3DDC84]" : "text-[#1F9E57]"}>
        <AndroidIcon />
      </span>
      <span className="flex flex-col leading-tight">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-white/70" : "text-ink-500"}`}>
          Download for
        </span>
        <span className="font-display text-lg font-bold">Android</span>
      </span>
    </a>
  );
}
