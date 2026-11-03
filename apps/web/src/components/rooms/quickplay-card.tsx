"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { inlineLink, monoLabel, primaryButton, secondaryButton } from "@/components/ui/styles";
import type { publicRoomsCopy } from "@/i18n/public-rooms";
import { createRoomAction, type CreateRoomState } from "@/server/rooms/actions";
import { quickplayAction, type QuickplayState } from "@/server/rooms/quickplay-actions";

type Copy = ReturnType<typeof publicRoomsCopy>["quickplay"];

/**
 * Screen 04's matchmaking card (JOIN-03): the screen's one red action. Without a room with a
 * place it offers an account a PUBLIC room with the default settings (D-19); nothing is created
 * until the account asks for it (D-05). Both forms work without JavaScript.
 */
export function QuickplayCard({ t }: { readonly t: Copy }) {
  const [state, find] = useActionState<QuickplayState, FormData>(quickplayAction, {});
  const [created, create] = useActionState<CreateRoomState, FormData>(createRoomAction, {});
  const message = useRef<HTMLDivElement>(null);
  // After an answer without a room, move the keyboard to it: the button that was pressed stays put.
  useEffect(() => { if (state.error !== undefined) message.current?.focus(); }, [state]);
  const currentCode = state.currentCode ?? created.currentCode;

  return (
    <section aria-labelledby="quickplay-title"
      className="flex flex-col gap-3.5 rounded-carte border border-ligne bg-nuit bg-[radial-gradient(ellipse_70%_80%_at_20%_0%,color-mix(in_srgb,var(--color-ligne)_16%,transparent),transparent_70%)] p-6">
      <span className={`${monoLabel} text-ligne`}>[.{t.tag}]</span>
      <h2 id="quickplay-title" className="text-xl font-bold text-ecume">{t.title}</h2>
      <p className="text-sm leading-relaxed text-brume">{t.body}</p>
      <form action={find} className="mt-auto flex flex-col">
        <SubmitButton label={t.submit} pendingLabel={t.pending} className={`${primaryButton} w-full`} />
      </form>
      {state.error !== undefined && (
        <div ref={message} tabIndex={-1} className="flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-moi">
          {state.error === "NO_ROOM" ? <>
            <p role="status" className="text-ecume">{t.noRoom}</p>
            <form action={create} className="flex flex-col gap-2">
              <input type="hidden" name="visibility" value="public" />
              <SubmitButton label={t.createPublic} pendingLabel={t.creating} className={`${secondaryButton} w-full`} describedBy="quickplay-create-note" />
              <p id="quickplay-create-note" className="text-sm text-brume">{t.createNote}</p>
            </form>
            {created.error !== undefined && <div role="alert">
              <FieldError id="quickplay-create-error" message={created.error === "ALREADY_IN_ROOM" ? t.errors.ALREADY_IN_ANOTHER_ROOM : t.errors.CREATE_FAILED} />
            </div>}
          </> : <div role="alert"><FieldError id="quickplay-error" message={t.errors[state.error]} /></div>}
          {currentCode !== undefined && (
            <Link href={`/rooms/${currentCode}`} className={`${inlineLink} inline-flex min-h-11 items-center self-start text-sm`}>{t.goToRoom(currentCode)}</Link>
          )}
        </div>
      )}
    </section>
  );
}
