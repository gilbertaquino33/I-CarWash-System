"use client";

import { useActionState, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  UserPlus,
  X,
} from "lucide-react";
import { registerStaff, type RegisterStaffState } from "./actions";

const INITIAL_STATE: RegisterStaffState = { status: "idle" };

// No 0/O/1/l/I so a password read aloud or off a screen isn't misheard.
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 12) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join("");
}

export function AddStaffButton({ shopName }: { shopName?: string }) {
  const [open, setOpen] = useState(false);
  // Bumping the key remounts the modal, which wipes the form + action state.
  const [session, setSession] = useState(0);

  const close = () => {
    setOpen(false);
    setSession((n) => n + 1);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary"
        suppressHydrationWarning
      >
        <UserPlus size={16} />
        Register staff
      </button>
      {open && <AddStaffModal key={session} shopName={shopName} onClose={close} />}
    </>
  );
}

function AddStaffModal({
  shopName,
  onClose,
}: {
  shopName?: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(registerStaff, INITIAL_STATE);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [copied, setCopied] = useState(false);

  const created = state.status === "success" ? state.created : undefined;

  const copyLogin = async () => {
    if (!created) return;
    const text = `I-CarWash staff login\nEmail: ${created.email}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (http, permissions); the details are on screen.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Register staff"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-lift">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-950">
              {created ? "Staff registered" : "Register staff"}
            </h2>
            {!created && (
              <p className="mt-1 text-sm text-ink-500">
                {shopName
                  ? `This person will be added to ${shopName}.`
                  : "Create a login for someone who works at your shop."}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
            suppressHydrationWarning
          >
            <X size={18} />
          </button>
        </div>

        {created ? (
          <div className="mt-5">
            <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>
                <strong>{created.fullName}</strong> can now sign in to the I-CarWash app
                and this website as staff.
              </span>
            </p>

            <dl className="mt-4 space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Email
                </dt>
                <dd className="mt-0.5 break-all text-ink-950">{created.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Temporary password
                </dt>
                <dd className="mt-0.5 font-mono text-ink-950">{password}</dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-ink-500">
              Give these to your staff now. The first time they sign in they&apos;ll be
              asked to choose their own password. This one isn&apos;t shown again.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyLogin}
                className="btn-outline"
                suppressHydrationWarning
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy login details"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary"
                suppressHydrationWarning
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="staff-name">
                Full name
              </label>
              <input
                id="staff-name"
                name="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="field"
                placeholder="Juan Dela Cruz"
                autoComplete="off"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label className="label" htmlFor="staff-email">
                Email
              </label>
              <input
                id="staff-email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="staff@example.com"
                autoComplete="off"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label className="label" htmlFor="staff-mobile">
                Mobile number
              </label>
              <input
                id="staff-mobile"
                name="mobile"
                type="tel"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="field"
                placeholder="0917 123 4567"
                autoComplete="off"
                suppressHydrationWarning
              />
            </div>

            <div>
              <label className="label" htmlFor="staff-password">
                Temporary password
              </label>
              <div className="relative">
                <input
                  id="staff-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-20 font-mono"
                  autoComplete="new-password"
                  suppressHydrationWarning
                />
                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-ink-400">
                  <button
                    type="button"
                    aria-label="Generate a new password"
                    title="Generate a new password"
                    onClick={() => setPassword(generatePassword())}
                    className="transition hover:text-ink-700"
                    suppressHydrationWarning
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="transition hover:text-ink-700"
                    suppressHydrationWarning
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-ink-500">
                At least 8 characters. Your staff will be asked to replace it the
                first time they sign in.
              </p>
            </div>

            {state.status === "error" && (
              <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {state.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline"
                suppressHydrationWarning
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary disabled:opacity-60"
                suppressHydrationWarning
              >
                {pending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    Register staff
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
