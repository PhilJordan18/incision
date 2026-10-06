import { DiscordIcon, GitHubIcon } from "@/components/icons/icons";
import { surfaceButton } from "@/components/ui/styles";
import { SubmitButton } from "@/components/submit-button";
import { signInWithProvider } from "./actions";

type ProviderButtonsProps = {
  readonly callbackUrl: string;
  readonly labels: {
    readonly github: string;
    readonly discord: string;
    readonly githubAria: string;
    readonly discordAria: string;
    readonly group: string;
    readonly redirecting: string;
  };
};

const PROVIDERS = [
  { id: "github", Icon: GitHubIcon },
  { id: "discord", Icon: DiscordIcon },
] as const;

/** One form per provider, so each button shows its own pending state. */
export function ProviderButtons({ callbackUrl, labels }: ProviderButtonsProps) {
  return (
    <ul aria-label={labels.group} className="grid grid-cols-2 gap-2.5">
      {PROVIDERS.map(({ id, Icon }) => (
        <li key={id}>
          <form action={signInWithProvider}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <SubmitButton
              name="provider"
              value={id}
              ariaLabel={id === "github" ? labels.githubAria : labels.discordAria}
              label={
                <>
                  <Icon />
                  {id === "github" ? labels.github : labels.discord}
                </>
              }
              pendingLabel={labels.redirecting}
              className={`${surfaceButton} w-full`}
            />
          </form>
        </li>
      ))}
    </ul>
  );
}
