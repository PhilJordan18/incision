/**
 * Class names of the design's components (apps/design/README.md §3), from the tokens of
 * apps/design/tokens.css only. Focus rings come from the global `:focus-visible` rule.
 */
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2.5 rounded-bouton px-6 text-[15px] transition-colors duration-200 ease-incision disabled:cursor-not-allowed disabled:border-transparent disabled:bg-sillage disabled:text-voile";

/** One primary (red) action per screen. */
export const primaryButton = `${BUTTON_BASE} h-14 bg-action font-semibold text-white hover:bg-ligne`;
export const secondaryButton = `${BUTTON_BASE} h-[52px] border border-ecume font-semibold text-ecume hover:bg-ecume/10`;
export const discreetButton = `${BUTTON_BASE} h-[52px] border border-houle font-medium text-embrun hover:text-ecume`;
/** Provider buttons of the sign-in screen: surface, thin border. */
export const surfaceButton = `${BUTTON_BASE} h-[52px] border border-houle bg-nuit font-semibold text-ecume hover:border-brume`;
/** Round header controls (44 px), used on the site header. */
export const pillControl =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-houle px-3.5 text-embrun transition-colors duration-200 ease-incision hover:text-ecume";

/** Text field without a width; `textField` fills its container. */
export const textFieldBase =
  "h-[52px] rounded-bouton border border-houle bg-nuit px-4 text-base text-ecume placeholder:text-voile focus-visible:border-moi aria-invalid:border-2 aria-invalid:border-erreur";

export const textField = `${textFieldBase} w-full`;

export const fieldLabel = "text-sm font-medium text-ecume";
export const monoLabel = "font-mono text-[11px] font-medium tracking-[0.2em] text-brume uppercase";
export const inlineLink = "text-moi underline underline-offset-4 hover:text-ecume";
export const card = "rounded-carte border border-houle bg-nuit p-6";
