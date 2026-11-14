"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where to go after the "Logged in" confirmation; null = not logged in yet.
  const [successTo, setSuccessTo] = useState<string | null>(null);

  const goNext = (to: string) => {
    router.replace(to);
    router.refresh();
  };

  // Move on by itself after a moment so the confirmation never blocks anyone.
  useEffect(() => {
    if (!successTo) return;
    const t = setTimeout(() => goNext(successTo), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError || !data.user) {
      setSubmitting(false);
      const msg = (signInError?.message ?? "").toLowerCase();
      setError(
        msg.includes("invalid login")
          ? "Wrong email or password. Please check them and try again."
          : msg.includes("email not confirmed")
            ? "Please open the verification link we sent to your email first, then log in again."
            : /fetch|network/.test(msg)
              ? "We couldn’t connect. Please check your internet and try again."
              : signInError?.message ?? "Wrong email or password."
      );
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setSubmitting(false);
      setError("We can't find an account for this login.");
      return;
    }

    // One login for everyone: customers go to their account, shop owners and
    // staff to the shop dashboard.
    if (profile.role === "customer") {
      setSuccessTo(redirectTo?.startsWith("/account") ? redirectTo : "/account");
      return;
    }

    if (profile.role !== "admin" && profile.role !== "staff") {
      await supabase.auth.signOut();
      setSubmitting(false);
      setError("We can't find an account for this login.");
      return;
    }

    // Newly registered staff must replace their temporary password first.
    const mustChangePassword = data.user.user_metadata?.must_change_password === true;

    setSuccessTo(
      mustChangePassword
        ? "/change-password"
        : redirectTo?.startsWith("/dashboard")
          ? redirectTo
          : "/dashboard"
    );
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          placeholder="you@example.com"
          autoComplete="email"
          suppressHydrationWarning
        />
      </div>

      <div>
        <label className="label">Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field pr-11"
            placeholder="••••••••"
            autoComplete="current-password"
            suppressHydrationWarning
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
            suppressHydrationWarning
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="-mt-2 text-right">
        <a href="/forgot-password" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          Forgot password?
        </a>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full disabled:opacity-60"
        suppressHydrationWarning
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            <LogIn size={16} />
            Sign in
          </>
        )}
      </button>

      {successTo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="login-ok-title"
            className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-lift"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={30} />
            </span>
            <h2 id="login-ok-title" className="mt-4 text-lg font-bold text-ink-950">
              Logged in successfully
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              {successTo === "/change-password"
                ? "Please set a new password to continue."
                : successTo.startsWith("/dashboard")
                  ? "Taking you to your shop dashboard..."
                  : "Taking you to your account..."}
            </p>
            <button type="button" autoFocus onClick={() => goNext(successTo)} className="btn-primary mt-5 w-full">
              Continue
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
