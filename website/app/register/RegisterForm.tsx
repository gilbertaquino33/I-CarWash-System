"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, MailCheck, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FormError } from "@/components/account/AuthShell";
import { toPHMobile } from "@/lib/customer";

export function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanMobile = toPHMobile(mobile);
    if (!fullName.trim()) return setError("Please enter your full name.");
    if (!cleanMobile) return setError("Enter a valid Philippine mobile number, e.g. 0917 123 4567.");
    if (password.length < 8) return setError("Your password needs at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don’t match.");
    if (!agree) return setError("Please agree to the Terms & Conditions to continue.");

    setBusy(true);
    const cleanEmail = email.trim().toLowerCase();
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        // Same metadata as the app -> the profile is created as a customer.
        data: { full_name: fullName.trim(), email_address: cleanEmail, role: "customer", mobile: cleanMobile },
      },
    });
    setBusy(false);

    if (signUpError) {
      const msg = signUpError.message.toLowerCase();
      setError(
        msg.includes("already")
          ? "This email already has an account. Please log in instead."
          : /fetch|network/.test(msg)
            ? "We couldn’t connect. Please check your internet and try again."
            : signUpError.message
      );
      return;
    }
    if (data.user && data.user.identities?.length === 0) {
      setError("This email already has an account. Please log in instead.");
      return;
    }
    setSentTo(cleanEmail);
  };

  if (sentTo) {
    return (
      <div className="mt-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <MailCheck size={26} />
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink-950">Check your email</h2>
        <p className="mt-2 text-sm text-ink-500">
          We sent a verification link to <span className="font-semibold text-ink-800">{sentTo}</span>. Open it,
          then log in.
        </p>
        <Link href="/login" className="btn-primary mt-6 w-full">
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div>
        <label className="label">Full name</label>
        <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" autoComplete="name" required />
      </div>
      <div>
        <label className="label">Email</label>
        <input type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
      </div>
      <div>
        <label className="label">Mobile number</label>
        <input type="tel" inputMode="tel" className="field" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0917 123 4567" autoComplete="tel" required />
      </div>
      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input type={show ? "text" : "password"} className="field pr-11" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div>
        <label className="label">Confirm password</label>
        <input type={show ? "text" : "password"} className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" autoComplete="new-password" required />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-600">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-500" />
        I agree to the I-CarWash Terms &amp; Conditions. Reservations are non-refundable; a cancelled or
        missed paid booking becomes store credit.
      </label>

      {error && <FormError>{error}</FormError>}

      <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
        {busy ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
