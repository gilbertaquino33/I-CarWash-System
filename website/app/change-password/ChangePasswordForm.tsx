"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    // One call sets the new password AND clears the flag, so the account can't
    // end up with a new password but still be stuck on this page.
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });

    if (updateError) {
      setSubmitting(false);
      // Includes "New password should be different from the old password."
      setError(updateError.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <p className="text-sm text-ink-500">
        Signed in as <span className="font-medium text-ink-700">{email}</span>
      </p>

      <div>
        <label className="label" htmlFor="new-password">
          New password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field pr-11"
            autoComplete="new-password"
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
        <p className="mt-1.5 text-xs text-ink-500">
          At least {MIN_PASSWORD_LENGTH} characters, and different from your temporary password.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type={showPassword ? "text" : "password"}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field"
          autoComplete="new-password"
          suppressHydrationWarning
        />
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
            Saving...
          </>
        ) : (
          <>
            <ShieldCheck size={16} />
            Save and continue
          </>
        )}
      </button>

      <p className="text-center text-sm text-ink-500">
        Not you?{" "}
        <button
          type="button"
          onClick={handleSignOut}
          className="font-semibold text-brand-600 hover:text-brand-700"
          suppressHydrationWarning
        >
          Sign out
        </button>
      </p>
    </form>
  );
}
