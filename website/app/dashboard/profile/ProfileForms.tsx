"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/dashboard/ui";
import { updateProfile, type UpdateProfileState } from "./actions";

const INITIAL_STATE: UpdateProfileState = { status: "idle" };
const MIN_PASSWORD_LENGTH = 8;

// "+639171234567" -> "09171234567" so it reads the way people type it.
function toLocalMobile(value: string | null) {
  if (!value) return "";
  return value.startsWith("+63") ? `0${value.slice(3)}` : value;
}

function Message({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return tone === "success" ? (
    <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
      <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
      {children}
    </p>
  ) : (
    <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
      <AlertCircle size={15} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

export function EditProfileForm({
  fullName,
  email,
  mobile,
  shopName,
  isAdmin,
}: {
  fullName: string;
  email: string;
  mobile: string | null;
  shopName: string | null;
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL_STATE);

  return (
    <Card className="mt-6 p-6">
      <h2 className="font-display text-base font-semibold text-ink-950">Edit details</h2>
      <p className="mt-1 text-sm text-ink-500">Update the details shown on your account.</p>

      <form action={formAction} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="profile-name">
            Full name
          </label>
          <input
            id="profile-name"
            name="fullName"
            required
            defaultValue={fullName}
            className="field"
            autoComplete="name"
            suppressHydrationWarning
          />
        </div>

        <div>
          <label className="label" htmlFor="profile-mobile">
            Mobile number
          </label>
          <input
            id="profile-mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            defaultValue={toLocalMobile(mobile)}
            placeholder="0917 123 4567"
            className="field"
            autoComplete="tel"
            suppressHydrationWarning
          />
        </div>

        {isAdmin && (
          <div>
            <label className="label" htmlFor="profile-shop">
              Shop name
            </label>
            <input
              id="profile-shop"
              name="shopName"
              required
              defaultValue={shopName ?? ""}
              className="field"
              suppressHydrationWarning
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="profile-email">
            Email
          </label>
          <input id="profile-email" value={email} readOnly disabled className="field opacity-70" />
          <p className="mt-1.5 text-xs text-ink-500">This is the email you sign in with.</p>
        </div>

        {state.status !== "idle" && state.message && (
          <div className="sm:col-span-2">
            <Message tone={state.status === "success" ? "success" : "error"}>{state.message}</Message>
          </div>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60" suppressHydrationWarning>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {pending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </Card>
  );
}

export function ChangePasswordCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setResult({ tone: "error", text: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (password !== confirm) {
      setResult({ tone: "error", text: "The two passwords don't match." });
      return;
    }

    setSaving(true);
    const { error } = await createClient().auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setResult({
        tone: "error",
        text: /different from the old/i.test(error.message)
          ? "Your new password must be different from your current one."
          : "We couldn't change your password. Please try again.",
      });
      return;
    }
    setPassword("");
    setConfirm("");
    setResult({ tone: "success", text: "Your password has been changed." });
  };

  return (
    <Card className="mt-6 p-6">
      <h2 className="font-display text-base font-semibold text-ink-950">Change password</h2>
      <p className="mt-1 text-sm text-ink-500">Use at least {MIN_PASSWORD_LENGTH} characters.</p>

      <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-password">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
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
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
              suppressHydrationWarning
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type={show ? "text" : "password"}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field"
            autoComplete="new-password"
            suppressHydrationWarning
          />
        </div>

        {result && (
          <div className="sm:col-span-2">
            <Message tone={result.tone}>{result.text}</Message>
          </div>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="btn-outline disabled:opacity-60" suppressHydrationWarning>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {saving ? "Updating..." : "Update password"}
          </button>
        </div>
      </form>
    </Card>
  );
}
