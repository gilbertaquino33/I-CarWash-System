"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { detectArea, isBranchInArea, normalizeTown, type BranchLite, type CustomerArea } from "@/lib/customer";

export type AreaState =
  | { status: "checking" }
  | { status: "ok"; area: CustomerArea; manual?: boolean }
  | { status: "denied" | "unsupported" | "failed" };

const MANUAL_TOWN_KEY = "icw-manual-town";

// Same rule as the app: only branches in the customer's town / city.
// If the browser can't share the location (desktop, blocked), the customer
// can pick their town from the towns that have a branch.
export function useNearbyBranches() {
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState<AreaState>({ status: "checking" });

  useEffect(() => {
    createClient()
      .from("shop_profile_setup")
      .select("id, shop_name, province, city, barangay, latitude, longitude, total_bays")
      .order("shop_name")
      .then(({ data }) => {
        setBranches((data as BranchLite[]) ?? []);
        setLoading(false);
      });
  }, []);

  const locate = useCallback(async () => {
    setArea({ status: "checking" });
    const res = await detectArea();
    if (res.ok) {
      setArea({ status: "ok", area: res.area });
      return;
    }
    // Fall back to a town the customer picked before.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MANUAL_TOWN_KEY);
    } catch {}
    if (saved) {
      setArea({ status: "ok", manual: true, area: { town: normalizeTown(saved), townLabel: saved, label: saved, lat: null, lng: null } });
    } else {
      setArea({ status: res.reason });
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const chooseTown = useCallback((town: string) => {
    try {
      localStorage.setItem(MANUAL_TOWN_KEY, town);
    } catch {}
    setArea({ status: "ok", manual: true, area: { town: normalizeTown(town), townLabel: town, label: town, lat: null, lng: null } });
  }, []);

  const towns = useMemo(
    () => Array.from(new Set(branches.map((b) => (b.city ?? "").trim()).filter(Boolean))).sort(),
    [branches]
  );

  const nearby = useMemo(
    () => (area.status === "ok" ? branches.filter((b) => isBranchInArea(b, area.area)) : []),
    [area, branches]
  );

  return { branches, nearby, loading, area, locate, chooseTown, towns };
}
