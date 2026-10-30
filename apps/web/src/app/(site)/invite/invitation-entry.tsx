"use client";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locale";
import { invitationCopy } from "@/i18n/invitations";
import { PageHeading } from "@/components/ui/page-heading";
import { card, discreetButton, fieldLabel, primaryButton } from "@/components/ui/styles";
import { joinInvitationAction } from "@/server/rooms/invitation-actions";
import { GuestEntryForm } from "../guest/guest-entry-form";

function subscribe(callback: () => void) { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); }
function readToken() { const token = window.location.hash.slice(1); return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : ""; }
export function InvitationEntry({ locale, guestCopy, account, guestsEnabled }: {
  locale: Locale; guestCopy: Dictionary["guestEntry"]; account: boolean; guestsEnabled: boolean;
}) {
  const token = useSyncExternalStore(subscribe, readToken, () => "");
  const t = invitationCopy(locale);
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, transition] = useTransition();
  const alert = useRef<HTMLParagraphElement>(null);
  return <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 py-8">
    <PageHeading bold={t.join} />
    <p className="text-brume">{t.intro}</p>
    <noscript><p>{t.javascript}</p></noscript>
    {token === "" ? <p role="status">{t.missing}</p> : account ? <form className={`${card} flex flex-col gap-4`} onSubmit={(event) => {
      event.preventDefault(); if (pending) return;
      const data = new FormData(event.currentTarget); data.set("token", token); setError("");
      transition(async () => {
        try {
          const result = await joinInvitationAction(data);
          if ("code" in result) { router.push(`/rooms/${result.code}`); return; }
          setError(result.error === "INVITATION_UNAVAILABLE" ? t.invalid : result.error === "RATE_LIMITED" ? t.limited : t.unavailable);
        } catch { setError(t.unavailable); }
        requestAnimationFrame(() => alert.current?.focus());
      });
    }}>
      <fieldset><legend className={fieldLabel}>{guestCopy.role}</legend>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="role" value="participant" defaultChecked className="size-5" />{guestCopy.participant}</label>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="role" value="spectator" className="size-5" />{guestCopy.spectator}</label>
      </fieldset>
      {error && <p ref={alert} tabIndex={-1} role="alert" className="text-erreur">⚠ {error}</p>}
      <button className={primaryButton} disabled={pending}>{pending ? t.pending : t.account}</button>
    </form> : <>
      {guestsEnabled && <GuestEntryForm t={guestCopy} initialCode="" invitationToken={token} />}
      <Link href="/sign-in?callbackUrl=%2Finvite" className={`${discreetButton} self-start`} prefetch={false}>{t.signIn}</Link>
      <p className="text-sm text-brume">{t.reopen}</p>
    </>}
  </div>;
}
