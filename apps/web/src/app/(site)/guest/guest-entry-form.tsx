"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { parseRoomCode } from "@incision/domain";
import type { Dictionary } from "@/i18n/dictionaries";
import { guestStartSchema } from "@/identity/guest-contract";
import { withGuestCookieLock } from "@/identity/guest-browser";
import { GuestAvatar } from "@/components/rooms/guest-avatar";
import { card, discreetButton, fieldLabel, primaryButton, textField } from "@/components/ui/styles";
import { guestAdmissionAction, resetGuestCookieAction, type GuestAdmissionError } from "@/server/rooms/guest-admission-action";
import { joinInvitationAction } from "@/server/rooms/invitation-actions";

const subscribe = () => () => {};
const statusSchema = z.object({ ok: z.literal(true), status: z.enum(["absent", "guest"]) });

export function GuestEntryForm({ t, initialCode, invitationToken }: { readonly t: Dictionary["guestEntry"]; readonly initialCode: string; readonly invitationToken?: string }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const supported = ready && navigator.locks !== undefined;
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<GuestAdmissionError>();
  const [pending, transition] = useTransition();
  const alert = useRef<HTMLParagraphElement>(null);
  function isGuestError(value: string): value is GuestAdmissionError { return Object.hasOwn(t.errors, value); }
  useEffect(() => { if (error !== undefined) alert.current?.focus(); }, [error]);

  function enter(form: FormData) {
    if (!supported || pending) return;
    const parsed = guestStartSchema.safeParse({ nickname: form.get("nickname") });
    if (!parsed.success) { setError("INVALID_GUEST_NICKNAME"); return; }
    const code = form.get("code");
    if (invitationToken === undefined && !parseRoomCode(typeof code === "string" ? code : "").ok) { setError("INVALID_CODE"); return; }
    setError(undefined);
    transition(async () => {
      try {
        const result = await withGuestCookieLock(async () => {
          // Read again inside the cross-tab lock: a previous tab may have created the cookie.
          const response = await fetch("/api/guest/session", { cache: "no-store" });
          if (response.status === 401 || response.status === 409) return { error: "UNAUTHORIZED" } as const;
          const status = statusSchema.safeParse(await response.json());
          if (!response.ok || !status.success) return { error: "UNAVAILABLE" } as const;
          if (status.data.status === "absent") {
            const started = await fetch("/api/guest/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
            if (!started.ok) return { error: started.status === 401 ? "UNAUTHORIZED" : "UNAVAILABLE" } as const;
          }
          if (invitationToken === undefined) return guestAdmissionAction(form);
          form.set("token", invitationToken);
          const joined = await joinInvitationAction(form);
          if ("code" in joined) return joined;
          return { error: joined.error === "INVITATION_UNAVAILABLE" ? "ROOM_NOT_FOUND" : joined.error } as const;
        });
        if ("error" in result) setError(typeof result.error === "string" && isGuestError(result.error) ? result.error : "UNAVAILABLE");
        else router.push(`/rooms/${result.code}`);
      } catch { setError("UNAVAILABLE"); }
    });
  }

  function reset() {
    if (!supported || pending) return;
    transition(async () => {
      try { const result = await withGuestCookieLock(resetGuestCookieAction); setError(result.error); }
      catch { setError("UNAVAILABLE"); }
    });
  }

  return <form className={`${card} flex flex-col gap-6`} onSubmit={(event) => { event.preventDefault(); enter(new FormData(event.currentTarget)); }}>
    {invitationToken === undefined && <div className="flex flex-col gap-2">
      <label htmlFor="guest-code" className={fieldLabel}>{t.code}</label>
      <input id="guest-code" name="code" defaultValue={initialCode} maxLength={32} required autoComplete="off" spellCheck={false}
        className={`${textField} h-14 font-mono uppercase`} aria-invalid={error === "INVALID_CODE"} aria-describedby={error === "INVALID_CODE" ? "guest-entry-error" : undefined} />
    </div>}
    <div className="flex flex-col gap-2">
      <label htmlFor="guest-nickname" className={fieldLabel}>{t.nickname}</label>
      <input id="guest-nickname" name="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={256} required autoComplete="off"
        className={`${textField} h-14`} aria-invalid={error === "INVALID_GUEST_NICKNAME" || error === "NICKNAME_TAKEN"} aria-describedby={`guest-nickname-hint${error === "INVALID_GUEST_NICKNAME" || error === "NICKNAME_TAKEN" ? " guest-entry-error" : ""}`} />
      <p id="guest-nickname-hint" className="text-sm text-brume">{t.nicknameHint}</p>
    </div>
    <div className="flex items-center gap-3"><GuestAvatar nickname={nickname} label={t.avatar} /><span className="text-sm text-brume">{t.avatar}</span></div>
    <fieldset className="flex flex-col gap-2"><legend className={fieldLabel}>{t.role}</legend>
      <label className="flex min-h-11 items-center gap-3"><input type="radio" name="role" value="participant" defaultChecked className="size-5" />{t.participant}</label>
      <label className="flex min-h-11 items-center gap-3"><input type="radio" name="role" value="spectator" className="size-5" />{t.spectator}</label>
    </fieldset>
    <p className="rounded-bouton border border-houle bg-abysse p-4 text-sm leading-relaxed text-embrun">{t.notice}</p>
    {error !== undefined && <p id="guest-entry-error" ref={alert} tabIndex={-1} role="alert" className="text-erreur">⚠ {t.errors[error]}</p>}
    {error === "UNAUTHORIZED" && <button type="button" onClick={reset} disabled={pending || !supported} className={discreetButton}>{t.reset}</button>}
    <button disabled={pending || !supported} className={primaryButton}>{pending ? t.pending : t.submit}</button>
    {!supported && <p role="status">{t.javascript}</p>}
  </form>;
}
