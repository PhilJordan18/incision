import { SubmitButton } from "@/components/submit-button";
import { signInWithProvider } from "./actions";

type ProviderButtonsProps = {
  readonly callbackUrl: string;
  readonly labels: { readonly github: string; readonly discord: string; readonly redirecting: string };
};

/** One form per provider, so each button shows its own pending state. */
export function ProviderButtons({ callbackUrl, labels }: ProviderButtonsProps) {
  return (
    <ul className="flex flex-col gap-3">
      {(["github", "discord"] as const).map((provider) => (
        <li key={provider}>
          <form action={signInWithProvider}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <SubmitButton name="provider" value={provider} label={labels[provider]} pendingLabel={labels.redirecting} variant="secondary" />
          </form>
        </li>
      ))}
    </ul>
  );
}
