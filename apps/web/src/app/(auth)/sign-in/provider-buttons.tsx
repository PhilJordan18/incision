import { DiscordIcon, GitHubIcon } from "@/components/icons/icons";
import { surfaceButton } from "@/components/ui/styles";
import { SubmitButton } from "@/components/submit-button";
import type { Dictionary } from "@/i18n/dictionaries";
import { signInWithProvider } from "./actions";

type ProviderButtonsProps = { readonly callbackUrl: string; readonly t: Dictionary["signIn"] };

const PROVIDERS = [
  { id: "github", Icon: GitHubIcon, label: "continueWithGitHub", aria: "gitHubAriaLabel" },
  { id: "discord", Icon: DiscordIcon, label: "continueWithDiscord", aria: "discordAriaLabel" },
] as const;

/** One form per provider, so each button shows its own pending state. */
export function ProviderButtons({ callbackUrl, t }: ProviderButtonsProps) {
  return (
    <ul aria-label={t.providersLabel} className="grid grid-cols-2 gap-2.5">
      {PROVIDERS.map(({ id, Icon, label, aria }) => {
        return (
          <li key={id}>
            <form action={signInWithProvider}>
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <SubmitButton
                name="provider"
                value={id}
                ariaLabel={t[aria]}
                label={
                  <>
                    <Icon />
                    {t[label]}
                  </>
                }
                pendingLabel={t.redirecting}
                className={`${surfaceButton} w-full`}
              />
            </form>
          </li>
        );
      })}
    </ul>
  );
}
