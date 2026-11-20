/** Context is supplied by the view, never inferred from a global key listener.
 * This UX guard is not authorization: the server checks the controlling tab again.
 */
export type BonusKeyContext = {
  readonly typingFieldFocused: boolean;
  readonly dialogOpen: boolean;
  readonly controlling: boolean;
  readonly racing: boolean;
  readonly enabled: boolean;
};

export function isBonusKeyIntent(input: {
  readonly key: string;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  /** Some IMEs report the composition key as 229 even when isComposing is false. */
  readonly keyCode?: number;
  readonly modified?: boolean;
  readonly context: BonusKeyContext;
}): boolean {
  const { context } = input;
  return input.key === "Enter" && !input.repeat && !input.isComposing && input.keyCode !== 229 &&
    !input.modified && context.typingFieldFocused && !context.dialogOpen && context.controlling &&
    context.racing && context.enabled;
}
