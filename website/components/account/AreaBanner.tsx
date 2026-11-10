"use client";

import { Loader2, LocateFixed, MapPin } from "lucide-react";
import type { AreaState } from "./useNearbyBranches";

// "You're in Nasugbu, Batangas" -- or what to do when the location can't be read.
export function AreaBanner({
  area,
  towns,
  onRetry,
  onChooseTown,
}: {
  area: AreaState;
  towns: string[];
  onRetry: () => void;
  onChooseTown: (town: string) => void;
}) {
  if (area.status === "checking") {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <Loader2 size={16} className="animate-spin" />
        Checking your location…
      </div>
    );
  }

  if (area.status === "ok") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <span className="flex items-center gap-2">
          <MapPin size={16} className="shrink-0 text-brand-600" />
          <span>
            {area.manual ? "Showing branches in " : "You’re in "}
            <b>{area.area.label}</b>
            {area.manual ? "." : `. Showing branches in ${area.area.townLabel}.`}
          </span>
        </span>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline">
          <LocateFixed size={13} /> Use my location
        </button>
      </div>
    );
  }

  const why =
    area.status === "denied"
      ? "Location is blocked for this site. Allow it in your browser’s site settings, or choose your town below."
      : area.status === "unsupported"
        ? "This browser can’t share your location. Choose your town below."
        : "We couldn’t find your location. Make sure Location is on, or choose your town below.";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
      <p className="flex items-start gap-2">
        <MapPin size={16} className="mt-0.5 shrink-0" />
        <span>
          <b>Where are you?</b> {why}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Choose your town"
          defaultValue=""
          onChange={(e) => e.target.value && onChooseTown(e.target.value)}
          className="field h-10 max-w-[240px] py-0"
        >
          <option value="" disabled>
            Choose your town…
          </option>
          {towns.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" onClick={onRetry} className="btn-outline h-10 py-0">
          <LocateFixed size={15} /> Try again
        </button>
      </div>
    </div>
  );
}
