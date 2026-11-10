"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toPHMobile } from "@/lib/customer";
import { FormError, FormSuccess } from "@/components/account/AuthShell";

export default function ProfilePage() {
  const [id, setId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setId(user.id);
      const { data: p } = await supabase.from("profiles").select("full_name, email_address, mobile").eq("id", user.id).maybeSingle();
      setEmail(p?.email_address ?? user.email ?? "");
      setName(p?.full_name ?? "");
      setMobile(p?.mobile ? String(p.mobile).replace(/^\+63/, "0") : "");
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!name.trim()) return setMsg({ ok: false, text: "Please enter your name." });
    const clean = mobile.trim() ? toPHMobile(mobile) : null;
    if (mobile.trim() && !clean) return setMsg({ ok: false, text: "Enter a valid Philippine mobile number, e.g. 0917 123 4567." });
    setSaving(true);
    const { error } = await createClient().from("profiles").update({ full_name: name.trim(), mobile: clean }).eq("id", id ?? "");
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Your profile was saved." });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.length < 8) return setPwMsg({ ok: false, text: "Your new password needs at least 8 characters." });
    if (pw !== pw2) return setPwMsg({ ok: false, text: "The two passwords don’t match." });
    setPwBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      setPwMsg({ ok: false, text: error.message.includes("different") ? "Please choose a password different from your current one." : error.message });
      return;
    }
    setPw("");
    setPw2("");
    setPwMsg({ ok: true, text: "Your password was changed. Use it next time you log in (app and website)." });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-950">Profile</h1>
        <p className="mt-1 text-ink-500">The same details are used in the I-CarWash app.</p>
      </div>

      <form onSubmit={save} className="space-y-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
        <h2 className="font-bold text-ink-950">Your details</h2>
        <div>
          <label className="label">Full name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="field bg-ink-50 text-ink-500" value={email} disabled />
          <p className="mt-1 text-xs text-ink-400">Your email is your login, so it can’t be changed here.</p>
        </div>
        <div>
          <label className="label">Mobile number</label>
          <input type="tel" className="field" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0917 123 4567" />
        </div>
        {msg && (msg.ok ? <FormSuccess>{msg.text}</FormSuccess> : <FormError>{msg.text}</FormError>)}
        <button disabled={saving || !id} className="btn-primary disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save changes
        </button>
      </form>

      <form onSubmit={changePassword} className="space-y-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
        <h2 className="font-bold text-ink-950">Change password</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">New password</label>
            <input type="password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {pwMsg && (pwMsg.ok ? <FormSuccess>{pwMsg.text}</FormSuccess> : <FormError>{pwMsg.text}</FormError>)}
        <button disabled={pwBusy} className="btn-dark disabled:opacity-50">
          {pwBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Change password
        </button>
      </form>
    </div>
  );
}
