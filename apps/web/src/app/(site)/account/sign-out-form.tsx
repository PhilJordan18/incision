"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { secondaryButton } from "@/components/ui/styles";
import { signOutEverywhereAction, type SignOutState } from "./actions";

type SignOutFormProps = {
  readonly labels: { readonly signOut: string; readonly signingOut: string; readonly signOutFailed: string };
};

export function SignOutForm({ labels }: SignOutFormProps) {
  const [state, formAction] = useActionState<SignOutState>(signOutEverywhereAction, { failed: false });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.failed && (
        <p role="alert" className="flex gap-2 text-erreur">
          <span aria-hidden="true">⚠</span>
          {labels.signOutFailed}
        </p>
      )}
      <SubmitButton label={labels.signOut} pendingLabel={labels.signingOut} className={`${secondaryButton} self-start`} />
    </form>
  );
}
