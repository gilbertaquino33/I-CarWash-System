// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const APP_SCHEME = "carwashapp";

// MAHALAGA: HUWAG magbalik ng HTML page dito. Pinipilit ng Supabase Edge
// gateway na `Content-Type: text/plain` + `Content-Security-Policy:
// default-src 'none'; sandbox` ang lahat ng HTML na galing sa default na
// *.supabase.co/functions/v1/* domain (anti-phishing policy nila). Ang
// resulta: raw source ang nakikita ng user at blocked ang inline <script>,
// kaya hindi kailanman tatakbo ang redirect. Sa halip, isang 302 na lang
// diretso sa deep link -- ito ang hinahanap ng Chrome Custom Tab ng
// WebBrowser.openAuthSessionAsync at ng in-app browser ng GCash.
// Where PayMongo may send the customer back to: the app (deep links) or the
// I-CarWash WEBSITE. Only our own site is allowed (no open redirect):
// localhost for development, the project's Vercel URLs, and any extra origin
// listed in the WEB_RETURN_ORIGINS secret (comma-separated, e.g. a custom domain).
function isAllowedReturnUrl(url: string): boolean {
  if (/^(exp|exps|carwashapp|icarwash):\/\//.test(url)) return true;
  if (/^http:\/\/localhost(:\d+)?\//.test(url)) return true;
  if (/^https:\/\/i-car-wash-system[a-z0-9-]*\.vercel\.app\//.test(url)) return true;
  const extra = (Deno.env.get("WEB_RETURN_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return extra.some((origin) => url.startsWith(`${origin}/`));
}

serve((req) => {
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const requestedReturnUrl = url.searchParams.get("returnUrl") ?? "";

  // Tinatanggap lang natin ang mga scheme na kayang buksan ng app mismo:
  // `exp://` (Expo Go / dev server) at ang custom scheme ng dev/production
  // build. Kapag walang valid na returnUrl (hal. luma pang source na ginawa
  // bago i-deploy ang bersyong ito), babalik tayo sa custom scheme.
  const validReturnUrl = isAllowedReturnUrl(requestedReturnUrl) ? requestedReturnUrl : "";

  // Idinadagdag ang bookingId/status sa returnUrl nang hindi sinisira ang
  // mga query param na kasama na nito (importante ito sa `exp://host/--/path`
  // na URL ng Expo Go at sa dev-client URLs na may naka-embed nang `?url=`).
  const appendParams = (base: string, params: Record<string, string>) => {
    const [beforeHash, hash = ""] = base.split("#");
    const [path, existingQuery = ""] = beforeHash.split("?");
    const search = new URLSearchParams(existingQuery);
    for (const [key, value] of Object.entries(params)) {
      if (value && !search.has(key)) search.set(key, value);
    }
    const query = search.toString();
    return `${path}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  };

  const deepLink = appendParams(
    validReturnUrl || `${APP_SCHEME}://payment-return`,
    { bookingId, status }
  );

  // Plain-text body lang para sa mga kliyenteng hindi sumusunod sa 302
  // (hal. curl). Ang mga totoong browser/webview ay dederetso na sa app.
  return new Response(`Returning you to I-CarWash...\n${deepLink}\n`, {
    status: 302,
    headers: {
      Location: deepLink,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
