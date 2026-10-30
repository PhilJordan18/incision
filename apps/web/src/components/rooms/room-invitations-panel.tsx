"use client";
import { useRef, useState, useTransition } from "react";
import type { Locale } from "@/i18n/locale";
import { invitationCopy } from "@/i18n/invitations";
import { createInvitationAction, listInvitationsAction, revokeInvitationAction } from "@/server/rooms/invitation-actions";
import { card, discreetButton, fieldLabel, secondaryButton, textField } from "../ui/styles";

type Listing = Extract<Awaited<ReturnType<typeof listInvitationsAction>>, { ok: true }>;
export function RoomInvitationsPanel({ code, locale, live }: { code: string; locale: Locale; live: boolean }) {
  const t = invitationCopy(locale);
  const [listing, setListing] = useState<Listing>();
  const [page, setPage] = useState(0);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [pending, transition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  function form() { const data = new FormData(); data.set("code", code); return data; }
  async function load(nextPage: number) {
    const data = form(); data.set("page", String(nextPage));
    const result = await listInvitationsAction(data);
    if ("error" in result) { setListing(undefined); setMessage(t.unavailable); }
    else { setListing(result); setPage(nextPage); }
  }
  function run(action: () => Promise<void>) {
    if (!live || pending) return;
    setMessage("");
    transition(async () => { try { await action(); } catch { setMessage(t.unavailable); } });
  }
  return <section className={`${card} flex flex-col gap-4`} aria-labelledby="invitations-heading">
    <h2 id="invitations-heading" className="font-display text-3xl font-extrabold uppercase">{t.title}</h2>
    <p className="text-sm text-brume">{t.intro}</p>
    <div className="flex flex-wrap gap-3">
      <button className={secondaryButton} disabled={pending || !live} onClick={() => run(async () => {
        const result = await createInvitationAction(form());
        if ("error" in result) { setMessage(result.error === "RATE_LIMITED" ? t.limited : t.unavailable); return; }
        setLink(new URL(result.path, window.location.origin).href);
        await load(0);
      })}>{t.generate}</button>
      <button className={discreetButton} disabled={pending || !live} onClick={() => run(() => load(page))}>{t.refresh}</button>
    </div>
    {link !== "" && <div className="flex flex-col gap-2">
      <label className={fieldLabel} htmlFor="fresh-invitation">{t.link}</label>
      <input id="fresh-invitation" ref={input} readOnly value={link} className={textField} onFocus={(event) => event.currentTarget.select()} aria-describedby="invitation-once" />
      <p id="invitation-once" className="text-sm text-brume">{t.once}</p>
      <button className={`${discreetButton} self-start`} onClick={async () => {
        try { await navigator.clipboard.writeText(link); setMessage(t.copied); }
        catch { input.current?.focus(); input.current?.select(); setMessage(t.copyFailed); }
      }}>{t.copy}</button>
    </div>}
    <p role="status">{pending ? t.pending : message}</p>
    {listing && <>
      {listing.items.length === 0 && <p>{t.empty}</p>}
      <ul className="divide-y divide-houle">{listing.items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0 break-words"><time className="text-sm text-brume" dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString(locale)}</time>
          <p>{item.revokedAt ? t.revoked : item.boundAt ? `${t.used} ${item.displayName ?? "—"}` : t.unused}</p></div>
        {!item.revokedAt && <button className={discreetButton} disabled={pending || !live} onClick={() => run(async () => {
          const data = form(); data.set("invitationId", item.id);
          const result = await revokeInvitationAction(data);
          if ("error" in result) { setMessage(t.unavailable); return; }
          await load(page);
        })}>{t.revoke}</button>}
      </li>)}</ul>
      <div className="flex flex-wrap gap-3">
        <button className={discreetButton} disabled={pending || !live || page === 0} onClick={() => run(() => load(page - 1))}>{t.previous}</button>
        <button className={discreetButton} disabled={pending || !live || !listing.hasMore} onClick={() => run(() => load(page + 1))}>{t.next}</button>
      </div>
    </>}
  </section>;
}
