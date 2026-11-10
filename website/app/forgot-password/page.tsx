"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, FormError, FormSuccess } from "@/components/account/AuthShell";

// Same 3 steps as the app (customer/reset-password.tsx):
// email -> code from the email -> new password.
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const supabase = createClient();

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setBusy(false);
    if (err) return setError(/fetch|network/i.test(err.message) ? "We couldn’t connect. Please check your internet." : err.message);
    setNotice(`We sent a code to ${email.trim().toLowerCase()}. It may take a minute — check Spam too.`);
    setStep(2);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "recovery" });
    setBusy(false);
    if (err) return setError("That code is wrong or expired. Please check it or send a new one.");
    setNotice(null);
    setStep(3);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Your new password needs at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don’t match.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const titles = {
    1: ["Forgot your password?", "Enter your email and we’ll send you a code."],
    2: ["Enter the code", "Type the code from the email we sent you."],
    3: ["Set a new password", "Choose a password you’ll remember."],
  } as const;

  return (
    <AuthShell
      back={{ href: "/login", label: "Back to log in" }}
      title={titles[step][0]}
      subtitle={titles[step][1]}
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <ol className="mt-5 flex gap-2" aria-label="Steps">
        {[1, 2, 3].map((n) => (
          <li key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-brand-500" : "bg-ink-100"}`} />
        ))}
      </ol>

      {step === 1 && (
        <form onSubmit={sendCode} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          {error && <FormError>{error}</FormError>}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />} Send code
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={verify} className="mt-6 space-y-4">
          {notice && <FormSuccess>{notice}</FormSuccess>}
          <div>
            <label className="label">Code</label>
            <input inputMode="numeric" className="field tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />
          </div>
          {error && <FormError>{error}</FormError>}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />} Continue
          </button>
          <button type="button" onClick={() => sendCode()} disabled={busy} className="w-full text-sm font-semibold text-brand-600 hover:text-brand-700">
            Send a new code
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={save} className="mt-6 space-y-4">
          <div>
            <label className="label">New password</label>
            <input type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <FormError>{error}</FormError>}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />} Save new password
          </button>
        </form>
      )}
    </AuthShell>
  );
}
