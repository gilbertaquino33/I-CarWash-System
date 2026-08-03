// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Naka-match na sa "scheme": "carwashapp" sa app.json mo
const APP_SCHEME = "carwashapp";

serve((req) => {
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const deepLink = `${APP_SCHEME}://payment-return?bookingId=${encodeURIComponent(
    bookingId
  )}&status=${encodeURIComponent(status)}`;

  // IMPORTANT: Hindi na tayo gagawa ng raw 302 redirect papunta sa custom
  // scheme dahil binlock ito ng mga browser (Chrome/Safari) kapag walang
  // user gesture (tap). Sa halip, magpalabas tayo ng maliit na HTML page na:
  //   1. Susubukan i-auto-redirect gamit ang JS (window.location) - kasama
  //      na ito sa "user gesture" chain kung galing sa click ng user papunta
  //      sa checkout, kaya mas malaki ang chance na tumuloy.
  //   2. May visible na "Continue" button bilang fallback kung na-block pa
  //      rin ng browser yung auto-redirect (common sa Chrome Custom Tabs).
  const isSuccess = status === "success";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>I-CarWash Payment</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
      background: #F3F5F8;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 32px 24px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.08);
      max-width: 320px;
      width: 90%;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 28px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${isSuccess ? "#00A651" : "#E63946"};
      color: #fff;
      font-size: 28px;
    }
    h1 { font-size: 16px; color: #1A1A1A; margin: 0 0 8px; }
    p { font-size: 13px; color: #8A8A8A; margin: 0 0 20px; }
    button {
      background: #0072CE;
      color: #fff;
      border: none;
      border-radius: 30px;
      padding: 14px 32px;
      font-size: 15px;
      font-weight: 700;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "&#10003;" : "&#10005;"}</div>
    <h1>${isSuccess ? "Payment Confirmed" : "Payment Not Completed"}</h1>
    <p>Redirecting you back to I-CarWash...</p>
    <button onclick="goToApp()">Continue to App</button>
  </div>
  <script>
    function goToApp() {
      window.location.href = "${deepLink}";
    }
    // Auto-attempt agad
    goToApp();
    // Retry once more after short delay in case first attempt was
    // swallowed while the page was still settling
    setTimeout(goToApp, 600);
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});